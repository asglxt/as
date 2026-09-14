# 二期 2A 教务与课时闭环 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有系统上交付 2A 教务与课时闭环：可配置角色权限、课程体系、班级与分班、教室、排课（含冲突检测）、报读与课时账户、记上课（点名 + 扣课时）。

**Architecture:** 沿用一期技术栈：React + TypeScript (Vite) 前端、Fastify + TypeScript (Node 24 直接运行 .ts) 后端、PostgreSQL 迁移式 schema。新增领域模块按 `server/src/routes/<domain>.ts` 划分，权限用「角色 + 适用校区 + 模块」中间件统一校验；课时变动一律写 `hour_transactions`，不直接改余额。

**Tech Stack:** Node.js 24、TypeScript、Fastify、pg、PostgreSQL 18、React 18、Vite、react-router-dom、lucide-react

**设计依据：** `docs/superpowers/specs/2026-09-14-phase2a-teaching-loop-design.md`

---

## 执行前提

- 本地 PostgreSQL 已运行，`school` 与 `school_test` 库可连接（一期已建好）。
- 依赖已安装（pnpm workspace），Node 在 PATH：`C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin`。
- 后端测试命令：在 `server/` 目录执行 `node --test --test-concurrency=1 "test/*.test.ts"`。
- 前端构建命令：在 `web/` 目录执行 `node_modules\.bin\vite.CMD build --configLoader runner`。
- 每个任务先写失败测试，再实现，再验证；测试通过后提交（若沙箱禁止写 `.git`，记录后继续，最后统一由人工提交）。

## 目录结构（新增/修改）

    server/
    ├── src/
    │   ├── migrations/
    │   │   ├── 002_roles.sql          # 角色权限
    │   │   ├── 003_lessons.sql        # 课程体系
    │   │   ├── 004_classes_rooms.sql  # 班级扩展 + 教室
    │   │   ├── 005_schedules.sql      # 排课
    │   │   ├── 006_enrollments.sql    # 报读与课时流水
    │   │   └── 007_teaching_logs.sql  # 记上课与点名
    │   ├── permissions/
    │   │   └── module_access.ts       # 模块权限 + 校区范围校验
    │   └── routes/
    │       ├── roles.ts               # 角色权限
    │       ├── lessons.ts             # 课程/类别/科目/升期
    │       ├── classrooms.ts          # 教室
    │       ├── schedules.ts           # 排课 + 冲突检测
    │       ├── enrollments.ts         # 报读 + 课时流水
    │       └── attendance.ts          # 记上课 + 点名
    └── test/
        ├── roles.test.ts
        ├── lessons.test.ts
        ├── classrooms.test.ts
        ├── schedules.test.ts
        ├── enrollments.test.ts
        └── attendance.test.ts

    web/src/pages/
    ├── RolesPage.tsx        # 角色权限
    ├── LessonsPage.tsx      # 课程（含类别/科目/升期）
    ├── ClassroomsPage.tsx   # 教室
    ├── SchedulesPage.tsx    # 排课
    ├── EnrollmentsPage.tsx  # 报读与课时
    └── AttendancePage.tsx   # 记上课

## 任务总览

- 里程碑 1（任务 1-4）：角色权限
- 里程碑 2（任务 5-7）：课程体系
- 里程碑 3（任务 8-9）：班级与分班
- 里程碑 4（任务 10）：教室
- 里程碑 5（任务 11-12）：排课与冲突检测
- 里程碑 6（任务 13-14）：报读与课时账户
- 里程碑 7（任务 15-16）：记上课与点名
- 里程碑 8（任务 17）：端到端验收

---

### Task 1: 角色权限数据表

**Files:**
- Create: `server/src/migrations/002_roles.sql`

- [ ] **Step 1: 写迁移文件**

`server/src/migrations/002_roles.sql`:

    CREATE TABLE roles (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      is_preset BOOLEAN NOT NULL DEFAULT false,
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE role_permissions (
      role_id BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      module_key TEXT NOT NULL,
      PRIMARY KEY (role_id, module_key)
    );

    CREATE TABLE role_campuses (
      role_id BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      campus_id BIGINT REFERENCES campuses(id) ON DELETE CASCADE,
      PRIMARY KEY (role_id, campus_id)
    );

    CREATE TABLE user_roles (
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role_id BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, role_id)
    );

    INSERT INTO roles (name, is_preset) VALUES
      ('机构主管', true), ('校区主管', true), ('教务', true), ('教师', true),
      ('前台', true), ('财务', true), ('人事', true), ('市场主管', true),
      ('销售员', true), ('班务', true);

    INSERT INTO role_permissions (role_id, module_key)
      SELECT id, m.key FROM roles CROSS JOIN (
        VALUES ('dashboard'), ('students'), ('classes'), ('lessons'),
               ('schedules'), ('attendance'), ('enrollments'), ('classrooms'),
               ('org'), ('employees'), ('roles')
      ) AS m(key) WHERE roles.name = '机构主管';

    INSERT INTO role_permissions (role_id, module_key)
      SELECT id, m.key FROM roles CROSS JOIN (
        VALUES ('dashboard'), ('students'), ('classes'), ('lessons'),
               ('schedules'), ('attendance'), ('enrollments'), ('classrooms')
      ) AS m(key) WHERE roles.name IN ('校区主管', '教务');

    INSERT INTO role_permissions (role_id, module_key)
      SELECT id, m.key FROM roles CROSS JOIN (
        VALUES ('dashboard'), ('classes'), ('schedules'), ('attendance')
      ) AS m(key) WHERE roles.name = '教师';

- [ ] **Step 2: 运行迁移**

Run: `$env:DATABASE_URL='postgres://school:school@localhost:5432/school'; node server/src/migrate.ts`

Expected: 输出 `migrations applied`，`schema_migrations` 多出 `002_roles.sql`。

- [ ] **Step 3: 验证表与预置角色**

Run: `$env:PGPASSWORD='school'; & 'C:\Program Files\PostgreSQL\18\bin\psql.exe' -U school -h localhost -d school -t -A -c "SELECT count(*) FROM roles; SELECT count(*) FROM role_permissions;"`

Expected: 角色 10 条；机构主管 11 条权限、校区主管与教务 8 条、教师 4 条。

- [ ] **Step 4: 提交**

    git add server/src/migrations/002_roles.sql
    git commit -m "feat: add role permission tables"

---

### Task 2: 模块权限校验

**Files:**
- Create: `server/src/permissions/module_access.ts`
- Create: `server/test/roles.test.ts`（新建，只放本任务用例，后续任务追加）

- [ ] **Step 1: 写失败测试**

`server/test/roles.test.ts`:

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
      assert.deepEqual(res.json().modules.sort(), ['attendance', 'classes', 'dashboard', 'schedules']);
    });

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test --test-concurrency=1 test/roles.test.ts`

Expected: FAIL，`/api/roles/my-permissions` 返回 404。

- [ ] **Step 3: 实现权限查询与中间件**

`server/src/permissions/module_access.ts`:

    import type { FastifyInstance } from 'fastify';
    import type { FastifyReply, FastifyRequest } from 'fastify';

    export type ModuleKey =
      | 'dashboard' | 'students' | 'classes' | 'lessons' | 'schedules'
      | 'attendance' | 'enrollments' | 'classrooms' | 'org' | 'employees' | 'roles';

    export const ALL_MODULES: ModuleKey[] = [
      'dashboard', 'students', 'classes', 'lessons', 'schedules',
      'attendance', 'enrollments', 'classrooms', 'org', 'employees', 'roles'
    ];

    export async function getMyModules(app: FastifyInstance, userId: number, role: string) {
      if (role === 'admin') return { modules: [...ALL_MODULES], campuses: 'all' as const };
      const modules = (await app.pool.query(
        `SELECT DISTINCT rp.module_key
         FROM user_roles ur
         JOIN roles r ON r.id = ur.role_id AND r.enabled
         JOIN role_permissions rp ON rp.role_id = r.id
         WHERE ur.user_id = $1`,
        [userId]
      )).rows.map((row) => row.module_key);
      const campuses = (await app.pool.query(
        `SELECT DISTINCT rc.campus_id
         FROM user_roles ur
         JOIN role_campuses rc ON rc.role_id = ur.role_id
         WHERE ur.user_id = $1`,
        [userId]
      )).rows.map((row) => row.campus_id).filter((id) => id !== null);
      return { modules, campuses };
    }

    export async function canAccessModule(app: FastifyInstance, user: { id: number; role: string }, moduleKey: ModuleKey) {
      if (user.role === 'admin') return true;
      const result = await app.pool.query(
        `SELECT 1 FROM user_roles ur
         JOIN roles r ON r.id = ur.role_id AND r.enabled
         JOIN role_permissions rp ON rp.role_id = r.id AND rp.module_key = $2
         WHERE ur.user_id = $1 LIMIT 1`,
        [user.id, moduleKey]
      );
      return Boolean(result.rowCount);
    }

    export function requireModule(moduleKey: ModuleKey) {
      return async (request: FastifyRequest, reply: FastifyReply) => {
        const user = request.user;
        if (!user) return reply.code(401).send({ error: 'unauthorized' });
        const allowed = await canAccessModule(request.server, user, moduleKey);
        if (!allowed) return reply.code(403).send({ error: 'module forbidden' });
      };
    }

`server/src/routes/roles.ts`（本任务先只加 my-permissions，角色 CRUD 在 Task 3）：

    import type { FastifyInstance } from 'fastify';
    import { authGuard } from '../auth/middleware.ts';
    import { getMyModules } from '../permissions/module_access.ts';

    export async function roleRoutes(app: FastifyInstance) {
      app.get('/my-permissions', { preHandler: [authGuard] }, async (request) => {
        return getMyModules(app, request.user!.id, request.user!.role);
      });
    }

`server/src/app.ts` 注册：

    import { roleRoutes } from './routes/roles.ts';
    await app.register(roleRoutes, { prefix: '/api/roles' });

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test --test-concurrency=1 test/roles.test.ts`

Expected: PASS，2 个测试通过。

- [ ] **Step 5: 提交**

    git add server/src/permissions server/src/routes/roles.ts server/src/app.ts server/test/roles.test.ts
    git commit -m "feat: module permission checks"
---

### Task 3: 角色 CRUD 与员工分配

**Files:**
- Modify: `server/src/routes/roles.ts`
- Modify: `server/test/roles.test.ts`

- [ ] **Step 1: 写失败测试**

在 `server/test/roles.test.ts` 末尾追加：

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

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test --test-concurrency=1 test/roles.test.ts`

Expected: FAIL，`POST /api/roles` 返回 404。

- [ ] **Step 3: 实现角色 CRUD**

在 `server/src/routes/roles.ts` 的 `roleRoutes` 中追加（保留已有 my-permissions）：

    app.get('/', { preHandler: [authGuard, requireModule('roles')] }, async () => {
      const roles = (await app.pool.query('SELECT * FROM roles ORDER BY id')).rows;
      const result = [];
      for (const role of roles) {
        const modules = (await app.pool.query('SELECT module_key FROM role_permissions WHERE role_id = $1', [role.id])).rows.map((r) => r.module_key);
        const campusIds = (await app.pool.query('SELECT campus_id FROM role_campuses WHERE role_id = $1 AND campus_id IS NOT NULL', [role.id])).rows.map((r) => r.campus_id);
        result.push({ ...role, modules, campusIds });
      }
      return result;
    });

    app.post('/', { preHandler: [authGuard, requireModule('roles')] }, async (request, reply) => {
      const body = request.body as { name?: string; modules?: string[]; campusIds?: number[] };
      if (!body.name?.trim()) return reply.code(400).send({ error: 'name required' });
      const client = await app.pool.connect();
      try {
        await client.query('BEGIN');
        const role = await client.query('INSERT INTO roles (name, is_preset) VALUES ($1, false) RETURNING *', [body.name.trim()]);
        const roleId = role.rows[0].id;
        for (const moduleKey of body.modules ?? []) {
          await client.query('INSERT INTO role_permissions (role_id, module_key) VALUES ($1, $2) ON CONFLICT DO NOTHING', [roleId, moduleKey]);
        }
        for (const campusId of body.campusIds ?? []) {
          await client.query('INSERT INTO role_campuses (role_id, campus_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [roleId, campusId]);
        }
        await client.query('COMMIT');
        return { ...role.rows[0], modules: body.modules ?? [], campusIds: body.campusIds ?? [] };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    });

    app.get('/:id', { preHandler: [authGuard, requireModule('roles')] }, async (request, reply) => {
      const id = Number((request.params as { id: string }).id);
      const role = (await app.pool.query('SELECT * FROM roles WHERE id = $1', [id])).rows[0];
      if (!role) return reply.code(404).send({ error: 'role not found' });
      const modules = (await app.pool.query('SELECT module_key FROM role_permissions WHERE role_id = $1', [id])).rows.map((r) => r.module_key);
      const campusIds = (await app.pool.query('SELECT campus_id FROM role_campuses WHERE role_id = $1 AND campus_id IS NOT NULL', [id])).rows.map((r) => r.campus_id);
      return { ...role, modules, campusIds };
    });

    app.patch('/:id', { preHandler: [authGuard, requireModule('roles')] }, async (request, reply) => {
      const id = Number((request.params as { id: string }).id);
      const body = request.body as { name?: string; enabled?: boolean; modules?: string[]; campusIds?: number[] };
      const client = await app.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('UPDATE roles SET name = COALESCE($1, name), enabled = COALESCE($2, enabled) WHERE id = $3', [body.name ?? null, body.enabled ?? null, id]);
        if (body.modules) {
          await client.query('DELETE FROM role_permissions WHERE role_id = $1', [id]);
          for (const moduleKey of body.modules) {
            await client.query('INSERT INTO role_permissions (role_id, module_key) VALUES ($1, $2)', [id, moduleKey]);
          }
        }
        if (body.campusIds) {
          await client.query('DELETE FROM role_campuses WHERE role_id = $1', [id]);
          for (const campusId of body.campusIds) {
            await client.query('INSERT INTO role_campuses (role_id, campus_id) VALUES ($1, $2)', [id, campusId]);
          }
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
      return { ok: true };
    });

    app.delete('/:id', { preHandler: [authGuard, requireModule('roles')] }, async (request, reply) => {
      const id = Number((request.params as { id: string }).id);
      const role = (await app.pool.query('SELECT is_preset FROM roles WHERE id = $1', [id])).rows[0];
      if (!role) return reply.code(404).send({ error: 'role not found' });
      if (role.is_preset) return reply.code(400).send({ error: 'preset role cannot be deleted' });
      await app.pool.query('DELETE FROM roles WHERE id = $1', [id]);
      return { ok: true };
    });

    app.post('/assign/:userId', { preHandler: [authGuard, requireModule('roles')] }, async (request, reply) => {
      const userId = Number((request.params as { userId: string }).userId);
      const body = request.body as { roleIds?: number[] };
      if (!Array.isArray(body.roleIds)) return reply.code(400).send({ error: 'roleIds required' });
      const client = await app.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM user_roles WHERE user_id = $1', [userId]);
        for (const roleId of body.roleIds) {
          await client.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, roleId]);
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
      return { ok: true };
    });

`server/src/routes/roles.ts` 顶部补充导入：

    import { authGuard } from '../auth/middleware.ts';
    import { getMyModules, requireModule } from '../permissions/module_access.ts';

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test --test-concurrency=1 test/roles.test.ts`

Expected: PASS，4 个测试通过。

- [ ] **Step 5: 提交**

    git add server/src/routes/roles.ts server/test/roles.test.ts
    git commit -m "feat: role crud and assignment"

---

### Task 4: 前端角色权限页

**Files:**
- Create: `web/src/pages/RolesPage.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/Shell.tsx`
- Modify: `web/src/auth.tsx`

- [ ] **Step 1: 扩展登录用户权限信息**

`web/src/auth.tsx` 中 `User` 增加可选字段，并在 `useEffect` 拉取 `/api/auth/me` 后追加权限查询：

    export interface User {
      id: number;
      username: string | null;
      displayName: string;
      role: 'admin' | 'teacher' | 'parent' | 'student';
      modules?: string[];
    }

在 `AuthProvider` 中登录成功后与刷新时调用：`api<{ modules: string[] }>('/api/roles/my-permissions')` 并把结果合并进 user（admin 返回全部模块）。

- [ ] **Step 2: 菜单按权限渲染**

`web/src/Shell.tsx` 中把菜单项改为按模块过滤，例如：

    const modules = user?.modules ?? [];
    const can = (key: string) => user?.role === 'admin' || modules.includes(key);
    {can('classes') && <NavLink to="/classes"><School size={16} /> 班级</NavLink>}
    {can('lessons') && <NavLink to="/lessons"><BookOpen size={16} /> 课程</NavLink>}
    {can('schedules') && <NavLink to="/schedules"><CalendarDays size={16} /> 排课</NavLink>}
    {can('attendance') && <NavLink to="/attendance"><CheckSquare size={16} /> 记上课</NavLink>}
    {can('enrollments') && <NavLink to="/enrollments"><Wallet size={16} /> 报读</NavLink>}
    {can('roles') && <NavLink to="/roles"><ShieldCheck size={16} /> 角色权限</NavLink>}

- [ ] **Step 3: 写角色权限页**

`web/src/pages/RolesPage.tsx` 要点：

    - 左侧角色列表（GET /api/roles），点击加载详情（GET /api/roles/:id）。
    - 右侧表单：角色名称、适用校区多选（GET /api/campuses）、模块勾选（固定 11 个模块的常量数组）。
    - 新建（POST /api/roles）、保存（PATCH /api/roles/:id）、删除（DELETE /api/roles/:id，预置角色禁用删除）。
    - 员工分配：输入员工 ID 或从员工列表选择，调用 POST /api/roles/assign/:userId。

模块常量：

    const MODULES = [
      ['dashboard', '工作台'], ['students', '学员'], ['classes', '班级'],
      ['lessons', '课程'], ['schedules', '排课'], ['attendance', '记上课'],
      ['enrollments', '报读'], ['classrooms', '教室'], ['org', '组织架构'],
      ['employees', '员工'], ['roles', '角色权限']
    ] as const;

- [ ] **Step 4: 注册路由**

`web/src/App.tsx`：

    import RolesPage from './pages/RolesPage.tsx';
    <Route path="/roles" element={<RequireAuth><RolesPage /></RequireAuth>} />

- [ ] **Step 5: 构建验证**

Run: `node_modules\.bin\vite.CMD build --configLoader runner`（在 `web/` 目录）

Expected: 构建成功。

- [ ] **Step 6: 提交**

    git add web/src
    git commit -m "feat: role permission page"
---

### Task 5: 课程体系数据表

**Files:**
- Create: `server/src/migrations/003_lessons.sql`

- [ ] **Step 1: 写迁移文件**

`server/src/migrations/003_lessons.sql`:

    CREATE TABLE lesson_categories (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      sort INTEGER NOT NULL DEFAULT 0,
      enabled BOOLEAN NOT NULL DEFAULT true
    );

    CREATE TABLE subjects (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      sort INTEGER NOT NULL DEFAULT 0,
      enabled BOOLEAN NOT NULL DEFAULT true
    );

    CREATE TABLE lessons (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      category_id BIGINT REFERENCES lesson_categories(id),
      subject_id BIGINT REFERENCES subjects(id),
      teaching_mode TEXT NOT NULL DEFAULT 'small_class'
        CHECK (teaching_mode IN ('one_to_one','small_class','big_class')),
      fee_mode TEXT NOT NULL DEFAULT 'per_hour'
        CHECK (fee_mode IN ('per_hour','per_period','per_time')),
      campus_id BIGINT REFERENCES campuses(id),
      status TEXT NOT NULL DEFAULT 'on_sale' CHECK (status IN ('on_sale','off_sale')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE lesson_upgrades (
      id BIGSERIAL PRIMARY KEY,
      from_lesson_id BIGINT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      to_lesson_id BIGINT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      sort INTEGER NOT NULL DEFAULT 0,
      UNIQUE (from_lesson_id, to_lesson_id)
    );

    INSERT INTO lesson_categories (name, sort) VALUES ('英语', 1), ('数学', 2), ('素质', 3);
    INSERT INTO subjects (name, sort) VALUES ('英语', 1), ('数学', 2), ('语文', 3), ('编程', 4);

- [ ] **Step 2: 运行迁移并验证**

Run: `node src/migrate.ts`（在 `server/` 目录，`DATABASE_URL` 指向 school）

Expected: 输出 `migrations applied`；`lesson_categories` 3 条、`subjects` 4 条。

- [ ] **Step 3: 提交**

    git add server/src/migrations/003_lessons.sql
    git commit -m "feat: lesson schema"

---

### Task 6: 课程 API

**Files:**
- Create: `server/src/routes/lessons.ts`
- Modify: `server/src/app.ts`
- Create: `server/test/lessons.test.ts`

- [ ] **Step 1: 写失败测试**

`server/test/lessons.test.ts`:

    import { test, beforeEach } from 'node:test';
    import assert from 'node:assert/strict';
    import { setupApp, seedBase } from './helpers.ts';

    const app = await setupApp();
    let seed: Awaited<ReturnType<typeof seedBase>>;

    beforeEach(async () => {
      seed = await seedBase(app);
    });

    test('admin creates category, subject and lesson', async () => {
      const category = await app.inject({
        method: 'POST', url: '/api/lessons/categories',
        headers: { authorization: `Bearer ${seed.adminToken}` },
        payload: { name: '英语' }
      });
      assert.equal(category.statusCode, 200);
      const subject = await app.inject({
        method: 'POST', url: '/api/lessons/subjects',
        headers: { authorization: `Bearer ${seed.adminToken}` },
        payload: { name: '英语' }
      });
      const lesson = await app.inject({
        method: 'POST', url: '/api/lessons',
        headers: { authorization: `Bearer ${seed.adminToken}` },
        payload: {
          name: 'Genuis3', categoryId: category.json().id, subjectId: subject.json().id,
          teachingMode: 'small_class', feeMode: 'per_hour', campusId: seed.campusId
        }
      });
      assert.equal(lesson.statusCode, 200);
      assert.equal(lesson.json().name, 'Genuis3');
    });

    test('lesson list returns class count', async () => {
      const list = await app.inject({
        method: 'GET', url: '/api/lessons',
        headers: { authorization: `Bearer ${seed.adminToken}` }
      });
      assert.equal(list.statusCode, 200);
      assert.ok(Array.isArray(list.json()));
    });

    test('teacher cannot create lesson', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/lessons',
        headers: { authorization: `Bearer ${seed.teacherToken}` },
        payload: { name: 'X' }
      });
      assert.equal(res.statusCode, 403);
    });

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test --test-concurrency=1 test/lessons.test.ts`

Expected: FAIL，`/api/lessons` 返回 404。

- [ ] **Step 3: 实现课程路由**

`server/src/routes/lessons.ts`:

    import type { FastifyInstance } from 'fastify';
    import { authGuard } from '../auth/middleware.ts';
    import { requireModule } from '../permissions/module_access.ts';

    export async function lessonRoutes(app: FastifyInstance) {
      const guard = [authGuard, requireModule('lessons')];

      app.get('/categories', { preHandler: guard }, async () => {
        return (await app.pool.query('SELECT * FROM lesson_categories ORDER BY sort, id')).rows;
      });
      app.post('/categories', { preHandler: guard }, async (request, reply) => {
        const body = request.body as { name?: string; sort?: number };
        if (!body.name?.trim()) return reply.code(400).send({ error: 'name required' });
        const result = await app.pool.query(
          'INSERT INTO lesson_categories (name, sort) VALUES ($1, $2) RETURNING *',
          [body.name.trim(), body.sort ?? 0]
        );
        return result.rows[0];
      });

      app.get('/subjects', { preHandler: guard }, async () => {
        return (await app.pool.query('SELECT * FROM subjects ORDER BY sort, id')).rows;
      });
      app.post('/subjects', { preHandler: guard }, async (request, reply) => {
        const body = request.body as { name?: string; sort?: number };
        if (!body.name?.trim()) return reply.code(400).send({ error: 'name required' });
        const result = await app.pool.query(
          'INSERT INTO subjects (name, sort) VALUES ($1, $2) RETURNING *',
          [body.name.trim(), body.sort ?? 0]
        );
        return result.rows[0];
      });

      app.get('/', { preHandler: guard }, async (request) => {
        const keyword = (request.query as { keyword?: string }).keyword;
        const result = await app.pool.query(
          `SELECT l.*, c.name AS category_name, s.name AS subject_name,
                  (SELECT COUNT(*) FROM classes cl WHERE cl.lesson_id = l.id) AS class_count
           FROM lessons l
           LEFT JOIN lesson_categories c ON c.id = l.category_id
           LEFT JOIN subjects s ON s.id = l.subject_id
           WHERE ($1::text IS NULL OR l.name ILIKE '%' || $1 || '%')
           ORDER BY l.id DESC`,
          [keyword ?? null]
        );
        return result.rows;
      });
      app.post('/', { preHandler: guard }, async (request, reply) => {
        const body = request.body as {
          name?: string; categoryId?: number; subjectId?: number;
          teachingMode?: string; feeMode?: string; campusId?: number;
        };
        if (!body.name?.trim()) return reply.code(400).send({ error: 'name required' });
        const result = await app.pool.query(
          `INSERT INTO lessons (name, category_id, subject_id, teaching_mode, fee_mode, campus_id)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [body.name.trim(), body.categoryId ?? null, body.subjectId ?? null,
           body.teachingMode ?? 'small_class', body.feeMode ?? 'per_hour', body.campusId ?? null]
        );
        return result.rows[0];
      });
      app.patch('/:id', { preHandler: guard }, async (request, reply) => {
        const id = Number((request.params as { id: string }).id);
        const body = request.body as { name?: string; status?: string; categoryId?: number; subjectId?: number };
        const result = await app.pool.query(
          `UPDATE lessons SET name = COALESCE($1, name), status = COALESCE($2, status),
             category_id = COALESCE($3, category_id), subject_id = COALESCE($4, subject_id)
           WHERE id = $5 RETURNING *`,
          [body.name ?? null, body.status ?? null, body.categoryId ?? null, body.subjectId ?? null, id]
        );
        if (!result.rowCount) return reply.code(404).send({ error: 'lesson not found' });
        return result.rows[0];
      });

      app.get('/upgrades', { preHandler: guard }, async () => {
        return (await app.pool.query('SELECT * FROM lesson_upgrades ORDER BY sort, id')).rows;
      });
      app.post('/upgrades', { preHandler: guard }, async (request, reply) => {
        const body = request.body as { fromLessonId?: number; toLessonId?: number; sort?: number };
        if (!body.fromLessonId || !body.toLessonId) return reply.code(400).send({ error: 'fromLessonId and toLessonId required' });
        const result = await app.pool.query(
          'INSERT INTO lesson_upgrades (from_lesson_id, to_lesson_id, sort) VALUES ($1, $2, $3) RETURNING *',
          [body.fromLessonId, body.toLessonId, body.sort ?? 0]
        );
        return result.rows[0];
      });
    }

`server/src/app.ts` 注册：

    import { lessonRoutes } from './routes/lessons.ts';
    await app.register(lessonRoutes, { prefix: '/api/lessons' });

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test --test-concurrency=1 test/lessons.test.ts`

Expected: PASS，3 个测试通过（教师无权限依赖 admin 拥有全模块权限）。

- [ ] **Step 5: 提交**

    git add server/src/routes/lessons.ts server/src/app.ts server/test/lessons.test.ts
    git commit -m "feat: lesson api"
---

### Task 7: 前端课程页

**Files:**
- Create: `web/src/pages/LessonsPage.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/Shell.tsx`

- [ ] **Step 1: 写页面**

`web/src/pages/LessonsPage.tsx` 要点：

- 页签：课程列表 / 课程类别 / 科目设置 / 升期关系。
- 课程列表：调用 `GET /api/lessons`，表格列「课程名称、课程类别、科目、授课模式、收费模式、开课校区、开班数、状态」；顶部「新增课程」表单（名称、类别下拉、科目下拉、授课模式、收费模式、校区下拉）。
- 课程类别：`GET/POST /api/lessons/categories`。
- 科目设置：`GET/POST /api/lessons/subjects`。
- 升期关系：`GET/POST /api/lessons/upgrades`，下拉选择「从课程 → 到课程」。

- [ ] **Step 2: 注册路由与菜单**

`web/src/App.tsx`：

    import LessonsPage from './pages/LessonsPage.tsx';
    <Route path="/lessons" element={<RequireAuth><LessonsPage /></RequireAuth>} />

`web/src/Shell.tsx` 菜单增加：

    {can('lessons') && <NavLink to="/lessons"><BookOpen size={16} /> 课程</NavLink>}

- [ ] **Step 3: 构建验证**

Run: `node_modules\.bin\vite.CMD build --configLoader runner`

Expected: 构建成功。

- [ ] **Step 4: 提交**

    git add web/src
    git commit -m "feat: lesson page"

---

### Task 8: 班级扩展与分班 API

**Files:**
- Create: `server/src/migrations/004_classes_rooms.sql`
- Modify: `server/src/routes/classes.ts`
- Create: `server/test/classrooms.test.ts`（教室用例在 Task 10，本任务先建文件放分班用例）

- [ ] **Step 1: 写迁移文件**

`server/src/migrations/004_classes_rooms.sql`:

    ALTER TABLE classes ADD COLUMN lesson_id BIGINT REFERENCES lessons(id);
    ALTER TABLE classes ADD COLUMN assistant_id BIGINT REFERENCES users(id);
    ALTER TABLE classes ADD COLUMN capacity INTEGER;
    ALTER TABLE classes ADD COLUMN start_date DATE;
    ALTER TABLE classes ADD COLUMN recruit_status TEXT NOT NULL DEFAULT 'recruiting'
      CHECK (recruit_status IN ('recruiting','full','closed'));

    ALTER TABLE class_students ADD COLUMN lesson_id BIGINT REFERENCES lessons(id);
    ALTER TABLE class_students ADD COLUMN teacher_id BIGINT REFERENCES users(id);
    ALTER TABLE class_students ADD COLUMN start_date DATE;
    ALTER TABLE class_students ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
      CHECK (status IN ('active','stopped','transferred','finished'));
    ALTER TABLE class_students ADD COLUMN is_upgraded BOOLEAN NOT NULL DEFAULT false;

    CREATE TABLE classrooms (
      id BIGSERIAL PRIMARY KEY,
      campus_id BIGINT NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      capacity INTEGER,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (campus_id, name)
    );

- [ ] **Step 2: 运行迁移**

Run: `node src/migrate.ts`（在 `server/` 目录）

Expected: `migrations applied`。

- [ ] **Step 3: 写分班测试**

在 `server/test/classes.test.ts` 末尾追加（复用一期已有的 classes 测试文件）：

    test('class supports lesson, teacher, assistant and capacity', async () => {
      const lesson = await app.pool.query("INSERT INTO lessons (name) VALUES ('Genuis3') RETURNING id");
      const teacherId = (await app.pool.query("SELECT id FROM users WHERE username = 'teacher'")).rows[0].id;
      const create = await app.inject({
        method: 'POST', url: '/api/classes',
        headers: { authorization: `Bearer ${seed.adminToken}` },
        payload: {
          campusId: seed.campusId, name: 'G3D 新班', subject: '英语', grade: '三年级',
          lessonId: lesson.rows[0].id, teacherId, assistantId: teacherId, capacity: 20, startDate: '2026-09-01'
        }
      });
      assert.equal(create.statusCode, 200);
      assert.equal(Number(create.json().capacity), 20);
    });

    test('assignment records lesson and teacher', async () => {
      const lesson = await app.pool.query("INSERT INTO lessons (name) VALUES ('G1') RETURNING id");
      const teacherId = (await app.pool.query("SELECT id FROM users WHERE username = 'teacher'")).rows[0].id;
      const cls = await app.pool.query(
        "INSERT INTO classes (campus_id, name, subject, grade, lesson_id, teacher_id) VALUES ($1, 'G1A', '英语', '一年级', $2, $3) RETURNING id",
        [seed.campusId, lesson.rows[0].id, teacherId]
      );
      const student = await app.pool.query("INSERT INTO students (campus_id, name) VALUES ($1, '小明') RETURNING id", [seed.campusId]);
      const res = await app.inject({
        method: 'POST', url: `/api/classes/${cls.rows[0].id}/students`,
        headers: { authorization: `Bearer ${seed.adminToken}` },
        payload: { studentId: student.rows[0].id, lessonId: lesson.rows[0].id, teacherId, startDate: '2026-09-01' }
      });
      assert.equal(res.statusCode, 200);
      const row = await app.pool.query('SELECT * FROM class_students WHERE class_id = $1 AND student_id = $2', [cls.rows[0].id, student.rows[0].id]);
      assert.equal(Number(row.rows[0].lesson_id), Number(lesson.rows[0].id));
      assert.equal(row.rows[0].status, 'active');
    });

- [ ] **Step 4: 运行测试确认失败**

Run: `node --test --test-concurrency=1 test/classes.test.ts`

Expected: FAIL，`POST /api/classes` 忽略新字段或新增分班接口 404。

- [ ] **Step 5: 实现班级扩展接口**

`server/src/routes/classes.ts` 修改 `POST /` 的 body 与 SQL，支持 `lessonId/assistantId/capacity/startDate/recruitStatus`：

    const body = request.body as {
      campusId?: number; name?: string; subject?: string; grade?: string;
      teacherId?: number; schedule?: string; lessonId?: number;
      assistantId?: number; capacity?: number; startDate?: string; recruitStatus?: string;
    };
    const result = await app.pool.query(
      `INSERT INTO classes (campus_id, name, subject, grade, schedule, teacher_id, lesson_id, assistant_id, capacity, start_date, recruit_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [body.campusId, body.name?.trim(), body.subject?.trim(), body.grade?.trim(), body.schedule ?? null,
       body.teacherId ?? null, body.lessonId ?? null, body.assistantId ?? null,
       body.capacity ?? null, body.startDate ?? null, body.recruitStatus ?? 'recruiting']
    );

新增分班接口：

    app.post('/:id/students', { preHandler: [authGuard, requireModule('classes')] }, async (request, reply) => {
      const classId = Number((request.params as { id: string }).id);
      const body = request.body as { studentId?: number; lessonId?: number; teacherId?: number; startDate?: string };
      if (!body.studentId) return reply.code(400).send({ error: 'studentId required' });
      const result = await app.pool.query(
        `INSERT INTO class_students (class_id, student_id, lesson_id, teacher_id, start_date)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (class_id, student_id) DO UPDATE
           SET left_at = NULL, status = 'active', lesson_id = EXCLUDED.lesson_id,
               teacher_id = EXCLUDED.teacher_id, start_date = EXCLUDED.start_date
         RETURNING *`,
        [classId, body.studentId, body.lessonId ?? null, body.teacherId ?? null, body.startDate ?? null]
      );
      return result.rows[0];
    });

班级列表 SQL 增加 `lesson_id`、`capacity`、`teacher_name`、`student_count` 字段。

- [ ] **Step 6: 运行测试确认通过**

Run: `node --test --test-concurrency=1 test/classes.test.ts`

Expected: PASS（一期 2 个 + 2A 2 个）。

- [ ] **Step 7: 提交**

    git add server/src/migrations/004_classes_rooms.sql server/src/routes/classes.ts server/test/classes.test.ts
    git commit -m "feat: class lesson fields and assignment api"

---

### Task 9: 前端班级与分班页

**Files:**
- Modify: `web/src/pages/ClassesPage.tsx`

- [ ] **Step 1: 扩展班级页**

- 新增班级表单增加：所属课程（`GET /api/lessons`）、班主任（员工下拉，先用 `GET /api/auth/me` 与员工接口；2A 可先手填 ID）、助教、满班人数、开班日期、招生状态。
- 班级列表列增加：所属课程、人数、班主任、助教、开班日期、招生状态。
- 增加「分班」弹窗：选择学员（`GET /api/students`）+ 报读课程，调用 `POST /api/classes/:id/students`。

- [ ] **Step 2: 构建验证**

Run: `node_modules\.bin\vite.CMD build --configLoader runner`

Expected: 构建成功。

- [ ] **Step 3: 提交**

    git add web/src/pages/ClassesPage.tsx
    git commit -m "feat: class and assignment page"

---

### Task 10: 教室 API 与页面

**Files:**
- Create: `server/src/routes/classrooms.ts`
- Modify: `server/src/app.ts`
- Modify: `server/test/classrooms.test.ts`
- Create: `web/src/pages/ClassroomsPage.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/Shell.tsx`

- [ ] **Step 1: 写失败测试**

`server/test/classrooms.test.ts`:

    import { test, beforeEach } from 'node:test';
    import assert from 'node:assert/strict';
    import { setupApp, seedBase } from './helpers.ts';

    const app = await setupApp();
    let seed: Awaited<ReturnType<typeof seedBase>>;

    beforeEach(async () => {
      seed = await seedBase(app);
    });

    test('admin creates classroom in campus', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/classrooms',
        headers: { authorization: `Bearer ${seed.adminToken}` },
        payload: { campusId: seed.campusId, name: '8教室', capacity: 30 }
      });
      assert.equal(res.statusCode, 200);
      const list = await app.inject({
        method: 'GET', url: `/api/classrooms?campusId=${seed.campusId}`,
        headers: { authorization: `Bearer ${seed.adminToken}` }
      });
      assert.equal(list.json().length, 1);
      assert.equal(list.json()[0].name, '8教室');
    });

    test('duplicate classroom name in same campus rejected', async () => {
      await app.inject({
        method: 'POST', url: '/api/classrooms',
        headers: { authorization: `Bearer ${seed.adminToken}` },
        payload: { campusId: seed.campusId, name: '8教室' }
      });
      const res = await app.inject({
        method: 'POST', url: '/api/classrooms',
        headers: { authorization: `Bearer ${seed.adminToken}` },
        payload: { campusId: seed.campusId, name: '8教室' }
      });
      assert.equal(res.statusCode, 409);
    });

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test --test-concurrency=1 test/classrooms.test.ts`

Expected: FAIL，`/api/classrooms` 返回 404。

- [ ] **Step 3: 实现教室路由**

`server/src/routes/classrooms.ts`:

    import type { FastifyInstance } from 'fastify';
    import { authGuard } from '../auth/middleware.ts';
    import { requireModule } from '../permissions/module_access.ts';

    export async function classroomRoutes(app: FastifyInstance) {
      const guard = [authGuard, requireModule('classrooms')];

      app.get('/', { preHandler: guard }, async (request) => {
        const campusId = Number((request.query as { campusId?: string }).campusId) || null;
        return (await app.pool.query(
          `SELECT * FROM classrooms WHERE ($1::bigint IS NULL OR campus_id = $1) ORDER BY campus_id, name`,
          [campusId]
        )).rows;
      });

      app.post('/', { preHandler: guard }, async (request, reply) => {
        const body = request.body as { campusId?: number; name?: string; capacity?: number };
        if (!body.campusId || !body.name?.trim()) return reply.code(400).send({ error: 'campusId and name required' });
        try {
          const result = await app.pool.query(
            'INSERT INTO classrooms (campus_id, name, capacity) VALUES ($1, $2, $3) RETURNING *',
            [body.campusId, body.name.trim(), body.capacity ?? null]
          );
          return result.rows[0];
        } catch (err: any) {
          if (err.code === '23505') return reply.code(409).send({ error: 'classroom name exists in campus' });
          throw err;
        }
      });

      app.patch('/:id', { preHandler: guard }, async (request, reply) => {
        const id = Number((request.params as { id: string }).id);
        const body = request.body as { name?: string; capacity?: number; status?: string };
        const result = await app.pool.query(
          `UPDATE classrooms SET name = COALESCE($1, name), capacity = COALESCE($2, capacity), status = COALESCE($3, status)
           WHERE id = $4 RETURNING *`,
          [body.name ?? null, body.capacity ?? null, body.status ?? null, id]
        );
        if (!result.rowCount) return reply.code(404).send({ error: 'classroom not found' });
        return result.rows[0];
      });
    }

`server/src/app.ts` 注册：

    import { classroomRoutes } from './routes/classrooms.ts';
    await app.register(classroomRoutes, { prefix: '/api/classrooms' });

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test --test-concurrency=1 test/classrooms.test.ts`

Expected: PASS，2 个测试通过。

- [ ] **Step 5: 前端页面**

`web/src/pages/ClassroomsPage.tsx`：按校区筛选教室列表，表单新增教室（校区、名称、容量），支持启用/停用。

- [ ] **Step 6: 注册路由并构建**

`web/src/App.tsx` 增加 `/classrooms` 路由；`web/src/Shell.tsx` 增加菜单项（图标 `DoorOpen`）。

Run: `node_modules\.bin\vite.CMD build --configLoader runner`

Expected: 构建成功。

- [ ] **Step 7: 提交**

    git add server/src/routes/classrooms.ts server/src/app.ts server/test/classrooms.test.ts web/src
    git commit -m "feat: classroom api and page"
---

### Task 11: 排课数据表与冲突检测 API

**Files:**
- Create: `server/src/migrations/005_schedules.sql`
- Create: `server/src/routes/schedules.ts`
- Modify: `server/src/app.ts`
- Create: `server/test/schedules.test.ts`

- [ ] **Step 1: 写迁移文件**

`server/src/migrations/005_schedules.sql`:

    CREATE TABLE schedules (
      id BIGSERIAL PRIMARY KEY,
      class_id BIGINT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      campus_id BIGINT NOT NULL REFERENCES campuses(id),
      schedule_date DATE NOT NULL,
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      teacher_id BIGINT REFERENCES users(id),
      classroom_id BIGINT REFERENCES classrooms(id),
      is_recorded BOOLEAN NOT NULL DEFAULT false,
      has_trial BOOLEAN NOT NULL DEFAULT false,
      status TEXT NOT NULL DEFAULT 'normal' CHECK (status IN ('normal','cancelled')),
      created_by BIGINT REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CHECK (end_time > start_time)
    );

    CREATE INDEX idx_schedules_date ON schedules(schedule_date);
    CREATE INDEX idx_schedules_teacher ON schedules(teacher_id, schedule_date);
    CREATE INDEX idx_schedules_classroom ON schedules(classroom_id, schedule_date);
    CREATE INDEX idx_schedules_class ON schedules(class_id, schedule_date);

- [ ] **Step 2: 写失败测试**

`server/test/schedules.test.ts`:

    import { test, beforeEach } from 'node:test';
    import assert from 'node:assert/strict';
    import { setupApp, seedBase } from './helpers.ts';

    const app = await setupApp();
    let seed: Awaited<ReturnType<typeof seedBase>>;
    let classId = 0;
    let classroomId = 0;
    let teacherId = 0;

    beforeEach(async () => {
      seed = await seedBase(app);
      teacherId = (await app.pool.query("SELECT id FROM users WHERE username = 'teacher'")).rows[0].id;
      const cls = await app.inject({
        method: 'POST', url: '/api/classes',
        headers: { authorization: `Bearer ${seed.adminToken}` },
        payload: { campusId: seed.campusId, name: 'G3D', subject: '英语', grade: '三年级', teacherId }
      });
      classId = cls.json().id;
      const room = await app.inject({
        method: 'POST', url: '/api/classrooms',
        headers: { authorization: `Bearer ${seed.adminToken}` },
        payload: { campusId: seed.campusId, name: '8教室', capacity: 30 }
      });
      classroomId = room.json().id;
    });

    test('create schedule and list by week', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/schedules',
        headers: { authorization: `Bearer ${seed.adminToken}` },
        payload: {
          classId, campusId: seed.campusId, date: '2026-09-15',
          startTime: '19:00', endTime: '20:30', teacherId, classroomId
        }
      });
      assert.equal(res.statusCode, 200);
      const list = await app.inject({
        method: 'GET', url: '/api/schedules?start=2026-09-14&end=2026-09-20',
        headers: { authorization: `Bearer ${seed.adminToken}` }
      });
      assert.equal(list.json().length, 1);
    });

    test('teacher conflict is rejected', async () => {
      await app.inject({
        method: 'POST', url: '/api/schedules',
        headers: { authorization: `Bearer ${seed.adminToken}` },
        payload: { classId, campusId: seed.campusId, date: '2026-09-15', startTime: '19:00', endTime: '20:30', teacherId, classroomId }
      });
      const cls2 = await app.pool.query(
        "INSERT INTO classes (campus_id, name, subject, grade) VALUES ($1, 'G3E', '英语', '三年级') RETURNING id",
        [seed.campusId]
      );
      const conflict = await app.inject({
        method: 'POST', url: '/api/schedules',
        headers: { authorization: `Bearer ${seed.adminToken}` },
        payload: { classId: cls2.rows[0].id, campusId: seed.campusId, date: '2026-09-15', startTime: '20:00', endTime: '21:00', teacherId }
      });
      assert.equal(conflict.statusCode, 409);
      assert.match(conflict.json().error, /教师/);
    });

    test('classroom conflict is rejected', async () => {
      await app.inject({
        method: 'POST', url: '/api/schedules',
        headers: { authorization: `Bearer ${seed.adminToken}` },
        payload: { classId, campusId: seed.campusId, date: '2026-09-16', startTime: '19:00', endTime: '20:30', teacherId, classroomId }
      });
      const cls2 = await app.pool.query(
        "INSERT INTO classes (campus_id, name, subject, grade) VALUES ($1, 'G3F', '英语', '三年级') RETURNING id",
        [seed.campusId]
      );
      const conflict = await app.inject({
        method: 'POST', url: '/api/schedules',
        headers: { authorization: `Bearer ${seed.adminToken}` },
        payload: { classId: cls2.rows[0].id, campusId: seed.campusId, date: '2026-09-16', startTime: '20:00', endTime: '21:00', classroomId }
      });
      assert.equal(conflict.statusCode, 409);
      assert.match(conflict.json().error, /教室/);
    });

    test('adjacent times are allowed', async () => {
      await app.inject({
        method: 'POST', url: '/api/schedules',
        headers: { authorization: `Bearer ${seed.adminToken}` },
        payload: { classId, campusId: seed.campusId, date: '2026-09-17', startTime: '19:00', endTime: '20:30', teacherId }
      });
      const cls2 = await app.pool.query(
        "INSERT INTO classes (campus_id, name, subject, grade) VALUES ($1, 'G3G', '英语', '三年级') RETURNING id",
        [seed.campusId]
      );
      const ok = await app.inject({
        method: 'POST', url: '/api/schedules',
        headers: { authorization: `Bearer ${seed.adminToken}` },
        payload: { classId: cls2.rows[0].id, campusId: seed.campusId, date: '2026-09-17', startTime: '20:30', endTime: '22:00', teacherId }
      });
      assert.equal(ok.statusCode, 200);
    });

- [ ] **Step 3: 运行测试确认失败**

Run: `node --test --test-concurrency=1 test/schedules.test.ts`

Expected: FAIL，`/api/schedules` 返回 404。

- [ ] **Step 4: 实现排课路由与冲突检测**

`server/src/routes/schedules.ts`:

    import type { FastifyInstance } from 'fastify';
    import { authGuard } from '../auth/middleware.ts';
    import { requireModule } from '../permissions/module_access.ts';
    import { writeAudit } from '../audit.ts';

    interface ScheduleInput {
      classId?: number; campusId?: number; date?: string;
      startTime?: string; endTime?: string;
      teacherId?: number; classroomId?: number; hasTrial?: boolean;
    }

    async function findConflict(app: FastifyInstance, input: ScheduleInput) {
      const rows = (await app.pool.query(
        `SELECT id, teacher_id, classroom_id, class_id
         FROM schedules
         WHERE schedule_date = $1 AND status = 'normal'
           AND start_time < $2 AND end_time > $3
           AND (teacher_id = $4 OR classroom_id = $5 OR class_id = $6)`,
        [input.date, input.endTime, input.startTime, input.teacherId ?? -1, input.classroomId ?? -1, input.classId ?? -1]
      )).rows;
      if (rows.some((r) => r.teacher_id === input.teacherId)) return '教师在该时段已有课程';
      if (rows.some((r) => r.classroom_id === input.classroomId)) return '教室在该时段已被占用';
      if (rows.some((r) => r.class_id === input.classId)) return '班级在该时段已有课程';
      return null;
    }

    export async function scheduleRoutes(app: FastifyInstance) {
      const guard = [authGuard, requireModule('schedules')];

      app.get('/', { preHandler: guard }, async (request) => {
        const query = request.query as { start?: string; end?: string; teacherId?: string; classroomId?: string; classId?: string };
        const result = await app.pool.query(
          `SELECT s.*, c.name AS class_name, u.display_name AS teacher_name, r.name AS classroom_name, camp.name AS campus_name
           FROM schedules s
           JOIN classes c ON c.id = s.class_id
           LEFT JOIN users u ON u.id = s.teacher_id
           LEFT JOIN classrooms r ON r.id = s.classroom_id
           JOIN campuses camp ON camp.id = s.campus_id
           WHERE ($1::date IS NULL OR s.schedule_date >= $1)
             AND ($2::date IS NULL OR s.schedule_date <= $2)
             AND ($3::bigint IS NULL OR s.teacher_id = $3)
             AND ($4::bigint IS NULL OR s.classroom_id = $4)
             AND ($5::bigint IS NULL OR s.class_id = $5)
           ORDER BY s.schedule_date, s.start_time`,
          [query.start ?? null, query.end ?? null, query.teacherId ? Number(query.teacherId) : null,
           query.classroomId ? Number(query.classroomId) : null, query.classId ? Number(query.classId) : null]
        );
        return result.rows;
      });

      app.post('/', { preHandler: guard }, async (request, reply) => {
        const body = request.body as ScheduleInput;
        if (!body.classId || !body.campusId || !body.date || !body.startTime || !body.endTime) {
          return reply.code(400).send({ error: 'classId, campusId, date, startTime, endTime required' });
        }
        const conflict = await findConflict(app, body);
        if (conflict) return reply.code(409).send({ error: conflict });
        const result = await app.pool.query(
          `INSERT INTO schedules (class_id, campus_id, schedule_date, start_time, end_time, teacher_id, classroom_id, has_trial, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
          [body.classId, body.campusId, body.date, body.startTime, body.endTime,
           body.teacherId ?? null, body.classroomId ?? null, body.hasTrial ?? false, request.user!.id]
        );
        await writeAudit(app, request.user!.id, 'schedule_create', 'schedule', result.rows[0].id, { ...body });
        return result.rows[0];
      });

      app.patch('/:id', { preHandler: guard }, async (request, reply) => {
        const id = Number((request.params as { id: string }).id);
        const body = request.body as ScheduleInput;
        const current = (await app.pool.query('SELECT * FROM schedules WHERE id = $1', [id])).rows[0];
        if (!current) return reply.code(404).send({ error: 'schedule not found' });
        const merged: ScheduleInput = {
          classId: body.classId ?? current.class_id,
          campusId: body.campusId ?? current.campus_id,
          date: body.date ?? current.schedule_date,
          startTime: body.startTime ?? current.start_time,
          endTime: body.endTime ?? current.end_time,
          teacherId: body.teacherId ?? current.teacher_id,
          classroomId: body.classroomId ?? current.classroom_id
        };
        const conflict = await findConflict(app, merged);
        if (conflict) return reply.code(409).send({ error: conflict });
        const result = await app.pool.query(
          `UPDATE schedules SET class_id = $1, campus_id = $2, schedule_date = $3, start_time = $4, end_time = $5,
             teacher_id = $6, classroom_id = $7 WHERE id = $8 RETURNING *`,
          [merged.classId, merged.campusId, merged.date, merged.startTime, merged.endTime,
           merged.teacherId ?? null, merged.classroomId ?? null, id]
        );
        await writeAudit(app, request.user!.id, 'schedule_update', 'schedule', id, { ...merged });
        return result.rows[0];
      });

      app.delete('/:id', { preHandler: guard }, async (request, reply) => {
        const id = Number((request.params as { id: string }).id);
        const result = await app.pool.query("UPDATE schedules SET status = 'cancelled' WHERE id = $1 RETURNING *", [id]);
        if (!result.rowCount) return reply.code(404).send({ error: 'schedule not found' });
        await writeAudit(app, request.user!.id, 'schedule_cancel', 'schedule', id, {});
        return { ok: true };
      });
    }

`server/src/app.ts` 注册：

    import { scheduleRoutes } from './routes/schedules.ts';
    await app.register(scheduleRoutes, { prefix: '/api/schedules' });

- [ ] **Step 5: 运行测试确认通过**

Run: `node --test --test-concurrency=1 test/schedules.test.ts`

Expected: PASS，4 个测试通过。

- [ ] **Step 6: 提交**

    git add server/src/migrations/005_schedules.sql server/src/routes/schedules.ts server/src/app.ts server/test/schedules.test.ts
    git commit -m "feat: schedule api with conflict detection"

---

### Task 12: 前端排课页

**Files:**
- Create: `web/src/pages/SchedulesPage.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/Shell.tsx`

- [ ] **Step 1: 写页面**

`web/src/pages/SchedulesPage.tsx` 要点：

- 顶部：周切换（上一周/本周/下一周）、四种视图按钮（时间/教师/教室/班级）。
- 主区域：7 列（周一至周日）× 15 行（7:00-22:00）的网格；按 `GET /api/schedules?start=&end=` 渲染课程卡片。
- 课程卡片：班级名称 + 教师 + 教室；教师为空显示「待定」。
- 新建/编辑弹窗：班级、日期、开始/结束时间、教师、教室；提交后如返回 409 显示冲突原因。
- 筛选：校区、教师、教室、是否记上课。

- [ ] **Step 2: 注册路由与菜单**

`web/src/App.tsx`：`<Route path="/schedules" element={<RequireAuth><SchedulesPage /></RequireAuth>} />`
`web/src/Shell.tsx` 菜单：`{can('schedules') && <NavLink to="/schedules"><CalendarDays size={16} /> 排课</NavLink>}`

- [ ] **Step 3: 构建验证**

Run: `node_modules\.bin\vite.CMD build --configLoader runner`

Expected: 构建成功。

- [ ] **Step 4: 提交**

    git add web/src
    git commit -m "feat: schedule page"
---

### Task 13: 报读与课时账户 API

**Files:**
- Create: `server/src/migrations/006_enrollments.sql`
- Create: `server/src/routes/enrollments.ts`
- Modify: `server/src/app.ts`
- Create: `server/test/enrollments.test.ts`

- [ ] **Step 1: 写迁移文件**

`server/src/migrations/006_enrollments.sql`:

    CREATE TABLE enrollments (
      id BIGSERIAL PRIMARY KEY,
      student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      lesson_id BIGINT NOT NULL REFERENCES lessons(id),
      campus_id BIGINT NOT NULL REFERENCES campuses(id),
      purchased_hours NUMERIC(10,2) NOT NULL DEFAULT 0,
      used_hours NUMERIC(10,2) NOT NULL DEFAULT 0,
      remaining_hours NUMERIC(10,2) NOT NULL DEFAULT 0,
      total_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
      paid_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
      used_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
      remaining_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
      arrears NUMERIC(12,2) NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','stopped','finished','refunded')),
      enrolled_at DATE NOT NULL DEFAULT CURRENT_DATE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (student_id, lesson_id, campus_id)
    );

    CREATE TABLE hour_transactions (
      id BIGSERIAL PRIMARY KEY,
      enrollment_id BIGINT NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
      student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('purchase','consume','adjust','refund')),
      hours NUMERIC(10,2) NOT NULL,
      balance_after NUMERIC(10,2) NOT NULL,
      teaching_log_id BIGINT,
      remark TEXT,
      created_by BIGINT REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

- [ ] **Step 2: 写失败测试**

`server/test/enrollments.test.ts`:

    import { test, beforeEach } from 'node:test';
    import assert from 'node:assert/strict';
    import { setupApp, seedBase } from './helpers.ts';

    const app = await setupApp();
    let seed: Awaited<ReturnType<typeof seedBase>>;
    let studentId = 0;
    let lessonId = 0;

    beforeEach(async () => {
      seed = await seedBase(app);
      const student = await app.inject({
        method: 'POST', url: '/api/students',
        headers: { authorization: `Bearer ${seed.adminToken}` },
        payload: { campusId: seed.campusId, name: '张三' }
      });
      studentId = student.json().id;
      const lesson = await app.pool.query("INSERT INTO lessons (name) VALUES ('Genuis3') RETURNING id");
      lessonId = lesson.rows[0].id;
    });

    test('create enrollment writes purchase transaction', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/enrollments',
        headers: { authorization: `Bearer ${seed.adminToken}` },
        payload: { studentId, lessonId, campusId: seed.campusId, purchasedHours: 48, totalFee: 2112, paidFee: 2112 }
      });
      assert.equal(res.statusCode, 200);
      assert.equal(Number(res.json().remaining_hours), 48);
      const tx = await app.pool.query('SELECT * FROM hour_transactions WHERE enrollment_id = $1', [res.json().id]);
      assert.equal(tx.rowCount, 1);
      assert.equal(tx.rows[0].type, 'purchase');
      assert.equal(Number(tx.rows[0].balance_after), 48);
    });

    test('adjustment requires remark and updates balance', async () => {
      const created = await app.inject({
        method: 'POST', url: '/api/enrollments',
        headers: { authorization: `Bearer ${seed.adminToken}` },
        payload: { studentId, lessonId, campusId: seed.campusId, purchasedHours: 10, totalFee: 440, paidFee: 440 }
      });
      const id = created.json().id;
      const noRemark = await app.inject({
        method: 'POST', url: `/api/enrollments/${id}/adjust`,
        headers: { authorization: `Bearer ${seed.adminToken}` },
        payload: { hours: 2 }
      });
      assert.equal(noRemark.statusCode, 400);
      const ok = await app.inject({
        method: 'POST', url: `/api/enrollments/${id}/adjust`,
        headers: { authorization: `Bearer ${seed.adminToken}` },
        payload: { hours: 2, remark: '赠课' }
      });
      assert.equal(ok.statusCode, 200);
      assert.equal(Number(ok.json().remaining_hours), 12);
      const tx = await app.pool.query("SELECT * FROM hour_transactions WHERE enrollment_id = $1 AND type = 'adjust'", [id]);
      assert.equal(Number(tx.rows[0].hours), 2);
    });

    test('transaction list is queryable', async () => {
      const created = await app.inject({
        method: 'POST', url: '/api/enrollments',
        headers: { authorization: `Bearer ${seed.adminToken}` },
        payload: { studentId, lessonId, campusId: seed.campusId, purchasedHours: 5, totalFee: 220, paidFee: 220 }
      });
      const id = created.json().id;
      const list = await app.inject({
        method: 'GET', url: `/api/enrollments/${id}/transactions`,
        headers: { authorization: `Bearer ${seed.adminToken}` }
      });
      assert.equal(list.statusCode, 200);
      assert.equal(list.json().length, 1);
    });

- [ ] **Step 3: 运行测试确认失败**

Run: `node --test --test-concurrency=1 test/enrollments.test.ts`

Expected: FAIL，`/api/enrollments` 返回 404。

- [ ] **Step 4: 实现报读路由**

`server/src/routes/enrollments.ts`:

    import type { FastifyInstance } from 'fastify';
    import { authGuard } from '../auth/middleware.ts';
    import { requireModule } from '../permissions/module_access.ts';
    import { writeAudit } from '../audit.ts';

    async function applyHours(
      app: FastifyInstance, enrollmentId: number, type: 'purchase' | 'consume' | 'adjust' | 'refund',
      hours: number, remark: string | null, actorId: number, teachingLogId: number | null = null
    ) {
      const client = await app.pool.connect();
      try {
        await client.query('BEGIN');
        const current = (await client.query('SELECT * FROM enrollments WHERE id = $1 FOR UPDATE', [enrollmentId])).rows[0];
        if (!current) throw new Error('enrollment not found');
        const remaining = Number(current.remaining_hours) + hours;
        const usedHours = Number(current.used_hours) + (type === 'consume' ? Math.abs(hours) : 0);
        await client.query(
          'UPDATE enrollments SET remaining_hours = $1, used_hours = $2 WHERE id = $3',
          [remaining, usedHours, enrollmentId]
        );
        const tx = await client.query(
          `INSERT INTO hour_transactions (enrollment_id, student_id, type, hours, balance_after, teaching_log_id, remark, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
          [enrollmentId, current.student_id, type, hours, remaining, teachingLogId, remark, actorId]
        );
        await client.query('COMMIT');
        return { enrollment: { ...current, remaining_hours: remaining, used_hours: usedHours }, transaction: tx.rows[0] };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    export async function enrollmentRoutes(app: FastifyInstance) {
      const guard = [authGuard, requireModule('enrollments')];

      app.get('/', { preHandler: guard }, async (request) => {
        const query = request.query as { studentId?: string; lessonId?: string; campusId?: string };
        return (await app.pool.query(
          `SELECT e.*, s.name AS student_name, l.name AS lesson_name, c.name AS campus_name
           FROM enrollments e
           JOIN students s ON s.id = e.student_id
           JOIN lessons l ON l.id = e.lesson_id
           JOIN campuses c ON c.id = e.campus_id
           WHERE ($1::bigint IS NULL OR e.student_id = $1)
             AND ($2::bigint IS NULL OR e.lesson_id = $2)
             AND ($3::bigint IS NULL OR e.campus_id = $3)
           ORDER BY e.id DESC`,
          [query.studentId ? Number(query.studentId) : null,
           query.lessonId ? Number(query.lessonId) : null,
           query.campusId ? Number(query.campusId) : null]
        )).rows;
      });

      app.post('/', { preHandler: guard }, async (request, reply) => {
        const body = request.body as {
          studentId?: number; lessonId?: number; campusId?: number;
          purchasedHours?: number; totalFee?: number; paidFee?: number;
        };
        if (!body.studentId || !body.lessonId || !body.campusId) {
          return reply.code(400).send({ error: 'studentId, lessonId, campusId required' });
        }
        const hours = Number(body.purchasedHours ?? 0);
        const totalFee = Number(body.totalFee ?? 0);
        const paidFee = Number(body.paidFee ?? 0);
        const result = await app.pool.query(
          `INSERT INTO enrollments (student_id, lesson_id, campus_id, purchased_hours, remaining_hours,
             total_fee, paid_fee, remaining_fee, arrears)
           VALUES ($1,$2,$3,$4,$4,$5,$6,$5,$7) RETURNING *`,
          [body.studentId, body.lessonId, body.campusId, hours, totalFee, paidFee, Math.max(0, totalFee - paidFee)]
        );
        await applyHours(app, result.rows[0].id, 'purchase', hours, '初始购买', request.user!.id);
        await writeAudit(app, request.user!.id, 'enrollment_create', 'enrollment', result.rows[0].id, { ...body });
        const updated = (await app.pool.query('SELECT * FROM enrollments WHERE id = $1', [result.rows[0].id])).rows[0];
        return updated;
      });

      app.post('/:id/adjust', { preHandler: guard }, async (request, reply) => {
        const id = Number((request.params as { id: string }).id);
        const body = request.body as { hours?: number; remark?: string };
        if (typeof body.hours !== 'number' || !body.remark?.trim()) {
          return reply.code(400).send({ error: 'hours and remark required' });
        }
        const result = await applyHours(app, id, 'adjust', body.hours, body.remark.trim(), request.user!.id);
        await writeAudit(app, request.user!.id, 'hours_adjust', 'enrollment', id, { hours: body.hours, remark: body.remark });
        return result.enrollment;
      });

      app.get('/:id/transactions', { preHandler: guard }, async (request) => {
        const id = Number((request.params as { id: string }).id);
        return (await app.pool.query(
          `SELECT t.*, u.display_name AS created_by_name
           FROM hour_transactions t LEFT JOIN users u ON u.id = t.created_by
           WHERE t.enrollment_id = $1 ORDER BY t.id DESC`,
          [id]
        )).rows;
      });
    }

导出 `applyHours` 供记上课模块复用：

    export { applyHours };

`server/src/app.ts` 注册：

    import { enrollmentRoutes } from './routes/enrollments.ts';
    await app.register(enrollmentRoutes, { prefix: '/api/enrollments' });

- [ ] **Step 5: 运行测试确认通过**

Run: `node --test --test-concurrency=1 test/enrollments.test.ts`

Expected: PASS，3 个测试通过。

- [ ] **Step 6: 提交**

    git add server/src/migrations/006_enrollments.sql server/src/routes/enrollments.ts server/src/app.ts server/test/enrollments.test.ts
    git commit -m "feat: enrollment and hour account api"

---

### Task 14: 前端报读页

**Files:**
- Create: `web/src/pages/EnrollmentsPage.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/Shell.tsx`

- [ ] **Step 1: 写页面**

- 报读列表：`GET /api/enrollments`，列「学员、课程、购买课时、已用、剩余、总学费、实缴、欠费、报读校区、状态」。
- 新增报读表单：学员（`GET /api/students`）、课程（`GET /api/lessons`）、校区、购买课时、总学费、实缴。
- 课时调整：弹窗输入正负课时 + 备注（必填），调用 `POST /api/enrollments/:id/adjust`。
- 课时流水：抽屉/弹窗展示 `GET /api/enrollments/:id/transactions`。

- [ ] **Step 2: 注册路由与菜单，构建验证**

`web/src/App.tsx` 增加 `/enrollments`；`web/src/Shell.tsx` 增加菜单（图标 `Wallet`）。

Run: `node_modules\.bin\vite.CMD build --configLoader runner`

Expected: 构建成功。

- [ ] **Step 3: 提交**

    git add web/src
    git commit -m "feat: enrollment page"
---

### Task 15: 记上课与点名 API（含扣课时）

**Files:**
- Create: `server/src/migrations/007_teaching_logs.sql`
- Create: `server/src/routes/attendance.ts`
- Modify: `server/src/app.ts`
- Create: `server/test/attendance.test.ts`

- [ ] **Step 1: 写迁移文件**

`server/src/migrations/007_teaching_logs.sql`:

    CREATE TABLE teaching_logs (
      id BIGSERIAL PRIMARY KEY,
      schedule_id BIGINT REFERENCES schedules(id) ON DELETE SET NULL,
      class_id BIGINT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      campus_id BIGINT NOT NULL REFERENCES campuses(id),
      teacher_id BIGINT REFERENCES users(id),
      classroom_id BIGINT REFERENCES classrooms(id),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','recorded')),
      taught_at TIMESTAMPTZ,
      recorded_by BIGINT REFERENCES users(id),
      recorded_at TIMESTAMPTZ,
      remark TEXT,
      UNIQUE (schedule_id)
    );

    CREATE TABLE attendance_records (
      id BIGSERIAL PRIMARY KEY,
      teaching_log_id BIGINT NOT NULL REFERENCES teaching_logs(id) ON DELETE CASCADE,
      student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (status IN ('present','absent','leave','makeup')),
      hours_deducted NUMERIC(10,2) NOT NULL DEFAULT 0,
      remark TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (teaching_log_id, student_id)
    );

- [ ] **Step 2: 写失败测试**

`server/test/attendance.test.ts`:

    import { test, beforeEach } from 'node:test';
    import assert from 'node:assert/strict';
    import { setupApp, seedBase } from './helpers.ts';

    const app = await setupApp();
    let seed: Awaited<ReturnType<typeof seedBase>>;
    let classId = 0;
    let scheduleId = 0;
    let studentId = 0;
    let enrollmentId = 0;

    beforeEach(async () => {
      seed = await seedBase(app);
      const teacherId = (await app.pool.query("SELECT id FROM users WHERE username = 'teacher'")).rows[0].id;
      const lesson = await app.pool.query("INSERT INTO lessons (name) VALUES ('Genuis3') RETURNING id");
      const lessonId = lesson.rows[0].id;
      const cls = await app.inject({
        method: 'POST', url: '/api/classes',
        headers: { authorization: `Bearer ${seed.adminToken}` },
        payload: { campusId: seed.campusId, name: 'G3D', subject: '英语', grade: '三年级', teacherId, lessonId }
      });
      classId = cls.json().id;
      const student = await app.inject({
        method: 'POST', url: '/api/students',
        headers: { authorization: `Bearer ${seed.adminToken}` },
        payload: { campusId: seed.campusId, name: '张三' }
      });
      studentId = student.json().id;
      await app.inject({
        method: 'POST', url: `/api/classes/${classId}/students`,
        headers: { authorization: `Bearer ${seed.adminToken}` },
        payload: { studentId, lessonId, teacherId }
      });
      const enrollment = await app.inject({
        method: 'POST', url: '/api/enrollments',
        headers: { authorization: `Bearer ${seed.adminToken}` },
        payload: { studentId, lessonId, campusId: seed.campusId, purchasedHours: 10, totalFee: 440, paidFee: 440 }
      });
      enrollmentId = enrollment.json().id;
      const schedule = await app.inject({
        method: 'POST', url: '/api/schedules',
        headers: { authorization: `Bearer ${seed.adminToken}` },
        payload: { classId, campusId: seed.campusId, date: '2026-09-15', startTime: '19:00', endTime: '20:30', teacherId }
      });
      scheduleId = schedule.json().id;
    });

    test('today list shows pending schedule', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/attendance/today?date=2026-09-15',
        headers: { authorization: `Bearer ${seed.teacherToken}` }
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.json().length, 1);
      assert.equal(res.json()[0].class_name, 'G3D');
    });

    test('record attendance deducts hours and writes transaction', async () => {
      const res = await app.inject({
        method: 'POST', url: `/api/attendance/record/${scheduleId}`,
        headers: { authorization: `Bearer ${seed.teacherToken}` },
        payload: { records: [{ studentId, status: 'present' }] }
      });
      assert.equal(res.statusCode, 200);
      const enrollment = await app.pool.query('SELECT * FROM enrollments WHERE id = $1', [enrollmentId]);
      assert.equal(Number(enrollment.rows[0].remaining_hours), 9);
      const tx = await app.pool.query("SELECT * FROM hour_transactions WHERE enrollment_id = $1 AND type = 'consume'", [enrollmentId]);
      assert.equal(tx.rowCount, 1);
      assert.equal(Number(tx.rows[0].hours), -1);
      const schedule = await app.pool.query('SELECT is_recorded FROM schedules WHERE id = $1', [scheduleId]);
      assert.equal(schedule.rows[0].is_recorded, true);
    });

    test('leave does not deduct hours', async () => {
      await app.inject({
        method: 'POST', url: `/api/attendance/record/${scheduleId}`,
        headers: { authorization: `Bearer ${seed.teacherToken}` },
        payload: { records: [{ studentId, status: 'leave' }] }
      });
      const enrollment = await app.pool.query('SELECT * FROM enrollments WHERE id = $1', [enrollmentId]);
      assert.equal(Number(enrollment.rows[0].remaining_hours), 10);
    });

    test('recording twice is rejected', async () => {
      await app.inject({
        method: 'POST', url: `/api/attendance/record/${scheduleId}`,
        headers: { authorization: `Bearer ${seed.teacherToken}` },
        payload: { records: [{ studentId, status: 'present' }] }
      });
      const again = await app.inject({
        method: 'POST', url: `/api/attendance/record/${scheduleId}`,
        headers: { authorization: `Bearer ${seed.teacherToken}` },
        payload: { records: [{ studentId, status: 'present' }] }
      });
      assert.equal(again.statusCode, 409);
    });

- [ ] **Step 3: 运行测试确认失败**

Run: `node --test --test-concurrency=1 test/attendance.test.ts`

Expected: FAIL，`/api/attendance` 返回 404。

- [ ] **Step 4: 实现记上课路由**

`server/src/routes/attendance.ts`:

    import type { FastifyInstance } from 'fastify';
    import { authGuard } from '../auth/middleware.ts';
    import { requireModule } from '../permissions/module_access.ts';
    import { writeAudit } from '../audit.ts';
    import { applyHours } from './enrollments.ts';

    const DEDUCT: Record<string, number> = { present: 1, absent: 1, leave: 0, makeup: 1 };

    export async function attendanceRoutes(app: FastifyInstance) {
      const guard = [authGuard, requireModule('attendance')];

      app.get('/today', { preHandler: guard }, async (request) => {
        const date = (request.query as { date?: string }).date ?? new Date().toISOString().slice(0, 10);
        return (await app.pool.query(
          `SELECT s.id AS schedule_id, s.schedule_date, s.start_time, s.end_time, s.is_recorded,
                  c.id AS class_id, c.name AS class_name, u.display_name AS teacher_name,
                  r.name AS classroom_name, camp.name AS campus_name
           FROM schedules s
           JOIN classes c ON c.id = s.class_id
           LEFT JOIN users u ON u.id = s.teacher_id
           LEFT JOIN classrooms r ON r.id = s.classroom_id
           JOIN campuses camp ON camp.id = s.campus_id
           WHERE s.schedule_date = $1 AND s.status = 'normal'
           ORDER BY s.start_time`,
          [date]
        )).rows;
      });

      app.get('/students/:scheduleId', { preHandler: guard }, async (request) => {
        const scheduleId = Number((request.params as { scheduleId: string }).scheduleId);
        return (await app.pool.query(
          `SELECT cs.student_id, st.name AS student_name, e.id AS enrollment_id, e.remaining_hours
           FROM schedules sc
           JOIN class_students cs ON cs.class_id = sc.class_id AND cs.left_at IS NULL
           JOIN students st ON st.id = cs.student_id
           LEFT JOIN enrollments e ON e.student_id = cs.student_id AND e.lesson_id = sc.class_id
           WHERE sc.id = $1
           ORDER BY st.id`,
          [scheduleId]
        )).rows;
      });

      app.post('/record/:scheduleId', { preHandler: guard }, async (request, reply) => {
        const scheduleId = Number((request.params as { scheduleId: string }).scheduleId);
        const body = request.body as { records?: Array<{ studentId?: number; status?: string; remark?: string }> };
        if (!Array.isArray(body.records) || body.records.length === 0) {
          return reply.code(400).send({ error: 'records required' });
        }
        const schedule = (await app.pool.query('SELECT * FROM schedules WHERE id = $1', [scheduleId])).rows[0];
        if (!schedule) return reply.code(404).send({ error: 'schedule not found' });
        if (schedule.is_recorded) return reply.code(409).send({ error: '该节课已记上课' });

        const client = await app.pool.connect();
        try {
          await client.query('BEGIN');
          const log = await client.query(
            `INSERT INTO teaching_logs (schedule_id, class_id, campus_id, teacher_id, classroom_id, status, taught_at, recorded_by, recorded_at)
             VALUES ($1,$2,$3,$4,$5,'recorded', now(), $6, now()) RETURNING *`,
            [scheduleId, schedule.class_id, schedule.campus_id, schedule.teacher_id, schedule.classroom_id, request.user!.id]
          );
          const teachingLogId = log.rows[0].id;
          for (const record of body.records) {
            if (!record.studentId || !record.status) continue;
            const hours = DEDUCT[record.status] ?? 0;
            await client.query(
              `INSERT INTO attendance_records (teaching_log_id, student_id, status, hours_deducted, remark)
               VALUES ($1,$2,$3,$4,$5)`,
              [teachingLogId, record.studentId, record.status, hours, record.remark ?? null]
            );
          }
          await client.query('UPDATE schedules SET is_recorded = true WHERE id = $1', [scheduleId]);
          await client.query('COMMIT');

          for (const record of body.records) {
            if (!record.studentId || !record.status) continue;
            const hours = DEDUCT[record.status] ?? 0;
            if (hours <= 0) continue;
            const enrollment = (await app.pool.query(
              `SELECT e.id FROM enrollments e
               JOIN class_students cs ON cs.lesson_id = e.lesson_id
               WHERE e.student_id = $1 AND cs.class_id = $2 LIMIT 1`,
              [record.studentId, schedule.class_id]
            )).rows[0];
            if (enrollment) {
              await applyHours(app, enrollment.id, 'consume', -hours, '上课扣课时', request.user!.id, teachingLogId);
            }
          }
          await writeAudit(app, request.user!.id, 'attendance_record', 'teaching_log', teachingLogId, { scheduleId });
          return { ok: true, teachingLogId };
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }
      });

      app.get('/summary', { preHandler: guard }, async (request) => {
        const query = request.query as { studentId?: string; classId?: string };
        return (await app.pool.query(
          `SELECT e.id AS enrollment_id, st.name AS student_name, l.name AS lesson_name,
                  e.purchased_hours, e.used_hours, e.remaining_hours
           FROM enrollments e
           JOIN students st ON st.id = e.student_id
           JOIN lessons l ON l.id = e.lesson_id
           WHERE ($1::bigint IS NULL OR e.student_id = $1)
           ORDER BY st.id`,
          [query.studentId ? Number(query.studentId) : null]
        )).rows;
      });
    }

`server/src/app.ts` 注册：

    import { attendanceRoutes } from './routes/attendance.ts';
    await app.register(attendanceRoutes, { prefix: '/api/attendance' });

- [ ] **Step 5: 运行测试确认通过**

Run: `node --test --test-concurrency=1 test/attendance.test.ts`

Expected: PASS，4 个测试通过。

- [ ] **Step 6: 提交**

    git add server/src/migrations/007_teaching_logs.sql server/src/routes/attendance.ts server/src/app.ts server/test/attendance.test.ts
    git commit -m "feat: attendance api with hour deduction"

---

### Task 16: 前端记上课页

**Files:**
- Create: `web/src/pages/AttendancePage.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/Shell.tsx`

- [ ] **Step 1: 写页面**

- 顶部：日期选择（默认今天）、班级/一对一筛选、状态筛选。
- 列表：`GET /api/attendance/today?date=`，列「时间段、班级、课程、教师、校区、教室、状态」。
- 点「记上课」：`GET /api/attendance/students/:scheduleId` 拉学员名单，逐个选择到课/缺课/请假/补课，可填备注，提交 `POST /api/attendance/record/:scheduleId`。
- 已记录的课显示「已记录」并禁用；冲突提示 409 时显示错误信息。
- 课时汇总页签：`GET /api/attendance/summary`。

- [ ] **Step 2: 注册路由与菜单，构建验证**

`web/src/App.tsx` 增加 `/attendance`；`web/src/Shell.tsx` 增加菜单（图标 `CheckSquare`）。

Run: `node_modules\.bin\vite.CMD build --configLoader runner`

Expected: 构建成功。

- [ ] **Step 3: 提交**

    git add web/src
    git commit -m "feat: attendance page"

---

### Task 17: 2A 端到端验收

**Files:** 无新增文件，按清单验收。

- [ ] **Step 1: 跑全部后端测试**

Run（在 `server/`）：`node --test --test-concurrency=1 "test/*.test.ts"`

Expected: 一期 28 个 + 2A 新增全部通过（角色 4、课程 3、教室 2、排课 4、报读 3、记上课 4）。

- [ ] **Step 2: 类型检查与前端构建**

Run（`server/`）：`node_modules\.bin\tsc.CMD --noEmit`
Run（`web/`）：`node_modules\.bin\tsc.CMD --noEmit`
Run（`web/`）：`node_modules\.bin\vite.CMD build --configLoader runner`

Expected: 全部通过。

- [ ] **Step 3: 手工验收流程**

1. 用管理员登录，创建角色「教务助理」（模块：工作台/班级/排课/记上课；校区：指定 1 个校区），把教师账号分配到该角色。
2. 教师登录：只能看到工作台/班级/排课/记上课菜单。
3. 管理员建课程类别、科目、课程（Genuis3），建教室，建班级并指定课程与班主任。
4. 给学员报读 Genuis3（购买 48 课时），核对课时流水有一条 purchase。
5. 给班级排课（19:00-20:30），再排一节教师重叠的课 → 应被拒绝并提示教师冲突。
6. 教师用「记上课」对当天的课点名：1 人到课、1 人请假 → 到课学员剩余课时 47，请假学员不变；课时流水新增一条 consume -1。
7. 重复记同一节课 → 提示已记录。
8. 查看课时汇总，剩余课时与流水一致。

- [ ] **Step 4: 更新进度文档**

把 2A 完成情况写入 `PROGRESS.md`，并提交（如沙箱禁止 git 写操作，记录说明后由人工提交）。

## 自检记录

- 规格覆盖：权限（任务 1-4）、课程（5-7）、班级分班（8-9）、教室（10）、排课（11-12）、报读与课时（13-14）、记上课（15-16）、验收（17）——与设计文档第 2 节范围逐项对应。
- 占位符扫描：无 TBD/TODO；所有步骤含具体代码或明确命令。
- 类型一致性：模块 key 与设计一致；`applyHours` 由报读模块导出供记上课复用；课时变动统一走 `hour_transactions`。
- 已知偏差：前端页面代码以「要点 + 接口 + 关键常量」描述，未逐行给出完整 JSX；如需逐行代码，在实现时按现有页面风格补齐。