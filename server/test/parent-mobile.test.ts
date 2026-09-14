import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { setupApp, seedBase } from './helpers.ts';
import { hashPassword } from '../src/auth/password.ts';

const app = await setupApp();
let seed: Awaited<ReturnType<typeof seedBase>>;
let parentToken = '';
let childIds: number[] = [];
let homeworkRecordId = 0;
let commentId = 0;

beforeEach(async () => {
  seed = await seedBase(app);
  const children = await app.pool.query(
    "INSERT INTO students (campus_id,name,guardian_phone) VALUES ($1,'孩子甲','13811110001'),($1,'孩子乙','13811110002'),($1,'未绑定孩子','13811110003') RETURNING id",
    [seed.campusId]
  );
  childIds = children.rows.map((row) => Number(row.id));
  const passwordHash = await hashPassword('parent123');
  const parent = await app.pool.query(
    "INSERT INTO users (username,password_hash,display_name,role,campus_id) VALUES ('parent-mobile',$1,'家长测试','parent',$2) RETURNING id",
    [passwordHash, seed.campusId]
  );
  await app.pool.query('INSERT INTO parent_bindings (parent_user_id,student_id) VALUES ($1,$2),($1,$3)', [parent.rows[0].id, childIds[0], childIds[1]]);
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'parent-mobile', password: 'parent123' } });
  parentToken = login.json().token;

  await app.pool.query("INSERT INTO student_accounts (student_id,balance,points) VALUES ($1,120,8),($2,500,20)", [childIds[0], childIds[1]]);
  await app.pool.query("INSERT INTO orders (order_no,student_id,order_type,campus_id,receivable,received,arrears,payment_status) VALUES ('PM-001',$1,'material',$3,120,120,0,'paid'),('PM-002',$2,'enroll',$3,500,500,0,'paid')", [childIds[0], childIds[1], seed.campusId]);

  const lesson = await app.pool.query("INSERT INTO lessons (name) VALUES ('家长端课程') RETURNING id");
  const classRow = await app.pool.query("INSERT INTO classes (campus_id,name,subject,grade,lesson_id) VALUES ($1,'家长端班级','英语','初级',$2) RETURNING id", [seed.campusId, lesson.rows[0].id]);
  await app.pool.query('INSERT INTO class_students (class_id,student_id,lesson_id) VALUES ($1,$2,$3)', [classRow.rows[0].id, childIds[0], lesson.rows[0].id]);
  const hw = await app.pool.query("INSERT INTO homework (class_id,title,content,status,assigned_at) VALUES ($1,'家长端作业','完成练习','published',now()) RETURNING id", [classRow.rows[0].id]);
  const record = await app.pool.query('INSERT INTO homework_records (homework_id,student_id) VALUES ($1,$2) RETURNING id', [hw.rows[0].id, childIds[0]]);
  homeworkRecordId = Number(record.rows[0].id);
  await app.pool.query(
    "INSERT INTO student_scores (student_id,project_id,exam_id,class_id,score,source,exam_date) SELECT $1,id,(SELECT id FROM exams LIMIT 1),$2,91,'teacher',CURRENT_DATE FROM exam_projects LIMIT 1",
    [childIds[0], classRow.rows[0].id]
  );
  const schedule = await app.pool.query("INSERT INTO schedules (class_id,campus_id,schedule_date,start_time,end_time) VALUES ($1,$2,CURRENT_DATE,'09:00','10:00') RETURNING id", [classRow.rows[0].id, seed.campusId]);
  const log = await app.pool.query("INSERT INTO teaching_logs (schedule_id,class_id,campus_id,status,taught_at) VALUES ($1,$2,$3,'recorded',now()) RETURNING id", [schedule.rows[0].id, classRow.rows[0].id, seed.campusId]);
  const comment = await app.pool.query("INSERT INTO teaching_comments (teaching_log_id,student_id,rating,content,flowers) VALUES ($1,$2,5,'表现优秀',2) RETURNING id", [log.rows[0].id, childIds[0]]);
  commentId = Number(comment.rows[0].id);
});

test('parent mobile overview returns bound children and selected child summary', async () => {
  const first = await app.inject({ method: 'GET', url: '/api/parent-mobile/overview', headers: { authorization: `Bearer ${parentToken}` } });
  assert.equal(first.statusCode, 200);
  assert.equal(first.json().children.length, 2);
  assert.equal(first.json().selectedChild.name, '孩子甲');
  assert.equal(first.json().stats.balance, 120);
  assert.equal(first.json().stats.pendingHomework, 1);
  assert.equal(first.json().stats.unreadComments, 1);
});

test('parent mobile scores and comments follow selected child', async () => {
  const scores = await app.inject({ method: 'GET', url: `/api/parent-mobile/scores?studentId=${childIds[0]}`, headers: { authorization: `Bearer ${parentToken}` } });
  assert.equal(scores.statusCode, 200);
  assert.equal(scores.json().scores.length, 1);
  const comments = await app.inject({ method: 'GET', url: `/api/parent-mobile/comments?studentId=${childIds[0]}`, headers: { authorization: `Bearer ${parentToken}` } });
  assert.equal(comments.statusCode, 200);
  assert.equal(comments.json().length, 1);
  const other = await app.inject({ method: 'GET', url: `/api/parent-mobile/scores?studentId=${childIds[2]}`, headers: { authorization: `Bearer ${parentToken}` } });
  assert.equal(other.statusCode, 403);
});

test('parent mobile can submit homework and mark comments read', async () => {
  const submitted = await app.inject({ method: 'POST', url: `/api/parent-mobile/homework/${homeworkRecordId}/submit`, headers: { authorization: `Bearer ${parentToken}` }, payload: { content: '家长协助提交' } });
  assert.equal(submitted.statusCode, 200);
  const record = await app.pool.query('SELECT status,content FROM homework_records WHERE id=$1', [homeworkRecordId]);
  assert.equal(record.rows[0].status, 'submitted');
  const read = await app.inject({ method: 'POST', url: `/api/parent-mobile/comments/${commentId}/read`, headers: { authorization: `Bearer ${parentToken}` } });
  assert.equal(read.statusCode, 200);
  const comment = await app.pool.query('SELECT read_at FROM teaching_comments WHERE id=$1', [commentId]);
  assert.ok(comment.rows[0].read_at);
});

test('parent mobile order and account view uses selected child', async () => {
  const result = await app.inject({ method: 'GET', url: `/api/parent-mobile/orders?studentId=${childIds[1]}`, headers: { authorization: `Bearer ${parentToken}` } });
  assert.equal(result.statusCode, 200);
  assert.equal(result.json().account.balance, 500);
  assert.equal(result.json().orders.length, 1);
  assert.equal(result.json().orders[0].order_no, 'PM-002');
});
