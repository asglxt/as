import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { authGuard } from '../auth/middleware.ts';
import { requireModule } from '../permissions/module_access.ts';
import { writeAudit } from '../audit.ts';
import { applyHours } from './enrollments.ts';

interface OrderItemInput {
  itemType?: string; lessonId?: number; classId?: number; name?: string;
  quantity?: number; unitPrice?: number;
}

function calcItems(items: OrderItemInput[]) {
  return items.map((item) => {
    const quantity = Number(item.quantity ?? 1);
    const unitPrice = Number(item.unitPrice ?? 0);
    return { ...item, quantity, unitPrice, amount: quantity * unitPrice };
  });
}

export async function orderRoutes(app: FastifyInstance) {
  const guard = [authGuard, requireModule('finance')];

  app.get('/', { preHandler: guard }, async (request) => {
    const query = request.query as { studentId?: string; type?: string; campusId?: string };
    return (await app.pool.query(
      `SELECT o.*, s.name AS student_name, u.display_name AS operator_name, c.name AS campus_name
       FROM orders o
       JOIN students s ON s.id = o.student_id
       LEFT JOIN users u ON u.id = o.operator_id
       LEFT JOIN campuses c ON c.id = o.campus_id
       WHERE ($1::bigint IS NULL OR o.student_id = $1)
         AND ($2::text IS NULL OR o.order_type = $2)
         AND ($3::bigint IS NULL OR o.campus_id = $3)
       ORDER BY o.id DESC`,
      [query.studentId ? Number(query.studentId) : null, query.type ?? null, query.campusId ? Number(query.campusId) : null]
    )).rows;
  });

  app.get('/list', { preHandler: guard }, async (request) => {
    const query = request.query as {
      keyword?: string; type?: string; orderType?: string; campusId?: string;
      paymentStatus?: string; status?: string; start?: string; end?: string;
      page?: string; pageSize?: string;
    };
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 20)));
    const params: unknown[] = [];
    const where: string[] = ['1 = 1'];
    const orderType = query.orderType ?? query.type;
    if (query.keyword?.trim()) {
      params.push(`%${query.keyword.trim()}%`);
      where.push(`(o.order_no ILIKE $${params.length} OR s.name ILIKE $${params.length} OR COALESCE(s.guardian_phone, '') ILIKE $${params.length})`);
    }
    if (orderType) { params.push(orderType); where.push(`o.order_type = $${params.length}`); }
    if (query.campusId) { params.push(Number(query.campusId)); where.push(`o.campus_id = $${params.length}`); }
    if (query.paymentStatus) { params.push(query.paymentStatus); where.push(`o.payment_status = $${params.length}`); }
    if (query.status) { params.push(query.status); where.push(`o.status = $${params.length}`); }
    if (query.start) { params.push(query.start); where.push(`o.created_at::date >= $${params.length}::date`); }
    if (query.end) { params.push(query.end); where.push(`o.created_at::date <= $${params.length}::date`); }
    const baseWhere = where.join(' AND ');
    const summary = (await app.pool.query(
      `SELECT COUNT(*)::int AS total, COALESCE(SUM(o.receivable),0) AS receivable,
              COALESCE(SUM(o.received),0) AS received, COALESCE(SUM(o.account_change),0) AS account_change,
              COALESCE(SUM(o.arrears),0) AS arrears, COALESCE(SUM(o.points),0) AS points
       FROM orders o JOIN students s ON s.id = o.student_id
       WHERE ${baseWhere}`,
      params
    )).rows[0];
    const items = (await app.pool.query(
      `SELECT o.*, s.name AS student_name, s.guardian_phone AS student_phone,
              u.display_name AS operator_name, c.name AS campus_name
       FROM orders o
       JOIN students s ON s.id = o.student_id
       LEFT JOIN users u ON u.id = o.operator_id
       LEFT JOIN campuses c ON c.id = o.campus_id
       WHERE ${baseWhere}
       ORDER BY o.id DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, (page - 1) * pageSize]
    )).rows.map((row) => ({
      ...row,
      id: Number(row.id),
      student_id: Number(row.student_id),
      campus_id: row.campus_id === null ? null : Number(row.campus_id),
      receivable: Number(row.receivable),
      received: Number(row.received),
      account_change: Number(row.account_change),
      arrears: Number(row.arrears),
      points: Number(row.points),
      tags: row.tags ?? []
    }));
    return {
      items,
      total: Number(summary.total),
      page,
      pageSize,
      summary: {
        receivable: Number(summary.receivable),
        received: Number(summary.received),
        accountChange: Number(summary.account_change),
        arrears: Number(summary.arrears),
        points: Number(summary.points)
      }
    };
  });

  app.post('/', { preHandler: guard }, async (request, reply) => {
    const body = request.body as {
      studentId?: number; orderType?: string; campusId?: number;
      items?: OrderItemInput[]; internalNote?: string; externalNote?: string;
      tags?: string[]; orderSource?: string;
    };
    if (!body.studentId || !body.orderType || !Array.isArray(body.items) || body.items.length === 0) {
      return reply.code(400).send({ error: 'studentId, orderType and items required' });
    }
    const items = calcItems(body.items);
    const receivable = items.reduce((sum, item) => sum + item.amount, 0);
    const orderNo = `O${Date.now()}${crypto.randomInt(100, 999)}`;
    const client = await app.pool.connect();
    try {
      await client.query('BEGIN');
      const order = await client.query(
        `INSERT INTO orders (order_no, student_id, order_type, campus_id, operator_id,
           receivable, received, account_change, arrears, payment_status, internal_note, external_note, tags, order_source)
         VALUES ($1,$2,$3,$4,$5,$6,0,0,$6,'unpaid',$7,$8,$9,$10) RETURNING *`,
        [orderNo, body.studentId, body.orderType, body.campusId ?? null, request.user!.id,
         receivable, body.internalNote ?? null, body.externalNote ?? null, body.tags ?? [], body.orderSource ?? 'manual']
      );
      for (const item of items) {
        await client.query(
          `INSERT INTO order_items (order_id, item_type, lesson_id, class_id, name, quantity, unit_price, amount)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [order.rows[0].id, item.itemType ?? 'course', item.lessonId ?? null, item.classId ?? null,
           item.name ?? '未命名明细', item.quantity, item.unitPrice, item.amount]
        );
      }
      await client.query('COMMIT');
      await writeAudit(app, request.user!.id, 'order_create', 'order', order.rows[0].id, { ...body });
      return order.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  app.post('/:id/payments', { preHandler: guard }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const body = request.body as { method?: string; amount?: number; note?: string };
    const methods = ['cash', 'wechat', 'alipay', 'bank', 'balance'];
    if (!body.method || !methods.includes(body.method) || !body.amount || Number(body.amount) <= 0) {
      return reply.code(400).send({ error: 'valid method and positive amount required' });
    }
    const amount = Number(body.amount);
    const order = (await app.pool.query('SELECT * FROM orders WHERE id = $1', [id])).rows[0];
    if (!order) return reply.code(404).send({ error: 'order not found' });
    if (order.status === 'cancelled') return reply.code(409).send({ error: '订单已作废' });
    if (['enroll', 'renew'].includes(order.order_type) && !order.campus_id) {
      return reply.code(400).send({ error: 'campusId is required for enroll orders' });
    }

    if (body.method === 'balance') {
      const account = (await app.pool.query('SELECT * FROM student_accounts WHERE student_id = $1', [order.student_id])).rows[0];
      if (!account || Number(account.balance) < amount) return reply.code(409).send({ error: '余额不足' });
    }

    const received = Number(order.received) + amount;
    const arrears = Math.max(0, Number(order.receivable) - received);
    const paymentStatus = received <= 0 ? 'unpaid' : (arrears === 0 ? 'paid' : 'partial');

    const client = await app.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'INSERT INTO payments (order_id, method, amount, operator_id, note) VALUES ($1,$2,$3,$4,$5)',
        [id, body.method, amount, request.user!.id, body.note ?? null]
      );
      await client.query(
        'UPDATE orders SET received = $1, arrears = $2, payment_status = $3 WHERE id = $4',
        [received, arrears, paymentStatus, id]
      );
      if (body.method === 'balance') {
        const account = (await client.query('SELECT balance FROM student_accounts WHERE student_id = $1 FOR UPDATE', [order.student_id])).rows[0];
        const balanceAfter = Number(account.balance) - amount;
        await client.query('UPDATE student_accounts SET balance = $1, updated_at = now() WHERE student_id = $2', [balanceAfter, order.student_id]);
        await client.query(
          `INSERT INTO account_transactions (student_id, type, amount, balance_after, order_id, remark, created_by)
           VALUES ($1, 'consume', $2, $3, $4, '订单余额抵扣', $5)`,
          [order.student_id, -amount, balanceAfter, id, request.user!.id]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    if (order.order_type === 'recharge' && paymentStatus === 'paid' && order.payment_status !== 'paid') {
      await app.pool.query(
        `INSERT INTO student_accounts (student_id, balance) VALUES ($1, $2)
         ON CONFLICT (student_id) DO UPDATE SET balance = student_accounts.balance + $2, updated_at = now()`,
        [order.student_id, Number(order.receivable)]
      );
      const accountAfter = (await app.pool.query('SELECT balance FROM student_accounts WHERE student_id = $1', [order.student_id])).rows[0];
      await app.pool.query(
        `INSERT INTO account_transactions (student_id, type, amount, balance_after, order_id, remark, created_by)
         VALUES ($1, 'recharge', $2, $3, $4, '余额充值', $5)`,
        [order.student_id, Number(order.receivable), Number(accountAfter.balance), id, request.user!.id]
      );
    }
    if (paymentStatus === 'paid' && ['enroll', 'renew'].includes(order.order_type) && !order.enrollment_applied) {
      const courseItems = (await app.pool.query(
        "SELECT * FROM order_items WHERE order_id = $1 AND item_type = 'course' AND lesson_id IS NOT NULL",
        [id]
      )).rows;
      for (const item of courseItems) {
        const existing = (await app.pool.query(
          'SELECT * FROM enrollments WHERE student_id = $1 AND lesson_id = $2 AND campus_id = $3',
          [order.student_id, item.lesson_id, order.campus_id]
        )).rows[0];
        if (existing) {
          await applyHours(app, existing.id, 'purchase', Number(item.quantity), `订单 ${order.order_no}`, request.user!.id);
          await app.pool.query(
            `UPDATE enrollments SET purchased_hours = purchased_hours + $1, total_fee = total_fee + $2,
               remaining_fee = remaining_fee + $2, unit_price = $3 WHERE id = $4`,
            [Number(item.quantity), Number(item.amount), Number(item.unit_price), existing.id]
          );
        } else {
          const created = await app.pool.query(
            `INSERT INTO enrollments (student_id, lesson_id, campus_id, purchased_hours, used_hours, remaining_hours,
               total_fee, paid_fee, remaining_fee, unit_price)
             VALUES ($1,$2,$3,$4,0,0,$5,$5,$5,$6) RETURNING *`,
            [order.student_id, item.lesson_id, order.campus_id, Number(item.quantity), Number(item.amount), Number(item.unit_price)]
          );
          await applyHours(app, created.rows[0].id, 'purchase', Number(item.quantity), `订单 ${order.order_no}`, request.user!.id);
        }
      }
      await app.pool.query('UPDATE orders SET enrollment_applied = true WHERE id = $1', [id]);
    }

    await writeAudit(app, request.user!.id, 'order_payment', 'order', id, { amount, method: body.method });
    return (await app.pool.query('SELECT * FROM orders WHERE id = $1', [id])).rows[0];
  });
  app.get('/refund-suggestion', { preHandler: guard }, async (request, reply) => {
    const enrollmentId = Number((request.query as { enrollmentId?: string }).enrollmentId);
    if (!enrollmentId) return reply.code(400).send({ error: 'enrollmentId required' });
    const enrollment = (await app.pool.query('SELECT * FROM enrollments WHERE id = $1', [enrollmentId])).rows[0];
    if (!enrollment) return reply.code(404).send({ error: 'enrollment not found' });
    const unitPrice = Number(enrollment.unit_price) || (Number(enrollment.purchased_hours) > 0
      ? Number(enrollment.total_fee) / Number(enrollment.purchased_hours) : 0);
    const suggestedAmount = Math.round(Number(enrollment.remaining_hours) * unitPrice * 100) / 100;
    return {
      enrollmentId,
      unitPrice,
      remainingHours: Number(enrollment.remaining_hours),
      suggestedAmount
    };
  });

  app.post('/refunds', { preHandler: guard }, async (request, reply) => {
    const body = request.body as { enrollmentId?: number; actualAmount?: number; reason?: string; method?: string };
    const methods = ['cash', 'wechat', 'alipay', 'bank', 'balance'];
    if (!body.enrollmentId || typeof body.actualAmount !== 'number' || !body.reason?.trim() || !body.method || !methods.includes(body.method)) {
      return reply.code(400).send({ error: 'enrollmentId, actualAmount, reason and valid method required' });
    }
    const enrollment = (await app.pool.query('SELECT * FROM enrollments WHERE id = $1', [body.enrollmentId])).rows[0];
    if (!enrollment) return reply.code(404).send({ error: 'enrollment not found' });
    const unitPrice = Number(enrollment.unit_price) || (Number(enrollment.purchased_hours) > 0
      ? Number(enrollment.total_fee) / Number(enrollment.purchased_hours) : 0);
    const suggestedAmount = Math.round(Number(enrollment.remaining_hours) * unitPrice * 100) / 100;

    const client = await app.pool.connect();
    let refundId = 0;
    try {
      await client.query('BEGIN');
      const refund = await client.query(
        `INSERT INTO refunds (student_id, suggested_amount, actual_amount, reason, method, operator_id)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [enrollment.student_id, suggestedAmount, body.actualAmount, body.reason.trim(), body.method, request.user!.id]
      );
      refundId = refund.rows[0].id;
      await client.query(
        `UPDATE enrollments SET remaining_hours = 0, remaining_fee = 0, used_fee = total_fee, status = 'refunded'
         WHERE id = $1`,
        [enrollment.id]
      );
      await client.query(
        `INSERT INTO hour_transactions (enrollment_id, student_id, type, hours, balance_after, remark, created_by)
         VALUES ($1,$2,'refund',$3,0,$4,$5)`,
        [enrollment.id, enrollment.student_id, -Number(enrollment.remaining_hours), `退费：${body.reason.trim()}`, request.user!.id]
      );
      if (body.method === 'balance') {
        await client.query(
          `INSERT INTO student_accounts (student_id, balance) VALUES ($1, $2)
           ON CONFLICT (student_id) DO UPDATE SET balance = student_accounts.balance + $2, updated_at = now()`,
          [enrollment.student_id, body.actualAmount]
        );
        const account = (await client.query('SELECT balance FROM student_accounts WHERE student_id = $1', [enrollment.student_id])).rows[0];
        await client.query(
          `INSERT INTO account_transactions (student_id, type, amount, balance_after, remark, created_by)
           VALUES ($1, 'refund', $2, $3, $4, $5)`,
          [enrollment.student_id, body.actualAmount, Number(account.balance), `退费：${body.reason.trim()}`, request.user!.id]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    await writeAudit(app, request.user!.id, 'refund_create', 'refund', refundId, { enrollmentId: enrollment.id, actualAmount: body.actualAmount });
    return (await app.pool.query('SELECT * FROM refunds WHERE id = $1', [refundId])).rows[0];
  });
  app.patch('/:id/status', { preHandler: guard }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const body = request.body as { status?: string; reason?: string };
    if (!body.status || !['draft', 'confirmed', 'cancelled'].includes(body.status)) {
      return reply.code(400).send({ error: 'valid status required' });
    }
    const order = (await app.pool.query('SELECT * FROM orders WHERE id = $1', [id])).rows[0];
    if (!order) return reply.code(404).send({ error: 'order not found' });
    if (body.status === 'cancelled' && Number(order.received) > 0) {
      return reply.code(409).send({ error: '已收款订单不能直接作废，请先处理退款' });
    }
    if (body.status === 'cancelled' && !body.reason?.trim()) {
      return reply.code(400).send({ error: 'cancel reason required' });
    }
    const result = await app.pool.query(
      `UPDATE orders SET status = $1, cancelled_at = CASE WHEN $1 = 'cancelled' THEN now() ELSE cancelled_at END,
        cancel_reason = CASE WHEN $1 = 'cancelled' THEN $2 ELSE cancel_reason END
       WHERE id = $3 RETURNING *`,
      [body.status, body.reason?.trim() || null, id]
    );
    await writeAudit(app, request.user!.id, 'order_status', 'order', id, { status: body.status, reason: body.reason ?? null });
    return result.rows[0];
  });

  app.get('/:id', { preHandler: guard }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: 'invalid order id' });
    const order = (await app.pool.query('SELECT * FROM orders WHERE id = $1', [id])).rows[0];
    if (!order) return reply.code(404).send({ error: 'order not found' });
    const items = (await app.pool.query('SELECT * FROM order_items WHERE order_id = $1', [id])).rows;
    const payments = (await app.pool.query('SELECT * FROM payments WHERE order_id = $1 ORDER BY id', [id])).rows;
    return { ...order, items, payments };
  });
}
