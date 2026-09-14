import { useEffect, useMemo, useState } from 'react';
import { CheckCheck, Search } from 'lucide-react';
import Shell from '../Shell.tsx';
import { api } from '../api.ts';

const STATUS_OPTIONS = [['present', '到课'], ['absent', '缺课'], ['leave', '请假'], ['makeup', '补课']] as const;
const STATUS_LABELS: Record<string, string> = { present: '到课', absent: '缺课', leave: '请假', makeup: '补课' };
const EMPTY_FILTERS = { date: new Date().toISOString().slice(0, 10), keyword: '', campusId: '', teacherId: '', classroomId: '', lessonId: '', status: '', page: 1, pageSize: 50 };

export default function AttendancePage() {
  const [tab, setTab] = useState<'today' | 'summary'>('today');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [data, setData] = useState<any>({ items: [], total: 0, page: 1, pageSize: 50, summary: { total: 0, pending: 0, recorded: 0 } });
  const [campuses, setCampuses] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [classrooms, setClassrooms] = useState<any[]>([]);
  const [lessons, setLessons] = useState<any[]>([]);
  const [activeSchedule, setActiveSchedule] = useState<any>(null);
  const [roster, setRoster] = useState<any[]>([]);
  const [marks, setMarks] = useState<Record<number, string>>({});
  const [remarks, setRemarks] = useState<Record<number, string>>({});
  const [summary, setSummary] = useState<any[]>([]);
  const [summaryStudentId, setSummaryStudentId] = useState('');
  const [students, setStudents] = useState<any[]>([]);
  const [message, setMessage] = useState('');

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (String(value)) params.set(key, String(value));
    return params.toString();
  }, [filters]);

  async function loadToday() { setData(await api(`/api/attendance/list?${queryString}`)); }
  useEffect(() => {
    if (tab === 'today') loadToday().catch((err) => setMessage(err.message));
  }, [tab, queryString]);
  useEffect(() => {
    api<any[]>('/api/campuses').then(setCampuses).catch(() => {});
    api<any[]>('/api/classrooms').then(setClassrooms).catch(() => {});
    api<any[]>('/api/lessons').then(setLessons).catch(() => {});
    api<any[]>('/api/students').then(setStudents).catch(() => {});
    api<any[]>('/api/roles/staff').then((items) => setTeachers(items.filter((item) => item.is_teacher || item.role === 'teacher'))).catch(() => {});
  }, []);
  useEffect(() => {
    if (tab === 'summary') api<any[]>(`/api/attendance/summary${summaryStudentId ? `?studentId=${summaryStudentId}` : ''}`).then(setSummary).catch(() => {});
  }, [tab, summaryStudentId]);

  async function openRoster(item: any) {
    setActiveSchedule(item);
    setMarks({});
    setRemarks({});
    setMessage('');
    setRoster(await api<any[]>(`/api/attendance/students/${item.schedule_id}`));
  }

  function setAll(status: string) {
    setMarks(Object.fromEntries(roster.map((row) => [Number(row.student_id), status])));
  }

  async function submit() {
    if (!activeSchedule) return;
    try {
      await api(`/api/attendance/record/${activeSchedule.schedule_id}`, {
        method: 'POST',
        body: JSON.stringify({ records: roster.map((row) => ({ studentId: Number(row.student_id), status: marks[row.student_id] ?? 'present', remark: remarks[row.student_id] ?? '' })) })
      });
      setMessage('已记上课并扣课时');
      setActiveSchedule(null);
      await loadToday();
    } catch (err: any) { setMessage(err.message); }
  }


  return (
    <Shell>
      <div className="panel-header"><div><h1 className="page-title">记上课</h1><p className="page-subtitle">按日期、教师、教室和课程查看课表，完成点名与课时扣减。</p></div></div>
      <div className="tabs"><button className={tab === 'today' ? 'active' : ''} onClick={() => setTab('today')}>上课记录</button><button className={tab === 'summary' ? 'active' : ''} onClick={() => setTab('summary')}>课时汇总</button></div>
      {message && <div className="summary-strip"><span>{message}</span></div>}

      {tab === 'today' && (
        <>
          <div className="cards"><div className="stat-card"><b>{data.summary.total}</b><span>今日课程</span></div><div className="stat-card"><b>{data.summary.pending}</b><span>待记上课</span></div><div className="stat-card"><b>{data.summary.recorded}</b><span>已记上课</span></div></div>
          <form className="panel" onSubmit={(e) => { e.preventDefault(); setFilters({ ...filters, page: 1 }); }}>
            <div className="form-row">
              <label>日期<input type="date" value={filters.date} onChange={(e) => setFilters({ ...filters, date: e.target.value })} /></label>
              <label>班级/学员<input value={filters.keyword} onChange={(e) => setFilters({ ...filters, keyword: e.target.value })} /></label>
              <label>校区<select value={filters.campusId} onChange={(e) => setFilters({ ...filters, campusId: e.target.value })}><option value="">全部校区</option>{campuses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label>教师<select value={filters.teacherId} onChange={(e) => setFilters({ ...filters, teacherId: e.target.value })}><option value="">全部教师</option>{teachers.map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}</select></label>
              <label>教室<select value={filters.classroomId} onChange={(e) => setFilters({ ...filters, classroomId: e.target.value })}><option value="">全部教室</option>{classrooms.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label>课程<select value={filters.lessonId} onChange={(e) => setFilters({ ...filters, lessonId: e.target.value })}><option value="">全部课程</option>{lessons.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label>状态<select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">全部状态</option><option value="pending">待记上课</option><option value="recorded">已记上课</option></select></label>
              <button className="btn primary icon-text" type="submit"><Search size={15} />查询</button>
            </div>
          </form>

          <section className="panel" style={{ padding: 0, overflow: 'hidden' }}><div className="table-wrap"><table className="table"><thead><tr><th>上课时段</th><th>班级</th><th>所属课程</th><th>教师</th><th>校区</th><th>教室</th><th>人数</th><th>状态</th><th>操作</th></tr></thead><tbody>
            {data.items.map((item: any) => <tr key={item.schedule_id}><td>{String(item.start_time).slice(0, 5)}-{String(item.end_time).slice(0, 5)}</td><td><b>{item.class_name}</b></td><td>{item.lesson_name ?? '-'}</td><td>{item.teacher_name ?? '待定'}</td><td>{item.campus_name}</td><td>{item.classroom_name ?? '-'}</td><td>{item.student_count}</td><td><span className={item.is_recorded ? 'badge green' : 'badge orange'}>{item.is_recorded ? '已记上课' : '待记上课'}</span></td><td><button className="btn primary" disabled={item.is_recorded} onClick={() => openRoster(item)}>{item.is_recorded ? '已记上课' : '记上课'}</button></td></tr>)}
            {data.items.length === 0 && <tr><td colSpan={9}><div style={{ padding: 36, textAlign: 'center', color: '#8a96a8' }}><CheckCheck size={28} /><p>当天没有符合条件的课程</p></div></td></tr>}
          </tbody></table></div></section>

          {activeSchedule && (
            <section className="panel">
              <div className="panel-header"><h2>点名：{activeSchedule.class_name}</h2><button className="btn" onClick={() => setActiveSchedule(null)}>关闭</button></div>
              <div className="toolbar"><button className="btn" onClick={() => setAll('present')}>全部到课</button><button className="btn" onClick={() => setAll('absent')}>全部缺课</button><button className="btn" onClick={() => setAll('leave')}>全部请假</button><button className="btn" onClick={() => setAll('makeup')}>全部补课</button></div>
              <div className="table-wrap"><table className="table"><thead><tr><th>学员</th><th>剩余课时</th><th>出勤状态</th><th>备注</th></tr></thead><tbody>{roster.map((item) => <tr key={item.student_id}><td>{item.student_name}</td><td>{item.remaining_hours === null ? '-' : Number(item.remaining_hours)}</td><td><select value={marks[item.student_id] ?? 'present'} onChange={(e) => setMarks({ ...marks, [item.student_id]: e.target.value })}>{STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td><td><input value={remarks[item.student_id] ?? ''} onChange={(e) => setRemarks({ ...remarks, [item.student_id]: e.target.value })} placeholder="可选" /></td></tr>)}</tbody></table></div>
              <button className="btn primary" onClick={submit}>保存并扣课时</button>
            </section>
          )}
        </>
      )}

      {tab === 'summary' && (
        <section className="panel">
          <div className="panel-header"><h2>课时汇总</h2><select className="btn" value={summaryStudentId} onChange={(e) => setSummaryStudentId(e.target.value)}><option value="">全部学员</option>{students.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
          <div className="table-wrap"><table className="table"><thead><tr><th>学员</th><th>课程</th><th>购买课时</th><th>已用课时</th><th>剩余课时</th></tr></thead><tbody>{summary.map((item) => <tr key={item.enrollment_id}><td>{item.student_name}</td><td>{item.lesson_name}</td><td>{Number(item.purchased_hours)}</td><td>{Number(item.used_hours)}</td><td><b>{Number(item.remaining_hours)}</b></td></tr>)}</tbody></table></div>
        </section>
      )}
    </Shell>
  );
}


