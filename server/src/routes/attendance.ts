import type { FastifyInstance } from 'fastify';
import { authGuard } from '../auth/middleware.ts';
import { requireModule } from '../permissions/module_access.ts';
import { writeAudit } from '../audit.ts';
import { applyHours } from './enrollments.ts';

const DEDUCT: Record<string, number> = { present: 1, absent: 1, leave: 0, makeup: 1 };

export async function attendanceRoutes(app: FastifyInstance) {
  const guard = [authGuard, requireModule('attendance')];

  app.get('/today', { preHandler: guard }, async (request) => {
    const date = (request.query as { date?: string }).date ?? new Date().toISOString().slice(0, 10);
    return (await app.pool.query(
      `SELECT s.id AS schedule_id, s.schedule_date, s.start_time, s.end_time, s.is_recorded,
              c.id AS class_id, c.name AS class_name, l.name AS lesson_name,
              u.display_name AS teacher_name, r.name AS classroom_name, camp.name AS campus_name
       FROM schedules s
       JOIN classes c ON c.id = s.class_id
       LEFT JOIN lessons l ON l.id = c.lesson_id
       LEFT JOIN users u ON u.id = s.teacher_id
       LEFT JOIN classrooms r ON r.id = s.classroom_id
       JOIN campuses camp ON camp.id = s.campus_id
       WHERE s.schedule_date = $1::date AND s.status = 'normal'
       ORDER BY s.start_time`,
      [date]
    )).rows;
  });

  app.get('/students/:scheduleId', { preHandler: guard }, async (request) => {
    const scheduleId = Number((request.params as { scheduleId: string }).scheduleId);
    return (await app.pool.query(
      `SELECT cs.student_id, st.name AS student_name, e.id AS enrollment_id, e.remaining_hours
       FROM schedules sc
       JOIN class_students cs ON cs.class_id = sc.class_id AND cs.left_at IS NULL
       JOIN students st ON st.id = cs.student_id
       LEFT JOIN enrollments e ON e.student_id = cs.student_id AND e.lesson_id = cs.lesson_id
       WHERE sc.id = $1
       ORDER BY st.id`,
      [scheduleId]
    )).rows;
  });

  app.post('/record/:scheduleId', { preHandler: guard }, async (request, reply) => {
    const scheduleId = Number((request.params as { scheduleId: string }).scheduleId);
    const body = request.body as { records?: Array<{ studentId?: number; status?: string; remark?: string }> };
    if (!Array.isArray(body.records) || body.records.length === 0) {
      return reply.code(400).send({ error: 'records required' });
    }
    const schedule = (await app.pool.query('SELECT * FROM schedules WHERE id = $1', [scheduleId])).rows[0];
    if (!schedule) return reply.code(404).send({ error: 'schedule not found' });
    if (schedule.is_recorded) return reply.code(409).send({ error: '该节课已记上课' });

    const client = await app.pool.connect();
    let teachingLogId = 0;
    try {
      await client.query('BEGIN');
      const log = await client.query(
        `INSERT INTO teaching_logs (schedule_id, class_id, campus_id, teacher_id, classroom_id, status, taught_at, recorded_by, recorded_at)
         VALUES ($1,$2,$3,$4,$5,'recorded', now(), $6, now()) RETURNING *`,
        [scheduleId, schedule.class_id, schedule.campus_id, schedule.teacher_id, schedule.classroom_id, request.user!.id]
      );
      teachingLogId = log.rows[0].id;
      for (const record of body.records) {
        if (!record.studentId || !record.status) continue;
        const hours = DEDUCT[record.status] ?? 0;
        await client.query(
          `INSERT INTO attendance_records (teaching_log_id, student_id, status, hours_deducted, remark)
           VALUES ($1,$2,$3,$4,$5)`,
          [teachingLogId, record.studentId, record.status, hours, record.remark ?? null]
        );
      }
      await client.query('UPDATE schedules SET is_recorded = true WHERE id = $1', [scheduleId]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    for (const record of body.records) {
      if (!record.studentId || !record.status) continue;
      const hours = DEDUCT[record.status] ?? 0;
      if (hours <= 0) continue;
      const enrollment = (await app.pool.query(
        `SELECT e.id, e.unit_price, e.total_fee, e.purchased_hours
         FROM enrollments e
         JOIN class_students cs ON cs.lesson_id = e.lesson_id
         WHERE e.student_id = $1 AND cs.class_id = $2 LIMIT 1`,
        [record.studentId, schedule.class_id]
      )).rows[0];
      if (enrollment) {
        await applyHours(app, enrollment.id, 'consume', -hours, '上课扣课时', request.user!.id, teachingLogId);
        const unitPrice = Number(enrollment.unit_price) || (Number(enrollment.purchased_hours) > 0
          ? Number(enrollment.total_fee) / Number(enrollment.purchased_hours) : 0);
        const deductFee = hours * unitPrice;
        if (deductFee > 0) {
          await app.pool.query(
            `UPDATE enrollments SET used_fee = used_fee + $1,
               remaining_fee = GREATEST(0, total_fee - (used_fee + $1)) WHERE id = $2`,
            [deductFee, enrollment.id]
          );
        }
      }
    }
    await writeAudit(app, request.user!.id, 'attendance_record', 'teaching_log', teachingLogId, { scheduleId });
    return { ok: true, teachingLogId };
  });

  app.get('/summary', { preHandler: guard }, async (request) => {
    const query = request.query as { studentId?: string };
    return (await app.pool.query(
      `SELECT e.id AS enrollment_id, st.name AS student_name, l.name AS lesson_name,
              e.purchased_hours, e.used_hours, e.remaining_hours
       FROM enrollments e
       JOIN students st ON st.id = e.student_id
       JOIN lessons l ON l.id = e.lesson_id
       WHERE ($1::bigint IS NULL OR e.student_id = $1)
       ORDER BY st.id`,
      [query.studentId ? Number(query.studentId) : null]
    )).rows;
  });
}