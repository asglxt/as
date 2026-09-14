import type { FastifyInstance } from 'fastify';
import { authGuard } from '../auth/middleware.ts';
import { getStudentReport } from './reports.ts';

export async function meRoutes(app: FastifyInstance) {
  app.get('/children', { preHandler: [authGuard] }, async (request, reply) => {
    const user = request.user!;
    if (user.role !== 'parent') return reply.code(403).send({ error: 'forbidden' });
    const bindings = (await app.pool.query(
      'SELECT student_id FROM parent_bindings WHERE parent_user_id = $1',
      [user.id]
    )).rows;
    const children = [];
    for (const binding of bindings) {
      children.push(await getStudentReport(app, binding.student_id));
    }
    return children;
  });

  app.get('/report', { preHandler: [authGuard] }, async (request, reply) => {
    const user = request.user!;
    if (user.role === 'student' && user.studentId) {
      return getStudentReport(app, user.studentId);
    }
    if (user.role === 'parent') {
      const bindings = (await app.pool.query(
        'SELECT student_id FROM parent_bindings WHERE parent_user_id = $1',
        [user.id]
      )).rows;
      if (bindings.length === 0) return reply.code(404).send({ error: 'no bound child' });
      return getStudentReport(app, bindings[0].student_id);
    }
    return reply.code(403).send({ error: 'forbidden' });
  });

  app.get('/comments', { preHandler: [authGuard] }, async (request) => {
    const user = request.user!;
    const bindings = user.role === 'parent'
      ? (await app.pool.query('SELECT student_id FROM parent_bindings WHERE parent_user_id = $1', [user.id])).rows
      : [];
    const studentIds = user.role === 'student' && user.studentId ? [user.studentId] : bindings.map((b) => b.student_id);
    if (studentIds.length === 0) return [];
    return (await app.pool.query(
      `SELECT tc.*, st.name AS student_name, tl.taught_at, c.name AS class_name
       FROM teaching_comments tc
       JOIN students st ON st.id = tc.student_id
       JOIN teaching_logs tl ON tl.id = tc.teaching_log_id
       JOIN classes c ON c.id = tl.class_id
       WHERE tc.student_id = ANY($1::bigint[])
       ORDER BY tc.created_at DESC`,
      [studentIds]
    )).rows;
  });

  app.post('/comments/:id/read', { preHandler: [authGuard] }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const user = request.user!;
    if (user.role !== 'parent' && user.role !== 'student') return reply.code(403).send({ error: 'forbidden' });
    const comment = (await app.pool.query('SELECT * FROM teaching_comments WHERE id = $1', [id])).rows[0];
    if (!comment) return reply.code(404).send({ error: 'comment not found' });
    if (user.role === 'parent') {
      const binding = await app.pool.query('SELECT 1 FROM parent_bindings WHERE parent_user_id = $1 AND student_id = $2', [user.id, comment.student_id]);
      if (!binding.rowCount) return reply.code(403).send({ error: 'forbidden' });
    } else if (user.studentId !== Number(comment.student_id)) {
      return reply.code(403).send({ error: 'forbidden' });
    }
    await app.pool.query('UPDATE teaching_comments SET read_at = COALESCE(read_at, now()) WHERE id = $1', [id]);
    return { ok: true };
  });

  app.get('/homework', { preHandler: [authGuard] }, async (request) => {
    const user = request.user!;
    const studentIds = user.role === 'student' && user.studentId
      ? [user.studentId]
      : (await app.pool.query('SELECT student_id FROM parent_bindings WHERE parent_user_id = $1', [user.id])).rows.map((b) => b.student_id);
    if (studentIds.length === 0) return [];
    return (await app.pool.query(
      `SELECT r.*, h.title, h.content AS homework_content, h.due_at, h.assigned_at,
              c.name AS class_name, st.name AS student_name
       FROM homework_records r
       JOIN homework h ON h.id = r.homework_id
       JOIN classes c ON c.id = h.class_id
       JOIN students st ON st.id = r.student_id
       WHERE r.student_id = ANY($1::bigint[])
       ORDER BY h.assigned_at DESC NULLS LAST`,
      [studentIds]
    )).rows;
  });

  app.post('/homework/:recordId/submit', { preHandler: [authGuard] }, async (request, reply) => {
    const recordId = Number((request.params as { recordId: string }).recordId);
    const body = request.body as { content?: string };
    const user = request.user!;
    const record = (await app.pool.query(
      `SELECT r.*, h.status AS homework_status FROM homework_records r
       JOIN homework h ON h.id = r.homework_id WHERE r.id = $1`,
      [recordId]
    )).rows[0];
    if (!record) return reply.code(404).send({ error: 'record not found' });
    if (user.role === 'parent') {
      const binding = await app.pool.query('SELECT 1 FROM parent_bindings WHERE parent_user_id = $1 AND student_id = $2', [user.id, record.student_id]);
      if (!binding.rowCount) return reply.code(403).send({ error: 'forbidden' });
    } else if (user.role !== 'student' || user.studentId !== Number(record.student_id)) {
      return reply.code(403).send({ error: 'forbidden' });
    }
    if (record.homework_status !== 'published') return reply.code(409).send({ error: '作业未发布' });
    if (record.status === 'reviewed') return reply.code(409).send({ error: '已批改，不能重复提交' });
    await app.pool.query(
      `UPDATE homework_records SET status = 'submitted', content = $1, submitted_at = now() WHERE id = $2`,
      [body.content ?? null, recordId]
    );
    return { ok: true };
  });

  app.get('/orders', { preHandler: [authGuard] }, async (request) => {
    const user = request.user!;
    const studentIds = user.role === 'student' && user.studentId
      ? [user.studentId]
      : (await app.pool.query('SELECT student_id FROM parent_bindings WHERE parent_user_id = $1', [user.id])).rows.map((b) => b.student_id);
    if (studentIds.length === 0) return { orders: [], account: { balance: 0, points: 0, transactions: [] } };
    const orders = (await app.pool.query(
      `SELECT o.*, s.name AS student_name, c.name AS campus_name
       FROM orders o
       JOIN students s ON s.id = o.student_id
       LEFT JOIN campuses c ON c.id = o.campus_id
       WHERE o.student_id = ANY($1::bigint[])
       ORDER BY o.id DESC`,
      [studentIds]
    )).rows;
    const account = (await app.pool.query(
      'SELECT balance, points FROM student_accounts WHERE student_id = $1',
      [studentIds[0]]
    )).rows[0];
    const transactions = (await app.pool.query(
      'SELECT * FROM account_transactions WHERE student_id = $1 ORDER BY id DESC LIMIT 50',
      [studentIds[0]]
    )).rows;
    return {
      orders,
      account: {
        balance: account ? Number(account.balance) : 0,
        points: account ? Number(account.points) : 0,
        transactions
      }
    };
  });
}