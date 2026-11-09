import type { Unit } from '@shared/types'

/** 单个网格对象。坐标保持 3D 打印习惯的 Z-up，渲染时再旋转。 */
export interface ParsedMesh {
  name: string
  /** x,y,z 三元组，长度 = vertices * 3 */
  positions: Float32Array
  normals: Float32Array
  /** 索引，长度 = triangles * 3 */
  indices: Uint32Array
}

export type UnitHint = Unit | 'unknown'

export interface ParseResult {
  meshes: ParsedMesh[]
  /** bounds 使用打印语义：x=宽、y=深、z=高，单位与 unitHint 一致 */
  bounds: { min: [number, number, number]; max: [number, number, number] }
  vertices: number
  triangles: number
  meshCount: number
  warnings: string[]
  unitHint: UnitHint
  /** 几何自带的体积（仅在网格算得上封闭时给出，单位 mm³） */
  volumeMm3?: number | null
  closed?: boolean | null
}

export interface ParseOptions {
  /** 只保留不超过该数量的三角面（预览/缩略图用） */
  maxTriangles?: number
}

export interface MeshParser {
  extensions: string[]
  label: string
  parse(path: string, opts?: ParseOptions): Promise<ParseResult>
}

export const emptyResult = (warning: string): ParseResult => ({
  meshes: [],
  bounds: { min: [0, 0, 0], max: [0, 0, 0] },
  vertices: 0,
  triangles: 0,
  meshCount: 0,
  warnings: [warning],
  unitHint: 'unknown'
})

/** 从一个 mesh 集合计算总体包围盒（打印语义坐标） */
export function computeBounds(meshes: ParsedMesh[]): { min: [number, number, number]; max: [number, number, number] } {
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  for (const m of meshes) {
    const p = m.positions
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i]
      const y = p[i + 1]
      const z = p[i + 2]
      if (x < min[0]) min[0] = x
      if (y < min[1]) min[1] = y
      if (z < min[2]) min[2] = z
      if (x > max[0]) max[0] = x
      if (y > max[1]) max[1] = y
      if (z > max[2]) max[2] = z
    }
  }
  if (!Number.isFinite(min[0])) {
    return { min: [0, 0, 0], max: [0, 0, 0] }
  }
  return { min, max }
}

/**
 * 三角面降采样：按"面"为单位跳采样，保持粗略轮廓。
 * 返回新的 mesh 列表；warnings 由调用方补充。
 */
export function decimate(meshes: ParsedMesh[], maxTriangles: number): ParsedMesh[] {
  let total = 0
  for (const m of meshes) total += m.indices.length / 3
  if (total <= maxTriangles || maxTriangles <= 0) return meshes

  const step = Math.max(1, Math.floor(total / maxTriangles))
  const out: ParsedMesh[] = []
  for (const m of meshes) {
    const srcTri = Math.floor(m.indices.length / 3)
    if (srcTri === 0) continue
    // 先确定保留哪些面：等步长抽样，并强制保留最后一幅，
    // 否则抽掉的正好是外轮廓面时，包围盒会明显缩水。
    const kept: number[] = []
    for (let t = 0; t < srcTri; t += step) kept.push(t)
    if (kept[kept.length - 1] !== srcTri - 1) kept.push(srcTri - 1)

    const n = kept.length
    const positions = new Float32Array(n * 9)
    const normals = new Float32Array(n * 9)
    const indices = new Uint32Array(n * 3)
    const hasNormals = m.normals.length === m.positions.length

    for (let dst = 0; dst < n; dst++) {
      const t = kept[dst]
      for (let k = 0; k < 3; k++) {
        const vi = m.indices[t * 3 + k]
        const src = vi * 3
        // 目标偏移按「第 dst 个三角形、第 k 个顶点」算，即 (dst*3+k)*3。
        // 旧实现写成 dst*3 + k*3，从第二个三角形起就会覆盖前面已写入的顶点。
        const dstOff = (dst * 3 + k) * 3
        positions[dstOff] = m.positions[src]
        positions[dstOff + 1] = m.positions[src + 1]
        positions[dstOff + 2] = m.positions[src + 2]
        if (hasNormals) {
          normals[dstOff] = m.normals[src]
          normals[dstOff + 1] = m.normals[src + 1]
          normals[dstOff + 2] = m.normals[src + 2]
        }
        indices[dst * 3 + k] = dst * 3 + k
      }
    }

    out.push({ name: m.name, positions, normals, indices })
  }
  return out
}

export function summarize(meshes: ParsedMesh[], warnings: string[], unitHint: UnitHint, extra?: Partial<ParseResult>): ParseResult {
  const bounds = computeBounds(meshes)
  let vertices = 0
  let triangles = 0
  for (const m of meshes) {
    vertices += m.positions.length / 3
    triangles += m.indices.length / 3
  }
  return {
    meshes,
    bounds,
    vertices,
    triangles,
    meshCount: meshes.length,
    warnings,
    unitHint,
    ...extra
  }
}
