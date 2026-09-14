import type { FastifyInstance } from 'fastify';
import { authGuard } from '../auth/middleware.ts';

export async function getStudentReport(app: FastifyInstance, studentId: number) {
  const student = (await app.pool.query('SELECT * FROM students WHERE id = $1', [studentId])).rows[0];
  const scores = (await app.pool.query(
    `SELECT ss.id, ss.score, ss.source, ss.exam_date, ss.remark, ss.class_id,
            p.name AS project_name, e.name AS exam_name, c.name AS class_name
     FROM student_scores ss
     JOIN exam_projects p ON p.id = ss.project_id
     JOIN exams e ON e.id = ss.exam_id
     LEFT JOIN classes c ON c.id = ss.class_id
     WHERE ss.student_id = $1
     ORDER BY ss.exam_date DESC, ss.id DESC`,
    [studentId]
  )).rows;
  return { student, scores };
}

export async function reportRoutes(app: FastifyInstance) {
  app.get('/student/:studentId', { preHandler: [authGuard] }, async (request, reply) => {
    const studentId = Number((request.params as { studentId: string }).studentId);
    const user = request.user!;
    const student = (await app.pool.query('SELECT * FROM students WHERE id = $1', [studentId])).rows[0];
    if (!student) return reply.code(404).send({ error: 'student not found' });

    let allowed = false;
    if (user.role === 'admin') allowed = true;
    if (user.role === 'teacher') {
      const row = await app.pool.query(
        `SELECT 1 FROM class_students cs JOIN classes c ON c.id = cs.class_id
         WHERE cs.student_id = $1 AND c.teacher_id = $2 AND cs.left_at IS NULL`,
        [studentId, user.id]
      );
      allowed = Boolean(row.rowCount);
    }
    if (user.role === 'parent') {
      const row = await app.pool.query(
        'SELECT 1 FROM parent_bindings WHERE parent_user_id = $1 AND student_id = $2',
        [user.id, studentId]
      );
      allowed = Boolean(row.rowCount);
    }
    if (user.role === 'student') {
      allowed = user.studentId === studentId;
    }
    if (!allowed) return reply.code(403).send({ error: 'forbidden' });

    return getStudentReport(app, studentId);
  });
}