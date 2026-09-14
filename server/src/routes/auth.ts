import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { hashPassword, verifyPassword } from '../auth/password.ts';
import { signToken } from '../auth/token.ts';
import { authGuard, requireRole } from '../auth/middleware.ts';

export async function authRoutes(app: FastifyInstance) {
  app.post('/login', async (request, reply) => {
    const body = request.body as { username?: string; password?: string };
    if (!body.username || !body.password) {
      return reply.code(400).send({ error: 'username and password required' });
    }
    const result = await app.pool.query(
      'SELECT id, username, password_hash, display_name, role, campus_id, student_id FROM users WHERE username = $1',
      [body.username]
    );
    const user = result.rows[0];
    if (!user || !(await verifyPassword(body.password, user.password_hash))) {
      return reply.code(401).send({ error: 'invalid credentials' });
    }
    const token = signToken(
      { userId: user.id, role: user.role, campusId: user.campus_id, studentId: user.student_id },
      app.secret
    );
    return {
      token,
      user: { id: user.id, username: user.username, displayName: user.display_name, role: user.role }
    };
  });

  app.post('/invite', { preHandler: [authGuard, requireRole('admin')] }, async (request, reply) => {
    const body = request.body as { role?: string; studentId?: number; campusId?: number; displayName?: string };
    const role = body.role;
    if (!role || !['parent', 'student', 'teacher'].includes(role) || !body.displayName) {
      return reply.code(400).send({ error: 'role and displayName required' });
    }
    if ((role === 'parent' || role === 'student') && !body.studentId) {
      return reply.code(400).send({ error: 'studentId required for parent or student' });
    }
    const inviteCode = crypto.randomBytes(6).toString('hex');
    const studentId = role === 'student' ? body.studentId : null;
    const result = await app.pool.query(
      `INSERT INTO users (username, password_hash, display_name, role, campus_id, student_id, invite_code)
       VALUES (NULL, '', $1, $2, $3, $4, $5)
       RETURNING id`,
      [body.displayName, role, body.campusId ?? null, studentId, inviteCode]
    );
    if (role === 'parent' && body.studentId) {
      await app.pool.query(
        'INSERT INTO parent_bindings (parent_user_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [result.rows[0].id, body.studentId]
      );
    }
    return { inviteCode, userId: result.rows[0].id };
  });

  app.get('/me', { preHandler: [authGuard] }, async (request) => {
    const result = await app.pool.query(
      'SELECT id, username, display_name, role, campus_id FROM users WHERE id = $1',
      [request.user!.id]
    );
    const user = result.rows[0];
    return { id: user.id, username: user.username, displayName: user.display_name, role: user.role, campusId: user.campus_id };
  });

  app.post('/claim', async (request, reply) => {
    const body = request.body as { inviteCode?: string; username?: string; password?: string };
    if (!body.inviteCode || !body.username || !body.password || body.password.length < 8) {
      return reply.code(400).send({ error: 'inviteCode, username and password (>=8 chars) required' });
    }
    const result = await app.pool.query('SELECT id FROM users WHERE invite_code = $1', [body.inviteCode]);
    const user = result.rows[0];
    if (!user) return reply.code(400).send({ error: 'invalid invite code' });
    await app.pool.query(
      'UPDATE users SET username = $1, password_hash = $2, invite_code = NULL WHERE id = $3',
      [body.username, await hashPassword(body.password), user.id]
    );
    return { ok: true };
  });
}
