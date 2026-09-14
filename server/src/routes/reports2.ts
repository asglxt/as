import type { FastifyInstance } from 'fastify';
import { authGuard } from '../auth/middleware.ts';
import { requireModule } from '../permissions/module_access.ts';
import { resolveCampusIds } from '../reports/campus_filter.ts';

function parseRange(query: any) {
  const end = query.end ?? new Date().toISOString().slice(0, 10);
  const start = query.start ?? end.slice(0, 8) + '01';
  return { start, end };
}

function campusParam(ids: number[] | null) {
  return ids && ids.length ? ids : null;
}

export async function report2Routes(app: FastifyInstance) {
  const guard = [authGuard, requireModule('report')];

  app.get('/overview', { preHandler: guard }, async (request) => {
    const query = request.query as any;
    const { start, end } = parseRange(query);
    const requested = query.campusIds ? String(query.campusIds).split(',').map(Number) : [];
    const campusIds = await resolveCampusIds(app, request.user!, requested);
    const c = campusParam(campusIds);

    const students = (await app.pool.query(
      `SELECT COUNT(*) AS active FROM students s
       WHERE s.status = 'active' AND ($1::bigint[] IS NULL OR s.campus_id = ANY($1))`,
      [c]
    )).rows[0];
    const newStudents = (await app.pool.query(
      `SELECT COUNT(*) AS count FROM students s
       WHERE s.created_at::date BETWEEN $2::date AND $3::date
         AND ($1::bigint[] IS NULL OR s.campus_id = ANY($1))`,
      [c, start, end]
    )).rows[0];
    const orders = (await app.pool.query(
      `SELECT COALESCE(SUM(o.receivable),0) AS receivable, COALESCE(SUM(o.arrears),0) AS arrears
       FROM orders o
       WHERE o.created_at::date BETWEEN $2::date AND $3::date
         AND ($1::bigint[] IS NULL OR o.campus_id = ANY($1))`,
      [c, start, end]
    )).rows[0];
    const payments = (await app.pool.query(
      `SELECT COALESCE(SUM(p.amount),0) AS received FROM payments p
       JOIN orders o ON o.id = p.order_id
       WHERE p.paid_at::date BETWEEN $2::date AND $3::date
         AND ($1::bigint[] IS NULL OR o.campus_id = ANY($1))`,
      [c, start, end]
    )).rows[0];
    const refunds = (await app.pool.query(
      `SELECT COALESCE(SUM(r.actual_amount),0) AS refunded FROM refunds r
       JOIN students s ON s.id = r.student_id
       WHERE r.refunded_at::date BETWEEN $2::date AND $3::date
         AND ($1::bigint[] IS NULL OR s.campus_id = ANY($1))`,
      [c, start, end]
    )).rows[0];
    const teaching = (await app.pool.query(
      `SELECT COUNT(*) AS logs FROM teaching_logs tl
       WHERE tl.taught_at::date BETWEEN $2::date AND $3::date
         AND ($1::bigint[] IS NULL OR tl.campus_id = ANY($1))`,
      [c, start, end]
    )).rows[0];
    const hours = (await app.pool.query(
      `SELECT COALESCE(SUM(ar.hours_deducted),0) AS hours FROM attendance_records ar
       JOIN teaching_logs tl ON tl.id = ar.teaching_log_id
       WHERE tl.taught_at::date BETWEEN $2::date AND $3::date
         AND ($1::bigint[] IS NULL OR tl.campus_id = ANY($1))`,
      [c, start, end]
    )).rows[0];

    const days = Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1);
    const prevEndDate = new Date(new Date(start).getTime() - 86400000);
    const prevStartDate = new Date(prevEndDate.getTime() - (days - 1) * 86400000);
    const prevStart = prevStartDate.toISOString().slice(0, 10);
    const prevEnd = prevEndDate.toISOString().slice(0, 10);
    const prevReceived = (await app.pool.query(
      `SELECT COALESCE(SUM(p.amount),0) AS received FROM payments p
       JOIN orders o ON o.id = p.order_id
       WHERE p.paid_at::date BETWEEN $2::date AND $3::date
         AND ($1::bigint[] IS NULL OR o.campus_id = ANY($1))`,
      [c, prevStart, prevEnd]
    )).rows[0];
    const receivedNow = Number(payments.received);
    const receivedPrev = Number(prevReceived.received);
    const growth = receivedPrev === 0 ? null : Math.round(((receivedNow - receivedPrev) / receivedPrev) * 1000) / 10;

    return {
      range: { start, end },
      activeStudents: Number(students.active),
      newStudents: Number(newStudents.count),
      receivable: Number(orders.receivable),
      received: receivedNow,
      arrears: Number(orders.arrears),
      refunded: Number(refunds.refunded),
      teachingLogs: Number(teaching.logs),
      hoursConsumed: Number(hours.hours),
      compare: { receivedGrowthPercent: growth }
    };
  });

  app.get('/students', { preHandler: guard }, async (request) => {
    const query = request.query as any;
    const { start, end } = parseRange(query);
    const requested = query.campusIds ? String(query.campusIds).split(',').map(Number) : [];
    const campusIds = await resolveCampusIds(app, request.user!, requested);
    const c = campusParam(campusIds);
    const granularity = ['day', 'week', 'month'].includes(query.granularity) ? query.granularity : 'day';

    const trend = (await app.pool.query(
      `SELECT date_trunc($4, s.created_at)::date AS bucket, COUNT(*) AS count
       FROM students s
       WHERE s.created_at::date BETWEEN $2::date AND $3::date
         AND ($1::bigint[] IS NULL OR s.campus_id = ANY($1))
       GROUP BY bucket ORDER BY bucket`,
      [c, start, end, granularity]
    )).rows.map((r) => ({ bucket: String(r.bucket).slice(0, 10), count: Number(r.count) }));

    const campusComparison = (await app.pool.query(
      `SELECT camp.id, camp.name, COUNT(s.id) AS count
       FROM campuses camp
       LEFT JOIN students s ON s.campus_id = camp.id
         AND s.created_at::date BETWEEN $2::date AND $3::date
       WHERE ($1::bigint[] IS NULL OR camp.id = ANY($1))
       GROUP BY camp.id, camp.name ORDER BY camp.id`,
      [c, start, end]
    )).rows.map((r) => ({ campusId: Number(r.id), campusName: r.name, count: Number(r.count) }));

    const statusDistribution = (await app.pool.query(
      `SELECT s.status, COUNT(*) AS count FROM students s
       WHERE ($1::bigint[] IS NULL OR s.campus_id = ANY($1))
       GROUP BY s.status ORDER BY s.status`,
      [c]
    )).rows.map((r) => ({ status: r.status, count: Number(r.count) }));

    return { range: { start, end }, granularity, trend, campusComparison, statusDistribution };
  });

  app.get('/teaching', { preHandler: guard }, async (request) => {
    const query = request.query as any;
    const { start, end } = parseRange(query);
    const requested = query.campusIds ? String(query.campusIds).split(',').map(Number) : [];
    const campusIds = await resolveCampusIds(app, request.user!, requested);
    const c = campusParam(campusIds);

    const scheduleCount = (await app.pool.query(
      `SELECT COUNT(*) AS count FROM schedules s
       WHERE s.schedule_date BETWEEN $2::date AND $3::date
         AND s.status = 'normal' AND ($1::bigint[] IS NULL OR s.campus_id = ANY($1))`,
      [c, start, end]
    )).rows[0];
    const teachingLogCount = (await app.pool.query(
      `SELECT COUNT(*) AS count FROM teaching_logs tl
       WHERE tl.taught_at::date BETWEEN $2::date AND $3::date
         AND ($1::bigint[] IS NULL OR tl.campus_id = ANY($1))`,
      [c, start, end]
    )).rows[0];
    const attendance = (await app.pool.query(
      `SELECT ar.status, COUNT(*) AS count, COALESCE(SUM(ar.hours_deducted),0) AS hours
       FROM attendance_records ar
       JOIN teaching_logs tl ON tl.id = ar.teaching_log_id
       WHERE tl.taught_at::date BETWEEN $2::date AND $3::date
         AND ($1::bigint[] IS NULL OR tl.campus_id = ANY($1))
       GROUP BY ar.status`,
      [c, start, end]
    )).rows;
    const byStatus: Record<string, number> = { present: 0, absent: 0, leave: 0, makeup: 0 };
    let hoursConsumed = 0;
    for (const row of attendance) {
      byStatus[row.status] = Number(row.count);
      hoursConsumed += Number(row.hours);
    }
    const total = Object.values(byStatus).reduce((sum, value) => sum + value, 0);
    const attendanceRate = total === 0 ? null : Math.round((byStatus.present / total) * 1000) / 10;

    return {
      range: { start, end },
      scheduleCount: Number(scheduleCount.count),
      teachingLogCount: Number(teachingLogCount.count),
      hoursConsumed,
      attendance: byStatus,
      attendanceRate
    };
  });
  app.get('/finance', { preHandler: guard }, async (request) => {
    const query = request.query as any;
    const { start, end } = parseRange(query);
    const requested = query.campusIds ? String(query.campusIds).split(',').map(Number) : [];
    const campusIds = await resolveCampusIds(app, request.user!, requested);
    const c = campusParam(campusIds);

    const totals = (await app.pool.query(
      `SELECT COALESCE(SUM(o.receivable),0) AS receivable, COALESCE(SUM(o.received),0) AS received,
              COALESCE(SUM(o.arrears),0) AS arrears
       FROM orders o
       WHERE o.created_at::date BETWEEN $2::date AND $3::date
         AND ($1::bigint[] IS NULL OR o.campus_id = ANY($1))`,
      [c, start, end]
    )).rows[0];
    const refunded = (await app.pool.query(
      `SELECT COALESCE(SUM(r.actual_amount),0) AS refunded FROM refunds r
       JOIN students s ON s.id = r.student_id
       WHERE r.refunded_at::date BETWEEN $2::date AND $3::date
         AND ($1::bigint[] IS NULL OR s.campus_id = ANY($1))`,
      [c, start, end]
    )).rows[0];
    const recharged = (await app.pool.query(
      `SELECT COALESCE(SUM(o.received),0) AS recharged FROM orders o
       WHERE o.order_type = 'recharge' AND o.created_at::date BETWEEN $2::date AND $3::date
         AND ($1::bigint[] IS NULL OR o.campus_id = ANY($1))`,
      [c, start, end]
    )).rows[0];
    const balance = (await app.pool.query(
      `SELECT COALESCE(SUM(sa.balance),0) AS balance FROM student_accounts sa
       JOIN students s ON s.id = sa.student_id
       WHERE ($1::bigint[] IS NULL OR s.campus_id = ANY($1))`,
      [c]
    )).rows[0];
    const campusComparison = (await app.pool.query(
      `SELECT camp.id, camp.name,
              COALESCE(SUM(o.receivable),0) AS receivable, COALESCE(SUM(o.received),0) AS received
       FROM campuses camp
       LEFT JOIN orders o ON o.campus_id = camp.id AND o.created_at::date BETWEEN $2::date AND $3::date
       WHERE ($1::bigint[] IS NULL OR camp.id = ANY($1))
       GROUP BY camp.id, camp.name ORDER BY camp.id`,
      [c, start, end]
    )).rows.map((r) => ({
      campusId: Number(r.id), campusName: r.name,
      receivable: Number(r.receivable), received: Number(r.received)
    }));
    const orderTypeDistribution = (await app.pool.query(
      `SELECT o.order_type, COUNT(*) AS count, COALESCE(SUM(o.receivable),0) AS amount
       FROM orders o
       WHERE o.created_at::date BETWEEN $2::date AND $3::date
         AND ($1::bigint[] IS NULL OR o.campus_id = ANY($1))
       GROUP BY o.order_type ORDER BY o.order_type`,
      [c, start, end]
    )).rows.map((r) => ({ type: r.order_type, count: Number(r.count), amount: Number(r.amount) }));

    return {
      range: { start, end },
      receivable: Number(totals.receivable),
      received: Number(totals.received),
      arrears: Number(totals.arrears),
      refunded: Number(refunded.refunded),
      recharged: Number(recharged.recharged),
      balance: Number(balance.balance),
      campusComparison,
      orderTypeDistribution
    };
  });

  app.get('/employees', { preHandler: guard }, async (request) => {
    const query = request.query as any;
    const requested = query.campusIds ? String(query.campusIds).split(',').map(Number) : [];
    const campusIds = await resolveCampusIds(app, request.user!, requested);
    const c = campusParam(campusIds);

    const employees = (await app.pool.query(
      `SELECT COUNT(*) AS count FROM users u
       WHERE u.role IN ('admin','teacher') AND ($1::bigint[] IS NULL OR u.campus_id = ANY($1))`,
      [c]
    )).rows[0];
    const teachers = (await app.pool.query(
      `SELECT COUNT(*) AS count FROM users u WHERE u.role = 'teacher' AND ($1::bigint[] IS NULL OR u.campus_id = ANY($1))`,
      [c]
    )).rows[0];
    const classes = (await app.pool.query(
      `SELECT COUNT(*) AS count FROM classes c WHERE ($1::bigint[] IS NULL OR c.campus_id = ANY($1))`,
      [c]
    )).rows[0];
    const classByTeacher = (await app.pool.query(
      `SELECT COALESCE(u.display_name, '待定') AS teacher_name, COUNT(*) AS count
       FROM classes c LEFT JOIN users u ON u.id = c.teacher_id
       WHERE ($1::bigint[] IS NULL OR c.campus_id = ANY($1))
       GROUP BY teacher_name ORDER BY count DESC LIMIT 20`,
      [c]
    )).rows.map((r) => ({ teacherName: r.teacher_name, count: Number(r.count) }));

    return {
      employeeCount: Number(employees.count),
      teacherCount: Number(teachers.count),
      classCount: Number(classes.count),
      classByTeacher
    };
  });

  app.get('/drilldown', { preHandler: guard }, async (request, reply) => {
    const query = request.query as any;
    const metric = query.metric;
    const supported = ['newStudents', 'arrears', 'hoursConsumed', 'refunds'];
    if (!supported.includes(metric)) return reply.code(400).send({ error: `metric must be one of ${supported.join(', ')}` });
    const { start, end } = parseRange(query);
    const requested = query.campusIds ? String(query.campusIds).split(',').map(Number) : [];
    const campusIds = await resolveCampusIds(app, request.user!, requested);
    const c = campusParam(campusIds);

    if (metric === 'newStudents') {
      const rows = (await app.pool.query(
        `SELECT s.id, s.name AS student_name, camp.name AS campus_name, s.status, s.created_at
         FROM students s JOIN campuses camp ON camp.id = s.campus_id
         WHERE s.created_at::date BETWEEN $2::date AND $3::date
           AND ($1::bigint[] IS NULL OR s.campus_id = ANY($1))
         ORDER BY s.created_at DESC LIMIT 200`,
        [c, start, end]
      )).rows;
      return { rows, total: rows.length };
    }
    if (metric === 'arrears') {
      const rows = (await app.pool.query(
        `SELECT o.id, o.order_no, s.name AS student_name, o.arrears, o.payment_status, o.created_at
         FROM orders o JOIN students s ON s.id = o.student_id
         WHERE o.arrears > 0 AND o.created_at::date BETWEEN $2::date AND $3::date
           AND ($1::bigint[] IS NULL OR o.campus_id = ANY($1))
         ORDER BY o.created_at DESC LIMIT 200`,
        [c, start, end]
      )).rows;
      return { rows, total: rows.length };
    }
    if (metric === 'hoursConsumed') {
      const rows = (await app.pool.query(
        `SELECT st.name AS student_name, c.name AS class_name, ar.status, ar.hours_deducted, tl.taught_at
         FROM attendance_records ar
         JOIN teaching_logs tl ON tl.id = ar.teaching_log_id
         JOIN students st ON st.id = ar.student_id
         JOIN classes c ON c.id = tl.class_id
         WHERE tl.taught_at::date BETWEEN $2::date AND $3::date
           AND ($1::bigint[] IS NULL OR tl.campus_id = ANY($1))
         ORDER BY tl.taught_at DESC LIMIT 200`,
        [c, start, end]
      )).rows;
      return { rows, total: rows.length };
    }
    const rows = (await app.pool.query(
      `SELECT r.id, st.name AS student_name, r.suggested_amount, r.actual_amount, r.reason, r.method, r.refunded_at
       FROM refunds r JOIN students st ON st.id = r.student_id
       WHERE r.refunded_at::date BETWEEN $2::date AND $3::date
         AND ($1::bigint[] IS NULL OR st.campus_id = ANY($1))
       ORDER BY r.refunded_at DESC LIMIT 200`,
      [c, start, end]
    )).rows;
    return { rows, total: rows.length };
  });
}