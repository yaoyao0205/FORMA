import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { orientOutward } from './.build/orient.mjs'
import { sha256File, sha256Text } from './.build/hash.mjs'

// 一个绕序朝内的立方体（每个面的法线都指向体心）
function inwardCube() {
  const v = [
    [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
    [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]
  ]
  const out = [
    [0, 2, 1], [0, 3, 2],
    [4, 5, 6], [4, 6, 7],
    [0, 1, 5], [0, 5, 4],
    [1, 2, 6], [1, 6, 5],
    [2, 3, 7], [2, 7, 6],
    [3, 0, 4], [3, 4, 7]
  ]
  const positions = new Float32Array(v.flat())
  const indices = new Uint32Array(out.flat())
  // 反向：把每个三角形顶点顺序倒过来，使法线朝向体心
  for (let t = 0; t < indices.length; t += 3) {
    const tmp = indices[t + 1]
    indices[t + 1] = indices[t + 2]
    indices[t + 2] = tmp
  }
  return { positions, indices }
}

function faceNormalSum(positions, indices) {
  let sum = 0
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3
    const ux = positions[b] - positions[a]
    const uy = positions[b + 1] - positions[a + 1]
    const uz = positions[b + 2] - positions[a + 2]
    const vx = positions[c] - positions[a]
    const vy = positions[c + 1] - positions[a + 1]
    const vz = positions[c + 2] - positions[a + 2]
    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    const nz = ux * vy - uy * vx
    const mx = (positions[a] + positions[b] + positions[c]) / 3
    const my = (positions[a + 1] + positions[b + 1] + positions[c + 1]) / 3
    const mz = (positions[a + 2] + positions[b + 2] + positions[c + 2]) / 3
    sum += nx * mx + ny * my + nz * mz
  }
  return sum
}

test('orientOutward：整体朝内的封闭网格会被翻转', () => {
  const { positions, indices } = inwardCube()
  assert.ok(faceNormalSum(positions, indices) < 0, '初始状态应为朝内')
  const flipped = orientOutward(positions, indices, new Float32Array(0))
  assert.equal(flipped, true)
  assert.ok(faceNormalSum(positions, indices) > 0, '翻转后应为朝外')
})

test('orientOutward：已经朝外的网格保持不动', () => {
  const { positions, indices } = inwardCube()
  orientOutward(positions, indices, new Float32Array(0))
  const flippedAgain = orientOutward(positions, indices, new Float32Array(0))
  assert.equal(flippedAgain, false)
  assert.ok(faceNormalSum(positions, indices) > 0)
})

test('sha256Text 与 node:crypto 结果一致', () => {
  const text = 'forma-local-3d-assets'
  const expected = createHash('sha256').update(text).digest('hex')
  assert.equal(sha256Text(text), expected)
})

test('sha256File 对真实文件流式计算', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'forma-hash-'))
  const file = path.join(dir, 'sample.bin')
  const payload = Buffer.from('0123456789'.repeat(1000))
  await writeFile(file, payload)
  const expected = createHash('sha256').update(payload).digest('hex')
  assert.equal(await sha256File(file), expected)
})
