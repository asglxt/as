import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupApp, seedBase } from './helpers.ts';

const app = await setupApp();
let adminToken = '';

beforeEach(async () => {
  const seed = await seedBase(app);
  adminToken = seed.adminToken;
});

test('admin creates and lists campuses', async () => {
  const create = await app.inject({
    method: 'POST',
    url: '/api/campuses',
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { name: '东城校区' }
  });
  assert.equal(create.statusCode, 200);
  const list = await app.inject({
    method: 'GET',
    url: '/api/campuses',
    headers: { authorization: `Bearer ${adminToken}` }
  });
  assert.equal(list.statusCode, 200);
  assert.ok(list.json().some((c: { name: string }) => c.name === '东城校区'));
});

test('teacher cannot create campus', async () => {
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username: 'teacher', password: 'teacher123' }
  });
  const res = await app.inject({
    method: 'POST',
    url: '/api/campuses',
    headers: { authorization: `Bearer ${login.json().token}` },
    payload: { name: '违规校区' }
  });
  assert.equal(res.statusCode, 403);
});
