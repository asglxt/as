import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupApp } from './helpers.ts';
import { hashPassword } from '../src/auth/password.ts';

const app = await setupApp();

beforeEach(async () => {
  await app.pool.query('TRUNCATE parent_bindings, import_jobs, audit_logs, student_scores, exam_projects, exams, class_students, classes, users, students, campuses RESTART IDENTITY CASCADE');
  const campus = await app.pool.query("INSERT INTO campuses (name) VALUES ('测试校区') RETURNING id");
  const campusId = campus.rows[0].id;
  await app.pool.query(
    "INSERT INTO users (username, password_hash, display_name, role, campus_id) VALUES ('admin', $1, '管理员', 'admin', $2)",
    [await hashPassword('admin123'), campusId]
  );
});

test('admin can login', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username: 'admin', password: 'admin123' }
  });
  assert.equal(res.statusCode, 200);
  assert.ok(res.json().token);
  assert.equal(res.json().user.role, 'admin');
});

test('wrong password rejected', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username: 'admin', password: 'nope' }
  });
  assert.equal(res.statusCode, 401);
});

test('invite creates parent and claim sets credentials', async () => {
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username: 'admin', password: 'admin123' }
  });
  const token = login.json().token;
  const student = await app.pool.query("INSERT INTO students (campus_id, name) VALUES (1, '张三') RETURNING id");
  const invite = await app.inject({
    method: 'POST',
    url: '/api/auth/invite',
    headers: { authorization: `Bearer ${token}` },
    payload: { role: 'parent', studentId: student.rows[0].id, displayName: '张三家长' }
  });
  assert.equal(invite.statusCode, 200);
  const code = invite.json().inviteCode;
  const claim = await app.inject({
    method: 'POST',
    url: '/api/auth/claim',
    payload: { inviteCode: code, username: 'parent1', password: 'pass1234' }
  });
  assert.equal(claim.statusCode, 200);
  const parentLogin = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username: 'parent1', password: 'pass1234' }
  });
  assert.equal(parentLogin.statusCode, 200);
  const binding = await app.pool.query('SELECT * FROM parent_bindings');
  assert.equal(binding.rowCount, 1);
  const parentUser = await app.pool.query("SELECT student_id FROM users WHERE username = 'parent1'");
  assert.equal(parentUser.rows[0].student_id, null);
});

test('me returns current user', async () => {
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username: 'admin', password: 'admin123' }
  });
  const res = await app.inject({
    method: 'GET',
    url: '/api/auth/me',
    headers: { authorization: `Bearer ${login.json().token}` }
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().role, 'admin');
});

test('missing token rejected', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/auth/me' });
  assert.equal(res.statusCode, 401);
});

test('teacher cannot create invite', async () => {
  await app.pool.query(
    "INSERT INTO users (username, password_hash, display_name, role, campus_id) VALUES ('teacher', $1, '教师', 'teacher', 1)",
    [await hashPassword('teacher123')]
  );
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username: 'teacher', password: 'teacher123' }
  });
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/invite',
    headers: { authorization: `Bearer ${login.json().token}` },
    payload: { role: 'parent', studentId: 1, displayName: 'X' }
  });
  assert.equal(res.statusCode, 403);
});
