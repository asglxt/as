import type { FastifyInstance } from 'fastify';
import { authGuard, requireRole } from '../auth/middleware.ts';
import { requireModule } from '../permissions/module_access.ts';

const STUDENT_STATUSES = new Set(['active', 'inactive', 'graduated']);

function toNumberedStudent(row: any) {
  return {
    ...row,
    id: Number(row.id),
    campus_id: row.campus_id === null ? null : Number(row.campus_id)
  };
}

async function canAccessStudent(
  app: FastifyInstance,
  user: { id: number; role: string; studentId: number | null },
  studentId: number
) {
  if (user.role === 'admin') return true;
  if (user.role === 'teacher') {
    const result = await app.pool.query(
      `SELECT 1 FROM class_students cs
       JOIN classes c ON c.id = cs.class_id
       WHERE cs.student_id = $1 AND c.teacher_id = $2 AND cs.left_at IS NULL
       LIMIT 1`,
      [studentId, user.id]
    );
    return Boolean(result.rowCount);
  }
  if (user.role === 'parent') {
    const result = await app.pool.query(
      'SELECT 1 FROM parent_bindings WHERE parent_user_id = $1 AND student_id = $2 LIMIT 1',
      [user.id, studentId]
    );
    return Boolean(result.rowCount);
  }
  return user.role === 'student' && user.studentId === studentId;
}

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

  app.get('/list', { preHandler: [authGuard, requireModule('students')] }, async (request) => {
    const user = request.user!;
    const query = request.query as {
      keyword?: string;
      status?: string;
      campusId?: string;
      gender?: string;
      page?: string;
      pageSize?: string;
    };
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 20)));
    const params: unknown[] = [];
    const where: string[] = ['1 = 1'];

    if (user.role === 'teacher') {
      params.push(user.id);
      where.push(`EXISTS (
        SELECT 1 FROM class_students cs
        JOIN classes c ON c.id = cs.class_id
        WHERE cs.student_id = s.id AND c.teacher_id = $${params.length} AND cs.left_at IS NULL
      )`);
    }
    if (query.keyword?.trim()) {
      params.push(`%${query.keyword.trim()}%`);
      where.push(`(s.name ILIKE $${params.length} OR COALESCE(s.guardian_phone, '') ILIKE $${params.length})`);
    }
    if (query.status && STUDENT_STATUSES.has(query.status)) {
      params.push(query.status);
      where.push(`s.status = $${params.length}`);
    }
    if (query.campusId) {
      params.push(Number(query.campusId));
      where.push(`s.campus_id = $${params.length}`);
    }
    if (query.gender === 'male' || query.gender === 'female') {
      params.push(query.gender === 'male' ? '男' : '女');
      where.push(`s.gender = $${params.length}`);
    }

    const baseWhere = where.join(' AND ');
    const summary = (await app.pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE s.status = 'active')::int AS active,
              COUNT(*) FILTER (WHERE s.status = 'inactive')::int AS inactive,
              COUNT(*) FILTER (WHERE s.status = 'graduated')::int AS graduated
       FROM students s WHERE ${baseWhere}`,
      params
    )).rows[0];
    const listParams = [...params, pageSize, (page - 1) * pageSize];
    const items = (await app.pool.query(
      `SELECT s.*, camp.name AS campus_name,
              COALESCE((
                SELECT STRING_AGG(c.name, '、' ORDER BY c.id)
                FROM class_students cs
                JOIN classes c ON c.id = cs.class_id
                WHERE cs.student_id = s.id AND cs.left_at IS NULL
              ), '') AS class_names
       FROM students s
       LEFT JOIN campuses camp ON camp.id = s.campus_id
       WHERE ${baseWhere}
       ORDER BY s.id DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      listParams
    )).rows.map(toNumberedStudent);

    return {
      items,
      total: Number(summary.total),
      page,
      pageSize,
      summary: {
        total: Number(summary.total),
        active: Number(summary.active),
        inactive: Number(summary.inactive),
        graduated: Number(summary.graduated)
      }
    };
  });

  app.post('/batch', { preHandler: [authGuard, requireRole('admin')] }, async (request, reply) => {
    const body = request.body as { ids?: number[]; status?: string; campusId?: number };
    const ids = (body.ids ?? []).map(Number).filter((id) => Number.isInteger(id) && id > 0);
    if (!ids.length) return reply.code(400).send({ error: 'ids required' });
    if (body.status && !STUDENT_STATUSES.has(body.status)) return reply.code(400).send({ error: 'invalid status' });
    if (!body.status && !body.campusId) return reply.code(400).send({ error: 'status or campusId required' });

    const result = await app.pool.query(
      `UPDATE students
       SET status = COALESCE($1, status),
           campus_id = COALESCE($2, campus_id)
       WHERE id = ANY($3::bigint[])`,
      [body.status ?? null, body.campusId ?? null, ids]
    );
    return { count: result.rowCount ?? 0 };
  });

  app.post('/', { preHandler: [authGuard, requireRole('admin')] }, async (request, reply) => {
    const body = request.body as {
      campusId?: number;
      name?: string;
      guardianPhone?: string;
      gender?: string;
      birthday?: string;
      enrollmentDate?: string;
      discount?: string;
      source?: string;
      notes?: string;
      guardians?: Array<{ name: string; relation?: string; phone?: string; isPrimary?: boolean }>;
    };
    if (!body.campusId || !body.name?.trim()) {
      return reply.code(400).send({ error: 'campusId and name required' });
    }
    const result = await app.pool.query(
      `INSERT INTO students (
        campus_id, name, guardian_phone, gender, birthday, enrollment_date, discount, source, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        body.campusId,
        body.name.trim(),
        body.guardianPhone ?? null,
        body.gender ?? null,
        body.birthday || null,
        body.enrollmentDate || null,
        body.discount ?? null,
        body.source ?? null,
        body.notes ?? null
      ]
    );
    const student = result.rows[0];
    for (const guardian of body.guardians ?? []) {
      if (!guardian.name?.trim()) continue;
      await app.pool.query(
        `INSERT INTO student_guardians (student_id, name, relation, phone, is_primary)
         VALUES ($1, $2, $3, $4, $5)`,
        [student.id, guardian.name.trim(), guardian.relation ?? null, guardian.phone ?? null, Boolean(guardian.isPrimary)]
      );
    }
    return student;
  });

  app.get('/:id', { preHandler: [authGuard] }, async (request, reply) => {
    const studentId = Number((request.params as { id: string }).id);
    if (!(await canAccessStudent(app, request.user!, studentId))) return reply.code(403).send({ error: 'forbidden' });
    const detail = await loadStudentDetail(app, studentId);
    if (!detail) return reply.code(404).send({ error: 'student not found' });
    return detail;
  });

  app.post('/:id/growth', { preHandler: [authGuard, requireModule('students')] }, async (request, reply) => {
    const studentId = Number((request.params as { id: string }).id);
    const body = request.body as { type?: string; content?: string; occurredAt?: string };
    if (!body.content?.trim()) return reply.code(400).send({ error: 'content required' });
    const result = await app.pool.query(
      `INSERT INTO student_growth_records (student_id, type, content, occurred_at, created_by)
       VALUES ($1, $2, $3, COALESCE($4::timestamptz, now()), $5)
       RETURNING id, type, content, occurred_at, created_by`,
      [studentId, body.type ?? 'note', body.content.trim(), body.occurredAt ?? null, request.user!.id]
    );
    return result.rows[0];
  });

  app.patch('/:id', { preHandler: [authGuard, requireRole('admin')] }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const body = request.body as {
      name?: string;
      guardianPhone?: string;
      status?: string;
      campusId?: number;
      gender?: string;
      birthday?: string;
      enrollmentDate?: string;
      discount?: string;
      source?: string;
      notes?: string;
    };
    if (body.status && !STUDENT_STATUSES.has(body.status)) return reply.code(400).send({ error: 'invalid status' });
    const result = await app.pool.query(
      `UPDATE students SET
        name = COALESCE($1, name),
        guardian_phone = COALESCE($2, guardian_phone),
        status = COALESCE($3, status),
        campus_id = COALESCE($4, campus_id),
        gender = COALESCE($5, gender),
        birthday = COALESCE($6::date, birthday),
        enrollment_date = COALESCE($7::date, enrollment_date),
        discount = COALESCE($8, discount),
        source = COALESCE($9, source),
        notes = COALESCE($10, notes)
       WHERE id = $11
       RETURNING *`,
      [
        body.name ?? null,
        body.guardianPhone ?? null,
        body.status ?? null,
        body.campusId ?? null,
        body.gender ?? null,
        body.birthday || null,
        body.enrollmentDate || null,
        body.discount ?? null,
        body.source ?? null,
        body.notes ?? null,
        id
      ]
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

async function loadStudentDetail(app: FastifyInstance, studentId: number) {
  const student = (await app.pool.query(
    `SELECT s.*, camp.name AS campus_name
     FROM students s
     LEFT JOIN campuses camp ON camp.id = s.campus_id
     WHERE s.id = $1`,
    [studentId]
  )).rows[0];
  if (!student) return null;

  const guardians = (await app.pool.query(
    `SELECT id, name, relation, phone, is_primary
     FROM student_guardians
     WHERE student_id = $1
     ORDER BY is_primary DESC, id`,
    [studentId]
  )).rows.map((row) => ({ ...row, id: Number(row.id) }));

  const classes = (await app.pool.query(
    `SELECT c.id, c.name, c.subject, c.grade, c.start_date, c.recruit_status,
            l.name AS lesson_name, u.display_name AS teacher_name, cs.status
     FROM class_students cs
     JOIN classes c ON c.id = cs.class_id
     LEFT JOIN lessons l ON l.id = c.lesson_id
     LEFT JOIN users u ON u.id = c.teacher_id
     WHERE cs.student_id = $1 AND cs.left_at IS NULL
     ORDER BY c.id DESC`,
    [studentId]
  )).rows.map((row) => ({ ...row, id: Number(row.id) }));

  const scores = (await app.pool.query(
    `SELECT ss.id, ss.score, ss.source, ss.exam_date, ss.remark,
            p.name AS project_name, e.name AS exam_name, c.name AS class_name
     FROM student_scores ss
     JOIN exam_projects p ON p.id = ss.project_id
     JOIN exams e ON e.id = ss.exam_id
     LEFT JOIN classes c ON c.id = ss.class_id
     WHERE ss.student_id = $1
     ORDER BY ss.exam_date DESC, ss.id DESC
     LIMIT 50`,
    [studentId]
  )).rows.map((row) => ({ ...row, id: Number(row.id) }));

  const growthRecords = (await app.pool.query(
    `SELECT id, type, content, occurred_at, created_by
     FROM student_growth_records
     WHERE student_id = $1
     ORDER BY occurred_at DESC, id DESC
     LIMIT 100`,
    [studentId]
  )).rows.map((row) => ({
    ...row,
    id: Number(row.id),
    created_by: row.created_by === null ? null : Number(row.created_by)
  }));

  const orders = (await app.pool.query(
    `SELECT id, order_no, order_type, status, payment_status, receivable, received, arrears, created_at
     FROM orders
     WHERE student_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT 50`,
    [studentId]
  )).rows.map((row) => ({
    ...row,
    id: Number(row.id),
    receivable: Number(row.receivable),
    received: Number(row.received),
    arrears: Number(row.arrears)
  }));

  const accountRow = (await app.pool.query(
    'SELECT balance, points, updated_at FROM student_accounts WHERE student_id = $1',
    [studentId]
  )).rows[0];
  const account = accountRow
    ? { balance: Number(accountRow.balance), points: Number(accountRow.points), updatedAt: accountRow.updated_at }
    : { balance: 0, points: 0, updatedAt: null };

  return { student: toNumberedStudent(student), guardians, classes, scores, growthRecords, orders, account };
}
