import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { decimate, emptyResult, summarize, type MeshParser, type ParsedMesh, type ParseOptions, type ParseResult } from './types'

const MAX_TRIANGLES = 3_000_000
const MAX_VERTICES = 4_000_000

interface Group {
  name: string
  /** 每个三角形三个全局顶点索引 */
  tris: number[]
  /** 每个三角形三个全局法线索引，-1 表示缺失 */
  nrm: number[]
}

export const objParser: MeshParser = {
  extensions: ['obj'],
  label: 'OBJ',
  async parse(path: string, opts?: ParseOptions): Promise<ParseResult> {
    const warnings: string[] = []
    const verts: number[] = []
    const norms: number[] = []
    const groups: Group[] = [{ name: 'default', tris: [], nrm: [] }]
    let current = groups[0]
    let hasUV = false
    let hasMaterial = false
    let hasGroupDecl = false
    let tooMany = false

    const rl = createInterface({ input: createReadStream(path, 'utf8'), crlfDelay: Infinity })
    for await (const raw of rl) {
      const line = raw.trim()
      if (line.length === 0 || line.startsWith('#')) continue
      const sp = line.indexOf(' ')
      if (sp < 0) continue
      const tag = line.slice(0, sp)

      if (tag === 'v') {
        if (verts.length / 3 >= MAX_VERTICES) {
          tooMany = true
          break
        }
        const parts = line.split(/\s+/)
        verts.push(Number(parts[1]), Number(parts[2]), Number(parts[3]))
      } else if (tag === 'vn') {
        const parts = line.split(/\s+/)
        norms.push(Number(parts[1]), Number(parts[2]), Number(parts[3]))
      } else if (tag === 'vt') {
        hasUV = true
      } else if (tag === 'usemtl' || tag === 'mtllib') {
        hasMaterial = true
      } else if (tag === 'o' || tag === 'g') {
        const name = line.slice(sp + 1).trim() || 'object'
        if (current.tris.length > 0) {
          current = { name, tris: [], nrm: [] }
          groups.push(current)
          hasGroupDecl = true
        } else {
          current.name = name
        }
      } else if (tag === 'f') {
        const parts = line.split(/\s+/).slice(1)
        if (parts.length < 3) continue
        const vIdx: number[] = []
        const nIdx: number[] = []
        for (const token of parts) {
          const seg = token.split('/')
          let vi = Number(seg[0])
          if (!Number.isFinite(vi) || vi === 0) continue
          vi = vi > 0 ? vi - 1 : verts.length / 3 + vi
          if (vi < 0 || vi >= verts.length / 3) continue
          vIdx.push(vi)
          if (seg.length >= 3 && seg[2] !== '') {
            let ni = Number(seg[2])
            ni = ni > 0 ? ni - 1 : norms.length / 3 + ni
            nIdx.push(ni >= 0 && ni < norms.length / 3 ? ni : -1)
          } else {
            nIdx.push(-1)
          }
        }
        if (vIdx.length < 3) continue
        // 多边形按扇形三角化
        for (let k = 1; k + 1 < vIdx.length; k++) {
          if (current.tris.length / 3 >= MAX_TRIANGLES) {
            tooMany = true
            break
          }
          current.tris.push(vIdx[0], vIdx[k], vIdx[k + 1])
          current.nrm.push(nIdx[0], nIdx[k], nIdx[k + 1])
        }
        if (tooMany) break
      }
    }

    if (tooMany) warnings.push(`模型超过 ${MAX_TRIANGLES} 个三角面，已截断`)
    if (hasMaterial) warnings.push('OBJ 的材质库（.mtl）未载入，预览使用统一材质')
    if (hasUV) warnings.push('OBJ 的纹理坐标已忽略，预览不显示贴图')
    if (verts.length === 0) return emptyResult('OBJ 中没有顶点数据')
    if (groups.every((g) => g.tris.length === 0)) return emptyResult('OBJ 中没有面数据')

    const meshes: ParsedMesh[] = []
    for (const g of groups) {
      if (g.tris.length === 0) continue
      const localMap = new Map<number, number>()
      const positions: number[] = []
      const normals: number[] = []
      const indices: number[] = []
      const triCount = g.tris.length / 3

      for (let t = 0; t < triCount; t++) {
        const a = g.tris[t * 3]
        const b = g.tris[t * 3 + 1]
        const c = g.tris[t * 3 + 2]
        const na = g.nrm[t * 3]
        const nb = g.nrm[t * 3 + 1]
        const nc = g.nrm[t * 3 + 2]

        // 面法线兜底
        const ax = verts[a * 3], ay = verts[a * 3 + 1], az = verts[a * 3 + 2]
        const bx = verts[b * 3], by = verts[b * 3 + 1], bz = verts[b * 3 + 2]
        const cx = verts[c * 3], cy = verts[c * 3 + 1], cz = verts[c * 3 + 2]
        const ux = bx - ax, uy = by - ay, uz = bz - az
        const vx = cx - ax, vy = cy - ay, vz = cz - az
        let fx = uy * vz - uz * vy
        let fy = uz * vx - ux * vz
        let fz = ux * vy - uy * vx
        const fl = Math.hypot(fx, fy, fz) || 1
        fx /= fl; fy /= fl; fz /= fl

        const push = (gi: number, ni: number) => {
          let local = localMap.get(gi)
          if (local === undefined) {
            local = positions.length / 3
            localMap.set(gi, local)
            positions.push(verts[gi * 3], verts[gi * 3 + 1], verts[gi * 3 + 2])
            if (ni >= 0 && ni * 3 + 2 < norms.length) {
              normals.push(norms[ni * 3], norms[ni * 3 + 1], norms[ni * 3 + 2])
            } else {
              normals.push(fx, fy, fz)
            }
          }
          indices.push(local)
        }
        push(a, na)
        push(b, nb)
        push(c, nc)
      }

      meshes.push({
        name: g.name,
        positions: new Float32Array(positions),
        normals: new Float32Array(normals),
        indices: new Uint32Array(indices)
      })
    }

    if (hasGroupDecl && meshes.length > 1) {
      warnings.push(`文件包含 ${meshes.length} 个独立网格对象`)
    }

    let result = summarize(meshes, warnings, 'unknown')
    if (opts?.maxTriangles && result.triangles > opts.maxTriangles) {
      result = summarize(decimate(result.meshes, opts.maxTriangles), result.warnings, result.unitHint)
      result.warnings.push('预览已降采样')
    }
    return result
  }
}
