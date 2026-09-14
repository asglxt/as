import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupApp, seedBase } from './helpers.ts';

const app = await setupApp();
let seed: Awaited<ReturnType<typeof seedBase>>;
let studentId = 0;
let lessonId = 0;

beforeEach(async () => {
  seed = await seedBase(app);
  const student = await app.pool.query("INSERT INTO students (campus_id, name) VALUES ($1,'订单学员') RETURNING id", [seed.campusId]);
  studentId = student.rows[0].id;
  const lesson = await app.pool.query("INSERT INTO lessons (name) VALUES ('订单课程') RETURNING id");
  lessonId = lesson.rows[0].id;
});

test('create enroll order computes receivable from items', async () => {
  const res = await app.inject({
    method: 'POST', url: '/api/orders',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: {
      studentId, orderType: 'enroll', campusId: seed.campusId,
      items: [{ itemType: 'course', lessonId, name: '订单课程', quantity: 48, unitPrice: 44 }]
    }
  });
  assert.equal(res.statusCode, 200);
  assert.equal(Number(res.json().receivable), 2112);
  assert.equal(res.json().payment_status, 'unpaid');
  const items = await app.pool.query('SELECT * FROM order_items WHERE order_id = $1', [res.json().id]);
  assert.equal(items.rowCount, 1);
  assert.equal(Number(items.rows[0].amount), 2112);
});

test('order list filters by student', async () => {
  await app.inject({
    method: 'POST', url: '/api/orders',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { studentId, orderType: 'material', campusId: seed.campusId, items: [{ itemType: 'material', name: '资料费', quantity: 1, unitPrice: 180 }] }
  });
  const list = await app.inject({
    method: 'GET', url: `/api/orders?studentId=${studentId}`,
    headers: { authorization: `Bearer ${seed.adminToken}` }
  });
  assert.equal(list.statusCode, 200);
  assert.equal(list.json().length, 1);
  assert.equal(Number(list.json()[0].receivable), 180);
});

test('order list returns paginated summary and financial totals', async () => {
  const created = await app.inject({
    method: 'POST', url: '/api/orders',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: {
      studentId, orderType: 'enroll', campusId: seed.campusId, orderSource: '前台', tags: ['新生', '重点跟进'],
      items: [{ itemType: 'course', lessonId, name: '订单课程', quantity: 10, unitPrice: 100 }]
    }
  });
  const res = await app.inject({
    method: 'GET', url: `/api/orders/list?keyword=${encodeURIComponent('订单学员')}&paymentStatus=unpaid&page=1&pageSize=20`,
    headers: { authorization: `Bearer ${seed.adminToken}` }
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().items[0].id, Number(created.json().id));
  assert.deepEqual(res.json().items[0].tags, ['新生', '重点跟进']);
  assert.equal(res.json().items[0].order_source, '前台');
  assert.equal(res.json().summary.receivable, 1000);
  assert.equal(res.json().summary.received, 0);
});

test('order can be cancelled with a reason', async () => {
  const created = await app.inject({
    method: 'POST', url: '/api/orders',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { studentId, orderType: 'material', campusId: seed.campusId, items: [{ itemType: 'material', name: '教材', quantity: 1, unitPrice: 80 }] }
  });
  const res = await app.inject({
    method: 'PATCH', url: `/api/orders/${created.json().id}/status`,
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { status: 'cancelled', reason: '重复录入' }
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().status, 'cancelled');
  assert.equal(res.json().cancel_reason, '重复录入');
});

test('teacher without finance module is forbidden', async () => {
  const res = await app.inject({
    method: 'POST', url: '/api/orders',
    headers: { authorization: `Bearer ${seed.teacherToken}` },
    payload: { studentId, orderType: 'enroll', items: [] }
  });
  assert.equal(res.statusCode, 403);
});
test('payment updates received, arrears and payment status', async () => {
  const created = await app.inject({
    method: 'POST', url: '/api/orders',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: {
      studentId, orderType: 'enroll', campusId: seed.campusId,
      items: [{ itemType: 'course', lessonId, name: '订单课程', quantity: 10, unitPrice: 44 }]
    }
  });
  const orderId = created.json().id;
  const partial = await app.inject({
    method: 'POST', url: `/api/orders/${orderId}/payments`,
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { method: 'wechat', amount: 200 }
  });
  assert.equal(partial.statusCode, 200);
  assert.equal(partial.json().payment_status, 'partial');
  assert.equal(Number(partial.json().received), 200);
  assert.equal(Number(partial.json().arrears), 240);
  const final = await app.inject({
    method: 'POST', url: `/api/orders/${orderId}/payments`,
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { method: 'cash', amount: 240 }
  });
  assert.equal(final.json().payment_status, 'paid');
  assert.equal(Number(final.json().arrears), 0);
});

test('fully paid enroll order creates enrollment and purchase transaction', async () => {
  const created = await app.inject({
    method: 'POST', url: '/api/orders',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: {
      studentId, orderType: 'enroll', campusId: seed.campusId,
      items: [{ itemType: 'course', lessonId, name: '订单课程', quantity: 8, unitPrice: 50 }]
    }
  });
  const orderId = created.json().id;
  await app.inject({
    method: 'POST', url: `/api/orders/${orderId}/payments`,
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { method: 'alipay', amount: 400 }
  });
  const enrollment = await app.pool.query('SELECT * FROM enrollments WHERE student_id = $1 AND lesson_id = $2', [studentId, lessonId]);
  assert.equal(enrollment.rowCount, 1);
  assert.equal(Number(enrollment.rows[0].purchased_hours), 8);
  assert.equal(Number(enrollment.rows[0].remaining_hours), 8);
  const tx = await app.pool.query('SELECT * FROM hour_transactions WHERE enrollment_id = $1', [enrollment.rows[0].id]);
  assert.equal(tx.rowCount, 1);
  assert.equal(tx.rows[0].type, 'purchase');
});

test('balance payment deducts account balance', async () => {
  await app.pool.query(
    'INSERT INTO student_accounts (student_id, balance) VALUES ($1, 500) ON CONFLICT (student_id) DO UPDATE SET balance = 500',
    [studentId]
  );
  const created = await app.inject({
    method: 'POST', url: '/api/orders',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { studentId, orderType: 'material', campusId: seed.campusId, items: [{ itemType: 'material', name: '资料费', quantity: 1, unitPrice: 180 }] }
  });
  const res = await app.inject({
    method: 'POST', url: `/api/orders/${created.json().id}/payments`,
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { method: 'balance', amount: 180 }
  });
  assert.equal(res.statusCode, 200);
  const account = await app.pool.query('SELECT balance FROM student_accounts WHERE student_id = $1', [studentId]);
  assert.equal(Number(account.rows[0].balance), 320);
  const tx = await app.pool.query("SELECT * FROM account_transactions WHERE student_id = $1 AND type = 'consume'", [studentId]);
  assert.equal(tx.rowCount, 1);
  assert.equal(Number(tx.rows[0].amount), -180);
});
test('recharge order increases balance and writes account transaction', async () => {
  const created = await app.inject({
    method: 'POST', url: '/api/orders',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { studentId, orderType: 'recharge', campusId: seed.campusId, items: [{ itemType: 'recharge', name: '余额充值', quantity: 1, unitPrice: 2000 }] }
  });
  const orderId = created.json().id;
  await app.inject({
    method: 'POST', url: `/api/orders/${orderId}/payments`,
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { method: 'wechat', amount: 2000 }
  });
  const account = await app.pool.query('SELECT * FROM student_accounts WHERE student_id = $1', [studentId]);
  assert.equal(Number(account.rows[0].balance), 2000);
  const tx = await app.pool.query("SELECT * FROM account_transactions WHERE student_id = $1 AND type = 'recharge'", [studentId]);
  assert.equal(tx.rowCount, 1);
  assert.equal(Number(tx.rows[0].amount), 2000);
});

test('fee items can be created and listed', async () => {
  const create = await app.inject({
    method: 'POST', url: '/api/fee-items',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { name: '少儿段资料学杂费', amount: 180 }
  });
  assert.equal(create.statusCode, 200);
  const list = await app.inject({
    method: 'GET', url: '/api/fee-items',
    headers: { authorization: `Bearer ${seed.adminToken}` }
  });
  assert.equal(list.json().length, 1);
  assert.equal(Number(list.json()[0].amount), 180);
});
test('refund suggests amount and reduces hours and balance', async () => {
  const enrollment = await app.pool.query(
    `INSERT INTO enrollments (student_id, lesson_id, campus_id, purchased_hours, used_hours, remaining_hours,
       total_fee, paid_fee, remaining_fee, unit_price)
     VALUES ($1,$2,$3,10,4,6,440,440,264,44) RETURNING id`,
    [studentId, lessonId, seed.campusId]
  );
  const enrollmentId = enrollment.rows[0].id;
  const suggest = await app.inject({
    method: 'GET', url: `/api/orders/refund-suggestion?enrollmentId=${enrollmentId}`,
    headers: { authorization: `Bearer ${seed.adminToken}` }
  });
  assert.equal(suggest.statusCode, 200);
  assert.equal(Number(suggest.json().suggestedAmount), 264);
  const refund = await app.inject({
    method: 'POST', url: '/api/orders/refunds',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { enrollmentId, actualAmount: 264, reason: '学员转学', method: 'wechat' }
  });
  assert.equal(refund.statusCode, 200);
  const after = await app.pool.query('SELECT * FROM enrollments WHERE id = $1', [enrollmentId]);
  assert.equal(Number(after.rows[0].remaining_hours), 0);
  assert.equal(Number(after.rows[0].remaining_fee), 0);
  const refundRow = await app.pool.query('SELECT * FROM refunds WHERE student_id = $1', [studentId]);
  assert.equal(refundRow.rowCount, 1);
  assert.equal(refundRow.rows[0].reason, '学员转学');
});
