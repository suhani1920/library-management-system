import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bookUpdateSchema } from '../src/validators/schemas.js'

test('book update schema accepts archive restoration status', () => {
  assert.deepEqual(bookUpdateSchema.parse({ status: 'active' }), { status: 'active' })
})

test('book update schema rejects unsupported status values', () => {
  assert.throws(() => bookUpdateSchema.parse({ status: 'deleted' }))
})