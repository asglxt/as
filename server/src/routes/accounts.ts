import type { FastifyInstance } from 'fastify';
import { authGuard } from '../auth/middleware.ts';
import { requireModule } from '../permissions/module_access.ts';

export async function accountRoutes(app: FastifyInstance) {
  const guard = [authGuard, requireModule('finance')];

  app.get('/:studentId', { preHandler: guard }, async (request) => {
    const studentId = Number((request.params as { studentId: string }).studentId);
    const account = (await app.pool.query('SELECT * FROM student_accounts WHERE student_id = $1', [studentId])).rows[0];
    const transactions = (await app.pool.query(
      'SELECT * FROM account_transactions WHERE student_id = $1 ORDER BY id DESC LIMIT 100',
      [studentId]
    )).rows;
    return {
      balance: account ? Number(account.balance) : 0,
      points: account ? Number(account.points) : 0,
      transactions
    };
  });

  app.post('/:studentId/adjust', { preHandler: guard }, async (request, reply) => {
    const studentId = Number((request.params as { studentId: string }).studentId);
    const body = request.body as { amount?: number; remark?: string };
    if (typeof body.amount !== 'number' || !body.remark?.trim()) {
      return reply.code(400).send({ error: 'amount and remark required' });
    }
    await app.pool.query(
      `INSERT INTO student_accounts (student_id, balance) VALUES ($1, $2)
       ON CONFLICT (student_id) DO UPDATE SET balance = student_accounts.balance + $2, updated_at = now()`,
      [studentId, body.amount]
    );
    const account = (await app.pool.query('SELECT balance FROM student_accounts WHERE student_id = $1', [studentId])).rows[0];
    await app.pool.query(
      `INSERT INTO account_transactions (student_id, type, amount, balance_after, remark, created_by)
       VALUES ($1, 'adjust', $2, $3, $4, $5)`,
      [studentId, body.amount, Number(account.balance), body.remark.trim(), request.user!.id]
    );
    return { ok: true, balance: Number(account.balance) };
  });
}