import type { FastifyInstance } from 'fastify';
import { authGuard, requireRole } from '../auth/middleware.ts';

export async function campusRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [authGuard] }, async (request) => {
    if (request.user!.role !== 'admin' && request.user!.role !== 'teacher') {
      return [];
    }
    const result = await app.pool.query('SELECT id, name FROM campuses ORDER BY id');
    return result.rows;
  });

  app.post('/', { preHandler: [authGuard, requireRole('admin')] }, async (request, reply) => {
    const body = request.body as { name?: string };
    if (!body.name?.trim()) return reply.code(400).send({ error: 'name required' });
    try {
      const result = await app.pool.query('INSERT INTO campuses (name) VALUES ($1) RETURNING id, name', [body.name.trim()]);
      return result.rows[0];
    } catch (err: any) {
      if (err.code === '23505') return reply.code(409).send({ error: 'campus name exists' });
      throw err;
    }
  });
}
