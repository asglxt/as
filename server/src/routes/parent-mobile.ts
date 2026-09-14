import type { FastifyInstance } from 'fastify';
import { authGuard, requireRole } from '../auth/middleware.ts';
import { getStudentReport } from './reports.ts';

async function boundChildren(app: FastifyInstance, parentId: number) {
  return (await app.pool.query(
    `SELECT s.id, s.name, s.status, c.name AS campus_name
     FROM parent_bindings pb JOIN students s ON s.id = pb.student_id
     LEFT JOIN campuses c ON c.id = s.campus_id
     WHERE pb.parent_user_id = $1 ORDER BY pb.student_id`,
    [parentId]
  )).rows.map((row) => ({ ...row, id: Number(row.id) }));
}

async function selectedChild(app: FastifyInstance, parentId: number, requestedId?: number) {
  const children = await boundChildren(app, parentId);
  const selected = requestedId ? children.find((child) => child.id === requestedId) : children[0];
  return { children, selected: selected ?? null };
}

async function childComments(app: FastifyInstance, studentId: number) {
  return (await app.pool.query(
    `SELECT tc.*, st.name AS student_name, tl.taught_at, c.name AS class_name
     FROM teaching_comments tc
     JOIN students st ON st.id = tc.student_id
     JOIN teaching_logs tl ON tl.id = tc.teaching_log_id
     JOIN classes c ON c.id = tl.class_id
     WHERE tc.student_id = $1 ORDER BY tc.created_at DESC`,
    [studentId]
  )).rows;
}

async function childHomework(app: FastifyInstance, studentId: number) {
  return (await app.pool.query(
    `SELECT r.*, h.title, h.content AS homework_content, h.due_at, h.assigned_at,
            c.name AS class_name, st.name AS student_name
     FROM homework_records r JOIN homework h ON h.id = r.homework_id
     JOIN classes c ON c.id = h.class_id JOIN students st ON st.id = r.student_id
     WHERE r.student_id = $1 ORDER BY h.assigned_at DESC NULLS LAST`,
    [studentId]
  )).rows;
}

async function childOrders(app: FastifyInstance, studentId: number) {
  const orders = (await app.pool.query(
    `SELECT o.*, s.name AS student_name, c.name AS campus_name
     FROM orders o JOIN students s ON s.id = o.student_id
     LEFT JOIN campuses c ON c.id = o.campus_id
     WHERE o.student_id = $1 ORDER BY o.id DESC`,
    [studentId]
  )).rows;
  const account = (await app.pool.query('SELECT balance,points FROM student_accounts WHERE student_id=$1', [studentId])).rows[0];
  const transactions = (await app.pool.query('SELECT * FROM account_transactions WHERE student_id=$1 ORDER BY id DESC LIMIT 50', [studentId])).rows;
  return { orders, account: { balance: Number(account?.balance ?? 0), points: Number(account?.points ?? 0), transactions } };
}

export async function parentMobileRoutes(app: FastifyInstance) {
  const guard = [authGuard, requireRole('parent')];

  app.get('/overview', { preHandler: guard }, async (request, reply) => {
    const requestedId = Number((request.query as { studentId?: string }).studentId) || undefined;
    const { children, selected } = await selectedChild(app, request.user!.id, requestedId);
    if (requestedId && !selected) return reply.code(403).send({ error: 'child forbidden' });
    if (!selected) return reply.code(404).send({ error: 'no bound child' });
    const [report, comments, homework, orders] = await Promise.all([
      getStudentReport(app, selected.id), childComments(app, selected.id), childHomework(app, selected.id), childOrders(app, selected.id)
    ]);
    return {
      parent: { id: request.user!.id },
      children,
      selectedChild: selected,
      stats: {
        scoreCount: report.scores.length,
        latestScore: report.scores[0] ?? null,
        unreadComments: comments.filter((item) => !item.read_at).length,
        pendingHomework: homework.filter((item) => item.status !== 'reviewed').length,
        balance: orders.account.balance,
        points: orders.account.points
      },
      latestComments: comments.slice(0, 3),
      latestHomework: homework.slice(0, 3)
    };
  });

  app.get('/scores', { preHandler: guard }, async (request, reply) => {
    const requestedId = Number((request.query as { studentId?: string }).studentId) || undefined;
    const { selected } = await selectedChild(app, request.user!.id, requestedId);
    if (!selected) return reply.code(requestedId ? 403 : 404).send({ error: requestedId ? 'child forbidden' : 'no bound child' });
    return getStudentReport(app, selected.id);
  });

  app.get('/comments', { preHandler: guard }, async (request, reply) => {
    const requestedId = Number((request.query as { studentId?: string }).studentId) || undefined;
    const { selected } = await selectedChild(app, request.user!.id, requestedId);
    if (!selected) return reply.code(requestedId ? 403 : 404).send({ error: requestedId ? 'child forbidden' : 'no bound child' });
    return childComments(app, selected.id);
  });

  app.get('/homework', { preHandler: guard }, async (request, reply) => {
    const requestedId = Number((request.query as { studentId?: string }).studentId) || undefined;
    const { selected } = await selectedChild(app, request.user!.id, requestedId);
    if (!selected) return reply.code(requestedId ? 403 : 404).send({ error: requestedId ? 'child forbidden' : 'no bound child' });
    return childHomework(app, selected.id);
  });

  app.get('/orders', { preHandler: guard }, async (request, reply) => {
    const requestedId = Number((request.query as { studentId?: string }).studentId) || undefined;
    const { selected } = await selectedChild(app, request.user!.id, requestedId);
    if (!selected) return reply.code(requestedId ? 403 : 404).send({ error: requestedId ? 'child forbidden' : 'no bound child' });
    return childOrders(app, selected.id);
  });

  app.post('/comments/:id/read', { preHandler: guard }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const comment = (await app.pool.query(
      `SELECT tc.* FROM teaching_comments tc JOIN parent_bindings pb ON pb.student_id=tc.student_id
       WHERE tc.id=$1 AND pb.parent_user_id=$2`,
      [id, request.user!.id]
    )).rows[0];
    if (!comment) return reply.code(404).send({ error: 'comment not found' });
    await app.pool.query('UPDATE teaching_comments SET read_at=COALESCE(read_at,now()) WHERE id=$1', [id]);
    return { ok: true };
  });

  app.post('/homework/:recordId/submit', { preHandler: guard }, async (request, reply) => {
    const recordId = Number((request.params as { recordId: string }).recordId);
    const record = (await app.pool.query(
      `SELECT r.*, h.status AS homework_status FROM homework_records r
       JOIN homework h ON h.id=r.homework_id
       JOIN parent_bindings pb ON pb.student_id=r.student_id
       WHERE r.id=$1 AND pb.parent_user_id=$2`,
      [recordId, request.user!.id]
    )).rows[0];
    if (!record) return reply.code(404).send({ error: 'record not found' });
    if (record.homework_status !== 'published') return reply.code(409).send({ error: '作业未发布' });
    if (record.status === 'reviewed') return reply.code(409).send({ error: '已批改，不能重复提交' });
    const body = request.body as { content?: string };
    await app.pool.query("UPDATE homework_records SET status='submitted',content=$1,submitted_at=now() WHERE id=$2", [body.content ?? null, recordId]);
    return { ok: true };
  });
}
