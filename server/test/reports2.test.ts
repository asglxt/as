import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupApp, seedBase } from './helpers.ts';

const app = await setupApp();
let seed: Awaited<ReturnType<typeof seedBase>>;

beforeEach(async () => {
  seed = await seedBase(app);
});

test('admin sees overview metrics', async () => {
  const res = await app.inject({
    method: 'GET', url: '/api/reports/overview?start=2026-01-01&end=2026-12-31',
    headers: { authorization: `Bearer ${seed.adminToken}` }
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok('activeStudents' in body);
  assert.ok('receivable' in body);
  assert.ok('hoursConsumed' in body);
  assert.ok(body.compare);
});

test('teacher without report module is forbidden', async () => {
  const res = await app.inject({
    method: 'GET', url: '/api/reports/overview',
    headers: { authorization: `Bearer ${seed.teacherToken}` }
  });
  assert.equal(res.statusCode, 403);
});

test('students report returns trend, campus comparison and status distribution', async () => {
  const res = await app.inject({
    method: 'GET', url: '/api/reports/students?granularity=month&start=2026-01-01&end=2026-12-31',
    headers: { authorization: `Bearer ${seed.adminToken}` }
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(Array.isArray(body.trend));
  assert.ok(Array.isArray(body.campusComparison));
  assert.ok(Array.isArray(body.statusDistribution));
});

test('teaching report returns schedule, log and attendance metrics', async () => {
  const res = await app.inject({
    method: 'GET', url: '/api/reports/teaching?start=2026-01-01&end=2026-12-31',
    headers: { authorization: `Bearer ${seed.adminToken}` }
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok('scheduleCount' in body);
  assert.ok('teachingLogCount' in body);
  assert.ok('attendance' in body);
  assert.ok('attendanceRate' in body);
});
test('finance report returns totals and distributions', async () => {
  const res = await app.inject({
    method: 'GET', url: '/api/reports/finance?start=2026-01-01&end=2026-12-31',
    headers: { authorization: `Bearer ${seed.adminToken}` }
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok('receivable' in body);
  assert.ok('received' in body);
  assert.ok(Array.isArray(body.campusComparison));
  assert.ok(Array.isArray(body.orderTypeDistribution));
});

test('employee report returns counts', async () => {
  const res = await app.inject({
    method: 'GET', url: '/api/reports/employees',
    headers: { authorization: `Bearer ${seed.adminToken}` }
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok('employeeCount' in body);
  assert.ok('teacherCount' in body);
  assert.ok('classCount' in body);
});

test('drilldown returns rows for new students metric', async () => {
  const res = await app.inject({
    method: 'GET', url: '/api/reports/drilldown?metric=newStudents&start=2026-01-01&end=2026-12-31',
    headers: { authorization: `Bearer ${seed.adminToken}` }
  });
  assert.equal(res.statusCode, 200);
  assert.ok(Array.isArray(res.json().rows));
  assert.equal(typeof res.json().total, 'number');
});

test('drilldown rejects unknown metric', async () => {
  const res = await app.inject({
    method: 'GET', url: '/api/reports/drilldown?metric=unknown',
    headers: { authorization: `Bearer ${seed.adminToken}` }
  });
  assert.equal(res.statusCode, 400);
});