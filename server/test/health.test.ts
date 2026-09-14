import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupApp } from './helpers.ts';

test('GET /api/health returns ok', async () => {
  const app = await setupApp();
  const res = await app.inject({ method: 'GET', url: '/api/health' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { ok: true });
  await app.close();
});
