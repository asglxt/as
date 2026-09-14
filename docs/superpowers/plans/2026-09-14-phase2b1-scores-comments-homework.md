# 二期 2B-1 成绩 + 点评 + 作业 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把成绩模型升级为「项目 + 考试 + 学员成绩」三层，并补齐课堂点评（逐学员评分/评语/小红花 + 家长已读）与作业闭环（布置 → 提交 → 批改 → 统计）。

**Architecture:** 沿用一期与 2A 的技术栈与目录结构。成绩模块重写并删除旧 `exams`/`scores` 表；点评挂接 2A 的 `teaching_logs`；作业用「作业 + 学员记录」两张表实现三态状态机。权限模块清单从 11 个扩展到 14 个。

**Tech Stack:** Node.js 24、TypeScript、Fastify、pg、PostgreSQL 18、React 18、Vite、react-router-dom、lucide-react

**设计依据：** `docs/superpowers/specs/2026-09-14-phase2b1-scores-comments-homework-design.md`

---

## 执行前提

- PostgreSQL 运行中，`school` 与 `school_test` 可连接。
- 2A 已完成（角色权限、课程、班级、教室、排课、报读、记上课）。
- 后端测试：`server/` 下执行 `node --test --test-concurrency=1 "test/*.test.ts"`。
- 前端构建：`web/` 下执行 `node_modules\.bin\vite.CMD build --configLoader runner`。
- 每个任务先写失败测试，再实现，再验证；测试通过后提交（沙箱禁止写 `.git` 时记录并继续）。

## 目录结构（新增/修改）

    server/src/migrations/
      008_scores_v2.sql      # 删旧成绩表 + 新三层成绩表
      009_comments.sql       # 点评模板 + 课堂点评
      010_homework.sql       # 作业 + 作业记录
    server/src/routes/
      scores.ts              # 重写：项目/考试字典 + 成绩录入/查询/导出
      imports.ts             # 改写成绩导入为新格式
      reports.ts             # 重写：家长/学生端成绩视图
      comments.ts            # 点评模板 + 点评记录 + 已读
      homework.ts            # 作业布置/提交/批改/统计
      me.ts                  # 新增我的点评、我的作业
    web/src/pages/
      ScoresPage.tsx         # 项目设置/考试设置/录入/查询（替换 GradesPage）
      CommentsPage.tsx       # 课堂点评
      HomeworkPage.tsx       # 作业管理
      MyScoresPage.tsx       # 改写：家长/学生端成绩
      MyCommentsPage.tsx     # 家长/学生端点评
      MyHomeworkPage.tsx     # 家长/学生端作业

## 任务总览

- 里程碑 1（任务 1-4）：成绩三层模型、字典、录入与查询、前端成绩页
- 里程碑 2（任务 5-6）：成绩 CSV 导入改写、家长/学生端成绩视图
- 里程碑 3（任务 7-9）：点评模板与记录、已读回写、点评页与家长端
- 里程碑 4（任务 10-13）：作业布置、提交与批改、作业页、家长端作业
- 里程碑 5（任务 14）：端到端验收

---

### Task 1: 成绩三层数据模型

**Files:**
- Create: `server/src/migrations/008_scores_v2.sql`

- [ ] **Step 1: 写迁移文件**

`server/src/migrations/008_scores_v2.sql`:

    DROP TABLE IF EXISTS scores CASCADE;
    DROP TABLE IF EXISTS exams CASCADE;

    CREATE TABLE exam_projects (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      sort INTEGER NOT NULL DEFAULT 0,
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE exams (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      sort INTEGER NOT NULL DEFAULT 0,
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE student_scores (
      id BIGSERIAL PRIMARY KEY,
      student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      project_id BIGINT NOT NULL REFERENCES exam_projects(id),
      exam_id BIGINT NOT NULL REFERENCES exams(id),
      class_id BIGINT REFERENCES classes(id) ON DELETE SET NULL,
      score TEXT,
      source TEXT NOT NULL DEFAULT 'teacher' CHECK (source IN ('teacher','import','registration')),
      exam_date DATE NOT NULL,
      remark TEXT,
      created_by BIGINT REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (student_id, project_id, exam_id, exam_date)
    );

    CREATE INDEX idx_student_scores_student ON student_scores(student_id);
    CREATE INDEX idx_student_scores_exam ON student_scores(exam_id, project_id);

    INSERT INTO exam_projects (name, sort) VALUES
      ('单元测评', 1), ('期中考试', 2), ('期末考试', 3), ('听写', 4), ('入学测', 5);

    INSERT INTO exams (name, sort) VALUES
      ('第一单元', 1), ('第二单元', 2), ('第三单元', 3), ('期中考试', 4), ('期末考试', 5);

    INSERT INTO role_permissions (role_id, module_key)
      SELECT id, m.key FROM roles CROSS JOIN (
        VALUES ('scores'), ('comments'), ('homework')
      ) AS m(key)
      WHERE roles.name IN ('机构主管', '校区主管', '教务', '教师');

- [ ] **Step 2: 运行迁移**

Run（`server/`）：`$env:DATABASE_URL='postgres://school:school@localhost:5432/school'; node src/migrate.ts`

Expected: 输出 `migrations applied`；`student_scores` 与两张字典表存在，旧 `scores`/`exams` 已删除。

- [ ] **Step 3: 修复受影响的旧代码**

一期 `server/src/routes/exams.ts`、`scores.ts`、`imports.ts`（成绩部分）、`reports.ts` 引用了旧表，删除 `exams.ts`/`scores.ts` 并从 `app.ts` 取消注册；`imports.ts` 与 `reports.ts` 在 Task 5/6 重写前先改为返回 501：

    app.post('/scores', { preHandler: guard }, async (_request, reply) => reply.code(501).send({ error: 'scores import is being migrated' }));

- [ ] **Step 4: 跑测试确认只有被移除的旧测试失败**

Run: `node --test --test-concurrency=1 "test/*.test.ts"`

Expected: 旧 `exams.test.ts`、`scores.test.ts` 相关用例失败（表已删除），其余通过。删除这两个测试文件后重跑，应全部通过。

- [ ] **Step 5: 提交**

    git add server/src/migrations/008_scores_v2.sql server/src server/test
    git commit -m "feat: replace score model with projects and exams"

---

### Task 2: 项目字典与考试字典 API

**Files:**
- Create: `server/src/routes/scores.ts`
- Modify: `server/src/app.ts`
- Create: `server/test/scores-v2.test.ts`

- [ ] **Step 1: 写失败测试**

`server/test/scores-v2.test.ts`:

    import { test, beforeEach } from 'node:test';
    import assert from 'node:assert/strict';
    import { setupApp, seedBase } from './helpers.ts';

    const app = await setupApp();
    let seed: Awaited<ReturnType<typeof seedBase>>;

    beforeEach(async () => {
      seed = await seedBase(app);
    });

    test('admin creates and lists projects', async () => {
      const create = await app.inject({
        method: 'POST', url: '/api/scores/projects',
        headers: { authorization: `Bearer ${seed.adminToken}` },
        payload: { name: '口语测评', sort: 9 }
      });
      assert.equal(create.statusCode, 200);
      const list = await app.inject({
        method: 'GET', url: '/api/scores/projects',
        headers: { authorization: `Bearer ${seed.adminToken}` }
      });
      assert.ok(list.json().some((p: any) => p.name === '口语测评'));
    });

    test('admin creates and lists exams', async () => {
      const create = await app.inject({
        method: 'POST', url: '/api/scores/exams',
        headers: { authorization: `Bearer ${seed.adminToken}` },
        payload: { name: '六上第一单元', sort: 1 }
      });
      assert.equal(create.statusCode, 200);
      const list = await app.inject({
        method: 'GET', url: '/api/scores/exams',
        headers: { authorization: `Bearer ${seed.adminToken}` }
      });
      assert.ok(list.json().some((e: any) => e.name === '六上第一单元'));
    });

    test('teacher cannot create project', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/scores/projects',
        headers: { authorization: `Bearer ${seed.teacherToken}` },
        payload: { name: 'X' }
      });
      assert.equal(res.statusCode, 403);
    });

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test --test-concurrency=1 test/scores-v2.test.ts`

Expected: FAIL，`/api/scores/projects` 返回 404。

- [ ] **Step 3: 实现字典接口**

`server/src/routes/scores.ts`（先实现字典部分，录入/查询在 Task 3 追加）：

    import type { FastifyInstance } from 'fastify';
    import { authGuard, requireRole } from '../auth/middleware.ts';
    import { requireModule } from '../permissions/module_access.ts';

    export async function scoreRoutes(app: FastifyInstance) {
      const read = [authGuard, requireModule('scores')];
      const write = [authGuard, requireModule('scores'), requireRole('admin')];

      app.get('/projects', { preHandler: read }, async () => {
        return (await app.pool.query('SELECT * FROM exam_projects ORDER BY sort, id')).rows;
      });
      app.post('/projects', { preHandler: write }, async (request, reply) => {
        const body = request.body as { name?: string; sort?: number };
        if (!body.name?.trim()) return reply.code(400).send({ error: 'name required' });
        try {
          const result = await app.pool.query(
            'INSERT INTO exam_projects (name, sort) VALUES ($1, $2) RETURNING *',
            [body.name.trim(), body.sort ?? 0]
          );
          return result.rows[0];
        } catch (err: any) {
          if (err.code === '23505') return reply.code(409).send({ error: 'project exists' });
          throw err;
        }
      });
      app.patch('/projects/:id', { preHandler: write }, async (request, reply) => {
        const id = Number((request.params as { id: string }).id);
        const body = request.body as { name?: string; sort?: number; enabled?: boolean };
        const result = await app.pool.query(
          `UPDATE exam_projects SET name = COALESCE($1, name), sort = COALESCE($2, sort), enabled = COALESCE($3, enabled)
           WHERE id = $4 RETURNING *`,
          [body.name ?? null, body.sort ?? null, body.enabled ?? null, id]
        );
        if (!result.rowCount) return reply.code(404).send({ error: 'project not found' });
        return result.rows[0];
      });

      app.get('/exams', { preHandler: read }, async () => {
        return (await app.pool.query('SELECT * FROM exams ORDER BY sort, id')).rows;
      });
      app.post('/exams', { preHandler: write }, async (request, reply) => {
        const body = request.body as { name?: string; sort?: number };
        if (!body.name?.trim()) return reply.code(400).send({ error: 'name required' });
        try {
          const result = await app.pool.query(
            'INSERT INTO exams (name, sort) VALUES ($1, $2) RETURNING *',
            [body.name.trim(), body.sort ?? 0]
          );
          return result.rows[0];
        } catch (err: any) {
          if (err.code === '23505') return reply.code(409).send({ error: 'exam exists' });
          throw err;
        }
      });
      app.patch('/exams/:id', { preHandler: write }, async (request, reply) => {
        const id = Number((request.params as { id: string }).id);
        const body = request.body as { name?: string; sort?: number; enabled?: boolean };
        const result = await app.pool.query(
          `UPDATE exams SET name = COALESCE($1, name), sort = COALESCE($2, sort), enabled = COALESCE($3, enabled)
           WHERE id = $4 RETURNING *`,
          [body.name ?? null, body.sort ?? null, body.enabled ?? null, id]
        );
        if (!result.rowCount) return reply.code(404).send({ error: 'exam not found' });
        return result.rows[0];
      });
    }

`server/src/app.ts` 注册：

    import { scoreRoutes } from './routes/scores.ts';
    await app.register(scoreRoutes, { prefix: '/api/scores' });

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test --test-concurrency=1 test/scores-v2.test.ts`

Expected: PASS，3 个测试通过。

- [ ] **Step 5: 提交**

    git add server/src/routes/scores.ts server/src/app.ts server/test/scores-v2.test.ts
    git commit -m "feat: score project and exam dictionaries"
---

### Task 3: 成绩录入、查询与导出 API

**Files:**
- Modify: `server/src/routes/scores.ts`
- Modify: `server/test/scores-v2.test.ts`

- [ ] **Step 1: 写失败测试**

在 `server/test/scores-v2.test.ts` 末尾追加：

    test('bulk score entry upserts by unique key', async () => {
      const campusId = seed.campusId;
      const teacherId = (await app.pool.query("SELECT id FROM users WHERE username = 'teacher'")).rows[0].id;
      const lesson = await app.pool.query("INSERT INTO lessons (name) VALUES ('G1') RETURNING id");
      const cls = await app.pool.query(
        "INSERT INTO classes (campus_id, name, subject, grade, lesson_id, teacher_id) VALUES ($1,'G1A','英语','一年级',$2,$3) RETURNING id",
        [campusId, lesson.rows[0].id, teacherId]
      );
      const student = await app.pool.query("INSERT INTO students (campus_id, name) VALUES ($1,'小明') RETURNING id", [campusId]);
      const project = await app.pool.query("SELECT id FROM exam_projects ORDER BY id LIMIT 1");
      const exam = await app.pool.query("SELECT id FROM exams ORDER BY id LIMIT 1");
      const payload = {
        classId: cls.rows[0].id,
        projectId: project.rows[0].id,
        examId: exam.rows[0].id,
        examDate: '2026-09-14',
        source: 'teacher',
        scores: [{ studentId: student.rows[0].id, score: '92', remark: '不错' }]
      };
      const first = await app.inject({
        method: 'POST', url: '/api/scores/bulk',
        headers: { authorization: `Bearer ${seed.adminToken}` },
        payload
      });
      assert.equal(first.statusCode, 200);
      payload.scores[0].score = '95';
      const second = await app.inject({
        method: 'POST', url: '/api/scores/bulk',
        headers: { authorization: `Bearer ${seed.adminToken}` },
        payload
      });
      assert.equal(second.statusCode, 200);
      const rows = await app.pool.query('SELECT * FROM student_scores WHERE student_id = $1', [student.rows[0].id]);
      assert.equal(rows.rowCount, 1);
      assert.equal(rows.rows[0].score, '95');
    });

    test('score query filters by class and project', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/scores?limit=10',
        headers: { authorization: `Bearer ${seed.adminToken}` }
      });
      assert.equal(res.statusCode, 200);
      assert.ok(Array.isArray(res.json().rows));
    });

    test('score export returns csv', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/scores/export',
        headers: { authorization: `Bearer ${seed.adminToken}` }
      });
      assert.equal(res.statusCode, 200);
      assert.match(res.body, /student_name/);
    });

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test --test-concurrency=1 test/scores-v2.test.ts`

Expected: FAIL，`/api/scores/bulk` 返回 404。

- [ ] **Step 3: 实现录入、查询、导出**

在 `server/src/routes/scores.ts` 的 `scoreRoutes` 中追加：

    app.post('/bulk', { preHandler: read }, async (request, reply) => {
      const body = request.body as {
        classId?: number; projectId?: number; examId?: number; examDate?: string;
        source?: string; scores?: Array<{ studentId?: number; score?: string; remark?: string }>;
      };
      if (!body.projectId || !body.examId || !body.examDate || !Array.isArray(body.scores)) {
        return reply.code(400).send({ error: 'projectId, examId, examDate, scores required' });
      }
      const client = await app.pool.connect();
      try {
        await client.query('BEGIN');
        let count = 0;
        for (const item of body.scores) {
          if (!item.studentId) continue;
          await client.query(
            `INSERT INTO student_scores (student_id, project_id, exam_id, class_id, score, source, exam_date, remark, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             ON CONFLICT (student_id, project_id, exam_id, exam_date)
             DO UPDATE SET score = EXCLUDED.score, remark = EXCLUDED.remark, class_id = EXCLUDED.class_id,
               source = EXCLUDED.source, created_by = EXCLUDED.created_by`,
            [item.studentId, body.projectId, body.examId, body.classId ?? null,
             item.score ?? null, body.source ?? 'teacher', body.examDate, item.remark ?? null, request.user!.id]
          );
          count += 1;
        }
        await client.query('COMMIT');
        return { count };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    });

    app.get('/', { preHandler: read }, async (request) => {
      const query = request.query as {
        studentId?: string; classId?: string; projectId?: string; examId?: string;
        start?: string; end?: string; limit?: string; offset?: string;
      };
      const limit = Math.min(Number(query.limit ?? 50), 200);
      const offset = Number(query.offset ?? 0);
      const where = `
        WHERE ($1::bigint IS NULL OR ss.student_id = $1)
          AND ($2::bigint IS NULL OR ss.class_id = $2)
          AND ($3::bigint IS NULL OR ss.project_id = $3)
          AND ($4::bigint IS NULL OR ss.exam_id = $4)
          AND ($5::date IS NULL OR ss.exam_date >= $5::date)
          AND ($6::date IS NULL OR ss.exam_date <= $6::date)`;
      const params = [
        query.studentId ? Number(query.studentId) : null,
        query.classId ? Number(query.classId) : null,
        query.projectId ? Number(query.projectId) : null,
        query.examId ? Number(query.examId) : null,
        query.start ?? null, query.end ?? null
      ];
      const rows = (await app.pool.query(
        `SELECT ss.*, st.name AS student_name, p.name AS project_name, e.name AS exam_name, c.name AS class_name
         FROM student_scores ss
         JOIN students st ON st.id = ss.student_id
         JOIN exam_projects p ON p.id = ss.project_id
         JOIN exams e ON e.id = ss.exam_id
         LEFT JOIN classes c ON c.id = ss.class_id
         ${where}
         ORDER BY ss.exam_date DESC, ss.id DESC
         LIMIT ${limit} OFFSET ${offset}`,
        params
      )).rows;
      const total = (await app.pool.query(`SELECT COUNT(*) FROM student_scores ss ${where}`, params)).rows[0].count;
      return { rows, total: Number(total) };
    });

    app.get('/export', { preHandler: read }, async (request, reply) => {
      const query = request.query as { classId?: string; projectId?: string; examId?: string; start?: string; end?: string };
      const rows = (await app.pool.query(
        `SELECT st.name AS student_name, p.name AS project_name, e.name AS exam_name,
                ss.score, ss.source, ss.exam_date, c.name AS class_name, ss.remark
         FROM student_scores ss
         JOIN students st ON st.id = ss.student_id
         JOIN exam_projects p ON p.id = ss.project_id
         JOIN exams e ON e.id = ss.exam_id
         LEFT JOIN classes c ON c.id = ss.class_id
         WHERE ($1::bigint IS NULL OR ss.class_id = $1)
           AND ($2::bigint IS NULL OR ss.project_id = $2)
           AND ($3::bigint IS NULL OR ss.exam_id = $3)
           AND ($4::date IS NULL OR ss.exam_date >= $4::date)
           AND ($5::date IS NULL OR ss.exam_date <= $5::date)
         ORDER BY ss.exam_date DESC`,
        [query.classId ? Number(query.classId) : null, query.projectId ? Number(query.projectId) : null,
         query.examId ? Number(query.examId) : null, query.start ?? null, query.end ?? null]
      )).rows;
      const header = 'student_name,project_name,exam_name,score,source,exam_date,class_name,remark';
      const lines = rows.map((r: any) => [r.student_name, r.project_name, r.exam_name, r.score ?? '', r.source,
        String(r.exam_date).slice(0, 10), r.class_name ?? '', r.remark ?? ''].join(','));
      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header('Content-Disposition', 'attachment; filename="scores.csv"');
      return [header, ...lines].join('\n');
    });

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test --test-concurrency=1 test/scores-v2.test.ts`

Expected: PASS，6 个测试通过。

- [ ] **Step 5: 提交**

    git add server/src/routes/scores.ts server/test/scores-v2.test.ts
    git commit -m "feat: score entry query and export"

---

### Task 4: 前端成绩页

**Files:**
- Create: `web/src/pages/ScoresPage.tsx`
- Delete: `web/src/pages/GradesPage.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/Shell.tsx`

- [ ] **Step 1: 写页面**

`web/src/pages/ScoresPage.tsx` 要点：

- 页签：成绩录入 / 成绩查询 / 项目设置 / 考试设置。
- 成绩录入：选择班级（`GET /api/classes`）、项目（`GET /api/scores/projects`）、考试（`GET /api/scores/exams`）、考试日期、来源；自动加载班级学员（`GET /api/students` 后按班级过滤，或新增学员列表接口）；表格逐行填写成绩与备注；提交 `POST /api/scores/bulk`。
- 成绩查询：筛选学员/班级/项目/考试/日期范围，调用 `GET /api/scores`，展示 `rows` 与 `total`；提供「导出 CSV」按钮（`GET /api/scores/export`，带 token 下载）。
- 项目设置/考试设置：列表 + 新增 + 启用/停用。

- [ ] **Step 2: 替换成绩菜单与路由**

`web/src/App.tsx`：删除 `GradesPage` 导入与 `/grades` 路由，新增 `ScoresPage` 与 `/scores`。
`web/src/Shell.tsx`：把「成绩」菜单指向 `/scores`（`can('scores')`）。

- [ ] **Step 3: 构建验证**

Run（`web/`）：`node_modules\.bin\tsc.CMD --noEmit` 和 `node_modules\.bin\vite.CMD build --configLoader runner`

Expected: 均通过。

- [ ] **Step 4: 提交**

    git add web/src
    git commit -m "feat: score page"

---

### Task 5: 成绩 CSV 导入改写

**Files:**
- Modify: `server/src/routes/imports.ts`
- Modify: `server/test/imports.test.ts`

- [ ] **Step 1: 写失败测试**

在一期 `server/test/imports.test.ts` 中替换成绩导入用例（原用例基于旧模型），新增：

    test('import scores with new model and validation', async () => {
      const campusId = seed.campusId;
      const teacherId = (await app.pool.query("SELECT id FROM users WHERE username = 'teacher'")).rows[0].id;
      const lesson = await app.pool.query("INSERT INTO lessons (name) VALUES ('G1') RETURNING id");
      const cls = await app.pool.query(
        "INSERT INTO classes (campus_id, name, subject, grade, lesson_id, teacher_id) VALUES ($1,'G1A','英语','一年级',$2,$3) RETURNING id",
        [campusId, lesson.rows[0].id, teacherId]
      );
      const student = await app.pool.query("INSERT INTO students (campus_id, name) VALUES ($1,'导入学员') RETURNING id", [campusId]);
      await app.pool.query('INSERT INTO class_students (class_id, student_id) VALUES ($1, $2)', [cls.rows[0].id, student.rows[0].id]);
      const project = await app.pool.query("SELECT name FROM exam_projects ORDER BY id LIMIT 1");
      const exam = await app.pool.query("SELECT name FROM exams ORDER BY id LIMIT 1");
      const csv = `student_name,class_name,project_name,exam_name,exam_date,score,source,remark\n` +
        `导入学员,G1A,${project.rows[0].name},${exam.rows[0].name},2026-09-14,88,import,\n` +
        `不存在学员,G1A,${project.rows[0].name},${exam.rows[0].name},2026-09-14,90,import,`;
      const res = await app.inject({
        method: 'POST', url: '/api/imports/scores',
        headers: { authorization: `Bearer ${seed.adminToken}` },
        payload: { csv }
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.json().total_rows, 2);
      assert.equal(res.json().error_rows, 1);
      assert.equal(res.json().errors[0].column, 'student_name');
      const rows = await app.pool.query('SELECT * FROM student_scores');
      assert.equal(rows.rowCount, 1);
      assert.equal(rows.rows[0].score, '88');
    });

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test --test-concurrency=1 test/imports.test.ts`

Expected: FAIL（当前成绩导入仍指向 501 或旧模型）。

- [ ] **Step 3: 实现新的成绩导入**

在 `server/src/routes/imports.ts` 中重写 `/scores` 分支：解析列 `student_name,class_name,project_name,exam_name,exam_date,score,source,remark`，逐行校验（学员存在且在班级、项目与考试字典存在、日期合法），按唯一键 upsert 到 `student_scores`，错误写 `{row, column, message}`，最后调用 `saveJob` 返回 `total_rows/error_rows/errors/imported_rows`。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test --test-concurrency=1 test/imports.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

    git add server/src/routes/imports.ts server/test/imports.test.ts
    git commit -m "feat: score csv import for new model"

---

### Task 6: 家长/学生端成绩视图

**Files:**
- Modify: `server/src/routes/reports.ts`
- Modify: `server/src/routes/me.ts`
- Modify: `server/test/reports.test.ts`
- Modify: `web/src/pages/MyScoresPage.tsx`

- [ ] **Step 1: 写失败测试**

在 `server/test/reports.test.ts` 中替换成绩断言（旧模型已删除）：

    test('parent sees child scores from new model', async () => {
      const campusId = seed.campusId;
      const student = await app.pool.query("INSERT INTO students (campus_id, name) VALUES ($1,'孩子') RETURNING id", [campusId]);
      const project = await app.pool.query("SELECT id FROM exam_projects ORDER BY id LIMIT 1");
      const exam = await app.pool.query("SELECT id FROM exams ORDER BY id LIMIT 1");
      await app.pool.query(
        `INSERT INTO student_scores (student_id, project_id, exam_id, score, source, exam_date)
         VALUES ($1,$2,$3,'92','teacher','2026-09-14')`,
        [student.rows[0].id, project.rows[0].id, exam.rows[0].id]
      );
      const parent = await app.pool.query(
        "INSERT INTO users (username, password_hash, display_name, role, campus_id) VALUES ('p_new', $1, '家长', 'parent', $2) RETURNING id",
        [await hashPassword('parent123'), campusId]
      );
      await app.pool.query('INSERT INTO parent_bindings (parent_user_id, student_id) VALUES ($1,$2)', [parent.rows[0].id, student.rows[0].id]);
      const login = await app.inject({
        method: 'POST', url: '/api/auth/login',
        payload: { username: 'p_new', password: 'parent123' }
      });
      const res = await app.inject({
        method: 'GET', url: `/api/reports/student/${student.rows[0].id}`,
        headers: { authorization: `Bearer ${login.json().token}` }
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.json().scores[0].score, '92');
      assert.ok(res.json().scores[0].project_name);
      assert.ok(res.json().scores[0].exam_name);
    });

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test --test-concurrency=1 test/reports.test.ts`

Expected: FAIL。

- [ ] **Step 3: 重写报告查询**

`server/src/routes/reports.ts` 的 `getStudentReport` 改为查询新模型：

    SELECT ss.*, p.name AS project_name, e.name AS exam_name, c.name AS class_name
    FROM student_scores ss
    JOIN exam_projects p ON p.id = ss.project_id
    JOIN exams e ON e.id = ss.exam_id
    LEFT JOIN classes c ON c.id = ss.class_id
    WHERE ss.student_id = $1
    ORDER BY ss.exam_date DESC, ss.id DESC

权限判断（admin/teacher/parent/student）保持不变；`me.ts` 的 `/children` 与 `/report` 复用该函数即可。

- [ ] **Step 4: 更新前端家长端**

`web/src/pages/MyScoresPage.tsx` 表格列改为：考试、项目、成绩、来源、考试日期、班级、备注。

- [ ] **Step 5: 运行测试与构建**

Run: `node --test --test-concurrency=1 test/reports.test.ts`；`web/` 下 `tsc` 与 `build`。

Expected: 全部通过。

- [ ] **Step 6: 提交**

    git add server/src/routes/reports.ts server/src/routes/me.ts server/test/reports.test.ts web/src/pages/MyScoresPage.tsx
    git commit -m "feat: parent score view for new model"
---

### Task 7: 点评数据表与模板 API

**Files:**
- Create: `server/src/migrations/009_comments.sql`
- Create: `server/src/routes/comments.ts`
- Modify: `server/src/app.ts`
- Create: `server/test/comments.test.ts`

- [ ] **Step 1: 写迁移文件**

`server/src/migrations/009_comments.sql`:

    CREATE TABLE comment_templates (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      default_rating INTEGER,
      default_flowers INTEGER NOT NULL DEFAULT 0,
      lesson_id BIGINT REFERENCES lessons(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE teaching_comments (
      id BIGSERIAL PRIMARY KEY,
      teaching_log_id BIGINT NOT NULL REFERENCES teaching_logs(id) ON DELETE CASCADE,
      student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      rating INTEGER,
      content TEXT,
      flowers INTEGER NOT NULL DEFAULT 0,
      read_at TIMESTAMPTZ,
      created_by BIGINT REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (teaching_log_id, student_id)
    );

- [ ] **Step 2: 写失败测试**

`server/test/comments.test.ts`:

    import { test, beforeEach } from 'node:test';
    import assert from 'node:assert/strict';
    import { setupApp, seedBase } from './helpers.ts';

    const app = await setupApp();
    let seed: Awaited<ReturnType<typeof seedBase>>;

    beforeEach(async () => {
      seed = await seedBase(app);
    });

    test('admin creates comment template', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/comments/templates',
        headers: { authorization: `Bearer ${seed.adminToken}` },
        payload: { name: '表现优秀', content: '课堂积极参与，发音标准', defaultRating: 5, defaultFlowers: 2 }
      });
      assert.equal(res.statusCode, 200);
      const list = await app.inject({
        method: 'GET', url: '/api/comments/templates',
        headers: { authorization: `Bearer ${seed.teacherToken}` }
      });
      assert.equal(list.json().length, 1);
    });

- [ ] **Step 3: 运行测试确认失败**

Run: `node --test --test-concurrency=1 test/comments.test.ts`

Expected: FAIL，`/api/comments/templates` 返回 404。

- [ ] **Step 4: 实现模板接口**

`server/src/routes/comments.ts`:

    import type { FastifyInstance } from 'fastify';
    import { authGuard } from '../auth/middleware.ts';
    import { requireModule } from '../permissions/module_access.ts';

    export async function commentRoutes(app: FastifyInstance) {
      const guard = [authGuard, requireModule('comments')];

      app.get('/templates', { preHandler: guard }, async () => {
        return (await app.pool.query('SELECT * FROM comment_templates ORDER BY id')).rows;
      });
      app.post('/templates', { preHandler: guard }, async (request, reply) => {
        const body = request.body as {
          name?: string; content?: string; defaultRating?: number; defaultFlowers?: number; lessonId?: number;
        };
        if (!body.name?.trim() || !body.content?.trim()) return reply.code(400).send({ error: 'name and content required' });
        const result = await app.pool.query(
          `INSERT INTO comment_templates (name, content, default_rating, default_flowers, lesson_id)
           VALUES ($1,$2,$3,$4,$5) RETURNING *`,
          [body.name.trim(), body.content.trim(), body.defaultRating ?? null, body.defaultFlowers ?? 0, body.lessonId ?? null]
        );
        return result.rows[0];
      });
    }

`server/src/app.ts` 注册：

    import { commentRoutes } from './routes/comments.ts';
    await app.register(commentRoutes, { prefix: '/api/comments' });

- [ ] **Step 5: 运行测试确认通过**

Run: `node --test --test-concurrency=1 test/comments.test.ts`

Expected: PASS。

- [ ] **Step 6: 提交**

    git add server/src/migrations/009_comments.sql server/src/routes/comments.ts server/src/app.ts server/test/comments.test.ts
    git commit -m "feat: comment templates"

---

### Task 8: 点评记录、统计与已读回写

**Files:**
- Modify: `server/src/routes/comments.ts`
- Modify: `server/src/routes/me.ts`
- Modify: `server/test/comments.test.ts`

- [ ] **Step 1: 写失败测试**

在 `server/test/comments.test.ts` 末尾追加（复用 2A 的一节课）：

    async function seedLesson() {
      const teacherId = (await app.pool.query("SELECT id FROM users WHERE username = 'teacher'")).rows[0].id;
      const lesson = await app.pool.query("INSERT INTO lessons (name) VALUES ('G1') RETURNING id");
      const cls = await app.pool.query(
        "INSERT INTO classes (campus_id, name, subject, grade, lesson_id, teacher_id) VALUES ($1,'G1A','英语','一年级',$2,$3) RETURNING id",
        [seed.campusId, lesson.rows[0].id, teacherId]
      );
      const student = await app.pool.query("INSERT INTO students (campus_id, name) VALUES ($1,'点评学员') RETURNING id", [seed.campusId]);
      await app.pool.query('INSERT INTO class_students (class_id, student_id) VALUES ($1,$2)', [cls.rows[0].id, student.rows[0].id]);
      const schedule = await app.pool.query(
        "INSERT INTO schedules (class_id, campus_id, schedule_date, start_time, end_time, teacher_id) VALUES ($1,$2,'2026-09-15','19:00','20:30',$3) RETURNING id",
        [cls.rows[0].id, seed.campusId, teacherId]
      );
      const log = await app.pool.query(
        "INSERT INTO teaching_logs (schedule_id, class_id, campus_id, teacher_id, status, taught_at) VALUES ($1,$2,$3,$4,'recorded', now()) RETURNING id",
        [schedule.rows[0].id, cls.rows[0].id, seed.campusId, teacherId]
      );
      return { teachingLogId: log.rows[0].id, studentId: student.rows[0].id };
    }

    test('teacher records comments and stats reflect rate', async () => {
      const { teachingLogId, studentId } = await seedLesson();
      const save = await app.inject({
        method: 'POST', url: `/api/comments/record/${teachingLogId}`,
        headers: { authorization: `Bearer ${seed.teacherToken}` },
        payload: { comments: [{ studentId, rating: 5, content: '很棒', flowers: 2 }] }
      });
      assert.equal(save.statusCode, 200);
      const stats = await app.inject({
        method: 'GET', url: '/api/comments/stats',
        headers: { authorization: `Bearer ${seed.adminToken}` }
      });
      assert.equal(stats.statusCode, 200);
      assert.ok(stats.json().length >= 1);
      assert.equal(Number(stats.json()[0].comment_count), 1);
    });

    test('parent mark read updates read rate', async () => {
      const { teachingLogId, studentId } = await seedLesson();
      await app.inject({
        method: 'POST', url: `/api/comments/record/${teachingLogId}`,
        headers: { authorization: `Bearer ${seed.teacherToken}` },
        payload: { comments: [{ studentId, rating: 4, content: '继续加油', flowers: 1 }] }
      });
      const parent = await app.pool.query(
        "INSERT INTO users (username, password_hash, display_name, role, campus_id) VALUES ('pc', $1, '点评家长', 'parent', $2) RETURNING id",
        [(await import('../src/auth/password.ts')).hashPassword('parent123'), seed.campusId]
      );
      await app.pool.query('INSERT INTO parent_bindings (parent_user_id, student_id) VALUES ($1,$2)', [parent.rows[0].id, studentId]);
      const login = await app.inject({
        method: 'POST', url: '/api/auth/login',
        payload: { username: 'pc', password: 'parent123' }
      });
      const mine = await app.inject({
        method: 'GET', url: '/api/me/comments',
        headers: { authorization: `Bearer ${login.json().token}` }
      });
      assert.equal(mine.statusCode, 200);
      assert.equal(mine.json().length, 1);
      const commentId = mine.json()[0].id;
      const read = await app.inject({
        method: 'POST', url: `/api/me/comments/${commentId}/read`,
        headers: { authorization: `Bearer ${login.json().token}` }
      });
      assert.equal(read.statusCode, 200);
      const row = await app.pool.query('SELECT read_at FROM teaching_comments WHERE id = $1', [commentId]);
      assert.ok(row.rows[0].read_at);
    });

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test --test-concurrency=1 test/comments.test.ts`

Expected: FAIL。

- [ ] **Step 3: 实现点评记录与统计**

在 `server/src/routes/comments.ts` 追加：

    app.post('/record/:teachingLogId', { preHandler: guard }, async (request, reply) => {
      const teachingLogId = Number((request.params as { teachingLogId: string }).teachingLogId);
      const body = request.body as { comments?: Array<{ studentId?: number; rating?: number; content?: string; flowers?: number }> };
      if (!Array.isArray(body.comments) || body.comments.length === 0) {
        return reply.code(400).send({ error: 'comments required' });
      }
      const log = (await app.pool.query('SELECT * FROM teaching_logs WHERE id = $1', [teachingLogId])).rows[0];
      if (!log) return reply.code(404).send({ error: 'teaching log not found' });
      const client = await app.pool.connect();
      try {
        await client.query('BEGIN');
        for (const item of body.comments) {
          if (!item.studentId) continue;
          await client.query(
            `INSERT INTO teaching_comments (teaching_log_id, student_id, rating, content, flowers, created_by)
             VALUES ($1,$2,$3,$4,$5,$6)
             ON CONFLICT (teaching_log_id, student_id)
             DO UPDATE SET rating = EXCLUDED.rating, content = EXCLUDED.content,
               flowers = EXCLUDED.flowers, created_by = EXCLUDED.created_by`,
            [teachingLogId, item.studentId, item.rating ?? null, item.content ?? null, item.flowers ?? 0, request.user!.id]
          );
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

    app.get('/stats', { preHandler: guard }, async () => {
      return (await app.pool.query(
        `SELECT c.id AS class_id, c.name AS class_name, u.display_name AS teacher_name,
                COUNT(DISTINCT tl.id) AS teaching_log_count,
                COUNT(tc.id) AS comment_count,
                COUNT(tc.read_at) AS read_count,
                COALESCE(SUM(tc.flowers), 0) AS flowers
         FROM teaching_logs tl
         JOIN classes c ON c.id = tl.class_id
         LEFT JOIN users u ON u.id = tl.teacher_id
         LEFT JOIN teaching_comments tc ON tc.teaching_log_id = tl.id
         GROUP BY c.id, c.name, u.display_name
         ORDER BY c.id`
      )).rows;
    });

`server/src/routes/me.ts` 追加（并在文件顶部确保导入 authGuard）：

    app.get('/comments', { preHandler: [authGuard] }, async (request) => {
      const user = request.user!;
      const bindings = user.role === 'parent'
        ? (await app.pool.query('SELECT student_id FROM parent_bindings WHERE parent_user_id = $1', [user.id])).rows
        : [];
      const studentIds = user.role === 'student' && user.studentId ? [user.studentId] : bindings.map((b) => b.student_id);
      if (studentIds.length === 0) return [];
      return (await app.pool.query(
        `SELECT tc.*, st.name AS student_name, tl.taught_at, c.name AS class_name
         FROM teaching_comments tc
         JOIN students st ON st.id = tc.student_id
         JOIN teaching_logs tl ON tl.id = tc.teaching_log_id
         JOIN classes c ON c.id = tl.class_id
         WHERE tc.student_id = ANY($1::bigint[])
         ORDER BY tc.created_at DESC`,
        [studentIds]
      )).rows;
    });

    app.post('/comments/:id/read', { preHandler: [authGuard] }, async (request, reply) => {
      const id = Number((request.params as { id: string }).id);
      const user = request.user!;
      if (user.role !== 'parent' && user.role !== 'student') return reply.code(403).send({ error: 'forbidden' });
      const comment = (await app.pool.query('SELECT * FROM teaching_comments WHERE id = $1', [id])).rows[0];
      if (!comment) return reply.code(404).send({ error: 'comment not found' });
      if (user.role === 'parent') {
        const binding = await app.pool.query('SELECT 1 FROM parent_bindings WHERE parent_user_id = $1 AND student_id = $2', [user.id, comment.student_id]);
        if (!binding.rowCount) return reply.code(403).send({ error: 'forbidden' });
      } else if (user.studentId !== Number(comment.student_id)) {
        return reply.code(403).send({ error: 'forbidden' });
      }
      await app.pool.query('UPDATE teaching_comments SET read_at = COALESCE(read_at, now()) WHERE id = $1', [id]);
      return { ok: true };
    });

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test --test-concurrency=1 test/comments.test.ts`

Expected: PASS，3 个测试通过。

- [ ] **Step 5: 提交**

    git add server/src/routes/comments.ts server/src/routes/me.ts server/test/comments.test.ts
    git commit -m "feat: teaching comments with stats and read receipt"
---

### Task 9: 点评页与家长端点评

**Files:**
- Create: `web/src/pages/CommentsPage.tsx`
- Create: `web/src/pages/MyCommentsPage.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/Shell.tsx`

- [ ] **Step 1: 写教师/管理端点评页**

`web/src/pages/CommentsPage.tsx` 要点：

- 页签：点评列表 / 点评模板。
- 点评列表：`GET /api/comments/stats`，列：班级、班主任、上课记录数、点评数、点评率、阅读率、小红花。
- 点击班级行进入点名式点评：`GET /api/attendance/students/:scheduleId`（复用 2A 接口）拿到学员 → 逐人填写评分/评语/小红花 → `POST /api/comments/record/:teachingLogId`。
- 批量套用模板：选择一个模板后，为所有未填写学员预填模板内容与默认分值，仍可逐个修改。
- 点评模板：列表 + 新增（名称、内容、默认评分、默认小红花）。

- [ ] **Step 2: 写家长/学生端点评页**

`web/src/pages/MyCommentsPage.tsx` 要点：

- `GET /api/me/comments` 展示评语、评分、小红花、上课时间、班级。
- 点击某条时调用 `POST /api/me/comments/:id/read` 回写已读。

- [ ] **Step 3: 注册路由与菜单**

`web/src/App.tsx`：新增 `/comments`（教师/管理端）与 `/my-comments`（家长/学生端）。
`web/src/Shell.tsx`：教师/管理端菜单加「课堂点评」（图标 `MessageSquare`，`can('comments')`）；家长端加「我的点评」。

- [ ] **Step 4: 构建验证**

Run（`web/`）：`tsc --noEmit` 与 `vite build --configLoader runner`。

- [ ] **Step 5: 提交**

    git add web/src
    git commit -m "feat: comment pages"

---

### Task 10: 作业数据表与布置 API

**Files:**
- Create: `server/src/migrations/010_homework.sql`
- Create: `server/src/routes/homework.ts`
- Modify: `server/src/app.ts`
- Create: `server/test/homework.test.ts`

- [ ] **Step 1: 写迁移文件**

`server/src/migrations/010_homework.sql`:

    CREATE TABLE homework (
      id BIGSERIAL PRIMARY KEY,
      class_id BIGINT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      teacher_id BIGINT REFERENCES users(id),
      title TEXT NOT NULL,
      content TEXT,
      attachments JSONB NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','closed')),
      assigned_at TIMESTAMPTZ,
      due_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE homework_records (
      id BIGSERIAL PRIMARY KEY,
      homework_id BIGINT NOT NULL REFERENCES homework(id) ON DELETE CASCADE,
      student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'not_submitted' CHECK (status IN ('not_submitted','submitted','reviewed')),
      content TEXT,
      attachments JSONB NOT NULL DEFAULT '[]',
      score TEXT,
      comment TEXT,
      submitted_at TIMESTAMPTZ,
      reviewed_at TIMESTAMPTZ,
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (homework_id, student_id)
    );

- [ ] **Step 2: 写失败测试**

`server/test/homework.test.ts`:

    import { test, beforeEach } from 'node:test';
    import assert from 'node:assert/strict';
    import { setupApp, seedBase } from './helpers.ts';

    const app = await setupApp();
    let seed: Awaited<ReturnType<typeof seedBase>>;
    let classId = 0;
    let studentA = 0;
    let studentB = 0;

    beforeEach(async () => {
      seed = await seedBase(app);
      const teacherId = (await app.pool.query("SELECT id FROM users WHERE username = 'teacher'")).rows[0].id;
      const cls = await app.pool.query(
        "INSERT INTO classes (campus_id, name, subject, grade, teacher_id) VALUES ($1,'H1','英语','一年级',$2) RETURNING id",
        [seed.campusId, teacherId]
      );
      classId = cls.rows[0].id;
      const a = await app.pool.query("INSERT INTO students (campus_id, name) VALUES ($1,'作业甲') RETURNING id", [seed.campusId]);
      const b = await app.pool.query("INSERT INTO students (campus_id, name) VALUES ($1,'作业乙') RETURNING id", [seed.campusId]);
      studentA = a.rows[0].id;
      studentB = b.rows[0].id;
      await app.pool.query('INSERT INTO class_students (class_id, student_id) VALUES ($1,$2),($1,$3)', [classId, studentA, studentB]);
    });

    test('publishing homework creates records for class students', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/homework',
        headers: { authorization: `Bearer ${seed.teacherToken}` },
        payload: { classId, title: '第一单元练习', content: '完成第 1-5 题', status: 'published', dueAt: '2026-09-20T20:00:00Z' }
      });
      assert.equal(res.statusCode, 200);
      const records = await app.pool.query('SELECT * FROM homework_records WHERE homework_id = $1', [res.json().id]);
      assert.equal(records.rowCount, 2);
      assert.ok(records.rows.every((r) => r.status === 'not_submitted'));
    });

    test('draft does not create records', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/homework',
        headers: { authorization: `Bearer ${seed.teacherToken}` },
        payload: { classId, title: '草稿作业', status: 'draft' }
      });
      assert.equal(res.statusCode, 200);
      const records = await app.pool.query('SELECT * FROM homework_records WHERE homework_id = $1', [res.json().id]);
      assert.equal(records.rowCount, 0);
    });

- [ ] **Step 3: 运行测试确认失败**

Run: `node --test --test-concurrency=1 test/homework.test.ts`

Expected: FAIL，`/api/homework` 返回 404。

- [ ] **Step 4: 实现作业布置接口**

`server/src/routes/homework.ts`:

    import type { FastifyInstance } from 'fastify';
    import { authGuard } from '../auth/middleware.ts';
    import { requireModule } from '../permissions/module_access.ts';
    import { writeAudit } from '../audit.ts';

    export async function homeworkRoutes(app: FastifyInstance) {
      const guard = [authGuard, requireModule('homework')];

      app.get('/', { preHandler: guard }, async (request) => {
        const query = request.query as { classId?: string; status?: string };
        return (await app.pool.query(
          `SELECT h.*, c.name AS class_name, u.display_name AS teacher_name,
                  (SELECT COUNT(*) FROM homework_records r WHERE r.homework_id = h.id) AS student_count,
                  (SELECT COUNT(*) FROM homework_records r WHERE r.homework_id = h.id AND r.status <> 'not_submitted') AS submitted_count,
                  (SELECT COUNT(*) FROM homework_records r WHERE r.homework_id = h.id AND r.status = 'reviewed') AS reviewed_count,
                  (SELECT COUNT(*) FROM homework_records r WHERE r.homework_id = h.id AND r.read_at IS NULL AND r.status <> 'not_submitted') AS unread_count
           FROM homework h
           JOIN classes c ON c.id = h.class_id
           LEFT JOIN users u ON u.id = h.teacher_id
           WHERE ($1::bigint IS NULL OR h.class_id = $1)
             AND ($2::text IS NULL OR h.status = $2)
           ORDER BY h.id DESC`,
          [query.classId ? Number(query.classId) : null, query.status ?? null]
        )).rows;
      });

      app.post('/', { preHandler: guard }, async (request, reply) => {
        const body = request.body as {
          classId?: number; title?: string; content?: string; attachments?: unknown;
          status?: string; dueAt?: string;
        };
        if (!body.classId || !body.title?.trim()) return reply.code(400).send({ error: 'classId and title required' });
        const status = body.status === 'published' ? 'published' : 'draft';
        const client = await app.pool.connect();
        try {
          await client.query('BEGIN');
          const hw = await client.query(
            `INSERT INTO homework (class_id, teacher_id, title, content, attachments, status, assigned_at, due_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
            [body.classId, request.user!.id, body.title.trim(), body.content ?? null,
             JSON.stringify(body.attachments ?? []), status,
             status === 'published' ? new Date().toISOString() : null, body.dueAt ?? null]
          );
          if (status === 'published') {
            await client.query(
              `INSERT INTO homework_records (homework_id, student_id)
               SELECT $1, cs.student_id FROM class_students cs
               WHERE cs.class_id = $2 AND cs.left_at IS NULL
               ON CONFLICT DO NOTHING`,
              [hw.rows[0].id, body.classId]
            );
          }
          await client.query('COMMIT');
          await writeAudit(app, request.user!.id, 'homework_create', 'homework', hw.rows[0].id, { classId: body.classId, status });
          return hw.rows[0];
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }
      });

      app.post('/:id/publish', { preHandler: guard }, async (request, reply) => {
        const id = Number((request.params as { id: string }).id);
        const hw = (await app.pool.query('SELECT * FROM homework WHERE id = $1', [id])).rows[0];
        if (!hw) return reply.code(404).send({ error: 'homework not found' });
        await app.pool.query("UPDATE homework SET status = 'published', assigned_at = now() WHERE id = $1", [id]);
        await app.pool.query(
          `INSERT INTO homework_records (homework_id, student_id)
           SELECT $1, cs.student_id FROM class_students cs
           WHERE cs.class_id = $2 AND cs.left_at IS NULL
           ON CONFLICT DO NOTHING`,
          [id, hw.class_id]
        );
        return { ok: true };
      });
    }

`server/src/app.ts` 注册：

    import { homeworkRoutes } from './routes/homework.ts';
    await app.register(homeworkRoutes, { prefix: '/api/homework' });

- [ ] **Step 5: 运行测试确认通过**

Run: `node --test --test-concurrency=1 test/homework.test.ts`

Expected: PASS，2 个测试通过。

- [ ] **Step 6: 提交**

    git add server/src/migrations/010_homework.sql server/src/routes/homework.ts server/src/app.ts server/test/homework.test.ts
    git commit -m "feat: homework assignment api"

---

### Task 11: 作业提交与批改 API

**Files:**
- Modify: `server/src/routes/homework.ts`
- Modify: `server/src/routes/me.ts`
- Modify: `server/test/homework.test.ts`

- [ ] **Step 1: 写失败测试**

在 `server/test/homework.test.ts` 末尾追加：

    test('student submits and teacher reviews with valid state transitions', async () => {
      const created = await app.inject({
        method: 'POST', url: '/api/homework',
        headers: { authorization: `Bearer ${seed.teacherToken}` },
        payload: { classId, title: '状态机作业', status: 'published' }
      });
      const homeworkId = created.json().id;
      const submit = await app.inject({
        method: 'POST', url: `/api/homework/${homeworkId}/records/${studentA}/submit`,
        headers: { authorization: `Bearer ${seed.adminToken}` },
        payload: { content: '已完成' }
      });
      assert.equal(submit.statusCode, 200);
      const review = await app.inject({
        method: 'POST', url: `/api/homework/${homeworkId}/records/${studentA}/review`,
        headers: { authorization: `Bearer ${seed.teacherToken}` },
        payload: { score: 'A', comment: '完成得很好' }
      });
      assert.equal(review.statusCode, 200);
      const row = await app.pool.query('SELECT * FROM homework_records WHERE homework_id = $1 AND student_id = $2', [homeworkId, studentA]);
      assert.equal(row.rows[0].status, 'reviewed');
      assert.ok(row.rows[0].reviewed_at);
    });

    test('cannot review before submission', async () => {
      const created = await app.inject({
        method: 'POST', url: '/api/homework',
        headers: { authorization: `Bearer ${seed.teacherToken}` },
        payload: { classId, title: '未提交作业', status: 'published' }
      });
      const res = await app.inject({
        method: 'POST', url: `/api/homework/${created.json().id}/records/${studentB}/review`,
        headers: { authorization: `Bearer ${seed.teacherToken}` },
        payload: { score: 'B' }
      });
      assert.equal(res.statusCode, 409);
    });

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test --test-concurrency=1 test/homework.test.ts`

Expected: FAIL。

- [ ] **Step 3: 实现提交与批改**

在 `server/src/routes/homework.ts` 追加：

    app.post('/:id/records/:studentId/submit', { preHandler: guard }, async (request, reply) => {
      const id = Number((request.params as { id: string }).id);
      const studentId = Number((request.params as { studentId: string }).studentId);
      const body = request.body as { content?: string; attachments?: unknown };
      const record = (await app.pool.query(
        'SELECT * FROM homework_records WHERE homework_id = $1 AND student_id = $2',
        [id, studentId]
      )).rows[0];
      if (!record) return reply.code(404).send({ error: 'record not found' });
      if (record.status === 'reviewed') return reply.code(409).send({ error: '已批改，不能重复提交' });
      await app.pool.query(
        `UPDATE homework_records SET status = 'submitted', content = $1, attachments = $2, submitted_at = now()
         WHERE id = $3`,
        [body.content ?? null, JSON.stringify(body.attachments ?? []), record.id]
      );
      return { ok: true };
    });

    app.post('/:id/records/:studentId/review', { preHandler: guard }, async (request, reply) => {
      const id = Number((request.params as { id: string }).id);
      const studentId = Number((request.params as { studentId: string }).studentId);
      const body = request.body as { score?: string; comment?: string };
      const record = (await app.pool.query(
        'SELECT * FROM homework_records WHERE homework_id = $1 AND student_id = $2',
        [id, studentId]
      )).rows[0];
      if (!record) return reply.code(404).send({ error: 'record not found' });
      if (record.status === 'not_submitted') return reply.code(409).send({ error: '尚未提交，不能批改' });
      await app.pool.query(
        `UPDATE homework_records SET status = 'reviewed', score = $1, comment = $2, reviewed_at = now()
         WHERE id = $3`,
        [body.score ?? null, body.comment ?? null, record.id]
      );
      return { ok: true };
    });

`server/src/routes/me.ts` 追加家长/学生端作业查询与提交：

    app.get('/homework', { preHandler: [authGuard] }, async (request) => {
      const user = request.user!;
      const studentIds = user.role === 'student' && user.studentId
        ? [user.studentId]
        : (await app.pool.query('SELECT student_id FROM parent_bindings WHERE parent_user_id = $1', [user.id])).rows.map((b) => b.student_id);
      if (studentIds.length === 0) return [];
      return (await app.pool.query(
        `SELECT r.*, h.title, h.content AS homework_content, h.due_at, h.assigned_at,
                c.name AS class_name, st.name AS student_name
         FROM homework_records r
         JOIN homework h ON h.id = r.homework_id
         JOIN classes c ON c.id = h.class_id
         JOIN students st ON st.id = r.student_id
         WHERE r.student_id = ANY($1::bigint[])
         ORDER BY h.assigned_at DESC NULLS LAST`,
        [studentIds]
      )).rows;
    });

    app.post('/homework/:recordId/submit', { preHandler: [authGuard] }, async (request, reply) => {
      const recordId = Number((request.params as { recordId: string }).recordId);
      const body = request.body as { content?: string };
      const user = request.user!;
      const record = (await app.pool.query(
        `SELECT r.*, h.status AS homework_status FROM homework_records r
         JOIN homework h ON h.id = r.homework_id WHERE r.id = $1`,
        [recordId]
      )).rows[0];
      if (!record) return reply.code(404).send({ error: 'record not found' });
      if (user.role === 'parent') {
        const binding = await app.pool.query('SELECT 1 FROM parent_bindings WHERE parent_user_id = $1 AND student_id = $2', [user.id, record.student_id]);
        if (!binding.rowCount) return reply.code(403).send({ error: 'forbidden' });
      } else if (user.role !== 'student' || user.studentId !== Number(record.student_id)) {
        return reply.code(403).send({ error: 'forbidden' });
      }
      if (record.homework_status !== 'published') return reply.code(409).send({ error: '作业未发布' });
      if (record.status === 'reviewed') return reply.code(409).send({ error: '已批改，不能重复提交' });
      await app.pool.query(
        `UPDATE homework_records SET status = 'submitted', content = $1, submitted_at = now() WHERE id = $2`,
        [body.content ?? null, recordId]
      );
      return { ok: true };
    });

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test --test-concurrency=1 test/homework.test.ts`

Expected: PASS，4 个测试通过。

- [ ] **Step 5: 提交**

    git add server/src/routes/homework.ts server/src/routes/me.ts server/test/homework.test.ts
    git commit -m "feat: homework submit and review"
---

### Task 12: 作业管理页（教师/管理端）

**Files:**
- Create: `web/src/pages/HomeworkPage.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/Shell.tsx`

- [ ] **Step 1: 写页面**

`web/src/pages/HomeworkPage.tsx` 要点：

- 页签：作业列表 / 草稿箱 / 新建作业。
- 作业列表：`GET /api/homework`，列：标题、班级、布置教师、状态、学员数、已提交、已批改、未读、布置时间、截止时间；支持按班级与状态筛选。
- 新建作业：班级、标题、内容、截止时间；按钮「保存草稿」与「发布」。
- 批改：点击某条作业进入详情，列出学员记录（`GET /api/homework/:id/records`，需在 Task 11 中补充该接口），逐条填写评分与评语并调用 `/review`。

补充接口（Task 11 追加）：

    app.get('/:id/records', { preHandler: guard }, async (request) => {
      const id = Number((request.params as { id: string }).id);
      return (await app.pool.query(
        `SELECT r.*, st.name AS student_name FROM homework_records r
         JOIN students st ON st.id = r.student_id
         WHERE r.homework_id = $1 ORDER BY st.id`,
        [id]
      )).rows;
    });

- [ ] **Step 2: 注册路由与菜单**

`web/src/App.tsx` 增加 `/homework`；`web/src/Shell.tsx` 增加「作业」菜单（图标 `ClipboardList`，`can('homework')`）。

- [ ] **Step 3: 构建验证**

Run（`web/`）：`tsc --noEmit` 与 `vite build --configLoader runner`。

- [ ] **Step 4: 提交**

    git add web/src server/src/routes/homework.ts
    git commit -m "feat: homework management page"

---

### Task 13: 家长/学生端作业页

**Files:**
- Create: `web/src/pages/MyHomeworkPage.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/Shell.tsx`

- [ ] **Step 1: 写页面**

`web/src/pages/MyHomeworkPage.tsx` 要点：

- `GET /api/me/homework` 展示作业列表：标题、班级、学员、状态（未提交/已提交/已批改）、截止时间、评分、评语。
- 未提交且作业已发布时可填写提交内容并调用 `POST /api/me/homework/:recordId/submit`。
- 显示教师评分与评语。

- [ ] **Step 2: 注册路由与菜单**

`web/src/App.tsx` 增加 `/my-homework`；`web/src/Shell.tsx` 家长端增加「我的作业」，学生端同样。

- [ ] **Step 3: 构建验证**

Run（`web/`）：`tsc --noEmit` 与 `vite build --configLoader runner`。

- [ ] **Step 4: 提交**

    git add web/src
    git commit -m "feat: parent and student homework page"

---

### Task 14: 2B-1 端到端验收

**Files:** 无新增，按清单验收。

- [ ] **Step 1: 全量后端测试**

Run（`server/`）：`node --test --test-concurrency=1 "test/*.test.ts"`

Expected: 一期 + 2A + 2B-1 全部通过（预计 60+ 个用例）。

- [ ] **Step 2: 类型检查与构建**

Run（`server/`）：`node_modules\.bin\tsc.CMD --noEmit`
Run（`web/`）：`node_modules\.bin\tsc.CMD --noEmit` 与 `node_modules\.bin\vite.CMD build --configLoader runner`

Expected: 全部通过。

- [ ] **Step 3: 手工验收流程**

1. 管理员在「项目设置」「考试设置」新增项目与考试。
2. 教师按班级录入成绩（项目 + 考试 + 日期 + 来源），再次提交同一组合 → 覆盖更新。
3. 成绩查询按项目/考试/日期筛选，导出 CSV。
4. CSV 导入包含 1 条正确 + 1 条错误数据 → 报告显示 1 行错误并定位列。
5. 家长/学生登录「我的成绩」能看到新成绩。
6. 教师对一节课逐学员点评（评分/评语/小红花），套用模板后个别修改。
7. 家长「我的点评」能看到评语并点击后阅读率上升。
8. 教师布置作业 → 学员记录自动生成；家长/学生提交 → 教师批改 → 提交率/已批改/未读统计正确。
9. 回归：学员、班级、报读、排课、记上课、课时流水均正常。

- [ ] **Step 4: 更新进度文档**

把 2B-1 完成情况写入 `PROGRESS.md`；git 提交受沙箱限制时记录说明。

## 自检记录

- 规格覆盖：成绩三层模型（任务 1-4）、成绩导入（5）、家长端成绩（6）、点评（7-9）、作业（10-13）、验收（14）——与设计文档第 2 节范围逐项对应。
- 占位符扫描：无 TBD/TODO；每个任务都给出具体 SQL、接口代码或明确的前端要点与命令。
- 类型一致性：成绩接口统一使用 `student_scores`/`exam_projects`/`exams`；点评统一 `teaching_comments` + `teaching_log_id`；作业统一 `homework`/`homework_records` 与三态字符串 `not_submitted|submitted|reviewed`。
- 已知偏差：前端页面以「要点 + 接口 + 关键常量」描述，未逐行给出完整 JSX；实现时按现有页面风格补齐（与 2A 计划一致）。