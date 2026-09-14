import type { FastifyInstance } from 'fastify';

export async function writeAudit(
  app: FastifyInstance,
  actorId: number,
  action: string,
  entityType: string,
  entityId: number | null,
  detail: Record<string, unknown> = {}
): Promise<void> {
  await app.pool.query(
    'INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, detail) VALUES ($1, $2, $3, $4, $5)',
    [actorId, action, entityType, entityId, JSON.stringify(detail)]
  );
}
