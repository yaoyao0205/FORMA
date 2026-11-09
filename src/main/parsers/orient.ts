/**
 * 修正网格整体朝向：很多 STL/3MF/OBJ 的三角形绕序是反的（法线朝内），
 * 直接渲染会因背面剔除变成全黑。这里用「面法线 · (面重心 - 网格质心)」做多数投票，
 * 若绝大多数面朝内，则整体翻转绕序与法线。
 *
 * 对开放/平面模型不做翻转（投票比例不足），避免误伤。
 */
export function orientOutward(
  positions: Float32Array,
  indices: Uint32Array | null,
  normals?: Float32Array | null
): boolean {
  const vertexCount = positions.length / 3
  if (vertexCount < 4) return false

  let cx = 0
  let cy = 0
  let cz = 0
  for (let i = 0; i < positions.length; i += 3) {
    cx += positions[i]
    cy += positions[i + 1]
    cz += positions[i + 2]
  }
  cx /= vertexCount
  cy /= vertexCount
  cz /= vertexCount

  const triCount = indices ? indices.length / 3 : vertexCount / 3
  if (triCount < 4) return false

  let outward = 0
  let inward = 0

  const at = (t: number, k: number): number => (indices ? indices[t * 3 + k] : t * 3 + k)

  for (let t = 0; t < triCount; t++) {
    const a = at(t, 0)
    const b = at(t, 1)
    const c = at(t, 2)
    const ax = positions[a * 3]
    const ay = positions[a * 3 + 1]
    const az = positions[a * 3 + 2]
    const ux = positions[b * 3] - ax
    const uy = positions[b * 3 + 1] - ay
    const uz = positions[b * 3 + 2] - az
    const vx = positions[c * 3] - ax
    const vy = positions[c * 3 + 1] - ay
    const vz = positions[c * 3 + 2] - az
    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    const nz = ux * vy - uy * vx
    if (nx === 0 && ny === 0 && nz === 0) continue
    const mx = (ax + positions[b * 3] + positions[c * 3]) / 3 - cx
    const my = (ay + positions[b * 3 + 1] + positions[c * 3 + 1]) / 3 - cy
    const mz = (az + positions[b * 3 + 2] + positions[c * 3 + 2]) / 3 - cz
    if (nx * mx + ny * my + nz * mz >= 0) outward++
    else inward++
  }

  if (outward + inward < 4) return false
  if (inward <= outward * 3) return false

  if (indices) {
    for (let t = 0; t < indices.length; t += 3) {
      const tmp = indices[t + 1]
      indices[t + 1] = indices[t + 2]
      indices[t + 2] = tmp
    }
  } else {
    for (let v = 0; v < vertexCount; v += 3) {
      for (let k = 0; k < 3; k++) {
        const i1 = (v + 1) * 3 + k
        const i2 = (v + 2) * 3 + k
        const tmp = positions[i1]
        positions[i1] = positions[i2]
        positions[i2] = tmp
      }
    }
  }

  if (normals && normals.length === positions.length) {
    for (let i = 0; i < normals.length; i++) normals[i] = -normals[i]
  }

  return true
}
