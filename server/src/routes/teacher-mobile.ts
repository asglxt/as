import type { FastifyInstance } from 'fastify';
import { authGuard, requireRole } from '../auth/middleware.ts';
import { recordAttendance } from './attendance.ts';
import { applyHours } from './enrollments.ts';

async function ownsClass(app: FastifyInstance, teacherId: number, classId: number) {
  const result = await app.pool.query('SELECT 1 FROM classes WHERE id = $1 AND teacher_id = $2', [classId, teacherId]);
  return Boolean(result.rowCount);
}

export async function teacherMobileRoutes(app: FastifyInstance) {
  const guard = [authGuard, requireRole('teacher')];

  app.get('/overview', { preHandler: guard }, async (request) => {
    const teacherId = request.user!.id;
    const profile = (await app.pool.query(
      `SELECT u.id, u.display_name, c.name AS campus_name
       FROM users u LEFT JOIN campuses c ON c.id = u.campus_id WHERE u.id = $1`,
      [teacherId]
    )).rows[0];
    const classes = (await app.pool.query(
      `SELECT c.id, c.name, c.subject, c.grade, l.name AS lesson_name,
              COUNT(cs.student_id) FILTER (WHERE cs.left_at IS NULL)::int AS student_count
       FROM classes c
       LEFT JOIN lessons l ON l.id = c.lesson_id
       LEFT JOIN class_students cs ON cs.class_id = c.id
       WHERE c.teacher_id = $1
       GROUP BY c.id, l.name ORDER BY c.name`,
      [teacherId]
    )).rows.map((row) => ({ ...row, id: Number(row.id), student_count: Number(row.student_count) }));
    const today = (await app.pool.query(
      `SELECT s.id AS schedule_id, s.schedule_date, s.start_time, s.end_time, s.is_recorded,
              c.id AS class_id, c.name AS class_name, l.name AS lesson_name,
              r.name AS classroom_name, camp.name AS campus_name,
              (SELECT COUNT(*) FROM class_students cs WHERE cs.class_id = c.id AND cs.left_at IS NULL)::int AS student_count
       FROM schedules s
       JOIN classes c ON c.id = s.class_id
       LEFT JOIN lessons l ON l.id = c.lesson_id
       LEFT JOIN classrooms r ON r.id = s.classroom_id
       JOIN campuses camp ON camp.id = s.campus_id
       WHERE s.teacher_id = $1 AND s.schedule_date = CURRENT_DATE AND s.status = 'normal'
       ORDER BY s.start_time`,
      [teacherId]
    )).rows.map((row) => ({ ...row, schedule_id: Number(row.schedule_id), class_id: Number(row.class_id), student_count: Number(row.student_count) }));
    const pendingHomework = (await app.pool.query(
      `SELECT COUNT(*)::int AS count FROM homework h
       WHERE h.teacher_id = $1 AND h.status = 'published'
         AND (SELECT COUNT(*) FROM homework_records r WHERE r.homework_id = h.id AND r.status <> 'not_submitted')
           > (SELECT COUNT(*) FROM homework_records r WHERE r.homework_id = h.id AND r.status = 'reviewed')`,
      [teacherId]
    )).rows[0];
    return {
      profile: { ...profile, id: Number(profile.id) },
      classes,
      today,
      stats: {
        classes: classes.length,
        students: classes.reduce((sum, item) => sum + item.student_count, 0),
        pendingAttendance: today.filter((item) => !item.is_recorded).length,
        pendingHomework: Number(pendingHomework.count)
      }
    };
  });

  app.get('/attendance/today', { preHandler: guard }, async (request) => {
    return (await app.pool.query(
      `SELECT s.id AS schedule_id, s.start_time, s.end_time, s.is_recorded,
              c.id AS class_id, c.name AS class_name, r.name AS classroom_name,
              (SELECT COUNT(*) FROM class_students cs WHERE cs.class_id = c.id AND cs.left_at IS NULL)::int AS student_count
       FROM schedules s JOIN classes c ON c.id = s.class_id
       LEFT JOIN classrooms r ON r.id = s.classroom_id
       WHERE s.teacher_id = $1 AND s.schedule_date = CURRENT_DATE AND s.status = 'normal'
       ORDER BY s.start_time`,
      [request.user!.id]
    )).rows;
  });

  app.get('/attendance/:scheduleId/roster', { preHandler: guard }, async (request, reply) => {
    const scheduleId = Number((request.params as { scheduleId: string }).scheduleId);
    const schedule = (await app.pool.query('SELECT * FROM schedules WHERE id = $1 AND teacher_id = $2', [scheduleId, request.user!.id])).rows[0];
    if (!schedule) return reply.code(404).send({ error: 'schedule not found' });
    return (await app.pool.query(
      `SELECT cs.student_id, st.name AS student_name, e.id AS enrollment_id, e.remaining_hours,
              ar.status AS attendance_status, ar.remark
       FROM class_students cs
       JOIN students st ON st.id = cs.student_id
       LEFT JOIN enrollments e ON e.student_id = cs.student_id AND e.lesson_id = cs.lesson_id
       LEFT JOIN teaching_logs tl ON tl.schedule_id = $1
       LEFT JOIN attendance_records ar ON ar.teaching_log_id = tl.id AND ar.student_id = cs.student_id
       WHERE cs.class_id = $2 AND cs.left_at IS NULL
       ORDER BY st.id`,
      [scheduleId, schedule.class_id]
    )).rows;
  });

  app.post('/attendance/:scheduleId/record', { preHandler: guard }, async (request, reply) => {
    const scheduleId = Number((request.params as { scheduleId: string }).scheduleId);
    const body = request.body as { records?: Array<{ studentId?: number; status?: string; remark?: string }> };
    const schedule = (await app.pool.query('SELECT 1 FROM schedules WHERE id = $1 AND teacher_id = $2', [scheduleId, request.user!.id])).rows[0];
    if (!schedule) return reply.code(404).send({ error: 'schedule not found' });
    if (!Array.isArray(body.records) || body.records.length === 0) return reply.code(400).send({ error: 'records required' });
    const result = await recordAttendance(app, scheduleId, body.records, request.user!.id);
    if ('error' in result) return reply.code(result.statusCode ?? 500).send({ error: result.error });
    return result;
  });

  app.get('/homework', { preHandler: guard }, async (request) => {
    const query = request.query as { classId?: string; status?: string };
    return (await app.pool.query(
      `SELECT h.*, c.name AS class_name,
              (SELECT COUNT(*) FROM homework_records r WHERE r.homework_id = h.id)::int AS student_count,
              (SELECT COUNT(*) FROM homework_records r WHERE r.homework_id = h.id AND r.status <> 'not_submitted')::int AS submitted_count,
              (SELECT COUNT(*) FROM homework_records r WHERE r.homework_id = h.id AND r.status = 'reviewed')::int AS reviewed_count
       FROM homework h JOIN classes c ON c.id = h.class_id
       WHERE h.teacher_id = $1
         AND ($2::bigint IS NULL OR h.class_id = $2)
         AND ($3::text IS NULL OR h.status = $3)
       ORDER BY h.id DESC LIMIT 100`,
      [request.user!.id, query.classId ? Number(query.classId) : null, query.status ?? null]
    )).rows;
  });

  app.get('/homework/:id/records', { preHandler: guard }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const homework = (await app.pool.query('SELECT * FROM homework WHERE id = $1 AND teacher_id = $2', [id, request.user!.id])).rows[0];
    if (!homework) return reply.code(404).send({ error: 'homework not found' });
    return (await app.pool.query(
      `SELECT r.*, st.name AS student_name FROM homework_records r
       JOIN students st ON st.id = r.student_id WHERE r.homework_id = $1 ORDER BY st.id`,
      [id]
    )).rows;
  });

  app.post('/homework', { preHandler: guard }, async (request, reply) => {
    const body = request.body as { classId?: number; title?: string; content?: string; status?: string; dueAt?: string };
    if (!body.classId || !body.title?.trim() || !(await ownsClass(app, request.user!.id, body.classId))) {
      return reply.code(body.classId ? 403 : 400).send({ error: body.classId ? 'class forbidden' : 'classId and title required' });
    }
    const status = body.status === 'published' ? 'published' : 'draft';
    const client = await app.pool.connect();
    try {
      await client.query('BEGIN');
      const homework = await client.query(
        `INSERT INTO homework (class_id,teacher_id,title,content,attachments,status,assigned_at,due_at)
         VALUES ($1,$2,$3,$4,'[]',$5,$6,$7) RETURNING *`,
        [body.classId, request.user!.id, body.title.trim(), body.content ?? null, status,
         status === 'published' ? new Date().toISOString() : null, body.dueAt ?? null]
      );
      if (status === 'published') {
        await client.query(
          `INSERT INTO homework_records (homework_id,student_id)
           SELECT $1, student_id FROM class_students WHERE class_id=$2 AND left_at IS NULL
           ON CONFLICT DO NOTHING`,
          [homework.rows[0].id, body.classId]
        );
      }
      await client.query('COMMIT');
      return homework.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  app.post('/homework/:id/records/:studentId/review', { preHandler: guard }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const studentId = Number((request.params as { studentId: string }).studentId);
    const body = request.body as { score?: string; comment?: string };
    const homework = (await app.pool.query('SELECT 1 FROM homework WHERE id = $1 AND teacher_id = $2', [id, request.user!.id])).rows[0];
    if (!homework) return reply.code(404).send({ error: 'homework not found' });
    const record = (await app.pool.query('SELECT * FROM homework_records WHERE homework_id=$1 AND student_id=$2', [id, studentId])).rows[0];
    if (!record) return reply.code(404).send({ error: 'record not found' });
    if (record.status === 'not_submitted') return reply.code(409).send({ error: '尚未提交，不能批改' });
    await app.pool.query(
      "UPDATE homework_records SET status='reviewed',score=$1,comment=$2,reviewed_at=now() WHERE id=$3",
      [body.score ?? null, body.comment ?? null, record.id]
    );
    return { ok: true };
  });

  app.get('/scores/dictionaries', { preHandler: guard }, async () => {
    const projects = (await app.pool.query('SELECT * FROM exam_projects WHERE enabled = true ORDER BY sort,id')).rows;
    const exams = (await app.pool.query('SELECT * FROM exams WHERE enabled = true ORDER BY sort,id')).rows;
    return { projects, exams };
  });

  app.get('/scores/roster', { preHandler: guard }, async (request, reply) => {
    const classId = Number((request.query as { classId?: string }).classId);
    if (!classId || !(await ownsClass(app, request.user!.id, classId))) return reply.code(403).send({ error: 'class forbidden' });
    return (await app.pool.query(
      `SELECT s.id AS student_id, s.name FROM class_students cs
       JOIN students s ON s.id = cs.student_id
       WHERE cs.class_id = $1 AND cs.left_at IS NULL AND s.status = 'active' ORDER BY s.name,s.id`,
      [classId]
    )).rows;
  });

  app.post('/scores/bulk', { preHandler: guard }, async (request, reply) => {
    const body = request.body as {
      classId?: number; projectId?: number; examId?: number; examDate?: string;
      scores?: Array<{ studentId?: number; score?: string; remark?: string }>;
    };
    if (!body.classId || !body.projectId || !body.examId || !body.examDate || !Array.isArray(body.scores)) {
      return reply.code(400).send({ error: 'classId, projectId, examId, examDate and scores required' });
    }
    if (!(await ownsClass(app, request.user!.id, body.classId))) return reply.code(403).send({ error: 'class forbidden' });
    const client = await app.pool.connect();
    try {
      await client.query('BEGIN');
      let count = 0;
      for (const item of body.scores) {
        if (!item.studentId) continue;
        await client.query(
          `INSERT INTO student_scores (student_id,project_id,exam_id,class_id,score,source,exam_date,remark,created_by)
           VALUES ($1,$2,$3,$4,$5,'teacher',$6,$7,$8)
           ON CONFLICT (student_id,project_id,exam_id,exam_date)
           DO UPDATE SET score=EXCLUDED.score,remark=EXCLUDED.remark,class_id=EXCLUDED.class_id,
             source=EXCLUDED.source,created_by=EXCLUDED.created_by`,
          [item.studentId, body.projectId, body.examId, body.classId, item.score ?? null, body.examDate, item.remark ?? null, request.user!.id]
        );
        count += 1;
      }
      await client.query('COMMIT');
      return { count };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  app.get('/hours', { preHandler: guard }, async (request, reply) => {
    const classId = Number((request.query as { classId?: string }).classId);
    if (!classId || !(await ownsClass(app, request.user!.id, classId))) return reply.code(403).send({ error: 'class forbidden' });
    return (await app.pool.query(
      `SELECT e.id AS enrollment_id, e.student_id, st.name AS student_name, l.name AS lesson_name,
              e.purchased_hours, e.used_hours, e.remaining_hours
       FROM enrollments e
       JOIN class_students cs ON cs.student_id = e.student_id AND cs.lesson_id = e.lesson_id
       JOIN students st ON st.id = e.student_id
       JOIN lessons l ON l.id = e.lesson_id
       WHERE cs.class_id = $1 AND cs.left_at IS NULL ORDER BY st.name,st.id`,
      [classId]
    )).rows;
  });

  app.post('/hours/:enrollmentId/adjust', { preHandler: guard }, async (request, reply) => {
    const enrollmentId = Number((request.params as { enrollmentId: string }).enrollmentId);
    const body = request.body as { hours?: number; remark?: string };
    if (typeof body.hours !== 'number' || !body.remark?.trim()) return reply.code(400).send({ error: 'hours and remark required' });
    const allowed = (await app.pool.query(
      `SELECT 1 FROM enrollments e
       JOIN class_students cs ON cs.student_id = e.student_id AND cs.lesson_id = e.lesson_id
       JOIN classes c ON c.id = cs.class_id
       WHERE e.id = $1 AND c.teacher_id = $2 AND cs.left_at IS NULL LIMIT 1`,
      [enrollmentId, request.user!.id]
    )).rows[0];
    if (!allowed) return reply.code(403).send({ error: 'enrollment forbidden' });
    const result = await applyHours(app, enrollmentId, 'adjust', body.hours, body.remark.trim(), request.user!.id);
    return result.enrollment;
  });
}
