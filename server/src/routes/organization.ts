import type { FastifyInstance } from 'fastify';
import { authGuard, requireRole } from '../auth/middleware.ts';
import { requireModule } from '../permissions/module_access.ts';

export async function organizationRoutes(app: FastifyInstance) {
  const read = [authGuard, requireModule('org')];
  const write = [authGuard, requireModule('org'), requireRole('admin')];

  app.get('/tree', { preHandler: read }, async () => {
    const campuses = (await app.pool.query(
      `SELECT id, name, code, status FROM campuses ORDER BY sort, id`
    )).rows.map((row) => ({ ...row, id: Number(row.id) }));

    const departments = (await app.pool.query(
      `SELECT d.id, d.campus_id, d.parent_id, d.name, d.code, d.leader_user_id, d.sort, d.status,
              leader.display_name AS leader_name,
              (SELECT COUNT(*) FROM users member WHERE member.department_id = d.id)::int AS staff_count
       FROM departments d
       LEFT JOIN users leader ON leader.id = d.leader_user_id
       ORDER BY d.campus_id, d.sort, d.id`
    )).rows.map((row) => ({
      ...row,
      id: Number(row.id),
      campus_id: Number(row.campus_id),
      parent_id: row.parent_id === null ? null : Number(row.parent_id),
      leader_user_id: row.leader_user_id === null ? null : Number(row.leader_user_id),
      staff_count: Number(row.staff_count)
    }));

    const members = (await app.pool.query(
      `SELECT u.id, u.username, u.display_name, u.role, u.campus_id, u.department_id, u.position_title,
              u.department, u.employee_no, u.is_teacher, u.employment_status, u.contract_end_date,
              camp.name AS campus_name, d.name AS department_name,
              COALESCE(JSON_AGG(JSON_BUILD_OBJECT('id', r.id, 'name', r.name) ORDER BY r.id) FILTER (WHERE r.id IS NOT NULL), '[]') AS roles
       FROM users u
       LEFT JOIN campuses camp ON camp.id = u.campus_id
       LEFT JOIN departments d ON d.id = u.department_id
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       WHERE u.role IN ('admin','teacher')
       GROUP BY u.id, camp.name, d.name
       ORDER BY u.display_name, u.id`
    )).rows.map((row) => ({
      ...row,
      id: Number(row.id),
      campus_id: row.campus_id === null ? null : Number(row.campus_id),
      department_id: row.department_id === null ? null : Number(row.department_id),
      roles: (typeof row.roles === 'string' ? JSON.parse(row.roles) : row.roles).map((role: any) => ({ id: Number(role.id), name: role.name }))
    }));

    return { campuses, departments, members };
  });

  app.get('/departments', { preHandler: read }, async () => {
    return (await app.pool.query(
      `SELECT d.*, campus.name AS campus_name, leader.display_name AS leader_name
       FROM departments d JOIN campuses campus ON campus.id=d.campus_id
       LEFT JOIN users leader ON leader.id=d.leader_user_id
       ORDER BY d.campus_id, d.sort, d.id`
    )).rows.map((row) => ({ ...row, id: Number(row.id), campus_id: Number(row.campus_id), parent_id: row.parent_id === null ? null : Number(row.parent_id) }));
  });

  app.post('/departments', { preHandler: write }, async (request, reply) => {
    const body = request.body as { campusId?: number; parentId?: number; name?: string; code?: string; leaderUserId?: number; sort?: number };
    if (!body.campusId || !body.name?.trim()) return reply.code(400).send({ error: 'campusId and name required' });
    if (body.parentId) {
      const parent = await app.pool.query('SELECT campus_id FROM departments WHERE id=$1', [body.parentId]);
      if (!parent.rowCount || Number(parent.rows[0].campus_id) !== Number(body.campusId)) {
        return reply.code(400).send({ error: 'parent department must belong to the same campus' });
      }
    }
    try {
      const result = await app.pool.query(
        `INSERT INTO departments (campus_id, parent_id, name, code, leader_user_id, sort)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [body.campusId, body.parentId ?? null, body.name.trim(), body.code?.trim() || null, body.leaderUserId ?? null, body.sort ?? 0]
      );
      return result.rows[0];
    } catch (error: any) {
      if (error.code === '23505') return reply.code(409).send({ error: '同级已存在同名部门' });
      throw error;
    }
  });

  app.patch('/departments/:id', { preHandler: write }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const body = request.body as { parentId?: number | null; name?: string; code?: string; leaderUserId?: number | null; sort?: number; status?: string };
    if (body.parentId === id) return reply.code(400).send({ error: 'department cannot be its own parent' });
    if (body.parentId) {
      const descendants = await app.pool.query(
        `WITH RECURSIVE tree AS (
           SELECT id FROM departments WHERE parent_id=$1
           UNION ALL SELECT d.id FROM departments d JOIN tree t ON d.parent_id=t.id
         ) SELECT 1 FROM tree WHERE id=$2 LIMIT 1`,
        [id, body.parentId]
      );
      if (descendants.rowCount) return reply.code(400).send({ error: 'cannot move department under its descendant' });
    }
    const current = await app.pool.query('SELECT campus_id FROM departments WHERE id=$1', [id]);
    if (!current.rowCount) return reply.code(404).send({ error: 'department not found' });
    if (body.parentId) {
      const parent = await app.pool.query('SELECT campus_id FROM departments WHERE id=$1', [body.parentId]);
      if (!parent.rowCount || Number(parent.rows[0].campus_id) !== Number(current.rows[0].campus_id)) {
        return reply.code(400).send({ error: 'parent department must belong to the same campus' });
      }
    }
    try {
      const result = await app.pool.query(
        `UPDATE departments SET
           parent_id = CASE WHEN $1::boolean THEN $2::bigint ELSE parent_id END,
           name = COALESCE($3, name), code = COALESCE($4, code), leader_user_id = COALESCE($5, leader_user_id),
           sort = COALESCE($6, sort), status = COALESCE($7, status), updated_at = now()
         WHERE id = $8 RETURNING *`,
        [Object.prototype.hasOwnProperty.call(body, 'parentId'), body.parentId ?? null, body.name?.trim() || null,
         body.code?.trim() || null, body.leaderUserId ?? null, body.sort ?? null, body.status ?? null, id]
      );
      return result.rows[0];
    } catch (error: any) {
      if (error.code === '23505') return reply.code(409).send({ error: '同级已存在同名部门' });
      throw error;
    }
  });

  app.delete('/departments/:id', { preHandler: write }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const children = await app.pool.query('SELECT COUNT(*)::int AS count FROM departments WHERE parent_id=$1', [id]);
    const members = await app.pool.query('SELECT COUNT(*)::int AS count FROM users WHERE department_id=$1', [id]);
    if (Number(children.rows[0].count) > 0) return reply.code(409).send({ error: '请先删除或调整子部门' });
    if (Number(members.rows[0].count) > 0) return reply.code(409).send({ error: '部门下仍有员工，不能删除' });
    const result = await app.pool.query('DELETE FROM departments WHERE id=$1 RETURNING id', [id]);
    if (!result.rowCount) return reply.code(404).send({ error: 'department not found' });
    return { ok: true };
  });

  app.patch('/members/:id', { preHandler: write }, async (request, reply) => {
    const userId = Number((request.params as { id: string }).id);
    const body = request.body as { departmentId?: number | null; positionTitle?: string | null };
    if (body.departmentId) {
      const department = await app.pool.query('SELECT id, name FROM departments WHERE id=$1', [body.departmentId]);
      if (!department.rowCount) return reply.code(404).send({ error: 'department not found' });
      const result = await app.pool.query(
        `UPDATE users SET department_id=$1, department=$2,
           position_title = CASE WHEN $3::boolean THEN $4::text ELSE position_title END
         WHERE id=$5 AND role IN ('admin','teacher') RETURNING id`,
        [body.departmentId, department.rows[0].name, Object.prototype.hasOwnProperty.call(body, 'positionTitle'), body.positionTitle?.trim() || null, userId]
      );
      if (!result.rowCount) return reply.code(404).send({ error: 'staff not found' });
      return { ok: true };
    }
    const result = await app.pool.query(
      `UPDATE users SET department_id=NULL,
         position_title = CASE WHEN $1::boolean THEN $2::text ELSE position_title END
       WHERE id=$3 AND role IN ('admin','teacher') RETURNING id`,
      [Object.prototype.hasOwnProperty.call(body, 'positionTitle'), body.positionTitle?.trim() || null, userId]
    );
    if (!result.rowCount) return reply.code(404).send({ error: 'staff not found' });
    return { ok: true };
  });
}
