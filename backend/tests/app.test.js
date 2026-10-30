import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { pool } from '../src/database/pool.js'

const app = createApp()

after(async () => {
  await pool.end()
})

test('health endpoint reports the configured application', async () => {
  const response = await request(app).get('/health')

  assert.equal(response.status, 200)
  assert.equal(response.body.status, 'ok')
  assert.equal(response.body.service, 'LibraCore')
  assert.ok(response.body.time)
})

test('CSRF endpoint issues a token cookie and returns its value', async () => {
  const response = await request(app).get('/api/v1/auth/csrf')

  assert.equal(response.status, 200)
  assert.equal(typeof response.body.data.csrfToken, 'string')
  assert.ok(response.headers['set-cookie'].some((cookie) => cookie.startsWith('csrf_token=')))
})

test('unsafe API requests without a CSRF token are rejected', async () => {
  const response = await request(app).post('/api/v1/auth/login').send({ email: 'reader@example.edu', password: 'invalid' })

  assert.equal(response.status, 403)
  assert.equal(response.body.error.code, 'CSRF')
})

test('unknown paths use the safe not-found response', async () => {
  const response = await request(app).get('/not-a-route')

  assert.equal(response.status, 404)
  assert.equal(response.body.error.code, 'NOT_FOUND')
})