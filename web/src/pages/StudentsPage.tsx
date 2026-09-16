import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Columns3, Download, Plus, Search, SlidersHorizontal, Upload, Users } from 'lucide-react';
import Shell from '../Shell.tsx';
import { api } from '../api.ts';

interface StudentItem {
  id: number;
  name: string;
  student_no: string | null;
  status: string;
  campus_name: string | null;
  class_names: string;
  gender: string | null;
  birthday: string | null;
  guardian_phone: string | null;
  source: string | null;
  advisor_name: string | null;
  primary_guardian_name: string | null;
  primary_guardian_phone: string | null;
  age: number | null;
  profile_complete: boolean;
  has_arrears: boolean;
  enrollment_date: string | null;
}

interface StudentListResponse {
  items: StudentItem[];
  total: number;
  page: number;
  pageSize: number;
  summary: { total: number; active: number; inactive: number; graduated: number; profileIncomplete: number; arrears: number };
}

const COLUMN_DEFS = [
  { key: 'studentNo', label: '学员编号' },
  { key: 'gender', label: '性别' },
  { key: 'birthday', label: '生日' },
  { key: 'age', label: '年龄' },
  { key: 'source', label: '来源' },
  { key: 'advisor', label: '课程顾问' },
  { key: 'profile', label: '档案状态' },
  { key: 'arrears', label: '欠费提醒' }
] as const;

const DEFAULT_COLUMNS = Object.fromEntries(COLUMN_DEFS.map((column) => [column.key, true]));

const STATUS_LABELS: Record<string, string> = { active: '在读', inactive: '停课', graduated: '结课' };
const STATUS_CLASSES: Record<string, string> = { active: 'green', inactive: 'orange', graduated: 'blue' };
const EMPTY_FORM = {
  name: '', studentNo: '', campusId: '', gender: '', birthday: '', schoolName: '', grade: '', address: '',
  enrollmentDate: '', source: '', advisorId: '', notes: '', fatherName: '', fatherPhone: '', fatherWechat: '',
  motherName: '', motherPhone: '', motherWechat: '', guardianName: '', guardianRelation: '', guardianPhone: '', guardianWechat: ''
};

export default function StudentsPage() {
  const [data, setData] = useState<StudentListResponse>({ items: [], total: 0, page: 1, pageSize: 20, summary: { total: 0, active: 0, inactive: 0, graduated: 0, profileIncomplete: 0, arrears: 0 } });
  const [campuses, setCampuses] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [message, setMessage] = useState('');
  const [filters, setFilters] = useState({ keyword: '', status: 'active', campusId: '', gender: '', advisorId: '', classId: '', phone: '', source: '', enrollmentStart: '', enrollmentEnd: '', page: 1, pageSize: 20 });
  const [batchForm, setBatchForm] = useState({ status: '', campusId: '', advisorId: '' });
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(DEFAULT_COLUMNS);
  const [form, setForm] = useState(EMPTY_FORM);
  const columnCount = 7 + Object.values(visibleColumns).filter(Boolean).length;

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.keyword.trim()) params.set('keyword', filters.keyword.trim());
    if (filters.status) params.set('status', filters.status);
    if (filters.campusId) params.set('campusId', filters.campusId);
    if (filters.gender) params.set('gender', filters.gender);
    if (filters.advisorId) params.set('advisorId', filters.advisorId);
    if (filters.classId) params.set('classId', filters.classId);
    if (filters.phone.trim()) params.set('phone', filters.phone.trim());
    if (filters.source.trim()) params.set('source', filters.source.trim());
    if (filters.enrollmentStart) params.set('enrollmentStart', filters.enrollmentStart);
    if (filters.enrollmentEnd) params.set('enrollmentEnd', filters.enrollmentEnd);
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
    api<any[]>('/api/roles/staff').then(setStaff).catch(() => {});
    api<any[]>('/api/classes').then(setClasses).catch(() => {});
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

  async function applyBatch() {
    const payload = {
      status: batchForm.status || undefined,
      campusId: batchForm.campusId ? Number(batchForm.campusId) : undefined,
      advisorId: batchForm.advisorId ? Number(batchForm.advisorId) : undefined
    };
    if (!selected.length || (!payload.status && !payload.campusId && !payload.advisorId)) return;
    const result = await api<{ count: number }>('/api/students/batch', {
      method: 'POST',
      body: JSON.stringify({ ids: selected, ...payload })
    });
    setMessage(`已批量调整 ${result.count} 名学员`);
    setBatchForm({ status: '', campusId: '', advisorId: '' });
    await load();
  }

  async function createStudent(e: FormEvent) {
    e.preventDefault();
    try {
      const guardians = [
        form.fatherName || form.fatherPhone ? { name: form.fatherName || '父亲', relation: '父亲', phone: form.fatherPhone, wechat: form.fatherWechat, isPrimary: true, isEmergency: true } : null,
        form.motherName || form.motherPhone ? { name: form.motherName || '母亲', relation: '母亲', phone: form.motherPhone, wechat: form.motherWechat, isEmergency: true } : null,
        form.guardianName || form.guardianPhone ? { name: form.guardianName || '其他监护人', relation: form.guardianRelation || '其他', phone: form.guardianPhone, wechat: form.guardianWechat } : null
      ].filter(Boolean);
      const { fatherName, fatherPhone, fatherWechat, motherName, motherPhone, motherWechat, guardianName, guardianRelation, guardianPhone, guardianWechat, ...student } = form;
      await api('/api/students', {
        method: 'POST',
        body: JSON.stringify({
          ...student,
          campusId: Number(form.campusId),
          advisorId: form.advisorId ? Number(form.advisorId) : null,
          guardianPhone: form.fatherPhone || form.motherPhone || form.guardianPhone,
          guardians
        })
      });
      setMessage('学员已创建');
      setForm(EMPTY_FORM);
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
            <label>学员编号<input value={form.studentNo} onChange={(e) => setForm({ ...form, studentNo: e.target.value })} /></label>
            <label>校区<select required value={form.campusId} onChange={(e) => setForm({ ...form, campusId: e.target.value })}><option value="">选择校区</option>{campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}</select></label>
            <label>性别<select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}><option value="">未设置</option><option value="男">男</option><option value="女">女</option></select></label>
            <label>生日<input type="date" value={form.birthday} onChange={(e) => setForm({ ...form, birthday: e.target.value })} /></label>
            <label>报名日期<input type="date" value={form.enrollmentDate} onChange={(e) => setForm({ ...form, enrollmentDate: e.target.value })} /></label>
            <label>来源<input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} /></label>
            <label>课程顾问<select value={form.advisorId} onChange={(e) => setForm({ ...form, advisorId: e.target.value })}><option value="">未指定</option>{staff.map((item) => <option key={item.id} value={item.id}>{item.display_name}{item.department ? `（${item.department}）` : ''}</option>)}</select></label>
          </div>
          <div className="form-row">
            <label>就读学校<input value={form.schoolName} onChange={(e) => setForm({ ...form, schoolName: e.target.value })} /></label>
            <label>年级<input value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} /></label>
            <label style={{ flex: 1 }}>家庭住址<input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
          </div>
          <div className="panel" style={{ background: '#f8fafc' }}>
            <h2>父亲联系方式</h2>
            <div className="form-row"><label>姓名<input value={form.fatherName} onChange={(e) => setForm({ ...form, fatherName: e.target.value })} /></label><label>电话<input value={form.fatherPhone} onChange={(e) => setForm({ ...form, fatherPhone: e.target.value })} /></label><label>微信<input value={form.fatherWechat} onChange={(e) => setForm({ ...form, fatherWechat: e.target.value })} /></label></div>
          </div>
          <div className="panel" style={{ background: '#f8fafc' }}>
            <h2>母亲联系方式</h2>
            <div className="form-row"><label>姓名<input value={form.motherName} onChange={(e) => setForm({ ...form, motherName: e.target.value })} /></label><label>电话<input value={form.motherPhone} onChange={(e) => setForm({ ...form, motherPhone: e.target.value })} /></label><label>微信<input value={form.motherWechat} onChange={(e) => setForm({ ...form, motherWechat: e.target.value })} /></label></div>
          </div>
          <div className="panel" style={{ background: '#f8fafc' }}>
            <h2>其他监护人</h2>
            <div className="form-row"><label>姓名<input value={form.guardianName} onChange={(e) => setForm({ ...form, guardianName: e.target.value })} /></label><label>关系<input value={form.guardianRelation} onChange={(e) => setForm({ ...form, guardianRelation: e.target.value })} /></label><label>电话<input value={form.guardianPhone} onChange={(e) => setForm({ ...form, guardianPhone: e.target.value })} /></label><label>微信<input value={form.guardianWechat} onChange={(e) => setForm({ ...form, guardianWechat: e.target.value })} /></label></div>
          </div>
          <div className="form-row"><label style={{ flex: 1 }}>备注<textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label></div>
          <button className="btn primary" type="submit">保存学员</button>
        </form>
      )}

      <form className="panel" onSubmit={search}>
        <div className="form-row">
          <label>学员姓名<input value={filters.keyword} onChange={(e) => setFilters({ ...filters, keyword: e.target.value })} placeholder="姓名、编号、家长或联系方式" /></label>
          <label>学员状态<select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">全部状态</option><option value="active">在读</option><option value="inactive">停课</option><option value="graduated">结课</option></select></label>
          <label>报读校区<select value={filters.campusId} onChange={(e) => setFilters({ ...filters, campusId: e.target.value })}><option value="">全部校区</option>{campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}</select></label>
          <label>报读班级<select value={filters.classId} onChange={(e) => setFilters({ ...filters, classId: e.target.value })}><option value="">全部班级</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        </div>
        <details className="filter-more">
          <summary><SlidersHorizontal size={14} />更多筛选</summary>
          <div className="form-row" style={{ marginTop: 12, marginBottom: 4 }}>
            <label>课程顾问<select value={filters.advisorId} onChange={(e) => setFilters({ ...filters, advisorId: e.target.value })}><option value="">全部顾问</option>{staff.map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}</select></label>
            <label>性别<select value={filters.gender} onChange={(e) => setFilters({ ...filters, gender: e.target.value })}><option value="">全部</option><option value="male">男</option><option value="female">女</option></select></label>
            <label>家长手机号<input value={filters.phone} onChange={(e) => setFilters({ ...filters, phone: e.target.value })} placeholder="支持模糊搜索" /></label>
            <label>来源<input value={filters.source} onChange={(e) => setFilters({ ...filters, source: e.target.value })} placeholder="转介绍、自然到访等" /></label>
            <label>报名开始<input type="date" value={filters.enrollmentStart} onChange={(e) => setFilters({ ...filters, enrollmentStart: e.target.value })} /></label>
            <label>报名结束<input type="date" value={filters.enrollmentEnd} onChange={(e) => setFilters({ ...filters, enrollmentEnd: e.target.value })} /></label>
          </div>
        </details>
        <div className="toolbar" style={{ margin: '12px 0 0' }}>
          <button className="btn primary icon-text" type="submit"><Search size={15} />查询</button>
          <button className="btn" type="button" onClick={() => setFilters({ keyword: '', status: 'active', campusId: '', gender: '', advisorId: '', classId: '', phone: '', source: '', enrollmentStart: '', enrollmentEnd: '', page: 1, pageSize: 20 })}>清空筛选</button>
        </div>
      </form>


      <div className="summary-strip">
        <span>学员共计 <b>{data.summary.total}</b> 名</span>
        <span>在读 <b>{data.summary.active}</b></span>
        <span>停课 <b>{data.summary.inactive}</b></span>
        <span>结课 <b>{data.summary.graduated}</b></span>
        <span>待完善档案 <b>{data.summary.profileIncomplete}</b></span>
        <span>欠费学员 <b>{data.summary.arrears}</b></span>
      </div>

      <div className="toolbar">
        <select className="btn" value={batchForm.status} onChange={(e) => setBatchForm({ ...batchForm, status: e.target.value })}><option value="">调整状态</option><option value="active">设为在读</option><option value="inactive">设为停课</option><option value="graduated">设为结课</option></select>
        <select className="btn" value={batchForm.campusId} onChange={(e) => setBatchForm({ ...batchForm, campusId: e.target.value })}><option value="">调整校区</option>{campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}</select>
        <select className="btn" value={batchForm.advisorId} onChange={(e) => setBatchForm({ ...batchForm, advisorId: e.target.value })}><option value="">指定课程顾问</option>{staff.map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}</select>
        <button className="btn primary" type="button" disabled={!selected.length || (!batchForm.status && !batchForm.campusId && !batchForm.advisorId)} onClick={applyBatch}>应用到已选</button>
        <button className="btn icon-text" onClick={exportCsv}><Download size={15} />导出当前结果</button>
        <span className="subtitle">已选择 {selected.length} 人</span>
        <span className="spacer" />
        <details className="column-menu">
          <summary className="btn icon-text"><Columns3 size={15} />列设置</summary>
          <div className="column-menu-popover">
            {COLUMN_DEFS.map((column) => <label key={column.key}><input type="checkbox" checked={Boolean(visibleColumns[column.key])} onChange={(e) => setVisibleColumns({ ...visibleColumns, [column.key]: e.target.checked })} />{column.label}</label>)}
          </div>
        </details>
      </div>

      <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrap">
          <table className="table">
            <thead><tr>
              <th><input type="checkbox" checked={data.items.length > 0 && selected.length === data.items.length} onChange={(e) => toggleAll(e.target.checked)} /></th>
              <th>学员姓名</th><th>学员状态</th><th>报读校区</th><th>报读班级</th>
              {visibleColumns.studentNo && <th>学员编号</th>}
              {visibleColumns.gender && <th>性别</th>}
              {visibleColumns.birthday && <th>生日</th>}
              {visibleColumns.age && <th>年龄</th>}
              <th>主要联系人</th>
              {visibleColumns.source && <th>来源</th>}
              {visibleColumns.advisor && <th>课程顾问</th>}
              {visibleColumns.profile && <th>档案状态</th>}
              {visibleColumns.arrears && <th>欠费提醒</th>}
              <th>报名时间</th>
            </tr></thead>
            <tbody>
              {data.items.map((student) => (
                <tr key={student.id}>
                  <td><input type="checkbox" checked={selected.includes(student.id)} onChange={(e) => toggleOne(student.id, e.target.checked)} /></td>
                  <td><Link to={`/students/${student.id}`}>{student.name}</Link><div className="subtitle">ID {student.id}</div></td>
                  <td><span className={`badge ${STATUS_CLASSES[student.status] ?? ''}`}>{STATUS_LABELS[student.status] ?? student.status}</span></td>
                  <td>{student.campus_name ?? '-'}</td>
                  <td><Link to={`/students/${student.id}?tab=classes`}>{student.class_names || '去分班'}</Link></td>
                  {visibleColumns.studentNo && <td>{student.student_no ?? '-'}</td>}
                  {visibleColumns.gender && <td>{student.gender ?? '-'}</td>}
                  {visibleColumns.birthday && <td>{student.birthday?.slice(0, 10) ?? '-'}</td>}
                  {visibleColumns.age && <td>{student.age ?? '-'}</td>}
                  <td><b>{student.primary_guardian_name ?? '家长'}</b><div className="subtitle">{student.primary_guardian_phone ?? student.guardian_phone ?? '-'}</div></td>
                  {visibleColumns.source && <td>{student.source ?? '-'}</td>}
                  {visibleColumns.advisor && <td>{student.advisor_name ?? '-'}</td>}
                  {visibleColumns.profile && <td><span className={`badge ${student.profile_complete ? 'green' : 'orange'}`}>{student.profile_complete ? '档案完整' : '待完善'}</span></td>}
                  {visibleColumns.arrears && <td>{student.has_arrears ? <span className="badge red">有欠费</span> : <span className="subtitle">无</span>}</td>}
                  <td>{student.enrollment_date?.slice(0, 10) ?? '-'}</td>
                </tr>
              ))}
              {data.items.length === 0 && <tr><td colSpan={columnCount}><div style={{ padding: 36, textAlign: 'center', color: '#8a96a8' }}><Users size={28} /><p>没有符合条件的学员</p></div></td></tr>}
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


