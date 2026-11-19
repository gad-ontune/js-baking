import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DEMO_ACCOUNTS } from '../src/lib/demoCredentials.js'

const backendScript = readFileSync(new URL('../backend/scripts/seed_demo.py', import.meta.url), 'utf8')

test('one-click demo credentials match the backend seed script', () => {
  assert.equal(DEMO_ACCOUNTS.length, 3)
  for (const account of DEMO_ACCOUNTS) {
    assert.ok(account.password.length >= 12, `${account.username} password is too short`)
    assert.ok(backendScript.includes(`'${account.username}'`), `missing ${account.username} in seed script`)
    assert.ok(backendScript.includes(`'${account.password}'`), `missing ${account.password} in seed script`)
  }
})

test('demo passwords are not the old insecure frontend values', () => {
  const seedSource = readFileSync(new URL('../src/lib/seed.js', import.meta.url), 'utf8')
  assert.equal(seedSource.includes("password: 'owner123'"), false)
  assert.equal(seedSource.includes("password: 'staff123'"), false)
})
