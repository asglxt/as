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
      const result = await app.pool.query(
        `SELECT s.*, advisor.display_name AS advisor_name FROM students s
         LEFT JOIN users advisor ON advisor.id=s.advisor_id ORDER BY s.id`
      );
      return result.rows;
    }
    if (user.role === 'teacher') {
      const result = await app.pool.query(
        `SELECT DISTINCT s.*, (SELECT display_name FROM users advisor WHERE advisor.id=s.advisor_id) AS advisor_name
         FROM students s
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
      classId?: string;
      phone?: string;
      advisorId?: string;
      source?: string;
      enrollmentStart?: string;
      enrollmentEnd?: string;
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
      where.push(`(s.name ILIKE $${params.length} OR COALESCE(s.student_no, '') ILIKE $${params.length} OR COALESCE(s.guardian_phone, '') ILIKE $${params.length}
        OR EXISTS (SELECT 1 FROM student_guardians sg WHERE sg.student_id=s.id AND (COALESCE(sg.name,'') ILIKE $${params.length} OR COALESCE(sg.phone,'') ILIKE $${params.length})))`);
    }
    if (query.phone?.trim()) {
      params.push(`%${query.phone.trim()}%`);
      where.push(`(COALESCE(s.guardian_phone, '') ILIKE $${params.length}
        OR EXISTS (SELECT 1 FROM student_guardians sg WHERE sg.student_id=s.id AND COALESCE(sg.phone,'') ILIKE $${params.length}))`);
    }
    if (query.classId) {
      params.push(Number(query.classId));
      where.push(`EXISTS (
        SELECT 1 FROM class_students cs
        WHERE cs.student_id = s.id AND cs.class_id = $${params.length} AND cs.left_at IS NULL
      )`);
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
    if (query.advisorId) {
      params.push(Number(query.advisorId));
      where.push(`s.advisor_id = $${params.length}`);
    }
    if (query.source?.trim()) {
      params.push(query.source.trim());
      where.push(`s.source = $${params.length}`);
    }
    if (query.enrollmentStart) {
      params.push(query.enrollmentStart);
      where.push(`s.enrollment_date >= $${params.length}::date`);
    }
    if (query.enrollmentEnd) {
      params.push(query.enrollmentEnd);
      where.push(`s.enrollment_date <= $${params.length}::date`);
    }

    const baseWhere = where.join(' AND ');
    const summary = (await app.pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE s.status = 'active')::int AS active,
              COUNT(*) FILTER (WHERE s.status = 'inactive')::int AS inactive,
              COUNT(*) FILTER (WHERE s.status = 'graduated')::int AS graduated,
              COUNT(*) FILTER (WHERE NOT (
                COALESCE((SELECT sg.phone FROM student_guardians sg WHERE sg.student_id=s.id ORDER BY sg.is_primary DESC,sg.id LIMIT 1), s.guardian_phone) IS NOT NULL
                AND s.school_name IS NOT NULL AND s.grade IS NOT NULL AND s.address IS NOT NULL
                AND s.advisor_id IS NOT NULL AND s.enrollment_date IS NOT NULL
              ))::int AS profile_incomplete,
              COUNT(*) FILTER (WHERE EXISTS (
                SELECT 1 FROM orders o WHERE o.student_id=s.id AND o.status <> 'cancelled' AND o.arrears > 0
              ))::int AS arrears
       FROM students s WHERE ${baseWhere}`,
      params
    )).rows[0];
    const listParams = [...params, pageSize, (page - 1) * pageSize];
    const items = (await app.pool.query(
      `SELECT s.*, camp.name AS campus_name, advisor.display_name AS advisor_name,
              (SELECT sg.name FROM student_guardians sg WHERE sg.student_id=s.id ORDER BY sg.is_primary DESC,sg.id LIMIT 1) AS primary_guardian_name,
              COALESCE((SELECT sg.phone FROM student_guardians sg WHERE sg.student_id=s.id ORDER BY sg.is_primary DESC,sg.id LIMIT 1), s.guardian_phone) AS primary_guardian_phone,
              CASE WHEN s.birthday IS NULL THEN NULL ELSE DATE_PART('year', AGE(CURRENT_DATE, s.birthday))::int END AS age,
              (
                COALESCE((SELECT sg.phone FROM student_guardians sg WHERE sg.student_id=s.id ORDER BY sg.is_primary DESC,sg.id LIMIT 1), s.guardian_phone) IS NOT NULL
                AND s.school_name IS NOT NULL AND s.grade IS NOT NULL AND s.address IS NOT NULL
                AND s.advisor_id IS NOT NULL AND s.enrollment_date IS NOT NULL
              ) AS profile_complete,
              EXISTS (SELECT 1 FROM orders o WHERE o.student_id=s.id AND o.status <> 'cancelled' AND o.arrears > 0) AS has_arrears,
              COALESCE((
                SELECT STRING_AGG(c.name, '、' ORDER BY c.id)
                FROM class_students cs
                JOIN classes c ON c.id = cs.class_id
                WHERE cs.student_id = s.id AND cs.left_at IS NULL
              ), '') AS class_names
       FROM students s
       LEFT JOIN campuses camp ON camp.id = s.campus_id
       LEFT JOIN users advisor ON advisor.id = s.advisor_id
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
        graduated: Number(summary.graduated),
        profileIncomplete: Number(summary.profile_incomplete),
        arrears: Number(summary.arrears)
      }
    };
  });

  app.post('/batch', { preHandler: [authGuard, requireRole('admin')] }, async (request, reply) => {
    const body = request.body as { ids?: number[]; status?: string; campusId?: number; advisorId?: number };
    const ids = (body.ids ?? []).map(Number).filter((id) => Number.isInteger(id) && id > 0);
    if (!ids.length) return reply.code(400).send({ error: 'ids required' });
    if (body.status && !STUDENT_STATUSES.has(body.status)) return reply.code(400).send({ error: 'invalid status' });
    if (!body.status && !body.campusId && !body.advisorId) return reply.code(400).send({ error: 'status, campusId or advisorId required' });

    const result = await app.pool.query(
      `UPDATE students
       SET status = COALESCE($1, status),
           campus_id = COALESCE($2, campus_id),
           advisor_id = COALESCE($3, advisor_id)
       WHERE id = ANY($4::bigint[])`,
      [body.status ?? null, body.campusId ?? null, body.advisorId ?? null, ids]
    );
    await app.pool.query(
      `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, detail)
       SELECT $1, 'student.batch_update', 'student', id,
              jsonb_strip_nulls(jsonb_build_object('status', $2::text, 'campusId', $3::bigint, 'advisorId', $4::bigint))
       FROM unnest($5::bigint[]) AS id`,
      [request.user!.id, body.status ?? null, body.campusId ?? null, body.advisorId ?? null, ids]
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
      studentNo?: string;
      schoolName?: string;
      grade?: string;
      address?: string;
      advisorId?: number;
      guardians?: Array<{
        name: string;
        relation?: string;
        phone?: string;
        wechat?: string;
        isPrimary?: boolean;
        isEmergency?: boolean;
        remark?: string;
      }>;
    };
    if (!body.campusId || !body.name?.trim()) {
      return reply.code(400).send({ error: 'campusId and name required' });
    }
    const result = await app.pool.query(
      `INSERT INTO students (
        campus_id, name, guardian_phone, gender, birthday, enrollment_date, discount, source, notes,
        student_no, school_name, grade, address, advisor_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
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
        body.notes ?? null,
        body.studentNo?.trim() || null,
        body.schoolName?.trim() || null,
        body.grade?.trim() || null,
        body.address?.trim() || null,
        body.advisorId ?? null
      ]
    );
    const student = result.rows[0];
    for (const guardian of body.guardians ?? []) {
      if (!guardian.name?.trim()) continue;
      await app.pool.query(
        `INSERT INTO student_guardians (student_id, name, relation, phone, wechat, is_primary, is_emergency, remark)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          student.id,
          guardian.name.trim(),
          guardian.relation ?? null,
          guardian.phone ?? null,
          guardian.wechat ?? null,
          Boolean(guardian.isPrimary),
          Boolean(guardian.isEmergency),
          guardian.remark ?? null
        ]
      );
    }
    await app.pool.query(
      `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, detail)
       VALUES ($1, 'student.create', 'student', $2, jsonb_build_object('name', $3::text))`,
      [request.user!.id, student.id, student.name]
    );
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
    await app.pool.query(
      `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, detail)
       VALUES ($1, 'student.growth.create', 'student', $2, jsonb_build_object('type', $3::text))`,
      [request.user!.id, studentId, body.type ?? 'note']
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
      studentNo?: string;
      schoolName?: string;
      grade?: string;
      address?: string;
      advisorId?: number;
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
        notes = COALESCE($10, notes),
        student_no = COALESCE($11, student_no),
        school_name = COALESCE($12, school_name),
        grade = COALESCE($13, grade),
        address = COALESCE($14, address),
        advisor_id = COALESCE($15, advisor_id)
       WHERE id = $16
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
        body.studentNo?.trim() || null,
        body.schoolName?.trim() || null,
        body.grade?.trim() || null,
        body.address?.trim() || null,
        body.advisorId ?? null,
        id
      ]
    );
    if (!result.rowCount) return reply.code(404).send({ error: 'student not found' });
    await app.pool.query(
      `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, detail)
       VALUES ($1, 'student.update', 'student', $2, $3::jsonb)`,
      [request.user!.id, id, JSON.stringify(body)]
    );
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
    await app.pool.query(
      `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, detail)
       VALUES ($1, 'student.class.add', 'student', $2, jsonb_build_object('classId', $3::bigint))`,
      [request.user!.id, studentId, body.classId]
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
      await client.query(
        `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, detail)
         VALUES ($1, 'student.transfer', 'student', $2, jsonb_build_object('fromClassId', $3::bigint, 'toClassId', $4::bigint))`,
        [request.user!.id, studentId, body.fromClassId, body.toClassId]
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
    `SELECT s.*, camp.name AS campus_name, advisor.display_name AS advisor_name
     FROM students s
     LEFT JOIN campuses camp ON camp.id = s.campus_id
     LEFT JOIN users advisor ON advisor.id = s.advisor_id
     WHERE s.id = $1`,
    [studentId]
  )).rows[0];
  if (!student) return null;

  const guardians = (await app.pool.query(
    `SELECT id, name, relation, phone, wechat, is_primary, is_emergency, remark
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

  const attendanceRecords = (await app.pool.query(
    `SELECT ar.id, ar.status, ar.hours_deducted::float8 AS hours_deducted, ar.remark, ar.created_at,
            sch.schedule_date::text AS schedule_date, sch.start_time::text AS start_time,
            c.name AS class_name, l.name AS lesson_name, u.display_name AS teacher_name
     FROM attendance_records ar
     JOIN teaching_logs tl ON tl.id = ar.teaching_log_id
     JOIN classes c ON c.id = tl.class_id
     LEFT JOIN lessons l ON l.id = c.lesson_id
     LEFT JOIN users u ON u.id = tl.teacher_id
     LEFT JOIN schedules sch ON sch.id = tl.schedule_id
     WHERE ar.student_id = $1
     ORDER BY COALESCE(sch.schedule_date, tl.taught_at::date, ar.created_at::date) DESC, ar.id DESC
     LIMIT 100`,
    [studentId]
  )).rows.map((row) => ({ ...row, id: Number(row.id) }));

  const scores = (await app.pool.query(
    `SELECT ss.id, ss.score, ss.source, ss.exam_date::text AS exam_date, ss.remark,
            p.name AS project_name, e.name AS exam_name, c.name AS class_name,
            child.name AS source_name, parent.name AS source_parent_name,
            CASE WHEN parent.name IS NULL THEN child.name ELSE parent.name || ' / ' || child.name END AS source_path
     FROM student_scores ss
     JOIN exam_projects p ON p.id = ss.project_id
     JOIN exams e ON e.id = ss.exam_id
     LEFT JOIN classes c ON c.id = ss.class_id
     LEFT JOIN score_sources child ON child.id = ss.source_id
     LEFT JOIN score_sources parent ON parent.id = child.parent_id
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

  const auditLogs = (await app.pool.query(
    `SELECT al.id, al.action, al.detail, al.created_at, u.display_name AS actor_name
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.actor_id
     WHERE al.entity_type = 'student' AND al.entity_id = $1
     ORDER BY al.created_at DESC, al.id DESC
     LIMIT 100`,
    [studentId]
  )).rows.map((row) => ({ ...row, id: Number(row.id) }));

  return { student: toNumberedStudent(student), guardians, classes, attendanceRecords, scores, growthRecords, orders, account, auditLogs };
}
