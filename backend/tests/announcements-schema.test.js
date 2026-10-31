import assert from 'node:assert/strict';
import { test } from 'node:test';
import { announcementSchema } from '../src/validators/schemas.js';

test('announcement schema trims and accepts a valid member message', () => {
  assert.deepEqual(announcementSchema.parse({ title: '  Due date  ', body: '  Please return books by Friday.  ' }), {
    title: 'Due date',
    body: 'Please return books by Friday.',
  });
});

test('announcement schema rejects missing or oversized message content', () => {
  assert.throws(() => announcementSchema.parse({ title: 'Hi', body: 'x' }));
  assert.throws(() => announcementSchema.parse({ title: 'Important', body: 'x'.repeat(2001) }));
});