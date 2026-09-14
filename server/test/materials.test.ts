import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { setupApp, seedBase } from './helpers.ts';

const app = await setupApp();
let seed: Awaited<ReturnType<typeof seedBase>>;

beforeEach(async () => {
  seed = await seedBase(app);
});

test('material is created with campus inventory and stock summary', async () => {
  const created = await app.inject({
    method: 'POST',
    url: '/api/materials',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: {
      campusId: seed.campusId,
      name: '数学教材',
      sku: 'MATH-001',
      price: 68,
      costPrice: 42,
      initialStock: 20,
      warningStock: 5
    }
  });
  assert.equal(created.statusCode, 200);
  assert.equal(Number(created.json().stock), 20);

  const list = await app.inject({
    method: 'GET',
    url: `/api/materials/list?campusId=${seed.campusId}&keyword=数学教材`,
    headers: { authorization: `Bearer ${seed.adminToken}` }
  });
  assert.equal(list.statusCode, 200);
  assert.equal(list.json().items.length, 1);
  assert.equal(list.json().items[0].stock, 20);
  assert.equal(list.json().summary.stockValue, 840);
});

test('issuing a material order item decrements stock and records history', async () => {
  const student = await app.pool.query("INSERT INTO students (campus_id, name) VALUES ($1, '领书学员') RETURNING id", [seed.campusId]);
  const material = await app.inject({
    method: 'POST',
    url: '/api/materials',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { campusId: seed.campusId, name: '语文教材', sku: 'CHN-001', price: 58, costPrice: 35, initialStock: 10, warningStock: 2 }
  });
  const order = await app.inject({
    method: 'POST',
    url: '/api/orders',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: {
      studentId: student.rows[0].id,
      orderType: 'material',
      campusId: seed.campusId,
      items: [{ itemType: 'material', materialId: material.json().id, name: '语文教材', quantity: 2, unitPrice: 58 }]
    }
  });
  assert.equal(order.statusCode, 200);

  const pending = await app.inject({
    method: 'GET',
    url: `/api/materials/order-items/pending?campusId=${seed.campusId}`,
    headers: { authorization: `Bearer ${seed.adminToken}` }
  });
  assert.equal(pending.statusCode, 200);
  assert.equal(pending.json().length, 1);
  const orderItemId = pending.json()[0].id;

  const issued = await app.inject({
    method: 'POST',
    url: `/api/materials/order-items/${orderItemId}/issue`,
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { remark: '已发放' }
  });
  assert.equal(issued.statusCode, 200);
  assert.equal(Number(issued.json().stock), 8);

  const materialRow = await app.pool.query('SELECT stock FROM material_inventory WHERE material_id = $1 AND campus_id = $2', [material.json().id, seed.campusId]);
  assert.equal(Number(materialRow.rows[0].stock), 8);
  const transaction = await app.pool.query("SELECT * FROM material_transactions WHERE order_item_id = $1 AND type = 'issue'", [orderItemId]);
  assert.equal(transaction.rowCount, 1);
  assert.equal(Number(transaction.rows[0].quantity), -2);
  assert.equal(Number(transaction.rows[0].balance_after), 8);
});

test('material issue is rejected when stock is insufficient', async () => {
  const student = await app.pool.query("INSERT INTO students (campus_id, name) VALUES ($1, '缺书学员') RETURNING id", [seed.campusId]);
  const material = await app.inject({
    method: 'POST',
    url: '/api/materials',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { campusId: seed.campusId, name: '英语教材', sku: 'ENG-001', price: 60, costPrice: 38, initialStock: 1, warningStock: 2 }
  });
  await app.inject({
    method: 'POST',
    url: '/api/orders',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: {
      studentId: student.rows[0].id,
      orderType: 'material',
      campusId: seed.campusId,
      items: [{ itemType: 'material', materialId: material.json().id, name: '英语教材', quantity: 2, unitPrice: 60 }]
    }
  });
  const pending = await app.inject({
    method: 'GET',
    url: `/api/materials/order-items/pending?campusId=${seed.campusId}`,
    headers: { authorization: `Bearer ${seed.adminToken}` }
  });
  const issued = await app.inject({
    method: 'POST',
    url: `/api/materials/order-items/${pending.json()[0].id}/issue`,
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: {}
  });
  assert.equal(issued.statusCode, 409);
  const item = await app.pool.query('SELECT issue_status FROM order_items WHERE id = $1', [pending.json()[0].id]);
  assert.equal(item.rows[0].issue_status, 'pending');
});

test('enrollment order automatically adds enabled fee items and linked material', async () => {
  const student = await app.pool.query("INSERT INTO students (campus_id, name) VALUES ($1, '报名学员') RETURNING id", [seed.campusId]);
  const lesson = await app.pool.query("INSERT INTO lessons (name) VALUES ('数学提高班') RETURNING id");
  const material = await app.inject({
    method: 'POST',
    url: '/api/materials',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { campusId: seed.campusId, name: '数学练习册', sku: 'MATH-WB-01', price: 30, costPrice: 18, initialStock: 20, warningStock: 3 }
  });
  const fee = await app.inject({
    method: 'POST',
    url: '/api/fee-items',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: {
      name: '数学教材费',
      amount: 30,
      lessonId: lesson.rows[0].id,
      materialId: material.json().id,
      autoApplyOnEnroll: true
    }
  });
  assert.equal(fee.statusCode, 200);

  const order = await app.inject({
    method: 'POST',
    url: '/api/orders',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: {
      studentId: student.rows[0].id,
      orderType: 'enroll',
      campusId: seed.campusId,
      items: [{ itemType: 'course', lessonId: lesson.rows[0].id, name: '数学提高班', quantity: 10, unitPrice: 100 }]
    }
  });
  assert.equal(order.statusCode, 200);
  assert.equal(Number(order.json().receivable), 1030);

  const detail = await app.inject({
    method: 'GET',
    url: `/api/orders/${order.json().id}`,
    headers: { authorization: `Bearer ${seed.adminToken}` }
  });
  assert.equal(detail.json().items.length, 2);
  const materialItem = detail.json().items.find((item: any) => item.item_type === 'material');
  assert.equal(materialItem.name, '数学教材费');
  assert.equal(Number(materialItem.material_id), Number(material.json().id));
  assert.equal(materialItem.issue_status, 'pending');
});

test('materials require finance permission', async () => {
  const list = await app.inject({
    method: 'GET',
    url: '/api/materials/list',
    headers: { authorization: `Bearer ${seed.teacherToken}` }
  });
  assert.equal(list.statusCode, 403);
});
