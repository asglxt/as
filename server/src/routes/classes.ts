import type { FastifyInstance } from 'fastify';
import { authGuard, requireRole } from '../auth/middleware.ts';

export async function classRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [authGuard] }, async (request) => {
    const user = request.user!;
    const select = `SELECT c.*, u.display_name AS teacher_name, a.display_name AS assistant_name,
                      l.name AS lesson_name,
                      (SELECT COUNT(*) FROM class_students cs WHERE cs.class_id = c.id AND cs.left_at IS NULL) AS student_count
                    FROM classes c
                    LEFT JOIN users u ON u.id = c.teacher_id
                    LEFT JOIN users a ON a.id = c.assistant_id
                    LEFT JOIN lessons l ON l.id = c.lesson_id`;
    const result = user.role === 'teacher'
      ? await app.pool.query(`${select} WHERE c.teacher_id = $1 ORDER BY c.id`, [user.id])
      : await app.pool.query(`${select} ORDER BY c.id`);
    return result.rows;
  });

  app.post('/', { preHandler: [authGuard, requireRole('admin')] }, async (request, reply) => {
    const body = request.body as {
      campusId?: number; name?: string; subject?: string; grade?: string;
      teacherId?: number; schedule?: string; lessonId?: number;
      assistantId?: number; capacity?: number; startDate?: string; recruitStatus?: string;
    };
    if (!body.campusId || !body.name?.trim() || !body.subject?.trim() || !body.grade?.trim()) {
      return reply.code(400).send({ error: 'campusId, name, subject, grade required' });
    }
    const result = await app.pool.query(
      `INSERT INTO classes (campus_id, name, subject, grade, schedule, teacher_id,
         lesson_id, assistant_id, capacity, start_date, recruit_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [body.campusId, body.name.trim(), body.subject.trim(), body.grade.trim(), body.schedule ?? null,
       body.teacherId ?? null, body.lessonId ?? null, body.assistantId ?? null,
       body.capacity ?? null, body.startDate ?? null, body.recruitStatus ?? 'recruiting']
    );
    return result.rows[0];
  });

  app.patch('/:id', { preHandler: [authGuard, requireRole('admin')] }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const body = request.body as {
      name?: string; subject?: string; grade?: string; schedule?: string;
      teacherId?: number | null; lessonId?: number; assistantId?: number;
      capacity?: number; startDate?: string; recruitStatus?: string;
    };
    const result = await app.pool.query(
      `UPDATE classes SET name = COALESCE($1, name), subject = COALESCE($2, subject), grade = COALESCE($3, grade),
         schedule = COALESCE($4, schedule), teacher_id = $5,
         lesson_id = COALESCE($6, lesson_id), assistant_id = COALESCE($7, assistant_id),
         capacity = COALESCE($8, capacity), start_date = COALESCE($9, start_date),
         recruit_status = COALESCE($10, recruit_status)
       WHERE id = $11 RETURNING *`,
      [body.name ?? null, body.subject ?? null, body.grade ?? null, body.schedule ?? null, body.teacherId ?? null,
       body.lessonId ?? null, body.assistantId ?? null, body.capacity ?? null, body.startDate ?? null,
       body.recruitStatus ?? null, id]
    );
    if (!result.rowCount) return reply.code(404).send({ error: 'class not found' });
    return result.rows[0];
  });

  app.get('/:id/students', { preHandler: [authGuard, requireRole('admin', 'teacher')] }, async (request) => {
    const classId = Number((request.params as { id: string }).id);
    return (await app.pool.query(
      `SELECT cs.student_id, st.name AS student_name, cs.lesson_id, cs.status, cs.start_date
       FROM class_students cs
       JOIN students st ON st.id = cs.student_id
       WHERE cs.class_id = $1 AND cs.left_at IS NULL
       ORDER BY st.id`,
      [classId]
    )).rows;
  });
  app.post('/:id/students', { preHandler: [authGuard, requireRole('admin')] }, async (request, reply) => {
    const classId = Number((request.params as { id: string }).id);
    const body = request.body as { studentId?: number; lessonId?: number; teacherId?: number; startDate?: string };
    if (!body.studentId) return reply.code(400).send({ error: 'studentId required' });
    const result = await app.pool.query(
      `INSERT INTO class_students (class_id, student_id, lesson_id, teacher_id, start_date)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (class_id, student_id) DO UPDATE
         SET left_at = NULL, status = 'active', lesson_id = EXCLUDED.lesson_id,
             teacher_id = EXCLUDED.teacher_id, start_date = EXCLUDED.start_date
       RETURNING *`,
      [classId, body.studentId, body.lessonId ?? null, body.teacherId ?? null, body.startDate ?? null]
    );
    return result.rows[0];
  });
}