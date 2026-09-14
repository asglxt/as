# SchoolPal Core Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 对齐校宝的工作台、学员、成绩和角色权限核心工作流，同时保留现有业务数据和接口兼容性。

**Architecture:** 在现有 Fastify + PostgreSQL + React/Vite 架构上增加兼容迁移、分页接口、详情聚合接口和分组权限定义；前端先重构 Shell，再逐页替换列表和表单。

**Tech Stack:** Node.js 24、TypeScript、Fastify、PostgreSQL 18、React 18、Vite、ECharts。

**Spec:** `docs/superpowers/specs/2026-09-14-schoolpal-core-parity-design.md`

## Global Constraints

- 不删除或重命名已有数据库字段。
- 列表接口必须支持服务端分页和权限过滤。
- 所有新增后端行为先写失败测试。
- 所有新页面沿用现有 `Shell` 权限模型。
- 完成前运行后端测试、双端 TypeScript 检查和生产构建。

---

### Task 1: 学员扩展数据模型

**Files:**
- Create: `server/src/migrations/013_schoolpal_core.sql`
- Modify: `server/test/helpers.ts`
- Test: `server/test/students.test.ts`

**Interfaces:**
- Consumes: existing `students` and `users` tables.
- Produces: columns `students.gender`, `students.birthday`, `students.enrollment_date`, `students.discount`, `students.source`, `students.notes`, `students.archived_at`; tables `student_guardians` and `student_growth_records`; employee profile columns on `users`.

- [ ] **Step 1: Write the failing test**

```ts
test('student detail returns guardians and growth records', async () => {
  const create = await app.inject({
    method: 'POST', url: '/api/students',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { campusId: seed.campusId, name: '王小明', gender: '男', birthday: '2018-01-02' }
  });
  const detail = await app.inject({
    method: 'GET', url: `/api/students/${create.json().id}`,
    headers: { authorization: `Bearer ${seed.adminToken}` }
  });
  assert.equal(detail.statusCode, 200);
  assert.equal(detail.json().student.gender, '男');
  assert.deepEqual(detail.json().guardians, []);
  assert.deepEqual(detail.json().growthRecords, []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter server exec node --test --test-concurrency=1 test/students.test.ts`
Expected: FAIL because the extended columns and detail route do not exist.

- [ ] **Step 3: Write minimal migration**

Create `013_schoolpal_core.sql` with `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, the two new tables, indexes and no destructive statements.

- [ ] **Step 4: Run the focused test**

Run: `pnpm --filter server exec node --test --test-concurrency=1 test/students.test.ts`
Expected: still FAIL until Task 2 implements the detail route, but migration errors must be absent.

- [ ] **Step 5: Commit**

```bash
git add server/src/migrations/013_schoolpal_core.sql server/test/helpers.ts server/test/students.test.ts
git commit -m "feat: extend student data model"
```

### Task 2: 学员列表和详情接口

**Files:**
- Modify: `server/src/routes/students.ts`
- Modify: `server/src/app.ts`
- Test: `server/test/students.test.ts`

**Interfaces:**
- Produces: `GET /api/students/list`, `GET /api/students/:id`, `POST /api/students/batch`.
- `GET /api/students/list` returns `{ items, total, page, pageSize, summary }`.
- `GET /api/students/:id` returns `{ student, guardians, classes, scores, growthRecords, orders, account }`.

- [ ] **Step 1: Write failing list and batch tests**

```ts
test('student list filters by keyword and returns summary', async () => {
  const res = await app.inject({
    method: 'GET', url: '/api/students/list?keyword=张&page=1&pageSize=20',
    headers: { authorization: `Bearer ${seed.adminToken}` }
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().items[0].name, '张三');
  assert.equal(res.json().total, 1);
});

test('batch update changes student campus', async () => {
  const create = await app.inject({
    method: 'POST', url: '/api/students',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { campusId: seed.campusId, name: '批量学员' }
  });
  const res = await app.inject({
    method: 'POST', url: '/api/students/batch',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { ids: [create.json().id], campusId: seed.campusId }
  });
  assert.equal(res.json().count, 1);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm --filter server exec node --test --test-concurrency=1 test/students.test.ts`
Expected: FAIL with 404 for both new endpoints.

- [ ] **Step 3: Implement parameterized queries and detail aggregation**

Use SQL parameters only. Apply admin campus scope and teacher class scope. Return numeric IDs consistently with `Number(row.id)`.

- [ ] **Step 4: Run backend student tests**

Run: `pnpm --filter server exec node --test --test-concurrency=1 test/students.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/students.ts server/src/app.ts server/test/students.test.ts
git commit -m "feat: add student list and detail APIs"
```

### Task 3: 分组权限和员工角色接口

**Files:**
- Modify: `server/src/permissions/module_access.ts`
- Modify: `server/src/routes/roles.ts`
- Modify: `server/src/app.ts`
- Test: `server/test/roles.test.ts`

**Interfaces:**
- Produces: `GET /api/roles/permission-groups`, `GET /api/roles/staff`, `PATCH /api/roles/staff/:id`.
- Permission group item: `{ key, label, modules: Array<{ key, label }> }`.

- [ ] **Step 1: Write failing tests**

```ts
test('permission groups expose business centers', async () => {
  const res = await app.inject({
    method: 'GET', url: '/api/roles/permission-groups',
    headers: { authorization: `Bearer ${seed.adminToken}` }
  });
  assert.equal(res.statusCode, 200);
  assert.ok(res.json().some((group: any) => group.key === 'teaching'));
});

test('staff list includes multiple roles', async () => {
  const res = await app.inject({
    method: 'GET', url: '/api/roles/staff',
    headers: { authorization: `Bearer ${seed.adminToken}` }
  });
  assert.equal(res.statusCode, 200);
  assert.ok(Array.isArray(res.json()[0].roles));
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm --filter server exec node --test --test-concurrency=1 test/roles.test.ts`
Expected: FAIL with 404.

- [ ] **Step 3: Implement grouped permissions and staff queries**

Define group metadata in `module_access.ts`; keep `ModuleKey` backward compatible and add future keys. Staff update must replace roles transactionally.

- [ ] **Step 4: Run role tests**

Run: `pnpm --filter server exec node --test --test-concurrency=1 test/roles.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/permissions/module_access.ts server/src/routes/roles.ts server/src/app.ts server/test/roles.test.ts
git commit -m "feat: add grouped permissions and staff roles"
```

### Task 4: 工作台汇总接口

**Files:**
- Create: `server/src/routes/dashboard.ts`
- Modify: `server/src/app.ts`
- Test: `server/test/dashboard.test.ts`

**Interfaces:**
- Produces: `GET /api/dashboard/summary` returning `{ students, schedulesToday, teachingLogsToday, arrearsOrders, tasks, quickActions }`.

- [ ] **Step 1: Write the failing test**

```ts
test('dashboard summary returns operational counts', async () => {
  const app = await setupApp();
  const seed = await seedBase(app);
  const res = await app.inject({
    method: 'GET', url: '/api/dashboard/summary',
    headers: { authorization: `Bearer ${seed.adminToken}` }
  });
  assert.equal(res.statusCode, 200);
  assert.equal(typeof res.json().students, 'number');
  assert.ok(Array.isArray(res.json().tasks));
  await app.close();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter server exec node --test --test-concurrency=1 test/dashboard.test.ts`
Expected: FAIL with 404.

- [ ] **Step 3: Implement summary queries**

Use `students`, `schedules`, `teaching_logs` and `orders`; apply campus scope through the existing campus filter helper.

- [ ] **Step 4: Run dashboard test**

Run: `pnpm --filter server exec node --test --test-concurrency=1 test/dashboard.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/dashboard.ts server/src/app.ts server/test/dashboard.test.ts
git commit -m "feat: add dashboard summary API"
```

### Task 5: 全局 Shell 和工作台页面

**Files:**
- Modify: `web/src/Shell.tsx`
- Modify: `web/src/styles.css`
- Modify: `web/src/pages/DashboardPage.tsx`
- Modify: `web/src/api.ts`

**Interfaces:**
- Consumes: `GET /api/dashboard/summary`.
- Produces: grouped navigation, top bar, page header primitives and dashboard cards.

- [ ] **Step 1: Add dashboard typed API function and render empty states**

- [ ] **Step 2: Run production build to verify current page compiles**

Run: `pnpm --filter web build`
Expected: PASS before visual replacement.

- [ ] **Step 3: Replace Shell navigation with grouped menus**

Keep all existing routes. Do not hide routes by hard-coded role when module permission is available.

- [ ] **Step 4: Implement dashboard summary cards, task list and quick actions**

- [ ] **Step 5: Run build and browser smoke**

Run: `pnpm --filter web build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/Shell.tsx web/src/styles.css web/src/pages/DashboardPage.tsx web/src/api.ts
git commit -m "feat: add SchoolPal-style shell and dashboard"
```

### Task 6: 学员列表和详情页面

**Files:**
- Modify: `web/src/pages/StudentsPage.tsx`
- Create: `web/src/pages/StudentDetailPage.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/styles.css`

**Interfaces:**
- Consumes: `GET /api/students/list`, `GET /api/students/:id`, `POST /api/students/batch`.
- Produces: `/students` list and `/students/:id` detail route.

- [ ] **Step 1: Add list query state for `keyword`, `status`, `campusId`, `page` and `pageSize`; default to page 1 and 20 rows**

- [ ] **Step 2: Implement filter toolbar and paginated table**

- [ ] **Step 3: Implement detail page tabs for overview, classes, scores, growth, orders and account**

- [ ] **Step 4: Implement batch selection and batch campus/status changes**

- [ ] **Step 5: Run build and browser smoke**

Run: `pnpm --filter web build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/StudentsPage.tsx web/src/pages/StudentDetailPage.tsx web/src/App.tsx web/src/styles.css
git commit -m "feat: add student workspace"
```

### Task 7: 成绩录入工作区

**Files:**
- Modify: `web/src/pages/ScoresPage.tsx`
- Modify: `server/src/routes/scores.ts`
- Modify: `server/test/scores-v2.test.ts`
- Modify: `web/src/styles.css`

**Interfaces:**
- Consumes: existing project/exam APIs and score bulk endpoint.
- Produces: multi-class roster lookup and SchoolPal-style entry panels.

- [ ] **Step 1: Write failing multi-class roster test**

```ts
test('score roster supports multiple classes', async () => {
  const res = await app.inject({
    method: 'GET', url: `/api/scores/roster?classIds=${classId}`,
    headers: { authorization: `Bearer ${seed.adminToken}` }
  });
  assert.equal(res.statusCode, 200);
  assert.ok(Array.isArray(res.json()));
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm --filter server exec node --test --test-concurrency=1 test/scores-v2.test.ts`
Expected: FAIL with 404.

- [ ] **Step 3: Implement roster endpoint and score page entry workspace**

Group rows by class, include student name and phone, keep score blank for missing attempts.

- [ ] **Step 4: Run score tests and web build**

Run: `pnpm --filter server exec node --test --test-concurrency=1 test/scores-v2.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/scores.ts server/test/scores-v2.test.ts web/src/pages/ScoresPage.tsx web/src/styles.css
git commit -m "feat: add score entry workspace"
```

### Task 8: 角色和员工管理页面

**Files:**
- Modify: `web/src/pages/RolesPage.tsx`
- Modify: `web/src/styles.css`

**Interfaces:**
- Consumes: `GET /api/roles`, `GET /api/roles/permission-groups`, `GET /api/roles/staff`, `PATCH /api/roles/staff/:id`.

- [ ] **Step 1: Replace simple checkbox layout with three-column role editor**

- [ ] **Step 2: Add staff role assignment table**

- [ ] **Step 3: Verify admin can create a role and assign it to staff**

- [ ] **Step 4: Run web build and commit**

```bash
pnpm --filter web build
git add web/src/pages/RolesPage.tsx web/src/styles.css
git commit -m "feat: add role and staff management workspace"
```

### Task 9: 完整验收

**Files:**
- Modify: `PROGRESS.md`

- [ ] **Step 1: Run all backend tests**

Run: `pnpm --filter server test`
Expected: 0 failures.

- [ ] **Step 2: Run both TypeScript checks**

Run: `pnpm --filter server exec tsc --noEmit`
Run: `pnpm --filter web exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Run production build**

Run: `pnpm --filter web build`
Expected: exit 0.

- [ ] **Step 4: Browser smoke test**

Verify login, grouped navigation, dashboard, student filters and detail, score entry, role editing and staff role assignment.

- [ ] **Step 5: Update progress and commit**

```bash
git add PROGRESS.md
git commit -m "docs: record core parity completion"
```
