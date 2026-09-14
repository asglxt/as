import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { setupApp, seedBase } from './helpers.ts';
import { hashPassword } from '../src/auth/password.ts';

const app = await setupApp();
let seed: Awaited<ReturnType<typeof seedBase>>;
let teacherId = 0;
let classId = 0;
let scheduleId = 0;
let studentIds: number[] = [];
let enrollmentIds: number[] = [];
let otherToken = '';

beforeEach(async () => {
  seed = await seedBase(app);
  const teacher = await app.pool.query("SELECT id FROM users WHERE username = 'teacher'");
  teacherId = Number(teacher.rows[0].id);
  const lesson = await app.pool.query("INSERT INTO lessons (name) VALUES ('移动端测试课程') RETURNING id");
  const classRow = await app.pool.query(
    "INSERT INTO classes (campus_id, name, subject, grade, teacher_id, lesson_id, capacity) VALUES ($1,'GC-01教室-初级','英语','初级',$2,$3,20) RETURNING id",
    [seed.campusId, teacherId, lesson.rows[0].id]
  );
  classId = Number(classRow.rows[0].id);
  const students = await app.pool.query(
    "INSERT INTO students (campus_id,name,guardian_phone) VALUES ($1,'王小明','13800000001'),($1,'李小红','13800000002') RETURNING id",
    [seed.campusId]
  );
  studentIds = students.rows.map((row) => Number(row.id));
  await app.pool.query(
    "INSERT INTO class_students (class_id,student_id,lesson_id,teacher_id,status) VALUES ($1,$2,$3,$4,'active'),($1,$5,$3,$4,'active')",
    [classId, studentIds[0], lesson.rows[0].id, teacherId, studentIds[1]]
  );
  const enrollments = await app.pool.query(
    `INSERT INTO enrollments (student_id,lesson_id,campus_id,purchased_hours,used_hours,remaining_hours,total_fee,paid_fee,remaining_fee,unit_price)
     VALUES ($1,$3,$4,10,0,10,1000,1000,1000,100),($2,$3,$4,10,0,10,1000,1000,1000,100) RETURNING id`,
    [studentIds[0], studentIds[1], lesson.rows[0].id, seed.campusId]
  );
  enrollmentIds = enrollments.rows.map((row) => Number(row.id));
  const schedule = await app.pool.query(
    "INSERT INTO schedules (class_id,campus_id,schedule_date,start_time,end_time,teacher_id,created_by) VALUES ($1,$2,CURRENT_DATE,'10:00','11:30',$3,$3) RETURNING id",
    [classId, seed.campusId, teacherId]
  );
  scheduleId = Number(schedule.rows[0].id);
  const otherPassword = await hashPassword('other123');
  await app.pool.query(
    "INSERT INTO users (username,password_hash,display_name,role,campus_id) VALUES ('other',$1,'其他老师','teacher',$2)",
    [otherPassword, seed.campusId]
  );
  const otherLogin = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'other', password: 'other123' } });
  otherToken = otherLogin.json().token;
});

test('teacher mobile overview only returns own classes and today tasks', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/teacher-mobile/overview', headers: { authorization: `Bearer ${seed.teacherToken}` } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().classes.length, 1);
  assert.equal(res.json().today.length, 1);
  assert.equal(res.json().stats.students, 2);
  assert.equal(res.json().stats.pendingAttendance, 1);
});

test('teacher mobile attendance deducts hours for present students only', async () => {
  const roster = await app.inject({ method: 'GET', url: `/api/teacher-mobile/attendance/${scheduleId}/roster`, headers: { authorization: `Bearer ${seed.teacherToken}` } });
  assert.equal(roster.statusCode, 200);
  assert.equal(roster.json().length, 2);

  const saved = await app.inject({
    method: 'POST', url: `/api/teacher-mobile/attendance/${scheduleId}/record`,
    headers: { authorization: `Bearer ${seed.teacherToken}` },
    payload: { records: [{ studentId: studentIds[0], status: 'present' }, { studentId: studentIds[1], status: 'leave' }] }
  });
  assert.equal(saved.statusCode, 200);
  const rows = await app.pool.query('SELECT id,remaining_hours FROM enrollments WHERE id = ANY($1::bigint[]) ORDER BY id', [enrollmentIds]);
  assert.equal(Number(rows.rows[0].remaining_hours), 9);
  assert.equal(Number(rows.rows[1].remaining_hours), 10);
});

test('teacher mobile publishes homework and reviews submitted work', async () => {
  const created = await app.inject({
    method: 'POST', url: '/api/teacher-mobile/homework',
    headers: { authorization: `Bearer ${seed.teacherToken}` },
    payload: { classId, title: '移动端作业', content: '完成练习一', status: 'published' }
  });
  assert.equal(created.statusCode, 200);
  await app.pool.query("UPDATE homework_records SET status='submitted', content='已提交' WHERE homework_id=$1 AND student_id=$2", [created.json().id, studentIds[0]]);
  const reviewed = await app.inject({
    method: 'POST', url: `/api/teacher-mobile/homework/${created.json().id}/records/${studentIds[0]}/review`,
    headers: { authorization: `Bearer ${seed.teacherToken}` },
    payload: { score: '95', comment: '完成很好' }
  });
  assert.equal(reviewed.statusCode, 200);
  const record = await app.pool.query('SELECT status,score,comment FROM homework_records WHERE homework_id=$1 AND student_id=$2', [created.json().id, studentIds[0]]);
  assert.equal(record.rows[0].status, 'reviewed');
  assert.equal(record.rows[0].score, '95');
});

test('teacher mobile saves scores for own class', async () => {
  const projects = await app.inject({ method: 'GET', url: '/api/teacher-mobile/scores/dictionaries', headers: { authorization: `Bearer ${seed.teacherToken}` } });
  assert.equal(projects.statusCode, 200);
  const saved = await app.inject({
    method: 'POST', url: '/api/teacher-mobile/scores/bulk',
    headers: { authorization: `Bearer ${seed.teacherToken}` },
    payload: {
      classId, projectId: projects.json().projects[0].id, examId: projects.json().exams[0].id,
      examDate: '2026-09-14', scores: [{ studentId: studentIds[0], score: '92', remark: '进步明显' }]
    }
  });
  assert.equal(saved.statusCode, 200);
  assert.equal(saved.json().count, 1);
  const score = await app.pool.query('SELECT score FROM student_scores WHERE student_id=$1 AND class_id=$2', [studentIds[0], classId]);
  assert.equal(Number(score.rows[0].score), 92);
});

test('teacher mobile hour adjustment is restricted to own class', async () => {
  const own = await app.inject({
    method: 'POST', url: `/api/teacher-mobile/hours/${enrollmentIds[0]}/adjust`,
    headers: { authorization: `Bearer ${seed.teacherToken}` }, payload: { hours: -1, remark: '移动端划扣' }
  });
  assert.equal(own.statusCode, 200);
  assert.equal(Number(own.json().remaining_hours), 9);
  const forbidden = await app.inject({
    method: 'POST', url: `/api/teacher-mobile/hours/${enrollmentIds[1]}/adjust`,
    headers: { authorization: `Bearer ${otherToken}` }, payload: { hours: -1, remark: '越权划扣' }
  });
  assert.equal(forbidden.statusCode, 403);
});
