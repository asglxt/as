import type { FastifyReply, FastifyRequest } from 'fastify';
import { verifyToken } from './token.ts';

export type Role = 'admin' | 'teacher' | 'parent' | 'student';

export function authGuard(request: FastifyRequest, reply: FastifyReply, done: () => void) {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    reply.code(401).send({ error: 'unauthorized' });
    return;
  }
  try {
    const payload = verifyToken(header.slice(7), request.server.secret);
    request.user = {
      id: payload.userId,
      role: payload.role,
      campusId: payload.campusId,
      studentId: payload.studentId
    };
    done();
  } catch {
    reply.code(401).send({ error: 'invalid token' });
  }
}

export function requireRole(...roles: Role[]) {
  return (request: FastifyRequest, reply: FastifyReply, done: () => void) => {
    if (!request.user || !roles.includes(request.user.role)) {
      reply.code(403).send({ error: 'forbidden' });
      return;
    }
    done();
  };
}
