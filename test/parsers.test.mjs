import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { zipSync, strToU8 } from 'fflate'
import { parserFor } from './.build/parsers.mjs'

const dirPromise = mkdtemp(path.join(tmpdir(), 'forma-test-'))
const tmp = async (name, data) => {
  const dir = await dirPromise
  const file = path.join(dir, name)
  await writeFile(file, data)
  return file
}

function binaryStl(triangles) {
  const buffer = Buffer.alloc(84 + triangles.length * 50)
  buffer.write('forma binary stl', 0, 80, 'ascii')
  buffer.writeUInt32LE(triangles.length, 80)
  triangles.forEach((tri, index) => {
    const offset = 84 + index * 50
    buffer.writeFloatLE(0, offset)
    buffer.writeFloatLE(0, offset + 4)
    buffer.writeFloatLE(0, offset + 8)
    tri.forEach((vertex, vi) => {
      buffer.writeFloatLE(vertex[0], offset + 12 + vi * 12)
      buffer.writeFloatLE(vertex[1], offset + 16 + vi * 12)
      buffer.writeFloatLE(vertex[2], offset + 20 + vi * 12)
    })
  })
  return buffer
}

test('STL(binary)：解析面数、顶点数与包围盒', async () => {
  const file = await tmp('tri.stl', binaryStl([
    [[0, 0, 0], [10, 0, 0], [0, 10, 0]]
  ]))
  const result = await parserFor('stl').parse(file)
  assert.equal(result.triangles, 1)
  assert.equal(result.vertices, 3)
  assert.equal(result.meshCount, 1)
  assert.equal(result.bounds.max[0], 10)
  assert.equal(result.bounds.max[1], 10)
})

test('STL(ascii)：识别文本格式并保留两个面', async () => {
  const ascii = [
    'solid forma',
    'facet normal 0 0 1',
    '  outer loop',
    '    vertex 0 0 0',
    '    vertex 1 0 0',
    '    vertex 0 1 0',
    '  endloop',
    'endfacet',
    'facet normal 0 0 1',
    '  outer loop',
    '    vertex 0 0 0',
    '    vertex 0 1 0',
    '    vertex 1 1 1',
    '  endloop',
    'endfacet',
    'endsolid forma'
  ].join('\n')
  const file = await tmp('ascii.stl', ascii)
  const result = await parserFor('stl').parse(file)
  assert.equal(result.triangles, 2)
  assert.equal(result.bounds.max[2], 1)
})

test('OBJ：负索引、四边形扇形三角化与多对象计数', async () => {
  const obj = [
    'o plate',
    'v 0 0 0',
    'v 1 0 0',
    'v 1 1 0',
    'v 0 1 0',
    'f 1 2 3 4',
    'o spike',
    'v 0 0 1',
    'v 1 1 1',
    'v -1 1 1',
    'f -3 -2 -1'
  ].join('\n')
  const file = await tmp('multi.obj', obj)
  const result = await parserFor('obj').parse(file)
  // 四边形被扇形拆成 2 个三角形，第二个对象再来 1 个
  assert.equal(result.triangles, 3)
  assert.equal(result.meshCount, 2)
})

test('3MF：解析 ZIP 容器并应用 unit 换算', async () => {
  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="inch" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <object id="1" type="model">
      <mesh>
        <vertices>
          <vertex x="0" y="0" z="0"/>
          <vertex x="1" y="0" z="0"/>
          <vertex x="0" y="1" z="0"/>
        </vertices>
        <triangles>
          <triangle v1="0" v2="1" v3="2"/>
        </triangles>
      </mesh>
    </object>
  </resources>
  <build><item objectid="1"/></build>
</model>`
  const zipped = zipSync({ '3D/3dmodel.model': strToU8(model) })
  const file = await tmp('unit.3mf', Buffer.from(zipped))
  const result = await parserFor('3mf').parse(file)
  assert.equal(result.triangles, 1)
  // 几何已统一换算为毫米，所以单位报 mm（原始声明单位放在 warnings 里说明）
  assert.equal(result.unitHint, 'mm')
  assert.ok(
    result.warnings.some((w) => w.includes('英寸')),
    `应提示文件原始单位，实际 warnings=${JSON.stringify(result.warnings)}`
  )
  // 1 英寸在内部统一换算成 25.4 毫米
  assert.ok(Math.abs(result.bounds.max[0] - 25.4) < 0.001, `expected 25.4, got ${result.bounds.max[0]}`)
})

test('3MF：英寸文件的平移量也要按单位换算', async () => {
  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="inch" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <object id="1" type="model">
      <mesh>
        <vertices>
          <vertex x="0" y="0" z="0"/><vertex x="1" y="0" z="0"/><vertex x="0" y="1" z="0"/>
        </vertices>
        <triangles><triangle v1="0" v2="1" v3="2"/></triangles>
      </mesh>
    </object>
    <object id="2" type="model">
      <components>
        <component objectid="1" transform="1 0 0 0 1 0 0 0 1 1 0 0"/>
      </components>
    </object>
  </resources>
  <build><item objectid="2"/></build>
</model>`
  const zipped = zipSync({ '3D/3dmodel.model': strToU8(model) })
  const file = await tmp('unit-translate.3mf', Buffer.from(zipped))
  const result = await parserFor('3mf').parse(file)
  // 1 英寸的正方体 + 1 英寸位移 = 2 英寸 = 50.8 毫米
  assert.ok(
    Math.abs(result.bounds.max[0] - 50.8) < 0.001,
    `平移量未按单位换算，expected 50.8, got ${result.bounds.max[0]}`
  )
})

test('3MF：父级旋转与子件平移按 M_parent * M_component 复合', async () => {
  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <object id="1" type="model">
      <mesh>
        <vertices>
          <vertex x="0" y="0" z="0"/><vertex x="1" y="0" z="0"/><vertex x="0" y="1" z="0"/>
        </vertices>
        <triangles><triangle v1="0" v2="1" v3="2"/></triangles>
      </mesh>
    </object>
    <object id="2" type="model">
      <components>
        <component objectid="1" transform="1 0 0 0 1 0 0 0 1 10 0 0"/>
      </components>
    </object>
  </resources>
  <!-- 父级绕 Z 轴逆时针转 90°：子件的 +X 位移应变成 +Y 位移 -->
  <build><item objectid="2" transform="0 -1 0 1 0 0 0 0 1 0 0 0"/></build>
</model>`
  const zipped = zipSync({ '3D/3dmodel.model': strToU8(model) })
  const file = await tmp('nested-rotate.3mf', Buffer.from(zipped))
  const result = await parserFor('3mf').parse(file)
  // 子件局部范围 x∈[10,11] y∈[0,1]；旋转 90° 后 x∈[-1,0] y∈[10,11]
  assert.ok(Math.abs(result.bounds.max[1] - 11) < 0.001, `max.y expected 11, got ${result.bounds.max[1]}`)
  assert.ok(Math.abs(result.bounds.max[0]) < 0.001, `max.x expected 0, got ${result.bounds.max[0]}`)
  assert.ok(Math.abs(result.bounds.min[0] + 1) < 0.001, `min.x expected -1, got ${result.bounds.min[0]}`)
})

test('3MF：组件 transform 会作用到子对象', async () => {
  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <object id="1" type="model">
      <mesh>
        <vertices>
          <vertex x="0" y="0" z="0"/><vertex x="1" y="0" z="0"/><vertex x="0" y="1" z="0"/>
        </vertices>
        <triangles><triangle v1="0" v2="1" v3="2"/></triangles>
      </mesh>
    </object>
    <object id="2" type="model">
      <components>
        <component objectid="1" transform="1 0 0 0 1 0 0 0 1 5 0 0"/>
      </components>
    </object>
  </resources>
  <build><item objectid="2"/></build>
</model>`
  const zipped = zipSync({ '3D/3dmodel.model': strToU8(model) })
  const file = await tmp('component.3mf', Buffer.from(zipped))
  const result = await parserFor('3mf').parse(file)
  assert.equal(result.triangles, 1)
  assert.ok(Math.abs(result.bounds.max[0] - 6) < 0.001, `expected 6, got ${result.bounds.max[0]}`)
})

test('解析器注册表覆盖 STL / OBJ / 3MF', () => {
  assert.ok(parserFor('stl'))
  assert.ok(parserFor('obj'))
  assert.ok(parserFor('3mf'))
  assert.equal(parserFor('glb'), undefined)
})
