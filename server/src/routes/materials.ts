import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { authGuard } from '../auth/middleware.ts';
import { requireModule } from '../permissions/module_access.ts';
import { writeAudit } from '../audit.ts';

function parseInventory(value: unknown) {
  return typeof value === 'string' ? JSON.parse(value) : value ?? [];
}

function mapMaterial(row: any, campusId: number | null) {
  const inventory = parseInventory(row.inventory).map((item: any) => ({
    campusId: Number(item.campusId), campusName: item.campusName,
    stock: Number(item.stock), warningStock: Number(item.warningStock)
  }));
  const selected = campusId ? inventory.find((item: any) => item.campusId === campusId) : null;
  const stock = selected ? selected.stock : inventory.reduce((sum: number, item: any) => sum + item.stock, 0);
  const warningStock = selected ? selected.warningStock : inventory.reduce((sum: number, item: any) => sum + item.warningStock, 0);
  const price = Number(row.price);
  const costPrice = Number(row.cost_price);
  return {
    ...row, id: Number(row.id), price, cost_price: Number(row.cost_price), stock, warning_stock: warningStock,
    stock_value: Math.round(stock * costPrice * 100) / 100, low_stock: stock <= warningStock, inventory
  };
}

async function changeStock(
  client: pg.PoolClient,
  input: {
    materialId: number; campusId: number; type: 'purchase' | 'issue' | 'return' | 'adjust';
    quantity: number; studentId?: number | null; orderId?: number | null; orderItemId?: number | null;
    remark?: string | null; userId: number;
  }
) {
  const current = (await client.query(
    'SELECT * FROM material_inventory WHERE material_id = $1 AND campus_id = $2 FOR UPDATE',
    [input.materialId, input.campusId]
  )).rows[0];
  if (!current) return { error: 'material inventory not found' as const };
  const absolute = Math.abs(input.quantity);
  const signed = input.type === 'issue' ? -absolute : input.type === 'adjust' ? input.quantity : absolute;
  if (!signed) return { error: 'quantity required' as const };
  const balance = Number(current.stock) + signed;
  if (balance < 0) return { error: 'insufficient material stock' as const, statusCode: 409 };
  await client.query('UPDATE material_inventory SET stock = $1, updated_at = now() WHERE id = $2', [balance, current.id]);
  const transaction = await client.query(
    `INSERT INTO material_transactions
       (material_id, campus_id, type, quantity, balance_after, student_id, order_id, order_item_id, remark, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [input.materialId, input.campusId, input.type, signed, balance, input.studentId ?? null,
     input.orderId ?? null, input.orderItemId ?? null, input.remark?.trim() || null, input.userId]
  );
  return { transaction: transaction.rows[0], stock: balance };
}

export async function materialRoutes(app: FastifyInstance) {
  const guard = [authGuard, requireModule('finance')];

  app.get('/list', { preHandler: guard }, async (request) => {
    const query = request.query as { keyword?: string; campusId?: string; category?: string; status?: string; lowStock?: string };
    const campusId = query.campusId ? Number(query.campusId) : null;
    const params: unknown[] = [];
    const where: string[] = ['1 = 1'];
    if (query.keyword?.trim()) {
      params.push(`%${query.keyword.trim()}%`);
      where.push(`(m.name ILIKE $${params.length} OR COALESCE(m.sku, '') ILIKE $${params.length})`);
    }
    if (query.category) { params.push(query.category); where.push(`m.category = $${params.length}`); }
    if (query.status) { params.push(query.status); where.push(`m.status = $${params.length}`); }
    const rows = (await app.pool.query(
      `SELECT m.*, COALESCE(
         JSON_AGG(JSON_BUILD_OBJECT(
           'campusId', mi.campus_id, 'campusName', c.name, 'stock', mi.stock, 'warningStock', mi.warning_stock
         ) ORDER BY c.name) FILTER (WHERE mi.id IS NOT NULL), '[]'
       ) AS inventory
       FROM materials m
       LEFT JOIN material_inventory mi ON mi.material_id = m.id
       LEFT JOIN campuses c ON c.id = mi.campus_id
       WHERE ${where.join(' AND ')}
       GROUP BY m.id ORDER BY m.name`,
      params
    )).rows.map((row) => mapMaterial(row, campusId));
    const items = query.lowStock === '1' ? rows.filter((item) => item.low_stock) : rows;
    return {
      items, total: items.length,
      summary: {
        total: items.length, active: items.filter((item) => item.status === 'active').length,
        disabled: items.filter((item) => item.status === 'disabled').length,
        lowStock: items.filter((item) => item.low_stock).length,
        stockUnits: items.reduce((sum, item) => sum + item.stock, 0),
        stockValue: Math.round(items.reduce((sum, item) => sum + item.stock_value, 0) * 100) / 100
      }
    };
  });

  app.get('/order-items/pending', { preHandler: guard }, async (request) => {
    const query = request.query as { campusId?: string; studentId?: string };
    return (await app.pool.query(
      `SELECT oi.id, oi.order_id, oi.material_id, oi.name, oi.quantity, oi.unit_price, oi.amount, oi.issue_status,
              o.order_no, o.student_id, o.campus_id, s.name AS student_name, c.name AS campus_name,
              m.name AS material_name, m.unit, COALESCE(mi.stock, 0) AS stock
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       JOIN students s ON s.id = o.student_id
       JOIN materials m ON m.id = oi.material_id
       LEFT JOIN campuses c ON c.id = o.campus_id
       LEFT JOIN material_inventory mi ON mi.material_id = m.id AND mi.campus_id = o.campus_id
       WHERE oi.item_type = 'material' AND oi.material_id IS NOT NULL
         AND oi.issue_status = 'pending' AND o.status <> 'cancelled'
         AND ($1::bigint IS NULL OR o.campus_id = $1)
         AND ($2::bigint IS NULL OR o.student_id = $2)
       ORDER BY o.id DESC, oi.id`,
      [query.campusId ? Number(query.campusId) : null, query.studentId ? Number(query.studentId) : null]
    )).rows.map((row) => ({
      ...row, id: Number(row.id), order_id: Number(row.order_id), material_id: Number(row.material_id),
      student_id: Number(row.student_id), campus_id: row.campus_id === null ? null : Number(row.campus_id),
      quantity: Number(row.quantity), unit_price: Number(row.unit_price), amount: Number(row.amount), stock: Number(row.stock)
    }));
  });

  app.get('/:id/transactions', { preHandler: guard }, async (request) => {
    const id = Number((request.params as { id: string }).id);
    return (await app.pool.query(
      `SELECT mt.*, c.name AS campus_name, s.name AS student_name, o.order_no, u.display_name AS created_by_name
       FROM material_transactions mt
       LEFT JOIN campuses c ON c.id = mt.campus_id
       LEFT JOIN students s ON s.id = mt.student_id
       LEFT JOIN orders o ON o.id = mt.order_id
       LEFT JOIN users u ON u.id = mt.created_by
       WHERE mt.material_id = $1 ORDER BY mt.id DESC LIMIT 100`,
      [id]
    )).rows;
  });

  app.post('/order-items/:id/issue', { preHandler: guard }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const remark = (request.body as { remark?: string } | undefined)?.remark;
    const client = await app.pool.connect();
    try {
      await client.query('BEGIN');
      const item = (await client.query(
        `SELECT oi.*, o.student_id, o.campus_id, o.status AS order_status
         FROM order_items oi JOIN orders o ON o.id = oi.order_id
         WHERE oi.id = $1 FOR UPDATE`,
        [id]
      )).rows[0];
      if (!item) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'order item not found' });
      }
      if (item.order_status === 'cancelled') {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'order cancelled' });
      }
      if (!item.material_id || !item.campus_id) {
        await client.query('ROLLBACK');
        return reply.code(400).send({ error: 'order item is not linked to campus material' });
      }
      if (item.issue_status !== 'pending') {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'material already issued' });
      }
      const changed = await changeStock(client, {
        materialId: Number(item.material_id), campusId: Number(item.campus_id), type: 'issue',
        quantity: Number(item.quantity), studentId: Number(item.student_id), orderId: Number(item.order_id),
        orderItemId: id, remark, userId: request.user!.id
      });
      if ('error' in changed) {
        await client.query('ROLLBACK');
        return reply.code(changed.statusCode ?? 404).send({ error: changed.error });
      }
      await client.query(
        "UPDATE order_items SET issue_status = 'issued', issued_at = now(), issued_by = $1 WHERE id = $2",
        [request.user!.id, id]
      );
      await client.query('COMMIT');
      return changed;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  app.post('/:id/transactions', { preHandler: guard }, async (request, reply) => {
    const materialId = Number((request.params as { id: string }).id);
    const body = request.body as {
      campusId?: number; type?: 'purchase' | 'issue' | 'return' | 'adjust'; quantity?: number;
      studentId?: number; orderId?: number; remark?: string;
    };
    if (!body.campusId || !body.type || !['purchase', 'issue', 'return', 'adjust'].includes(body.type) || !body.quantity) {
      return reply.code(400).send({ error: 'campusId, type and quantity required' });
    }
    const client = await app.pool.connect();
    try {
      await client.query('BEGIN');
      const changed = await changeStock(client, {
        materialId, campusId: Number(body.campusId), type: body.type, quantity: Number(body.quantity),
        studentId: body.studentId ?? null, orderId: body.orderId ?? null, remark: body.remark,
        userId: request.user!.id
      });
      if ('error' in changed) {
        await client.query('ROLLBACK');
        return reply.code(changed.statusCode ?? 404).send({ error: changed.error });
      }
      await client.query('COMMIT');
      await writeAudit(app, request.user!.id, 'material_stock_change', 'material', materialId, {
        type: body.type, quantity: body.quantity, campusId: body.campusId
      });
      return changed;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  app.post('/', { preHandler: guard }, async (request, reply) => {
    const body = request.body as {
      campusId?: number; name?: string; sku?: string; category?: string; unit?: string;
      price?: number; costPrice?: number; initialStock?: number; warningStock?: number; notes?: string;
    };
    if (!body.campusId || !body.name?.trim()) return reply.code(400).send({ error: 'campusId and name required' });
    const initialStock = Number(body.initialStock ?? 0);
    const warningStock = Number(body.warningStock ?? 0);
    if (initialStock < 0 || warningStock < 0) return reply.code(400).send({ error: 'stock cannot be negative' });
    const client = await app.pool.connect();
    try {
      await client.query('BEGIN');
      const material = await client.query(
        `INSERT INTO materials (name, sku, category, unit, price, cost_price, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [body.name.trim(), body.sku?.trim() || null, body.category?.trim() || '教材', body.unit?.trim() || '本',
         body.price ?? 0, body.costPrice ?? 0, body.notes?.trim() || null]
      );
      await client.query(
        'INSERT INTO material_inventory (material_id, campus_id, stock, warning_stock) VALUES ($1,$2,$3,$4)',
        [material.rows[0].id, body.campusId, initialStock, warningStock]
      );
      if (initialStock > 0) {
        await client.query(
          `INSERT INTO material_transactions (material_id, campus_id, type, quantity, balance_after, remark, created_by)
           VALUES ($1,$2,'purchase',$3,$3,'期初库存',$4)`,
          [material.rows[0].id, body.campusId, initialStock, request.user!.id]
        );
      }
      await client.query('COMMIT');
      const campus = (await app.pool.query('SELECT name FROM campuses WHERE id = $1', [body.campusId])).rows[0];
      return {
        ...material.rows[0], id: Number(material.rows[0].id), price: Number(material.rows[0].price),
        cost_price: Number(material.rows[0].cost_price), stock: initialStock, warning_stock: warningStock,
        low_stock: initialStock <= warningStock,
        inventory: [{ campusId: Number(body.campusId), campusName: campus?.name, stock: initialStock, warningStock }]
      };
    } catch (err: any) {
      await client.query('ROLLBACK');
      if (err.code === '23505') return reply.code(409).send({ error: 'material sku exists' });
      throw err;
    } finally {
      client.release();
    }
  });

  app.patch('/:id', { preHandler: guard }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const body = request.body as {
      name?: string; sku?: string; category?: string; unit?: string; price?: number;
      costPrice?: number; status?: string; notes?: string; campusId?: number; warningStock?: number;
    };
    const result = await app.pool.query(
      `UPDATE materials SET name = COALESCE($1, name), sku = COALESCE($2, sku), category = COALESCE($3, category),
         unit = COALESCE($4, unit), price = COALESCE($5, price), cost_price = COALESCE($6, cost_price),
         status = COALESCE($7, status), notes = COALESCE($8, notes), updated_at = now()
       WHERE id = $9 RETURNING *`,
      [body.name ?? null, body.sku?.trim() || null, body.category ?? null, body.unit ?? null,
       body.price ?? null, body.costPrice ?? null, body.status ?? null, body.notes ?? null, id]
    );
    if (!result.rowCount) return reply.code(404).send({ error: 'material not found' });
    if (body.campusId && body.warningStock !== undefined) {
      await app.pool.query(
        'UPDATE material_inventory SET warning_stock = $1, updated_at = now() WHERE material_id = $2 AND campus_id = $3',
        [body.warningStock, id, body.campusId]
      );
    }
    return result.rows[0];
  });
}
