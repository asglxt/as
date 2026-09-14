import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Plus, Search, UserMinus, Users } from 'lucide-react';
import Shell from '../Shell.tsx';
import { api } from '../api.ts';
import { useAuth } from '../auth.tsx';

const RECRUIT_LABELS: Record<string, string> = { recruiting: '招生中', full: '已满', closed: '已关闭' };
const EMPTY_FILTERS = { keyword: '', campusId: '', lessonId: '', teacherId: '', recruitStatus: '', includeClosed: '', page: 1, pageSize: 20 };
const EMPTY_FORM = { campusId: '', name: '', subject: '', grade: '', lessonId: '', teacherId: '', assistantId: '', capacity: '', startDate: '', recruitStatus: 'recruiting', schedule: '' };

export default function ClassesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [data, setData] = useState<any>({ items: [], total: 0, page: 1, pageSize: 20, summary: { classes: 0, recruiting: 0, students: 0 } });
  const [campuses, setCampuses] = useState<any[]>([]);
  const [lessons, setLessons] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [assignClass, setAssignClass] = useState<any>(null);
  const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([]);
  const [rosterClass, setRosterClass] = useState<any>(null);
  const [roster, setRoster] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [message, setMessage] = useState('');

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (String(value)) params.set(key, String(value));
    return params.toString();
  }, [filters]);

  async function load() { setData(await api(`/api/classes/list?${queryString}`)); }
  useEffect(() => { load().catch((err) => setMessage(err.message)); }, [queryString]);
  useEffect(() => {
    api<any[]>('/api/campuses').then(setCampuses).catch(() => {});
    api<any[]>('/api/students').then(setStudents).catch(() => {});
    if (isAdmin) {
      api<any[]>('/api/lessons').then(setLessons).catch(() => setLessons([]));
      api<any[]>('/api/roles/staff').then(setStaff).catch(() => setStaff([]));
    }
  }, [isAdmin]);

  async function create(e: FormEvent) {
    e.preventDefault();
    try {
      await api('/api/classes', {
        method: 'POST',
        body: JSON.stringify({ ...form, campusId: Number(form.campusId), lessonId: form.lessonId ? Number(form.lessonId) : null, teacherId: form.teacherId ? Number(form.teacherId) : null, assistantId: form.assistantId ? Number(form.assistantId) : null, capacity: form.capacity ? Number(form.capacity) : null })
      });
      setMessage('班级已创建');
      setForm(EMPTY_FORM);
      setShowCreate(false);
      await load();
    } catch (err: any) { setMessage(err.message); }
  }

  function openAssign(cls: any) { setAssignClass(cls); setSelectedStudentIds([]); }
  function toggleStudent(id: number, checked: boolean) { setSelectedStudentIds(checked ? [...selectedStudentIds, id] : selectedStudentIds.filter((item) => item !== id)); }

  async function assignStudents() {
    if (!assignClass || !selectedStudentIds.length) return;
    const result = await api<{ count: number }>(`/api/classes/${assignClass.id}/students/batch`, { method: 'POST', body: JSON.stringify({ studentIds: selectedStudentIds, lessonId: assignClass.lesson_id, teacherId: assignClass.teacher_id }) });
    setMessage(`已分班 ${result.count} 名学员`);
    setAssignClass(null);
    setSelectedStudentIds([]);
    await load();
  }

  async function openRoster(cls: any) {
    setRosterClass(cls);
    setRoster(await api<any[]>(`/api/classes/${cls.id}/students`));
  }

  async function removeFromClass(studentId: number) {
    if (!rosterClass) return;
    await api(`/api/classes/${rosterClass.id}/students/${studentId}`, { method: 'DELETE' });
    setRoster(await api<any[]>(`/api/classes/${rosterClass.id}/students`));
    await load();
  }

  async function closeClass(cls: any) {
    await api(`/api/classes/${cls.id}`, { method: 'PATCH', body: JSON.stringify({ recruitStatus: 'closed' }) });
    setMessage('班级已结班');
    await load();
  }


  return (
    <Shell>
      <div className="panel-header"><div><h1 className="page-title">班级</h1><p className="page-subtitle">管理开班、课程、班主任、分班和招生状态。</p></div>{isAdmin && <button className="btn primary icon-text" onClick={() => setShowCreate((value) => !value)}><Plus size={15} />新建班级</button>}</div>
      {message && <div className="summary-strip"><span>{message}</span></div>}
      <div className="cards"><div className="stat-card"><b>{data.summary.classes}</b><span>班级数量</span></div><div className="stat-card"><b>{data.summary.recruiting}</b><span>招生中班级</span></div><div className="stat-card"><b>{data.summary.students}</b><span>在读学员</span></div></div>

      <form className="panel" onSubmit={(e) => { e.preventDefault(); setFilters({ ...filters, page: 1 }); }}>
        <div className="form-row">
          <label>班级名称<input value={filters.keyword} onChange={(e) => setFilters({ ...filters, keyword: e.target.value })} /></label>
          <label>校区<select value={filters.campusId} onChange={(e) => setFilters({ ...filters, campusId: e.target.value })}><option value="">全部校区</option>{campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}</select></label>
          {isAdmin && <label>所属课程<select value={filters.lessonId} onChange={(e) => setFilters({ ...filters, lessonId: e.target.value })}><option value="">全部课程</option>{lessons.map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.name}</option>)}</select></label>}
          <label>招生状态<select value={filters.recruitStatus} onChange={(e) => setFilters({ ...filters, recruitStatus: e.target.value })}><option value="">全部状态</option><option value="recruiting">招生中</option><option value="full">已满</option><option value="closed">已关闭</option></select></label>
          <label className="btn"><input type="checkbox" checked={filters.includeClosed === '1'} onChange={(e) => setFilters({ ...filters, includeClosed: e.target.checked ? '1' : '' })} />显示已结班</label>
          <button className="btn primary icon-text" type="submit"><Search size={15} />查询</button>
          <button className="btn" type="button" onClick={() => setFilters(EMPTY_FILTERS)}>清空</button>
        </div>
      </form>

      {showCreate && isAdmin && (
        <form className="panel" onSubmit={create}>
          <div className="panel-header"><h2>新建班级</h2><button type="button" className="btn" onClick={() => setShowCreate(false)}>关闭</button></div>
          <div className="form-row">
            <label>校区<select required value={form.campusId} onChange={(e) => setForm({ ...form, campusId: e.target.value })}><option value="">选择校区</option>{campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}</select></label>
            <label>班级名称<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label>所属课程<select value={form.lessonId} onChange={(e) => setForm({ ...form, lessonId: e.target.value })}><option value="">选择课程</option>{lessons.map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.name}</option>)}</select></label>
            <label>科目<input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></label>
            <label>年级<input value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} /></label>
            <label>班主任<select value={form.teacherId} onChange={(e) => setForm({ ...form, teacherId: e.target.value })}><option value="">待定</option>{staff.map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}</select></label>
            <label>助教<select value={form.assistantId} onChange={(e) => setForm({ ...form, assistantId: e.target.value })}><option value="">待定</option>{staff.map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}</select></label>
            <label>满班人数<input type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} /></label>
            <label>开班日期<input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></label>
            <label>上课时间<input value={form.schedule} onChange={(e) => setForm({ ...form, schedule: e.target.value })} placeholder="例如 每周六 09:00-10:30" /></label>
            <button className="btn primary" type="submit">保存班级</button>
          </div>
        </form>
      )}


      <section className="panel" style={{ padding: 0, overflow: 'hidden' }}><div className="table-wrap"><table className="table"><thead><tr><th>班级名称</th><th>人数</th><th>班主任</th><th>所属课程</th><th>开班校区</th><th>开班日期</th><th>上课时间</th><th>招生状态</th><th>操作</th></tr></thead><tbody>
        {data.items.map((cls: any) => <tr key={cls.id}><td><b>{cls.name}</b><div className="subtitle">{cls.grade} · {cls.subject}</div></td><td>{cls.student_count}/{cls.capacity ?? '-'}</td><td>{cls.teacher_name ?? '待定'}</td><td>{cls.lesson_name ?? '-'}</td><td>{cls.campus_name ?? '-'}</td><td>{cls.start_date?.slice(0, 10) ?? '-'}</td><td>{cls.schedule ?? '待定'}</td><td><span className={cls.recruit_status === 'recruiting' ? 'badge green' : 'badge orange'}>{RECRUIT_LABELS[cls.recruit_status] ?? cls.recruit_status}</span></td><td><div className="toolbar" style={{ margin: 0 }}>{isAdmin && <button className="btn icon-text" onClick={() => openAssign(cls)}><Users size={14} />分班</button>}<button className="btn" onClick={() => openRoster(cls)}>学员</button>{isAdmin && cls.recruit_status !== 'closed' && <button className="btn danger" onClick={() => closeClass(cls)}>结班</button>}</div></td></tr>)}
        {data.items.length === 0 && <tr><td colSpan={9}><div style={{ padding: 36, textAlign: 'center', color: '#8a96a8' }}><Users size={28} /><p>暂无班级</p></div></td></tr>}
      </tbody></table></div></section>
      <div className="toolbar"><span className="subtitle">共 {data.total} 条，第 {data.page} 页</span><span className="spacer" /><button className="btn" disabled={data.page <= 1} onClick={() => setFilters({ ...filters, page: filters.page - 1 })}>上一页</button><button className="btn" disabled={data.page * data.pageSize >= data.total} onClick={() => setFilters({ ...filters, page: filters.page + 1 })}>下一页</button></div>

      {assignClass && (
        <section className="panel">
          <div className="panel-header"><h2>批量分班：{assignClass.name}</h2><button className="btn" onClick={() => setAssignClass(null)}>关闭</button></div>
          <div className="summary-strip"><span>已选择 <b>{selectedStudentIds.length}</b> 名学员</span></div>
          <div className="table-wrap"><table className="table"><thead><tr><th>选择</th><th>学员</th><th>联系电话</th><th>状态</th></tr></thead><tbody>{students.map((student) => <tr key={student.id}><td><input type="checkbox" checked={selectedStudentIds.includes(Number(student.id))} onChange={(e) => toggleStudent(Number(student.id), e.target.checked)} /></td><td>{student.name}</td><td>{student.guardian_phone ?? '-'}</td><td>{student.status}</td></tr>)}</tbody></table></div>
          <button className="btn primary" onClick={assignStudents} disabled={!selectedStudentIds.length}>确认分班</button>
        </section>
      )}

      {rosterClass && (
        <section className="panel">
          <div className="panel-header"><h2>学员名单：{rosterClass.name}</h2><button className="btn" onClick={() => setRosterClass(null)}>关闭</button></div>
          <div className="table-wrap"><table className="table"><thead><tr><th>学员姓名</th><th>状态</th><th>入班日期</th><th>操作</th></tr></thead><tbody>{roster.map((item) => <tr key={item.student_id}><td>{item.student_name}</td><td>{item.status}</td><td>{item.start_date?.slice(0, 10) ?? '-'}</td><td><button className="btn danger icon-text" onClick={() => removeFromClass(Number(item.student_id))}><UserMinus size={14} />移出</button></td></tr>)}</tbody></table></div>
        </section>
      )}
    </Shell>
  );
}

