import type { FastifyInstance } from 'fastify';
import { authGuard, requireRole } from '../auth/middleware.ts';

export async function campusRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [authGuard] }, async (request) => {
    if (request.user!.role !== 'admin' && request.user!.role !== 'teacher') {
      return [];
    }
    const result = await app.pool.query(
      `SELECT id, name, code, phone, address, principal, status, sort, notes, created_at, updated_at
       FROM campuses ORDER BY sort, id`
    );
    return result.rows;
  });

  app.post('/', { preHandler: [authGuard, requireRole('admin')] }, async (request, reply) => {
    const body = request.body as {
      name?: string;
      code?: string;
      phone?: string;
      address?: string;
      principal?: string;
      status?: string;
      sort?: number;
      notes?: string;
    };
    if (!body.name?.trim()) return reply.code(400).send({ error: 'name required' });
    try {
      const result = await app.pool.query(
        `INSERT INTO campuses (name, code, phone, address, principal, status, sort, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          body.name.trim(),
          body.code?.trim() || null,
          body.phone?.trim() || null,
          body.address?.trim() || null,
          body.principal?.trim() || null,
          body.status ?? 'active',
          body.sort ?? 0,
          body.notes?.trim() || null
        ]
      );
      return result.rows[0];
    } catch (err: any) {
      if (err.code === '23505') return reply.code(409).send({ error: 'campus name exists' });
      throw err;
    }
  });

  app.patch('/:id', { preHandler: [authGuard, requireRole('admin')] }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const body = request.body as {
      name?: string;
      code?: string;
      phone?: string;
      address?: string;
      principal?: string;
      status?: string;
      sort?: number;
      notes?: string;
    };
    if (body.status && !['active', 'disabled'].includes(body.status)) {
      return reply.code(400).send({ error: 'invalid status' });
    }
    try {
      const result = await app.pool.query(
        `UPDATE campuses SET
          name = COALESCE($1, name),
          code = COALESCE($2, code),
          phone = COALESCE($3, phone),
          address = COALESCE($4, address),
          principal = COALESCE($5, principal),
          status = COALESCE($6, status),
          sort = COALESCE($7, sort),
          notes = COALESCE($8, notes),
          updated_at = now()
         WHERE id = $9
         RETURNING *`,
        [
          body.name?.trim() || null,
          body.code?.trim() || null,
          body.phone?.trim() || null,
          body.address?.trim() || null,
          body.principal?.trim() || null,
          body.status ?? null,
          body.sort ?? null,
          body.notes?.trim() || null,
          id
        ]
      );
      if (!result.rowCount) return reply.code(404).send({ error: 'campus not found' });
      return result.rows[0];
    } catch (err: any) {
      if (err.code === '23505') return reply.code(409).send({ error: 'campus name or code exists' });
      throw err;
    }
  });
}
