import type { FastifyInstance } from 'fastify';
import { authGuard, requireRole } from '../auth/middleware.ts';
import { requireModule } from '../permissions/module_access.ts';
import { summarizeStudentScores } from '../scores/analytics.ts';

export async function scoreRoutes(app: FastifyInstance) {
  const read = [authGuard, requireModule('scores')];
  const write = [authGuard, requireModule('scores'), requireRole('admin')];

  async function teacherOwnsClass(request: any, classId: number) {
    if (request.user!.role !== 'teacher') return true;
    const row = await app.pool.query('SELECT 1 FROM classes WHERE id=$1 AND teacher_id=$2', [classId, request.user!.id]);
    return Boolean(row.rowCount);
  }

  async function canViewStudentAnalytics(request: any, studentId: number) {
    const user = request.user!;
    if (user.role === 'admin') return true;
    if (user.role === 'teacher') {
      const row = await app.pool.query(
        `SELECT 1 FROM class_students cs JOIN classes c ON c.id=cs.class_id
         WHERE cs.student_id=$1 AND c.teacher_id=$2 AND cs.left_at IS NULL LIMIT 1`,
        [studentId, user.id]
      );
      return Boolean(row.rowCount);
    }
    if (user.role === 'parent') {
      const row = await app.pool.query('SELECT 1 FROM parent_bindings WHERE parent_user_id=$1 AND student_id=$2', [user.id, studentId]);
      return Boolean(row.rowCount);
    }
    return user.role === 'student' && Number(user.studentId) === Number(studentId);
  }

  app.get('/sources', { preHandler: [authGuard] }, async () => {
    const rows = (await app.pool.query('SELECT * FROM score_sources ORDER BY COALESCE(parent_id,0), sort, id')).rows;
    const roots = rows.filter((row) => row.parent_id === null).map((root) => ({
      ...root, id: Number(root.id), parent_id: null,
      children: rows.filter((child) => Number(child.parent_id) === Number(root.id)).map((child) => ({ ...child, id: Number(child.id), parent_id: Number(child.parent_id) }))
    }));
    return roots;
  });

  app.post('/sources', { preHandler: [authGuard, requireRole('admin')] }, async (request, reply) => {
    const body = request.body as { parentId?: number; name?: string; sort?: number };
    if (!body.name?.trim()) return reply.code(400).send({ error: 'name required' });
    if (body.parentId) {
      const parent = await app.pool.query('SELECT 1 FROM score_sources WHERE id=$1', [body.parentId]);
      if (!parent.rowCount) return reply.code(404).send({ error: 'parent source not found' });
    }
    try {
      const result = await app.pool.query(
        `INSERT INTO score_sources (parent_id,name,sort) VALUES ($1,$2,$3) RETURNING *`,
        [body.parentId ?? null, body.name.trim(), body.sort ?? 0]
      );
      return result.rows[0];
    } catch (error: any) {
      if (error.code === '23505') return reply.code(409).send({ error: 'source name exists' });
      throw error;
    }
  });

  app.patch('/sources/:id', { preHandler: [authGuard, requireRole('admin')] }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const body = request.body as { name?: string; sort?: number; enabled?: boolean };
    try {
      const result = await app.pool.query(
        `UPDATE score_sources SET name=COALESCE($1,name),sort=COALESCE($2,sort),enabled=COALESCE($3,enabled),updated_at=now() WHERE id=$4 RETURNING *`,
        [body.name?.trim() || null, body.sort ?? null, body.enabled ?? null, id]
      );
      if (!result.rowCount) return reply.code(404).send({ error: 'score source not found' });
      return result.rows[0];
    } catch (error: any) {
      if (error.code === '23505') return reply.code(409).send({ error: 'source name exists' });
      throw error;
    }
  });

  app.delete('/sources/:id', { preHandler: [authGuard, requireRole('admin')] }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const children = (await app.pool.query('SELECT COUNT(*)::int AS count FROM score_sources WHERE parent_id=$1', [id])).rows[0].count;
    if (Number(children) > 0) return reply.code(409).send({ error: '请先删除下级来源' });
    const usage = (await app.pool.query('SELECT COUNT(*)::int AS count FROM student_scores WHERE source_id=$1', [id])).rows[0].count;
    if (Number(usage) > 0) return reply.code(409).send({ error: '该来源已被成绩使用，不能删除' });
    const result = await app.pool.query('DELETE FROM score_sources WHERE id=$1 RETURNING id', [id]);
    if (!result.rowCount) return reply.code(404).send({ error: 'score source not found' });
    return { ok: true };
  });

  app.get('/analytics/student/:studentId', { preHandler: [authGuard] }, async (request, reply) => {
    const studentId = Number((request.params as { studentId: string }).studentId);
    if (!(await canViewStudentAnalytics(request, studentId))) return reply.code(403).send({ error: 'forbidden' });
    const student = (await app.pool.query('SELECT id,name,gender,status FROM students WHERE id=$1', [studentId])).rows[0];
    if (!student) return reply.code(404).send({ error: 'student not found' });
    const classRow = (await app.pool.query(
      `SELECT c.id,c.name,c.grade FROM class_students cs JOIN classes c ON c.id=cs.class_id
       WHERE cs.student_id=$1 AND cs.left_at IS NULL ORDER BY cs.joined_at DESC LIMIT 1`,
      [studentId]
    )).rows[0];
    const params: unknown[] = [];
    const where = ["ss.score ~ '^-?[0-9]+(\\.[0-9]+)?$'"];
    if (classRow?.grade) { params.push(classRow.grade); where.push(`c.grade = $${params.length}`); }
    else { params.push(studentId); where.push(`ss.student_id = $${params.length}`); }
    const rows = (await app.pool.query(
      `SELECT ss.id,ss.student_id,ss.project_id,ss.exam_id,ss.exam_date::text AS exam_date,ss.score,ss.remark,ss.source,
              p.name AS project_name,e.name AS exam_name,c.id AS class_id,c.name AS class_name,c.grade,
              child.id AS source_id,child.name AS source_name,parent.slug AS source_parent_slug,parent.name AS source_parent_name,
              CASE WHEN parent.name IS NULL THEN child.name ELSE parent.name || ' / ' || child.name END AS source_path
       FROM student_scores ss
       JOIN exam_projects p ON p.id=ss.project_id
       JOIN exams e ON e.id=ss.exam_id
       LEFT JOIN classes c ON c.id=ss.class_id
       LEFT JOIN score_sources child ON child.id=ss.source_id
       LEFT JOIN score_sources parent ON parent.id=child.parent_id
       WHERE ${where.join(' AND ')}`,
      params
    )).rows;
    return {
      student: { ...student, id: Number(student.id), class_id: classRow?.id ? Number(classRow.id) : null, class_name: classRow?.name ?? null, grade: classRow?.grade ?? null },
      ...summarizeStudentScores(rows, studentId)
    };
  });

  app.get('/analytics/alerts', { preHandler: [authGuard] }, async (request, reply) => {
    const user = request.user!;
    if (!['admin', 'teacher'].includes(user.role)) return reply.code(403).send({ error: 'forbidden' });
    const teacherId = user.role === 'teacher' ? user.id : null;
    const rows = (await app.pool.query(
      `WITH numeric AS (
         SELECT ss.id,ss.student_id,ss.project_id,ss.exam_id,ss.exam_date::text AS exam_date,ss.score::numeric AS score,
                c.id AS class_id,c.name AS class_name,c.grade,p.name AS project_name,e.name AS exam_name,st.name AS student_name
         FROM student_scores ss
         JOIN students st ON st.id=ss.student_id
         JOIN classes c ON c.id=ss.class_id
         JOIN exam_projects p ON p.id=ss.project_id
         JOIN exams e ON e.id=ss.exam_id
         WHERE ss.score ~ '^-?[0-9]+(\\.[0-9]+)?$' AND ($1::bigint IS NULL OR c.teacher_id=$1)
       ), ranked AS (
         SELECT numeric.*,
           ROW_NUMBER() OVER (PARTITION BY student_id ORDER BY exam_date DESC,id DESC) AS rn,
           LAG(score) OVER (PARTITION BY student_id ORDER BY exam_date,id) AS previous_score,
           AVG(score) OVER (PARTITION BY project_id,exam_id,exam_date,class_id) AS class_average
         FROM numeric
       )
       SELECT *, score-previous_score AS change FROM ranked
       WHERE rn=1 AND previous_score IS NOT NULL AND (score-previous_score <= -5 OR score < class_average-5)
       ORDER BY (score-previous_score) ASC, score ASC LIMIT 100`,
      [teacherId]
    )).rows.map((row) => ({
      ...row,
      student_id: Number(row.student_id), class_id: Number(row.class_id), score: Number(row.score),
      previous_score: Number(row.previous_score), change: Number(row.change), class_average: Number(row.class_average),
      level: Number(row.change) <= -10 ? 'danger' : 'warning',
      title: Number(row.change) <= -5 ? '成绩下滑预警' : '低于班级平均分'
    }));
    return rows;
  });

  app.get('/analytics/class-ratings', { preHandler: [authGuard] }, async (request, reply) => {
    const user = request.user!;
    if (!['admin', 'teacher'].includes(user.role)) return reply.code(403).send({ error: 'forbidden' });
    const query = request.query as { classId?: string; limit?: string };
    const params: unknown[] = [user.role === 'teacher' ? user.id : null];
    const where = ["ss.score ~ '^-?[0-9]+(\\.[0-9]+)?$'", '($1::bigint IS NULL OR c.teacher_id=$1)'];
    if (query.classId) { params.push(Number(query.classId)); where.push(`c.id=$${params.length}`); }
    const limit = Math.min(500, Math.max(1, Number(query.limit ?? 200)));
    const rows = (await app.pool.query(
      `SELECT c.id AS class_id,c.name AS class_name,c.grade,c.teacher_id,u.display_name AS teacher_name,
              ss.project_id,p.name AS project_name,ss.exam_id,e.name AS exam_name,ss.exam_date::text AS exam_date,
              ROUND(AVG(ss.score::numeric),2)::float AS average_score,
              MIN(ss.score::numeric)::float AS min_score,MAX(ss.score::numeric)::float AS max_score,
              COUNT(*)::int AS participant_count
       FROM student_scores ss
       JOIN classes c ON c.id=ss.class_id
       JOIN exam_projects p ON p.id=ss.project_id
       JOIN exams e ON e.id=ss.exam_id
       LEFT JOIN users u ON u.id=c.teacher_id
       WHERE ${where.join(' AND ')}
       GROUP BY c.id,c.name,c.grade,c.teacher_id,u.display_name,ss.project_id,p.name,ss.exam_id,e.name,ss.exam_date
       ORDER BY ss.exam_date DESC,c.name LIMIT $${params.length + 1}`,
      [...params, limit]
    )).rows.map((row) => {
      const average = Number(row.average_score);
      const rating = average >= 95 ? 'S班' : average >= 90 ? 'A+班' : '启航班';
      return {
        ...row,
        class_id: Number(row.class_id), teacher_id: Number(row.teacher_id),
        average_score: average, min_score: Number(row.min_score), max_score: Number(row.max_score),
        participant_count: Number(row.participant_count), rating
      };
    });
    return {
      rows,
      summary: {
        total: rows.length,
        s: rows.filter((row) => row.rating === 'S班').length,
        a: rows.filter((row) => row.rating === 'A+班').length,
        qihang: rows.filter((row) => row.rating === '启航班').length
      }
    };
  });

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
      source?: string; sourceId?: number; scores?: Array<{ studentId?: number; score?: string; remark?: string }>;
    };
    if (!body.projectId || !body.examId || !body.examDate || !Array.isArray(body.scores)) {
      return reply.code(400).send({ error: 'projectId, examId, examDate, scores required' });
    }
    if (body.classId && !(await teacherOwnsClass(request, body.classId))) return reply.code(403).send({ error: 'class forbidden' });
    const client = await app.pool.connect();
    try {
      await client.query('BEGIN');
      let count = 0;
      for (const item of body.scores) {
        if (!item.studentId) continue;
        await client.query(
          `INSERT INTO student_scores (student_id, project_id, exam_id, class_id, score, source, source_id, exam_date, remark, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           ON CONFLICT (student_id, project_id, exam_id, exam_date)
           DO UPDATE SET score = EXCLUDED.score, remark = EXCLUDED.remark, class_id = EXCLUDED.class_id,
             source = EXCLUDED.source, source_id = EXCLUDED.source_id, created_by = EXCLUDED.created_by`,
          [item.studentId, body.projectId, body.examId, body.classId ?? null,
           item.score ?? null, body.source ?? 'teacher', body.sourceId ?? null, body.examDate, item.remark ?? null, request.user!.id]
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
    if (request.user!.role === 'teacher') {
      const allowed = (await app.pool.query('SELECT COUNT(*)::int AS count FROM classes WHERE id=ANY($1::bigint[]) AND teacher_id=$2', [classIds, request.user!.id])).rows[0].count;
      if (Number(allowed) !== classIds.length) return reply.code(403).send({ error: 'class forbidden' });
    }
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
    const teacherScope = request.user!.role === 'teacher' ? ' AND EXISTS (SELECT 1 FROM classes tc WHERE tc.id = ss.class_id AND tc.teacher_id = $6)' : '';
    const params: unknown[] = [query.classId ? Number(query.classId) : null, query.projectId ? Number(query.projectId) : null,
      query.examId ? Number(query.examId) : null, query.start ?? null, query.end ?? null];
    if (request.user!.role === 'teacher') params.push(request.user!.id);
    const rows = (await app.pool.query(
      `SELECT st.name AS student_name, p.name AS project_name, e.name AS exam_name,
              ss.score, ss.source, ss.exam_date::text AS exam_date, c.name AS class_name, ss.remark,
              child.name AS source_name, parent.name AS source_parent_name,
              CASE WHEN parent.name IS NULL THEN child.name ELSE parent.name || ' / ' || child.name END AS source_path
       FROM student_scores ss
       JOIN students st ON st.id = ss.student_id
       JOIN exam_projects p ON p.id = ss.project_id
       JOIN exams e ON e.id = ss.exam_id
       LEFT JOIN classes c ON c.id = ss.class_id
       LEFT JOIN score_sources child ON child.id = ss.source_id
       LEFT JOIN score_sources parent ON parent.id = child.parent_id
       WHERE ($1::bigint IS NULL OR ss.class_id = $1)
         AND ($2::bigint IS NULL OR ss.project_id = $2)
         AND ($3::bigint IS NULL OR ss.exam_id = $3)
         AND ($4::date IS NULL OR ss.exam_date >= $4::date)
         AND ($5::date IS NULL OR ss.exam_date <= $5::date)${teacherScope}
       ORDER BY ss.exam_date DESC`,
      params
    )).rows;
    const header = 'student_name,project_name,exam_name,score,source,source_path,exam_date,class_name,remark';
    const lines = rows.map((r: any) => [r.student_name, r.project_name, r.exam_name, r.score ?? '', r.source,
      r.source_path ?? '', String(r.exam_date).slice(0, 10), r.class_name ?? '', r.remark ?? ''].join(','));
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
    const teacherScope = request.user!.role === 'teacher' ? ` AND EXISTS (SELECT 1 FROM classes tc WHERE tc.id = ss.class_id AND tc.teacher_id = $7)` : '';
    const where = `
      WHERE ($1::bigint IS NULL OR ss.student_id = $1)
        AND ($2::bigint IS NULL OR ss.class_id = $2)
        AND ($3::bigint IS NULL OR ss.project_id = $3)
        AND ($4::bigint IS NULL OR ss.exam_id = $4)
        AND ($5::date IS NULL OR ss.exam_date >= $5::date)
        AND ($6::date IS NULL OR ss.exam_date <= $6::date)${teacherScope}`;
    const params: unknown[] = [
      query.studentId ? Number(query.studentId) : null,
      query.classId ? Number(query.classId) : null,
      query.projectId ? Number(query.projectId) : null,
      query.examId ? Number(query.examId) : null,
      query.start ?? null, query.end ?? null
    ];
    if (request.user!.role === 'teacher') params.push(request.user!.id);
    const rows = (await app.pool.query(
      `SELECT ss.*, ss.exam_date::text AS exam_date, st.name AS student_name, p.name AS project_name, e.name AS exam_name, c.name AS class_name,
              child.name AS source_name, parent.name AS source_parent_name,
              CASE WHEN parent.name IS NULL THEN child.name ELSE parent.name || ' / ' || child.name END AS source_path
       FROM student_scores ss
       JOIN students st ON st.id = ss.student_id
       JOIN exam_projects p ON p.id = ss.project_id
       JOIN exams e ON e.id = ss.exam_id
       LEFT JOIN classes c ON c.id = ss.class_id
       LEFT JOIN score_sources child ON child.id = ss.source_id
       LEFT JOIN score_sources parent ON parent.id = child.parent_id
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
