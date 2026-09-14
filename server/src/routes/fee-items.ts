import type { FastifyInstance } from 'fastify';
import { authGuard } from '../auth/middleware.ts';
import { requireModule } from '../permissions/module_access.ts';

export async function feeItemRoutes(app: FastifyInstance) {
  const guard = [authGuard, requireModule('finance')];

  app.get('/', { preHandler: guard }, async () => {
    return (await app.pool.query('SELECT * FROM fee_items ORDER BY id')).rows;
  });

  app.post('/', { preHandler: guard }, async (request, reply) => {
    const body = request.body as { name?: string; amount?: number; lessonId?: number };
    if (!body.name?.trim()) return reply.code(400).send({ error: 'name required' });
    const result = await app.pool.query(
      'INSERT INTO fee_items (name, amount, lesson_id) VALUES ($1, $2, $3) RETURNING *',
      [body.name.trim(), body.amount ?? 0, body.lessonId ?? null]
    );
    return result.rows[0];
  });

  app.patch('/:id', { preHandler: guard }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const body = request.body as { name?: string; amount?: number; enabled?: boolean };
    const result = await app.pool.query(
      `UPDATE fee_items SET name = COALESCE($1, name), amount = COALESCE($2, amount), enabled = COALESCE($3, enabled)
       WHERE id = $4 RETURNING *`,
      [body.name ?? null, body.amount ?? null, body.enabled ?? null, id]
    );
    if (!result.rowCount) return reply.code(404).send({ error: 'fee item not found' });
    return result.rows[0];
  });
}