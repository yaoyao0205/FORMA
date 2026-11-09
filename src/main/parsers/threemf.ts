import { readFile } from 'node:fs/promises'
import { unzipSync } from 'fflate'
import { decimate, emptyResult, summarize, type MeshParser, type ParseOptions, type ParseResult, type UnitHint } from './types'
import { allChildren, firstChild, parseXml, type XmlNode } from './xml'

const MAX_TRIANGLES = 4_000_000
const MAX_FILE_BYTES = 320 * 1024 * 1024

type Vec3 = [number, number, number]

interface RawMesh {
  vertices: number[] // x,y,z
  triangles: number[] // 三个一组
}

interface ComponentRef {
  objectId: string
  transform: Matrix
  path?: string
}

interface ObjectDef {
  id: string
  name?: string
  mesh: RawMesh | null
  components: ComponentRef[]
}

/** 3MF 的行主序 4x3 矩阵（最后三个是平移） */
type Matrix = number[]

const IDENTITY: Matrix = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]

function parseMatrix(s: string | undefined): Matrix {
  if (!s) return IDENTITY
  const parts = s.trim().split(/\s+/)
  if (parts.length !== 12) return IDENTITY
  const m = parts.map(Number)
  if (m.some((v) => !Number.isFinite(v))) return IDENTITY
  return m
}

/**
 * 复合变换，行主序 4x3 约定：M = [A | t]，点按列向量变换 p' = A*p + t。
 * 于是 M1 * M2 = [A1*A2 | A1*t2 + t1]。
 * 平移项必须用 A1 去乘 t2，再叠 t1 —— 早期实现写成了 A2ᵀ*t1 + t2，
 * 父级带旋转、子件带平移时方向就会整个偏掉。
 */
function multiply(a: Matrix, b: Matrix): Matrix {
  const out: Matrix = new Array(12).fill(0)
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out[r * 3 + c] =
        a[r * 3 + 0] * b[0 * 3 + c] +
        a[r * 3 + 1] * b[1 * 3 + c] +
        a[r * 3 + 2] * b[2 * 3 + c]
    }
    out[9 + r] =
      a[r * 3 + 0] * b[9] +
      a[r * 3 + 1] * b[10] +
      a[r * 3 + 2] * b[11] +
      a[9 + r]
  }
  return out
}

/**
 * 顶点变换。矩阵是行主序，所以第 r 行是 m[r*3+0..2]，平移是 m[9..11]。
 * 单位换算放在最后统一做：包括平移量一起乘 scale，
 * 否则英寸/厘米文件里带位移的部件会被留在文件单位上，位置全错。
 */
function applyMatrix(m: Matrix, p: Vec3, scale: number): Vec3 {
  return [
    (m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[9]) * scale,
    (m[3] * p[0] + m[4] * p[1] + m[5] * p[2] + m[10]) * scale,
    (m[6] * p[0] + m[7] * p[1] + m[8] * p[2] + m[11]) * scale
  ]
}

/**
 * 几何坐标一律换算成毫米入库，所以 hint 统一给 mm；
 * 文件真实声明的单位通过 label 反馈给界面提示，避免"数值是 25.4、单位却写 inch"这种错配。
 */
function unitScale(unit: string | undefined): { scale: number; hint: UnitHint; label: string } {
  switch ((unit ?? 'millimeter').toLowerCase()) {
    case 'micron':
      return { scale: 0.001, hint: 'mm', label: '微米' }
    case 'centimeter':
      return { scale: 10, hint: 'mm', label: '厘米' }
    case 'inch':
      return { scale: 25.4, hint: 'mm', label: '英寸' }
    case 'foot':
      return { scale: 304.8, hint: 'mm', label: '英尺' }
    case 'meter':
      return { scale: 1000, hint: 'mm', label: '米' }
    default:
      return { scale: 1, hint: 'mm', label: '毫米' }
  }
}

function readMesh(meshNode: XmlNode): RawMesh | null {
  const vertsNode = firstChild(meshNode, 'vertices')
  const trisNode = firstChild(meshNode, 'triangles')
  if (!vertsNode || !trisNode) return null
  const vertices: number[] = []
  for (const v of allChildren(vertsNode, 'vertex')) {
    const x = Number(v.attrs.x)
    const y = Number(v.attrs.y)
    const z = Number(v.attrs.z)
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) vertices.push(x, y, z)
  }
  const count = vertices.length / 3
  const triangles: number[] = []
  for (const t of allChildren(trisNode, 'triangle')) {
    const a = Number(t.attrs.v1)
    const b = Number(t.attrs.v2)
    const c = Number(t.attrs.v3)
    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) continue
    if (a < 0 || b < 0 || c < 0 || a >= count || b >= count || c >= count) continue
    triangles.push(a, b, c)
  }
  if (vertices.length === 0 || triangles.length === 0) return null
  return { vertices, triangles }
}

function collectObjects(root: XmlNode, objects: Map<string, ObjectDef>): void {
  const resources = firstChild(root, 'resources')
  if (!resources) return
  for (const objNode of allChildren(resources, 'object')) {
    const id = objNode.attrs.id
    if (!id) continue
    const def: ObjectDef = {
      id,
      name: objNode.attrs.name ?? objNode.attrs.type ?? undefined,
      mesh: null,
      components: []
    }
    const meshNode = firstChild(objNode, 'mesh')
    if (meshNode) def.mesh = readMesh(meshNode)
    const compsNode = firstChild(objNode, 'components')
    if (compsNode) {
      for (const c of allChildren(compsNode, 'component')) {
        const objectId = c.attrs.objectid
        if (!objectId) continue
        def.components.push({
          objectId,
          transform: parseMatrix(c.attrs.transform),
          path: c.attrs.path
        })
      }
    }
    objects.set(id, def)
  }
}

interface Accum {
  name: string
  positions: number[]
  normals: number[]
  indices: number[]
  triCount: number
  overflow: boolean
}

function pushMesh(acc: Accum, mesh: RawMesh, matrix: Matrix, scale: number): void {
  const base = acc.positions.length / 3
  const vertCount = mesh.vertices.length / 3
  for (let i = 0; i < vertCount; i++) {
    const p = applyMatrix(matrix, [mesh.vertices[i * 3], mesh.vertices[i * 3 + 1], mesh.vertices[i * 3 + 2]], scale)
    acc.positions.push(p[0], p[1], p[2])
  }
  const triCount = mesh.triangles.length / 3
  for (let t = 0; t < triCount; t++) {
    if (acc.triCount >= MAX_TRIANGLES) {
      acc.overflow = true
      break
    }
    const a = mesh.triangles[t * 3] + base
    const b = mesh.triangles[t * 3 + 1] + base
    const c = mesh.triangles[t * 3 + 2] + base
    acc.indices.push(a, b, c)
    // 面法线
    const ax = acc.positions[a * 3], ay = acc.positions[a * 3 + 1], az = acc.positions[a * 3 + 2]
    const bx = acc.positions[b * 3], by = acc.positions[b * 3 + 1], bz = acc.positions[b * 3 + 2]
    const cx = acc.positions[c * 3], cy = acc.positions[c * 3 + 1], cz = acc.positions[c * 3 + 2]
    const ux = bx - ax, uy = by - ay, uz = bz - az
    const vx = cx - ax, vy = cy - ay, vz = cz - az
    let nx = uy * vz - uz * vy
    let ny = uz * vx - ux * vz
    let nz = ux * vy - uy * vx
    const l = Math.hypot(nx, ny, nz) || 1
    nx /= l; ny /= l; nz /= l
    acc.normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz)
    acc.triCount++
  }
}

export const threeMfParser: MeshParser = {
  extensions: ['3mf'],
  label: '3MF',
  async parse(path: string, opts?: ParseOptions): Promise<ParseResult> {
    const warnings: string[] = []
    const buf = await readFile(path)
    if (buf.length > MAX_FILE_BYTES) {
      return emptyResult(`3MF 文件超过 ${MAX_FILE_BYTES / 1024 / 1024} MB，暂不支持预览`)
    }

    let zip: Record<string, Uint8Array>
    try {
      zip = unzipSync(new Uint8Array(buf))
    } catch {
      return emptyResult('3MF 的 ZIP 容器无法解压，文件可能损坏')
    }

    const names = Object.keys(zip)
    const modelKey =
      names.find((n) => /3dmodel\.model$/i.test(n)) ??
      names.find((n) => /\.model$/i.test(n) && n.toLowerCase().includes('3d/')) ??
      names.find((n) => /\.model$/i.test(n))
    if (!modelKey) return emptyResult('3MF 中找不到 3dmodel.model')
    const modelBytes = zip[modelKey]
    if (!modelBytes) return emptyResult('3MF 的模型数据为空')

    const root = parseXml(new TextDecoder().decode(modelBytes))
    if (!root) return emptyResult('3MF 的 model XML 无法解析')

    const { scale, hint, label: declaredUnitLabel } = unitScale(root.attrs.unit)

    const metaTitle = allChildren(root, 'metadata').find((m) => m.attrs.name === 'Title')?.text.trim()

    const objects = new Map<string, ObjectDef>()
    collectObjects(root, objects)
    if (objects.size === 0) return emptyResult('3MF 中没有 object 资源')

    // 被引用的子模型
    const external = new Map<string, Map<string, ObjectDef>>()
    for (const def of objects.values()) {
      for (const c of def.components) {
        if (!c.path) continue
        const key = c.path.replace(/^\//, '')
        if (external.has(key)) continue
        const bytes = zip[key]
        if (!bytes) {
          warnings.push(`引用的子模型 ${key} 不存在`)
          continue
        }
        const subRoot = parseXml(new TextDecoder().decode(bytes))
        if (!subRoot) continue
        const subObjects = new Map<string, ObjectDef>()
        collectObjects(subRoot, subObjects)
        external.set(key, subObjects)
      }
    }

    const build = firstChild(root, 'build')
    const items = build ? allChildren(build, 'item') : []
    const accumulators: Accum[] = []

    const expand = (
      objectId: string,
      matrix: Matrix,
      depth: number,
      acc: Accum,
      scope: Map<string, ObjectDef>
    ): void => {
      if (depth > 12 || acc.overflow) return
      const def = scope.get(objectId)
      if (!def) return
      if (def.mesh) pushMesh(acc, def.mesh, matrix, scale)
      for (const c of def.components) {
        const combined = multiply(matrix, c.transform)
        let targetScope = scope
        if (c.path) {
          const key = c.path.replace(/^\//, '')
          targetScope = external.get(key) ?? new Map()
        }
        expand(c.objectId, combined, depth + 1, acc, targetScope)
      }
    }

    const topObjects = items.length > 0
      ? items.map((it, idx) => ({
          objectId: it.attrs.objectid ?? '',
          transform: parseMatrix(it.attrs.transform),
          name: `部件 ${idx + 1}`
        }))
      : Array.from(objects.values())
          .filter((o) => o.mesh)
          .map((o) => ({ objectId: o.id, transform: IDENTITY, name: o.name ?? `对象 ${o.id}` }))

    for (const top of topObjects) {
      if (!top.objectId) continue
      const acc: Accum = { name: top.name, positions: [], normals: [], indices: [], triCount: 0, overflow: false }
      expand(top.objectId, top.transform, 0, acc, objects)
      if (acc.triCount > 0) accumulators.push(acc)
    }

    if (accumulators.length === 0) return emptyResult('3MF 的 build 项没有可渲染的网格')

    const meshes = accumulators.map((acc) => ({
      name: acc.name,
      positions: new Float32Array(acc.positions),
      normals: new Float32Array(acc.normals),
      indices: new Uint32Array(acc.indices)
    }))

    if (accumulators.some((a) => a.overflow)) {
      warnings.push(`三角面超过 ${MAX_TRIANGLES}，已截断`)
    }
    if (names.some((n) => /\.(png|jpg|jpeg)$/i.test(n))) {
      warnings.push('3MF 内含纹理贴图，FORMA 当前只显示纯色材质')
    }
    if (names.some((n) => /\.(xml|model)$/i.test(n) && /model/i.test(n) && n !== modelKey)) {
      warnings.push('3MF 包含多个模型文件，已按 build 引用关系载入')
    }
    if (metaTitle) warnings.push(`标题：${metaTitle}`)
    if (scale !== 1) {
      warnings.push(`文件声明单位为${declaredUnitLabel}，几何已换算为毫米（1 ${declaredUnitLabel} = ${scale} mm）`)
    }

    let result = summarize(meshes, warnings, hint)
    if (opts?.maxTriangles && result.triangles > opts.maxTriangles) {
      result = summarize(decimate(result.meshes, opts.maxTriangles), result.warnings, result.unitHint)
      result.warnings.push('预览已降采样')
    }
    return result
  }
}
