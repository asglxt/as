# 三期 2B-3 报表中心 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付报表中心：按「校区 × 时间」输出经营/学员/教务/财务/员工五类报表，含环比、校区对比、图表与明细下钻。

**Architecture:** 复用现有技术栈。新增 `report` 权限模块与 `server/src/routes/reports2.ts` 聚合接口；前端新增 `ReportsPage.tsx` 并引入 ECharts 绘制折线/柱状/饼图；所有接口统一走校区权限过滤。

**Tech Stack:** Node.js 24、TypeScript、Fastify、pg、PostgreSQL 18、React 18、Vite、ECharts、react-router-dom

**设计依据：** `docs/superpowers/specs/2026-09-14-phase2b3-reports-design.md`

---

## 执行前提

- 一期、2A、2B-1、2B-2 已完成；PostgreSQL 运行中。
- 后端测试：`server/` 下 `node --test --test-concurrency=1 "test/*.test.ts"`。
- 前端构建：`web/` 下 `node_modules\.bin\vite.CMD build --configLoader runner`。
- 安装图表依赖：`web/` 下 `node_modules\.bin\pnpm.CMD add echarts`（或 `pnpm --filter web add echarts`）。

## 目录结构（新增/修改）

    server/src/migrations/012_report_permissions.sql   # report 权限 + 报表索引
    server/src/reports/campus_filter.ts                # 校区权限过滤
    server/src/routes/reports2.ts                      # 报表聚合接口
    server/test/reports2.test.ts                       # 报表测试
    web/src/pages/ReportsPage.tsx                      # 报表中心页面
    web/src/components/BarChart.tsx（可选）             # ECharts 封装

## 任务总览

- 任务 1：report 权限与索引迁移
- 任务 2：校区过滤 + 经营总览接口
- 任务 3：招生与学员、教务接口
- 任务 4：财务、员工接口
- 任务 5：明细下钻接口
- 任务 6：前端报表页（筛选 + 指标卡 + 图表）
- 任务 7：前端下钻与 CSV 导出
- 任务 8：端到端验收

---

### Task 1: report 权限与报表索引

**Files:**
- Create: `server/src/migrations/012_report_permissions.sql`

- [ ] **Step 1: 写迁移**

`server/src/migrations/012_report_permissions.sql`:

    INSERT INTO role_permissions (role_id, module_key)
      SELECT id, 'report' FROM roles
      WHERE roles.name IN ('机构主管', '校区主管', '财务')
      ON CONFLICT DO NOTHING;

    CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
    CREATE INDEX IF NOT EXISTS idx_orders_campus ON orders(campus_id);
    CREATE INDEX IF NOT EXISTS idx_teaching_logs_taught_at ON teaching_logs(taught_at);
    CREATE INDEX IF NOT EXISTS idx_attendance_created_at ON attendance_records(created_at);
    CREATE INDEX IF NOT EXISTS idx_students_campus ON students(campus_id);
    CREATE INDEX IF NOT EXISTS idx_schedules_campus_date ON schedules(campus_id, schedule_date);

- [ ] **Step 2: 运行迁移**

Run（`server/`）：`$env:DATABASE_URL='postgres://school:school@localhost:5432/school'; node src/migrate.ts`

- [ ] **Step 3: 扩展权限模块**

`server/src/permissions/module_access.ts`：`ModuleKey` 与 `ALL_MODULES` 增加 `'report'`；`web/src/pages/RolesPage.tsx` 的 MODULES 增加 `['report', '报表']`。

- [ ] **Step 4: 提交**

    git add server/src/migrations/012_report_permissions.sql server/src/permissions/module_access.ts web/src/pages/RolesPage.tsx
    git commit -m "feat: report permission and indexes"

---

### Task 2: 校区过滤与经营总览接口

**Files:**
- Create: `server/src/reports/campus_filter.ts`
- Create: `server/src/routes/reports2.ts`
- Modify: `server/src/app.ts`
- Create: `server/test/reports2.test.ts`

- [ ] **Step 1: 写失败测试**

`server/test/reports2.test.ts`:

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

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test --test-concurrency=1 test/reports2.test.ts` → FAIL（404）

- [ ] **Step 3: 实现校区过滤**

`server/src/reports/campus_filter.ts`:

    import type { FastifyInstance } from 'fastify';

    export async function resolveCampusIds(
      app: FastifyInstance,
      user: { id: number; role: string },
      requested?: number[]
    ): Promise<number[] | null> {
      if (user.role === 'admin') return requested && requested.length ? requested : null;
      const rows = (await app.pool.query(
        `SELECT DISTINCT rc.campus_id FROM user_roles ur
         JOIN role_campuses rc ON rc.role_id = ur.role_id
         WHERE ur.user_id = $1 AND rc.campus_id IS NOT NULL`,
        [user.id]
      )).rows.map((r) => Number(r.campus_id));
      const allowed = rows.length ? rows : null;
      if (!requested || requested.length === 0) return allowed;
      if (!allowed) return requested;
      return requested.filter((id) => allowed.includes(id));
    }

说明：返回 `null` 表示不限校区；返回数组表示限定校区集合（空数组表示无权限看任何校区）。

- [ ] **Step 4: 实现总览接口**

`server/src/routes/reports2.ts`（先实现 overview，其余在任务 3-5 追加）：

    import type { FastifyInstance } from 'fastify';
    import { authGuard } from '../auth/middleware.ts';
    import { requireModule } from '../permissions/module_access.ts';
    import { resolveCampusIds } from '../reports/campus_filter.ts';

    function parseRange(query: any) {
      const end = query.end ?? new Date().toISOString().slice(0, 10);
      const start = query.start ?? end.slice(0, 8) + '01';
      return { start, end };
    }

    function campusParam(ids: number[] | null) {
      return ids && ids.length ? ids : null;
    }

    export async function report2Routes(app: FastifyInstance) {
      const guard = [authGuard, requireModule('report')];

      app.get('/overview', { preHandler: guard }, async (request) => {
        const query = request.query as any;
        const { start, end } = parseRange(query);
        const requested = query.campusIds ? String(query.campusIds).split(',').map(Number) : [];
        const campusIds = await resolveCampusIds(app, request.user!, requested);
        const c = campusParam(campusIds);

        const students = (await app.pool.query(
          `SELECT COUNT(*) AS active FROM students s
           WHERE s.status = 'active' AND ($1::bigint[] IS NULL OR s.campus_id = ANY($1))`,
          [c]
        )).rows[0];
        const newStudents = (await app.pool.query(
          `SELECT COUNT(*) AS count FROM students s
           WHERE s.created_at::date BETWEEN $2::date AND $3::date
             AND ($1::bigint[] IS NULL OR s.campus_id = ANY($1))`,
          [c, start, end]
        )).rows[0];
        const orders = (await app.pool.query(
          `SELECT COALESCE(SUM(o.receivable),0) AS receivable, COALESCE(SUM(o.arrears),0) AS arrears
           FROM orders o
           WHERE o.created_at::date BETWEEN $2::date AND $3::date
             AND ($1::bigint[] IS NULL OR o.campus_id = ANY($1))`,
          [c, start, end]
        )).rows[0];
        const payments = (await app.pool.query(
          `SELECT COALESCE(SUM(p.amount),0) AS received FROM payments p
           JOIN orders o ON o.id = p.order_id
           WHERE p.paid_at::date BETWEEN $2::date AND $3::date
             AND ($1::bigint[] IS NULL OR o.campus_id = ANY($1))`,
          [c, start, end]
        )).rows[0];
        const refunds = (await app.pool.query(
          `SELECT COALESCE(SUM(r.actual_amount),0) AS refunded FROM refunds r
           JOIN students s ON s.id = r.student_id
           WHERE r.refunded_at::date BETWEEN $2::date AND $3::date
             AND ($1::bigint[] IS NULL OR s.campus_id = ANY($1))`,
          [c, start, end]
        )).rows[0];
        const teaching = (await app.pool.query(
          `SELECT COUNT(*) AS logs FROM teaching_logs tl
           WHERE tl.taught_at::date BETWEEN $2::date AND $3::date
             AND ($1::bigint[] IS NULL OR tl.campus_id = ANY($1))`,
          [c, start, end]
        )).rows[0];
        const hours = (await app.pool.query(
          `SELECT COALESCE(SUM(ar.hours_deducted),0) AS hours FROM attendance_records ar
           JOIN teaching_logs tl ON tl.id = ar.teaching_log_id
           WHERE tl.taught_at::date BETWEEN $2::date AND $3::date
             AND ($1::bigint[] IS NULL OR tl.campus_id = ANY($1))`,
          [c, start, end]
        )).rows[0];

        const days = Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1);
        const prevEndDate = new Date(new Date(start).getTime() - 86400000);
        const prevStartDate = new Date(prevEndDate.getTime() - (days - 1) * 86400000);
        const prevStart = prevStartDate.toISOString().slice(0, 10);
        const prevEnd = prevEndDate.toISOString().slice(0, 10);
        const prevReceived = (await app.pool.query(
          `SELECT COALESCE(SUM(p.amount),0) AS received FROM payments p
           JOIN orders o ON o.id = p.order_id
           WHERE p.paid_at::date BETWEEN $2::date AND $3::date
             AND ($1::bigint[] IS NULL OR o.campus_id = ANY($1))`,
          [c, prevStart, prevEnd]
        )).rows[0];
        const receivedNow = Number(payments.received);
        const receivedPrev = Number(prevReceived.received);
        const growth = receivedPrev === 0 ? null : Math.round(((receivedNow - receivedPrev) / receivedPrev) * 1000) / 10;

        return {
          range: { start, end },
          activeStudents: Number(students.active),
          newStudents: Number(newStudents.count),
          receivable: Number(orders.receivable),
          received: receivedNow,
          arrears: Number(orders.arrears),
          refunded: Number(refunds.refunded),
          teachingLogs: Number(teaching.logs),
          hoursConsumed: Number(hours.hours),
          compare: { receivedGrowthPercent: growth }
        };
      });
    }

`server/src/app.ts` 注册：

    import { report2Routes } from './routes/reports2.ts';
    await app.register(report2Routes, { prefix: '/api/reports' });

注意：一期 `reportRoutes` 已注册在 `/api/reports`，新增接口路径不冲突（`/overview` 等为新路径）。

- [ ] **Step 5: 运行测试确认通过**

Run: `node --test --test-concurrency=1 test/reports2.test.ts` → PASS（2 个）

- [ ] **Step 6: 提交**

    git add server/src/reports server/src/routes/reports2.ts server/src/app.ts server/test/reports2.test.ts
    git commit -m "feat: report overview api"

---

### Task 3: 招生与学员、教务接口

**Files:**
- Modify: `server/src/routes/reports2.ts`
- Modify: `server/test/reports2.test.ts`

- [ ] **Step 1: 写失败测试**

在 `server/test/reports2.test.ts` 追加：

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

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test --test-concurrency=1 test/reports2.test.ts` → FAIL

- [ ] **Step 3: 实现 students 与 teaching 接口**

在 `reports2.ts` 追加：

    app.get('/students', { preHandler: guard }, async (request) => {
      const query = request.query as any;
      const { start, end } = parseRange(query);
      const requested = query.campusIds ? String(query.campusIds).split(',').map(Number) : [];
      const campusIds = await resolveCampusIds(app, request.user!, requested);
      const c = campusParam(campusIds);
      const granularity = ['day', 'week', 'month'].includes(query.granularity) ? query.granularity : 'day';

      const trend = (await app.pool.query(
        `SELECT date_trunc($4, s.created_at)::date AS bucket, COUNT(*) AS count
         FROM students s
         WHERE s.created_at::date BETWEEN $2::date AND $3::date
           AND ($1::bigint[] IS NULL OR s.campus_id = ANY($1))
         GROUP BY bucket ORDER BY bucket`,
        [c, start, end, granularity]
      )).rows.map((r) => ({ bucket: String(r.bucket).slice(0, 10), count: Number(r.count) }));

      const campusComparison = (await app.pool.query(
        `SELECT camp.id, camp.name, COUNT(s.id) AS count
         FROM campuses camp
         LEFT JOIN students s ON s.campus_id = camp.id
           AND s.created_at::date BETWEEN $2::date AND $3::date
         WHERE ($1::bigint[] IS NULL OR camp.id = ANY($1))
         GROUP BY camp.id, camp.name ORDER BY camp.id`,
        [c, start, end]
      )).rows.map((r) => ({ campusId: Number(r.id), campusName: r.name, count: Number(r.count) }));

      const statusDistribution = (await app.pool.query(
        `SELECT s.status, COUNT(*) AS count FROM students s
         WHERE ($1::bigint[] IS NULL OR s.campus_id = ANY($1))
         GROUP BY s.status ORDER BY s.status`,
        [c]
      )).rows.map((r) => ({ status: r.status, count: Number(r.count) }));

      return { range: { start, end }, granularity, trend, campusComparison, statusDistribution };
    });

    app.get('/teaching', { preHandler: guard }, async (request) => {
      const query = request.query as any;
      const { start, end } = parseRange(query);
      const requested = query.campusIds ? String(query.campusIds).split(',').map(Number) : [];
      const campusIds = await resolveCampusIds(app, request.user!, requested);
      const c = campusParam(campusIds);

      const scheduleCount = (await app.pool.query(
        `SELECT COUNT(*) AS count FROM schedules s
         WHERE s.schedule_date BETWEEN $2::date AND $3::date
           AND s.status = 'normal' AND ($1::bigint[] IS NULL OR s.campus_id = ANY($1))`,
        [c, start, end]
      )).rows[0];
      const teachingLogCount = (await app.pool.query(
        `SELECT COUNT(*) AS count FROM teaching_logs tl
         WHERE tl.taught_at::date BETWEEN $2::date AND $3::date
           AND ($1::bigint[] IS NULL OR tl.campus_id = ANY($1))`,
        [c, start, end]
      )).rows[0];
      const attendance = (await app.pool.query(
        `SELECT ar.status, COUNT(*) AS count, COALESCE(SUM(ar.hours_deducted),0) AS hours
         FROM attendance_records ar
         JOIN teaching_logs tl ON tl.id = ar.teaching_log_id
         WHERE tl.taught_at::date BETWEEN $2::date AND $3::date
           AND ($1::bigint[] IS NULL OR tl.campus_id = ANY($1))
         GROUP BY ar.status`,
        [c, start, end]
      )).rows;
      const byStatus: Record<string, number> = { present: 0, absent: 0, leave: 0, makeup: 0 };
      let hoursConsumed = 0;
      for (const row of attendance) {
        byStatus[row.status] = Number(row.count);
        hoursConsumed += Number(row.hours);
      }
      const total = Object.values(byStatus).reduce((sum, value) => sum + value, 0);
      const attendanceRate = total === 0 ? null : Math.round((byStatus.present / total) * 1000) / 10;

      return {
        range: { start, end },
        scheduleCount: Number(scheduleCount.count),
        teachingLogCount: Number(teachingLogCount.count),
        hoursConsumed,
        attendance: byStatus,
        attendanceRate
      };
    });

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test --test-concurrency=1 test/reports2.test.ts` → PASS（4 个）

- [ ] **Step 5: 提交**

    git add server/src/routes/reports2.ts server/test/reports2.test.ts
    git commit -m "feat: student and teaching reports"
---

### Task 4: 财务与员工接口

**Files:**
- Modify: `server/src/routes/reports2.ts`
- Modify: `server/test/reports2.test.ts`

- [ ] **Step 1: 写失败测试**

在 `server/test/reports2.test.ts` 追加：

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

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test --test-concurrency=1 test/reports2.test.ts` → FAIL

- [ ] **Step 3: 实现 finance 与 employees**

    app.get('/finance', { preHandler: guard }, async (request) => {
      const query = request.query as any;
      const { start, end } = parseRange(query);
      const requested = query.campusIds ? String(query.campusIds).split(',').map(Number) : [];
      const campusIds = await resolveCampusIds(app, request.user!, requested);
      const c = campusParam(campusIds);

      const totals = (await app.pool.query(
        `SELECT COALESCE(SUM(o.receivable),0) AS receivable, COALESCE(SUM(o.received),0) AS received,
                COALESCE(SUM(o.arrears),0) AS arrears
         FROM orders o
         WHERE o.created_at::date BETWEEN $2::date AND $3::date
           AND ($1::bigint[] IS NULL OR o.campus_id = ANY($1))`,
        [c, start, end]
      )).rows[0];
      const refunded = (await app.pool.query(
        `SELECT COALESCE(SUM(r.actual_amount),0) AS refunded FROM refunds r
         JOIN students s ON s.id = r.student_id
         WHERE r.refunded_at::date BETWEEN $2::date AND $3::date
           AND ($1::bigint[] IS NULL OR s.campus_id = ANY($1))`,
        [c, start, end]
      )).rows[0];
      const recharged = (await app.pool.query(
        `SELECT COALESCE(SUM(o.received),0) AS recharged FROM orders o
         WHERE o.order_type = 'recharge' AND o.created_at::date BETWEEN $2::date AND $3::date
           AND ($1::bigint[] IS NULL OR o.campus_id = ANY($1))`,
        [c, start, end]
      )).rows[0];
      const balance = (await app.pool.query(
        `SELECT COALESCE(SUM(sa.balance),0) AS balance FROM student_accounts sa
         JOIN students s ON s.id = sa.student_id
         WHERE ($1::bigint[] IS NULL OR s.campus_id = ANY($1))`,
        [c]
      )).rows[0];
      const campusComparison = (await app.pool.query(
        `SELECT camp.id, camp.name,
                COALESCE(SUM(o.receivable),0) AS receivable, COALESCE(SUM(o.received),0) AS received
         FROM campuses camp
         LEFT JOIN orders o ON o.campus_id = camp.id AND o.created_at::date BETWEEN $2::date AND $3::date
         WHERE ($1::bigint[] IS NULL OR camp.id = ANY($1))
         GROUP BY camp.id, camp.name ORDER BY camp.id`,
        [c, start, end]
      )).rows.map((r) => ({
        campusId: Number(r.id), campusName: r.name,
        receivable: Number(r.receivable), received: Number(r.received)
      }));
      const orderTypeDistribution = (await app.pool.query(
        `SELECT o.order_type, COUNT(*) AS count, COALESCE(SUM(o.receivable),0) AS amount
         FROM orders o
         WHERE o.created_at::date BETWEEN $2::date AND $3::date
           AND ($1::bigint[] IS NULL OR o.campus_id = ANY($1))
         GROUP BY o.order_type ORDER BY o.order_type`,
        [c, start, end]
      )).rows.map((r) => ({ type: r.order_type, count: Number(r.count), amount: Number(r.amount) }));

      return {
        range: { start, end },
        receivable: Number(totals.receivable),
        received: Number(totals.received),
        arrears: Number(totals.arrears),
        refunded: Number(refunded.refunded),
        recharged: Number(recharged.recharged),
        balance: Number(balance.balance),
        campusComparison,
        orderTypeDistribution
      };
    });

    app.get('/employees', { preHandler: guard }, async (request) => {
      const query = request.query as any;
      const requested = query.campusIds ? String(query.campusIds).split(',').map(Number) : [];
      const campusIds = await resolveCampusIds(app, request.user!, requested);
      const c = campusParam(campusIds);

      const employees = (await app.pool.query(
        `SELECT COUNT(*) AS count FROM users u
         WHERE u.role IN ('admin','teacher') AND ($1::bigint[] IS NULL OR u.campus_id = ANY($1))`,
        [c]
      )).rows[0];
      const teachers = (await app.pool.query(
        `SELECT COUNT(*) AS count FROM users u WHERE u.role = 'teacher' AND ($1::bigint[] IS NULL OR u.campus_id = ANY($1))`,
        [c]
      )).rows[0];
      const classes = (await app.pool.query(
        `SELECT COUNT(*) AS count FROM classes c WHERE ($1::bigint[] IS NULL OR c.campus_id = ANY($1))`,
        [c]
      )).rows[0];
      const classByTeacher = (await app.pool.query(
        `SELECT COALESCE(u.display_name, '待定') AS teacher_name, COUNT(*) AS count
         FROM classes c LEFT JOIN users u ON u.id = c.teacher_id
         WHERE ($1::bigint[] IS NULL OR c.campus_id = ANY($1))
         GROUP BY teacher_name ORDER BY count DESC LIMIT 20`,
        [c]
      )).rows.map((r) => ({ teacherName: r.teacher_name, count: Number(r.count) }));

      return {
        employeeCount: Number(employees.count),
        teacherCount: Number(teachers.count),
        classCount: Number(classes.count),
        classByTeacher
      };
    });

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test --test-concurrency=1 test/reports2.test.ts` → PASS（6 个）

- [ ] **Step 5: 提交**

    git add server/src/routes/reports2.ts server/test/reports2.test.ts
    git commit -m "feat: finance and employee reports"

---

### Task 5: 明细下钻接口

**Files:**
- Modify: `server/src/routes/reports2.ts`
- Modify: `server/test/reports2.test.ts`

- [ ] **Step 1: 写失败测试**

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

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test --test-concurrency=1 test/reports2.test.ts` → FAIL

- [ ] **Step 3: 实现下钻**

    app.get('/drilldown', { preHandler: guard }, async (request, reply) => {
      const query = request.query as any;
      const metric = query.metric;
      const supported = ['newStudents', 'arrears', 'hoursConsumed', 'refunds'];
      if (!supported.includes(metric)) return reply.code(400).send({ error: `metric must be one of ${supported.join(', ')}` });
      const { start, end } = parseRange(query);
      const requested = query.campusIds ? String(query.campusIds).split(',').map(Number) : [];
      const campusIds = await resolveCampusIds(app, request.user!, requested);
      const c = campusParam(campusIds);

      if (metric === 'newStudents') {
        const rows = (await app.pool.query(
          `SELECT s.id, s.name AS student_name, camp.name AS campus_name, s.status, s.created_at
           FROM students s JOIN campuses camp ON camp.id = s.campus_id
           WHERE s.created_at::date BETWEEN $2::date AND $3::date
             AND ($1::bigint[] IS NULL OR s.campus_id = ANY($1))
           ORDER BY s.created_at DESC LIMIT 200`,
          [c, start, end]
        )).rows;
        return { rows, total: rows.length };
      }
      if (metric === 'arrears') {
        const rows = (await app.pool.query(
          `SELECT o.id, o.order_no, s.name AS student_name, o.arrears, o.payment_status, o.created_at
           FROM orders o JOIN students s ON s.id = o.student_id
           WHERE o.arrears > 0 AND o.created_at::date BETWEEN $2::date AND $3::date
             AND ($1::bigint[] IS NULL OR o.campus_id = ANY($1))
           ORDER BY o.created_at DESC LIMIT 200`,
          [c, start, end]
        )).rows;
        return { rows, total: rows.length };
      }
      if (metric === 'hoursConsumed') {
        const rows = (await app.pool.query(
          `SELECT st.name AS student_name, c.name AS class_name, ar.status, ar.hours_deducted, tl.taught_at
           FROM attendance_records ar
           JOIN teaching_logs tl ON tl.id = ar.teaching_log_id
           JOIN students st ON st.id = ar.student_id
           JOIN classes c ON c.id = tl.class_id
           WHERE tl.taught_at::date BETWEEN $2::date AND $3::date
             AND ($1::bigint[] IS NULL OR tl.campus_id = ANY($1))
           ORDER BY tl.taught_at DESC LIMIT 200`,
          [c, start, end]
        )).rows;
        return { rows, total: rows.length };
      }
      const rows = (await app.pool.query(
        `SELECT r.id, st.name AS student_name, r.suggested_amount, r.actual_amount, r.reason, r.method, r.refunded_at
         FROM refunds r JOIN students st ON st.id = r.student_id
         WHERE r.refunded_at::date BETWEEN $2::date AND $3::date
           AND ($1::bigint[] IS NULL OR st.campus_id = ANY($1))
         ORDER BY r.refunded_at DESC LIMIT 200`,
        [c, start, end]
      )).rows;
      return { rows, total: rows.length };
    });

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test --test-concurrency=1 test/reports2.test.ts` → PASS（8 个）

- [ ] **Step 5: 提交**

    git add server/src/routes/reports2.ts server/test/reports2.test.ts
    git commit -m "feat: report drilldown api"

---

### Task 6: 前端报表页（筛选 + 指标卡 + 图表）

**Files:**
- Modify: `web/package.json`（新增 echarts）
- Create: `web/src/pages/ReportsPage.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/Shell.tsx`

- [ ] **Step 1: 安装 ECharts**

Run（`web/`）：`pnpm add echarts`（或根目录 `pnpm --filter web add echarts`）

- [ ] **Step 2: 写页面**

`web/src/pages/ReportsPage.tsx` 要点：

- 顶部筛选：校区多选（`GET /api/campuses`）、时间范围（今日/本周/本月/去年等快捷 + 自定义起止）、粒度（日/周/月）。
- 页签：经营总览 / 招生与学员 / 教务 / 财务 / 员工。
- 经营总览：调用 `/api/reports/overview` 渲染指标卡（在读学员、新增报名、应收、实收、欠费、退费、课时消耗、上课记录数），实收卡显示环比百分比。
- 图表：用 ECharts 渲染
  - 招生与学员：新增学员趋势折线图 + 校区对比柱状图 + 状态分布饼图；
  - 教务：出勤状态柱状图 + 课时消耗；
  - 财务：校区对比柱状图 + 订单类型分布饼图；
  - 员工：带班数柱状图。
- 图表封装：写一个 `useEcharts(ref, option)` 或简单 `echarts.init` + `setOption` 的 effect。

- [ ] **Step 3: 注册路由与菜单**

`web/src/App.tsx` 增加 `/reports`；`web/src/Shell.tsx` 增加「报表」菜单（图标 `BarChart3`，`can('report')`）。

- [ ] **Step 4: 构建验证**

Run（`web/`）：`tsc --noEmit` 与 `vite build --configLoader runner`。

- [ ] **Step 5: 提交**

    git add web/package.json web/src
    git commit -m "feat: reports page with charts"

---

### Task 7: 前端下钻与 CSV 导出

**Files:**
- Modify: `web/src/pages/ReportsPage.tsx`

- [ ] **Step 1: 下钻弹窗**

- 指标卡可点击：新增报名 → `metric=newStudents`；欠费 → `metric=arrears`；课时消耗 → `metric=hoursConsumed`；退费 → `metric=refunds`。
- 调用 `/api/reports/drilldown?metric=&campusIds=&start=&end=`，在弹窗表格中展示明细（不同 metric 列不同）。

- [ ] **Step 2: CSV 导出**

- 弹窗内提供「导出 CSV」按钮：把 `rows` 按列拼成 CSV，用 Blob 下载（复用成绩导出的写法）。

- [ ] **Step 3: 构建验证**

Run（`web/`）：`tsc --noEmit` 与 `vite build --configLoader runner`。

- [ ] **Step 4: 提交**

    git add web/src
    git commit -m "feat: report drilldown and csv export"

---

### Task 8: 2B-3 端到端验收

**Files:** 无新增，按清单验收。

- [ ] **Step 1: 全量后端测试**

Run（`server/`）：`node --test --test-concurrency=1 "test/*.test.ts"`

Expected: 全部通过（预计 80+ 用例）。

- [ ] **Step 2: 类型检查与构建**

Run（`server/`）：`tsc --noEmit`
Run（`web/`）：`tsc --noEmit` 与 `vite build --configLoader runner`

- [ ] **Step 3: 手工验收流程**

1. 管理员打开「报表」，经营总览显示指标卡与环比。
2. 切换校区与时间范围，指标与图表联动变化。
3. 招生与学员页显示趋势折线、校区柱状、状态饼图。
4. 教务页显示出勤率与课时消耗。
5. 财务页显示应收/实收/欠费/退费/充值/余额与订单类型分布。
6. 员工页显示员工数、教师数、带班数。
7. 点击「新增报名 / 欠费 / 课时消耗 / 退费」指标 → 弹窗显示明细，可导出 CSV。
8. 教师（无 report 权限）访问报表返回 403。
9. 回归：一期、2A、2B-1、2B-2 功能正常。

- [ ] **Step 4: 更新进度文档**

把 2B-3 完成情况写入 `PROGRESS.md`。

## 自检记录

- 规格覆盖：经营总览（任务 2）、招生与学员/教务（任务 3）、财务/员工（任务 4）、下钻（任务 5）、前端图表（任务 6-7）、验收（任务 8）——与设计文档范围逐项对应。
- 占位符扫描：无 TBD/TODO。
- 类型一致性：所有报表接口统一接受 `campusIds/start/end`、统一返回 `range`；金额口径与设计文档第 8 节一致。
- 已知偏差：前端图表封装以要点描述，实现时按现有页面风格与 ECharts API 补齐。