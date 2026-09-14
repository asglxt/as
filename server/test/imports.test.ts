import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupApp, seedBase } from './helpers.ts';

const app = await setupApp();
let seed: Awaited<ReturnType<typeof seedBase>>;

beforeEach(async () => {
  seed = await seedBase(app);
});

test('import students from csv', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/imports/students',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: {
      csv: 'name,guardian_phone,campus_name\n张三,13800000000,测试校区\n李四,13900000000,测试校区'
    }
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().total_rows, 2);
  assert.equal(res.json().error_rows, 0);
  const students = await app.pool.query('SELECT COUNT(*) FROM students');
  assert.equal(Number(students.rows[0].count), 2);
});

test('import reports row errors for missing campus', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/imports/students',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { csv: 'name,guardian_phone,campus_name\n王五,,不存在校区' }
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().error_rows, 1);
  assert.equal(res.json().errors[0].column, 'campus_name');
});

test('import jobs are listed and queryable', async () => {
  const created = await app.inject({
    method: 'POST',
    url: '/api/imports/students',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { csv: 'name,guardian_phone,campus_name\n赵六,,测试校区' }
  });
  const jobId = created.json().id;
  const list = await app.inject({
    method: 'GET',
    url: '/api/imports',
    headers: { authorization: `Bearer ${seed.adminToken}` }
  });
  assert.equal(list.statusCode, 200);
  assert.ok(list.json().some((j: { id: number }) => j.id === jobId));
  const detail = await app.inject({
    method: 'GET',
    url: `/api/imports/${jobId}`,
    headers: { authorization: `Bearer ${seed.adminToken}` }
  });
  assert.equal(detail.statusCode, 200);
  assert.equal(detail.json().status, 'done');
});
test('import scores with new model and validation', async () => {
  const campusId = seed.campusId;
  const teacherId = (await app.pool.query("SELECT id FROM users WHERE username = 'teacher'")).rows[0].id;
  const lesson = await app.pool.query("INSERT INTO lessons (name) VALUES ('G1') RETURNING id");
  const cls = await app.pool.query(
    "INSERT INTO classes (campus_id, name, subject, grade, lesson_id, teacher_id) VALUES ($1,'G1A','英语','一年级',$2,$3) RETURNING id",
    [campusId, lesson.rows[0].id, teacherId]
  );
  const student = await app.pool.query("INSERT INTO students (campus_id, name) VALUES ($1,'导入学员') RETURNING id", [campusId]);
  await app.pool.query('INSERT INTO class_students (class_id, student_id) VALUES ($1, $2)', [cls.rows[0].id, student.rows[0].id]);
  const project = await app.pool.query('SELECT name FROM exam_projects ORDER BY id LIMIT 1');
  const exam = await app.pool.query('SELECT name FROM exams ORDER BY id LIMIT 1');
  const csv = `student_name,class_name,project_name,exam_name,exam_date,score,source,remark\n` +
    `导入学员,G1A,${project.rows[0].name},${exam.rows[0].name},2026-09-14,88,import,\n` +
    `不存在学员,G1A,${project.rows[0].name},${exam.rows[0].name},2026-09-14,90,import,`;
  const res = await app.inject({
    method: 'POST', url: '/api/imports/scores',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { csv }
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().total_rows, 2);
  assert.equal(res.json().error_rows, 1);
  assert.equal(res.json().errors[0].column, 'student_name');
  const rows = await app.pool.query('SELECT * FROM student_scores');
  assert.equal(rows.rowCount, 1);
  assert.equal(rows.rows[0].score, '88');
});