import type { FastifyInstance } from 'fastify';

export async function resolveCampusIds(
  app: FastifyInstance,
  user: { id: number; role: string },
  requested?: number[]
): Promise<number[] | null> {
  if (user.role === 'admin') return requested && requested.length ? requested : null;
  const rows = (await app.pool.query(
    `SELECT DISTINCT rc.campus_id FROM user_roles ur
     JOIN role_campuses rc ON rc.role_id = ur.role_id
     WHERE ur.user_id = $1 AND rc.campus_id IS NOT NULL`,
    [user.id]
  )).rows.map((r) => Number(r.campus_id));
  const allowed = rows.length ? rows : null;
  if (!requested || requested.length === 0) return allowed;
  if (!allowed) return requested;
  return requested.filter((id) => allowed.includes(id));
}