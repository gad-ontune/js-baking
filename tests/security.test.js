import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isFiniteNumber,
  isNonNegativeNumber,
  isValidDateValue,
  isValidEmail,
  passwordPolicyError,
  safeAbsoluteInternalUrl,
  safeInternalPath,
} from '../src/lib/security.js'
import { csvCell } from '../src/lib/format.js'

test('csvCell neutralises spreadsheet formulas', () => {
  assert.equal(csvCell('=HYPERLINK("http://evil.test")'), '"\'=HYPERLINK(""http://evil.test"")"')
  assert.equal(csvCell('+cmd'), '"\'+cmd"')
  assert.equal(csvCell('@SUM(A1)'), '"\'@SUM(A1)"')
  assert.equal(csvCell('-2+3'), '"\'-2+3"')
})

test('csvCell preserves ordinary and negative numeric values', () => {
  assert.equal(csvCell('Bread'), '"Bread"')
  assert.equal(csvCell('-125.50'), '"-125.50"')
  assert.equal(csvCell(0), '"0"')
})

test('csvCell removes control characters and escapes quotes', () => {
  assert.equal(csvCell('a\tb\rc\nd'), '"a b c d"')
  assert.equal(csvCell('say "hello"'), '"say ""hello"""')
})

test('numeric validation rejects empty, non-numeric and infinite values', () => {
  assert.equal(isFiniteNumber(''), false)
  assert.equal(isFiniteNumber(null), false)
  assert.equal(isFiniteNumber('abc'), false)
  assert.equal(isFiniteNumber(Number.NaN), false)
  assert.equal(isFiniteNumber(Number.POSITIVE_INFINITY), false)
  assert.equal(isFiniteNumber(0), true)
  assert.equal(isFiniteNumber('12.5'), true)
  assert.equal(isNonNegativeNumber('-1'), false)
  assert.equal(isNonNegativeNumber('0'), true)
})

test('date and email validation', () => {
  assert.equal(isValidDateValue('2026-11-19'), true)
  assert.equal(isValidDateValue('not-a-date'), false)
  assert.equal(isValidDateValue(''), false)
  assert.equal(isValidEmail('owner@jsbaking.test'), true)
  assert.equal(isValidEmail('not-an-email'), false)
  assert.equal(isValidEmail(''), true)
})

test('password policy requires long passwords without padded whitespace', () => {
  assert.match(passwordPolicyError('short'), /at least 12/)
  assert.match(passwordPolicyError('  123456789012'), /whitespace/)
  assert.equal(passwordPolicyError('correct horse battery'), null)
})

test('internal navigation targets stay on the application origin', () => {
  const origin = 'https://bakery.test'
  assert.equal(safeInternalPath('/sales?q=1', origin), '/sales?q=1')
  assert.equal(safeInternalPath('https://bakery.test/sales', origin), '/sales')
  assert.equal(safeInternalPath('https://evil.test/sales', origin), null)
  assert.equal(safeInternalPath('//evil.test/sales', origin), null)
  assert.equal(safeInternalPath('/\\evil.test', origin), null)
  assert.equal(safeInternalPath('javascript:alert(1)', origin), null)
  assert.equal(safeInternalPath('http://user:pass@bakery.test', origin), null)
  assert.equal(safeAbsoluteInternalUrl('/notifications', origin), 'https://bakery.test/notifications')
  assert.equal(safeAbsoluteInternalUrl('https://evil.test', origin), null)
})
