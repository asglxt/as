import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupApp, seedBase } from './helpers.ts';

const app = await setupApp();
let seed: Awaited<ReturnType<typeof seedBase>>;
let classId = 0;

beforeEach(async () => {
  seed = await seedBase(app);
  const teacherId = (await app.pool.query("SELECT id FROM users WHERE username = 'teacher'")).rows[0].id;
  const create = await app.inject({
    method: 'POST',
    url: '/api/classes',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { campusId: seed.campusId, name: '三年级英语1班', subject: '英语', grade: '三年级', teacherId }
  });
  classId = create.json().id;
});

test('admin creates student and enrolls into class', async () => {
  const create = await app.inject({
    method: 'POST',
    url: '/api/students',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { campusId: seed.campusId, name: '张三', guardianPhone: '13800000000' }
  });
  assert.equal(create.statusCode, 200);
  const studentId = create.json().id;
  const enroll = await app.inject({
    method: 'POST',
    url: `/api/students/${studentId}/classes`,
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { classId }
  });
  assert.equal(enroll.statusCode, 200);
  const teacherList = await app.inject({
    method: 'GET',
    url: '/api/students',
    headers: { authorization: `Bearer ${seed.teacherToken}` }
  });
  assert.equal(teacherList.json().length, 1);
  assert.equal(teacherList.json()[0].name, '张三');
});

test('transfer moves student between classes', async () => {
  const create2 = await app.inject({
    method: 'POST',
    url: '/api/classes',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { campusId: seed.campusId, name: '三年级英语2班', subject: '英语', grade: '三年级' }
  });
  const student = await app.pool.query("INSERT INTO students (campus_id, name) VALUES ($1, '李四') RETURNING id", [seed.campusId]);
  const studentId = student.rows[0].id;
  await app.pool.query('INSERT INTO class_students (class_id, student_id) VALUES ($1, $2)', [classId, studentId]);
  const res = await app.inject({
    method: 'POST',
    url: `/api/students/${studentId}/transfer`,
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { fromClassId: classId, toClassId: create2.json().id }
  });
  assert.equal(res.statusCode, 200);
  const oldRow = await app.pool.query('SELECT left_at FROM class_students WHERE class_id = $1 AND student_id = $2', [classId, studentId]);
  assert.ok(oldRow.rows[0].left_at);
});

test('student detail returns guardians and growth records', async () => {
  const create = await app.inject({
    method: 'POST',
    url: '/api/students',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { campusId: seed.campusId, name: '王小明', gender: '男', birthday: '2018-01-02' }
  });
  assert.equal(create.statusCode, 200);
  const detail = await app.inject({
    method: 'GET',
    url: `/api/students/${create.json().id}`,
    headers: { authorization: `Bearer ${seed.adminToken}` }
  });
  assert.equal(detail.statusCode, 200);
  assert.equal(detail.json().student.gender, '男');
  assert.deepEqual(detail.json().guardians, []);
  assert.deepEqual(detail.json().growthRecords, []);
});

test('student list filters by keyword and returns pagination summary', async () => {
  await app.inject({
    method: 'POST',
    url: '/api/students',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { campusId: seed.campusId, name: '张三' }
  });
  await app.inject({
    method: 'POST',
    url: '/api/students',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { campusId: seed.campusId, name: '李四' }
  });
  const res = await app.inject({
    method: 'GET',
    url: '/api/students/list?keyword=张&page=1&pageSize=20',
    headers: { authorization: `Bearer ${seed.adminToken}` }
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().items.length, 1);
  assert.equal(res.json().items[0].name, '张三');
  assert.equal(res.json().total, 1);
  assert.equal(res.json().page, 1);
});

test('batch update changes student status', async () => {
  const create = await app.inject({
    method: 'POST',
    url: '/api/students',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { campusId: seed.campusId, name: '批量学员' }
  });
  const res = await app.inject({
    method: 'POST',
    url: '/api/students/batch',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { ids: [create.json().id], status: 'inactive' }
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().count, 1);
  const row = await app.pool.query('SELECT status FROM students WHERE id = $1', [create.json().id]);
  assert.equal(row.rows[0].status, 'inactive');
});
