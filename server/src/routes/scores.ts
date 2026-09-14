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

  app.get('/roster', { preHandler: read }, async (request, reply) => {
    const query = request.query as { classIds?: string; includeInactive?: string };
    const classIds = String(query.classIds ?? '')
      .split(',')
      .map(Number)
      .filter((id) => Number.isInteger(id) && id > 0);
    if (!classIds.length) return reply.code(400).send({ error: 'classIds required' });
    const includeInactive = query.includeInactive === '1' || query.includeInactive === 'true';
    const classes = (await app.pool.query(
      `SELECT id, name
       FROM classes
       WHERE id = ANY($1::bigint[])
       ORDER BY id`,
      [classIds]
    )).rows;
    const result = [];
    for (const cls of classes) {
      const students = (await app.pool.query(
        `SELECT s.id AS student_id, s.name, s.guardian_phone AS phone, s.status
         FROM class_students cs
         JOIN students s ON s.id = cs.student_id
         WHERE cs.class_id = $1
           AND cs.left_at IS NULL
           AND ($2::boolean OR s.status = 'active')
         ORDER BY s.name, s.id`,
        [cls.id, includeInactive]
      )).rows.map((row) => ({ ...row, student_id: Number(row.student_id) }));
      result.push({ classId: Number(cls.id), className: cls.name, students });
    }
    return result;
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
