import { readFile } from 'node:fs/promises'
import { decimate, emptyResult, summarize, type MeshParser, type ParseOptions, type ParseResult } from './types'

const MAX_RAW_TRIANGLES = 4_000_000

function buildMesh(positions: Float32Array, triangleCount: number, name: string) {
  const indices = new Uint32Array(triangleCount * 3)
  for (let i = 0; i < triangleCount * 3; i++) indices[i] = i
  const normals = new Float32Array(triangleCount * 9)
  for (let t = 0; t < triangleCount; t++) {
    const o = t * 9
    const ax = positions[o], ay = positions[o + 1], az = positions[o + 2]
    const bx = positions[o + 3], by = positions[o + 4], bz = positions[o + 5]
    const cx = positions[o + 6], cy = positions[o + 7], cz = positions[o + 8]
    const ux = bx - ax, uy = by - ay, uz = bz - az
    const vx = cx - ax, vy = cy - ay, vz = cz - az
    let nx = uy * vz - uz * vy
    let ny = uz * vx - ux * vz
    let nz = ux * vy - uy * vx
    const len = Math.hypot(nx, ny, nz) || 1
    nx /= len; ny /= len; nz /= len
    for (let k = 0; k < 3; k++) {
      normals[o + k * 3] = nx
      normals[o + k * 3 + 1] = ny
      normals[o + k * 3 + 2] = nz
    }
  }
  return { name, positions, normals, indices }
}

function isBinary(buf: Buffer): boolean {
  if (buf.length < 84) return false
  const declared = buf.readUInt32LE(80)
  if (declared > 0 && 84 + declared * 50 === buf.length) return true
  const head = buf.subarray(0, 5).toString('ascii').toLowerCase()
  if (head !== 'solid') return true
  const probe = buf.subarray(0, Math.min(buf.length, 4096)).toString('ascii').toLowerCase()
  if (probe.includes('facet')) return false
  return declared > 0 && 84 + declared * 50 <= buf.length + 256
}

function parseBinary(buf: Buffer, warnings: string[]): ParseResult {
  const declared = buf.readUInt32LE(80)
  const available = Math.floor((buf.length - 84) / 50)
  const count = Math.min(declared, available, MAX_RAW_TRIANGLES)
  if (count <= 0) return emptyResult('STL 中没有三角面')

  if (declared > MAX_RAW_TRIANGLES) {
    warnings.push(`模型有 ${declared} 个三角面，本次只载入前 ${MAX_RAW_TRIANGLES} 个`)
  }
  if (declared > available) {
    warnings.push('文件头声明的三角面数量比实际数据多，可能文件被截断')
  }

  const positions = new Float32Array(count * 9)
  let p = 84
  for (let t = 0; t < count; t++) {
    p += 12 // 跳过文件内法线，稍后重算
    for (let k = 0; k < 3; k++) {
      positions[t * 9 + k * 3] = buf.readFloatLE(p)
      positions[t * 9 + k * 3 + 1] = buf.readFloatLE(p + 4)
      positions[t * 9 + k * 3 + 2] = buf.readFloatLE(p + 8)
      p += 12
    }
    p += 2 // attribute byte count
  }

  const mesh = buildMesh(positions, count, 'STL')
  return summarize([mesh], warnings, 'unknown')
}

function parseAscii(text: string, warnings: string[]): ParseResult {
  const positions: number[] = []
  let cursor = 0
  let vertexCount = 0
  const lineCount = text.length
  let i = 0
  while (i < lineCount) {
    let end = text.indexOf('\n', i)
    if (end === -1) end = lineCount
    const line = text.slice(i, end)
    i = end + 1
    if (line.length < 6) continue
    const trimmed = line.trimStart()
    if (!trimmed.startsWith('vertex') && !trimmed.startsWith('VERTEX')) continue
    const parts = trimmed.split(/\s+/)
    if (parts.length < 4) continue
    const x = Number(parts[1])
    const y = Number(parts[2])
    const z = Number(parts[3])
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue
    positions.push(x, y, z)
    vertexCount++
    cursor = positions.length
    if (vertexCount % 3 === 0) {
      if (vertexCount / 3 >= MAX_RAW_TRIANGLES) {
        warnings.push(`ASCII STL 三角面过多，只载入前 ${MAX_RAW_TRIANGLES} 个`)
        break
      }
    }
  }
  if (positions.length < 9) return emptyResult('ASCII STL 中没有找到 vertex 数据')

  const triangleCount = Math.floor(positions.length / 9)
  const arr = new Float32Array(triangleCount * 9)
  for (let k = 0; k < triangleCount * 9; k++) arr[k] = positions[k]
  const mesh = buildMesh(arr, triangleCount, 'STL')
  void cursor
  return summarize([mesh], warnings, 'unknown')
}

export const stlParser: MeshParser = {
  extensions: ['stl'],
  label: 'STL',
  async parse(path: string, opts?: ParseOptions): Promise<ParseResult> {
    const buf = await readFile(path)
    if (buf.length === 0) return emptyResult('文件为空')
    const warnings: string[] = []
    let result = isBinary(buf) ? parseBinary(buf, warnings) : parseAscii(buf.toString('utf8'), warnings)
    if (opts?.maxTriangles && result.triangles > opts.maxTriangles) {
      const meshes = decimate(result.meshes, opts.maxTriangles)
      result = summarize(meshes, result.warnings, result.unitHint)
      result.warnings.push('预览已降采样')
    }
    return result
  }
}
