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

test('class detail returns teacher, course and student roster with access control', async () => {
  const teacherId = (await app.pool.query("SELECT id FROM users WHERE username = 'teacher'")).rows[0].id;
  const lesson = await app.pool.query("INSERT INTO lessons (name) VALUES ('班级详情课程') RETURNING id");
  const created = await app.inject({
    method: 'POST', url: '/api/classes', headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { campusId: seed.campusId, name: '详情测试班', subject: '英语', grade: '五年级', teacherId, lessonId: lesson.rows[0].id, schedule: '每周六 09:00-10:30' }
  });
  const student = await app.pool.query("INSERT INTO students (campus_id,name,guardian_phone) VALUES ($1,'详情学员','13800001111') RETURNING id", [seed.campusId]);
  await app.pool.query('INSERT INTO class_students (class_id,student_id) VALUES ($1,$2)', [created.json().id, student.rows[0].id]);

  const adminView = await app.inject({ method: 'GET', url: `/api/classes/${created.json().id}`, headers: { authorization: `Bearer ${seed.adminToken}` } });
  assert.equal(adminView.statusCode, 200);
  assert.equal(adminView.json().class.name, '详情测试班');
  assert.equal(adminView.json().class.teacher_name, '教师');
  assert.equal(adminView.json().class.lesson_name, '班级详情课程');
  assert.equal(adminView.json().students.length, 1);
  assert.equal(adminView.json().students[0].name, '详情学员');

  const teacherView = await app.inject({ method: 'GET', url: `/api/classes/${created.json().id}`, headers: { authorization: `Bearer ${seed.teacherToken}` } });
  assert.equal(teacherView.statusCode, 200);
  const otherClass = await app.pool.query("INSERT INTO classes (campus_id,name,subject,grade) VALUES ($1,'无权查看班','数学','五年级') RETURNING id", [seed.campusId]);
  const forbidden = await app.inject({ method: 'GET', url: `/api/classes/${otherClass.rows[0].id}`, headers: { authorization: `Bearer ${seed.teacherToken}` } });
  assert.equal(forbidden.statusCode, 403);
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

test('class list returns filters and summary statistics', async () => {
  const teacherId = (await app.pool.query("SELECT id FROM users WHERE username = 'teacher'")).rows[0].id;
  const created = await app.inject({
    method: 'POST', url: '/api/classes',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { campusId: seed.campusId, name: '列表测试班', subject: '英语', grade: '三年级', teacherId, capacity: 16, recruitStatus: 'recruiting' }
  });
  const student = await app.pool.query("INSERT INTO students (campus_id, name) VALUES ($1, '班级学员') RETURNING id", [seed.campusId]);
  await app.pool.query('INSERT INTO class_students (class_id, student_id) VALUES ($1, $2)', [created.json().id, student.rows[0].id]);
  const res = await app.inject({
    method: 'GET', url: `/api/classes/list?keyword=${encodeURIComponent('列表测试班')}&campusId=${seed.campusId}&page=1&pageSize=20`,
    headers: { authorization: `Bearer ${seed.adminToken}` }
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().items[0].name, '列表测试班');
  assert.equal(res.json().summary.classes, 1);
  assert.equal(res.json().summary.students, 1);
});

test('class batch assignment adds multiple students and remove closes membership', async () => {
  const teacherId = (await app.pool.query("SELECT id FROM users WHERE username = 'teacher'")).rows[0].id;
  const cls = await app.pool.query(
    "INSERT INTO classes (campus_id, name, subject, grade, teacher_id) VALUES ($1,'批量分班班','英语','三年级',$2) RETURNING id",
    [seed.campusId, teacherId]
  );
  const students = await app.pool.query("INSERT INTO students (campus_id, name) VALUES ($1,'批量一'),($1,'批量二') RETURNING id", [seed.campusId]);
  const ids = students.rows.map((row) => Number(row.id));
  const assign = await app.inject({
    method: 'POST', url: `/api/classes/${cls.rows[0].id}/students/batch`,
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { studentIds: ids }
  });
  assert.equal(assign.statusCode, 200);
  assert.equal(assign.json().count, 2);
  const remove = await app.inject({
    method: 'DELETE', url: `/api/classes/${cls.rows[0].id}/students/${ids[0]}`,
    headers: { authorization: `Bearer ${seed.adminToken}` }
  });
  assert.equal(remove.statusCode, 200);
  const memberships = await app.pool.query('SELECT * FROM class_students WHERE class_id = $1 ORDER BY student_id', [cls.rows[0].id]);
  assert.equal(memberships.rows.filter((row) => row.left_at === null).length, 1);
});
