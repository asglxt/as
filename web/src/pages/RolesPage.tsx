import { useEffect, useState } from 'react';
import { Plus, Save, Trash2, UserCog, Users } from 'lucide-react';
import Shell from '../Shell.tsx';
import { api } from '../api.ts';

interface RoleItem {
  id: number;
  name: string;
  is_preset: boolean;
  enabled: boolean;
  modules: string[];
  campusIds: number[];
}

interface PermissionGroup {
  key: string;
  label: string;
  modules: Array<{ key: string; label: string }>;
}

interface StaffItem {
  id: number;
  username: string;
  display_name: string;
  campus_id: number | null;
  campus_name: string | null;
  employee_no: string | null;
  department: string | null;
  is_teacher: boolean;
  employment_status: string;
  contract_end_date: string | null;
  roles: Array<{ id: number; name: string }>;
}

export default function RolesPage() {
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [groups, setGroups] = useState<PermissionGroup[]>([]);
  const [staff, setStaff] = useState<StaffItem[]>([]);
  const [campuses, setCampuses] = useState<any[]>([]);
  const [current, setCurrent] = useState<Partial<RoleItem>>({ modules: [], campusIds: [] });
  const [editingStaff, setEditingStaff] = useState<StaffItem | null>(null);
  const [staffForm, setStaffForm] = useState({ department: '', employeeNo: '', campusId: '', isTeacher: false, employmentStatus: 'active', contractEndDate: '', roleIds: [] as number[] });
  const [message, setMessage] = useState('');

  async function load() {
    const [roleList, groupList, staffList, campusList] = await Promise.all([
      api<RoleItem[]>('/api/roles'),
      api<PermissionGroup[]>('/api/roles/permission-groups'),
      api<StaffItem[]>('/api/roles/staff'),
      api<any[]>('/api/campuses').catch(() => [])
    ]);
    setRoles(roleList);
    setGroups(groupList);
    setStaff(staffList);
    setCampuses(campusList);
  }

  useEffect(() => { load().catch((err) => setMessage(err.message)); }, []);

  useEffect(() => {
    if (!editingStaff) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setEditingStaff(null);
    };
    document.addEventListener('keydown', closeOnEscape);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.body.style.overflow = '';
    };
  }, [editingStaff]);

  function toggleModule(key: string) {
    const modules = current.modules ?? [];
    setCurrent({ ...current, modules: modules.includes(key) ? modules.filter((item) => item !== key) : [...modules, key] });
  }

  function toggleCampus(id: number) {
    const campusIds = current.campusIds ?? [];
    setCurrent({ ...current, campusIds: campusIds.includes(id) ? campusIds.filter((item) => item !== id) : [...campusIds, id] });
  }

  async function saveRole() {
    if (!current.name?.trim()) { setMessage('请填写角色名称'); return; }
    const payload = { name: current.name.trim(), modules: current.modules ?? [], campusIds: current.campusIds ?? [] };
    if (current.id) await api(`/api/roles/${current.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
    else await api('/api/roles', { method: 'POST', body: JSON.stringify(payload) });
    setMessage('角色已保存');
    await load();
  }

  async function removeRole() {
    if (!current.id || current.is_preset) return;
    await api(`/api/roles/${current.id}`, { method: 'DELETE' });
    setCurrent({ modules: [], campusIds: [] });
    setMessage('角色已删除');
    await load();
  }

  function startEditStaff(item: StaffItem) {
    setEditingStaff(item);
    setStaffForm({
      department: item.department ?? '',
      employeeNo: item.employee_no ?? '',
      campusId: item.campus_id ? String(item.campus_id) : '',
      isTeacher: item.is_teacher,
      employmentStatus: item.employment_status,
      contractEndDate: item.contract_end_date?.slice(0, 10) ?? '',
      roleIds: item.roles.map((role) => role.id)
    });
  }

  async function saveStaff() {
    if (!editingStaff) return;
    try {
      await api(`/api/roles/staff/${editingStaff.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...staffForm,
          campusId: staffForm.campusId ? Number(staffForm.campusId) : undefined
        })
      });
      setEditingStaff(null);
      setMessage('员工角色已更新');
      await load();
    } catch (err: any) {
      setMessage(err.message);
    }
  }


  return (
    <Shell>
      <div className="panel-header">
        <div><h1 className="page-title">角色与员工</h1><p className="page-subtitle">按适用校区和业务中心配置权限，并给员工分配多个角色。</p></div>
      </div>
      {message && <div className="summary-strip"><span>{message}</span></div>}

      <div style={{ display: 'grid', gridTemplateColumns: '220px minmax(0, 1fr)', gap: 16 }}>
        <section className="panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="panel-header" style={{ padding: 14, margin: 0, borderBottom: '1px solid #edf1f6' }}><h2>角色列表</h2><button className="btn primary icon-text" onClick={() => setCurrent({ modules: [], campusIds: [] })}><Plus size={14} />新建</button></div>
          <div className="nav-group-items standalone" style={{ padding: 8 }}>
            {roles.map((role) => <button key={role.id} className={current.id === role.id ? 'btn primary' : 'btn'} style={{ textAlign: 'left' }} onClick={() => setCurrent({ ...role })}>{role.name}{role.is_preset ? ' · 预置' : ''}</button>)}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header"><h2>{current.id ? '编辑角色' : '新建角色'}</h2><div className="toolbar" style={{ margin: 0 }}><button className="btn primary icon-text" onClick={saveRole}><Save size={14} />保存</button><button className="btn danger icon-text" disabled={!current.id || current.is_preset} onClick={removeRole}><Trash2 size={14} />删除</button></div></div>
          <div className="form-row"><label>角色名称<input value={current.name ?? ''} onChange={(e) => setCurrent({ ...current, name: e.target.value })} /></label></div>

          <div className="panel" style={{ background: '#f8fafc' }}>
            <h2>适用校区</h2>
            <div className="summary-strip" style={{ marginBottom: 10 }}><span>不选择校区表示拥有全部校区权限。</span></div>
            <div className="toolbar">{campuses.map((campus) => <label key={campus.id} className="btn"><input type="checkbox" checked={(current.campusIds ?? []).includes(campus.id)} onChange={() => toggleCampus(campus.id)} /> {campus.name}</label>)}</div>
          </div>

          <h2 style={{ fontSize: 15 }}>选择权限</h2>
          <div className="workbench-grid">
            {groups.map((group) => (
              <div className="panel" key={group.key} style={{ marginBottom: 0 }}>
                <div className="panel-header"><h2>{group.label}</h2></div>
                <div className="toolbar">{group.modules.map((module) => <label key={module.key} className="btn"><input type="checkbox" checked={(current.modules ?? []).includes(module.key)} onChange={() => toggleModule(module.key)} /> {module.label}</label>)}</div>
              </div>
            ))}
          </div>
          <p className="subtitle">修改角色权限会立即影响拥有该角色的员工，请确认后再保存。</p>
        </section>
      </div>


      <section className="panel">
        <div className="panel-header"><h2>员工角色</h2><span className="subtitle"><Users size={14} /> 共 {staff.length} 名员工</span></div>
        <div className="table-wrap"><table className="table"><thead><tr><th>员工</th><th>部门</th><th>是否教师</th><th>管辖校区</th><th>人事状态</th><th>角色</th><th>操作</th></tr></thead><tbody>
          {staff.map((item) => <tr key={item.id}><td><b>{item.display_name}</b><div className="subtitle">{item.username ?? '-'}</div></td><td>{item.department ?? '-'}</td><td>{item.is_teacher ? '是' : '否'}</td><td>{item.campus_name ?? '全部校区'}</td><td><span className="badge green">{item.employment_status === 'active' ? '正式员工' : item.employment_status}</span></td><td>{item.roles.map((role) => <span className="badge blue" key={role.id} style={{ marginRight: 5 }}>{role.name}</span>)}</td><td><button className="btn icon-text" onClick={() => startEditStaff(item)}><UserCog size={14} />编辑</button></td></tr>)}
        </tbody></table></div>
      </section>

      {editingStaff && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingStaff(null); }}>
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="staff-edit-title">
            <form onSubmit={(event) => { event.preventDefault(); saveStaff(); }}>
              <div className="modal-header">
                <div><h2 id="staff-edit-title">编辑员工角色</h2><p className="subtitle">{editingStaff.display_name} · {editingStaff.username}</p></div>
                <button className="btn" type="button" onClick={() => setEditingStaff(null)}>关闭</button>
              </div>
              <div className="modal-body">
                <div className="form-row">
                  <label>工号<input value={staffForm.employeeNo} onChange={(e) => setStaffForm({ ...staffForm, employeeNo: e.target.value })} /></label>
                  <label>部门<input value={staffForm.department} onChange={(e) => setStaffForm({ ...staffForm, department: e.target.value })} /></label>
                  <label>管辖校区<select value={staffForm.campusId} onChange={(e) => setStaffForm({ ...staffForm, campusId: e.target.value })}><option value="">全部校区</option>{campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}</select></label>
                </div>
                <div className="form-row">
                  <label>是否教师<select value={staffForm.isTeacher ? 'yes' : 'no'} onChange={(e) => setStaffForm({ ...staffForm, isTeacher: e.target.value === 'yes' })}><option value="yes">是</option><option value="no">否</option></select></label>
                  <label>人事状态<select value={staffForm.employmentStatus} onChange={(e) => setStaffForm({ ...staffForm, employmentStatus: e.target.value })}><option value="active">正式员工</option><option value="probation">试用期</option><option value="left">离职</option></select></label>
                  <label>合同到期日<input type="date" value={staffForm.contractEndDate} onChange={(e) => setStaffForm({ ...staffForm, contractEndDate: e.target.value })} /></label>
                </div>
                <div className="panel" style={{ background: '#f8fafc', marginBottom: 0 }}>
                  <h2>分配角色（可多选）</h2>
                  <div className="toolbar">{roles.map((role) => <label key={role.id} className="btn"><input type="checkbox" checked={staffForm.roleIds.includes(role.id)} onChange={(e) => setStaffForm({ ...staffForm, roleIds: e.target.checked ? [...staffForm.roleIds, role.id] : staffForm.roleIds.filter((id) => id !== role.id) })} /> {role.name}</label>)}</div>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn" type="button" onClick={() => setEditingStaff(null)}>取消</button>
                <button className="btn primary icon-text" type="submit"><Save size={14} />保存员工角色</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </Shell>
  );
}


