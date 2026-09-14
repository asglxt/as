import type { FastifyInstance } from 'fastify';
import type { Role } from './auth/middleware.ts';

interface User {
  id: number;
  role: Role;
  campusId: number | null;
  studentId: number | null;
}

export async function canAccessClass(app: FastifyInstance, user: User, classId: number): Promise<boolean> {
  if (user.role === 'admin') return true;
  if (user.role === 'teacher') {
    const result = await app.pool.query('SELECT 1 FROM classes WHERE id = $1 AND teacher_id = $2', [classId, user.id]);
    return Boolean(result.rowCount);
  }
  return false;
}
