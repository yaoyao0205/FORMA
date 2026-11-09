import { test } from 'node:test'
import assert from 'node:assert/strict'
import { asId, asIdArray, asString, asNumber, asBoolean, asObject, oneOf, ValidationError } from './.build/validate.mjs'

test('asId：合法前缀通过，非法值抛出中文错误', () => {
  assert.equal(asId('mdl_abc123'), 'mdl_abc123')
  assert.throws(() => asId('../../etc/passwd'), ValidationError)
  assert.throws(() => asId(''), ValidationError)
  assert.throws(() => asId(42), ValidationError)
  try {
    asId('bad value')
  } catch (error) {
    assert.match(error.message, /格式非法/)
  }
})

test('asIdArray：逐项校验，空数组合法但含非法项时抛错', () => {
  assert.deepEqual(asIdArray(['tag_a', 'tag_b']), ['tag_a', 'tag_b'])
  assert.deepEqual(asIdArray([]), [])
  assert.throws(() => asIdArray(['ok', '../x']), ValidationError)
  assert.throws(() => asIdArray('not-an-array'), ValidationError)
})

test('asString：长度上限与类型校验', () => {
  assert.equal(asString(' hello '), ' hello ', '不做隐式 trim，保持原始内容')
  assert.throws(() => asString(123), ValidationError)
  assert.throws(() => asString('x'.repeat(5000)), ValidationError)
})

test('asNumber / asBoolean：拒绝 NaN 与非布尔值', () => {
  assert.equal(asNumber(12, 'n'), 12)
  assert.throws(() => asNumber(Number.NaN, 'n'), ValidationError)
  assert.throws(() => asNumber('12', 'n'), ValidationError)
  assert.equal(asBoolean(true, 'b'), true)
  assert.equal(asBoolean(undefined, 'b', true), true)
})

test('asObject：拒绝数组与 null', () => {
  assert.deepEqual(asObject({ a: 1 }, 'p'), { a: 1 })
  assert.throws(() => asObject(null, 'p'), ValidationError)
  assert.throws(() => asObject([1], 'p'), ValidationError)
})

test('oneOf：枚举取值与回退值', () => {
  assert.equal(oneOf('none', ['none', 'queued'], 'status'), 'none')
  assert.equal(oneOf(undefined, ['none', 'queued'], 'status', 'none'), 'none', 'fallback 只对缺值生效')
  assert.throws(() => oneOf('bad', ['none'], 'status'), ValidationError)
})
