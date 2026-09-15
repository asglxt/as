import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Building2, Network, Pencil, Plus, Save, Trash2, UserPlus, Users } from 'lucide-react';
import Shell from '../Shell.tsx';
import { api } from '../api.ts';

interface Department {
  id: number;
  campus_id: number;
  parent_id: number | null;
  name: string;
  code: string | null;
  leader_user_id: number | null;
  leader_name: string | null;
  sort: number;
  status: string;
  staff_count: number;
}

interface Member {
  id: number;
  display_name: string;
  username: string;
  campus_id: number | null;
  department_id: number | null;
  department_name: string | null;
  position_title: string | null;
  employee_no: string | null;
  is_teacher: boolean;
  employment_status: string;
  roles: Array<{ id: number; name: string }>;
}

interface OrganizationTree {
  campuses: Array<{ id: number; name: string; code: string | null; status: string }>;
  departments: Department[];
  members: Member[];
}

function DepartmentBranch({ department, children, selectedId, onSelect, onAdd, onEdit, onDelete }: {
  department: Department;
  children: Department[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onAdd: (department: Department) => void;
  onEdit: (department: Department) => void;
  onDelete: (department: Department) => void;
}) {
  const childDepartments = children.filter((item) => item.parent_id === department.id);
  return (
    <div className="org-branch">
      <div className={`org-card ${selectedId === department.id ? 'selected' : ''}`} onClick={() => onSelect(department.id)}>
        <div className="org-card-title"><b>{department.name}</b><span>{department.code ?? '未设置编码'}</span></div>
        <div className="org-card-meta"><span>负责人：{department.leader_name ?? '未指定'}</span><span>{department.staff_count} 人</span></div>
        <div className="toolbar" style={{ margin: '8px 0 0' }}>
          <button className="btn icon-text" type="button" onClick={(event) => { event.stopPropagation(); onAdd(department); }}><Plus size={13} />子部门</button>
          <button className="btn icon-text" type="button" onClick={(event) => { event.stopPropagation(); onEdit(department); }}><Pencil size={13} />编辑</button>
          <button className="btn danger icon-text" type="button" onClick={(event) => { event.stopPropagation(); onDelete(department); }}><Trash2 size={13} />删除</button>
        </div>
      </div>
      {childDepartments.length > 0 && <div className="org-children">{childDepartments.map((child) => <DepartmentBranch key={child.id} department={child} children={children} selectedId={selectedId} onSelect={onSelect} onAdd={onAdd} onEdit={onEdit} onDelete={onDelete} />)}</div>}
    </div>
  );
}

export default function OrganizationPage() {
  const [data, setData] = useState<OrganizationTree>({ campuses: [], departments: [], members: [] });
  const [selectedCampusId, setSelectedCampusId] = useState<number | null>(null);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<number | null>(null);
  const [departmentModal, setDepartmentModal] = useState<any>(null);
  const [memberModal, setMemberModal] = useState<any>(null);
  const [message, setMessage] = useState('');

  async function load() {
    const result = await api<OrganizationTree>('/api/organization/tree');
    setData(result);
    setSelectedCampusId((current) => current ?? result.campuses[0]?.id ?? null);
  }

  useEffect(() => { load().catch((error) => setMessage(error.message)); }, []);

  const departments = useMemo(() => data.departments.filter((item) => item.campus_id === selectedCampusId), [data.departments, selectedCampusId]);
  const members = useMemo(() => data.members.filter((item) => item.campus_id === selectedCampusId), [data.members, selectedCampusId]);
  const selectedDepartment = departments.find((item) => item.id === selectedDepartmentId) ?? null;
  const selectedMembers = members.filter((item) => item.department_id === selectedDepartmentId);
  const unassignedMembers = members.filter((item) => item.department_id === null);

  useEffect(() => {
    if (!departments.length) { setSelectedDepartmentId(null); return; }
    if (!selectedDepartmentId || !departments.some((item) => item.id === selectedDepartmentId)) {
      setSelectedDepartmentId(departments.find((item) => item.parent_id === null)?.id ?? departments[0].id);
    }
  }, [departments, selectedDepartmentId]);

  function openCreate(parent?: Department) {
    setDepartmentModal({ name: '', code: '', parentId: parent?.id ? String(parent.id) : '', leaderUserId: '', sort: 0 });
  }

  function openEdit(department: Department) {
    setDepartmentModal({
      id: department.id, name: department.name, code: department.code ?? '',
      parentId: department.parent_id ? String(department.parent_id) : '',
      leaderUserId: department.leader_user_id ? String(department.leader_user_id) : '', sort: department.sort
    });
  }

  async function saveDepartment(event: FormEvent) {
    event.preventDefault();
    if (!selectedCampusId || !departmentModal.name?.trim()) return;
    const payload = {
      campusId: selectedCampusId,
      parentId: departmentModal.parentId ? Number(departmentModal.parentId) : null,
      name: departmentModal.name,
      code: departmentModal.code,
      leaderUserId: departmentModal.leaderUserId ? Number(departmentModal.leaderUserId) : null,
      sort: Number(departmentModal.sort ?? 0)
    };
    try {
      if (departmentModal.id) await api(`/api/organization/departments/${departmentModal.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      else await api('/api/organization/departments', { method: 'POST', body: JSON.stringify(payload) });
      setDepartmentModal(null);
      setMessage(departmentModal.id ? '部门已更新' : '部门已创建');
      await load();
    } catch (error: any) {
      setMessage(error.message);
    }
  }

  async function removeDepartment(department: Department) {
    if (!window.confirm(`确认删除部门“${department.name}”？`)) return;
    try {
      await api(`/api/organization/departments/${department.id}`, { method: 'DELETE' });
      setMessage('部门已删除');
      await load();
    } catch (error: any) {
      setMessage(error.message);
    }
  }

  async function saveMember(event: FormEvent) {
    event.preventDefault();
    if (!memberModal?.id) return;
    try {
      await api(`/api/organization/members/${memberModal.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ departmentId: memberModal.departmentId ? Number(memberModal.departmentId) : null, positionTitle: memberModal.positionTitle })
      });
      setMemberModal(null);
      setMessage('员工归属已更新');
      await load();
    } catch (error: any) {
      setMessage(error.message);
    }
  }

  return (
    <Shell>
      <div className="panel-header">
        <div><h1 className="page-title">组织架构</h1><p className="page-subtitle">按校区维护部门和子部门，并查看员工归属与岗位。</p></div>
        <button className="btn primary icon-text" type="button" onClick={() => openCreate()}><Plus size={15} />新增部门</button>
      </div>
      {message && <div className="summary-strip"><span>{message}</span></div>}

      <div className="summary-strip">
        <span><Building2 size={14} /> 校区 <b>{data.campuses.length}</b></span>
        <span><Network size={14} /> 部门 <b>{departments.length}</b></span>
        <span><Users size={14} /> 员工 <b>{members.length}</b></span>
        <span>未分配员工 <b>{unassignedMembers.length}</b></span>
      </div>

      <div className="org-layout">
        <section className="panel">
          <div className="panel-header">
            <h2>部门结构</h2>
            <select className="btn" value={selectedCampusId ?? ''} onChange={(event) => setSelectedCampusId(Number(event.target.value))}>
              {data.campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
            </select>
          </div>
          <div className="org-tree">
            {departments.filter((item) => item.parent_id === null).map((department) => (
              <DepartmentBranch key={department.id} department={department} children={departments} selectedId={selectedDepartmentId} onSelect={setSelectedDepartmentId} onAdd={openCreate} onEdit={openEdit} onDelete={removeDepartment} />
            ))}
          </div>
          <button className={`org-unassigned ${selectedDepartmentId === 0 ? 'selected' : ''}`} type="button" onClick={() => setSelectedDepartmentId(0)}>
            <span><Users size={15} />未分配员工</span><b>{unassignedMembers.length} 人</b>
          </button>
        </section>

        <section className="panel">
          <div className="panel-header"><div><h2>{selectedDepartment?.name ?? '未分配员工'}</h2><p className="subtitle">{selectedDepartment ? `${selectedDepartment.code ?? '未设置编码'} · ${selectedDepartment.leader_name ?? '未指定负责人'}` : '尚未归属部门的员工'}</p></div><button className="btn primary icon-text" type="button" onClick={() => setMemberModal({ id: '', departmentId: selectedDepartment ? String(selectedDepartment.id) : '', positionTitle: '' })}><UserPlus size={14} />调整人员</button></div>
          <div className="table-wrap"><table className="table"><thead><tr><th>员工</th><th>岗位</th><th>角色</th><th>状态</th></tr></thead><tbody>
            {(selectedDepartmentId === 0 ? unassignedMembers : selectedMembers).map((member) => <tr key={member.id}><td><b>{member.display_name}</b><div className="subtitle">{member.employee_no ?? member.username}</div></td><td>{member.position_title ?? '未设置'}</td><td>{member.roles.map((role) => <span className="badge blue" key={role.id} style={{ marginRight: 4 }}>{role.name}</span>)}</td><td><span className={`badge ${member.employment_status === 'active' ? 'green' : 'orange'}`}>{member.employment_status === 'active' ? '正式员工' : member.employment_status}</span></td></tr>)}
            {(selectedDepartmentId === 0 ? unassignedMembers : selectedMembers).length === 0 && <tr><td colSpan={4}><p className="subtitle">暂无员工</p></td></tr>}
          </tbody></table></div>
        </section>
      </div>

      {departmentModal && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDepartmentModal(null); }}>
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="department-modal-title">
            <form onSubmit={saveDepartment}>
              <div className="modal-header"><div><h2 id="department-modal-title">{departmentModal.id ? '编辑部门' : '新增部门'}</h2><p className="subtitle">部门归属于当前校区，可选择上级部门和负责人。</p></div><button className="btn" type="button" onClick={() => setDepartmentModal(null)}>关闭</button></div>
              <div className="modal-body">
                <div className="form-row"><label>部门名称<input required value={departmentModal.name} onChange={(event) => setDepartmentModal({ ...departmentModal, name: event.target.value })} autoFocus /></label><label>部门编码<input value={departmentModal.code} onChange={(event) => setDepartmentModal({ ...departmentModal, code: event.target.value })} placeholder="如 ENGLISH" /></label></div>
                <div className="form-row"><label>上级部门<select value={departmentModal.parentId} onChange={(event) => setDepartmentModal({ ...departmentModal, parentId: event.target.value })}><option value="">作为一级部门</option>{departments.filter((item) => item.id !== departmentModal.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>负责人<select value={departmentModal.leaderUserId} onChange={(event) => setDepartmentModal({ ...departmentModal, leaderUserId: event.target.value })}><option value="">未指定</option>{members.map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}</select></label><label>排序<input type="number" value={departmentModal.sort} onChange={(event) => setDepartmentModal({ ...departmentModal, sort: event.target.value })} /></label></div>
              </div>
              <div className="modal-footer"><button className="btn" type="button" onClick={() => setDepartmentModal(null)}>取消</button><button className="btn primary icon-text" type="submit"><Save size={14} />保存部门</button></div>
            </form>
          </section>
        </div>
      )}

      {memberModal && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setMemberModal(null); }}>
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="member-modal-title">
            <form onSubmit={saveMember}>
              <div className="modal-header"><div><h2 id="member-modal-title">调整员工归属</h2><p className="subtitle">选择员工后可以调整部门和岗位。</p></div><button className="btn" type="button" onClick={() => setMemberModal(null)}>关闭</button></div>
              <div className="modal-body"><div className="form-row"><label>员工<select required value={memberModal.id} onChange={(event) => { const member = members.find((item) => item.id === Number(event.target.value)); setMemberModal({ id: event.target.value, departmentId: member?.department_id ? String(member.department_id) : '', positionTitle: member?.position_title ?? '' }); }}><option value="">选择员工</option>{members.map((item) => <option key={item.id} value={item.id}>{item.display_name}{item.department_name ? ` · ${item.department_name}` : ' · 未分配'}</option>)}</select></label><label>所属部门<select value={memberModal.departmentId} onChange={(event) => setMemberModal({ ...memberModal, departmentId: event.target.value })}><option value="">未分配</option>{departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>岗位名称<input value={memberModal.positionTitle} onChange={(event) => setMemberModal({ ...memberModal, positionTitle: event.target.value })} placeholder="如 英语教师、教务主管" /></label></div></div>
              <div className="modal-footer"><button className="btn" type="button" onClick={() => setMemberModal(null)}>取消</button><button className="btn primary icon-text" type="submit"><Save size={14} />保存归属</button></div>
            </form>
          </section>
        </div>
      )}
    </Shell>
  );
}
