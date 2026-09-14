# 学校管理系统

一期：学员管理、成绩管理、Excel 导入、家长/学生端成绩查看。

## 本地开发

需要 Node.js 24 与 PostgreSQL 16+（本地已安装 PostgreSQL 18）。

1. 创建数据库账号与库（已就绪时跳过）：

```sql
CREATE ROLE school LOGIN PASSWORD 'school';
CREATE DATABASE school OWNER school;
CREATE DATABASE school_test OWNER school;
```

2. 安装依赖并迁移：

```bash
pnpm install
pnpm migrate
```

3. 启动后端与前端：

```bash
pnpm dev:server   # http://localhost:3000
pnpm dev:web      # http://localhost:5173
```

## 测试

```bash
pnpm test
```

测试使用 `school_test` 数据库，测试文件串行执行。

## 生产部署

1. 设置环境变量 `POSTGRES_PASSWORD`、`JWT_SECRET`。
2. 构建并启动：

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

3. 通过 80 端口访问，`/api` 自动代理到后端。

## 备份与恢复

备份：

```bash
DATABASE_URL=postgres://school:school@localhost:5432/school ./scripts/backup.sh
```

恢复：

```bash
gunzip -c backups/school-YYYYMMDD-HHMMSS.sql.gz | psql "$DATABASE_URL"
```
