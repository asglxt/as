# 学校管理系统一期 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付一期学校管理系统：多校区组织与权限、学员档案/班级、成绩管理、Excel 导入、家长/学生端成绩查看，并满足设计文档中的验收标准。

**Architecture:** React (Vite) 前端 + Node.js (Fastify) REST API + PostgreSQL。后端在 Node 24 上直接运行 TypeScript（type stripping，无编译步骤），数据库迁移用自建 SQL 迁移器；权限由后端中间件强制校验，成绩修改写审计日志。

**Tech Stack:** Node.js 24、TypeScript、Fastify 5、pg、jsonwebtoken、bcryptjs、csv-parse、React 18、Vite、react-router-dom、PostgreSQL 16、Docker Compose

---

## 执行前提

- 执行环境能访问 npm registry（首次 `npm install` 需要）；若沙箱无网络，先申请网络权限。
- 执行环境有 Docker 或可访问的 PostgreSQL 16。数据库连接默认 `postgres://school:school@localhost:5432/school`，测试库 `school_test`。
- 设计文档：`docs/superpowers/specs/2026-08-13-school-management-system-design.md`。
- 每个任务按顺序执行；先写失败测试，再实现，再验证，再提交。

## 目录结构

```
.
├── package.json                  # npm workspaces 根
├── docker-compose.yml            # 本地/生产数据库与反向代理
├── .env.example
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   ├── scripts/create-test-db.mjs
│   ├── src/
│   │   ├── config.ts             # 环境变量
│   │   ├── db.ts                 # pg Pool
│   │   ├── migrate.ts            # SQL 迁移器
│   │   ├── migrations/001_init.sql
│   │   ├── app.ts                # Fastify 组装
│   │   ├── server.ts             # 入口
│   │   ├── auth/
│   │   │   ├── password.ts
│   │   │   ├── token.ts
│   │   │   └── middleware.ts
│   │   ├── audit.ts
│   │   └── routes/
│   │       ├── auth.ts
│   │       ├── campuses.ts
│   │       ├── classes.ts
│   │       ├── students.ts
│   │       ├── exams.ts
│   │       ├── scores.ts
│   │       ├── reports.ts
│   │       └── imports.ts
│   └── test/
│       ├── helpers.ts
│       ├── auth.test.ts
│       ├── students.test.ts
│       ├── grades.test.ts
│       └── imports.test.ts
└── web/
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── api.ts
        ├── auth.tsx
        ├── styles.css
        └── pages/
            ├── LoginPage.tsx
            ├── DashboardPage.tsx
            ├── StudentsPage.tsx
            ├── ClassesPage.tsx
            ├── GradesPage.tsx
            ├── ImportPage.tsx
            └── MyScoresPage.tsx
```

## 任务总览

- 里程碑 1（任务 1-6）：仓库、数据库、认证与角色
- 里程碑 2（任务 7-10）：权限、校区、班级、学员
- 里程碑 3（任务 11-14）：考试、成绩、分析、报告
- 里程碑 4（任务 15-16）：CSV 导入
- 里程碑 5（任务 17-21）：前端页面
- 里程碑 6（任务 22-24）：部署、备份、验收

---

### Task 1: 初始化 npm workspaces 与 TypeScript 配置

**Files:**
- Create: `package.json`
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `web/package.json`
- Modify: `.gitignore`

- [ ] **Step 1: 创建根 workspace**

`package.json`:

```json
{
  "name": "school-system",
  "private": true,
  "workspaces": ["server", "web"],
  "scripts": {
    "dev:server": "npm --workspace server run dev",
    "dev:web": "npm --workspace web run dev",
    "test": "npm --workspace server test",
    "migrate": "npm --workspace server run migrate"
  }
}
```

- [ ] **Step 2: 创建 server 配置**

`server/package.json`:

```json
{
  "name": "server",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "node --watch src/server.ts",
    "start": "node src/server.ts",
    "migrate": "node src/migrate.ts",
    "test": "node --test test/"
  },
  "dependencies": {
    "@fastify/cors": "^10.0.1",
    "bcryptjs": "^3.0.2",
    "csv-parse": "^6.1.0",
    "fastify": "^5.2.0",
    "jsonwebtoken": "^9.0.2",
    "pg": "^8.13.1"
  },
  "devDependencies": {
    "@types/jsonwebtoken": "^9.0.7",
    "@types/node": "^24.0.0",
    "@types/pg": "^8.11.10",
    "typescript": "^5.7.3"
  }
}
```

`server/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "allowImportingTsExtensions": true,
    "rewriteRelativeImportExtensions": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src", "test", "scripts"]
}
```

- [ ] **Step 3: 创建 web 配置**

`web/package.json`:

```json
{
  "name": "web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "lucide-react": "^0.474.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^7.1.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.18",
    "@types/react-dom": "^18.3.5",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "^5.7.3",
    "vite": "^6.0.7"
  }
}
```

- [ ] **Step 4: 更新 .gitignore**

追加以下内容到 `.gitignore`：

```gitignore
dist/
.env
*.log
```

- [ ] **Step 5: 安装依赖**

Run: `npm install`

Expected: workspaces 安装成功，生成根目录 `node_modules` 与 lockfile。

- [ ] **Step 6: 提交**

```bash
git add package.json server web .gitignore package-lock.json
git commit -m "chore: scaffold npm workspaces"
```

---

### Task 2: Docker Compose 提供 PostgreSQL

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.example`

- [ ] **Step 1: 写 compose 文件**

`docker-compose.yml`:

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: school
      POSTGRES_PASSWORD: school
      POSTGRES_DB: school
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U school -d school"]
      interval: 5s
      timeout: 3s
      retries: 10

volumes:
  pgdata:
```

`.env.example`:

```env
DATABASE_URL=postgres://school:school@localhost:5432/school
JWT_SECRET=change-me-in-production
PORT=3000
```

- [ ] **Step 2: 启动数据库并验证**

Run: `docker compose up -d db`

Expected: `Started` 且 `docker compose ps db` 状态为 `healthy`。

- [ ] **Step 3: 提交**

```bash
git add docker-compose.yml .env.example
git commit -m "chore: add postgres docker compose"
```

---

### Task 3: 数据库迁移器与初始 Schema

**Files:**
- Create: `server/src/db.ts`
- Create: `server/src/config.ts`
- Create: `server/src/migrate.ts`
- Create: `server/src/migrations/001_init.sql`

- [ ] **Step 1: 写配置与连接池**

`server/src/config.ts`:

```ts
export interface Config {
  port: number;
  databaseUrl: string;
  jwtSecret: string;
}

export function loadConfig(): Config {
  return {
    port: Number(process.env.PORT ?? 3000),
    databaseUrl: process.env.DATABASE_URL ?? 'postgres://school:school@localhost:5432/school',
    jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me'
  };
}
```

`server/src/db.ts`:

```ts
import pg from 'pg';

export function createPool(databaseUrl: string): pg.Pool {
  return new pg.Pool({ connectionString: databaseUrl });
}
```

- [ ] **Step 2: 写迁移器**

`server/src/migrate.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import { createPool } from './db.ts';

export async function migrate(databaseUrl: string): Promise<void> {
  const pool = createPool(databaseUrl);
  await pool.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())'
  );
  const dir = path.join(import.meta.dirname, 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const result = await pool.query('SELECT 1 FROM schema_migrations WHERE name = $1', [file]);
    if (result.rowCount) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
  await pool.end();
}

const entry = process.argv[1];
if (entry && path.resolve(entry) === import.meta.filename) {
  const { loadConfig } = await import('./config.ts');
  migrate(loadConfig().databaseUrl)
    .then(() => console.log('migrations applied'))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
```

- [ ] **Step 3: 写初始 schema**

`server/src/migrations/001_init.sql`:

```sql
CREATE TABLE campuses (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE students (
  id BIGSERIAL PRIMARY KEY,
  campus_id BIGINT NOT NULL REFERENCES campuses(id),
  name TEXT NOT NULL,
  guardian_phone TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','graduated')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT UNIQUE,
  password_hash TEXT NOT NULL DEFAULT '',
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','teacher','parent','student')),
  campus_id BIGINT REFERENCES campuses(id),
  student_id BIGINT UNIQUE REFERENCES students(id),
  invite_code TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE classes (
  id BIGSERIAL PRIMARY KEY,
  campus_id BIGINT NOT NULL REFERENCES campuses(id),
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  grade TEXT NOT NULL,
  schedule TEXT,
  teacher_id BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE class_students (
  class_id BIGINT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at TIMESTAMPTZ,
  PRIMARY KEY (class_id, student_id)
);

CREATE TABLE exams (
  id BIGSERIAL PRIMARY KEY,
  class_id BIGINT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'unit' CHECK (type IN ('unit','midterm','final','level')),
  exam_date DATE NOT NULL,
  max_score NUMERIC(6,2),
  grading_system TEXT NOT NULL DEFAULT 'percent' CHECK (grading_system IN ('percent','level','points','comment')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE scores (
  id BIGSERIAL PRIMARY KEY,
  exam_id BIGINT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  numeric_score NUMERIC(6,2),
  level TEXT,
  points INTEGER,
  comment TEXT,
  entered_by BIGINT NOT NULL REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (exam_id, student_id)
);

CREATE TABLE parent_bindings (
  parent_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  PRIMARY KEY (parent_user_id, student_id)
);

CREATE TABLE import_jobs (
  id BIGSERIAL PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('students','classes','scores')),
  status TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded','validating','failed','done')),
  total_rows INTEGER NOT NULL DEFAULT 0,
  error_rows INTEGER NOT NULL DEFAULT 0,
  errors JSONB NOT NULL DEFAULT '[]',
  created_by BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_id BIGINT REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id BIGINT,
  detail JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_scores_exam ON scores(exam_id);
CREATE INDEX idx_scores_student ON scores(student_id);
CREATE INDEX idx_class_students_student ON class_students(student_id);
CREATE INDEX idx_users_role ON users(role);
```

- [ ] **Step 4: 运行迁移验证**

Run: `npm run migrate`

Expected: 输出 `migrations applied`；数据库存在 `schema_migrations` 与全部业务表。

- [ ] **Step 5: 提交**

```bash
git add server/src
git commit -m "feat: add database migrations"
```

---

### Task 4: Fastify 应用骨架与健康检查

**Files:**
- Create: `server/src/app.ts`
- Create: `server/src/server.ts`
- Create: `server/test/helpers.ts`
- Create: `server/test/health.test.ts`

- [ ] **Step 1: 写失败测试**

`server/test/helpers.ts`:

```ts
import { buildApp } from '../src/app.ts';
import { migrate } from '../src/migrate.ts';

export const TEST_DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://school:school@localhost:5432/school_test';

export async function setupApp() {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  await migrate(TEST_DATABASE_URL);
  return buildApp();
}
```

`server/test/health.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupApp } from './helpers.ts';

test('GET /api/health returns ok', async () => {
  const app = await setupApp();
  const res = await app.inject({ method: 'GET', url: '/api/health' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { ok: true });
  await app.close();
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm --workspace server test`

Expected: FAIL，报 `Cannot find module '../src/app.ts'`。

- [ ] **Step 3: 实现 app 与入口**

`server/src/app.ts`:

```ts
import Fastify from 'fastify';
import cors from '@fastify/cors';
import type pg from 'pg';
import { loadConfig } from './config.ts';
import { createPool } from './db.ts';

declare module 'fastify' {
  interface FastifyInstance {
    secret: string;
    pool: pg.Pool;
  }
  interface FastifyRequest {
    user?: { id: number; role: 'admin' | 'teacher' | 'parent' | 'student'; campusId: number | null; studentId: number | null };
  }
}

export async function buildApp() {
  const config = loadConfig();
  const pool = createPool(config.databaseUrl);
  const app = Fastify({ logger: false });
  app.decorate('secret', config.jwtSecret);
  app.decorate('pool', pool);
  await app.register(cors, { origin: true });

  app.get('/api/health', async () => ({ ok: true }));

  return app;
}
```

`server/src/server.ts`:

```ts
import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { migrate } from './migrate.ts';

const config = loadConfig();
await migrate(config.databaseUrl);
const app = await buildApp();
await app.listen({ port: config.port, host: '0.0.0.0' });
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm --workspace server test`

Expected: PASS，1 个测试通过。

- [ ] **Step 5: 提交**

```bash
git add server/src server/test
git commit -m "feat: fastify app with health check"
```

---

### Task 5: 密码哈希与 JWT 工具

**Files:**
- Create: `server/src/auth/password.ts`
- Create: `server/src/auth/token.ts`
- Create: `server/test/auth-tools.test.ts`

- [ ] **Step 1: 写失败测试**

`server/test/auth-tools.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../src/auth/password.ts';
import { signToken, verifyToken } from '../src/auth/token.ts';

test('password hash roundtrip', async () => {
  const hash = await hashPassword('secret123');
  assert.notEqual(hash, 'secret123');
  assert.equal(await verifyPassword('secret123', hash), true);
  assert.equal(await verifyPassword('wrong', hash), false);
});

test('jwt sign and verify', () => {
  const token = signToken({ userId: 7, role: 'admin', campusId: null, studentId: null }, 'test-secret');
  const payload = verifyToken(token, 'test-secret');
  assert.equal(payload.userId, 7);
  assert.equal(payload.role, 'admin');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm --workspace server test`

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现工具**

`server/src/auth/password.ts`:

```ts
import bcrypt from 'bcryptjs';

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
```

`server/src/auth/token.ts`:

```ts
import jwt from 'jsonwebtoken';

export interface TokenPayload {
  userId: number;
  role: 'admin' | 'teacher' | 'parent' | 'student';
  campusId: number | null;
  studentId: number | null;
}

export function signToken(payload: TokenPayload, secret: string): string {
  return jwt.sign(payload, secret, { expiresIn: '7d' });
}

export function verifyToken(token: string, secret: string): TokenPayload {
  return jwt.verify(token, secret) as TokenPayload;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm --workspace server test`

Expected: PASS，3 个测试通过。

- [ ] **Step 5: 提交**

```bash
git add server/src/auth server/test/auth-tools.test.ts
git commit -m "feat: password and jwt utilities"
```

---

### Task 6: 登录与邀请码 API

**Files:**
- Create: `server/src/routes/auth.ts`
- Modify: `server/src/app.ts`
- Create: `server/test/auth.test.ts`
- Create: `server/scripts/create-test-db.mjs`

- [ ] **Step 1: 写失败测试**

`server/test/auth.test.ts`:

```ts
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupApp } from './helpers.ts';
import { hashPassword } from '../src/auth/password.ts';

const app = await setupApp();

beforeEach(async () => {
  await app.pool.query('TRUNCATE parent_bindings, import_jobs, audit_logs, scores, exams, class_students, classes, users, students, campuses RESTART IDENTITY CASCADE');
  const campus = await app.pool.query("INSERT INTO campuses (name) VALUES ('测试校区') RETURNING id");
  const campusId = campus.rows[0].id;
  await app.pool.query(
    "INSERT INTO users (username, password_hash, display_name, role, campus_id) VALUES ('admin', $1, '管理员', 'admin', $2)",
    [await hashPassword('admin123'), campusId]
  );
});

test('admin can login', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username: 'admin', password: 'admin123' }
  });
  assert.equal(res.statusCode, 200);
  assert.ok(res.json().token);
  assert.equal(res.json().user.role, 'admin');
});

test('wrong password rejected', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username: 'admin', password: 'nope' }
  });
  assert.equal(res.statusCode, 401);
});

test('invite creates parent and claim sets credentials', async () => {
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username: 'admin', password: 'admin123' }
  });
  const token = login.json().token;
  const student = await app.pool.query("INSERT INTO students (campus_id, name) VALUES (1, '张三') RETURNING id");
  const invite = await app.inject({
    method: 'POST',
    url: '/api/auth/invite',
    headers: { authorization: `Bearer ${token}` },
    payload: { role: 'parent', studentId: student.rows[0].id, displayName: '张三家长' }
  });
  assert.equal(invite.statusCode, 200);
  const code = invite.json().inviteCode;
  const claim = await app.inject({
    method: 'POST',
    url: '/api/auth/claim',
    payload: { inviteCode: code, username: 'parent1', password: 'pass1234' }
  });
  assert.equal(claim.statusCode, 200);
  const parentLogin = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username: 'parent1', password: 'pass1234' }
  });
  assert.equal(parentLogin.statusCode, 200);
});
```

- [ ] **Step 2: 创建测试数据库脚本**

`server/scripts/create-test-db.mjs`:

```js
import pg from 'pg';

const adminUrl = process.env.ADMIN_DATABASE_URL ?? 'postgres://school:school@localhost:5432/postgres';
const client = new pg.Client({ connectionString: adminUrl });
await client.connect();
try {
  await client.query('CREATE DATABASE school_test');
  console.log('test database created');
} catch (err) {
  if (err.code === '42P04') {
    console.log('test database already exists');
  } else {
    throw err;
  }
}
await client.end();
```

- [ ] **Step 3: 运行测试确认失败**

先执行 `node server/scripts/create-test-db.mjs`，再 Run: `npm --workspace server test`

Expected: FAIL，`/api/auth/login` 返回 404。

- [ ] **Step 4: 实现 auth 路由**

`server/src/routes/auth.ts`:

```ts
import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { hashPassword, verifyPassword } from '../auth/password.ts';
import { signToken } from '../auth/token.ts';

export async function authRoutes(app: FastifyInstance) {
  app.post('/login', async (request, reply) => {
    const body = request.body as { username?: string; password?: string };
    if (!body.username || !body.password) {
      return reply.code(400).send({ error: 'username and password required' });
    }
    const result = await app.pool.query(
      'SELECT id, username, password_hash, display_name, role, campus_id, student_id FROM users WHERE username = $1',
      [body.username]
    );
    const user = result.rows[0];
    if (!user || !(await verifyPassword(body.password, user.password_hash))) {
      return reply.code(401).send({ error: 'invalid credentials' });
    }
    const token = signToken(
      { userId: user.id, role: user.role, campusId: user.campus_id, studentId: user.student_id },
      app.secret
    );
    return {
      token,
      user: { id: user.id, username: user.username, displayName: user.display_name, role: user.role }
    };
  });

  app.post('/invite', async (request, reply) => {
    const body = request.body as { role?: string; studentId?: number; campusId?: number; displayName?: string };
    const role = body.role;
    if (!role || !['parent', 'student', 'teacher'].includes(role) || !body.displayName) {
      return reply.code(400).send({ error: 'role and displayName required' });
    }
    if (role === 'parent' && !body.studentId) {
      return reply.code(400).send({ error: 'studentId required for parent' });
    }
    const inviteCode = crypto.randomBytes(6).toString('hex');
    const result = await app.pool.query(
      `INSERT INTO users (username, password_hash, display_name, role, campus_id, student_id, invite_code)
       VALUES (NULL, '', $1, $2, $3, $4, $5)
       RETURNING id`,
      [body.displayName, role, body.campusId ?? null, body.studentId ?? null, inviteCode]
    );
    return { inviteCode, userId: result.rows[0].id };
  });

  app.post('/claim', async (request, reply) => {
    const body = request.body as { inviteCode?: string; username?: string; password?: string };
    if (!body.inviteCode || !body.username || !body.password || body.password.length < 8) {
      return reply.code(400).send({ error: 'inviteCode, username and password (>=8 chars) required' });
    }
    const result = await app.pool.query('SELECT id FROM users WHERE invite_code = $1', [body.inviteCode]);
    const user = result.rows[0];
    if (!user) return reply.code(400).send({ error: 'invalid invite code' });
    await app.pool.query(
      'UPDATE users SET username = $1, password_hash = $2, invite_code = NULL WHERE id = $3',
      [body.username, await hashPassword(body.password), user.id]
    );
    return { ok: true };
  });
}
```

`server/src/app.ts` 修改：注册 auth 路由。

```ts
import { authRoutes } from './routes/auth.ts';
// 在 app.get('/api/health', ...) 之后加入：
await app.register(authRoutes, { prefix: '/api/auth' });
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm --workspace server test`

Expected: PASS，6 个测试通过。

- [ ] **Step 6: 提交**

```bash
git add server/src/routes/auth.ts server/src/app.ts server/test/auth.test.ts server/scripts
git commit -m "feat: auth login and invite flow"
```

---

### Task 7: 权限中间件

**Files:**
- Create: `server/src/auth/middleware.ts`
- Create: `server/src/permissions.ts`
- Modify: `server/src/routes/auth.ts`
- Modify: `server/test/helpers.ts`
- Modify: `server/test/auth.test.ts`

- [ ] **Step 1: 写失败测试**

在 `server/test/auth.test.ts` 末尾追加：

```ts
test('me returns current user', async () => {
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username: 'admin', password: 'admin123' }
  });
  const res = await app.inject({
    method: 'GET',
    url: '/api/auth/me',
    headers: { authorization: `Bearer ${login.json().token}` }
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().role, 'admin');
});

test('missing token rejected', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/auth/me' });
  assert.equal(res.statusCode, 401);
});

test('teacher cannot create invite', async () => {
  const teacher = await app.pool.query(
    "INSERT INTO users (username, password_hash, display_name, role, campus_id) VALUES ('teacher', $1, '教师', 'teacher', 1) RETURNING id",
    [await hashPassword('teacher123')]
  );
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username: 'teacher', password: 'teacher123' }
  });
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/invite',
    headers: { authorization: `Bearer ${login.json().token}` },
    payload: { role: 'parent', studentId: teacher.rows[0].id, displayName: 'X' }
  });
  assert.equal(res.statusCode, 403);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm --workspace server test`

Expected: FAIL，`/api/auth/me` 返回 404。

- [ ] **Step 3: 实现中间件**

`server/src/auth/middleware.ts`:

```ts
import type { FastifyReply, FastifyRequest } from 'fastify';
import { verifyToken } from './token.ts';

export type Role = 'admin' | 'teacher' | 'parent' | 'student';

export function authGuard(request: FastifyRequest, reply: FastifyReply, done: () => void) {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    reply.code(401).send({ error: 'unauthorized' });
    return;
  }
  try {
    const payload = verifyToken(header.slice(7), request.server.secret);
    request.user = {
      id: payload.userId,
      role: payload.role,
      campusId: payload.campusId,
      studentId: payload.studentId
    };
    done();
  } catch {
    reply.code(401).send({ error: 'invalid token' });
  }
}

export function requireRole(...roles: Role[]) {
  return (request: FastifyRequest, reply: FastifyReply, done: () => void) => {
    if (!request.user || !roles.includes(request.user.role)) {
      reply.code(403).send({ error: 'forbidden' });
      return;
    }
    done();
  };
}
```

`server/src/permissions.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import type { Role } from './auth/middleware.ts';

interface User {
  id: number;
  role: Role;
  campusId: number | null;
  studentId: number | null;
}

export async function canAccessClass(app: FastifyInstance, user: User, classId: number): Promise<boolean> {
  if (user.role === 'admin') return true;
  if (user.role === 'teacher') {
    const result = await app.pool.query('SELECT 1 FROM classes WHERE id = $1 AND teacher_id = $2', [classId, user.id]);
    return Boolean(result.rowCount);
  }
  return false;
}
```

`server/src/routes/auth.ts` 修改：

```ts
import { authGuard, requireRole } from '../auth/middleware.ts';

// /invite 路由加守卫：
app.post('/invite', { preHandler: [authGuard, requireRole('admin')] }, async (request, reply) => { ... });

// 新增 me：
app.get('/me', { preHandler: [authGuard] }, async (request) => {
  const result = await app.pool.query(
    'SELECT id, username, display_name, role, campus_id FROM users WHERE id = $1',
    [request.user!.id]
  );
  const user = result.rows[0];
  return { id: user.id, username: user.username, displayName: user.display_name, role: user.role, campusId: user.campus_id };
});
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm --workspace server test`

Expected: PASS，9 个测试通过。

- [ ] **Step 5: 提交**

```bash
git add server/src/auth/middleware.ts server/src/permissions.ts server/src/routes/auth.ts server/test/auth.test.ts
git commit -m "feat: auth guard and role middleware"
```

---

### Task 8: 校区 API

**Files:**
- Create: `server/src/routes/campuses.ts`
- Modify: `server/src/app.ts`
- Create: `server/test/campuses.test.ts`

- [ ] **Step 1: 写失败测试**

`server/test/campuses.test.ts`:

```ts
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupApp, seedBase } from './helpers.ts';

const app = await setupApp();
let adminToken = '';

beforeEach(async () => {
  const seed = await seedBase(app);
  adminToken = seed.adminToken;
});

test('admin creates and lists campuses', async () => {
  const create = await app.inject({
    method: 'POST',
    url: '/api/campuses',
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { name: '东城校区' }
  });
  assert.equal(create.statusCode, 200);
  const list = await app.inject({
    method: 'GET',
    url: '/api/campuses',
    headers: { authorization: `Bearer ${adminToken}` }
  });
  assert.equal(list.statusCode, 200);
  assert.ok(list.json().some((c: { name: string }) => c.name === '东城校区'));
});

test('teacher cannot create campus', async () => {
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username: 'teacher', password: 'teacher123' }
  });
  const res = await app.inject({
    method: 'POST',
    url: '/api/campuses',
    headers: { authorization: `Bearer ${login.json().token}` },
    payload: { name: '违规校区' }
  });
  assert.equal(res.statusCode, 403);
});
```

- [ ] **Step 2: 扩展测试种子**

`server/test/helpers.ts` 追加：

```ts
import { hashPassword } from '../src/auth/password.ts';

export async function seedBase(app: Awaited<ReturnType<typeof setupApp>>) {
  await app.pool.query(
    'TRUNCATE parent_bindings, import_jobs, audit_logs, scores, exams, class_students, classes, users, students, campuses RESTART IDENTITY CASCADE'
  );
  const campus = await app.pool.query("INSERT INTO campuses (name) VALUES ('测试校区') RETURNING id");
  const campusId = campus.rows[0].id;
  await app.pool.query(
    "INSERT INTO users (username, password_hash, display_name, role, campus_id) VALUES ('admin', $1, '管理员', 'admin', $2)",
    [await hashPassword('admin123'), campusId]
  );
  await app.pool.query(
    "INSERT INTO users (username, password_hash, display_name, role, campus_id) VALUES ('teacher', $1, '教师', 'teacher', $2)",
    [await hashPassword('teacher123'), campusId]
  );
  const adminLogin = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username: 'admin', password: 'admin123' }
  });
  const teacherLogin = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username: 'teacher', password: 'teacher123' }
  });
  return {
    campusId,
    adminToken: adminLogin.json().token,
    teacherToken: teacherLogin.json().token
  };
}
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npm --workspace server test`

Expected: FAIL，`/api/campuses` 返回 404。

- [ ] **Step 4: 实现校区路由**

`server/src/routes/campuses.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { authGuard, requireRole } from '../auth/middleware.ts';

export async function campusRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [authGuard] }, async (request) => {
    if (request.user!.role !== 'admin' && request.user!.role !== 'teacher') {
      return [];
    }
    const result = await app.pool.query('SELECT id, name FROM campuses ORDER BY id');
    return result.rows;
  });

  app.post('/', { preHandler: [authGuard, requireRole('admin')] }, async (request, reply) => {
    const body = request.body as { name?: string };
    if (!body.name?.trim()) return reply.code(400).send({ error: 'name required' });
    try {
      const result = await app.pool.query('INSERT INTO campuses (name) VALUES ($1) RETURNING id, name', [body.name.trim()]);
      return result.rows[0];
    } catch (err: any) {
      if (err.code === '23505') return reply.code(409).send({ error: 'campus name exists' });
      throw err;
    }
  });
}
```

`server/src/app.ts` 修改：

```ts
import { campusRoutes } from './routes/campuses.ts';
// 注册：
await app.register(campusRoutes, { prefix: '/api/campuses' });
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm --workspace server test`

Expected: PASS，11 个测试通过。

- [ ] **Step 6: 提交**

```bash
git add server/src/routes/campuses.ts server/src/app.ts server/test/campuses.test.ts server/test/helpers.ts
git commit -m "feat: campus api"
```

---

### Task 9: 班级 API

**Files:**
- Create: `server/src/routes/classes.ts`
- Modify: `server/src/app.ts`
- Create: `server/test/classes.test.ts`

- [ ] **Step 1: 写失败测试**

`server/test/classes.test.ts`:

```ts
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupApp, seedBase } from './helpers.ts';

const app = await setupApp();
let seed: Awaited<ReturnType<typeof seedBase>>;

beforeEach(async () => {
  seed = await seedBase(app);
});

test('admin creates class and teacher sees only own class', async () => {
  const teacherId = (await app.pool.query("SELECT id FROM users WHERE username = 'teacher'")).rows[0].id;
  const create = await app.inject({
    method: 'POST',
    url: '/api/classes',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { campusId: seed.campusId, name: '三年级英语1班', subject: '英语', grade: '三年级', teacherId }
  });
  assert.equal(create.statusCode, 200);
  const classId = create.json().id;
  const teacherList = await app.inject({
    method: 'GET',
    url: '/api/classes',
    headers: { authorization: `Bearer ${seed.teacherToken}` }
  });
  assert.equal(teacherList.json().length, 1);
  assert.equal(teacherList.json()[0].id, classId);
});

test('teacher cannot create class for another campus', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/classes',
    headers: { authorization: `Bearer ${seed.teacherToken}` },
    payload: { campusId: seed.campusId, name: 'X班', subject: '数学', grade: '初二' }
  });
  assert.equal(res.statusCode, 403);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm --workspace server test`

Expected: FAIL，`/api/classes` 返回 404。

- [ ] **Step 3: 实现班级路由**

`server/src/routes/classes.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { authGuard, requireRole } from '../auth/middleware.ts';

export async function classRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [authGuard] }, async (request) => {
    const user = request.user!;
    const result = user.role === 'teacher'
      ? await app.pool.query(
          'SELECT c.*, u.display_name AS teacher_name FROM classes c LEFT JOIN users u ON u.id = c.teacher_id WHERE c.teacher_id = $1 ORDER BY c.id',
          [user.id]
        )
      : await app.pool.query(
          'SELECT c.*, u.display_name AS teacher_name FROM classes c LEFT JOIN users u ON u.id = c.teacher_id ORDER BY c.id'
        );
    return result.rows;
  });

  app.post('/', { preHandler: [authGuard, requireRole('admin')] }, async (request, reply) => {
    const body = request.body as { campusId?: number; name?: string; subject?: string; grade?: string; teacherId?: number; schedule?: string };
    if (!body.campusId || !body.name?.trim() || !body.subject?.trim() || !body.grade?.trim()) {
      return reply.code(400).send({ error: 'campusId, name, subject, grade required' });
    }
    const result = await app.pool.query(
      `INSERT INTO classes (campus_id, name, subject, grade, schedule, teacher_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [body.campusId, body.name.trim(), body.subject.trim(), body.grade.trim(), body.schedule ?? null, body.teacherId ?? null]
    );
    return result.rows[0];
  });

  app.patch('/:id', { preHandler: [authGuard, requireRole('admin')] }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const body = request.body as { name?: string; subject?: string; grade?: string; schedule?: string; teacherId?: number | null };
    const result = await app.pool.query(
      `UPDATE classes SET name = COALESCE($1, name), subject = COALESCE($2, subject), grade = COALESCE($3, grade),
       schedule = COALESCE($4, schedule), teacher_id = $5 WHERE id = $6 RETURNING *`,
      [body.name, body.subject, body.grade, body.schedule, body.teacherId ?? null, id]
    );
    if (!result.rowCount) return reply.code(404).send({ error: 'class not found' });
    return result.rows[0];
  });
}
```

`server/src/app.ts` 修改：

```ts
import { classRoutes } from './routes/classes.ts';
await app.register(classRoutes, { prefix: '/api/classes' });
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm --workspace server test`

Expected: PASS，13 个测试通过。

- [ ] **Step 5: 提交**

```bash
git add server/src/routes/classes.ts server/src/app.ts server/test/classes.test.ts
git commit -m "feat: class api"
```

---

### Task 10: 学员 API 与分班/转班

**Files:**
- Create: `server/src/routes/students.ts`
- Modify: `server/src/app.ts`
- Create: `server/test/students.test.ts`

- [ ] **Step 1: 写失败测试**

`server/test/students.test.ts`:

```ts
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupApp, seedBase } from './helpers.ts';

const app = await setupApp();
let seed: Awaited<ReturnType<typeof seedBase>>;
let classId = 0;

beforeEach(async () => {
  seed = await seedBase(app);
  const teacherId = (await app.pool.query("SELECT id FROM users WHERE username = 'teacher'")).rows[0].id;
  const create = await app.inject({
    method: 'POST',
    url: '/api/classes',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { campusId: seed.campusId, name: '三年级英语1班', subject: '英语', grade: '三年级', teacherId }
  });
  classId = create.json().id;
});

test('admin creates student and enrolls into class', async () => {
  const create = await app.inject({
    method: 'POST',
    url: '/api/students',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { campusId: seed.campusId, name: '张三', guardianPhone: '13800000000' }
  });
  assert.equal(create.statusCode, 200);
  const studentId = create.json().id;
  const enroll = await app.inject({
    method: 'POST',
    url: `/api/students/${studentId}/classes`,
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { classId }
  });
  assert.equal(enroll.statusCode, 200);
  const teacherList = await app.inject({
    method: 'GET',
    url: '/api/students',
    headers: { authorization: `Bearer ${seed.teacherToken}` }
  });
  assert.equal(teacherList.json().length, 1);
  assert.equal(teacherList.json()[0].name, '张三');
});

test('transfer moves student between classes', async () => {
  const create2 = await app.inject({
    method: 'POST',
    url: '/api/classes',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { campusId: seed.campusId, name: '三年级英语2班', subject: '英语', grade: '三年级' }
  });
  const student = await app.pool.query("INSERT INTO students (campus_id, name) VALUES ($1, '李四') RETURNING id", [seed.campusId]);
  const studentId = student.rows[0].id;
  await app.pool.query('INSERT INTO class_students (class_id, student_id) VALUES ($1, $2)', [classId, studentId]);
  const res = await app.inject({
    method: 'POST',
    url: `/api/students/${studentId}/transfer`,
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { fromClassId: classId, toClassId: create2.json().id }
  });
  assert.equal(res.statusCode, 200);
  const oldRow = await app.pool.query('SELECT left_at FROM class_students WHERE class_id = $1 AND student_id = $2', [classId, studentId]);
  assert.ok(oldRow.rows[0].left_at);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm --workspace server test`

Expected: FAIL，`/api/students` 返回 404。

- [ ] **Step 3: 实现学员路由**

`server/src/routes/students.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { authGuard, requireRole } from '../auth/middleware.ts';

export async function studentRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [authGuard] }, async (request) => {
    const user = request.user!;
    if (user.role === 'admin') {
      const result = await app.pool.query('SELECT * FROM students ORDER BY id');
      return result.rows;
    }
    if (user.role === 'teacher') {
      const result = await app.pool.query(
        `SELECT DISTINCT s.* FROM students s
         JOIN class_students cs ON cs.student_id = s.id
         JOIN classes c ON c.id = cs.class_id
         WHERE c.teacher_id = $1 AND cs.left_at IS NULL
         ORDER BY s.id`,
        [user.id]
      );
      return result.rows;
    }
    return [];
  });

  app.post('/', { preHandler: [authGuard, requireRole('admin')] }, async (request, reply) => {
    const body = request.body as { campusId?: number; name?: string; guardianPhone?: string };
    if (!body.campusId || !body.name?.trim()) {
      return reply.code(400).send({ error: 'campusId and name required' });
    }
    const result = await app.pool.query(
      'INSERT INTO students (campus_id, name, guardian_phone) VALUES ($1, $2, $3) RETURNING *',
      [body.campusId, body.name.trim(), body.guardianPhone ?? null]
    );
    return result.rows[0];
  });

  app.patch('/:id', { preHandler: [authGuard, requireRole('admin')] }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const body = request.body as { name?: string; guardianPhone?: string; status?: string };
    const result = await app.pool.query(
      `UPDATE students SET name = COALESCE($1, name), guardian_phone = COALESCE($2, guardian_phone),
       status = COALESCE($3, status) WHERE id = $4 RETURNING *`,
      [body.name, body.guardianPhone, body.status, id]
    );
    if (!result.rowCount) return reply.code(404).send({ error: 'student not found' });
    return result.rows[0];
  });

  app.post('/:id/classes', { preHandler: [authGuard, requireRole('admin')] }, async (request, reply) => {
    const studentId = Number((request.params as { id: string }).id);
    const body = request.body as { classId?: number };
    if (!body.classId) return reply.code(400).send({ error: 'classId required' });
    const result = await app.pool.query(
      `INSERT INTO class_students (class_id, student_id)
       VALUES ($1, $2)
       ON CONFLICT (class_id, student_id) DO UPDATE SET left_at = NULL
       RETURNING *`,
      [body.classId, studentId]
    );
    return result.rows[0];
  });

  app.post('/:id/transfer', { preHandler: [authGuard, requireRole('admin')] }, async (request, reply) => {
    const studentId = Number((request.params as { id: string }).id);
    const body = request.body as { fromClassId?: number; toClassId?: number };
    if (!body.fromClassId || !body.toClassId || body.fromClassId === body.toClassId) {
      return reply.code(400).send({ error: 'fromClassId and toClassId required and different' });
    }
    const client = await app.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'UPDATE class_students SET left_at = now() WHERE class_id = $1 AND student_id = $2 AND left_at IS NULL',
        [body.fromClassId, studentId]
      );
      await client.query(
        `INSERT INTO class_students (class_id, student_id)
         VALUES ($1, $2)
         ON CONFLICT (class_id, student_id) DO UPDATE SET left_at = NULL`,
        [body.toClassId, studentId]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    return { ok: true };
  });
}
```

`server/src/app.ts` 修改：

```ts
import { studentRoutes } from './routes/students.ts';
await app.register(studentRoutes, { prefix: '/api/students' });
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm --workspace server test`

Expected: PASS，15 个测试通过。

- [ ] **Step 5: 提交**

```bash
git add server/src/routes/students.ts server/src/app.ts server/test/students.test.ts
git commit -m "feat: student and enrollment api"
```

---

### Task 11: 考试 API

**Files:**
- Create: `server/src/routes/exams.ts`
- Modify: `server/src/app.ts`
- Create: `server/test/exams.test.ts`

- [ ] **Step 1: 写失败测试**

`server/test/exams.test.ts`:

```ts
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupApp, seedBase } from './helpers.ts';

const app = await setupApp();
let seed: Awaited<ReturnType<typeof seedBase>>;
let classId = 0;

beforeEach(async () => {
  seed = await seedBase(app);
  const teacherId = (await app.pool.query("SELECT id FROM users WHERE username = 'teacher'")).rows[0].id;
  const create = await app.inject({
    method: 'POST',
    url: '/api/classes',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { campusId: seed.campusId, name: '三年级英语1班', subject: '英语', grade: '三年级', teacherId }
  });
  classId = create.json().id;
});

test('admin creates exam and teacher can list it', async () => {
  const create = await app.inject({
    method: 'POST',
    url: '/api/exams',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { classId, name: '期中测评', type: 'midterm', examDate: '2026-08-20', maxScore: 100, gradingSystem: 'percent' }
  });
  assert.equal(create.statusCode, 200);
  const list = await app.inject({
    method: 'GET',
    url: `/api/exams?classId=${classId}`,
    headers: { authorization: `Bearer ${seed.teacherToken}` }
  });
  assert.equal(list.json().length, 1);
  assert.equal(list.json()[0].name, '期中测评');
});

test('teacher cannot create exam for class they do not teach', async () => {
  const other = await app.inject({
    method: 'POST',
    url: '/api/classes',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { campusId: seed.campusId, name: '初二数学1班', subject: '数学', grade: '初二' }
  });
  const res = await app.inject({
    method: 'POST',
    url: '/api/exams',
    headers: { authorization: `Bearer ${seed.teacherToken}` },
    payload: { classId: other.json().id, name: '考试', type: 'unit', examDate: '2026-08-20' }
  });
  assert.equal(res.statusCode, 403);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm --workspace server test`

Expected: FAIL，`/api/exams` 返回 404。

- [ ] **Step 3: 实现考试路由**

`server/src/routes/exams.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { authGuard } from '../auth/middleware.ts';
import { canAccessClass } from '../permissions.ts';

export async function examRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [authGuard] }, async (request, reply) => {
    const classId = Number((request.query as { classId?: string }).classId);
    if (!classId) return reply.code(400).send({ error: 'classId required' });
    if (!(await canAccessClass(app, request.user!, classId))) return reply.code(403).send({ error: 'forbidden' });
    const result = await app.pool.query('SELECT * FROM exams WHERE class_id = $1 ORDER BY exam_date DESC', [classId]);
    return result.rows;
  });

  app.post('/', { preHandler: [authGuard] }, async (request, reply) => {
    const body = request.body as {
      classId?: number; name?: string; type?: string; examDate?: string; maxScore?: number; gradingSystem?: string;
    };
    if (!body.classId || !body.name?.trim() || !body.examDate) {
      return reply.code(400).send({ error: 'classId, name, examDate required' });
    }
    if (request.user!.role === 'teacher' && !(await canAccessClass(app, request.user!, body.classId))) {
      return reply.code(403).send({ error: 'forbidden' });
    }
    if (request.user!.role === 'parent' || request.user!.role === 'student') {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const result = await app.pool.query(
      `INSERT INTO exams (class_id, name, type, exam_date, max_score, grading_system)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [body.classId, body.name.trim(), body.type ?? 'unit', body.examDate, body.maxScore ?? 100, body.gradingSystem ?? 'percent']
    );
    return result.rows[0];
  });
}
```

`server/src/app.ts` 修改：

```ts
import { examRoutes } from './routes/exams.ts';
await app.register(examRoutes, { prefix: '/api/exams' });
```

注意：`requireRole` 在这里不直接可用，因为教师也要能建考试；权限按班级归属判断。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm --workspace server test`

Expected: PASS，17 个测试通过。

- [ ] **Step 5: 提交**

```bash
git add server/src/routes/exams.ts server/src/app.ts server/test/exams.test.ts
git commit -m "feat: exam api"
```

---

### Task 12: 成绩录入 API

**Files:**
- Create: `server/src/routes/scores.ts`
- Create: `server/src/audit.ts`
- Modify: `server/src/app.ts`
- Create: `server/test/scores.test.ts`

- [ ] **Step 1: 写失败测试**

`server/test/scores.test.ts`:

```ts
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupApp, seedBase } from './helpers.ts';

const app = await setupApp();
let seed: Awaited<ReturnType<typeof seedBase>>;
let classId = 0;
let examId = 0;
let studentId = 0;

beforeEach(async () => {
  seed = await seedBase(app);
  const teacherId = (await app.pool.query("SELECT id FROM users WHERE username = 'teacher'")).rows[0].id;
  const classRes = await app.inject({
    method: 'POST',
    url: '/api/classes',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { campusId: seed.campusId, name: '三年级英语1班', subject: '英语', grade: '三年级', teacherId }
  });
  classId = classRes.json().id;
  const studentRes = await app.inject({
    method: 'POST',
    url: '/api/students',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { campusId: seed.campusId, name: '张三' }
  });
  studentId = studentRes.json().id;
  await app.pool.query('INSERT INTO class_students (class_id, student_id) VALUES ($1, $2)', [classId, studentId]);
  const examRes = await app.inject({
    method: 'POST',
    url: '/api/exams',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { classId, name: '期中测评', type: 'midterm', examDate: '2026-08-20' }
  });
  examId = examRes.json().id;
});

test('teacher enters score and update is audited', async () => {
  const enter = await app.inject({
    method: 'POST',
    url: `/api/exams/${examId}/scores`,
    headers: { authorization: `Bearer ${seed.teacherToken}` },
    payload: { studentId, numericScore: 92, comment: '进步明显' }
  });
  assert.equal(enter.statusCode, 200);
  const update = await app.inject({
    method: 'POST',
    url: `/api/exams/${examId}/scores`,
    headers: { authorization: `Bearer ${seed.teacherToken}` },
    payload: { studentId, numericScore: 95 }
  });
  assert.equal(update.statusCode, 200);
  const logs = await app.pool.query("SELECT * FROM audit_logs WHERE entity_type = 'score'");
  assert.equal(logs.rowCount, 2);
});

test('bulk score entry works', async () => {
  const res = await app.inject({
    method: 'POST',
    url: `/api/exams/${examId}/scores/bulk`,
    headers: { authorization: `Bearer ${seed.teacherToken}` },
    payload: { scores: [{ studentId, numericScore: 88 }] }
  });
  assert.equal(res.statusCode, 200);
  const scores = await app.pool.query('SELECT * FROM scores WHERE exam_id = $1', [examId]);
  assert.equal(scores.rowCount, 1);
  assert.equal(Number(scores.rows[0].numeric_score), 88);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm --workspace server test`

Expected: FAIL，成绩路由返回 404。

- [ ] **Step 3: 实现审计与成绩路由**

`server/src/audit.ts`:

```ts
import type { FastifyInstance } from 'fastify';

export async function writeAudit(
  app: FastifyInstance,
  actorId: number,
  action: string,
  entityType: string,
  entityId: number | null,
  detail: Record<string, unknown> = {}
): Promise<void> {
  await app.pool.query(
    'INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, detail) VALUES ($1, $2, $3, $4, $5)',
    [actorId, action, entityType, entityId, JSON.stringify(detail)]
  );
}
```

`server/src/routes/scores.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { authGuard } from '../auth/middleware.ts';
import { canAccessClass } from '../permissions.ts';
import { writeAudit } from '../audit.ts';

interface ScoreInput {
  studentId?: number;
  numericScore?: number | null;
  level?: string | null;
  points?: number | null;
  comment?: string | null;
}

async function upsertScore(app: FastifyInstance, examId: number, input: ScoreInput, actorId: number) {
  const result = await app.pool.query(
    `INSERT INTO scores (exam_id, student_id, numeric_score, level, points, comment, entered_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (exam_id, student_id)
     DO UPDATE SET numeric_score = EXCLUDED.numeric_score, level = EXCLUDED.level, points = EXCLUDED.points,
       comment = EXCLUDED.comment, entered_by = EXCLUDED.entered_by, updated_at = now()
     RETURNING id`,
    [examId, input.studentId, input.numericScore ?? null, input.level ?? null, input.points ?? null, input.comment ?? null, actorId]
  );
  await writeAudit(app, actorId, 'score_upsert', 'score', result.rows[0].id, { examId, studentId: input.studentId });
  return result.rows[0];
}

export async function scoreRoutes(app: FastifyInstance) {
  const guardExam = async (request: any, reply: any) => {
    const examId = Number((request.params as { examId: string }).examId);
    const exam = (await app.pool.query('SELECT class_id FROM exams WHERE id = $1', [examId])).rows[0];
    if (!exam) return reply.code(404).send({ error: 'exam not found' });
    if (!(await canAccessClass(app, request.user!, exam.class_id))) return reply.code(403).send({ error: 'forbidden' });
    request.examClassId = exam.class_id;
  };

  app.get('/:examId/scores', { preHandler: [authGuard, guardExam] }, async (request) => {
    const examId = Number((request.params as { examId: string }).examId);
    const result = await app.pool.query(
      `SELECT s.*, st.name AS student_name FROM scores s
       JOIN students st ON st.id = s.student_id
       WHERE s.exam_id = $1 ORDER BY s.student_id`,
      [examId]
    );
    return result.rows;
  });

  app.post('/:examId/scores', { preHandler: [authGuard, guardExam] }, async (request, reply) => {
    const examId = Number((request.params as { examId: string }).examId);
    const body = request.body as ScoreInput;
    if (!body.studentId) return reply.code(400).send({ error: 'studentId required' });
    return upsertScore(app, examId, body, request.user!.id);
  });

  app.post('/:examId/scores/bulk', { preHandler: [authGuard, guardExam] }, async (request, reply) => {
    const examId = Number((request.params as { examId: string }).examId);
    const body = request.body as { scores?: ScoreInput[] };
    if (!Array.isArray(body.scores) || body.scores.length === 0) {
      return reply.code(400).send({ error: 'scores array required' });
    }
    const client = await app.pool.connect();
    try {
      await client.query('BEGIN');
      const rows = [];
      for (const item of body.scores) {
        if (!item.studentId) continue;
        const result = await client.query(
          `INSERT INTO scores (exam_id, student_id, numeric_score, level, points, comment, entered_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (exam_id, student_id)
           DO UPDATE SET numeric_score = EXCLUDED.numeric_score, level = EXCLUDED.level, points = EXCLUDED.points,
             comment = EXCLUDED.comment, entered_by = EXCLUDED.entered_by, updated_at = now()
           RETURNING id`,
          [examId, item.studentId, item.numericScore ?? null, item.level ?? null, item.points ?? null, item.comment ?? null, request.user!.id]
        );
        rows.push(result.rows[0]);
        await writeAudit(app, request.user!.id, 'score_upsert', 'score', result.rows[0].id, { examId, studentId: item.studentId });
      }
      await client.query('COMMIT');
      return { count: rows.length };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });
}
```

`server/src/app.ts` 修改：

```ts
import { scoreRoutes } from './routes/scores.ts';
await app.register(scoreRoutes, { prefix: '/api/exams' });
```

注意：`guardExam` 中的 `request.examClassId` 只是预留字段，当前路由未使用；如不想要可去掉赋值。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm --workspace server test`

Expected: PASS，19 个测试通过。

- [ ] **Step 5: 提交**

```bash
git add server/src/routes/scores.ts server/src/audit.ts server/src/app.ts server/test/scores.test.ts
git commit -m "feat: score entry api with audit"
```

---

### Task 13: 成绩分析 API

**Files:**
- Modify: `server/src/routes/exams.ts`
- Modify: `server/test/exams.test.ts`

- [ ] **Step 1: 写失败测试**

在 `server/test/exams.test.ts` 末尾追加：

```ts
test('analysis returns averages, pass rate, ranking and trend', async () => {
  const student1 = await app.pool.query("INSERT INTO students (campus_id, name) VALUES ($1, '甲') RETURNING id", [seed.campusId]);
  const student2 = await app.pool.query("INSERT INTO students (campus_id, name) VALUES ($1, '乙') RETURNING id", [seed.campusId]);
  await app.pool.query('INSERT INTO class_students (class_id, student_id) VALUES ($1, $2), ($1, $3)', [classId, student1.rows[0].id, student2.rows[0].id]);
  const exam = await app.inject({
    method: 'POST',
    url: '/api/exams',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { classId, name: '单元测', type: 'unit', examDate: '2026-08-21' }
  });
  const examId = exam.json().id;
  await app.inject({
    method: 'POST',
    url: `/api/exams/${examId}/scores/bulk`,
    headers: { authorization: `Bearer ${seed.teacherToken}` },
    payload: { scores: [{ studentId: student1.rows[0].id, numericScore: 95 }, { studentId: student2.rows[0].id, numericScore: 70 }] }
  });
  const res = await app.inject({
    method: 'GET',
    url: `/api/exams/${examId}/analysis`,
    headers: { authorization: `Bearer ${seed.teacherToken}` }
  });
  assert.equal(res.statusCode, 200);
  const data = res.json();
  assert.equal(Number(data.average), 82.5);
  assert.equal(Number(data.passRate), 1);
  assert.equal(data.ranking.length, 2);
  assert.equal(data.ranking[0].student_id, student1.rows[0].id);
  assert.ok(Array.isArray(data.trend));
});

test('exam export returns csv', async () => {
  const student = await app.pool.query("INSERT INTO students (campus_id, name) VALUES ($1, '甲') RETURNING id", [seed.campusId]);
  await app.pool.query('INSERT INTO class_students (class_id, student_id) VALUES ($1, $2)', [classId, student.rows[0].id]);
  const exam = await app.inject({
    method: 'POST',
    url: '/api/exams',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { classId, name: '单元测导出', type: 'unit', examDate: '2026-08-21' }
  });
  const examId = exam.json().id;
  await app.inject({
    method: 'POST',
    url: `/api/exams/${examId}/scores/bulk`,
    headers: { authorization: `Bearer ${seed.teacherToken}` },
    payload: { scores: [{ studentId: student.rows[0].id, numericScore: 95 }] }
  });
  const res = await app.inject({
    method: 'GET',
    url: `/api/exams/${examId}/export`,
    headers: { authorization: `Bearer ${seed.teacherToken}` }
  });
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /student_name/);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm --workspace server test`

Expected: FAIL，`/api/exams/:id/analysis` 返回 404。

- [ ] **Step 3: 实现分析端点**

在 `server/src/routes/exams.ts` 中追加：

```ts
app.get('/:id/analysis', { preHandler: [authGuard] }, async (request, reply) => {
  const examId = Number((request.params as { id: string }).id);
  const exam = (await app.pool.query('SELECT * FROM exams WHERE id = $1', [examId])).rows[0];
  if (!exam) return reply.code(404).send({ error: 'exam not found' });
  if (!(await canAccessClass(app, request.user!, exam.class_id))) return reply.code(403).send({ error: 'forbidden' });

  const summary = (await app.pool.query(
    `SELECT COUNT(*) AS total,
            AVG(numeric_score) AS average,
            COUNT(*) FILTER (WHERE numeric_score >= 60)::float / NULLIF(COUNT(*) FILTER (WHERE numeric_score IS NOT NULL), 0) AS pass_rate,
            COUNT(*) FILTER (WHERE numeric_score >= 90) AS excellent_count
     FROM scores WHERE exam_id = $1 AND numeric_score IS NOT NULL`,
    [examId]
  )).rows[0];

  const ranking = (await app.pool.query(
    `SELECT student_id, numeric_score,
            ROW_NUMBER() OVER (ORDER BY numeric_score DESC) AS rank
     FROM scores WHERE exam_id = $1 AND numeric_score IS NOT NULL
     ORDER BY numeric_score DESC`,
    [examId]
  )).rows;

  const trend = (await app.pool.query(
    `SELECT e.id, e.name, e.exam_date, AVG(s.numeric_score)::numeric(6,2) AS average
     FROM exams e JOIN scores s ON s.exam_id = e.id
     WHERE e.class_id = $1 AND s.numeric_score IS NOT NULL
     GROUP BY e.id ORDER BY e.exam_date DESC LIMIT 10`,
    [exam.class_id]
  )).rows;

  return {
    total: Number(summary.total ?? 0),
    average: summary.average === null ? null : Number(summary.average),
    passRate: summary.pass_rate === null ? null : Number(summary.pass_rate),
    excellentCount: Number(summary.excellent_count ?? 0),
    ranking,
    trend: trend.reverse()
  };
});

app.get('/:id/export', { preHandler: [authGuard] }, async (request, reply) => {
  const examId = Number((request.params as { id: string }).id);
  const exam = (await app.pool.query('SELECT * FROM exams WHERE id = $1', [examId])).rows[0];
  if (!exam) return reply.code(404).send({ error: 'exam not found' });
  if (!(await canAccessClass(app, request.user!, exam.class_id))) return reply.code(403).send({ error: 'forbidden' });
  const rows = (await app.pool.query(
    `SELECT st.name AS student_name, s.numeric_score, s.level, s.points, s.comment
     FROM scores s JOIN students st ON st.id = s.student_id
     WHERE s.exam_id = $1 ORDER BY s.student_id`,
    [examId]
  )).rows;
  const header = 'student_name,numeric_score,level,points,comment';
  const lines = rows.map((r: any) => [r.student_name, r.numeric_score ?? '', r.level ?? '', r.points ?? '', r.comment ?? ''].join(','));
  reply.header('Content-Type', 'text/csv; charset=utf-8');
  reply.header('Content-Disposition', `attachment; filename="exam-${examId}.csv"`);
  return [header, ...lines].join('\n');
});
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm --workspace server test`

Expected: PASS，21 个测试通过。

- [ ] **Step 5: 提交**

```bash
git add server/src/routes/exams.ts server/test/exams.test.ts
git commit -m "feat: score analysis endpoint"
```

---

### Task 14: 报告 API

**Files:**
- Create: `server/src/routes/reports.ts`
- Modify: `server/src/app.ts`
- Create: `server/test/reports.test.ts`

- [ ] **Step 1: 写失败测试**

`server/test/reports.test.ts`:

```ts
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupApp, seedBase } from './helpers.ts';
import { hashPassword } from '../src/auth/password.ts';

const app = await setupApp();
let seed: Awaited<ReturnType<typeof seedBase>>;
let studentId = 0;
let parentId = 0;

beforeEach(async () => {
  seed = await seedBase(app);
  const teacherId = (await app.pool.query("SELECT id FROM users WHERE username = 'teacher'")).rows[0].id;
  const classRes = await app.inject({
    method: 'POST',
    url: '/api/classes',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { campusId: seed.campusId, name: '三年级英语1班', subject: '英语', grade: '三年级', teacherId }
  });
  const classId = classRes.json().id;
  const studentRes = await app.inject({
    method: 'POST',
    url: '/api/students',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { campusId: seed.campusId, name: '张三' }
  });
  studentId = studentRes.json().id;
  await app.pool.query('INSERT INTO class_students (class_id, student_id) VALUES ($1, $2)', [classId, studentId]);
  const examRes = await app.inject({
    method: 'POST',
    url: '/api/exams',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { classId, name: '期中测评', type: 'midterm', examDate: '2026-08-20' }
  });
  const examId = examRes.json().id;
  await app.inject({
    method: 'POST',
    url: `/api/exams/${examId}/scores`,
    headers: { authorization: `Bearer ${seed.teacherToken}` },
    payload: { studentId, numericScore: 92 }
  });
  const parent = await app.pool.query(
    "INSERT INTO users (username, password_hash, display_name, role, campus_id) VALUES ('parent', $1, '家长', 'parent', $2) RETURNING id",
    [await hashPassword('parent123'), seed.campusId]
  );
  parentId = parent.rows[0].id;
  await app.pool.query('INSERT INTO parent_bindings (parent_user_id, student_id) VALUES ($1, $2)', [parentId, studentId]);
});

test('parent can view own child report', async () => {
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username: 'parent', password: 'parent123' }
  });
  const res = await app.inject({
    method: 'GET',
    url: `/api/reports/student/${studentId}`,
    headers: { authorization: `Bearer ${login.json().token}` }
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().student.name, '张三');
  assert.equal(res.json().scores.length, 1);
  assert.equal(Number(res.json().scores[0].numeric_score), 92);
  assert.equal(res.json().scores[0].rank, 1);
});

test('unrelated parent cannot view report', async () => {
  const other = await app.pool.query(
    "INSERT INTO users (username, password_hash, display_name, role, campus_id) VALUES ('other_parent', $1, '别人家长', 'parent', $2) RETURNING id",
    [await hashPassword('parent123'), seed.campusId]
  );
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username: 'other_parent', password: 'parent123' }
  });
  const res = await app.inject({
    method: 'GET',
    url: `/api/reports/student/${studentId}`,
    headers: { authorization: `Bearer ${login.json().token}` }
  });
  assert.equal(res.statusCode, 403);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm --workspace server test`

Expected: FAIL，`/api/reports` 返回 404。

- [ ] **Step 3: 实现报告路由**

`server/src/routes/reports.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { authGuard } from '../auth/middleware.ts';

export async function reportRoutes(app: FastifyInstance) {
  app.get('/student/:studentId', { preHandler: [authGuard] }, async (request, reply) => {
    const studentId = Number((request.params as { studentId: string }).studentId);
    const user = request.user!;
    const student = (await app.pool.query('SELECT * FROM students WHERE id = $1', [studentId])).rows[0];
    if (!student) return reply.code(404).send({ error: 'student not found' });

    let allowed = false;
    if (user.role === 'admin') allowed = true;
    if (user.role === 'teacher') {
      const row = await app.pool.query(
        `SELECT 1 FROM class_students cs JOIN classes c ON c.id = cs.class_id
         WHERE cs.student_id = $1 AND c.teacher_id = $2 AND cs.left_at IS NULL`,
        [studentId, user.id]
      );
      allowed = Boolean(row.rowCount);
    }
    if (user.role === 'parent') {
      const row = await app.pool.query(
        'SELECT 1 FROM parent_bindings WHERE parent_user_id = $1 AND student_id = $2',
        [user.id, studentId]
      );
      allowed = Boolean(row.rowCount);
    }
    if (user.role === 'student') {
      allowed = user.studentId === studentId;
    }
    if (!allowed) return reply.code(403).send({ error: 'forbidden' });

    const scores = (await app.pool.query(
      `SELECT e.id AS exam_id, e.name, e.type, e.exam_date, e.grading_system,
              s.numeric_score, s.level, s.points, s.comment, c.name AS class_name,
              (SELECT COUNT(*) FROM scores s2 WHERE s2.exam_id = e.id AND s2.numeric_score > s.numeric_score) + 1 AS rank,
              (SELECT COUNT(*) FROM scores s2 WHERE s2.exam_id = e.id AND s2.numeric_score IS NOT NULL) AS total
       FROM exams e
       JOIN scores s ON s.exam_id = e.id AND s.student_id = $1
       JOIN classes c ON c.id = e.class_id
       ORDER BY e.exam_date DESC`,
      [studentId]
    )).rows;

    return { student, scores };
  });
}
```

`server/src/app.ts` 修改：

```ts
import { reportRoutes } from './routes/reports.ts';
await app.register(reportRoutes, { prefix: '/api/reports' });
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm --workspace server test`

Expected: PASS，22 个测试通过。

- [ ] **Step 5: 提交**

```bash
git add server/src/routes/reports.ts server/src/app.ts server/test/reports.test.ts
git commit -m "feat: student report api"
```

---

### Task 15: CSV 导入（学员 / 班级 / 成绩）

**Files:**
- Create: `server/src/routes/imports.ts`
- Modify: `server/src/app.ts`
- Create: `server/test/imports.test.ts`

说明：MVP 以 UTF-8 CSV 为导入格式；前端在 Task 20 用 SheetJS 把 `.xlsx` 转成 CSV 后上传，因此用户仍可直接选择 Excel 文件。

- [ ] **Step 1: 写失败测试**

`server/test/imports.test.ts`:

```ts
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupApp, seedBase } from './helpers.ts';

const app = await setupApp();
let seed: Awaited<ReturnType<typeof seedBase>>;

beforeEach(async () => {
  seed = await seedBase(app);
});

test('import students from csv', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/imports/students',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: {
      csv: 'name,guardian_phone,campus_name\n张三,13800000000,测试校区\n李四,13900000000,测试校区'
    }
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().total_rows, 2);
  assert.equal(res.json().error_rows, 0);
  const students = await app.pool.query('SELECT COUNT(*) FROM students');
  assert.equal(Number(students.rows[0].count), 2);
});

test('import reports row errors for missing campus', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/imports/students',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { csv: 'name,guardian_phone,campus_name\n王五,,不存在校区' }
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().error_rows, 1);
  assert.equal(res.json().errors[0].column, 'campus_name');
});

test('import scores into existing exam', async () => {
  const teacherId = (await app.pool.query("SELECT id FROM users WHERE username = 'teacher'")).rows[0].id;
  const classRes = await app.inject({
    method: 'POST',
    url: '/api/classes',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { campusId: seed.campusId, name: '三年级英语1班', subject: '英语', grade: '三年级', teacherId }
  });
  const classId = classRes.json().id;
  const studentRes = await app.inject({
    method: 'POST',
    url: '/api/students',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { campusId: seed.campusId, name: '张三' }
  });
  const studentId = studentRes.json().id;
  await app.pool.query('INSERT INTO class_students (class_id, student_id) VALUES ($1, $2)', [classId, studentId]);
  const examRes = await app.inject({
    method: 'POST',
    url: '/api/exams',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { classId, name: '期中测评', type: 'midterm', examDate: '2026-08-20' }
  });
  const examId = examRes.json().id;
  const res = await app.inject({
    method: 'POST',
    url: '/api/imports/scores',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: {
      csv: 'student_name,class_name,exam_name,numeric_score\n张三,三年级英语1班,期中测评,92'
    }
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().error_rows, 0);
  const score = await app.pool.query('SELECT * FROM scores WHERE exam_id = $1', [examId]);
  assert.equal(Number(score.rows[0].numeric_score), 92);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm --workspace server test`

Expected: FAIL，`/api/imports` 返回 404。

- [ ] **Step 3: 实现导入路由**

`server/src/routes/imports.ts`:

```ts
import { parse } from 'csv-parse/sync';
import type { FastifyInstance } from 'fastify';
import { authGuard, requireRole } from '../auth/middleware.ts';
import { writeAudit } from '../audit.ts';

type CsvRow = Record<string, string>;

async function saveJob(
  app: FastifyInstance,
  actorId: number,
  kind: 'students' | 'classes' | 'scores',
  totalRows: number,
  errorRows: number,
  errors: Array<{ row: number; column: string; message: string }>
) {
  const status = totalRows > 0 && errorRows === totalRows ? 'failed' : 'done';
  const result = await app.pool.query(
    `INSERT INTO import_jobs (kind, status, total_rows, error_rows, errors, created_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [kind, status, totalRows, errorRows, JSON.stringify(errors), actorId]
  );
  return result.rows[0];
}

function parseRows(csvText: string): CsvRow[] {
  return parse(csvText, { columns: true, skip_empty_lines: true, trim: true }) as CsvRow[];
}

export async function importRoutes(app: FastifyInstance) {
  const guard = [authGuard, requireRole('admin')];

  app.post('/students', { preHandler: guard }, async (request, reply) => {
    const body = request.body as { csv?: string };
    if (!body.csv) return reply.code(400).send({ error: 'csv required' });
    const rows = parseRows(body.csv);
    const errors: Array<{ row: number; column: string; message: string }> = [];
    let valid = 0;
    for (const [index, row] of rows.entries()) {
      const line = index + 2;
      const name = row.name?.trim();
      const campusName = row.campus_name?.trim();
      if (!name) {
        errors.push({ row: line, column: 'name', message: '姓名不能为空' });
        continue;
      }
      const campus = (await app.pool.query('SELECT id FROM campuses WHERE name = $1', [campusName])).rows[0];
      if (!campus) {
        errors.push({ row: line, column: 'campus_name', message: `校区不存在: ${campusName}` });
        continue;
      }
      await app.pool.query('INSERT INTO students (campus_id, name, guardian_phone) VALUES ($1, $2, $3)', [
        campus.id, name, row.guardian_phone ?? null
      ]);
      valid += 1;
    }
    const job = await saveJob(app, request.user!.id, 'students', rows.length, errors.length, errors);
    return { ...job, imported_rows: valid };
  });

  app.post('/classes', { preHandler: guard }, async (request, reply) => {
    const body = request.body as { csv?: string };
    if (!body.csv) return reply.code(400).send({ error: 'csv required' });
    const rows = parseRows(body.csv);
    const errors: Array<{ row: number; column: string; message: string }> = [];
    let valid = 0;
    for (const [index, row] of rows.entries()) {
      const line = index + 2;
      const campus = (await app.pool.query('SELECT id FROM campuses WHERE name = $1', [row.campus_name?.trim()])).rows[0];
      if (!campus) {
        errors.push({ row: line, column: 'campus_name', message: `校区不存在: ${row.campus_name}` });
        continue;
      }
      if (!row.name?.trim() || !row.subject?.trim() || !row.grade?.trim()) {
        errors.push({ row: line, column: 'name/subject/grade', message: '班级、科目、年级不能为空' });
        continue;
      }
      let teacherId: number | null = null;
      if (row.teacher_username) {
        const teacher = (await app.pool.query('SELECT id FROM users WHERE username = $1 AND role = $2', [row.teacher_username, 'teacher'])).rows[0];
        if (!teacher) {
          errors.push({ row: line, column: 'teacher_username', message: `教师不存在: ${row.teacher_username}` });
          continue;
        }
        teacherId = teacher.id;
      }
      await app.pool.query(
        'INSERT INTO classes (campus_id, name, subject, grade, schedule, teacher_id) VALUES ($1, $2, $3, $4, $5, $6)',
        [campus.id, row.name.trim(), row.subject.trim(), row.grade.trim(), row.schedule ?? null, teacherId]
      );
      valid += 1;
    }
    const job = await saveJob(app, request.user!.id, 'classes', rows.length, errors.length, errors);
    return { ...job, imported_rows: valid };
  });

  app.post('/scores', { preHandler: guard }, async (request, reply) => {
    const body = request.body as { csv?: string };
    if (!body.csv) return reply.code(400).send({ error: 'csv required' });
    const rows = parseRows(body.csv);
    const errors: Array<{ row: number; column: string; message: string }> = [];
    let valid = 0;
    for (const [index, row] of rows.entries()) {
      const line = index + 2;
      const classRow = (await app.pool.query('SELECT id FROM classes WHERE name = $1', [row.class_name?.trim()])).rows[0];
      if (!classRow) {
        errors.push({ row: line, column: 'class_name', message: `班级不存在: ${row.class_name}` });
        continue;
      }
      const exam = (await app.pool.query(
        'SELECT * FROM exams WHERE class_id = $1 AND name = $2',
        [classRow.id, row.exam_name?.trim()]
      )).rows[0];
      if (!exam) {
        errors.push({ row: line, column: 'exam_name', message: `考试不存在: ${row.exam_name}` });
        continue;
      }
      const student = (await app.pool.query(
        'SELECT id FROM students WHERE name = $1',
        [row.student_name?.trim()]
      )).rows[0];
      if (!student) {
        errors.push({ row: line, column: 'student_name', message: `学员不存在: ${row.student_name}` });
        continue;
      }
      const enrolled = (await app.pool.query(
        'SELECT 1 FROM class_students WHERE class_id = $1 AND student_id = $2',
        [classRow.id, student.id]
      )).rows[0];
      if (!enrolled) {
        errors.push({ row: line, column: 'student_name', message: `学员不在班级: ${row.student_name}` });
        continue;
      }
      const numericScore = row.numeric_score ? Number(row.numeric_score) : null;
      if (numericScore !== null && Number.isNaN(numericScore)) {
        errors.push({ row: line, column: 'numeric_score', message: '分数必须是数字' });
        continue;
      }
      const inserted = await app.pool.query(
        `INSERT INTO scores (exam_id, student_id, numeric_score, level, points, comment, entered_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (exam_id, student_id)
         DO UPDATE SET numeric_score = EXCLUDED.numeric_score, level = EXCLUDED.level, points = EXCLUDED.points,
           comment = EXCLUDED.comment, entered_by = EXCLUDED.entered_by, updated_at = now()
         RETURNING id`,
        [exam.id, student.id, numericScore, row.level ?? null, row.points ? Number(row.points) : null, row.comment ?? null, request.user!.id]
      );
      await writeAudit(app, request.user!.id, 'score_upsert', 'score', inserted.rows[0].id, { examId: exam.id, studentId: student.id });
      valid += 1;
    }
    const job = await saveJob(app, request.user!.id, 'scores', rows.length, errors.length, errors);
    return { ...job, imported_rows: valid };
  });
}
```

`server/src/app.ts` 修改：

```ts
import { importRoutes } from './routes/imports.ts';
await app.register(importRoutes, { prefix: '/api/imports' });
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm --workspace server test`

Expected: PASS，25 个测试通过。

- [ ] **Step 5: 提交**

```bash
git add server/src/routes/imports.ts server/src/app.ts server/test/imports.test.ts
git commit -m "feat: csv import endpoints"
```

---

### Task 16: 导入任务查询

**Files:**
- Modify: `server/src/routes/imports.ts`
- Modify: `server/test/imports.test.ts`

- [ ] **Step 1: 写失败测试**

在 `server/test/imports.test.ts` 末尾追加：

```ts
test('import jobs are listed and queryable', async () => {
  const created = await app.inject({
    method: 'POST',
    url: '/api/imports/students',
    headers: { authorization: `Bearer ${seed.adminToken}` },
    payload: { csv: 'name,guardian_phone,campus_name\n赵六,,测试校区' }
  });
  const jobId = created.json().id;
  const list = await app.inject({
    method: 'GET',
    url: '/api/imports',
    headers: { authorization: `Bearer ${seed.adminToken}` }
  });
  assert.equal(list.statusCode, 200);
  assert.ok(list.json().some((j: { id: number }) => j.id === jobId));
  const detail = await app.inject({
    method: 'GET',
    url: `/api/imports/${jobId}`,
    headers: { authorization: `Bearer ${seed.adminToken}` }
  });
  assert.equal(detail.statusCode, 200);
  assert.equal(detail.json().status, 'done');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm --workspace server test`

Expected: FAIL，`GET /api/imports` 返回 404。

- [ ] **Step 3: 实现查询端点**

在 `server/src/routes/imports.ts` 的 `export async function importRoutes` 内追加：

```ts
app.get('/', { preHandler: guard }, async (request) => {
  const result = await app.pool.query('SELECT * FROM import_jobs ORDER BY created_at DESC LIMIT 50');
  return result.rows;
});

app.get('/:id', { preHandler: guard }, async (request, reply) => {
  const id = Number((request.params as { id: string }).id);
  const result = await app.pool.query('SELECT * FROM import_jobs WHERE id = $1', [id]);
  if (!result.rowCount) return reply.code(404).send({ error: 'import job not found' });
  return result.rows[0];
});
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm --workspace server test`

Expected: PASS，26 个测试通过。

- [ ] **Step 5: 提交**

```bash
git add server/src/routes/imports.ts server/test/imports.test.ts
git commit -m "feat: import job queries"
```

---

### Task 17: Vite React 骨架与登录页

**Files:**
- Create: `web/tsconfig.json`
- Create: `web/vite.config.ts`
- Create: `web/index.html`
- Create: `web/src/main.tsx`
- Create: `web/src/App.tsx`
- Create: `web/src/api.ts`
- Create: `web/src/auth.tsx`
- Create: `web/src/Shell.tsx`
- Create: `web/src/styles.css`
- Create: `web/src/pages/LoginPage.tsx`

- [ ] **Step 1: 写配置文件**

`web/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["vite/client"]
  },
  "include": ["src", "vite.config.ts"]
}
```

`web/vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000'
    }
  }
});
```

`web/index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>学校管理系统</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: 写 API 与认证上下文**

`web/src/api.ts`:

```ts
export function getToken(): string | null {
  return localStorage.getItem('token');
}

export async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined)
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `请求失败 (${res.status})`);
  }
  return res.json();
}
```

`web/src/auth.tsx`:

```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api.ts';

export interface User {
  id: number;
  username: string | null;
  displayName: string;
  role: 'admin' | 'teacher' | 'parent' | 'student';
}

interface AuthState {
  user: User | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    api<User>('/api/auth/me')
      .then(setUser)
      .catch(() => {
        localStorage.removeItem('token');
      });
  }, []);

  async function login(username: string, password: string) {
    const data = await api<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    localStorage.setItem('token', data.token);
    setUser(data.user);
  }

  function logout() {
    localStorage.removeItem('token');
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
```

- [ ] **Step 3: 写应用壳与登录页**

`web/src/Shell.tsx`:

```tsx
import { NavLink } from 'react-router-dom';
import { FileSpreadsheet, LayoutDashboard, LogOut, School, Upload, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { useAuth } from './auth.tsx';

export default function Shell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const isStaff = user?.role === 'admin' || user?.role === 'teacher';
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">学校管理</div>
        <nav>
          {isStaff && (
            <>
              <NavLink to="/dashboard"><LayoutDashboard size={16} /> 工作台</NavLink>
              <NavLink to="/students"><Users size={16} /> 学员</NavLink>
              <NavLink to="/classes"><School size={16} /> 班级</NavLink>
              <NavLink to="/grades"><FileSpreadsheet size={16} /> 成绩</NavLink>
              {user?.role === 'admin' && <NavLink to="/import"><Upload size={16} /> 导入</NavLink>}
            </>
          )}
          {user?.role === 'parent' && <NavLink to="/my-scores"><FileSpreadsheet size={16} /> 孩子成绩</NavLink>}
          {user?.role === 'student' && <NavLink to="/my-scores"><FileSpreadsheet size={16} /> 我的成绩</NavLink>}
        </nav>
        <button className="logout" onClick={logout}><LogOut size={16} /> 退出</button>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
```

`web/src/pages/LoginPage.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.tsx';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await login(username, password);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <h1>学校管理系统</h1>
        <label>账号<input value={username} onChange={(e) => setUsername(e.target.value)} /></label>
        <label>密码<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {error && <p className="error">{error}</p>}
        <button type="submit">登录</button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: 写应用路由与样式**

`web/src/App.tsx`:

```tsx
import { Navigate, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './auth.tsx';
import LoginPage from './pages/LoginPage.tsx';
import DashboardPage from './pages/DashboardPage.tsx';

function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
```

`web/src/main.tsx`:

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import { AuthProvider } from './auth.tsx';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
```

`web/src/styles.css`：

```css
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; background: #f5f6f8; color: #1d1d1f; }
.login-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; }
.login-card { width: 320px; background: #fff; border: 1px solid #e3e5e8; border-radius: 10px; padding: 24px; display: flex; flex-direction: column; gap: 12px; }
.login-card h1 { font-size: 1.1rem; margin: 0; }
.login-card label { display: flex; flex-direction: column; gap: 4px; font-size: 0.8rem; }
.login-card input { padding: 8px 10px; border: 1px solid #d1d4d8; border-radius: 6px; }
.login-card button { padding: 9px; border: 0; border-radius: 6px; background: #2563eb; color: #fff; cursor: pointer; }
.error { color: #dc2626; font-size: 0.8rem; margin: 0; }
.app-shell { display: flex; min-height: 100vh; }
.sidebar { width: 200px; background: #101828; color: #fff; display: flex; flex-direction: column; padding: 16px 10px; gap: 16px; }
.brand { font-weight: 700; padding: 0 8px; }
.sidebar nav { display: flex; flex-direction: column; gap: 4px; flex: 1; }
.sidebar nav a { color: #cbd5e1; text-decoration: none; display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 6px; font-size: 0.85rem; }
.sidebar nav a.active { background: #2563eb; color: #fff; }
.logout { background: none; border: 1px solid #475569; color: #cbd5e1; border-radius: 6px; padding: 8px; cursor: pointer; display: flex; gap: 8px; align-items: center; font-size: 0.8rem; }
.content { flex: 1; padding: 24px; overflow: auto; }
.page-title { font-size: 1.25rem; font-weight: 700; margin: 0 0 16px; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 20px; }
.stat-card { background: #fff; border: 1px solid #e3e5e8; border-radius: 10px; padding: 16px; }
.stat-card b { font-size: 1.4rem; display: block; }
.panel { background: #fff; border: 1px solid #e3e5e8; border-radius: 10px; padding: 16px; margin-bottom: 16px; }
.panel h2 { font-size: 1rem; margin: 0 0 12px; }
.table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
.table th, .table td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #eef0f2; }
.btn { padding: 7px 12px; border: 1px solid #d1d4d8; background: #fff; border-radius: 6px; cursor: pointer; font-size: 0.8rem; }
.btn.primary { background: #2563eb; border-color: #2563eb; color: #fff; }
.form-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; align-items: flex-end; }
.form-row label { display: flex; flex-direction: column; gap: 4px; font-size: 0.75rem; }
.form-row input, .form-row select { padding: 7px 9px; border: 1px solid #d1d4d8; border-radius: 6px; min-width: 140px; }
@media (max-width: 700px) {
  .app-shell { flex-direction: column; }
  .sidebar { width: 100%; flex-direction: row; align-items: center; overflow-x: auto; }
  .sidebar nav { flex-direction: row; }
}
```

- [ ] **Step 5: 构建验证**

Run: `npm --workspace web run build`

Expected: `vite build` 成功，产物写入 `web/dist`。

- [ ] **Step 6: 提交**

```bash
git add web
git commit -m "feat: web shell and login page"
```

---

### Task 18: 工作台与学员页

**Files:**
- Create: `web/src/pages/DashboardPage.tsx`
- Create: `web/src/pages/StudentsPage.tsx`
- Modify: `web/src/App.tsx`

- [ ] **Step 1: 写工作台页**

`web/src/pages/DashboardPage.tsx`:

```tsx
import { useEffect, useState } from 'react';
import Shell from '../Shell.tsx';
import { api } from '../api.ts';
import { useAuth } from '../auth.tsx';

export default function DashboardPage() {
  const { user } = useAuth();
  const [students, setStudents] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);

  useEffect(() => {
    if (user?.role === 'admin' || user?.role === 'teacher') {
      api<any[]>('/api/students').then(setStudents).catch(() => {});
      api<any[]>('/api/classes').then(setClasses).catch(() => {});
    }
  }, [user]);

  return (
    <Shell>
      <h1 className="page-title">工作台</h1>
      {user?.role === 'admin' || user?.role === 'teacher' ? (
        <div className="cards">
          <div className="stat-card"><b>{students.length}</b>在读学员</div>
          <div className="stat-card"><b>{classes.length}</b>班级</div>
        </div>
      ) : (
        <p>请从左侧菜单查看成绩。</p>
      )}
    </Shell>
  );
}
```

- [ ] **Step 2: 写学员页**

`web/src/pages/StudentsPage.tsx`:

```tsx
import { useEffect, useState, type FormEvent } from 'react';
import Shell from '../Shell.tsx';
import { api } from '../api.ts';

export default function StudentsPage() {
  const [students, setStudents] = useState<any[]>([]);
  const [campuses, setCampuses] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [campusId, setCampusId] = useState('');

  async function load() {
    setStudents(await api<any[]>('/api/students'));
  }
  useEffect(() => {
    load();
    api<any[]>('/api/campuses').then(setCampuses).catch(() => {});
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    await api('/api/students', { method: 'POST', body: JSON.stringify({ name, guardianPhone, campusId: Number(campusId) }) });
    setName('');
    setGuardianPhone('');
    await load();
  }

  return (
    <Shell>
      <h1 className="page-title">学员</h1>
      <form className="form-row" onSubmit={create}>
        <label>姓名<input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>家长电话<input value={guardianPhone} onChange={(e) => setGuardianPhone(e.target.value)} /></label>
        <label>校区<select value={campusId} onChange={(e) => setCampusId(e.target.value)}>
          <option value="">选择校区</option>
          {campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></label>
        <button className="btn primary" type="submit">新增学员</button>
      </form>
      <div className="panel">
        <table className="table">
          <thead><tr><th>姓名</th><th>家长电话</th><th>状态</th></tr></thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.id}><td>{s.name}</td><td>{s.guardian_phone ?? '-'}</td><td>{s.status}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
```

- [ ] **Step 3: 注册路由**

`web/src/App.tsx` 修改：

```tsx
import DashboardPage from './pages/DashboardPage.tsx';
import StudentsPage from './pages/StudentsPage.tsx';
// 在 Routes 内加入：
<Route path="/students" element={<RequireAuth><StudentsPage /></RequireAuth>} />
```

- [ ] **Step 4: 构建验证**

Run: `npm --workspace web run build`

Expected: 构建成功。

- [ ] **Step 5: 提交**

```bash
git add web/src
git commit -m "feat: dashboard and student pages"
```

---

### Task 19: 班级与成绩页

**Files:**
- Create: `web/src/pages/ClassesPage.tsx`
- Create: `web/src/pages/GradesPage.tsx`
- Modify: `web/src/App.tsx`

- [ ] **Step 1: 写班级页**

`web/src/pages/ClassesPage.tsx`:

```tsx
import { useEffect, useState, type FormEvent } from 'react';
import Shell from '../Shell.tsx';
import { api } from '../api.ts';

export default function ClassesPage() {
  const [classes, setClasses] = useState<any[]>([]);
  const [campuses, setCampuses] = useState<any[]>([]);
  const [form, setForm] = useState({ campusId: '', name: '', subject: '', grade: '', teacherId: '' });

  async function load() {
    setClasses(await api<any[]>('/api/classes'));
  }
  useEffect(() => {
    load();
    api<any[]>('/api/campuses').then(setCampuses).catch(() => {});
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    await api('/api/classes', {
      method: 'POST',
      body: JSON.stringify({
        campusId: Number(form.campusId),
        name: form.name,
        subject: form.subject,
        grade: form.grade,
        teacherId: form.teacherId ? Number(form.teacherId) : null
      })
    });
    setForm({ campusId: '', name: '', subject: '', grade: '', teacherId: '' });
    await load();
  }

  return (
    <Shell>
      <h1 className="page-title">班级</h1>
      <form className="form-row" onSubmit={create}>
        <label>校区<select value={form.campusId} onChange={(e) => setForm({ ...form, campusId: e.target.value })}>
          <option value="">选择校区</option>
          {campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></label>
        <label>班级名称<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label>科目<input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></label>
        <label>年级<input value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} /></label>
        <button className="btn primary" type="submit">新增班级</button>
      </form>
      <div className="panel">
        <table className="table">
          <thead><tr><th>名称</th><th>科目</th><th>年级</th><th>教师</th><th>校区</th></tr></thead>
          <tbody>
            {classes.map((c) => (
              <tr key={c.id}><td>{c.name}</td><td>{c.subject}</td><td>{c.grade}</td><td>{c.teacher_name ?? '-'}</td><td>{c.campus_id}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
```

- [ ] **Step 2: 写成绩页**

`web/src/pages/GradesPage.tsx`:

```tsx
import { useEffect, useState, type FormEvent } from 'react';
import Shell from '../Shell.tsx';
import { api } from '../api.ts';

export default function GradesPage() {
  const [classes, setClasses] = useState<any[]>([]);
  const [classId, setClassId] = useState('');
  const [exams, setExams] = useState<any[]>([]);
  const [selectedExam, setSelectedExam] = useState('');
  const [students, setStudents] = useState<any[]>([]);
  const [scores, setScores] = useState<Record<number, string>>({});

  useEffect(() => {
    api<any[]>('/api/classes').then(setClasses);
  }, []);

  async function loadExams(cid: string) {
    if (!cid) return;
    setExams(await api<any[]>(`/api/exams?classId=${cid}`));
    setStudents(await api<any[]>('/api/students'));
  }

  async function createExam(e: FormEvent) {
    e.preventDefault();
    const form = new FormData(e.target as HTMLFormElement);
    await api('/api/exams', {
      method: 'POST',
      body: JSON.stringify({
        classId: Number(classId),
        name: form.get('name'),
        type: form.get('type'),
        examDate: form.get('examDate')
      })
    });
    await loadExams(classId);
  }

  async function saveScores() {
    const payload = Object.entries(scores).map(([studentId, value]) => ({
      studentId: Number(studentId),
      numericScore: value === '' ? null : Number(value)
    }));
    await api(`/api/exams/${selectedExam}/scores/bulk`, { method: 'POST', body: JSON.stringify({ scores: payload }) });
    setScores({});
  }

  async function exportCsv() {
    if (!selectedExam) return;
    const res = await fetch(`/api/exams/${selectedExam}/export`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token') ?? ''}` }
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'scores.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Shell>
      <h1 className="page-title">成绩</h1>
      <div className="form-row">
        <label>班级<select value={classId} onChange={(e) => { setClassId(e.target.value); loadExams(e.target.value); }}>
          <option value="">选择班级</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></label>
        <label>考试<select value={selectedExam} onChange={(e) => setSelectedExam(e.target.value)}>
          <option value="">选择考试</option>
          {exams.map((ex) => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
        </select></label>
      </div>
      <form className="form-row" onSubmit={createExam}>
        <label>考试名称<input name="name" required /></label>
        <label>类型<select name="type"><option value="unit">单元测</option><option value="midterm">期中</option><option value="final">期末</option><option value="level">等级考</option></select></label>
        <label>日期<input name="examDate" type="date" required /></label>
        <button className="btn primary" type="submit">新建考试</button>
      </form>
      <div className="panel">
        <table className="table">
          <thead><tr><th>学员</th><th>分数</th></tr></thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td><input type="number" value={scores[s.id] ?? ''} onChange={(e) => setScores({ ...scores, [s.id]: e.target.value })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn primary" onClick={saveScores} disabled={!selectedExam}>保存成绩</button>
        <button className="btn" onClick={exportCsv} disabled={!selectedExam}>导出 CSV</button>
      </div>
    </Shell>
  );
}
```

- [ ] **Step 3: 注册路由**

`web/src/App.tsx` 修改：

```tsx
import ClassesPage from './pages/ClassesPage.tsx';
import GradesPage from './pages/GradesPage.tsx';
<Route path="/classes" element={<RequireAuth><ClassesPage /></RequireAuth>} />
<Route path="/grades" element={<RequireAuth><GradesPage /></RequireAuth>} />
```

- [ ] **Step 4: 构建验证**

Run: `npm --workspace web run build`

Expected: 构建成功。

- [ ] **Step 5: 提交**

```bash
git add web/src
git commit -m "feat: classes and grades pages"
```

---

### Task 20: 导入页（支持 .xlsx 与 .csv）

**Files:**
- Modify: `web/package.json`
- Create: `web/src/pages/ImportPage.tsx`
- Modify: `web/src/App.tsx`

- [ ] **Step 1: 增加 xlsx 依赖**

在 `web/package.json` 的 `dependencies` 中加入 `"xlsx": "^0.18.5"`，然后 Run: `npm install`

- [ ] **Step 2: 写导入页**

`web/src/pages/ImportPage.tsx`:

```tsx
import { useState } from 'react';
import * as XLSX from 'xlsx';
import Shell from '../Shell.tsx';
import { api } from '../api.ts';

export default function ImportPage() {
  const [kind, setKind] = useState('students');
  const [result, setResult] = useState<any>(null);

  async function handleFile(file: File) {
    let text: string;
    if (file.name.endsWith('.csv')) {
      text = await file.text();
    } else {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      text = XLSX.utils.sheet_to_csv(sheet);
    }
    const data = await api(`/api/imports/${kind}`, { method: 'POST', body: JSON.stringify({ csv: text }) });
    setResult(data);
  }

  return (
    <Shell>
      <h1 className="page-title">数据导入</h1>
      <div className="form-row">
        <label>导入类型<select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="students">学员</option>
          <option value="classes">班级</option>
          <option value="scores">成绩</option>
        </select></label>
        <input type="file" accept=".csv,.xlsx" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
      </div>
      {result && (
        <div className="panel">
          <h2>导入结果</h2>
          <p>共 {result.total_rows} 行，成功 {result.imported_rows} 行，错误 {result.error_rows} 行。</p>
          {result.errors?.length > 0 && (
            <ul>{result.errors.map((err: any, i: number) => <li key={i}>第 {err.row} 行 {err.column}: {err.message}</li>)}</ul>
          )}
        </div>
      )}
    </Shell>
  );
}
```

- [ ] **Step 3: 注册路由**

`web/src/App.tsx` 修改：

```tsx
import ImportPage from './pages/ImportPage.tsx';
<Route path="/import" element={<RequireAuth><ImportPage /></RequireAuth>} />
```

- [ ] **Step 4: 构建验证**

Run: `npm --workspace web run build`

Expected: 构建成功。

- [ ] **Step 5: 提交**

```bash
git add web/package.json web/package-lock.json web/src/pages/ImportPage.tsx web/src/App.tsx
git commit -m "feat: import page with csv and xlsx"
```

---

### Task 21: 我的成绩页与 me API

**Files:**
- Create: `server/src/routes/me.ts`
- Modify: `server/src/routes/reports.ts`
- Modify: `server/src/app.ts`
- Modify: `server/test/reports.test.ts`
- Create: `web/src/pages/MyScoresPage.tsx`
- Modify: `web/src/App.tsx`

- [ ] **Step 1: 抽公共报告函数**

把 `server/src/routes/reports.ts` 中的报告查询抽成可复用函数：

```ts
export async function getStudentReport(app: FastifyInstance, studentId: number) {
  const student = (await app.pool.query('SELECT * FROM students WHERE id = $1', [studentId])).rows[0];
  const scores = (await app.pool.query(
    `SELECT e.id AS exam_id, e.name, e.type, e.exam_date, e.grading_system,
            s.numeric_score, s.level, s.points, s.comment, c.name AS class_name,
            (SELECT COUNT(*) FROM scores s2 WHERE s2.exam_id = e.id AND s2.numeric_score > s.numeric_score) + 1 AS rank,
            (SELECT COUNT(*) FROM scores s2 WHERE s2.exam_id = e.id AND s2.numeric_score IS NOT NULL) AS total
     FROM exams e
     JOIN scores s ON s.exam_id = e.id AND s.student_id = $1
     JOIN classes c ON c.id = e.class_id
     ORDER BY e.exam_date DESC`,
    [studentId]
  )).rows;
  return { student, scores };
}
```

`/api/reports/student/:studentId` 改为调用该函数；权限判断保持不变。

- [ ] **Step 2: 写 me API**

`server/src/routes/me.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { authGuard } from '../auth/middleware.ts';
import { getStudentReport } from './reports.ts';

export async function meRoutes(app: FastifyInstance) {
  app.get('/children', { preHandler: [authGuard] }, async (request, reply) => {
    const user = request.user!;
    if (user.role !== 'parent') return reply.code(403).send({ error: 'forbidden' });
    const bindings = (await app.pool.query(
      'SELECT student_id FROM parent_bindings WHERE parent_user_id = $1',
      [user.id]
    )).rows;
    const children = [];
    for (const binding of bindings) {
      children.push(await getStudentReport(app, binding.student_id));
    }
    return children;
  });

  app.get('/report', { preHandler: [authGuard] }, async (request, reply) => {
    const user = request.user!;
    if (user.role === 'student' && user.studentId) {
      return getStudentReport(app, user.studentId);
    }
    if (user.role === 'parent') {
      const bindings = (await app.pool.query(
        'SELECT student_id FROM parent_bindings WHERE parent_user_id = $1',
        [user.id]
      )).rows;
      if (bindings.length === 0) return reply.code(404).send({ error: 'no bound child' });
      return getStudentReport(app, bindings[0].student_id);
    }
    return reply.code(403).send({ error: 'forbidden' });
  });
}
```

`server/src/app.ts` 修改：

```ts
import { meRoutes } from './routes/me.ts';
await app.register(meRoutes, { prefix: '/api/me' });
```

- [ ] **Step 3: 写失败测试**

在 `server/test/reports.test.ts` 末尾追加：

```ts
test('parent /api/me/children returns bound child report', async () => {
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username: 'parent', password: 'parent123' }
  });
  const res = await app.inject({
    method: 'GET',
    url: '/api/me/children',
    headers: { authorization: `Bearer ${login.json().token}` }
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().length, 1);
  assert.equal(res.json()[0].student.id, studentId);
});
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm --workspace server test`

Expected: PASS，27 个测试通过。

- [ ] **Step 5: 写前端我的成绩页**

`web/src/pages/MyScoresPage.tsx`:

```tsx
import { useEffect, useState } from 'react';
import Shell from '../Shell.tsx';
import { api } from '../api.ts';
import { useAuth } from '../auth.tsx';

export default function MyScoresPage() {
  const { user } = useAuth();
  const [children, setChildren] = useState<any[]>([]);

  useEffect(() => {
    if (user?.role === 'parent') {
      api<any[]>('/api/me/children').then(setChildren).catch(() => {});
    } else if (user?.role === 'student') {
      api<any>('/api/me/report').then((report) => setChildren([report])).catch(() => {});
    }
  }, [user]);

  return (
    <Shell>
      <h1 className="page-title">{user?.role === 'parent' ? '孩子成绩' : '我的成绩'}</h1>
      {children.map((child) => (
        <div className="panel" key={child.student.id}>
          <h2>{child.student.name}</h2>
          <table className="table">
            <thead><tr><th>考试</th><th>班级</th><th>分数</th><th>等级</th><th>排名</th><th>评语</th></tr></thead>
            <tbody>
              {child.scores.map((s: any) => (
                <tr key={s.exam_id}>
                  <td>{s.name}</td><td>{s.class_name}</td>
                  <td>{s.numeric_score ?? s.points ?? '-'}</td>
                  <td>{s.level ?? '-'}</td>
                  <td>{s.rank ?? '-'}/{s.total ?? '-'}</td>
                  <td>{s.comment ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn primary" onClick={() => window.print()}>打印报告</button>
        </div>
      ))}
    </Shell>
  );
}
```

`web/src/App.tsx` 修改：

```tsx
import MyScoresPage from './pages/MyScoresPage.tsx';
<Route path="/my-scores" element={<RequireAuth><MyScoresPage /></RequireAuth>} />
```

- [ ] **Step 6: 构建验证**

Run: `npm --workspace web run build`

Expected: 构建成功。

- [ ] **Step 7: 提交**

```bash
git add server/src web/src
git commit -m "feat: my scores page and me api"
```

---

### Task 22: 生产镜像与反向代理

**Files:**
- Create: `server/Dockerfile`
- Create: `web/Dockerfile`
- Create: `web/nginx.conf`
- Create: `docker-compose.prod.yml`

- [ ] **Step 1: 写 server 镜像**

`server/Dockerfile`:

```dockerfile
FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN npm install --workspace server --omit=dev
COPY server server
WORKDIR /app/server
EXPOSE 3000
CMD ["node", "src/server.ts"]
```

- [ ] **Step 2: 写 web 镜像与 nginx**

`web/Dockerfile`:

```dockerfile
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY web/package.json web/package.json
COPY server/package.json server/package.json
RUN npm install --workspace web
COPY web web
WORKDIR /app/web
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/web/dist /usr/share/nginx/html
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

`web/nginx.conf`:

```nginx
server {
  listen 80;
  root /usr/share/nginx/html;
  index index.html;

  location /api/ {
    proxy_pass http://server:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location / {
    try_files $uri /index.html;
  }
}
```

- [ ] **Step 3: 写生产 compose**

`docker-compose.prod.yml`:

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: school
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-school}
      POSTGRES_DB: school
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U school -d school"]
      interval: 5s
      timeout: 3s
      retries: 10

  server:
    build:
      context: .
      dockerfile: server/Dockerfile
    environment:
      DATABASE_URL: postgres://school:${POSTGRES_PASSWORD:-school}@db:5432/school
      JWT_SECRET: ${JWT_SECRET}
      PORT: 3000
    depends_on:
      db:
        condition: service_healthy

  web:
    build:
      context: .
      dockerfile: web/Dockerfile
    ports:
      - "80:80"
    depends_on:
      - server

volumes:
  pgdata:
```

- [ ] **Step 4: 验证构建**

Run: `docker compose -f docker-compose.prod.yml build`

Expected: 两个镜像构建成功。

- [ ] **Step 5: 提交**

```bash
git add server/Dockerfile web/Dockerfile web/nginx.conf docker-compose.prod.yml
git commit -m "feat: production docker images"
```

---

### Task 23: 备份脚本与 README

**Files:**
- Create: `scripts/backup.sh`
- Create: `README.md`

- [ ] **Step 1: 写备份脚本**

`scripts/backup.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$BACKUP_DIR"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

pg_dump "$DATABASE_URL" | gzip > "$BACKUP_DIR/school-$TIMESTAMP.sql.gz"
echo "backup written: $BACKUP_DIR/school-$TIMESTAMP.sql.gz"

find "$BACKUP_DIR" -name 'school-*.sql.gz' -mtime +30 -delete
```

每日备份 cron 示例：

```cron
0 3 * * * cd /opt/school-system && DATABASE_URL=postgres://school:school@localhost:5432/school ./scripts/backup.sh
```

- [ ] **Step 2: 写 README**

`README.md`:

```markdown
# 学校管理系统

一期：学员管理、成绩管理、Excel 导入、家长/学生端成绩查看。

## 本地开发

1. `docker compose up -d db`
2. `npm install`
3. `npm run migrate`
4. `npm run dev:server`（端口 3000）
5. `npm run dev:web`（端口 5173）

测试库：`node server/scripts/create-test-db.mjs`，然后 `npm test`。

## 生产部署

1. 设置环境变量 `POSTGRES_PASSWORD`、`JWT_SECRET`。
2. `docker compose -f docker-compose.prod.yml up -d --build`
3. 通过 80 端口访问，`/api` 自动代理到后端。

## 备份与恢复

备份：`DATABASE_URL=... ./scripts/backup.sh`

恢复：

```bash
gunzip -c backups/school-YYYYMMDD-HHMMSS.sql.gz | psql "$DATABASE_URL"
```
```

- [ ] **Step 3: 提交**

```bash
git add scripts/backup.sh README.md
git commit -m "docs: backup script and readme"
```

---

### Task 24: 一期验收清单

**Files:** 无新文件；按清单手工验收。

- [ ] **Step 1: 验收标准 1 - 导入**

启动前后端，用管理员登录；在“导入”页上传含 2 名学员的 CSV（含正确校区名），确认显示“成功 2 行”；再上传一行错误校区名的 CSV，确认错误报告指向具体行与列。

- [ ] **Step 2: 验收标准 2 - 教师与行政成绩权限**

用教师账号登录，只能看到自己任教班级的学员；录入成绩成功。用另一个班级的考试 API 直接调用（curl），确认返回 403。管理员账号可以对全校任一班级录入。

- [ ] **Step 3: 验收标准 3 - 家长/学生只看到自己**

用管理员生成家长邀请码并绑定某学员；家长登录后“孩子成绩”只显示绑定学员的报告。学生账号登录后只显示自己的报告；用 curl 访问其他学员的 `/api/reports/student/:id`，确认返回 403。

- [ ] **Step 4: 验收标准 4 - 多校区隔离与修改留痕**

创建两个校区及各自班级/学员，确认管理员可看全部、教师互不可见；修改一次成绩后查询 `audit_logs`，确认存在两条 `score_upsert` 记录（录入 + 修改）。

- [ ] **Step 5: 验收标准 5 - 备份恢复**

执行 `DATABASE_URL=... ./scripts/backup.sh` 生成备份；删除一条测试数据后执行恢复命令，确认数据恢复。

- [ ] **Step 6: 移动端检查**

用浏览器 DevTools 手机尺寸（375px）检查登录页、学员列表、我的成绩页：无横向滚动、无文字重叠。
