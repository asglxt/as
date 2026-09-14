# 二期 2B-2 订单与财务 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付订单与财务闭环：报名/续费/充值/转课/退费/教材订单、多方式分次收款、学员余额与账户流水、退费建议金额、课时与金额联动。

**Architecture:** 沿用现有技术栈。新增 `orders`/`order_items`/`payments`/`refunds`/`student_accounts`/`account_transactions`/`fee_items` 表；扩展 `enrollments.unit_price` 与 `hour_transactions.order_id`；记上课扣课时时联动扣减学费。新增 `finance` 权限模块。

**Tech Stack:** Node.js 24、TypeScript、Fastify、pg、PostgreSQL 18、React 18、Vite、react-router-dom、lucide-react

**设计依据：** `docs/superpowers/specs/2026-09-14-phase2b2-finance-design.md`

---

## 执行前提

- PostgreSQL 运行中；一期、2A、2B-1 已完成。
- 后端测试：`server/` 下 `node --test --test-concurrency=1 "test/*.test.ts"`。
- 前端构建：`web/` 下 `node_modules\.bin\vite.CMD build --configLoader runner`。
- 每个任务先写失败测试，再实现，再验证。

## 目录结构（新增/修改）

    server/src/migrations/011_orders.sql      # 订单/收款/退款/账户/杂费 + enrollments 扩展
    server/src/routes/orders.ts               # 订单、收款、退费
    server/src/routes/accounts.ts             # 学员账户与流水
    server/src/routes/fee-items.ts            # 杂费项
    server/src/routes/attendance.ts           # 扩展：扣课时联动金额
    server/src/routes/me.ts                   # 家长端：我的订单/我的账户
    web/src/pages/OrdersPage.tsx              # 订单管理
    web/src/pages/AccountsPage.tsx            # 学员账户与杂费设置
    web/src/pages/RefundPage.tsx              # 退费
    web/src/pages/MyOrdersPage.tsx            # 家长端订单与账户

## 任务总览

- 里程碑 1（任务 1-4）：订单与收款
- 里程碑 2（任务 5-7）：充值、账户与杂费
- 里程碑 3（任务 8-10）：退费与金额联动
- 里程碑 4（任务 11-12）：家长端与验收

---

### Task 1: 订单与财务数据表

**Files:**
- Create: `server/src/migrations/011_orders.sql`

- [ ] **Step 1: 写迁移文件**

`server/src/migrations/011_orders.sql`:

    CREATE TABLE orders (
      id BIGSERIAL PRIMARY KEY,
      order_no TEXT NOT NULL UNIQUE,
      student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      order_type TEXT NOT NULL CHECK (order_type IN ('enroll','renew','recharge','transfer','refund','material')),
      campus_id BIGINT REFERENCES campuses(id),
      operator_id BIGINT REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('draft','confirmed','cancelled')),
      receivable NUMERIC(12,2) NOT NULL DEFAULT 0,
      received NUMERIC(12,2) NOT NULL DEFAULT 0,
      account_change NUMERIC(12,2) NOT NULL DEFAULT 0,
      arrears NUMERIC(12,2) NOT NULL DEFAULT 0,
      points NUMERIC(12,2) NOT NULL DEFAULT 0,
      payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','partial','paid')),
      internal_note TEXT,
      external_note TEXT,
      enrollment_applied BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE order_items (
      id BIGSERIAL PRIMARY KEY,
      order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      item_type TEXT NOT NULL CHECK (item_type IN ('course','material','transfer','recharge')),
      lesson_id BIGINT REFERENCES lessons(id),
      class_id BIGINT REFERENCES classes(id),
      name TEXT NOT NULL,
      quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
      unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
      amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE payments (
      id BIGSERIAL PRIMARY KEY,
      order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      method TEXT NOT NULL CHECK (method IN ('cash','wechat','alipay','bank','balance')),
      amount NUMERIC(12,2) NOT NULL CHECK (amount <> 0),
      operator_id BIGINT REFERENCES users(id),
      paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      note TEXT
    );

    CREATE TABLE refunds (
      id BIGSERIAL PRIMARY KEY,
      order_id BIGINT REFERENCES orders(id) ON DELETE SET NULL,
      student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      suggested_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      actual_amount NUMERIC(12,2) NOT NULL,
      reason TEXT NOT NULL,
      method TEXT NOT NULL CHECK (method IN ('cash','wechat','alipay','bank','balance')),
      operator_id BIGINT REFERENCES users(id),
      refunded_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE student_accounts (
      id BIGSERIAL PRIMARY KEY,
      student_id BIGINT NOT NULL UNIQUE REFERENCES students(id) ON DELETE CASCADE,
      balance NUMERIC(12,2) NOT NULL DEFAULT 0,
      points NUMERIC(12,2) NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE account_transactions (
      id BIGSERIAL PRIMARY KEY,
      student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('recharge','consume','refund','adjust')),
      amount NUMERIC(12,2) NOT NULL,
      balance_after NUMERIC(12,2) NOT NULL,
      order_id BIGINT REFERENCES orders(id) ON DELETE SET NULL,
      remark TEXT,
      created_by BIGINT REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE fee_items (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      lesson_id BIGINT REFERENCES lessons(id) ON DELETE SET NULL,
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    ALTER TABLE enrollments ADD COLUMN unit_price NUMERIC(12,2) NOT NULL DEFAULT 0;
    UPDATE enrollments SET unit_price = CASE WHEN purchased_hours > 0 THEN total_fee / purchased_hours ELSE 0 END;
    ALTER TABLE hour_transactions ADD COLUMN order_id BIGINT REFERENCES orders(id) ON DELETE SET NULL;

    INSERT INTO role_permissions (role_id, module_key)
      SELECT id, 'finance' FROM roles WHERE roles.name IN ('机构主管', '校区主管', '财务');

- [ ] **Step 2: 运行迁移**

Run（`server/`）：`$env:DATABASE_URL='postgres://school:school@localhost:5432/school'; node src/migrate.ts`

Expected: `migrations applied`；新表存在；`enrollments.unit_price` 已回填。

- [ ] **Step 3: 提交**

    git add server/src/migrations/011_orders.sql
    git commit -m "feat: order and finance schema"

---

### Task 2: 订单创建与列表 API

**Files:**
- Create: `server/src/routes/orders.ts`
- Modify: `server/src/app.ts`
- Modify: `server/src/permissions/module_access.ts`（新增 finance 模块）
- Create: `server/test/orders.test.ts`

- [ ] **Step 1: 写失败测试**

`server/test/orders.test.ts`:

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

    test('teacher without finance module is forbidden', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/orders',
        headers: { authorization: `Bearer ${seed.teacherToken}` },
        payload: { studentId, orderType: 'enroll', items: [] }
      });
      assert.equal(res.statusCode, 403);
    });

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test --test-concurrency=1 test/orders.test.ts`

Expected: FAIL，`/api/orders` 返回 404。

- [ ] **Step 3: 扩展权限模块**

`server/src/permissions/module_access.ts`：`ModuleKey` 与 `ALL_MODULES` 增加 `'finance'`；前端 `RolesPage.tsx` 的 MODULES 常量同步增加 `['finance', '财务']`。

- [ ] **Step 4: 实现订单路由**

`server/src/routes/orders.ts`:

    import crypto from 'node:crypto';
    import type { FastifyInstance } from 'fastify';
    import { authGuard } from '../auth/middleware.ts';
    import { requireModule } from '../permissions/module_access.ts';
    import { writeAudit } from '../audit.ts';

    interface OrderItemInput {
      itemType?: string; lessonId?: number; classId?: number; name?: string;
      quantity?: number; unitPrice?: number;
    }

    function calcItems(items: OrderItemInput[]) {
      return items.map((item) => {
        const quantity = Number(item.quantity ?? 1);
        const unitPrice = Number(item.unitPrice ?? 0);
        return { ...item, quantity, unitPrice, amount: quantity * unitPrice };
      });
    }

    export async function orderRoutes(app: FastifyInstance) {
      const guard = [authGuard, requireModule('finance')];

      app.get('/', { preHandler: guard }, async (request) => {
        const query = request.query as { studentId?: string; type?: string; campusId?: string };
        return (await app.pool.query(
          `SELECT o.*, s.name AS student_name, u.display_name AS operator_name, c.name AS campus_name
           FROM orders o
           JOIN students s ON s.id = o.student_id
           LEFT JOIN users u ON u.id = o.operator_id
           LEFT JOIN campuses c ON c.id = o.campus_id
           WHERE ($1::bigint IS NULL OR o.student_id = $1)
             AND ($2::text IS NULL OR o.order_type = $2)
             AND ($3::bigint IS NULL OR o.campus_id = $3)
           ORDER BY o.id DESC`,
          [query.studentId ? Number(query.studentId) : null, query.type ?? null, query.campusId ? Number(query.campusId) : null]
        )).rows;
      });

      app.get('/:id', { preHandler: guard }, async (request, reply) => {
        const id = Number((request.params as { id: string }).id);
        const order = (await app.pool.query('SELECT * FROM orders WHERE id = $1', [id])).rows[0];
        if (!order) return reply.code(404).send({ error: 'order not found' });
        const items = (await app.pool.query('SELECT * FROM order_items WHERE order_id = $1', [id])).rows;
        const payments = (await app.pool.query('SELECT * FROM payments WHERE order_id = $1 ORDER BY id', [id])).rows;
        return { ...order, items, payments };
      });

      app.post('/', { preHandler: guard }, async (request, reply) => {
        const body = request.body as {
          studentId?: number; orderType?: string; campusId?: number;
          items?: OrderItemInput[]; internalNote?: string; externalNote?: string;
        };
        if (!body.studentId || !body.orderType || !Array.isArray(body.items) || body.items.length === 0) {
          return reply.code(400).send({ error: 'studentId, orderType and items required' });
        }
        const items = calcItems(body.items);
        const receivable = items.reduce((sum, item) => sum + item.amount, 0);
        const orderNo = `O${Date.now()}${crypto.randomInt(100, 999)}`;
        const client = await app.pool.connect();
        try {
          await client.query('BEGIN');
          const order = await client.query(
            `INSERT INTO orders (order_no, student_id, order_type, campus_id, operator_id,
               receivable, received, account_change, arrears, payment_status, internal_note, external_note)
             VALUES ($1,$2,$3,$4,$5,$6,0,0,$6,'unpaid',$7,$8) RETURNING *`,
            [orderNo, body.studentId, body.orderType, body.campusId ?? null, request.user!.id,
             receivable, body.internalNote ?? null, body.externalNote ?? null]
          );
          for (const item of items) {
            await client.query(
              `INSERT INTO order_items (order_id, item_type, lesson_id, class_id, name, quantity, unit_price, amount)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
              [order.rows[0].id, item.itemType ?? 'course', item.lessonId ?? null, item.classId ?? null,
               item.name ?? '未命名明细', item.quantity, item.unitPrice, item.amount]
            );
          }
          await client.query('COMMIT');
          await writeAudit(app, request.user!.id, 'order_create', 'order', order.rows[0].id, { ...body });
          return order.rows[0];
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }
      });
    }

`server/src/app.ts` 注册：

    import { orderRoutes } from './routes/orders.ts';
    await app.register(orderRoutes, { prefix: '/api/orders' });

- [ ] **Step 5: 运行测试确认通过**

Run: `node --test --test-concurrency=1 test/orders.test.ts`

Expected: PASS，3 个测试通过。

- [ ] **Step 6: 提交**

    git add server/src server/test/orders.test.ts web/src/pages/RolesPage.tsx
    git commit -m "feat: order create and list api"
---

### Task 3: 收款 API（多方式、分次、余额抵扣、课时账户联动）

**Files:**
- Modify: `server/src/routes/orders.ts`
- Modify: `server/test/orders.test.ts`

- [ ] **Step 1: 写失败测试**

在 `server/test/orders.test.ts` 末尾追加：

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
        "INSERT INTO student_accounts (student_id, balance) VALUES ($1, 500) ON CONFLICT (student_id) DO UPDATE SET balance = 500",
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

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test --test-concurrency=1 test/orders.test.ts`

Expected: FAIL，`/api/orders/:id/payments` 返回 404。

- [ ] **Step 3: 实现收款**

在 `server/src/routes/orders.ts` 中追加（`applyHours` 从 `./enrollments.ts` 导入）：

    app.post('/:id/payments', { preHandler: guard }, async (request, reply) => {
      const id = Number((request.params as { id: string }).id);
      const body = request.body as { method?: string; amount?: number; note?: string };
      const methods = ['cash', 'wechat', 'alipay', 'bank', 'balance'];
      if (!body.method || !methods.includes(body.method) || !body.amount || Number(body.amount) <= 0) {
        return reply.code(400).send({ error: 'valid method and positive amount required' });
      }
      const amount = Number(body.amount);
      const order = (await app.pool.query('SELECT * FROM orders WHERE id = $1', [id])).rows[0];
      if (!order) return reply.code(404).send({ error: 'order not found' });
      if (order.status === 'cancelled') return reply.code(409).send({ error: '订单已作废' });

      if (body.method === 'balance') {
        const account = (await app.pool.query('SELECT * FROM student_accounts WHERE student_id = $1', [order.student_id])).rows[0];
        if (!account || Number(account.balance) < amount) return reply.code(409).send({ error: '余额不足' });
      }

      const client = await app.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          'INSERT INTO payments (order_id, method, amount, operator_id, note) VALUES ($1,$2,$3,$4,$5)',
          [id, body.method, amount, request.user!.id, body.note ?? null]
        );
        const received = Number(order.received) + amount;
        const arrears = Math.max(0, Number(order.receivable) - received);
        const paymentStatus = received <= 0 ? 'unpaid' : (arrears === 0 ? 'paid' : 'partial');
        await client.query(
          'UPDATE orders SET received = $1, arrears = $2, payment_status = $3 WHERE id = $4',
          [received, arrears, paymentStatus, id]
        );
        if (body.method === 'balance') {
          const account = (await client.query('SELECT balance FROM student_accounts WHERE student_id = $1 FOR UPDATE', [order.student_id])).rows[0];
          const balanceAfter = Number(account.balance) - amount;
          await client.query('UPDATE student_accounts SET balance = $1, updated_at = now() WHERE student_id = $2', [balanceAfter, order.student_id]);
          await client.query(
            `INSERT INTO account_transactions (student_id, type, amount, balance_after, order_id, remark, created_by)
             VALUES ($1, 'consume', $2, $3, $4, '订单余额抵扣', $5)`,
            [order.student_id, -amount, balanceAfter, id, request.user!.id]
          );
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

      if (paymentStatus === 'paid' && ['enroll', 'renew'].includes(order.order_type) && !order.enrollment_applied) {
        const courseItems = (await app.pool.query(
          "SELECT * FROM order_items WHERE order_id = $1 AND item_type = 'course' AND lesson_id IS NOT NULL",
          [id]
        )).rows;
        for (const item of courseItems) {
          const existing = (await app.pool.query(
            'SELECT * FROM enrollments WHERE student_id = $1 AND lesson_id = $2 AND campus_id = $3',
            [order.student_id, item.lesson_id, order.campus_id ?? seedCampusFallback(item)]
          )).rows[0];
          if (existing) {
            await applyHours(app, existing.id, 'purchase', Number(item.quantity), `订单 ${order.order_no}`, request.user!.id);
            await app.pool.query(
              'UPDATE enrollments SET purchased_hours = purchased_hours + $1, total_fee = total_fee + $2, unit_price = $3 WHERE id = $4',
              [Number(item.quantity), Number(item.amount), Number(item.unit_price), existing.id]
            );
          } else {
            const created = await app.pool.query(
              `INSERT INTO enrollments (student_id, lesson_id, campus_id, purchased_hours, remaining_hours,
                 total_fee, paid_fee, remaining_fee, unit_price)
               VALUES ($1,$2,$3,$4,$4,$5,$5,$5,$6) RETURNING *`,
              [order.student_id, item.lesson_id, order.campus_id, Number(item.quantity), Number(item.amount), Number(item.unit_price)]
            );
            await applyHours(app, created.rows[0].id, 'purchase', Number(item.quantity), `订单 ${order.order_no}`, request.user!.id);
          }
        }
        await app.pool.query('UPDATE orders SET enrollment_applied = true WHERE id = $1', [id]);
      }

      await writeAudit(app, request.user!.id, 'order_payment', 'order', id, { amount, method: body.method });
      return (await app.pool.query('SELECT * FROM orders WHERE id = $1', [id])).rows[0];
    });

说明：`seedCampusFallback(item)` 不是真实函数，若订单未填校区，直接用 `order.campus_id`；实现时把该校区分支去掉，改为若 `order.campus_id` 为空则返回 400（`campusId is required for enroll orders`）。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test --test-concurrency=1 test/orders.test.ts`

Expected: PASS，6 个测试通过。

- [ ] **Step 5: 提交**

    git add server/src/routes/orders.ts server/test/orders.test.ts
    git commit -m "feat: order payments with balance and enrollment"

---

### Task 4: 前端订单页

**Files:**
- Create: `web/src/pages/OrdersPage.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/Shell.tsx`

- [ ] **Step 1: 写页面**

`web/src/pages/OrdersPage.tsx` 要点：

- 订单列表：`GET /api/orders`，列：订单号、学员、类型、应收、实收、欠费、账户变动、经办校区、经办时间、到款状态、操作。
- 新建订单：选择学员、订单类型、校区；明细行可增删（类型 course/material、名称、课程、数量、单价）；提交 `POST /api/orders`。
- 收款：对订单弹窗选择收款方式（现金/微信/支付宝/银行卡/余额）与金额，提交 `POST /api/orders/:id/payments`；展示实收与欠费。
- 打印收据：`window.print()`（配合打印样式）。

- [ ] **Step 2: 注册路由与菜单，构建验证**

`web/src/App.tsx` 增加 `/orders`；`web/src/Shell.tsx` 增加「订单」菜单（图标 `Receipt`，`can('finance')`）。
Run（`web/`）：`tsc --noEmit` 与 `vite build --configLoader runner`。

- [ ] **Step 3: 提交**

    git add web/src
    git commit -m "feat: order page"

---

### Task 5: 充值 API

**Files:**
- Modify: `server/src/routes/orders.ts`
- Modify: `server/test/orders.test.ts`

- [ ] **Step 1: 写失败测试**

在 `server/test/orders.test.ts` 末尾追加：

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

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test --test-concurrency=1 test/orders.test.ts`

Expected: FAIL（充值未写账户）。

- [ ] **Step 3: 实现充值到账**

在 Task 3 收款逻辑的 COMMIT 之后追加：若 `order.order_type === 'recharge'` 且 `paymentStatus === 'paid'`，则

    await app.pool.query(
      `INSERT INTO student_accounts (student_id, balance) VALUES ($1, $2)
       ON CONFLICT (student_id) DO UPDATE SET balance = student_accounts.balance + $2, updated_at = now()`,
      [order.student_id, Number(order.receivable)]
    );
    const accountAfter = (await app.pool.query('SELECT balance FROM student_accounts WHERE student_id = $1', [order.student_id])).rows[0];
    await app.pool.query(
      `INSERT INTO account_transactions (student_id, type, amount, balance_after, order_id, remark, created_by)
       VALUES ($1, 'recharge', $2, $3, $4, '余额充值', $5)`,
      [order.student_id, Number(order.receivable), Number(accountAfter.balance), order.id, request.user!.id]
    );

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test --test-concurrency=1 test/orders.test.ts`

Expected: PASS，7 个测试通过。

- [ ] **Step 5: 提交**

    git add server/src/routes/orders.ts server/test/orders.test.ts
    git commit -m "feat: recharge to student account"

---

### Task 6: 杂费项 API

**Files:**
- Create: `server/src/routes/fee-items.ts`
- Modify: `server/src/app.ts`
- Modify: `server/test/orders.test.ts`

- [ ] **Step 1: 写失败测试**

在 `server/test/orders.test.ts` 末尾追加：

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

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test --test-concurrency=1 test/orders.test.ts`

Expected: FAIL，`/api/fee-items` 返回 404。

- [ ] **Step 3: 实现杂费项接口**

`server/src/routes/fee-items.ts`:

    import type { FastifyInstance } from 'fastify';
    import { authGuard } from '../auth/middleware.ts';
    import { requireModule } from '../permissions/module_access.ts';

    export async function feeItemRoutes(app: FastifyInstance) {
      const guard = [authGuard, requireModule('finance')];

      app.get('/', { preHandler: guard }, async () => {
        return (await app.pool.query('SELECT * FROM fee_items ORDER BY id')).rows;
      });

      app.post('/', { preHandler: guard }, async (request, reply) => {
        const body = request.body as { name?: string; amount?: number; lessonId?: number };
        if (!body.name?.trim()) return reply.code(400).send({ error: 'name required' });
        const result = await app.pool.query(
          'INSERT INTO fee_items (name, amount, lesson_id) VALUES ($1, $2, $3) RETURNING *',
          [body.name.trim(), body.amount ?? 0, body.lessonId ?? null]
        );
        return result.rows[0];
      });

      app.patch('/:id', { preHandler: guard }, async (request, reply) => {
        const id = Number((request.params as { id: string }).id);
        const body = request.body as { name?: string; amount?: number; enabled?: boolean };
        const result = await app.pool.query(
          `UPDATE fee_items SET name = COALESCE($1, name), amount = COALESCE($2, amount), enabled = COALESCE($3, enabled)
           WHERE id = $4 RETURNING *`,
          [body.name ?? null, body.amount ?? null, body.enabled ?? null, id]
        );
        if (!result.rowCount) return reply.code(404).send({ error: 'fee item not found' });
        return result.rows[0];
      });
    }

`server/src/app.ts` 注册：

    import { feeItemRoutes } from './routes/fee-items.ts';
    await app.register(feeItemRoutes, { prefix: '/api/fee-items' });

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test --test-concurrency=1 test/orders.test.ts`

Expected: PASS，8 个测试通过。

- [ ] **Step 5: 提交**

    git add server/src/routes/fee-items.ts server/src/app.ts server/test/orders.test.ts
    git commit -m "feat: fee items api"
---

### Task 7: 学员账户与杂费设置页

**Files:**
- Create: `server/src/routes/accounts.ts`
- Modify: `server/src/app.ts`
- Create: `web/src/pages/AccountsPage.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/Shell.tsx`

- [ ] **Step 1: 账户接口**

`server/src/routes/accounts.ts`:

    import type { FastifyInstance } from 'fastify';
    import { authGuard } from '../auth/middleware.ts';
    import { requireModule } from '../permissions/module_access.ts';

    export async function accountRoutes(app: FastifyInstance) {
      const guard = [authGuard, requireModule('finance')];

      app.get('/:studentId', { preHandler: guard }, async (request, reply) => {
        const studentId = Number((request.params as { studentId: string }).studentId);
        const account = (await app.pool.query('SELECT * FROM student_accounts WHERE student_id = $1', [studentId])).rows[0];
        const transactions = (await app.pool.query(
          'SELECT * FROM account_transactions WHERE student_id = $1 ORDER BY id DESC LIMIT 100',
          [studentId]
        )).rows;
        return { balance: account ? Number(account.balance) : 0, points: account ? Number(account.points) : 0, transactions };
      });

      app.post('/:studentId/adjust', { preHandler: guard }, async (request, reply) => {
        const studentId = Number((request.params as { studentId: string }).studentId);
        const body = request.body as { amount?: number; remark?: string };
        if (typeof body.amount !== 'number' || !body.remark?.trim()) {
          return reply.code(400).send({ error: 'amount and remark required' });
        }
        await app.pool.query(
          `INSERT INTO student_accounts (student_id, balance) VALUES ($1, $2)
           ON CONFLICT (student_id) DO UPDATE SET balance = student_accounts.balance + $2, updated_at = now()`,
          [studentId, body.amount]
        );
        const account = (await app.pool.query('SELECT balance FROM student_accounts WHERE student_id = $1', [studentId])).rows[0];
        await app.pool.query(
          `INSERT INTO account_transactions (student_id, type, amount, balance_after, remark, created_by)
           VALUES ($1, 'adjust', $2, $3, $4, $5)`,
          [studentId, body.amount, Number(account.balance), body.remark.trim(), request.user!.id]
        );
        return { ok: true, balance: Number(account.balance) };
      });
    }

`server/src/app.ts` 注册：

    import { accountRoutes } from './routes/accounts.ts';
    await app.register(accountRoutes, { prefix: '/api/accounts' });

- [ ] **Step 2: 前端账户页**

`web/src/pages/AccountsPage.tsx` 要点：

- 选择学员 → `GET /api/accounts/:studentId` 显示余额、积分与流水。
- 手工调整余额（金额 + 备注）→ `POST /api/accounts/:studentId/adjust`。
- 杂费设置页签：`GET/POST/PATCH /api/fee-items`（名称、金额、启用）。

- [ ] **Step 3: 注册路由与菜单**

`web/src/App.tsx` 增加 `/accounts`；`web/src/Shell.tsx` 增加「学员账户」菜单（图标 `Wallet`，`can('finance')`）。

- [ ] **Step 4: 构建验证**

Run（`web/`）：`tsc --noEmit` 与 `vite build --configLoader runner`。

- [ ] **Step 5: 提交**

    git add server/src web/src
    git commit -m "feat: student account and fee item pages"

---

### Task 8: 退费 API

**Files:**
- Modify: `server/src/routes/orders.ts`
- Modify: `server/test/orders.test.ts`

- [ ] **Step 1: 写失败测试**

在 `server/test/orders.test.ts` 末尾追加：

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

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test --test-concurrency=1 test/orders.test.ts`

Expected: FAIL（退费接口 404）。

- [ ] **Step 3: 实现退费建议与退费**

在 `server/src/routes/orders.ts` 追加：

    app.get('/refund-suggestion', { preHandler: guard }, async (request, reply) => {
      const enrollmentId = Number((request.query as { enrollmentId?: string }).enrollmentId);
      if (!enrollmentId) return reply.code(400).send({ error: 'enrollmentId required' });
      const enrollment = (await app.pool.query('SELECT * FROM enrollments WHERE id = $1', [enrollmentId])).rows[0];
      if (!enrollment) return reply.code(404).send({ error: 'enrollment not found' });
      const unitPrice = Number(enrollment.unit_price) || (Number(enrollment.purchased_hours) > 0
        ? Number(enrollment.total_fee) / Number(enrollment.purchased_hours) : 0);
      const suggestedAmount = Number(enrollment.remaining_hours) * unitPrice;
      return {
        enrollmentId,
        unitPrice,
        remainingHours: Number(enrollment.remaining_hours),
        suggestedAmount: Math.round(suggestedAmount * 100) / 100
      };
    });

    app.post('/refunds', { preHandler: guard }, async (request, reply) => {
      const body = request.body as { enrollmentId?: number; actualAmount?: number; reason?: string; method?: string };
      const methods = ['cash', 'wechat', 'alipay', 'bank', 'balance'];
      if (!body.enrollmentId || typeof body.actualAmount !== 'number' || !body.reason?.trim() || !body.method || !methods.includes(body.method)) {
        return reply.code(400).send({ error: 'enrollmentId, actualAmount, reason and valid method required' });
      }
      const enrollment = (await app.pool.query('SELECT * FROM enrollments WHERE id = $1', [body.enrollmentId])).rows[0];
      if (!enrollment) return reply.code(404).send({ error: 'enrollment not found' });
      const unitPrice = Number(enrollment.unit_price) || (Number(enrollment.purchased_hours) > 0
        ? Number(enrollment.total_fee) / Number(enrollment.purchased_hours) : 0);
      const suggestedAmount = Math.round(Number(enrollment.remaining_hours) * unitPrice * 100) / 100;

      const client = await app.pool.connect();
      try {
        await client.query('BEGIN');
        const refund = await client.query(
          `INSERT INTO refunds (student_id, suggested_amount, actual_amount, reason, method, operator_id)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
          [enrollment.student_id, suggestedAmount, body.actualAmount, body.reason.trim(), body.method, request.user!.id]
        );
        await client.query(
          `UPDATE enrollments SET remaining_hours = 0, remaining_fee = 0, status = 'refunded',
             used_fee = total_fee WHERE id = $1`,
          [enrollment.id]
        );
        await client.query(
          `INSERT INTO hour_transactions (enrollment_id, student_id, type, hours, balance_after, remark, created_by)
           VALUES ($1,$2,'refund',$3,0,$4,$5)`,
          [enrollment.id, enrollment.student_id, -Number(enrollment.remaining_hours), `退费：${body.reason}`, request.user!.id]
        );
        if (body.method === 'balance') {
          await client.query(
            `INSERT INTO student_accounts (student_id, balance) VALUES ($1, $2)
             ON CONFLICT (student_id) DO UPDATE SET balance = student_accounts.balance + $2, updated_at = now()`,
            [enrollment.student_id, body.actualAmount]
          );
        }
        await client.query('COMMIT');
        await writeAudit(app, request.user!.id, 'refund_create', 'refund', refund.rows[0].id, { enrollmentId: enrollment.id, actualAmount: body.actualAmount });
        return refund.rows[0];
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    });

注意：`/refund-suggestion` 与 `/refunds` 必须在 `/:id` 之前注册，避免被 `/:id` 抢先匹配。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test --test-concurrency=1 test/orders.test.ts`

Expected: PASS，9 个测试通过。

- [ ] **Step 5: 提交**

    git add server/src/routes/orders.ts server/test/orders.test.ts
    git commit -m "feat: refund suggestion and refund flow"

---

### Task 9: 记上课扣课时的金额联动

**Files:**
- Modify: `server/src/routes/attendance.ts`
- Modify: `server/test/attendance.test.ts`

- [ ] **Step 1: 写失败测试**

在 `server/test/attendance.test.ts` 末尾追加：

    test('attendance deduction also updates remaining fee', async () => {
      const enrollment = await app.pool.query('SELECT * FROM enrollments WHERE id = $1', [enrollmentId]);
      assert.equal(Number(enrollment.rows[0].remaining_fee), 396);
      await app.pool.query('UPDATE enrollments SET unit_price = 44 WHERE id = $1', [enrollmentId]);
      const res = await app.inject({
        method: 'POST', url: `/api/attendance/record/${scheduleId}`,
        headers: { authorization: `Bearer ${seed.teacherToken}` },
        payload: { records: [{ studentId, status: 'present' }] }
      });
      assert.equal(res.statusCode, 200);
      const after = await app.pool.query('SELECT * FROM enrollments WHERE id = $1', [enrollmentId]);
      assert.equal(Number(after.rows[0].remaining_hours), 9);
      assert.equal(Number(after.rows[0].remaining_fee), 396 - 44);
      assert.equal(Number(after.rows[0].used_fee), 44);
    });

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test --test-concurrency=1 test/attendance.test.ts`

Expected: FAIL（金额未联动）。

- [ ] **Step 3: 实现金额联动**

在 `server/src/routes/attendance.ts` 扣课时的循环中，调用 `applyHours` 之后追加：

    await app.pool.query(
      `UPDATE enrollments SET used_fee = used_fee + $1,
         remaining_fee = GREATEST(0, total_fee - (used_fee + $1)) WHERE id = $2`,
      [hours * unitPrice, enrollment.id]
    );

其中 `unitPrice` 取该 enrollment 的 `unit_price`（为 0 时用 `total_fee / purchased_hours`）。实现时先查一次 enrollment 的 `unit_price`、`total_fee`、`purchased_hours` 再计算。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test --test-concurrency=1 test/attendance.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

    git add server/src/routes/attendance.ts server/test/attendance.test.ts
    git commit -m "feat: link attendance deduction with fee"

---

### Task 10: 前端退费页

**Files:**
- Create: `web/src/pages/RefundPage.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/Shell.tsx`

- [ ] **Step 1: 写页面**

`web/src/pages/RefundPage.tsx` 要点：

- 选择学员 → 拉取该学员的报读记录（`GET /api/enrollments?studentId=`）→ 选择一条报读。
- 调用 `GET /api/orders/refund-suggestion?enrollmentId=` 显示建议金额、单价、剩余课时。
- 表单：实际退费金额（默认建议值，可修改）、退费原因（必填）、退款方式（现金/微信/支付宝/银行卡/余额）。
- 提交 `POST /api/orders/refunds`，成功后刷新。

- [ ] **Step 2: 注册路由与菜单，构建验证**

`web/src/App.tsx` 增加 `/refunds`；`web/src/Shell.tsx` 增加「退费」菜单（图标 `Undo2`，`can('finance')`）。
Run（`web/`）：`tsc --noEmit` 与 `vite build --configLoader runner`。

- [ ] **Step 3: 提交**

    git add web/src
    git commit -m "feat: refund page"

---

### Task 11: 家长端订单与账户

**Files:**
- Modify: `server/src/routes/me.ts`
- Create: `web/src/pages/MyOrdersPage.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/Shell.tsx`

- [ ] **Step 1: 家长端接口**

`server/src/routes/me.ts` 追加：

    app.get('/orders', { preHandler: [authGuard] }, async (request) => {
      const user = request.user!;
      const studentIds = user.role === 'student' && user.studentId
        ? [user.studentId]
        : (await app.pool.query('SELECT student_id FROM parent_bindings WHERE parent_user_id = $1', [user.id])).rows.map((b) => b.student_id);
      if (studentIds.length === 0) return { orders: [], account: { balance: 0, points: 0, transactions: [] } };
      const orders = (await app.pool.query(
        `SELECT o.*, s.name AS student_name, c.name AS campus_name
         FROM orders o JOIN students s ON s.id = o.student_id
         LEFT JOIN campuses c ON c.id = o.campus_id
         WHERE o.student_id = ANY($1::bigint[])
         ORDER BY o.id DESC`,
        [studentIds]
      )).rows;
      const account = (await app.pool.query(
        'SELECT balance, points FROM student_accounts WHERE student_id = $1',
        [studentIds[0]]
      )).rows[0];
      const transactions = (await app.pool.query(
        'SELECT * FROM account_transactions WHERE student_id = $1 ORDER BY id DESC LIMIT 50',
        [studentIds[0]]
      )).rows;
      return {
        orders,
        account: { balance: account ? Number(account.balance) : 0, points: account ? Number(account.points) : 0, transactions }
      };
    });

- [ ] **Step 2: 家长端页面**

`web/src/pages/MyOrdersPage.tsx` 要点：展示订单列表（订单号、类型、应收、实收、欠费、状态、日期）与账户余额/积分 + 账户流水。

- [ ] **Step 3: 注册路由与菜单，构建验证**

`web/src/App.tsx` 增加 `/my-orders`；家长/学生菜单增加「我的订单」。
Run（`web/`）：`tsc --noEmit` 与 `vite build --configLoader runner`。

- [ ] **Step 4: 提交**

    git add server/src/routes/me.ts web/src
    git commit -m "feat: parent orders and account page"

---

### Task 12: 2B-2 端到端验收

**Files:** 无新增，按清单验收。

- [ ] **Step 1: 全量后端测试**

Run（`server/`）：`node --test --test-concurrency=1 "test/*.test.ts"`

Expected: 全部通过（预计 70+ 用例）。

- [ ] **Step 2: 类型检查与构建**

Run（`server/`）：`tsc --noEmit`
Run（`web/`）：`tsc --noEmit` 与 `vite build --configLoader runner`

- [ ] **Step 3: 手工验收流程**

1. 新建报名订单（10 课时 × 44 元）→ 应收 440。
2. 分两次收款（微信 200 + 现金 240）→ 订单变为 paid，欠费 0。
3. 检查课时账户：新增 10 课时，`hour_transactions` 有 purchase。
4. 充值 2000 元 → 学员余额 2000，账户流水有 recharge。
5. 用余额抵扣一笔教材订单 → 余额减少，流水有 consume。
6. 记上课扣 1 课时 → 剩余课时 -1，`used_fee +44`、`remaining_fee -44`。
7. 退费：系统建议金额 = 剩余课时 × 单价，人工调整 + 填原因 → 退费单生成，课时与余额同步扣减。
8. 杂费项配置后在订单明细中带出。
9. 家长端能看到订单与账户流水。
10. 回归：一期、2A、2B-1 功能正常。

- [ ] **Step 4: 更新进度文档**

把 2B-2 完成情况写入 `PROGRESS.md`。

## 自检记录

- 规格覆盖：订单（任务 2）、收款（任务 3）、充值（任务 5）、杂费（任务 6）、账户（任务 7）、退费（任务 8）、金额联动（任务 9）、家长端（任务 11）、验收（任务 12）——与设计文档范围逐项对应。
- 占位符扫描：无 TBD/TODO；每个任务给出具体 SQL、接口代码或明确的前端要点与命令。
- 类型一致性：金额字段统一 NUMERIC(12,2)；订单状态统一 draft/confirmed/cancelled；到款状态统一 unpaid/partial/paid；收款方式统一 cash/wechat/alipay/bank/balance。
- 已知偏差：前端页面以「要点 + 接口」描述，实现时按现有页面风格补齐（与前两期计划一致）。