import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { setupApp, seedBase } from './helpers.ts';

const app = await setupApp();
let seed: Awaited<ReturnType<typeof seedBase>>;
let targetId = 0;
let projectId = 0;
let examIds: number[] = [];
let classId = 0;
let sourceIds: number[] = [];

beforeEach(async () => {
  seed = await seedBase(app);
  const sources = await app.pool.query(
    `SELECT parent.slug, child.id FROM score_sources child JOIN score_sources parent ON parent.id=child.parent_id
     WHERE (parent.slug='institution' AND child.name='月考')
        OR (parent.slug='school' AND child.name='单元考试')
        OR (parent.slug='third_party' AND child.name='等级考试')`
  );
  const sourceBySlug = new Map(sources.rows.map((row) => [row.slug, Number(row.id)]));
  sourceIds = ['institution', 'school', 'third_party'].map((slug) => sourceBySlug.get(slug)!);
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
        `INSERT INTO student_scores (student_id,project_id,exam_id,class_id,score,source,source_id,exam_date,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,(SELECT id FROM users WHERE username='teacher'))`,
        [studentId, projectId, examIds[index], scoreClassId, String(scores[index]), ['teacher', 'import', 'registration'][index], sourceIds[index], `2026-0${index + 1}-10`]
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
  assert.deepEqual([...new Set(res.json().history.map((item: any) => item.source_parent_slug))], ['institution', 'school', 'third_party']);
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

test('class exam ratings use the S, A+ and Qihang boundaries', async () => {
  const teacherId = (await app.pool.query("SELECT id FROM users WHERE username='teacher'")).rows[0].id;
  const ratingClasses = await app.pool.query(
    "INSERT INTO classes (campus_id,name,subject,grade,teacher_id) VALUES ($1,'评级S班','数学','四年级',$2),($1,'评级A班','数学','四年级',$2),($1,'评级启航班','数学','四年级',$2) RETURNING id",
    [seed.campusId, teacherId]
  );
  const students = await app.pool.query(
    "INSERT INTO students (campus_id,name) VALUES ($1,'S甲'),($1,'S乙'),($1,'A甲'),($1,'A乙'),($1,'Q甲'),($1,'Q乙') RETURNING id",
    [seed.campusId]
  );
  const ids = students.rows.map((row) => Number(row.id));
  await app.pool.query(
    'INSERT INTO class_students (class_id,student_id) VALUES ($1,$4),($1,$5),($2,$6),($2,$7),($3,$8),($3,$9)',
    [ratingClasses.rows[0].id, ratingClasses.rows[1].id, ratingClasses.rows[2].id, ...ids]
  );
  const scoreSets = [
    [ratingClasses.rows[0].id, ids[0], 96], [ratingClasses.rows[0].id, ids[1], 95],
    [ratingClasses.rows[1].id, ids[2], 94], [ratingClasses.rows[1].id, ids[3], 90],
    [ratingClasses.rows[2].id, ids[4], 89.9], [ratingClasses.rows[2].id, ids[5], 88]
  ] as const;
  for (const [scoreClassId, studentId, score] of scoreSets) {
    await app.pool.query(
      `INSERT INTO student_scores (student_id,project_id,exam_id,class_id,score,source,exam_date,created_by)
       VALUES ($1,$2,$3,$4,$5,'teacher','2026-09-20',(SELECT id FROM users WHERE username='teacher'))`,
      [studentId, projectId, examIds[0], scoreClassId, String(score)]
    );
  }
  const res = await app.inject({ method: 'GET', url: '/api/scores/analytics/class-ratings', headers: { authorization: `Bearer ${seed.adminToken}` } });
  assert.equal(res.statusCode, 200);
  const byClass = new Map(res.json().rows.map((row: any) => [row.class_name, row.rating]));
  assert.equal(byClass.get('评级S班'), 'S班');
  assert.equal(byClass.get('评级A班'), 'A+班');
  assert.equal(byClass.get('评级启航班'), '启航班');
  const teacherView = await app.inject({ method: 'GET', url: '/api/scores/analytics/class-ratings', headers: { authorization: `Bearer ${seed.teacherToken}` } });
  assert.equal(teacherView.statusCode, 200);
  assert.equal(teacherView.json().rows.every((row: any) => Number(row.teacher_id) === Number(teacherId)), true);
});
