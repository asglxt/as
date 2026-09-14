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
