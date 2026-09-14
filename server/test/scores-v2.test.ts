import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupApp, seedBase } from './helpers.ts';

const app = await setupApp();
let seed: Awaited<ReturnType<typeof seedBase>>;

beforeEach(async () => {
  seed = await seedBase(app);
});

test('admin creates and lists projects', async () => {
  const create = await app.inject({
    method: 'POST', url: '/api/scores/projects',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { name: '口语测评', sort: 9 }
  });
  assert.equal(create.statusCode, 200);
  const list = await app.inject({
    method: 'GET', url: '/api/scores/projects',
    headers: { authorization: `Bearer ${seed.adminToken}` }
  });
  assert.ok(list.json().some((p: any) => p.name === '口语测评'));
});

test('admin creates and lists exams', async () => {
  const create = await app.inject({
    method: 'POST', url: '/api/scores/exams',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { name: '六上第一单元', sort: 1 }
  });
  assert.equal(create.statusCode, 200);
  const list = await app.inject({
    method: 'GET', url: '/api/scores/exams',
    headers: { authorization: `Bearer ${seed.adminToken}` }
  });
  assert.ok(list.json().some((e: any) => e.name === '六上第一单元'));
});

test('teacher cannot create project', async () => {
  const res = await app.inject({
    method: 'POST', url: '/api/scores/projects',
    headers: { authorization: `Bearer ${seed.teacherToken}` },
    payload: { name: 'X' }
  });
  assert.equal(res.statusCode, 403);
});
test('bulk score entry upserts by unique key', async () => {
  const campusId = seed.campusId;
  const teacherId = (await app.pool.query("SELECT id FROM users WHERE username = 'teacher'")).rows[0].id;
  const lesson = await app.pool.query("INSERT INTO lessons (name) VALUES ('G1') RETURNING id");
  const cls = await app.pool.query(
    "INSERT INTO classes (campus_id, name, subject, grade, lesson_id, teacher_id) VALUES ($1,'G1A','英语','一年级',$2,$3) RETURNING id",
    [campusId, lesson.rows[0].id, teacherId]
  );
  const student = await app.pool.query("INSERT INTO students (campus_id, name) VALUES ($1,'小明') RETURNING id", [campusId]);
  const project = await app.pool.query("SELECT id FROM exam_projects ORDER BY id LIMIT 1");
  const exam = await app.pool.query("SELECT id FROM exams ORDER BY id LIMIT 1");
  const payload: any = {
    classId: cls.rows[0].id,
    projectId: project.rows[0].id,
    examId: exam.rows[0].id,
    examDate: '2026-09-14',
    source: 'teacher',
    scores: [{ studentId: student.rows[0].id, score: '92', remark: '不错' }]
  };
  const first = await app.inject({
    method: 'POST', url: '/api/scores/bulk',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload
  });
  assert.equal(first.statusCode, 200);
  payload.scores[0].score = '95';
  const second = await app.inject({
    method: 'POST', url: '/api/scores/bulk',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload
  });
  assert.equal(second.statusCode, 200);
  const rows = await app.pool.query('SELECT * FROM student_scores WHERE student_id = $1', [student.rows[0].id]);
  assert.equal(rows.rowCount, 1);
  assert.equal(rows.rows[0].score, '95');
});

test('score query filters and returns rows with total', async () => {
  const res = await app.inject({
    method: 'GET', url: '/api/scores?limit=10',
    headers: { authorization: `Bearer ${seed.adminToken}` }
  });
  assert.equal(res.statusCode, 200);
  assert.ok(Array.isArray(res.json().rows));
  assert.equal(typeof res.json().total, 'number');
});

test('score export returns csv', async () => {
  const res = await app.inject({
    method: 'GET', url: '/api/scores/export',
    headers: { authorization: `Bearer ${seed.adminToken}` }
  });
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /student_name/);
});

test('score roster supports multiple classes', async () => {
  const teacherId = (await app.pool.query("SELECT id FROM users WHERE username = 'teacher'")).rows[0].id;
  const cls = await app.pool.query(
    "INSERT INTO classes (campus_id, name, subject, grade, teacher_id) VALUES ($1,'成绩班','英语','一年级',$2) RETURNING id",
    [seed.campusId, teacherId]
  );
  const student = await app.pool.query("INSERT INTO students (campus_id, name, guardian_phone) VALUES ($1,'成绩学员','13800000000') RETURNING id", [seed.campusId]);
  await app.pool.query('INSERT INTO class_students (class_id, student_id) VALUES ($1, $2)', [cls.rows[0].id, student.rows[0].id]);
  const res = await app.inject({
    method: 'GET', url: `/api/scores/roster?classIds=${cls.rows[0].id}`,
    headers: { authorization: `Bearer ${seed.adminToken}` }
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json()[0].classId, Number(cls.rows[0].id));
  assert.equal(res.json()[0].students[0].name, '成绩学员');
});

test('teacher score roster and bulk entry are limited to own classes', async () => {
  const adminId = (await app.pool.query("SELECT id FROM users WHERE username='admin'")).rows[0].id;
  const cls = await app.pool.query(
    "INSERT INTO classes (campus_id,name,subject,grade,teacher_id) VALUES ($1,'Other Score Class','英语','一年级',$2) RETURNING id",
    [seed.campusId, adminId]
  );
  const student = await app.pool.query("INSERT INTO students (campus_id,name) VALUES ($1,'其他成绩学员') RETURNING id", [seed.campusId]);
  await app.pool.query('INSERT INTO class_students (class_id,student_id) VALUES ($1,$2)', [cls.rows[0].id, student.rows[0].id]);
  const roster = await app.inject({ method: 'GET', url: `/api/scores/roster?classIds=${cls.rows[0].id}`, headers: { authorization: `Bearer ${seed.teacherToken}` } });
  assert.equal(roster.statusCode, 403);
  const project = (await app.pool.query('SELECT id FROM exam_projects ORDER BY id LIMIT 1')).rows[0].id;
  const exam = (await app.pool.query('SELECT id FROM exams ORDER BY id LIMIT 1')).rows[0].id;
  const bulk = await app.inject({
    method: 'POST', url: '/api/scores/bulk', headers: { authorization: `Bearer ${seed.teacherToken}` },
    payload: { classId: cls.rows[0].id, projectId: project, examId: exam, examDate: '2026-09-14', scores: [{ studentId: Number(student.rows[0].id), score: '99' }] }
  });
  assert.equal(bulk.statusCode, 403);
});
