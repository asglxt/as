import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupApp, seedBase } from './helpers.ts';

const app = await setupApp();
let seed: Awaited<ReturnType<typeof seedBase>>;

beforeEach(async () => {
  seed = await seedBase(app);
});

test('admin has full module access', async () => {
  const res = await app.inject({
    method: 'GET',
    url: '/api/roles/my-permissions',
    headers: { authorization: `Bearer ${seed.adminToken}` }
  });
  assert.equal(res.statusCode, 200);
  assert.ok(res.json().modules.includes('lessons'));
  assert.ok(res.json().modules.includes('schedules'));
});

test('teacher only has teacher modules', async () => {
  const res = await app.inject({
    method: 'GET',
    url: '/api/roles/my-permissions',
    headers: { authorization: `Bearer ${seed.teacherToken}` }
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json().modules.sort(), ['attendance', 'classes', 'comments', 'dashboard', 'homework', 'schedules', 'scores']);
});
test('admin creates role with modules and campuses', async () => {
  const create = await app.inject({
    method: 'POST',
    url: '/api/roles',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { name: '教务助理', modules: ['dashboard', 'classes', 'schedules'], campusIds: [seed.campusId] }
  });
  assert.equal(create.statusCode, 200);
  const roleId = create.json().id;
  const detail = await app.inject({
    method: 'GET',
    url: `/api/roles/${roleId}`,
    headers: { authorization: `Bearer ${seed.adminToken}` }
  });
  assert.deepEqual(detail.json().modules.sort(), ['classes', 'dashboard', 'schedules']);
  assert.deepEqual(detail.json().campusIds, [seed.campusId]);
});

test('assign role to teacher changes permissions', async () => {
  const create = await app.inject({
    method: 'POST',
    url: '/api/roles',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { name: '课程管理员', modules: ['dashboard', 'lessons'], campusIds: [] }
  });
  const roleId = create.json().id;
  const teacherId = (await app.pool.query("SELECT id FROM users WHERE username = 'teacher'")).rows[0].id;
  const assign = await app.inject({
    method: 'POST',
    url: `/api/roles/assign/${teacherId}`,
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { roleIds: [roleId] }
  });
  assert.equal(assign.statusCode, 200);
  const perms = await app.inject({
    method: 'GET',
    url: '/api/roles/my-permissions',
    headers: { authorization: `Bearer ${seed.teacherToken}` }
  });
  assert.deepEqual(perms.json().modules.sort(), ['dashboard', 'lessons']);
});

test('permission groups expose business centers', async () => {
  const res = await app.inject({
    method: 'GET',
    url: '/api/roles/permission-groups',
    headers: { authorization: `Bearer ${seed.adminToken}` }
  });
  assert.equal(res.statusCode, 200);
  assert.ok(res.json().some((group: any) => group.key === 'teaching'));
  assert.ok(res.json().find((group: any) => group.key === 'teaching').modules.length > 0);
});

test('staff list includes multiple roles', async () => {
  const role = await app.inject({
    method: 'POST',
    url: '/api/roles',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { name: '校务助理', modules: ['dashboard', 'students'], campusIds: [] }
  });
  const teacherId = (await app.pool.query("SELECT id FROM users WHERE username = 'teacher'")).rows[0].id;
  await app.inject({
    method: 'POST',
    url: `/api/roles/assign/${teacherId}`,
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { roleIds: [role.json().id] }
  });
  const res = await app.inject({
    method: 'GET',
    url: '/api/roles/staff',
    headers: { authorization: `Bearer ${seed.adminToken}` }
  });
  assert.equal(res.statusCode, 200);
  const teacher = res.json().find((item: any) => item.username === 'teacher');
  assert.deepEqual(teacher.roles.map((item: any) => item.name), ['校务助理']);
});

test('staff update replaces roles and employee profile', async () => {
  const role = await app.inject({
    method: 'POST',
    url: '/api/roles',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { name: '人事助理', modules: ['dashboard', 'employees'], campusIds: [] }
  });
  const teacherId = (await app.pool.query("SELECT id FROM users WHERE username = 'teacher'")).rows[0].id;
  const res = await app.inject({
    method: 'PATCH',
    url: `/api/roles/staff/${teacherId}`,
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { department: '教学部', isTeacher: true, employmentStatus: 'active', roleIds: [role.json().id] }
  });
  assert.equal(res.statusCode, 200);
  const row = await app.pool.query('SELECT department, is_teacher, employment_status FROM users WHERE id = $1', [teacherId]);
  assert.equal(row.rows[0].department, '教学部');
  assert.equal(row.rows[0].is_teacher, true);
});
