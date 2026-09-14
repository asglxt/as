import { buildApp } from '../src/app.ts';
import { migrate } from '../src/migrate.ts';
import { hashPassword } from '../src/auth/password.ts';

export const TEST_DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://school:school@localhost:5432/school_test';

export async function setupApp() {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  await migrate(TEST_DATABASE_URL);
  return buildApp();
}

export async function seedBase(app: Awaited<ReturnType<typeof setupApp>>) {
  await app.pool.query(
    'TRUNCATE material_transactions, material_inventory, materials, notification_recipients, notification_classes, notifications, notification_templates, student_growth_records, student_guardians, parent_bindings, import_jobs, audit_logs, payments, refunds, account_transactions, student_accounts, order_items, orders, fee_items, homework_records, homework, teaching_comments, comment_templates, attendance_records, teaching_logs, hour_transactions, enrollments, student_scores, exam_projects, exams, schedules, classrooms, lesson_upgrades, lessons, lesson_categories, subjects, class_students, classes, users, students, campuses RESTART IDENTITY CASCADE'
  );
  await app.pool.query('DELETE FROM roles WHERE is_preset = false');
  await app.pool.query("INSERT INTO exam_projects (name, sort) VALUES ('单元测评', 1) ON CONFLICT (name) DO NOTHING");
  await app.pool.query("INSERT INTO exams (name, sort) VALUES ('第一单元', 1) ON CONFLICT (name) DO NOTHING");
  const campus = await app.pool.query("INSERT INTO campuses (name) VALUES ('测试校区') RETURNING id");
  const campusId = campus.rows[0].id;
  await app.pool.query(
    "INSERT INTO users (username, password_hash, display_name, role, campus_id) VALUES ('admin', $1, '管理员', 'admin', $2)",
    [await hashPassword('admin123'), campusId]
  );
  await app.pool.query(
    "INSERT INTO users (username, password_hash, display_name, role, campus_id) VALUES ('teacher', $1, '教师', 'teacher', $2)",
    [await hashPassword('teacher123'), campusId]
  );
  const adminLogin = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username: 'admin', password: 'admin123' }
  });
  const teacherLogin = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username: 'teacher', password: 'teacher123' }
  });
  return {
    campusId,
    adminToken: adminLogin.json().token,
    teacherToken: teacherLogin.json().token
  };
}
