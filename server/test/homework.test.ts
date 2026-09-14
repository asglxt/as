import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupApp, seedBase } from './helpers.ts';

const app = await setupApp();
let seed: Awaited<ReturnType<typeof seedBase>>;
let classId = 0;
let studentA = 0;
let studentB = 0;

beforeEach(async () => {
  seed = await seedBase(app);
  const teacherId = (await app.pool.query("SELECT id FROM users WHERE username = 'teacher'")).rows[0].id;
  const cls = await app.pool.query(
    "INSERT INTO classes (campus_id, name, subject, grade, teacher_id) VALUES ($1,'H1','英语','一年级',$2) RETURNING id",
    [seed.campusId, teacherId]
  );
  classId = cls.rows[0].id;
  const a = await app.pool.query("INSERT INTO students (campus_id, name) VALUES ($1,'作业甲') RETURNING id", [seed.campusId]);
  const b = await app.pool.query("INSERT INTO students (campus_id, name) VALUES ($1,'作业乙') RETURNING id", [seed.campusId]);
  studentA = a.rows[0].id;
  studentB = b.rows[0].id;
  await app.pool.query('INSERT INTO class_students (class_id, student_id) VALUES ($1,$2),($1,$3)', [classId, studentA, studentB]);
});

test('publishing homework creates records for class students', async () => {
  const res = await app.inject({
    method: 'POST', url: '/api/homework',
    headers: { authorization: `Bearer ${seed.teacherToken}` },
    payload: { classId, title: '第一单元练习', content: '完成第 1-5 题', status: 'published', dueAt: '2026-09-20T20:00:00Z' }
  });
  assert.equal(res.statusCode, 200);
  const records = await app.pool.query('SELECT * FROM homework_records WHERE homework_id = $1', [res.json().id]);
  assert.equal(records.rowCount, 2);
  assert.ok(records.rows.every((r) => r.status === 'not_submitted'));
});

test('draft does not create records', async () => {
  const res = await app.inject({
    method: 'POST', url: '/api/homework',
    headers: { authorization: `Bearer ${seed.teacherToken}` },
    payload: { classId, title: '草稿作业', status: 'draft' }
  });
  assert.equal(res.statusCode, 200);
  const records = await app.pool.query('SELECT * FROM homework_records WHERE homework_id = $1', [res.json().id]);
  assert.equal(records.rowCount, 0);
});

test('student submits and teacher reviews with valid state transitions', async () => {
  const created = await app.inject({
    method: 'POST', url: '/api/homework',
    headers: { authorization: `Bearer ${seed.teacherToken}` },
    payload: { classId, title: '状态机作业', status: 'published' }
  });
  const homeworkId = created.json().id;
  const submit = await app.inject({
    method: 'POST', url: `/api/homework/${homeworkId}/records/${studentA}/submit`,
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { content: '已完成' }
  });
  assert.equal(submit.statusCode, 200);
  const review = await app.inject({
    method: 'POST', url: `/api/homework/${homeworkId}/records/${studentA}/review`,
    headers: { authorization: `Bearer ${seed.teacherToken}` },
    payload: { score: 'A', comment: '完成得很好' }
  });
  assert.equal(review.statusCode, 200);
  const row = await app.pool.query('SELECT * FROM homework_records WHERE homework_id = $1 AND student_id = $2', [homeworkId, studentA]);
  assert.equal(row.rows[0].status, 'reviewed');
  assert.ok(row.rows[0].reviewed_at);
});

test('cannot review before submission', async () => {
  const created = await app.inject({
    method: 'POST', url: '/api/homework',
    headers: { authorization: `Bearer ${seed.teacherToken}` },
    payload: { classId, title: '未提交作业', status: 'published' }
  });
  const res = await app.inject({
    method: 'POST', url: `/api/homework/${created.json().id}/records/${studentB}/review`,
    headers: { authorization: `Bearer ${seed.teacherToken}` },
    payload: { score: 'B' }
  });
  assert.equal(res.statusCode, 409);
});

test('homework list returns submission statistics', async () => {
  const created = await app.inject({
    method: 'POST', url: '/api/homework',
    headers: { authorization: `Bearer ${seed.teacherToken}` },
    payload: { classId, title: '统计作业', status: 'published' }
  });
  const homeworkId = created.json().id;
  await app.inject({
    method: 'POST', url: `/api/homework/${homeworkId}/records/${studentA}/submit`,
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { content: '交了' }
  });
  const list = await app.inject({
    method: 'GET', url: '/api/homework',
    headers: { authorization: `Bearer ${seed.teacherToken}` }
  });
  const row = list.json().find((h: any) => h.id === homeworkId);
  assert.equal(Number(row.student_count), 2);
  assert.equal(Number(row.submitted_count), 1);
});

test('homework list endpoint filters class and returns workflow summary', async () => {
  const created = await app.inject({
    method: 'POST', url: '/api/homework',
    headers: { authorization: `Bearer ${seed.teacherToken}` },
    payload: { classId, title: '筛选作业', status: 'published' }
  });
  await app.inject({
    method: 'POST', url: `/api/homework/${created.json().id}/records/${studentA}/submit`,
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { content: '提交内容' }
  });
  const res = await app.inject({
    method: 'GET', url: `/api/homework/list?classId=${classId}&status=published&page=1&pageSize=20`,
    headers: { authorization: `Bearer ${seed.teacherToken}` }
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().items[0].title, '筛选作业');
  assert.equal(res.json().summary.total, 1);
  assert.equal(res.json().summary.submitted, 1);
  assert.equal(res.json().summary.reviewed, 0);
});
