import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export type ModuleKey =
  | 'dashboard' | 'students' | 'classes' | 'lessons' | 'schedules'
  | 'attendance' | 'enrollments' | 'classrooms' | 'org' | 'employees' | 'roles'
  | 'scores' | 'comments' | 'homework' | 'finance' | 'report' | 'notifications';

export const ALL_MODULES: ModuleKey[] = [
  'dashboard', 'students', 'classes', 'lessons', 'schedules',
  'attendance', 'enrollments', 'classrooms', 'org', 'employees', 'roles', 'notifications'
];

export const PERMISSION_GROUPS = [
  {
    key: 'workbench',
    label: '工作台',
    modules: [{ key: 'dashboard', label: '工作台' }]
  },
  {
    key: 'operations',
    label: '办理中心',
    modules: [
      { key: 'enrollments', label: '报读' },
      { key: 'finance', label: '财务管理' }
    ]
  },
  {
    key: 'academic',
    label: '教务中心',
    modules: [
      { key: 'students', label: '学员' },
      { key: 'classes', label: '班级' },
      { key: 'lessons', label: '课程' },
      { key: 'classrooms', label: '教室' },
      { key: 'schedules', label: '排课' },
      { key: 'attendance', label: '记上课' }
    ]
  },
  {
    key: 'teaching',
    label: '教学中心',
    modules: [
      { key: 'scores', label: '成绩' },
      { key: 'comments', label: '课堂点评' },
      { key: 'homework', label: '作业' }
    ]
  },
  {
    key: 'reports',
    label: '报表中心',
    modules: [{ key: 'report', label: '报表' }]
  },
  {
    key: 'internal',
    label: '内部管理',
    modules: [
      { key: 'org', label: '组织架构' },
      { key: 'employees', label: '员工' },
      { key: 'roles', label: '角色权限' },
      { key: 'notifications', label: '通知公告' }
    ]
  }
] as const;

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
