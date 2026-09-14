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

test('admin creates campus with settings and updates it', async () => {
  const create = await app.inject({
    method: 'POST',
    url: '/api/campuses',
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { name: '新城校区', code: 'XC', phone: '0771-1234567', address: '新城路1号', principal: '王校长', notes: '旗舰校区' }
  });
  assert.equal(create.statusCode, 200);
  assert.equal(create.json().code, 'XC');
  assert.equal(create.json().address, '新城路1号');
  const update = await app.inject({
    method: 'PATCH',
    url: `/api/campuses/${create.json().id}`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { name: '新城总校区', status: 'disabled', principal: '李校长' }
  });
  assert.equal(update.statusCode, 200);
  assert.equal(update.json().name, '新城总校区');
  assert.equal(update.json().status, 'disabled');
  assert.equal(update.json().principal, '李校长');
});

test('teacher cannot update campus settings', async () => {
  const list = await app.inject({
    method: 'GET',
    url: '/api/campuses',
    headers: { authorization: `Bearer ${adminToken}` }
  });
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'teacher', password: 'teacher123' } });
  const res = await app.inject({
    method: 'PATCH',
    url: `/api/campuses/${list.json()[0].id}`,
    headers: { authorization: `Bearer ${login.json().token}` },
    payload: { name: '违规修改' }
  });
  assert.equal(res.statusCode, 403);
});
