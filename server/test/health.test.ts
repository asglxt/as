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

test('GET / redirects to the Web login page', async () => {
  const previousWebUrl = process.env.WEB_URL;
  process.env.WEB_URL = 'http://localhost:5173';
  const app = await setupApp();

  try {
    const res = await app.inject({ method: 'GET', url: '/' });
    assert.equal(res.statusCode, 302);
    assert.equal(res.headers.location, 'http://localhost:5173/login');
  } finally {
    await app.close();
    if (previousWebUrl === undefined) delete process.env.WEB_URL;
    else process.env.WEB_URL = previousWebUrl;
  }
});
