import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupApp, seedBase } from './helpers.ts';

const app = await setupApp();
let seed: Awaited<ReturnType<typeof seedBase>>;

beforeEach(async () => {
  seed = await seedBase(app);
});

test('admin creates category, subject and lesson', async () => {
  const category = await app.inject({
    method: 'POST', url: '/api/lessons/categories',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { name: '英语进阶' }
  });
  assert.equal(category.statusCode, 200);
  const subject = await app.inject({
    method: 'POST', url: '/api/lessons/subjects',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { name: '英语进阶' }
  });
  const lesson = await app.inject({
    method: 'POST', url: '/api/lessons',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: {
      name: 'Genuis3', categoryId: category.json().id, subjectId: subject.json().id,
      teachingMode: 'small_class', feeMode: 'per_hour', campusId: seed.campusId
    }
  });
  assert.equal(lesson.statusCode, 200);
  assert.equal(lesson.json().name, 'Genuis3');
});

test('lesson list returns class count', async () => {
  const list = await app.inject({
    method: 'GET', url: '/api/lessons',
    headers: { authorization: `Bearer ${seed.adminToken}` }
  });
  assert.equal(list.statusCode, 200);
  assert.ok(Array.isArray(list.json()));
});

test('teacher cannot create lesson', async () => {
  const res = await app.inject({
    method: 'POST', url: '/api/lessons',
    headers: { authorization: `Bearer ${seed.teacherToken}` },
    payload: { name: 'X' }
  });
  assert.equal(res.statusCode, 403);
});