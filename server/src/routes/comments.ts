import type { FastifyInstance } from 'fastify';
import { authGuard } from '../auth/middleware.ts';
import { requireModule } from '../permissions/module_access.ts';

export async function commentRoutes(app: FastifyInstance) {
  const guard = [authGuard, requireModule('comments')];

  async function ownsLog(request: any, teachingLogId: number) {
    if (request.user!.role !== 'teacher') return true;
    const row = await app.pool.query('SELECT 1 FROM teaching_logs WHERE id=$1 AND teacher_id=$2', [teachingLogId, request.user!.id]);
    return Boolean(row.rowCount);
  }

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
    if (!(await ownsLog(request, teachingLogId))) return reply.code(403).send({ error: 'teaching log forbidden' });
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
    const user = request.user!;
    const query = request.query as { classId?: string; status?: string; start?: string; end?: string; page?: string; pageSize?: string };
    const classId = Number(query.classId) || null;
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 50)));
    const params: unknown[] = [classId, query.start ?? null, query.end ?? null, user.role === 'teacher' ? user.id : null];
    const where = [
      '($1::bigint IS NULL OR tl.class_id = $1)',
      '($2::date IS NULL OR tl.taught_at::date >= $2::date)',
      '($3::date IS NULL OR tl.taught_at::date <= $3::date)',
      '($4::bigint IS NULL OR tl.teacher_id = $4)'
    ];
    if (query.status === 'pending') where.push('(SELECT COUNT(*) FROM teaching_comments tc WHERE tc.teaching_log_id = tl.id) < (SELECT COUNT(*) FROM class_students cs WHERE cs.class_id = tl.class_id AND cs.left_at IS NULL)');
    if (query.status === 'completed') where.push('(SELECT COUNT(*) FROM teaching_comments tc WHERE tc.teaching_log_id = tl.id) >= (SELECT COUNT(*) FROM class_students cs WHERE cs.class_id = tl.class_id AND cs.left_at IS NULL)');
    const baseWhere = where.join(' AND ');
    const summary = (await app.pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE (SELECT COUNT(*) FROM teaching_comments tc WHERE tc.teaching_log_id = tl.id) >= (SELECT COUNT(*) FROM class_students cs WHERE cs.class_id = tl.class_id AND cs.left_at IS NULL))::int AS completed
       FROM teaching_logs tl WHERE ${baseWhere}`,
      params
    )).rows[0];
    const items = (await app.pool.query(
      `SELECT tl.id AS teaching_log_id, tl.schedule_id, tl.taught_at, tl.status,
              c.id AS class_id, c.name AS class_name, u.display_name AS teacher_name,
              (SELECT COUNT(*) FROM teaching_comments tc WHERE tc.teaching_log_id = tl.id) AS comment_count,
              (SELECT COUNT(*) FROM teaching_comments tc WHERE tc.teaching_log_id = tl.id AND tc.read_at IS NOT NULL) AS read_count,
              (SELECT COUNT(*) FROM class_students cs WHERE cs.class_id = tl.class_id AND cs.left_at IS NULL) AS student_count
       FROM teaching_logs tl
       JOIN classes c ON c.id = tl.class_id
       LEFT JOIN users u ON u.id = tl.teacher_id
       WHERE ${baseWhere}
       ORDER BY tl.taught_at DESC NULLS LAST
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, (page - 1) * pageSize]
    )).rows.map((row) => {
      const studentCount = Number(row.student_count);
      const commentCount = Number(row.comment_count);
      const readCount = Number(row.read_count);
      return {
        ...row,
        teaching_log_id: Number(row.teaching_log_id),
        class_id: Number(row.class_id),
        student_count: studentCount,
        comment_count: commentCount,
        read_count: readCount,
        comment_rate: studentCount ? Math.round((commentCount / studentCount) * 100) : 0,
        read_rate: commentCount ? Math.round((readCount / commentCount) * 100) : 0
      };
    });
    return {
      items,
      total: Number(summary.total),
      page,
      pageSize,
      summary: { total: Number(summary.total), completed: Number(summary.completed), pending: Number(summary.total) - Number(summary.completed) }
    };
  });

  app.get('/logs/:teachingLogId/comments', { preHandler: guard }, async (request, reply) => {
    const teachingLogId = Number((request.params as { teachingLogId: string }).teachingLogId);
    if (!(await ownsLog(request, teachingLogId))) return reply.code(403).send({ error: 'teaching log forbidden' });
    return (await app.pool.query(
      `SELECT tc.id, tc.student_id, st.name AS student_name, tc.rating, tc.content, tc.flowers, tc.read_at
       FROM teaching_comments tc JOIN students st ON st.id = tc.student_id
       WHERE tc.teaching_log_id = $1 ORDER BY st.id`,
      [teachingLogId]
    )).rows;
  });
  app.get('/stats', { preHandler: guard }, async (request) => {
    const user = request.user!;
    const params: unknown[] = [user.role === 'teacher' ? user.id : null];
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
       WHERE ($1::bigint IS NULL OR tl.teacher_id = $1)
       GROUP BY c.id, c.name, u.display_name
       ORDER BY c.id`
      , params
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
