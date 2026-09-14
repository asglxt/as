import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupApp, seedBase } from './helpers.ts';

test('dashboard summary returns operational counts', async () => {
  const app = await setupApp();
  const seed = await seedBase(app);
  const res = await app.inject({
    method: 'GET',
    url: '/api/dashboard/summary',
    headers: { authorization: `Bearer ${seed.adminToken}` }
  });
  assert.equal(res.statusCode, 200);
  assert.equal(typeof res.json().students, 'number');
  assert.equal(typeof res.json().schedulesToday, 'number');
  assert.ok(Array.isArray(res.json().tasks));
  assert.ok(Array.isArray(res.json().quickActions));
  await app.close();
});
