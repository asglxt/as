import type { FastifyInstance } from 'fastify';
import { authGuard } from '../auth/middleware.ts';
import { requireModule } from '../permissions/module_access.ts';
import { writeAudit } from '../audit.ts';

async function applyHours(
  app: FastifyInstance,
  enrollmentId: number,
  type: 'purchase' | 'consume' | 'adjust' | 'refund',
  hours: number,
  remark: string | null,
  actorId: number,
  teachingLogId: number | null = null
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

export { applyHours };

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
      `INSERT INTO enrollments (student_id, lesson_id, campus_id, purchased_hours, used_hours, remaining_hours,
         total_fee, paid_fee, remaining_fee, arrears)
       VALUES ($1,$2,$3,$4,0,0,$5,$6,$5,$7) RETURNING *`,
      [body.studentId, body.lessonId, body.campusId, hours, totalFee, paidFee, Math.max(0, totalFee - paidFee)]
    );
    await applyHours(app, result.rows[0].id, 'purchase', hours, '初始购买', request.user!.id);
    await writeAudit(app, request.user!.id, 'enrollment_create', 'enrollment', result.rows[0].id, { ...body });
    return (await app.pool.query('SELECT * FROM enrollments WHERE id = $1', [result.rows[0].id])).rows[0];
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