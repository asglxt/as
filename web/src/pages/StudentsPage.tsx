import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Download, Plus, Search, Upload, Users } from 'lucide-react';
import Shell from '../Shell.tsx';
import { api } from '../api.ts';

interface StudentItem {
  id: number;
  name: string;
  status: string;
  campus_name: string | null;
  class_names: string;
  gender: string | null;
  birthday: string | null;
  guardian_phone: string | null;
  source: string | null;
  enrollment_date: string | null;
}

interface StudentListResponse {
  items: StudentItem[];
  total: number;
  page: number;
  pageSize: number;
  summary: { total: number; active: number; inactive: number; graduated: number };
}

const STATUS_LABELS: Record<string, string> = { active: '在读', inactive: '停课', graduated: '结课' };
const STATUS_CLASSES: Record<string, string> = { active: 'green', inactive: 'orange', graduated: 'blue' };

export default function StudentsPage() {
  const [data, setData] = useState<StudentListResponse>({ items: [], total: 0, page: 1, pageSize: 20, summary: { total: 0, active: 0, inactive: 0, graduated: 0 } });
  const [campuses, setCampuses] = useState<any[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [message, setMessage] = useState('');
  const [filters, setFilters] = useState({ keyword: '', status: 'active', campusId: '', gender: '', page: 1, pageSize: 20 });
  const [form, setForm] = useState({ name: '', guardianPhone: '', campusId: '', gender: '', birthday: '', enrollmentDate: '', source: '', notes: '' });

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.keyword.trim()) params.set('keyword', filters.keyword.trim());
    if (filters.status) params.set('status', filters.status);
    if (filters.campusId) params.set('campusId', filters.campusId);
    if (filters.gender) params.set('gender', filters.gender);
    params.set('page', String(filters.page));
    params.set('pageSize', String(filters.pageSize));
    return params.toString();
  }, [filters]);

  async function load() {
    const result = await api<StudentListResponse>(`/api/students/list?${queryString}`);
    setData(result);
    setSelected([]);
  }

  useEffect(() => {
    load().catch((err) => setMessage(err.message));
  }, [queryString]);

  useEffect(() => {
    api<any[]>('/api/campuses').then(setCampuses).catch(() => {});
  }, []);

  function search(e: FormEvent) {
    e.preventDefault();
    setFilters((current) => ({ ...current, page: 1 }));
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? data.items.map((item) => item.id) : []);
  }

  function toggleOne(id: number, checked: boolean) {
    setSelected((current) => checked ? [...new Set([...current, id])] : current.filter((item) => item !== id));
  }

  async function batchUpdate(status: string) {
    if (!selected.length || !status) return;
    const result = await api<{ count: number }>('/api/students/batch', {
      method: 'POST',
      body: JSON.stringify({ ids: selected, status })
    });
    setMessage(`已调整 ${result.count} 名学员`);
    await load();
  }

  async function createStudent(e: FormEvent) {
    e.preventDefault();
    try {
      await api('/api/students', {
        method: 'POST',
        body: JSON.stringify({ ...form, campusId: Number(form.campusId) })
      });
      setMessage('学员已创建');
      setForm({ name: '', guardianPhone: '', campusId: '', gender: '', birthday: '', enrollmentDate: '', source: '', notes: '' });
      setShowCreate(false);
      await load();
    } catch (err: any) {
      setMessage(err.message);
    }
  }

  async function exportCsv() {
    const exportQuery = queryString.replace(/page=\d+/, 'page=1').replace(/pageSize=\d+/, 'pageSize=100');
    const result = await api<StudentListResponse>(`/api/students/list?${exportQuery}`);
    const header = ['学员姓名', '状态', '校区', '班级', '性别', '生日', '联系方式', '来源', '报名时间'];
    const rows = result.items.map((item) => [item.name, STATUS_LABELS[item.status] ?? item.status, item.campus_name ?? '', item.class_names, item.gender ?? '', item.birthday ?? '', item.guardian_phone ?? '', item.source ?? '', item.enrollment_date ?? '']);
    const csv = [header, ...rows].map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'students.csv';
    link.click();
    URL.revokeObjectURL(url);
  }


  return (
    <Shell>
      <div className="panel-header">
        <div><h1 className="page-title">学员</h1><p className="page-subtitle">统一管理学员档案、报读状态、联系人和成长记录。</p></div>
        <div className="toolbar" style={{ margin: 0 }}>
          <Link className="btn icon-text" to="/import"><Upload size={15} />批量导入</Link>
          <button className="btn primary icon-text" onClick={() => setShowCreate((value) => !value)}><Plus size={15} />新增学员</button>
        </div>
      </div>

      {message && <div className="summary-strip"><span>{message}</span></div>}

      {showCreate && (
        <form className="panel" onSubmit={createStudent}>
          <div className="panel-header"><h2>新增学员</h2><button type="button" className="btn" onClick={() => setShowCreate(false)}>关闭</button></div>
          <div className="form-row">
            <label>学员姓名<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label>联系方式<input value={form.guardianPhone} onChange={(e) => setForm({ ...form, guardianPhone: e.target.value })} /></label>
            <label>校区<select required value={form.campusId} onChange={(e) => setForm({ ...form, campusId: e.target.value })}><option value="">选择校区</option>{campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}</select></label>
            <label>性别<select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}><option value="">未设置</option><option value="男">男</option><option value="女">女</option></select></label>
            <label>生日<input type="date" value={form.birthday} onChange={(e) => setForm({ ...form, birthday: e.target.value })} /></label>
            <label>报名日期<input type="date" value={form.enrollmentDate} onChange={(e) => setForm({ ...form, enrollmentDate: e.target.value })} /></label>
            <label>来源<input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} /></label>
          </div>
          <div className="form-row"><label style={{ flex: 1 }}>备注<textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label></div>
          <button className="btn primary" type="submit">保存学员</button>
        </form>
      )}

      <form className="panel" onSubmit={search}>
        <div className="form-row">
          <label>学员姓名<input value={filters.keyword} onChange={(e) => setFilters({ ...filters, keyword: e.target.value })} placeholder="姓名或联系方式" /></label>
          <label>学员状态<select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">全部状态</option><option value="active">在读</option><option value="inactive">停课</option><option value="graduated">结课</option></select></label>
          <label>报读校区<select value={filters.campusId} onChange={(e) => setFilters({ ...filters, campusId: e.target.value })}><option value="">全部校区</option>{campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}</select></label>
          <label>性别<select value={filters.gender} onChange={(e) => setFilters({ ...filters, gender: e.target.value })}><option value="">全部</option><option value="male">男</option><option value="female">女</option></select></label>
          <button className="btn primary icon-text" type="submit"><Search size={15} />查询</button>
          <button className="btn" type="button" onClick={() => setFilters({ keyword: '', status: 'active', campusId: '', gender: '', page: 1, pageSize: 20 })}>清空筛选</button>
        </div>
      </form>


      <div className="summary-strip">
        <span>学员共计 <b>{data.summary.total}</b> 名</span>
        <span>在读 <b>{data.summary.active}</b></span>
        <span>停课 <b>{data.summary.inactive}</b></span>
        <span>结课 <b>{data.summary.graduated}</b></span>
      </div>

      <div className="toolbar">
        <select className="btn" value="" onChange={(e) => batchUpdate(e.target.value)}>
          <option value="">批量调整状态</option>
          <option value="active">设为在读</option>
          <option value="inactive">设为停课</option>
          <option value="graduated">设为结课</option>
        </select>
        <button className="btn icon-text" onClick={exportCsv}><Download size={15} />导出当前结果</button>
        <span className="subtitle">已选择 {selected.length} 人</span>
      </div>

      <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th><input type="checkbox" checked={data.items.length > 0 && selected.length === data.items.length} onChange={(e) => toggleAll(e.target.checked)} /></th><th>学员姓名</th><th>学员状态</th><th>报读校区</th><th>报读班级</th><th>性别</th><th>生日</th><th>联系方式</th><th>来源</th><th>报名时间</th></tr></thead>
            <tbody>
              {data.items.map((student) => (
                <tr key={student.id}>
                  <td><input type="checkbox" checked={selected.includes(student.id)} onChange={(e) => toggleOne(student.id, e.target.checked)} /></td>
                  <td><Link to={`/students/${student.id}`}>{student.name}</Link></td>
                  <td><span className={`badge ${STATUS_CLASSES[student.status] ?? ''}`}>{STATUS_LABELS[student.status] ?? student.status}</span></td>
                  <td>{student.campus_name ?? '-'}</td>
                  <td>{student.class_names || '-'}</td>
                  <td>{student.gender ?? '-'}</td>
                  <td>{student.birthday?.slice(0, 10) ?? '-'}</td>
                  <td>{student.guardian_phone ?? '-'}</td>
                  <td>{student.source ?? '-'}</td>
                  <td>{student.enrollment_date?.slice(0, 10) ?? '-'}</td>
                </tr>
              ))}
              {data.items.length === 0 && <tr><td colSpan={10}><div style={{ padding: 36, textAlign: 'center', color: '#8a96a8' }}><Users size={28} /><p>没有符合条件的学员</p></div></td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="toolbar">
        <span className="subtitle">共 {data.total} 条，第 {data.page} 页</span>
        <span className="spacer" />
        <button className="btn" disabled={data.page <= 1} onClick={() => setFilters({ ...filters, page: filters.page - 1 })}>上一页</button>
        <button className="btn" disabled={data.page * data.pageSize >= data.total} onClick={() => setFilters({ ...filters, page: filters.page + 1 })}>下一页</button>
      </div>
    </Shell>
  );
}


