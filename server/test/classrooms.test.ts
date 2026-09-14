import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupApp, seedBase } from './helpers.ts';

const app = await setupApp();
let seed: Awaited<ReturnType<typeof seedBase>>;

beforeEach(async () => {
  seed = await seedBase(app);
});

test('admin creates classroom in campus', async () => {
  const res = await app.inject({
    method: 'POST', url: '/api/classrooms',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { campusId: seed.campusId, name: '8教室', capacity: 30 }
  });
  assert.equal(res.statusCode, 200);
  const list = await app.inject({
    method: 'GET', url: `/api/classrooms?campusId=${seed.campusId}`,
    headers: { authorization: `Bearer ${seed.adminToken}` }
  });
  assert.equal(list.json().length, 1);
  assert.equal(list.json()[0].name, '8教室');
});

test('duplicate classroom name in same campus rejected', async () => {
  await app.inject({
    method: 'POST', url: '/api/classrooms',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { campusId: seed.campusId, name: '8教室' }
  });
  const res = await app.inject({
    method: 'POST', url: '/api/classrooms',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { campusId: seed.campusId, name: '8教室' }
  });
  assert.equal(res.statusCode, 409);
});

test('classroom list filters and returns capacity summary', async () => {
  await app.inject({
    method: 'POST', url: '/api/classrooms',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { campusId: seed.campusId, name: '9教室', capacity: 20 }
  });
  const res = await app.inject({
    method: 'GET', url: `/api/classrooms/list?campusId=${seed.campusId}&status=active&keyword=9教室`,
    headers: { authorization: `Bearer ${seed.adminToken}` }
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().items.length, 1);
  assert.equal(res.json().summary.total, 1);
  assert.equal(res.json().summary.capacity, 20);
});
