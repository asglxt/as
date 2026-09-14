import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { setupApp, seedBase } from './helpers.ts';

const app = await setupApp();
let seed: Awaited<ReturnType<typeof seedBase>>;
let targetId = 0;
let projectId = 0;
let examIds: number[] = [];
let classId = 0;

beforeEach(async () => {
  seed = await seedBase(app);
  const project = await app.pool.query("INSERT INTO exam_projects (name,sort) VALUES ('成长测评',1) RETURNING id");
  projectId = Number(project.rows[0].id);
  const exams = await app.pool.query("INSERT INTO exams (name,sort) VALUES ('第一次',1),('第二次',2),('第三次',3) RETURNING id");
  examIds = exams.rows.map((row) => Number(row.id));
  const classes = await app.pool.query(
    "INSERT INTO classes (campus_id,name,subject,grade,teacher_id) VALUES ($1,'成长一班','数学','三年级',(SELECT id FROM users WHERE username='teacher')),($1,'成长二班','数学','三年级',(SELECT id FROM users WHERE username='admin')) RETURNING id",
    [seed.campusId]
  );
  classId = Number(classes.rows[0].id);
  const otherClassId = Number(classes.rows[1].id);
  const students = await app.pool.query(
    "INSERT INTO students (campus_id,name) VALUES ($1,'目标学生'),($1,'同班甲'),($1,'同班乙'),($1,'同级甲') RETURNING id",
    [seed.campusId]
  );
  targetId = Number(students.rows[0].id);
  await app.pool.query('INSERT INTO class_students (class_id,student_id) VALUES ($1,$2),($1,$3),($1,$4),($5,$6)', [classId, targetId, students.rows[1].id, students.rows[2].id, otherClassId, students.rows[3].id]);
  const scoreSets = [
    [targetId, [70, 82, 91], classId],
    [students.rows[1].id, [80, 85, 88], classId],
    [students.rows[2].id, [75, 78, 80], classId],
    [students.rows[3].id, [95, 96, 97], otherClassId]
  ] as const;
  for (const [studentId, scores, scoreClassId] of scoreSets) {
    for (let index = 0; index < scores.length; index += 1) {
      await app.pool.query(
        `INSERT INTO student_scores (student_id,project_id,exam_id,class_id,score,source,exam_date,created_by)
         VALUES ($1,$2,$3,$4,$5,'teacher',$6,(SELECT id FROM users WHERE username='teacher'))`,
        [studentId, projectId, examIds[index], scoreClassId, String(scores[index]), `2026-0${index + 1}-10`]
      );
    }
  }
});

test('student score analytics calculates growth, class rank and institution rank', async () => {
  const res = await app.inject({ method: 'GET', url: `/api/scores/analytics/student/${targetId}`, headers: { authorization: `Bearer ${seed.adminToken}` } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().history.length, 3);
  assert.equal(res.json().history[2].class_rank, 1);
  assert.equal(res.json().history[2].class_size, 3);
  assert.equal(res.json().history[2].institution_rank, 2);
  assert.equal(res.json().history[2].institution_size, 4);
  assert.equal(res.json().history[2].delta, 9);
  assert.equal(res.json().summary.trend, 'up');
  assert.equal(res.json().summary.change, 9);
  assert.equal(res.json().summary.class_rank, 1);
  assert.equal(res.json().summary.institution_rank, 2);
  assert.ok(res.json().alerts.some((item: any) => item.type === 'improvement'));
});

test('student score analytics warns on sharp decline', async () => {
  const student = await app.pool.query("INSERT INTO students (campus_id,name) VALUES ($1,'下滑学生') RETURNING id", [seed.campusId]);
  await app.pool.query('INSERT INTO class_students (class_id,student_id) VALUES ($1,$2)', [classId, student.rows[0].id]);
  for (const [index, score] of [92, 82, 71].entries()) {
    await app.pool.query(
      `INSERT INTO student_scores (student_id,project_id,exam_id,class_id,score,source,exam_date,created_by)
       VALUES ($1,$2,$3,$4,$5,'teacher',$6,(SELECT id FROM users WHERE username='teacher'))`,
      [student.rows[0].id, projectId, examIds[index], classId, String(score), `2026-0${index + 1}-10`]
    );
  }
  const res = await app.inject({ method: 'GET', url: `/api/scores/analytics/student/${student.rows[0].id}`, headers: { authorization: `Bearer ${seed.adminToken}` } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().summary.trend, 'down');
  assert.equal(res.json().summary.change, -11);
  assert.ok(res.json().alerts.some((item: any) => item.type === 'decline' && item.level === 'danger'));
});

test('score analytics alerts list is scoped for teachers', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/scores/analytics/alerts', headers: { authorization: `Bearer ${seed.teacherToken}` } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().every((item: any) => Number(item.class_id) === classId), true);
});
