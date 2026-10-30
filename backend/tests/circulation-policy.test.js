import assert from 'node:assert/strict'
import { test } from 'node:test'
import { calculateOverdueFine, computeDueDate } from '../src/services/circulationService.js'

test('due date moves forward when the calculated day is closed', () => {
  const due = computeDueDate(
    new Date('2026-03-07T00:00:00.000Z'),
    1,
    true,
    { holidays: new Set(), closedWeekdays: new Set([0]) },
  )

  assert.equal(due.toISOString().slice(0, 10), '2026-03-09')
})

test('overdue fine applies grace days before calculating the charge', () => {
  const result = calculateOverdueFine({
    dueAt: '2026-03-01T00:00:00.000Z',
    returnedAt: '2026-03-06T00:00:00.000Z',
    dailyFine: '5.00',
    graceDays: 2,
    maxFine: '100.00',
  })

  assert.deepEqual(result, { lateDays: 3, amount: 15 })
})

test('overdue fine respects the configured maximum', () => {
  const result = calculateOverdueFine({
    dueAt: '2026-03-01T00:00:00.000Z',
    returnedAt: '2026-03-11T00:00:00.000Z',
    dailyFine: '5.00',
    graceDays: 1,
    maxFine: '30.00',
  })

  assert.deepEqual(result, { lateDays: 9, amount: 30 })
})