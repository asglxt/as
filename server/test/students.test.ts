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
    payload: {
      campusId: seed.campusId,
      name: '王小明',
      gender: '男',
      birthday: '2018-01-02',
      studentNo: 'SX2026001',
      schoolName: '实验小学',
      grade: '三年级',
      address: '幸福路88号',
      guardians: [
        { name: '王爸爸', relation: '父亲', phone: '13800000001', wechat: 'wang_dad', isPrimary: true, isEmergency: true },
        { name: '李妈妈', relation: '母亲', phone: '13800000002', wechat: 'li_mom', isEmergency: true }
      ]
    }
  });
  assert.equal(create.statusCode, 200);
  const detail = await app.inject({
    method: 'GET',
    url: `/api/students/${create.json().id}`,
    headers: { authorization: `Bearer ${seed.adminToken}` }
  });
  assert.equal(detail.statusCode, 200);
  assert.equal(detail.json().student.gender, '男');
  assert.equal(detail.json().student.student_no, 'SX2026001');
  assert.equal(detail.json().student.school_name, '实验小学');
  assert.equal(detail.json().student.address, '幸福路88号');
  assert.equal(detail.json().guardians.length, 2);
  assert.equal(detail.json().guardians[0].wechat, 'wang_dad');
  assert.equal(detail.json().guardians[0].is_emergency, true);
  assert.deepEqual(detail.json().growthRecords, []);
});

test('student saves course advisor and returns advisor name', async () => {
  const advisorId = (await app.pool.query("SELECT id FROM users WHERE username='teacher'")).rows[0].id;
  const create = await app.inject({
    method: 'POST', url: '/api/students', headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { campusId: seed.campusId, name: '顾问测试学员', advisorId }
  });
  assert.equal(create.statusCode, 200);
  assert.equal(Number(create.json().advisor_id), Number(advisorId));
  const detail = await app.inject({ method: 'GET', url: `/api/students/${create.json().id}`, headers: { authorization: `Bearer ${seed.adminToken}` } });
  assert.equal(detail.statusCode, 200);
  assert.equal(detail.json().student.advisor_name, '教师');
});

test('student detail exposes score source path', async () => {
  const create = await app.inject({
    method: 'POST',
    url: '/api/students',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { campusId: seed.campusId, name: '成绩来源测试' }
  });
  const studentId = create.json().id;
  const project = await app.pool.query("INSERT INTO exam_projects (name, sort) VALUES ('来源测试', 1) RETURNING id");
  const exam = await app.pool.query("INSERT INTO exams (name, sort) VALUES ('来源测试考试', 1) RETURNING id");
  const source = await app.pool.query(
    `SELECT child.id FROM score_sources child JOIN score_sources parent ON parent.id=child.parent_id
     WHERE parent.slug='institution' AND child.name='机构内测评' LIMIT 1`
  );
  await app.pool.query(
    `INSERT INTO student_scores (student_id, project_id, exam_id, class_id, score, source, source_id, exam_date)
     VALUES ($1,$2,$3,$4,'93','teacher',$5,'2026-01-10')`,
    [studentId, project.rows[0].id, exam.rows[0].id, classId, source.rows[0].id]
  );

  const detail = await app.inject({
    method: 'GET',
    url: `/api/students/${studentId}`,
    headers: { authorization: `Bearer ${seed.adminToken}` }
  });
  assert.equal(detail.statusCode, 200);
  assert.equal(detail.json().scores[0].source_path, '机构内 / 机构内测评');
  assert.equal(detail.json().scores[0].exam_date, '2026-01-10');
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

test('student list filters by class and guardian phone', async () => {
  const first = await app.inject({
    method: 'POST', url: '/api/students', headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { campusId: seed.campusId, name: '手机筛选甲', guardianPhone: '13812345678' }
  });
  await app.inject({
    method: 'POST', url: '/api/students', headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { campusId: seed.campusId, name: '手机筛选乙', guardianPhone: '13999999999' }
  });
  await app.inject({
    method: 'POST', url: `/api/students/${first.json().id}/classes`, headers: { authorization: `Bearer ${seed.adminToken}` }, payload: { classId }
  });
  const res = await app.inject({
    method: 'GET', url: `/api/students/list?classId=${classId}&phone=1234&page=1&pageSize=20`,
    headers: { authorization: `Bearer ${seed.adminToken}` }
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().items.length, 1);
  assert.equal(res.json().items[0].name, '手机筛选甲');
});

test('student list supports advisor, source and enrollment filters with profile completeness', async () => {
  const advisorId = (await app.pool.query("SELECT id FROM users WHERE username='teacher'")).rows[0].id;
  const create = await app.inject({
    method: 'POST',
    url: '/api/students',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: {
      campusId: seed.campusId,
      name: '完整档案学员',
      advisorId,
      source: '转介绍',
      enrollmentDate: '2026-08-01',
      birthday: '2015-05-06',
      schoolName: '实验小学',
      grade: '四年级',
      address: '海棠路 18 号',
      guardians: [{ name: '张妈妈', relation: '母亲', phone: '13812340000', isPrimary: true }]
    }
  });
  await app.inject({
    method: 'POST',
    url: '/api/students',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { campusId: seed.campusId, name: '待完善档案学员', source: '自然到访', enrollmentDate: '2025-01-01' }
  });

  const res = await app.inject({
    method: 'GET',
    url: `/api/students/list?advisorId=${advisorId}&source=${encodeURIComponent('转介绍')}&enrollmentStart=2026-07-01&enrollmentEnd=2026-08-31&page=1&pageSize=20`,
    headers: { authorization: `Bearer ${seed.adminToken}` }
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().items.length, 1);
  assert.equal(res.json().items[0].id, Number(create.json().id));
  assert.equal(res.json().items[0].primary_guardian_name, '张妈妈');
  assert.equal(res.json().items[0].primary_guardian_phone, '13812340000');
  assert.equal(res.json().items[0].profile_complete, true);
  assert.equal(Number(res.json().items[0].age) > 0, true);
});

test('batch update can assign advisor and writes an audit log', async () => {
  const advisorId = (await app.pool.query("SELECT id FROM users WHERE username='teacher'")).rows[0].id;
  const create = await app.inject({
    method: 'POST',
    url: '/api/students',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { campusId: seed.campusId, name: '批量跟进学员' }
  });
  const res = await app.inject({
    method: 'POST',
    url: '/api/students/batch',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { ids: [create.json().id], advisorId, status: 'inactive' }
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().count, 1);
  const row = await app.pool.query('SELECT advisor_id,status FROM students WHERE id=$1', [create.json().id]);
  assert.equal(Number(row.rows[0].advisor_id), Number(advisorId));
  assert.equal(row.rows[0].status, 'inactive');
  const audit = await app.pool.query("SELECT COUNT(*)::int AS count FROM audit_logs WHERE entity_type='student' AND entity_id=$1 AND action='student.batch_update'", [create.json().id]);
  assert.equal(audit.rows[0].count, 1);
});

test('student detail returns attendance records and operation logs', async () => {
  const create = await app.inject({
    method: 'POST',
    url: '/api/students',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { campusId: seed.campusId, name: '考勤记录学员' }
  });
  const studentId = create.json().id;
  const teacherId = (await app.pool.query("SELECT id FROM users WHERE username='teacher'")).rows[0].id;
  const teachingLog = await app.pool.query(
    `INSERT INTO teaching_logs (class_id,campus_id,teacher_id,status,taught_at,recorded_by,recorded_at)
     VALUES ($1,$2,$3,'recorded','2026-09-10 10:00:00+08',$3,now()) RETURNING id`,
    [classId, seed.campusId, teacherId]
  );
  await app.pool.query(
    `INSERT INTO attendance_records (teaching_log_id,student_id,status,hours_deducted,remark)
     VALUES ($1,$2,'present',1.5,'课堂表现积极')`,
    [teachingLog.rows[0].id, studentId]
  );

  const detail = await app.inject({ method: 'GET', url: `/api/students/${studentId}`, headers: { authorization: `Bearer ${seed.adminToken}` } });
  assert.equal(detail.statusCode, 200);
  assert.equal(detail.json().attendanceRecords.length, 1);
  assert.equal(detail.json().attendanceRecords[0].status, 'present');
  assert.equal(Number(detail.json().attendanceRecords[0].hours_deducted), 1.5);
  assert.ok(detail.json().auditLogs.some((item: any) => item.action === 'student.create'));
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
