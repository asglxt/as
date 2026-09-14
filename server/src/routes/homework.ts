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

  app.get('/:id/records', { preHandler: guard }, async (request) => {
    const id = Number((request.params as { id: string }).id);
    return (await app.pool.query(
      `SELECT r.*, st.name AS student_name FROM homework_records r
       JOIN students st ON st.id = r.student_id
       WHERE r.homework_id = $1 ORDER BY st.id`,
      [id]
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
}