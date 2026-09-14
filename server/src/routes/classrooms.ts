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

  app.get('/list', { preHandler: guard }, async (request) => {
    const query = request.query as { campusId?: string; status?: string; keyword?: string };
    const params: unknown[] = [];
    const where: string[] = ['1 = 1'];
    if (query.campusId) { params.push(Number(query.campusId)); where.push(`r.campus_id = $${params.length}`); }
    if (query.status) { params.push(query.status); where.push(`r.status = $${params.length}`); }
    if (query.keyword?.trim()) { params.push(`%${query.keyword.trim()}%`); where.push(`r.name ILIKE $${params.length}`); }
    const baseWhere = where.join(' AND ');
    const summary = (await app.pool.query(
      `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE r.status = 'active')::int AS active,
              COUNT(*) FILTER (WHERE r.status = 'disabled')::int AS disabled, COALESCE(SUM(r.capacity),0)::int AS capacity
       FROM classrooms r WHERE ${baseWhere}`,
      params
    )).rows[0];
    const items = (await app.pool.query(
      `SELECT r.*, c.name AS campus_name,
              (SELECT COUNT(*) FROM schedules s WHERE s.classroom_id = r.id AND s.status = 'normal')::int AS schedule_count
       FROM classrooms r JOIN campuses c ON c.id = r.campus_id
       WHERE ${baseWhere} ORDER BY r.campus_id, r.name`,
      params
    )).rows.map((row) => ({ ...row, id: Number(row.id), campus_id: Number(row.campus_id), capacity: row.capacity === null ? null : Number(row.capacity), schedule_count: Number(row.schedule_count) }));
    return { items, total: Number(summary.total), summary: {
      total: Number(summary.total), active: Number(summary.active), disabled: Number(summary.disabled), capacity: Number(summary.capacity)
    } };
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
