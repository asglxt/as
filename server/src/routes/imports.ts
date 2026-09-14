import { parse } from 'csv-parse/sync';
import type { FastifyInstance } from 'fastify';
import { authGuard, requireRole } from '../auth/middleware.ts';
import { writeAudit } from '../audit.ts';

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

export async function importRoutes(app: FastifyInstance) {
  const guard = [authGuard, requireRole('admin')];

  app.post('/students', { preHandler: guard }, async (request, reply) => {
    const body = request.body as { csv?: string };
    if (!body.csv) return reply.code(400).send({ error: 'csv required' });
    const rows = parseRows(body.csv);
    const errors: Array<{ row: number; column: string; message: string }> = [];
    let valid = 0;
    for (const [index, row] of rows.entries()) {
      const line = index + 2;
      const name = row.name?.trim();
      const campusName = row.campus_name?.trim();
      if (!name) {
        errors.push({ row: line, column: 'name', message: '姓名不能为空' });
        continue;
      }
      const campus = (await app.pool.query('SELECT id FROM campuses WHERE name = $1', [campusName])).rows[0];
      if (!campus) {
        errors.push({ row: line, column: 'campus_name', message: `校区不存在: ${campusName}` });
        continue;
      }
      await app.pool.query('INSERT INTO students (campus_id, name, guardian_phone) VALUES ($1, $2, $3)', [
        campus.id, name, row.guardian_phone ?? null
      ]);
      valid += 1;
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
