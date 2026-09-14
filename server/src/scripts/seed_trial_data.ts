import { loadConfig } from '../config.ts';
import { createPool } from '../db.ts';
import { hashPassword } from '../auth/password.ts';
import { buildTrialDataPlan } from '../trial_data.ts';

const config = {
  classesPerCampus: Number(process.env.TRIAL_CLASSES_PER_CAMPUS ?? 10),
  teachersPerCampus: Number(process.env.TRIAL_TEACHERS_PER_CAMPUS ?? 5),
  studentsPerClass: Number(process.env.TRIAL_STUDENTS_PER_CLASS ?? 20)
};
const teacherPassword = process.env.TRIAL_TEACHER_PASSWORD ?? 'demo123456';
const pool = createPool(loadConfig().databaseUrl);

async function main() {
  const campuses = (await pool.query(
    "SELECT id, name, code FROM campuses WHERE status = 'active' ORDER BY sort, id"
  )).rows.map((row) => ({ id: Number(row.id), name: row.name, code: row.code }));
  if (!campuses.length) throw new Error('no active campuses found');

  const plan = buildTrialDataPlan(campuses, config);
  const passwordHash = await hashPassword(teacherPassword);
  const subjectRows = (await pool.query('SELECT id, name FROM subjects')).rows;
  const subjectIds = new Map(subjectRows.map((row) => [row.name, Number(row.id)]));
  const teacherRole = (await pool.query("SELECT id FROM roles WHERE name = '教师' LIMIT 1")).rows[0];
  const startDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const summary = { campuses: 0, teachers: 0, classrooms: 0, lessons: 0, classes: 0, students: 0 };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const campus of plan) {
      summary.campuses += 1;
      await client.query("UPDATE campuses SET code = COALESCE(NULLIF(code, ''), $1), updated_at = now() WHERE id = $2", [campus.campusCode, campus.campusId]);

      const teacherIds: number[] = [];
      for (const teacher of campus.teachers) {
        const result = await client.query(
          `INSERT INTO users (username, password_hash, display_name, role, campus_id, employee_no, department, is_teacher, employment_status)
           VALUES ($1,$2,$3,'teacher',$4,$5,'教学部',true,'active')
           ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash, display_name = EXCLUDED.display_name,
             role = 'teacher', campus_id = EXCLUDED.campus_id, employee_no = EXCLUDED.employee_no,
             department = '教学部', is_teacher = true, employment_status = 'active'
           RETURNING id`,
          [teacher.username, passwordHash, teacher.displayName, campus.campusId, teacher.employeeNo]
        );
        const teacherId = Number(result.rows[0].id);
        teacherIds.push(teacherId);
        if (teacherRole) await client.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [teacherId, teacherRole.id]);
        summary.teachers += 1;
      }

      const classroomIds: number[] = [];
      for (const classroom of campus.classrooms) {
        const result = await client.query(
          `INSERT INTO classrooms (campus_id, name, capacity, status) VALUES ($1,$2,$3,'active')
           ON CONFLICT (campus_id, name) DO UPDATE SET capacity = EXCLUDED.capacity, status = 'active'
           RETURNING id`,
          [campus.campusId, classroom.name, classroom.capacity]
        );
        classroomIds.push(Number(result.rows[0].id));
        summary.classrooms += 1;
      }

      const lessonIds: number[] = [];
      for (const lesson of campus.lessons) {
        const existing = await client.query('SELECT id FROM lessons WHERE campus_id = $1 AND name = $2 ORDER BY id LIMIT 1', [campus.campusId, lesson.name]);
        if (existing.rowCount) lessonIds.push(Number(existing.rows[0].id));
        else {
          const result = await client.query(
            `INSERT INTO lessons (name, subject_id, teaching_mode, fee_mode, campus_id, status)
             VALUES ($1,$2,'small_class','per_hour',$3,'on_sale') RETURNING id`,
            [lesson.name, subjectIds.get(lesson.subject) ?? null, campus.campusId]
          );
          lessonIds.push(Number(result.rows[0].id));
        }
        summary.lessons += 1;
      }

      for (const [classIndex, classItem] of campus.classes.entries()) {
        const teacherId = teacherIds[classItem.teacherIndex];
        const lessonId = lessonIds[classItem.lessonIndex];
        const existingClass = await client.query('SELECT id FROM classes WHERE campus_id = $1 AND name = $2 ORDER BY id LIMIT 1', [campus.campusId, classItem.name]);
        let classId: number;
        if (existingClass.rowCount) {
          classId = Number(existingClass.rows[0].id);
          await client.query(
            `UPDATE classes SET subject = $1, grade = $2, schedule = $3, teacher_id = $4, lesson_id = $5,
               capacity = $6, start_date = $7, recruit_status = 'full' WHERE id = $8`,
            [classItem.subject, classItem.grade, '每周六 10:00-11:30', teacherId, lessonId, classItem.capacity, startDate, classId]
          );
        } else {
          const result = await client.query(
            `INSERT INTO classes (campus_id, name, subject, grade, schedule, teacher_id, lesson_id, capacity, start_date, recruit_status)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'full') RETURNING id`,
            [campus.campusId, classItem.name, classItem.subject, classItem.grade, '每周六 10:00-11:30', teacherId, lessonId, classItem.capacity, startDate]
          );
          classId = Number(result.rows[0].id);
        }
        summary.classes += 1;

        for (const student of classItem.students) {
          let studentId: number;
          let created = false;
          const existingStudent = await client.query('SELECT id FROM students WHERE notes = $1 LIMIT 1', [student.marker]);
          if (existingStudent.rowCount) studentId = Number(existingStudent.rows[0].id);
          else {
            created = true;
            const result = await client.query(
              `INSERT INTO students (campus_id, name, guardian_phone, status, gender, birthday, enrollment_date, source, notes)
               VALUES ($1,$2,$3,'active',$4,$5,$6,'试用数据',$7) RETURNING id`,
              [campus.campusId, student.name, student.guardianPhone, student.gender, student.birthday, startDate, student.marker]
            );
            studentId = Number(result.rows[0].id);
          }
          if (created) {
            await client.query(
              `INSERT INTO student_guardians (student_id, name, relation, phone, is_primary)
               VALUES ($1,$2,'父亲',$3,true), ($1,$4,'母亲',$3,false)`,
              [studentId, student.fatherName, student.guardianPhone, student.motherName]
            );
          }
          await client.query(
            `INSERT INTO class_students (class_id, student_id, lesson_id, teacher_id, start_date, status)
             VALUES ($1,$2,$3,$4,$5,'active')
             ON CONFLICT (class_id, student_id) DO UPDATE SET lesson_id = EXCLUDED.lesson_id,
               teacher_id = EXCLUDED.teacher_id, start_date = EXCLUDED.start_date, status = 'active', left_at = NULL`,
            [classId, studentId, lessonId, teacherId, startDate]
          );
          summary.students += 1;
        }
      }
    }
    await client.query('COMMIT');
    console.log(JSON.stringify({ ok: true, teacherPassword, summary, plan: config }, null, 2));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

await main();
