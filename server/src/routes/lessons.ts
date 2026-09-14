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

  app.get('/list', { preHandler: guard }, async (request) => {
    const query = request.query as { keyword?: string; categoryId?: string; subjectId?: string; status?: string; page?: string; pageSize?: string };
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 20)));
    const params: unknown[] = [];
    const where: string[] = ['1 = 1'];
    if (query.keyword?.trim()) { params.push(`%${query.keyword.trim()}%`); where.push(`l.name ILIKE $${params.length}`); }
    if (query.categoryId) { params.push(Number(query.categoryId)); where.push(`l.category_id = $${params.length}`); }
    if (query.subjectId) { params.push(Number(query.subjectId)); where.push(`l.subject_id = $${params.length}`); }
    if (query.status) {
      params.push(query.status === 'active' ? 'on_sale' : query.status === 'disabled' ? 'off_sale' : query.status);
      where.push(`l.status = $${params.length}`);
    }
    const baseWhere = where.join(' AND ');
    const summary = (await app.pool.query(
      `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE l.status = 'on_sale')::int AS active,
              COUNT(*) FILTER (WHERE l.status = 'off_sale')::int AS disabled
       FROM lessons l WHERE ${baseWhere}`,
      params
    )).rows[0];
    const items = (await app.pool.query(
      `SELECT l.*, c.name AS category_name, s.name AS subject_name,
              (SELECT COUNT(*) FROM classes cl WHERE cl.lesson_id = l.id)::int AS class_count
       FROM lessons l LEFT JOIN lesson_categories c ON c.id = l.category_id LEFT JOIN subjects s ON s.id = l.subject_id
       WHERE ${baseWhere} ORDER BY l.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, (page - 1) * pageSize]
    )).rows.map((row) => ({ ...row, id: Number(row.id), class_count: Number(row.class_count) }));
    return { items, total: Number(summary.total), page, pageSize, summary: {
      total: Number(summary.total), active: Number(summary.active), disabled: Number(summary.disabled)
    } };
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
}
