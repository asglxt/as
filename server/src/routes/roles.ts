import type { FastifyInstance } from 'fastify';
import { authGuard } from '../auth/middleware.ts';
import { getMyModules, PERMISSION_GROUPS, requireModule } from '../permissions/module_access.ts';

export async function roleRoutes(app: FastifyInstance) {
  app.get('/my-permissions', { preHandler: [authGuard] }, async (request) => {
    return getMyModules(app, request.user!.id, request.user!.role);
  });

  app.get('/permission-groups', { preHandler: [authGuard, requireModule('roles')] }, async () => {
    return PERMISSION_GROUPS;
  });

  app.get('/staff', { preHandler: [authGuard, requireModule('roles')] }, async () => {
    const rows = (await app.pool.query(
      `SELECT u.id, u.username, u.display_name, u.role, u.campus_id,
              u.employee_no, u.department, u.is_teacher, u.employment_status, u.contract_end_date,
              camp.name AS campus_name,
              COALESCE(
                JSON_AGG(JSON_BUILD_OBJECT('id', r.id, 'name', r.name)
                  ORDER BY r.id) FILTER (WHERE r.id IS NOT NULL),
                '[]'
              ) AS roles
       FROM users u
       LEFT JOIN campuses camp ON camp.id = u.campus_id
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       WHERE u.role IN ('admin', 'teacher')
       GROUP BY u.id, camp.name
       ORDER BY u.id`
    )).rows;
    return rows.map((row) => ({
      ...row,
      id: Number(row.id),
      campus_id: row.campus_id === null ? null : Number(row.campus_id),
      roles: (typeof row.roles === 'string' ? JSON.parse(row.roles) : row.roles).map((role: any) => ({
        id: Number(role.id),
        name: role.name
      }))
    }));
  });

  app.patch('/staff/:id', { preHandler: [authGuard, requireModule('roles')] }, async (request, reply) => {
    const userId = Number((request.params as { id: string }).id);
    const body = request.body as {
      displayName?: string;
      employeeNo?: string;
      department?: string;
      campusId?: number;
      isTeacher?: boolean;
      employmentStatus?: string;
      contractEndDate?: string;
      roleIds?: number[];
    };
    const exists = await app.pool.query("SELECT 1 FROM users WHERE id = $1 AND role IN ('admin','teacher')", [userId]);
    if (!exists.rowCount) return reply.code(404).send({ error: 'staff not found' });
    const client = await app.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE users SET
          display_name = COALESCE($1, display_name),
          employee_no = COALESCE($2, employee_no),
          department = COALESCE($3, department),
          campus_id = COALESCE($4, campus_id),
          is_teacher = COALESCE($5, is_teacher),
          employment_status = COALESCE($6, employment_status),
          contract_end_date = COALESCE($7::date, contract_end_date)
         WHERE id = $8`,
        [
          body.displayName ?? null,
          body.employeeNo ?? null,
          body.department ?? null,
          body.campusId ?? null,
          body.isTeacher ?? null,
          body.employmentStatus ?? null,
          body.contractEndDate || null,
          userId
        ]
      );
      if (Array.isArray(body.roleIds)) {
        await client.query('DELETE FROM user_roles WHERE user_id = $1', [userId]);
        for (const roleId of body.roleIds) {
          await client.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, roleId]);
        }
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    return { ok: true };
  });

  app.get('/', { preHandler: [authGuard, requireModule('roles')] }, async () => {
    const roles = (await app.pool.query('SELECT * FROM roles ORDER BY id')).rows;
    const result = [];
    for (const role of roles) {
      const modules = (await app.pool.query('SELECT module_key FROM role_permissions WHERE role_id = $1', [role.id])).rows.map((r) => r.module_key);
      const campusIds = (await app.pool.query('SELECT campus_id FROM role_campuses WHERE role_id = $1 AND campus_id IS NOT NULL', [role.id])).rows.map((r) => r.campus_id);
      result.push({ ...role, modules, campusIds });
    }
    return result;
  });

  app.post('/', { preHandler: [authGuard, requireModule('roles')] }, async (request, reply) => {
    const body = request.body as { name?: string; modules?: string[]; campusIds?: number[] };
    if (!body.name?.trim()) return reply.code(400).send({ error: 'name required' });
    const client = await app.pool.connect();
    try {
      await client.query('BEGIN');
      const role = await client.query('INSERT INTO roles (name, is_preset) VALUES ($1, false) RETURNING *', [body.name.trim()]);
      const roleId = role.rows[0].id;
      for (const moduleKey of body.modules ?? []) {
        await client.query('INSERT INTO role_permissions (role_id, module_key) VALUES ($1, $2) ON CONFLICT DO NOTHING', [roleId, moduleKey]);
      }
      for (const campusId of body.campusIds ?? []) {
        await client.query('INSERT INTO role_campuses (role_id, campus_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [roleId, campusId]);
      }
      await client.query('COMMIT');
      return { ...role.rows[0], modules: body.modules ?? [], campusIds: body.campusIds ?? [] };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  app.get('/:id', { preHandler: [authGuard, requireModule('roles')] }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const role = (await app.pool.query('SELECT * FROM roles WHERE id = $1', [id])).rows[0];
    if (!role) return reply.code(404).send({ error: 'role not found' });
    const modules = (await app.pool.query('SELECT module_key FROM role_permissions WHERE role_id = $1', [id])).rows.map((r) => r.module_key);
    const campusIds = (await app.pool.query('SELECT campus_id FROM role_campuses WHERE role_id = $1 AND campus_id IS NOT NULL', [id])).rows.map((r) => r.campus_id);
    return { ...role, modules, campusIds };
  });

  app.patch('/:id', { preHandler: [authGuard, requireModule('roles')] }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const body = request.body as { name?: string; enabled?: boolean; modules?: string[]; campusIds?: number[] };
    const client = await app.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE roles SET name = COALESCE($1, name), enabled = COALESCE($2, enabled) WHERE id = $3', [body.name ?? null, body.enabled ?? null, id]);
      if (body.modules) {
        await client.query('DELETE FROM role_permissions WHERE role_id = $1', [id]);
        for (const moduleKey of body.modules) {
          await client.query('INSERT INTO role_permissions (role_id, module_key) VALUES ($1, $2)', [id, moduleKey]);
        }
      }
      if (body.campusIds) {
        await client.query('DELETE FROM role_campuses WHERE role_id = $1', [id]);
        for (const campusId of body.campusIds) {
          await client.query('INSERT INTO role_campuses (role_id, campus_id) VALUES ($1, $2)', [id, campusId]);
        }
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    return { ok: true };
  });

  app.delete('/:id', { preHandler: [authGuard, requireModule('roles')] }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const role = (await app.pool.query('SELECT is_preset FROM roles WHERE id = $1', [id])).rows[0];
    if (!role) return reply.code(404).send({ error: 'role not found' });
    if (role.is_preset) return reply.code(400).send({ error: 'preset role cannot be deleted' });
    await app.pool.query('DELETE FROM roles WHERE id = $1', [id]);
    return { ok: true };
  });

  app.post('/assign/:userId', { preHandler: [authGuard, requireModule('roles')] }, async (request, reply) => {
    const userId = Number((request.params as { userId: string }).userId);
    const body = request.body as { roleIds?: number[] };
    if (!Array.isArray(body.roleIds)) return reply.code(400).send({ error: 'roleIds required' });
    const client = await app.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM user_roles WHERE user_id = $1', [userId]);
      for (const roleId of body.roleIds) {
        await client.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, roleId]);
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    return { ok: true };
  });
}
