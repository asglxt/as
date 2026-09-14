import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupApp, seedBase } from './helpers.ts';

const app = await setupApp();
let seed: Awaited<ReturnType<typeof seedBase>>;

beforeEach(async () => {
  seed = await seedBase(app);
});

test('admin creates comment template', async () => {
  const res = await app.inject({
    method: 'POST', url: '/api/comments/templates',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { name: '表现优秀', content: '课堂积极参与，发音标准', defaultRating: 5, defaultFlowers: 2 }
  });
  assert.equal(res.statusCode, 200);
  const list = await app.inject({
    method: 'GET', url: '/api/comments/templates',
    headers: { authorization: `Bearer ${seed.teacherToken}` }
  });
  assert.equal(list.json().length, 1);
});
async function seedLesson() {
  const teacherId = (await app.pool.query("SELECT id FROM users WHERE username = 'teacher'")).rows[0].id;
  const lesson = await app.pool.query("INSERT INTO lessons (name) VALUES ('G1') RETURNING id");
  const cls = await app.pool.query(
    "INSERT INTO classes (campus_id, name, subject, grade, lesson_id, teacher_id) VALUES ($1,'G1A','英语','一年级',$2,$3) RETURNING id",
    [seed.campusId, lesson.rows[0].id, teacherId]
  );
  const student = await app.pool.query("INSERT INTO students (campus_id, name) VALUES ($1,'点评学员') RETURNING id", [seed.campusId]);
  await app.pool.query('INSERT INTO class_students (class_id, student_id) VALUES ($1,$2)', [cls.rows[0].id, student.rows[0].id]);
  const schedule = await app.pool.query(
    "INSERT INTO schedules (class_id, campus_id, schedule_date, start_time, end_time, teacher_id) VALUES ($1,$2,'2026-09-15','19:00','20:30',$3) RETURNING id",
    [cls.rows[0].id, seed.campusId, teacherId]
  );
  const log = await app.pool.query(
    "INSERT INTO teaching_logs (schedule_id, class_id, campus_id, teacher_id, status, taught_at) VALUES ($1,$2,$3,$4,'recorded', now()) RETURNING id",
    [schedule.rows[0].id, cls.rows[0].id, seed.campusId, teacherId]
  );
  return { teachingLogId: log.rows[0].id, studentId: student.rows[0].id };
}

test('teacher records comments and stats reflect rate', async () => {
  const { teachingLogId, studentId } = await seedLesson();
  const save = await app.inject({
    method: 'POST', url: `/api/comments/record/${teachingLogId}`,
    headers: { authorization: `Bearer ${seed.teacherToken}` },
    payload: { comments: [{ studentId, rating: 5, content: '很棒', flowers: 2 }] }
  });
  assert.equal(save.statusCode, 200);
  const stats = await app.inject({
    method: 'GET', url: '/api/comments/stats',
    headers: { authorization: `Bearer ${seed.adminToken}` }
  });
  assert.equal(stats.statusCode, 200);
  assert.ok(stats.json().length >= 1);
  assert.equal(Number(stats.json()[0].comment_count), 1);
});

test('parent mark read updates read rate', async () => {
  const { teachingLogId, studentId } = await seedLesson();
  await app.inject({
    method: 'POST', url: `/api/comments/record/${teachingLogId}`,
    headers: { authorization: `Bearer ${seed.teacherToken}` },
    payload: { comments: [{ studentId, rating: 4, content: '继续加油', flowers: 1 }] }
  });
  const { hashPassword } = await import('../src/auth/password.ts');
  const parent = await app.pool.query(
    "INSERT INTO users (username, password_hash, display_name, role, campus_id) VALUES ('pc', $1, '点评家长', 'parent', $2) RETURNING id",
    [await hashPassword('parent123'), seed.campusId]
  );
  await app.pool.query('INSERT INTO parent_bindings (parent_user_id, student_id) VALUES ($1,$2)', [parent.rows[0].id, studentId]);
  const login = await app.inject({
    method: 'POST', url: '/api/auth/login',
    payload: { username: 'pc', password: 'parent123' }
  });
  const mine = await app.inject({
    method: 'GET', url: '/api/me/comments',
    headers: { authorization: `Bearer ${login.json().token}` }
  });
  assert.equal(mine.statusCode, 200);
  assert.equal(mine.json().length, 1);
  const commentId = mine.json()[0].id;
  const read = await app.inject({
    method: 'POST', url: `/api/me/comments/${commentId}/read`,
    headers: { authorization: `Bearer ${login.json().token}` }
  });
  assert.equal(read.statusCode, 200);
  const row = await app.pool.query('SELECT read_at FROM teaching_comments WHERE id = $1', [commentId]);
  assert.ok(row.rows[0].read_at);
});
test('comment logs list returns teaching logs with counts', async () => {
  const { teachingLogId } = await seedLesson();
  const res = await app.inject({
    method: 'GET', url: '/api/comments/logs',
    headers: { authorization: `Bearer ${seed.teacherToken}` }
  });
  assert.equal(res.statusCode, 200);
  const rows = res.json();
  assert.ok(rows.some((r: any) => Number(r.teaching_log_id) === Number(teachingLogId)));
  assert.ok(rows[0].class_name);
});