import type { FastifyInstance } from 'fastify';
import { authGuard } from '../auth/middleware.ts';
import { requireModule } from '../permissions/module_access.ts';

export async function commentRoutes(app: FastifyInstance) {
  const guard = [authGuard, requireModule('comments')];

  app.get('/templates', { preHandler: guard }, async () => {
    return (await app.pool.query('SELECT * FROM comment_templates ORDER BY id')).rows;
  });

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

  app.get('/logs', { preHandler: guard }, async (request) => {
    const classId = Number((request.query as { classId?: string }).classId) || null;
    return (await app.pool.query(
      `SELECT tl.id AS teaching_log_id, tl.schedule_id, tl.taught_at, tl.status,
              c.id AS class_id, c.name AS class_name, u.display_name AS teacher_name,
              (SELECT COUNT(*) FROM teaching_comments tc WHERE tc.teaching_log_id = tl.id) AS comment_count,
              (SELECT COUNT(*) FROM class_students cs WHERE cs.class_id = tl.class_id AND cs.left_at IS NULL) AS student_count
       FROM teaching_logs tl
       JOIN classes c ON c.id = tl.class_id
       LEFT JOIN users u ON u.id = tl.teacher_id
       WHERE ($1::bigint IS NULL OR tl.class_id = $1)
       ORDER BY tl.taught_at DESC NULLS LAST
       LIMIT 100`,
      [classId]
    )).rows;
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