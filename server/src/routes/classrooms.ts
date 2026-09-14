import type { FastifyInstance } from 'fastify';
import { authGuard } from '../auth/middleware.ts';
import { requireModule } from '../permissions/module_access.ts';

export async function classroomRoutes(app: FastifyInstance) {
  const guard = [authGuard, requireModule('classrooms')];

  app.get('/', { preHandler: guard }, async (request) => {
    const campusId = Number((request.query as { campusId?: string }).campusId) || null;
    return (await app.pool.query(
      `SELECT r.*, c.name AS campus_name FROM classrooms r
       JOIN campuses c ON c.id = r.campus_id
       WHERE ($1::bigint IS NULL OR r.campus_id = $1)
       ORDER BY r.campus_id, r.name`,
      [campusId]
    )).rows;
  });

  app.post('/', { preHandler: guard }, async (request, reply) => {
    const body = request.body as { campusId?: number; name?: string; capacity?: number };
    if (!body.campusId || !body.name?.trim()) return reply.code(400).send({ error: 'campusId and name required' });
    try {
      const result = await app.pool.query(
        'INSERT INTO classrooms (campus_id, name, capacity) VALUES ($1, $2, $3) RETURNING *',
        [body.campusId, body.name.trim(), body.capacity ?? null]
      );
      return result.rows[0];
    } catch (err: any) {
      if (err.code === '23505') return reply.code(409).send({ error: 'classroom name exists in campus' });
      throw err;
    }
  });

  app.patch('/:id', { preHandler: guard }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const body = request.body as { name?: string; capacity?: number; status?: string };
    const result = await app.pool.query(
      `UPDATE classrooms SET name = COALESCE($1, name), capacity = COALESCE($2, capacity), status = COALESCE($3, status)
       WHERE id = $4 RETURNING *`,
      [body.name ?? null, body.capacity ?? null, body.status ?? null, id]
    );
    if (!result.rowCount) return reply.code(404).send({ error: 'classroom not found' });
    return result.rows[0];
  });
}