import { parse } from 'csv-parse/sync';
import type { FastifyInstance } from 'fastify';
import { authGuard, requireRole } from '../auth/middleware.ts';
import { writeAudit } from '../audit.ts';
import { guardiansFromSchoolPalRow, mapSchoolPalStudentRow, schoolPalStudentTemplate } from '../imports/schoolpal_students.ts';

type CsvRow = Record<string, string>;

async function saveJob(
  app: FastifyInstance,
  actorId: number,
  kind: 'students' | 'classes' | 'scores',
  totalRows: number,
  errorRows: number,
  errors: Array<{ row: number; column: string; message: string }>
) {
  const status = totalRows > 0 && errorRows === totalRows ? 'failed' : 'done';
  const result = await app.pool.query(
    `INSERT INTO import_jobs (kind, status, total_rows, error_rows, errors, created_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [kind, status, totalRows, errorRows, JSON.stringify(errors), actorId]
  );
  return result.rows[0];
}

function parseRows(csvText: string): CsvRow[] {
  return parse(csvText, { columns: true, skip_empty_lines: true, trim: true }) as CsvRow[];
}

async function resolveCampusId(app: FastifyInstance, campusName?: string) {
  if (campusName?.trim()) {
    const campus = (await app.pool.query('SELECT id FROM campuses WHERE name = $1', [campusName.trim()])).rows[0];
    return campus?.id ?? null;
  }
  const campuses = (await app.pool.query('SELECT id FROM campuses ORDER BY id LIMIT 2')).rows;
  return campuses.length === 1 ? campuses[0].id : null;
}

async function upsertStudentFromMappedRow(app: FastifyInstance, row: Record<string, string>, _actorId: number) {
  const campusId = await resolveCampusId(app, row.campus_name);
  if (!campusId) throw new Error(row.campus_name ? `校区不存在: ${row.campus_name}` : '无法确定报读校区');
  const existing = row.student_no
    ? (await app.pool.query('SELECT id FROM students WHERE student_no = $1', [row.student_no])).rows[0]
    : null;
  let studentId: number;
  if (existing) {
    await app.pool.query(
      `UPDATE students SET campus_id = $1, name = $2, guardian_phone = COALESCE($3, guardian_phone),
        gender = COALESCE($4, gender), birthday = COALESCE($5::date, birthday),
        enrollment_date = COALESCE($6::date, enrollment_date), discount = COALESCE($7, discount),
        source = COALESCE($8, source), notes = COALESCE($9, notes), school_name = COALESCE($10, school_name),
        grade = COALESCE($11, grade), address = COALESCE($12, address), status = COALESCE($13, status)
       WHERE id = $14`,
      [campusId, row.name, row.guardian_phone || null, row.gender || null, row.birthday || null,
       row.enrollment_date || null, row.discount || null, row.source || null, row.notes || null,
       row.school_name || null, row.grade || null, row.address || null, row.status || null, existing.id]
    );
    studentId = Number(existing.id);
  } else {
    const inserted = await app.pool.query(
      `INSERT INTO students (
        campus_id, name, guardian_phone, gender, birthday, enrollment_date, discount, source, notes,
        student_no, school_name, grade, address, status
      ) VALUES ($1,$2,$3,$4,$5::date,$6::date,$7,$8,$9,$10,$11,$12,$13,COALESCE($14,'active'))
      RETURNING id`,
      [campusId, row.name, row.guardian_phone || null, row.gender || null, row.birthday || null,
       row.enrollment_date || null, row.discount || null, row.source || null, row.notes || null,
       row.student_no || null, row.school_name || null, row.grade || null, row.address || null, row.status || null]
    );
    studentId = Number(inserted.rows[0].id);
  }
  const guardians = guardiansFromSchoolPalRow(row);
  if (guardians.length) {
    await app.pool.query('DELETE FROM student_guardians WHERE student_id = $1', [studentId]);
    for (const guardian of guardians) {
      await app.pool.query(
        `INSERT INTO student_guardians (student_id, name, relation, phone, wechat, is_primary, is_emergency)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [studentId, guardian.name, guardian.relation, guardian.phone, guardian.wechat, guardian.isPrimary, guardian.isEmergency]
      );
    }
  }
  return studentId;
}

export async function importRoutes(app: FastifyInstance) {
  const guard = [authGuard, requireRole('admin')];

  app.get('/students/template', { preHandler: guard }, async (_request, reply) => {
    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', 'attachment; filename="schoolpal-students-template.csv"');
    return `\ufeff${schoolPalStudentTemplate()}`;
  });

  app.post('/students/preview', { preHandler: guard }, async (request, reply) => {
    const body = request.body as { csv?: string };
    if (!body.csv) return reply.code(400).send({ error: 'csv required' });
    const rows = parseRows(body.csv);
    const mappedRows = rows.map(mapSchoolPalStudentRow);
    const errors: Array<{ row: number; column: string; message: string }> = [];
    for (const [index, row] of mappedRows.entries()) {
      if (!row.name) errors.push({ row: index + 2, column: 'name', message: '姓名不能为空' });
      if (!row.campus_name) errors.push({ row: index + 2, column: 'campus_name', message: '报读校区不能为空' });
    }
    const errorRows = new Set(errors.map((error) => error.row)).size;
    return {
      total_rows: rows.length,
      valid_rows: rows.length - errorRows,
      error_rows: errorRows,
      errors,
      mapped_headers: [...new Set(mappedRows.flatMap((row) => Object.keys(row)))],
      preview: mappedRows.slice(0, 10)
    };
  });

  app.post('/students', { preHandler: guard }, async (request, reply) => {
    const body = request.body as { csv?: string };
    if (!body.csv) return reply.code(400).send({ error: 'csv required' });
    const rows = parseRows(body.csv);
    const errors: Array<{ row: number; column: string; message: string }> = [];
    let valid = 0;
    for (const [index, sourceRow] of rows.entries()) {
      const line = index + 2;
      const row = mapSchoolPalStudentRow(sourceRow);
      if (!row.name) {
        errors.push({ row: line, column: 'name', message: '姓名不能为空' });
        continue;
      }
      try {
        await upsertStudentFromMappedRow(app, row, request.user!.id);
        valid += 1;
      } catch (error: any) {
        errors.push({ row: line, column: 'campus_name', message: error.message });
        continue;
      }
    }
    const job = await saveJob(app, request.user!.id, 'students', rows.length, errors.length, errors);
    return { ...job, imported_rows: valid };
  });

  app.post('/classes', { preHandler: guard }, async (request, reply) => {
    const body = request.body as { csv?: string };
    if (!body.csv) return reply.code(400).send({ error: 'csv required' });
    const rows = parseRows(body.csv);
    const errors: Array<{ row: number; column: string; message: string }> = [];
    let valid = 0;
    for (const [index, row] of rows.entries()) {
      const line = index + 2;
      const campus = (await app.pool.query('SELECT id FROM campuses WHERE name = $1', [row.campus_name?.trim()])).rows[0];
      if (!campus) {
        errors.push({ row: line, column: 'campus_name', message: `校区不存在: ${row.campus_name}` });
        continue;
      }
      if (!row.name?.trim() || !row.subject?.trim() || !row.grade?.trim()) {
        errors.push({ row: line, column: 'name/subject/grade', message: '班级、科目、年级不能为空' });
        continue;
      }
      let teacherId: number | null = null;
      if (row.teacher_username) {
        const teacher = (await app.pool.query('SELECT id FROM users WHERE username = $1 AND role = $2', [row.teacher_username, 'teacher'])).rows[0];
        if (!teacher) {
          errors.push({ row: line, column: 'teacher_username', message: `教师不存在: ${row.teacher_username}` });
          continue;
        }
        teacherId = teacher.id;
      }
      await app.pool.query(
        'INSERT INTO classes (campus_id, name, subject, grade, schedule, teacher_id) VALUES ($1, $2, $3, $4, $5, $6)',
        [campus.id, row.name.trim(), row.subject.trim(), row.grade.trim(), row.schedule ?? null, teacherId]
      );
      valid += 1;
    }
    const job = await saveJob(app, request.user!.id, 'classes', rows.length, errors.length, errors);
    return { ...job, imported_rows: valid };
  });

  app.post('/scores', { preHandler: guard }, async (request, reply) => {
    const body = request.body as { csv?: string };
    if (!body.csv) return reply.code(400).send({ error: 'csv required' });
    const rows = parseRows(body.csv);
    const errors: Array<{ row: number; column: string; message: string }> = [];
    let valid = 0;
    for (const [index, row] of rows.entries()) {
      const line = index + 2;
      const student = (await app.pool.query('SELECT id FROM students WHERE name = $1', [row.student_name?.trim()])).rows[0];
      if (!student) {
        errors.push({ row: line, column: 'student_name', message: `学员不存在: ${row.student_name}` });
        continue;
      }
      const classRow = (await app.pool.query('SELECT id FROM classes WHERE name = $1', [row.class_name?.trim()])).rows[0];
      if (!classRow) {
        errors.push({ row: line, column: 'class_name', message: `班级不存在: ${row.class_name}` });
        continue;
      }
      const enrolled = (await app.pool.query(
        'SELECT 1 FROM class_students WHERE class_id = $1 AND student_id = $2 AND left_at IS NULL',
        [classRow.id, student.id]
      )).rows[0];
      if (!enrolled) {
        errors.push({ row: line, column: 'class_name', message: `学员不在班级: ${row.student_name}` });
        continue;
      }
      const project = (await app.pool.query('SELECT id FROM exam_projects WHERE name = $1', [row.project_name?.trim()])).rows[0];
      if (!project) {
        errors.push({ row: line, column: 'project_name', message: `项目不存在: ${row.project_name}` });
        continue;
      }
      const exam = (await app.pool.query('SELECT id FROM exams WHERE name = $1', [row.exam_name?.trim()])).rows[0];
      if (!exam) {
        errors.push({ row: line, column: 'exam_name', message: `考试不存在: ${row.exam_name}` });
        continue;
      }
      if (!row.exam_date || Number.isNaN(Date.parse(row.exam_date))) {
        errors.push({ row: line, column: 'exam_date', message: '考试日期格式应为 YYYY-MM-DD' });
        continue;
      }
      const source = ['teacher', 'import', 'registration'].includes(row.source) ? row.source : 'import';
      await app.pool.query(
        `INSERT INTO student_scores (student_id, project_id, exam_id, class_id, score, source, exam_date, remark, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (student_id, project_id, exam_id, exam_date)
         DO UPDATE SET score = EXCLUDED.score, remark = EXCLUDED.remark, class_id = EXCLUDED.class_id,
           source = EXCLUDED.source, created_by = EXCLUDED.created_by`,
        [student.id, project.id, exam.id, classRow.id, row.score ?? null, source, row.exam_date, row.remark ?? null, request.user!.id]
      );
      valid += 1;
    }
    const job = await saveJob(app, request.user!.id, 'scores', rows.length, errors.length, errors);
    return { ...job, imported_rows: valid };
  });
  app.get('/', { preHandler: guard }, async (request) => {
    const result = await app.pool.query('SELECT * FROM import_jobs ORDER BY created_at DESC LIMIT 50');
    return result.rows;
  });

  app.get('/:id', { preHandler: guard }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const result = await app.pool.query('SELECT * FROM import_jobs WHERE id = $1', [id]);
    if (!result.rowCount) return reply.code(404).send({ error: 'import job not found' });
    return result.rows[0];
  });
}
