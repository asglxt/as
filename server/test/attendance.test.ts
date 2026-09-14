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

test('attendance list filters schedule status and returns summary', async () => {
  const res = await app.inject({
    method: 'GET', url: '/api/attendance/list?date=2026-09-15&status=pending&page=1&pageSize=20',
    headers: { authorization: `Bearer ${seed.teacherToken}` }
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().items.length, 1);
  assert.equal(res.json().items[0].class_name, 'G3D');
  assert.equal(res.json().summary.pending, 1);
  assert.equal(res.json().summary.recorded, 0);
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

test('teacher attendance data is limited to own classes', async () => {
  const adminId = (await app.pool.query("SELECT id FROM users WHERE username='admin'")).rows[0].id;
  const lesson = await app.pool.query("INSERT INTO lessons (name) VALUES ('Other Teacher Lesson') RETURNING id");
  const otherClass = await app.pool.query(
    "INSERT INTO classes (campus_id,name,subject,grade,teacher_id,lesson_id) VALUES ($1,'Other Class','英语','三年级',$2,$3) RETURNING id",
    [seed.campusId, adminId, lesson.rows[0].id]
  );
  const otherStudent = await app.pool.query("INSERT INTO students (campus_id,name) VALUES ($1,'其他学员') RETURNING id", [seed.campusId]);
  await app.pool.query('INSERT INTO class_students (class_id,student_id,lesson_id,teacher_id) VALUES ($1,$2,$3,$4)', [otherClass.rows[0].id, otherStudent.rows[0].id, lesson.rows[0].id, adminId]);
  await app.pool.query(
    `INSERT INTO enrollments (student_id,lesson_id,campus_id,purchased_hours,used_hours,remaining_hours,total_fee,paid_fee,remaining_fee)
     VALUES ($1,$2,$3,10,0,10,440,440,440)`,
    [otherStudent.rows[0].id, lesson.rows[0].id, seed.campusId]
  );
  const otherSchedule = await app.pool.query(
    "INSERT INTO schedules (class_id,campus_id,schedule_date,start_time,end_time,teacher_id) VALUES ($1,$2,'2026-09-15','21:00','22:00',$3) RETURNING id",
    [otherClass.rows[0].id, seed.campusId, adminId]
  );
  const today = await app.inject({ method: 'GET', url: '/api/attendance/today?date=2026-09-15', headers: { authorization: `Bearer ${seed.teacherToken}` } });
  assert.equal(today.json().length, 1);
  const summary = await app.inject({ method: 'GET', url: '/api/attendance/summary', headers: { authorization: `Bearer ${seed.teacherToken}` } });
  assert.equal(summary.json().length, 1);
  const roster = await app.inject({ method: 'GET', url: `/api/attendance/students/${otherSchedule.rows[0].id}`, headers: { authorization: `Bearer ${seed.teacherToken}` } });
  assert.equal(roster.statusCode, 403);
  const record = await app.inject({ method: 'POST', url: `/api/attendance/record/${otherSchedule.rows[0].id}`, headers: { authorization: `Bearer ${seed.teacherToken}` }, payload: { records: [{ studentId: Number(otherStudent.rows[0].id), status: 'present' }] } });
  assert.equal(record.statusCode, 403);
});
