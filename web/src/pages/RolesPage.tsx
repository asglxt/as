import { useEffect, useState } from 'react';
import Shell from '../Shell.tsx';
import { api } from '../api.ts';

const MODULES = [
  ['dashboard', '工作台'], ['students', '学员'], ['classes', '班级'],
  ['lessons', '课程'], ['schedules', '排课'], ['attendance', '记上课'],
  ['enrollments', '报读'], ['classrooms', '教室'], ['org', '组织架构'],
  ['employees', '员工'], ['roles', '角色权限'],
  ['scores', '成绩'], ['comments', '课堂点评'], ['homework', '作业'],
  ['finance', '财务'],
  ['report', '报表']
] as const;

interface RoleItem {
  id: number;
  name: string;
  is_preset: boolean;
  enabled: boolean;
  modules: string[];
  campusIds: number[];
}

export default function RolesPage() {
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [campuses, setCampuses] = useState<any[]>([]);
  const [current, setCurrent] = useState<Partial<RoleItem>>({});
  const [assignUserId, setAssignUserId] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    setRoles(await api<RoleItem[]>('/api/roles'));
  }

  useEffect(() => {
    load();
    api<any[]>('/api/campuses').then(setCampuses).catch(() => {});
  }, []);

  function toggleModule(key: string) {
    const modules = current.modules ?? [];
    setCurrent({ ...current, modules: modules.includes(key) ? modules.filter((m) => m !== key) : [...modules, key] });
  }

  function toggleCampus(id: number) {
    const campusIds = current.campusIds ?? [];
    setCurrent({ ...current, campusIds: campusIds.includes(id) ? campusIds.filter((c) => c !== id) : [...campusIds, id] });
  }

  async function save() {
    if (!current.name?.trim()) {
      setMessage('请填写角色名称');
      return;
    }
    const payload = { name: current.name, modules: current.modules ?? [], campusIds: current.campusIds ?? [] };
    if (current.id) {
      await api(`/api/roles/${current.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
    } else {
      await api('/api/roles', { method: 'POST', body: JSON.stringify(payload) });
    }
    setMessage('已保存');
    await load();
  }

  async function remove() {
    if (!current.id) return;
    await api(`/api/roles/${current.id}`, { method: 'DELETE' });
    setCurrent({});
    setMessage('已删除');
    await load();
  }

  async function assign() {
    if (!current.id || !assignUserId) {
      setMessage('请选择角色并填写员工 ID');
      return;
    }
    await api(`/api/roles/assign/${assignUserId}`, { method: 'POST', body: JSON.stringify({ roleIds: [current.id] }) });
    setMessage('已分配角色');
  }

  return (
    <Shell>
      <h1 className="page-title">角色权限</h1>
      <div style={{ display: 'flex', gap: 16 }}>
        <div className="panel" style={{ width: 220 }}>
          <h2>角色列表</h2>
          <button className="btn primary" onClick={() => setCurrent({ modules: [], campusIds: [] })}>新建角色</button>
          <ul style={{ listStyle: 'none', padding: 0, marginTop: 12 }}>
            {roles.map((role) => (
              <li key={role.id} style={{ marginBottom: 6 }}>
                <button className="btn" style={{ width: '100%' }} onClick={() => setCurrent({ ...role })}>
                  {role.name}{role.is_preset ? '（预置）' : ''}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="panel" style={{ flex: 1 }}>
          <h2>{current.id ? '编辑角色' : '新建角色'}</h2>
          <div className="form-row">
            <label>角色名称<input value={current.name ?? ''} onChange={(e) => setCurrent({ ...current, name: e.target.value })} /></label>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div className="label">适用校区（不选表示全部校区）</div>
            {campuses.map((campus) => (
              <label key={campus.id} style={{ marginRight: 12 }}>
                <input type="checkbox" checked={(current.campusIds ?? []).includes(campus.id)} onChange={() => toggleCampus(campus.id)} /> {campus.name}
              </label>
            ))}
          </div>
          <div style={{ marginBottom: 12 }}>
            <div className="label">模块权限</div>
            {MODULES.map(([key, label]) => (
              <label key={key} style={{ marginRight: 12, display: 'inline-block' }}>
                <input type="checkbox" checked={(current.modules ?? []).includes(key)} onChange={() => toggleModule(key)} /> {label}
              </label>
            ))}
          </div>
          <div className="form-row">
            <button className="btn primary" onClick={save}>保存</button>
            <button className="btn" onClick={remove} disabled={!current.id || current.is_preset}>删除</button>
            <label>员工 ID<input value={assignUserId} onChange={(e) => setAssignUserId(e.target.value)} /></label>
            <button className="btn" onClick={assign}>分配角色</button>
          </div>
          {message && <p className="subtitle">{message}</p>}
        </div>
      </div>
    </Shell>
  );
}