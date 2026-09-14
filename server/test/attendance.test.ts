import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupApp, seedBase } from './helpers.ts';

const app = await setupApp();
let seed: Awaited<ReturnType<typeof seedBase>>;
let classId = 0;
let scheduleId = 0;
let studentId = 0;
let enrollmentId = 0;

beforeEach(async () => {
  seed = await seedBase(app);
  const teacherId = (await app.pool.query("SELECT id FROM users WHERE username = 'teacher'")).rows[0].id;
  const lesson = await app.pool.query("INSERT INTO lessons (name) VALUES ('Genuis3') RETURNING id");
  const lessonId = lesson.rows[0].id;
  const cls = await app.inject({
    method: 'POST', url: '/api/classes',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { campusId: seed.campusId, name: 'G3D', subject: '英语', grade: '三年级', teacherId, lessonId }
  });
  classId = cls.json().id;
  const student = await app.inject({
    method: 'POST', url: '/api/students',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { campusId: seed.campusId, name: '张三' }
  });
  studentId = student.json().id;
  await app.inject({
    method: 'POST', url: `/api/classes/${classId}/students`,
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { studentId, lessonId, teacherId }
  });
  const enrollment = await app.inject({
    method: 'POST', url: '/api/enrollments',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { studentId, lessonId, campusId: seed.campusId, purchasedHours: 10, totalFee: 440, paidFee: 440 }
  });
  enrollmentId = enrollment.json().id;
  const schedule = await app.inject({
    method: 'POST', url: '/api/schedules',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { classId, campusId: seed.campusId, date: '2026-09-15', startTime: '19:00', endTime: '20:30', teacherId }
  });
  scheduleId = schedule.json().id;
});

test('today list shows pending schedule', async () => {
  const res = await app.inject({
    method: 'GET', url: '/api/attendance/today?date=2026-09-15',
    headers: { authorization: `Bearer ${seed.teacherToken}` }
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().length, 1);
  assert.equal(res.json()[0].class_name, 'G3D');
});

test('record attendance deducts hours and writes transaction', async () => {
  const res = await app.inject({
    method: 'POST', url: `/api/attendance/record/${scheduleId}`,
    headers: { authorization: `Bearer ${seed.teacherToken}` },
    payload: { records: [{ studentId, status: 'present' }] }
  });
  assert.equal(res.statusCode, 200);
  const enrollment = await app.pool.query('SELECT * FROM enrollments WHERE id = $1', [enrollmentId]);
  assert.equal(Number(enrollment.rows[0].remaining_hours), 9);
  const tx = await app.pool.query("SELECT * FROM hour_transactions WHERE enrollment_id = $1 AND type = 'consume'", [enrollmentId]);
  assert.equal(tx.rowCount, 1);
  assert.equal(Number(tx.rows[0].hours), -1);
  const schedule = await app.pool.query('SELECT is_recorded FROM schedules WHERE id = $1', [scheduleId]);
  assert.equal(schedule.rows[0].is_recorded, true);
});

test('leave does not deduct hours', async () => {
  await app.inject({
    method: 'POST', url: `/api/attendance/record/${scheduleId}`,
    headers: { authorization: `Bearer ${seed.teacherToken}` },
    payload: { records: [{ studentId, status: 'leave' }] }
  });
  const enrollment = await app.pool.query('SELECT * FROM enrollments WHERE id = $1', [enrollmentId]);
  assert.equal(Number(enrollment.rows[0].remaining_hours), 10);
});

test('recording twice is rejected', async () => {
  await app.inject({
    method: 'POST', url: `/api/attendance/record/${scheduleId}`,
    headers: { authorization: `Bearer ${seed.teacherToken}` },
    payload: { records: [{ studentId, status: 'present' }] }
  });
  const again = await app.inject({
    method: 'POST', url: `/api/attendance/record/${scheduleId}`,
    headers: { authorization: `Bearer ${seed.teacherToken}` },
    payload: { records: [{ studentId, status: 'present' }] }
  });
  assert.equal(again.statusCode, 409);
});
test('attendance deduction also updates remaining fee', async () => {
  await app.pool.query('UPDATE enrollments SET unit_price = 44, used_fee = 0, remaining_fee = 440 WHERE id = $1', [enrollmentId]);
  const res = await app.inject({
    method: 'POST', url: `/api/attendance/record/${scheduleId}`,
    headers: { authorization: `Bearer ${seed.teacherToken}` },
    payload: { records: [{ studentId, status: 'present' }] }
  });
  assert.equal(res.statusCode, 200);
  const after = await app.pool.query('SELECT * FROM enrollments WHERE id = $1', [enrollmentId]);
  assert.equal(Number(after.rows[0].remaining_hours), 9);
  assert.equal(Number(after.rows[0].used_fee), 44);
  assert.equal(Number(after.rows[0].remaining_fee), 396);
});