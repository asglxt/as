import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { setupApp, seedBase } from './helpers.ts';

const app = await setupApp();
let seed: Awaited<ReturnType<typeof seedBase>>;

beforeEach(async () => {
  seed = await seedBase(app);
});

test('organization tree exposes campus departments and staff', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/organization/tree', headers: { authorization: `Bearer ${seed.adminToken}` } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().campuses.length, 1);
  assert.ok(res.json().departments.some((item: any) => item.name === '教学部'));
  assert.ok(res.json().departments.some((item: any) => item.name === '英语教研组'));
  assert.ok(res.json().members.some((item: any) => item.username === 'admin'));
  assert.ok(res.json().members.some((item: any) => item.username === 'teacher'));
});

test('admin creates child department and assigns a member', async () => {
  const tree = await app.inject({ method: 'GET', url: '/api/organization/tree', headers: { authorization: `Bearer ${seed.adminToken}` } });
  const teaching = tree.json().departments.find((item: any) => Number(item.campus_id) === Number(seed.campusId) && item.name === '教学部');
  const create = await app.inject({
    method: 'POST',
    url: '/api/organization/departments',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { campusId: seed.campusId, parentId: teaching.id, name: '竞赛教研组', code: 'COMPETITION' }
  });
  assert.equal(create.statusCode, 200);
  const teacherId = tree.json().members.find((item: any) => item.username === 'teacher').id;
  const assign = await app.inject({
    method: 'PATCH',
    url: `/api/organization/members/${teacherId}`,
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { departmentId: create.json().id, positionTitle: '竞赛教师' }
  });
  assert.equal(assign.statusCode, 200);
  const updated = await app.inject({ method: 'GET', url: '/api/organization/tree', headers: { authorization: `Bearer ${seed.adminToken}` } });
  const teacher = updated.json().members.find((item: any) => item.username === 'teacher');
  assert.equal(Number(teacher.department_id), Number(create.json().id));
  assert.equal(teacher.position_title, '竞赛教师');
});

test('department with staff cannot be deleted', async () => {
  const tree = await app.inject({ method: 'GET', url: '/api/organization/tree', headers: { authorization: `Bearer ${seed.adminToken}` } });
  const teaching = tree.json().departments.find((item: any) => Number(item.campus_id) === Number(seed.campusId) && item.name === '教学部');
  const teacherId = tree.json().members.find((item: any) => item.username === 'teacher').id;
  await app.inject({
    method: 'PATCH',
    url: `/api/organization/members/${teacherId}`,
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { departmentId: teaching.id, positionTitle: '教师' }
  });
  const res = await app.inject({ method: 'DELETE', url: `/api/organization/departments/${teaching.id}`, headers: { authorization: `Bearer ${seed.adminToken}` } });
  assert.equal(res.statusCode, 409);
});
