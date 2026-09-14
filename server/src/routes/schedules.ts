import type { FastifyInstance } from 'fastify';
import { authGuard } from '../auth/middleware.ts';
import { requireModule } from '../permissions/module_access.ts';
import { writeAudit } from '../audit.ts';

interface ScheduleInput {
  classId?: number; campusId?: number; date?: string;
  startTime?: string; endTime?: string;
  teacherId?: number; classroomId?: number; hasTrial?: boolean;
}

async function findConflict(app: FastifyInstance, input: ScheduleInput) {
  const rows = (await app.pool.query(
    `SELECT id, teacher_id, classroom_id, class_id
     FROM schedules
     WHERE schedule_date = $1::date AND status = 'normal'
       AND start_time < $2::time AND end_time > $3::time
       AND (teacher_id = $4 OR classroom_id = $5 OR class_id = $6)`,
    [input.date, input.endTime, input.startTime,
     input.teacherId ?? -1, input.classroomId ?? -1, input.classId ?? -1]
  )).rows;
  if (input.teacherId && rows.some((r) => Number(r.teacher_id) === Number(input.teacherId))) {
    return '教师在该时段已有课程';
  }
  if (input.classroomId && rows.some((r) => Number(r.classroom_id) === Number(input.classroomId))) {
    return '教室在该时段已被占用';
  }
  if (input.classId && rows.some((r) => Number(r.class_id) === Number(input.classId))) {
    return '班级在该时段已有课程';
  }
  return null;
}

export async function scheduleRoutes(app: FastifyInstance) {
  const guard = [authGuard, requireModule('schedules')];

  app.get('/', { preHandler: guard }, async (request) => {
    const query = request.query as { start?: string; end?: string; teacherId?: string; classroomId?: string; classId?: string };
    const result = await app.pool.query(
      `SELECT s.*, c.name AS class_name, u.display_name AS teacher_name,
              r.name AS classroom_name, camp.name AS campus_name
       FROM schedules s
       JOIN classes c ON c.id = s.class_id
       LEFT JOIN users u ON u.id = s.teacher_id
       LEFT JOIN classrooms r ON r.id = s.classroom_id
       JOIN campuses camp ON camp.id = s.campus_id
       WHERE ($1::date IS NULL OR s.schedule_date >= $1::date)
         AND ($2::date IS NULL OR s.schedule_date <= $2::date)
         AND ($3::bigint IS NULL OR s.teacher_id = $3)
         AND ($4::bigint IS NULL OR s.classroom_id = $4)
         AND ($5::bigint IS NULL OR s.class_id = $5)
       ORDER BY s.schedule_date, s.start_time`,
      [query.start ?? null, query.end ?? null,
       query.teacherId ? Number(query.teacherId) : null,
       query.classroomId ? Number(query.classroomId) : null,
       query.classId ? Number(query.classId) : null]
    );
    return result.rows;
  });

  app.get('/list', { preHandler: guard }, async (request) => {
    const user = request.user!;
    const query = request.query as {
      start?: string; end?: string; campusId?: string; teacherId?: string;
      classroomId?: string; classId?: string; lessonId?: string; recorded?: string;
    };
    const params: unknown[] = [query.start ?? null, query.end ?? null];
    const where: string[] = [
      '($1::date IS NULL OR s.schedule_date >= $1::date)',
      '($2::date IS NULL OR s.schedule_date <= $2::date)',
      "s.status = 'normal'"
    ];
    const teacherId = user.role === 'teacher' ? user.id : (query.teacherId ? Number(query.teacherId) : null);
    if (teacherId) { params.push(teacherId); where.push(`s.teacher_id = $${params.length}`); }
    if (query.campusId) { params.push(Number(query.campusId)); where.push(`s.campus_id = $${params.length}`); }
    if (query.classroomId) { params.push(Number(query.classroomId)); where.push(`s.classroom_id = $${params.length}`); }
    if (query.classId) { params.push(Number(query.classId)); where.push(`s.class_id = $${params.length}`); }
    if (query.lessonId) { params.push(Number(query.lessonId)); where.push(`c.lesson_id = $${params.length}`); }
    if (query.recorded === '1') where.push('s.is_recorded = true');
    if (query.recorded === '0') where.push('s.is_recorded = false');
    const baseWhere = where.join(' AND ');
    const summary = (await app.pool.query(
      `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE s.is_recorded)::int AS recorded,
              COUNT(*) FILTER (WHERE NOT s.is_recorded)::int AS pending
       FROM schedules s JOIN classes c ON c.id = s.class_id WHERE ${baseWhere}`,
      params
    )).rows[0];
    const items = (await app.pool.query(
      `SELECT s.*, c.name AS class_name, c.lesson_id, l.name AS lesson_name,
              u.display_name AS teacher_name, r.name AS classroom_name, camp.name AS campus_name,
              (SELECT COUNT(*) FROM class_students cs WHERE cs.class_id = c.id AND cs.left_at IS NULL)::int AS student_count
       FROM schedules s
       JOIN classes c ON c.id = s.class_id
       LEFT JOIN lessons l ON l.id = c.lesson_id
       LEFT JOIN users u ON u.id = s.teacher_id
       LEFT JOIN classrooms r ON r.id = s.classroom_id
       JOIN campuses camp ON camp.id = s.campus_id
       WHERE ${baseWhere}
       ORDER BY s.schedule_date, s.start_time`,
      params
    )).rows.map((row) => ({ ...row, id: Number(row.id), class_id: Number(row.class_id), student_count: Number(row.student_count) }));
    return { items, total: Number(summary.total), summary: { total: Number(summary.total), recorded: Number(summary.recorded), pending: Number(summary.pending) } };
  });

  app.post('/', { preHandler: guard }, async (request, reply) => {
    const body = request.body as ScheduleInput;
    if (!body.classId || !body.campusId || !body.date || !body.startTime || !body.endTime) {
      return reply.code(400).send({ error: 'classId, campusId, date, startTime, endTime required' });
    }
    const conflict = await findConflict(app, body);
    if (conflict) return reply.code(409).send({ error: conflict });
    const result = await app.pool.query(
      `INSERT INTO schedules (class_id, campus_id, schedule_date, start_time, end_time,
         teacher_id, classroom_id, has_trial, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [body.classId, body.campusId, body.date, body.startTime, body.endTime,
       body.teacherId ?? null, body.classroomId ?? null, body.hasTrial ?? false, request.user!.id]
    );
    await writeAudit(app, request.user!.id, 'schedule_create', 'schedule', result.rows[0].id, { ...body });
    return result.rows[0];
  });

  app.patch('/:id', { preHandler: guard }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const body = request.body as ScheduleInput;
    const current = (await app.pool.query('SELECT * FROM schedules WHERE id = $1', [id])).rows[0];
    if (!current) return reply.code(404).send({ error: 'schedule not found' });
    const merged: ScheduleInput = {
      classId: body.classId ?? Number(current.class_id),
      campusId: body.campusId ?? Number(current.campus_id),
      date: body.date ?? String(current.schedule_date).slice(0, 10),
      startTime: body.startTime ?? String(current.start_time).slice(0, 8),
      endTime: body.endTime ?? String(current.end_time).slice(0, 8),
      teacherId: body.teacherId ?? (current.teacher_id ? Number(current.teacher_id) : undefined),
      classroomId: body.classroomId ?? (current.classroom_id ? Number(current.classroom_id) : undefined)
    };
    const conflict = await findConflict(app, merged);
    if (conflict) return reply.code(409).send({ error: conflict });
    const result = await app.pool.query(
      `UPDATE schedules SET class_id = $1, campus_id = $2, schedule_date = $3, start_time = $4, end_time = $5,
         teacher_id = $6, classroom_id = $7 WHERE id = $8 RETURNING *`,
      [merged.classId, merged.campusId, merged.date, merged.startTime, merged.endTime,
       merged.teacherId ?? null, merged.classroomId ?? null, id]
    );
    await writeAudit(app, request.user!.id, 'schedule_update', 'schedule', id, { ...merged });
    return result.rows[0];
  });

  app.delete('/:id', { preHandler: guard }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const result = await app.pool.query("UPDATE schedules SET status = 'cancelled' WHERE id = $1 RETURNING *", [id]);
    if (!result.rowCount) return reply.code(404).send({ error: 'schedule not found' });
    await writeAudit(app, request.user!.id, 'schedule_cancel', 'schedule', id, {});
    return { ok: true };
  });
}
