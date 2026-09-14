import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupApp, seedBase } from './helpers.ts';

const app = await setupApp();
let seed: Awaited<ReturnType<typeof seedBase>>;

beforeEach(async () => {
  seed = await seedBase(app);
});

test('admin creates class and teacher sees only own class', async () => {
  const teacherId = (await app.pool.query("SELECT id FROM users WHERE username = 'teacher'")).rows[0].id;
  const create = await app.inject({
    method: 'POST',
    url: '/api/classes',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { campusId: seed.campusId, name: '三年级英语1班', subject: '英语', grade: '三年级', teacherId }
  });
  assert.equal(create.statusCode, 200);
  const classId = create.json().id;
  const teacherList = await app.inject({
    method: 'GET',
    url: '/api/classes',
    headers: { authorization: `Bearer ${seed.teacherToken}` }
  });
  assert.equal(teacherList.json().length, 1);
  assert.equal(teacherList.json()[0].id, classId);
});

test('teacher cannot create class for another campus', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/classes',
    headers: { authorization: `Bearer ${seed.teacherToken}` },
    payload: { campusId: seed.campusId, name: 'X班', subject: '数学', grade: '初二' }
  });
  assert.equal(res.statusCode, 403);
});

test('class supports lesson, teacher, assistant and capacity', async () => {
  const lesson = await app.pool.query("INSERT INTO lessons (name) VALUES ('Genuis3') RETURNING id");
  const teacherId = (await app.pool.query("SELECT id FROM users WHERE username = 'teacher'")).rows[0].id;
  const create = await app.inject({
    method: 'POST', url: '/api/classes',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: {
      campusId: seed.campusId, name: 'G3D 新班', subject: '英语', grade: '三年级',
      lessonId: lesson.rows[0].id, teacherId, assistantId: teacherId, capacity: 20, startDate: '2026-09-01'
    }
  });
  assert.equal(create.statusCode, 200);
  assert.equal(Number(create.json().capacity), 20);
});

test('assignment records lesson and teacher', async () => {
  const lesson = await app.pool.query("INSERT INTO lessons (name) VALUES ('G1') RETURNING id");
  const teacherId = (await app.pool.query("SELECT id FROM users WHERE username = 'teacher'")).rows[0].id;
  const cls = await app.pool.query(
    "INSERT INTO classes (campus_id, name, subject, grade, lesson_id, teacher_id) VALUES ($1, 'G1A', '英语', '一年级', $2, $3) RETURNING id",
    [seed.campusId, lesson.rows[0].id, teacherId]
  );
  const student = await app.pool.query("INSERT INTO students (campus_id, name) VALUES ($1, '小明') RETURNING id", [seed.campusId]);
  const res = await app.inject({
    method: 'POST', url: `/api/classes/${cls.rows[0].id}/students`,
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { studentId: student.rows[0].id, lessonId: lesson.rows[0].id, teacherId, startDate: '2026-09-01' }
  });
  assert.equal(res.statusCode, 200);
  const row = await app.pool.query('SELECT * FROM class_students WHERE class_id = $1 AND student_id = $2', [cls.rows[0].id, student.rows[0].id]);
  assert.equal(Number(row.rows[0].lesson_id), Number(lesson.rows[0].id));
  assert.equal(row.rows[0].status, 'active');
});