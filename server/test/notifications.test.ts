import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { setupApp, seedBase } from './helpers.ts';
import { hashPassword } from '../src/auth/password.ts';

const app = await setupApp();
let seed: Awaited<ReturnType<typeof seedBase>>;

beforeEach(async () => {
  seed = await seedBase(app);
});

test('notification templates can be created and listed', async () => {
  const created = await app.inject({
    method: 'POST',
    url: '/api/notifications/templates',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { name: '停课通知', title: '临时停课通知', content: '因天气原因临时停课。' }
  });
  assert.equal(created.statusCode, 200);

  const list = await app.inject({
    method: 'GET',
    url: '/api/notifications/templates',
    headers: { authorization: `Bearer ${seed.adminToken}` }
  });
  assert.equal(list.statusCode, 200);
  assert.equal(list.json().length, 1);
  assert.equal(list.json()[0].name, '停课通知');
});

test('reviewed campus notification records recipient reads', async () => {
  const created = await app.inject({
    method: 'POST',
    url: '/api/notifications',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: {
      title: '校区会议通知',
      content: '周五下午召开校区例会。',
      audienceType: 'campus',
      campusId: seed.campusId,
      status: 'pending'
    }
  });
  assert.equal(created.statusCode, 200);
  assert.equal(created.json().status, 'pending');

  const reviewed = await app.inject({
    method: 'POST',
    url: `/api/notifications/${created.json().id}/review`,
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { approved: true }
  });
  assert.equal(reviewed.statusCode, 200);

  const read = await app.inject({
    method: 'POST',
    url: `/api/notifications/${created.json().id}/read`,
    headers: { authorization: `Bearer ${seed.teacherToken}` }
  });
  assert.equal(read.statusCode, 200);

  const detail = await app.inject({
    method: 'GET',
    url: `/api/notifications/${created.json().id}`,
    headers: { authorization: `Bearer ${seed.adminToken}` }
  });
  assert.equal(detail.statusCode, 200);
  assert.equal(detail.json().notification.status, 'published');
  assert.equal(detail.json().notification.recipient_count, 2);
  assert.equal(detail.json().notification.read_count, 1);
  assert.equal(detail.json().notification.read_rate, 50);
  assert.equal(detail.json().recipients.length, 2);
});

test('class notification reaches class parent and can be recalled', async () => {
  const student = await app.pool.query(
    "INSERT INTO students (campus_id, name) VALUES ($1, '李同学') RETURNING id",
    [seed.campusId]
  );
  const teacher = await app.pool.query("SELECT id FROM users WHERE username = 'teacher'");
  const classRow = await app.pool.query(
    "INSERT INTO classes (campus_id, name, subject, grade, teacher_id) VALUES ($1, '三年级数学班', '数学', '三年级', $2) RETURNING id",
    [seed.campusId, teacher.rows[0].id]
  );
  await app.pool.query('INSERT INTO class_students (class_id, student_id) VALUES ($1, $2)', [classRow.rows[0].id, student.rows[0].id]);
  const parent = await app.pool.query(
    "INSERT INTO users (username, password_hash, display_name, role, campus_id) VALUES ('parent1', $1, '李同学家长', 'parent', $2) RETURNING id",
    [await hashPassword('parent123'), seed.campusId]
  );
  await app.pool.query('INSERT INTO parent_bindings (parent_user_id, student_id) VALUES ($1, $2)', [parent.rows[0].id, student.rows[0].id]);
  const parentLogin = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username: 'parent1', password: 'parent123' }
  });

  const created = await app.inject({
    method: 'POST',
    url: '/api/notifications',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: {
      title: '班级活动通知',
      content: '周六上午举行班级家长会。',
      audienceType: 'class',
      classIds: [classRow.rows[0].id],
      status: 'published'
    }
  });
  assert.equal(created.statusCode, 200);

  const mine = await app.inject({
    method: 'GET',
    url: '/api/notifications/mine',
    headers: { authorization: `Bearer ${parentLogin.json().token}` }
  });
  assert.equal(mine.statusCode, 200);
  assert.equal(mine.json().length, 1);
  assert.equal(mine.json()[0].title, '班级活动通知');

  const recalled = await app.inject({
    method: 'POST',
    url: `/api/notifications/${created.json().id}/recall`,
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { reason: '活动时间调整' }
  });
  assert.equal(recalled.statusCode, 200);

  const detail = await app.inject({
    method: 'GET',
    url: `/api/notifications/${created.json().id}`,
    headers: { authorization: `Bearer ${seed.adminToken}` }
  });
  assert.equal(detail.json().notification.status, 'recalled');
  assert.equal(detail.json().notification.recall_reason, '活动时间调整');
});

test('notification management is protected by module permission', async () => {
  const list = await app.inject({
    method: 'GET',
    url: '/api/notifications/list',
    headers: { authorization: `Bearer ${seed.teacherToken}` }
  });
  assert.equal(list.statusCode, 403);
});

test('published notification cannot be republished', async () => {
  const created = await app.inject({
    method: 'POST',
    url: '/api/notifications',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: {
      title: '已发布通知',
      content: '不能重复发布。',
      audienceType: 'campus',
      campusId: seed.campusId,
      status: 'published'
    }
  });
  assert.equal(created.statusCode, 200);

  const republished = await app.inject({
    method: 'POST',
    url: `/api/notifications/${created.json().id}/publish`,
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: {}
  });
  assert.equal(republished.statusCode, 409);
});
