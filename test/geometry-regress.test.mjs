// 针对本轮修复项的回归测试：降采样几何完整性、畸形 XML 不再卡死。
import test from 'node:test'
import assert from 'node:assert/strict'
import { decimate } from '../test/.build/types.mjs'
import { parseXml } from '../test/.build/xml.mjs'

function makeMesh(triangles) {
  const positions = new Float32Array(triangles * 9)
  const normals = new Float32Array(triangles * 9)
  const indices = new Uint32Array(triangles * 3)
  for (let t = 0; t < triangles; t++) {
    for (let k = 0; k < 3; k++) {
      const off = (t * 3 + k) * 3
      // 每个三角形铺开在 x 方向，跨度用来验证包围盒不被压缩
      positions[off] = t * 1.0
      positions[off + 1] = k
      positions[off + 2] = 0
      normals[off + 2] = 1
      indices[t * 3 + k] = t * 3 + k
    }
  }
  return { name: 'm', positions, normals, indices }
}

test('decimate：每个保留三角形都由独立且正确的三个顶点组成', () => {
  const mesh = makeMesh(1000)
  const out = decimate([mesh], 200)
  assert.equal(out.length, 1)
  const result = out[0]
  const triCount = result.indices.length / 3
  assert.ok(triCount <= 202 && triCount >= 190, `三角面数应在 200 附近，实际 ${triCount}`)
  assert.equal(result.positions.length, triCount * 9)

  // 关键回归点：旧实现把偏移写成 dst*3+k*3，从第二个三角形起顶点互相覆盖。
  // 正确实现下，每个三角形的三个顶点索引连续且指向属于它自己的坐标。
  for (let t = 0; t < triCount; t++) {
    for (let k = 0; k < 3; k++) {
      assert.equal(result.indices[t * 3 + k], t * 3 + k)
      const y = result.positions[(t * 3 + k) * 3 + 1]
      assert.equal(y, k, `三角形 ${t} 的第 ${k} 个顶点 y 坐标被写错：${y}`)
    }
  }
})

test('decimate：降采样后包围盒仍在原始范围内且不塌缩', () => {
  const mesh = makeMesh(1000)
  const out = decimate([mesh], 200)
  let minX = Infinity
  let maxX = -Infinity
  const p = out[0].positions
  for (let i = 0; i < p.length; i += 3) {
    if (p[i] < minX) minX = p[i]
    if (p[i] > maxX) maxX = p[i]
  }
  assert.ok(minX >= 0, `minX 不应越界：${minX}`)
  assert.ok(maxX <= 999, `maxX 不应超过原始范围：${maxX}`)
  // 强制保留最后一幅面，包围盒上界应贴近原始末端
  assert.ok(maxX >= 990, `包围盒被压塌了，maxX=${maxX}`)
})

test('decimate：未超过上限时原样返回，不做无谓重排', () => {
  const mesh = makeMesh(50)
  const out = decimate([mesh], 200)
  assert.equal(out[0], mesh)
})

test('parseXml：畸形属性不会陷入死循环', () => {
  const samples = [
    '<a /x>',
    '<a / >',
    '<a = = />',
    '<a b="1" /x c="2">t</a>',
    '<a b="1" /c',
    '<a ///>',
    '<a ',
    '<a b="',
    '<a>&</a>'
  ]
  for (const s of samples) {
    const started = Date.now()
    // 只要能返回就说明循环推进了；超时会让整个测试进程被 kill
    const root = parseXml(s)
    const elapsed = Date.now() - started
    assert.ok(elapsed < 200, `解析 ${JSON.stringify(s)} 耗时 ${elapsed}ms，疑似死循环`)
    assert.ok(root === null || typeof root.name === 'string')
  }
})

test('parseXml：正常结构仍能正确取到元素与属性', () => {
  const root = parseXml('<model unit="inch"><resources><object id="1"/></resources></model>')
  assert.ok(root)
  assert.equal(root.name, 'model')
  assert.equal(root.attrs.unit, 'inch')
  assert.equal(root.children[0].name, 'resources')
  assert.equal(root.children[0].children[0].attrs.id, '1')
})
