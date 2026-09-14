import type { FastifyInstance } from 'fastify';
import { authGuard } from '../auth/middleware.ts';
import { requireModule } from '../permissions/module_access.ts';

export async function dashboardRoutes(app: FastifyInstance) {
  app.get('/summary', { preHandler: [authGuard, requireModule('dashboard')] }, async (request) => {
    const user = request.user!;
    const isTeacher = user.role === 'teacher';
    const teacherParam = isTeacher ? user.id : null;

    const students = (await app.pool.query(
      `SELECT COUNT(DISTINCT s.id)::int AS count
       FROM students s
       WHERE s.status = 'active'
         AND (
           $1::bigint IS NULL OR EXISTS (
             SELECT 1 FROM class_students cs
             JOIN classes c ON c.id = cs.class_id
             WHERE cs.student_id = s.id AND c.teacher_id = $1 AND cs.left_at IS NULL
           )
         )`,
      [teacherParam]
    )).rows[0];
    const schedulesToday = (await app.pool.query(
      `SELECT COUNT(*)::int AS count
       FROM schedules sc
       WHERE sc.schedule_date = CURRENT_DATE
         AND ($1::bigint IS NULL OR sc.teacher_id = $1)`,
      [teacherParam]
    )).rows[0];
    const teachingLogsToday = (await app.pool.query(
      `SELECT COUNT(*)::int AS count
       FROM teaching_logs tl
       WHERE tl.taught_at::date = CURRENT_DATE
         AND ($1::bigint IS NULL OR tl.teacher_id = $1)`,
      [teacherParam]
    )).rows[0];
    const arrearsOrders = (await app.pool.query(
      `SELECT COUNT(*)::int AS count
       FROM orders
       WHERE payment_status <> 'paid' AND arrears > 0`
    )).rows[0];

    return {
      students: Number(students.count),
      schedulesToday: Number(schedulesToday.count),
      teachingLogsToday: Number(teachingLogsToday.count),
      arrearsOrders: Number(arrearsOrders.count),
      tasks: [
        { key: 'arrears', label: '待处理欠费', count: Number(arrearsOrders.count), url: '/orders' },
        { key: 'attendance', label: '待记上课', count: Math.max(0, Number(schedulesToday.count) - Number(teachingLogsToday.count)), url: '/attendance' },
        { key: 'scores', label: '近期成绩录入', count: 0, url: '/scores' },
        { key: 'homework', label: '待点评作业', count: 0, url: '/homework' }
      ],
      quickActions: [
        { key: 'student', label: '新增学员', url: '/students?action=create' },
        { key: 'schedule', label: '排课', url: '/schedules' },
        { key: 'attendance', label: '记上课', url: '/attendance' },
        { key: 'order', label: '报名续费', url: '/orders' }
      ]
    };
  });
}
