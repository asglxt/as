import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupApp, seedBase } from './helpers.ts';

const app = await setupApp();
let seed: Awaited<ReturnType<typeof seedBase>>;
let classId = 0;
let classroomId = 0;
let teacherId = 0;

beforeEach(async () => {
  seed = await seedBase(app);
  teacherId = (await app.pool.query("SELECT id FROM users WHERE username = 'teacher'")).rows[0].id;
  const cls = await app.inject({
    method: 'POST', url: '/api/classes',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { campusId: seed.campusId, name: 'G3D', subject: '英语', grade: '三年级', teacherId }
  });
  classId = cls.json().id;
  const room = await app.inject({
    method: 'POST', url: '/api/classrooms',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { campusId: seed.campusId, name: '8教室', capacity: 30 }
  });
  classroomId = room.json().id;
});

test('create schedule and list by week', async () => {
  const res = await app.inject({
    method: 'POST', url: '/api/schedules',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { classId, campusId: seed.campusId, date: '2026-09-15', startTime: '19:00', endTime: '20:30', teacherId, classroomId }
  });
  assert.equal(res.statusCode, 200);
  const list = await app.inject({
    method: 'GET', url: '/api/schedules?start=2026-09-14&end=2026-09-20',
    headers: { authorization: `Bearer ${seed.adminToken}` }
  });
  assert.equal(list.json().length, 1);
});

test('teacher conflict is rejected', async () => {
  await app.inject({
    method: 'POST', url: '/api/schedules',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { classId, campusId: seed.campusId, date: '2026-09-15', startTime: '19:00', endTime: '20:30', teacherId, classroomId }
  });
  const cls2 = await app.pool.query(
    "INSERT INTO classes (campus_id, name, subject, grade) VALUES ($1, 'G3E', '英语', '三年级') RETURNING id",
    [seed.campusId]
  );
  const conflict = await app.inject({
    method: 'POST', url: '/api/schedules',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { classId: cls2.rows[0].id, campusId: seed.campusId, date: '2026-09-15', startTime: '20:00', endTime: '21:00', teacherId }
  });
  assert.equal(conflict.statusCode, 409);
  assert.match(conflict.json().error, /教师/);
});

test('classroom conflict is rejected', async () => {
  await app.inject({
    method: 'POST', url: '/api/schedules',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { classId, campusId: seed.campusId, date: '2026-09-16', startTime: '19:00', endTime: '20:30', teacherId, classroomId }
  });
  const cls2 = await app.pool.query(
    "INSERT INTO classes (campus_id, name, subject, grade) VALUES ($1, 'G3F', '英语', '三年级') RETURNING id",
    [seed.campusId]
  );
  const conflict = await app.inject({
    method: 'POST', url: '/api/schedules',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { classId: cls2.rows[0].id, campusId: seed.campusId, date: '2026-09-16', startTime: '20:00', endTime: '21:00', classroomId }
  });
  assert.equal(conflict.statusCode, 409);
  assert.match(conflict.json().error, /教室/);
});

test('adjacent times are allowed', async () => {
  await app.inject({
    method: 'POST', url: '/api/schedules',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { classId, campusId: seed.campusId, date: '2026-09-17', startTime: '19:00', endTime: '20:30', teacherId }
  });
  const cls2 = await app.pool.query(
    "INSERT INTO classes (campus_id, name, subject, grade) VALUES ($1, 'G3G', '英语', '三年级') RETURNING id",
    [seed.campusId]
  );
  const ok = await app.inject({
    method: 'POST', url: '/api/schedules',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { classId: cls2.rows[0].id, campusId: seed.campusId, date: '2026-09-17', startTime: '20:30', endTime: '22:00', teacherId }
  });
  assert.equal(ok.statusCode, 200);
});