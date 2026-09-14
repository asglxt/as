import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupApp, seedBase } from './helpers.ts';

const app = await setupApp();
let seed: Awaited<ReturnType<typeof seedBase>>;
let studentId = 0;
let lessonId = 0;

beforeEach(async () => {
  seed = await seedBase(app);
  const student = await app.inject({
    method: 'POST', url: '/api/students',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { campusId: seed.campusId, name: '张三' }
  });
  studentId = student.json().id;
  const lesson = await app.pool.query("INSERT INTO lessons (name) VALUES ('Genuis3') RETURNING id");
  lessonId = lesson.rows[0].id;
});

test('create enrollment writes purchase transaction', async () => {
  const res = await app.inject({
    method: 'POST', url: '/api/enrollments',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { studentId, lessonId, campusId: seed.campusId, purchasedHours: 48, totalFee: 2112, paidFee: 2112 }
  });
  assert.equal(res.statusCode, 200);
  assert.equal(Number(res.json().remaining_hours), 48);
  const tx = await app.pool.query('SELECT * FROM hour_transactions WHERE enrollment_id = $1', [res.json().id]);
  assert.equal(tx.rowCount, 1);
  assert.equal(tx.rows[0].type, 'purchase');
  assert.equal(Number(tx.rows[0].balance_after), 48);
});

test('adjustment requires remark and updates balance', async () => {
  const created = await app.inject({
    method: 'POST', url: '/api/enrollments',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { studentId, lessonId, campusId: seed.campusId, purchasedHours: 10, totalFee: 440, paidFee: 440 }
  });
  const id = created.json().id;
  const noRemark = await app.inject({
    method: 'POST', url: `/api/enrollments/${id}/adjust`,
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { hours: 2 }
  });
  assert.equal(noRemark.statusCode, 400);
  const ok = await app.inject({
    method: 'POST', url: `/api/enrollments/${id}/adjust`,
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { hours: 2, remark: '赠课' }
  });
  assert.equal(ok.statusCode, 200);
  assert.equal(Number(ok.json().remaining_hours), 12);
  const tx = await app.pool.query("SELECT * FROM hour_transactions WHERE enrollment_id = $1 AND type = 'adjust'", [id]);
  assert.equal(Number(tx.rows[0].hours), 2);
});

test('transaction list is queryable', async () => {
  const created = await app.inject({
    method: 'POST', url: '/api/enrollments',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { studentId, lessonId, campusId: seed.campusId, purchasedHours: 5, totalFee: 220, paidFee: 220 }
  });
  const id = created.json().id;
  const list = await app.inject({
    method: 'GET', url: `/api/enrollments/${id}/transactions`,
    headers: { authorization: `Bearer ${seed.adminToken}` }
  });
  assert.equal(list.statusCode, 200);
  assert.equal(list.json().length, 1);
});