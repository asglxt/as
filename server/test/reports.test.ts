import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupApp, seedBase } from './helpers.ts';
import { hashPassword } from '../src/auth/password.ts';

const app = await setupApp();
let seed: Awaited<ReturnType<typeof seedBase>>;
let studentId = 0;
let parentId = 0;

beforeEach(async () => {
  seed = await seedBase(app);
  const teacherId = (await app.pool.query("SELECT id FROM users WHERE username = 'teacher'")).rows[0].id;
  const classRes = await app.inject({
    method: 'POST',
    url: '/api/classes',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { campusId: seed.campusId, name: '三年级英语1班', subject: '英语', grade: '三年级', teacherId }
  });
  const classId = classRes.json().id;
  const studentRes = await app.inject({
    method: 'POST',
    url: '/api/students',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { campusId: seed.campusId, name: '张三' }
  });
  studentId = studentRes.json().id;
  await app.pool.query('INSERT INTO class_students (class_id, student_id) VALUES ($1, $2)', [classId, studentId]);
  const project = await app.pool.query('SELECT id FROM exam_projects ORDER BY id LIMIT 1');
  const exam = await app.pool.query('SELECT id FROM exams ORDER BY id LIMIT 1');
  await app.pool.query(
    `INSERT INTO student_scores (student_id, project_id, exam_id, class_id, score, source, exam_date)
     VALUES ($1,$2,$3,$4,'92','teacher','2026-09-14')`,
    [studentId, project.rows[0].id, exam.rows[0].id, classId]
  );
  const parent = await app.pool.query(
    "INSERT INTO users (username, password_hash, display_name, role, campus_id) VALUES ('parent', $1, '家长', 'parent', $2) RETURNING id",
    [await hashPassword('parent123'), seed.campusId]
  );
  parentId = parent.rows[0].id;
  await app.pool.query('INSERT INTO parent_bindings (parent_user_id, student_id) VALUES ($1, $2)', [parentId, studentId]);
});

test('parent can view own child report', async () => {
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username: 'parent', password: 'parent123' }
  });
  const res = await app.inject({
    method: 'GET',
    url: `/api/reports/student/${studentId}`,
    headers: { authorization: `Bearer ${login.json().token}` }
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().student.name, '张三');
  assert.equal(res.json().scores.length, 1);
  assert.equal(res.json().scores[0].score, '92');
  assert.ok(res.json().scores[0].project_name);
  assert.ok(res.json().scores[0].exam_name);
});

test('unrelated parent cannot view report', async () => {
  await app.pool.query(
    "INSERT INTO users (username, password_hash, display_name, role, campus_id) VALUES ('other_parent', $1, '别人家长', 'parent', $2)",
    [await hashPassword('parent123'), seed.campusId]
  );
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username: 'other_parent', password: 'parent123' }
  });
  const res = await app.inject({
    method: 'GET',
    url: `/api/reports/student/${studentId}`,
    headers: { authorization: `Bearer ${login.json().token}` }
  });
  assert.equal(res.statusCode, 403);
});

test('parent /api/me/children returns bound child report', async () => {
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username: 'parent', password: 'parent123' }
  });
  const res = await app.inject({
    method: 'GET',
    url: '/api/me/children',
    headers: { authorization: `Bearer ${login.json().token}` }
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().length, 1);
  assert.equal(res.json()[0].student.id, studentId);
});