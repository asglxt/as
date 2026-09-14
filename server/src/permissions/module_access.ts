import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export type ModuleKey =
  | 'dashboard' | 'students' | 'classes' | 'lessons' | 'schedules'
  | 'attendance' | 'enrollments' | 'classrooms' | 'org' | 'employees' | 'roles'
  | 'scores' | 'comments' | 'homework' | 'finance' | 'report';

export const ALL_MODULES: ModuleKey[] = [
  'dashboard', 'students', 'classes', 'lessons', 'schedules',
  'attendance', 'enrollments', 'classrooms', 'org', 'employees', 'roles'
];

const PRESET_BY_LEGACY: Record<string, string> = {
  teacher: '教师',
  admin: '机构主管'
};

async function getModulesFromRoles(app: FastifyInstance, userId: number, presetName?: string) {
  const direct = await app.pool.query(
    `SELECT DISTINCT rp.module_key
     FROM user_roles ur
     JOIN roles r ON r.id = ur.role_id AND r.enabled
     JOIN role_permissions rp ON rp.role_id = r.id
     WHERE ur.user_id = $1`,
    [userId]
  );
  if (direct.rowCount) return direct.rows.map((row) => row.module_key as ModuleKey);
  if (!presetName) return [];
  const fallback = await app.pool.query(
    `SELECT rp.module_key FROM roles r
     JOIN role_permissions rp ON rp.role_id = r.id
     WHERE r.name = $1 AND r.enabled`,
    [presetName]
  );
  return fallback.rows.map((row) => row.module_key as ModuleKey);
}

export async function getMyModules(app: FastifyInstance, userId: number, legacyRole: string) {
  if (legacyRole === 'admin') return { modules: [...ALL_MODULES], campuses: 'all' as const };
  const modules = await getModulesFromRoles(app, userId, PRESET_BY_LEGACY[legacyRole]);
  const campusRows = await app.pool.query(
    `SELECT DISTINCT rc.campus_id
     FROM user_roles ur
     JOIN role_campuses rc ON rc.role_id = ur.role_id
     WHERE ur.user_id = $1 AND rc.campus_id IS NOT NULL`,
    [userId]
  );
  const campuses = campusRows.rowCount ? campusRows.rows.map((row) => Number(row.campus_id)) : ('all' as const);
  return { modules, campuses };
}

export async function canAccessModule(
  app: FastifyInstance,
  user: { id: number; role: string },
  moduleKey: ModuleKey
) {
  if (user.role === 'admin') return true;
  const modules = await getModulesFromRoles(app, user.id, PRESET_BY_LEGACY[user.role]);
  return modules.includes(moduleKey);
}

export function requireModule(moduleKey: ModuleKey) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user;
    if (!user) return reply.code(401).send({ error: 'unauthorized' });
    const allowed = await canAccessModule(request.server, user, moduleKey);
    if (!allowed) return reply.code(403).send({ error: 'module forbidden' });
  };
}