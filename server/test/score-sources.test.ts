import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { setupApp, seedBase } from './helpers.ts';

const app = await setupApp();
let seed: Awaited<ReturnType<typeof seedBase>>;

beforeEach(async () => {
  seed = await seedBase(app);
});

test('score sources expose three major categories and default exam types', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/scores/sources', headers: { authorization: `Bearer ${seed.adminToken}` } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json().map((item: any) => item.name), ['机构内', '学校内', '其他第三方']);
  const institution = res.json()[0];
  assert.ok(institution.children.some((item: any) => item.name === '单元考试'));
  const school = res.json()[1];
  assert.ok(school.children.some((item: any) => item.name === '期中考试'));
  assert.ok(school.children.some((item: any) => item.name === '期末考试'));
});

test('admin can add, rename and delete a score source', async () => {
  const tree = await app.inject({ method: 'GET', url: '/api/scores/sources', headers: { authorization: `Bearer ${seed.adminToken}` } });
  const institutionId = Number(tree.json()[0].id);
  const created = await app.inject({
    method: 'POST', url: '/api/scores/sources', headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { parentId: institutionId, name: '周测' }
  });
  assert.equal(created.statusCode, 200);
  const updated = await app.inject({
    method: 'PATCH', url: `/api/scores/sources/${created.json().id}`,
    headers: { authorization: `Bearer ${seed.adminToken}` }, payload: { name: '每周测评', enabled: false }
  });
  assert.equal(updated.statusCode, 200);
  assert.equal(updated.json().name, '每周测评');
  const removed = await app.inject({ method: 'DELETE', url: `/api/scores/sources/${created.json().id}`, headers: { authorization: `Bearer ${seed.adminToken}` } });
  assert.equal(removed.statusCode, 200);
});

test('teacher can read score sources but cannot modify them', async () => {
  const read = await app.inject({ method: 'GET', url: '/api/scores/sources', headers: { authorization: `Bearer ${seed.teacherToken}` } });
  assert.equal(read.statusCode, 200);
  const create = await app.inject({
    method: 'POST', url: '/api/scores/sources', headers: { authorization: `Bearer ${seed.teacherToken}` },
    payload: { parentId: read.json()[0].id, name: '教师自定义' }
  });
  assert.equal(create.statusCode, 403);
});

test('score source used by an existing score cannot be deleted', async () => {
  const tree = await app.inject({ method: 'GET', url: '/api/scores/sources', headers: { authorization: `Bearer ${seed.adminToken}` } });
  const sourceId = Number(tree.json()[0].children.find((item: any) => item.name === '机构内测评').id);
  const student = await app.pool.query("INSERT INTO students (campus_id,name) VALUES ($1,'来源测试学员') RETURNING id", [seed.campusId]);
  const project = (await app.pool.query('SELECT id FROM exam_projects ORDER BY id LIMIT 1')).rows[0].id;
  const exam = (await app.pool.query('SELECT id FROM exams ORDER BY id LIMIT 1')).rows[0].id;
  await app.pool.query(
    `INSERT INTO student_scores (student_id,project_id,exam_id,score,source,source_id,exam_date)
     VALUES ($1,$2,$3,'90','teacher',$4,'2026-09-15')`,
    [student.rows[0].id, project, exam, sourceId]
  );
  const removed = await app.inject({ method: 'DELETE', url: `/api/scores/sources/${sourceId}`, headers: { authorization: `Bearer ${seed.adminToken}` } });
  assert.equal(removed.statusCode, 409);
});
