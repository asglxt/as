import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3, BookOpenCheck, CalendarDays, CheckCircle2, ChevronRight, ClipboardCheck,
  Clock, GraduationCap, Home, LogOut, MapPin, Minus, PenLine, Plus, Save, Send, Timer, Users
} from 'lucide-react';
import { api } from '../api.ts';
import { useAuth } from '../auth.tsx';

type MobileTab = 'home' | 'attendance' | 'homework' | 'scores' | 'hours';
const STUDENT_STATUS = [['present', '到课'], ['absent', '缺课'], ['leave', '请假'], ['makeup', '补课']] as const;

export default function TeacherMobilePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<MobileTab>('home');
  if (!user || user.role !== 'teacher') {
    return <div className="tm-gate"><GraduationCap size={32} /><h1>教师手机端</h1><p>请使用教师账号登录。</p><button className="tm-primary-action" onClick={() => { if (user) logout(); navigate('/teacher/login'); }}>教师端登录</button></div>;
  }
  return (
    <div className="teacher-mobile">
      <header className="tm-topbar">
        <div><span>教师工作台</span><strong>{user.displayName}</strong></div>
        <button className="tm-icon-button" onClick={logout} title="退出登录"><LogOut size={18} /></button>
      </header>
      <main className="tm-main">
        {tab === 'home' && <HomeTab go={setTab} />}
        {tab === 'attendance' && <AttendanceTab />}
        {tab === 'homework' && <HomeworkTab />}
        {tab === 'scores' && <ScoresTab />}
        {tab === 'hours' && <HoursTab />}
      </main>
      <nav className="tm-bottom-nav">
        <MobileNavItem active={tab === 'home'} icon={<Home size={20} />} label="首页" onClick={() => setTab('home')} />
        <MobileNavItem active={tab === 'attendance'} icon={<ClipboardCheck size={20} />} label="考勤" onClick={() => setTab('attendance')} />
        <MobileNavItem active={tab === 'homework'} icon={<BookOpenCheck size={20} />} label="作业" onClick={() => setTab('homework')} />
        <MobileNavItem active={tab === 'scores'} icon={<BarChart3 size={20} />} label="成绩" onClick={() => setTab('scores')} />
        <MobileNavItem active={tab === 'hours'} icon={<Timer size={20} />} label="课时" onClick={() => setTab('hours')} />
      </nav>
    </div>
  );
}

function MobileNavItem({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return <button className={active ? 'active' : ''} onClick={onClick}>{icon}<span>{label}</span></button>;
}

function HomeTab({ go }: { go: (tab: MobileTab) => void }) {
  const [data, setData] = useState<any>(null);
  const [message, setMessage] = useState('');
  useEffect(() => { api<any>('/api/teacher-mobile/overview').then(setData).catch((err) => setMessage(err.message)); }, []);
  if (!data) return <div className="tm-loading">{message || '正在加载...'}</div>;
  return (
    <>
      <section className="tm-hero">
        <div><span>{data.profile.campus_name ?? '校区'}</span><h1>今天也要轻松上课</h1><p>{data.profile.display_name}老师，今天有 {data.today.length} 节课</p></div>
        <div className="tm-hero-mark"><CalendarDays size={26} /></div>
      </section>
      {message && <div className="tm-message">{message}</div>}
      <section className="tm-stat-grid">
        <div><ClipboardCheck size={18} /><b>{data.stats.pendingAttendance}</b><span>待考勤</span></div>
        <div><BookOpenCheck size={18} /><b>{data.stats.pendingHomework}</b><span>待点评作业</span></div>
        <div><Users size={18} /><b>{data.stats.students}</b><span>我的学生</span></div>
        <div><GraduationCap size={18} /><b>{data.stats.classes}</b><span>我的班级</span></div>
      </section>
      <section className="tm-section">
        <div className="tm-section-title"><h2>今日课程</h2><span>{data.today.length} 节</span></div>
        <div className="tm-course-list">
          {data.today.map((item: any) => <div className="tm-course-card" key={item.schedule_id}>
            <div className="tm-time-block"><strong>{String(item.start_time).slice(0, 5)}</strong><span>{String(item.end_time).slice(0, 5)}</span></div>
            <div className="tm-course-copy"><h3>{item.class_name}</h3><p><MapPin size={13} />{item.classroom_name ?? item.campus_name}</p><span>{item.student_count} 名学生</span></div>
            <button className={item.is_recorded ? 'tm-status done' : 'tm-status'} onClick={() => go('attendance')}>{item.is_recorded ? '已考勤' : '去考勤'}<ChevronRight size={14} /></button>
          </div>)}
          {data.today.length === 0 && <div className="tm-empty">今天没有排课</div>}
        </div>
      </section>
      <section className="tm-section">
        <div className="tm-section-title"><h2>常用操作</h2></div>
        <div className="tm-quick-grid">
          <button onClick={() => go('attendance')}><ClipboardCheck size={22} /><span>点名考勤</span></button>
          <button onClick={() => go('homework')}><BookOpenCheck size={22} /><span>布置与批改</span></button>
          <button onClick={() => go('scores')}><BarChart3 size={22} /><span>录入成绩</span></button>
          <button onClick={() => go('hours')}><Timer size={22} /><span>划扣课时</span></button>
        </div>
      </section>
    </>
  );
}

function AttendanceTab() {
  const [schedules, setSchedules] = useState<any[]>([]);
  const [active, setActive] = useState<any>(null);
  const [roster, setRoster] = useState<any[]>([]);
  const [marks, setMarks] = useState<Record<number, string>>({});
  const [remarks, setRemarks] = useState<Record<number, string>>({});
  const [message, setMessage] = useState('');

  async function load() { setSchedules(await api<any[]>('/api/teacher-mobile/attendance/today')); }
  useEffect(() => { load().catch((err) => setMessage(err.message)); }, []);

  async function open(item: any) {
    setActive(item);
    setMessage('');
    const rows = await api<any[]>(`/api/teacher-mobile/attendance/${item.schedule_id}/roster`);
    setRoster(rows);
    setMarks(Object.fromEntries(rows.map((row) => [Number(row.student_id), row.attendance_status ?? 'present'])));
    setRemarks(Object.fromEntries(rows.map((row) => [Number(row.student_id), row.remark ?? ''])));
  }

  async function submit() {
    if (!active) return;
    try {
      await api(`/api/teacher-mobile/attendance/${active.schedule_id}/record`, {
        method: 'POST',
        body: JSON.stringify({ records: roster.map((row) => ({ studentId: row.student_id, status: marks[row.student_id] ?? 'present', remark: remarks[row.student_id] ?? '' })) })
      });
      setMessage('考勤已保存，课时已按规则扣减');
      setActive(null);
      await load();
    } catch (err: any) { setMessage(err.message); }
  }

  const allMarked = roster.length > 0 && roster.every((row) => marks[Number(row.student_id)]);
  return (
    <section className="tm-page">
      <div className="tm-page-title"><h1>考勤点名</h1><p>到课、缺课和补课扣 1 课时，请假不扣</p></div>
      {message && <div className="tm-message">{message}</div>}
      {!active && <div className="tm-course-list">
        {schedules.map((item) => <button className="tm-attendance-course" key={item.schedule_id} onClick={() => open(item)} disabled={item.is_recorded}>
          <div><strong>{String(item.start_time).slice(0, 5)} · {item.class_name}</strong><span>{item.classroom_name ?? '教室待定'} · {item.student_count} 人</span></div>
          <span className={item.is_recorded ? 'tm-pill done' : 'tm-pill'}>{item.is_recorded ? '已考勤' : '开始点名'}</span>
        </button>)}
        {schedules.length === 0 && <div className="tm-empty">今天没有需要考勤的课程</div>}
      </div>}
      {active && <>
        <div className="tm-active-class"><div><span>正在点名</span><h2>{active.class_name}</h2></div><button onClick={() => setActive(null)}>返回课程</button></div>
        <div className="tm-bulk-actions"><button onClick={() => setMarks(Object.fromEntries(roster.map((row) => [row.student_id, 'present'])))}>全部到课</button><button onClick={() => setMarks(Object.fromEntries(roster.map((row) => [row.student_id, 'leave'])))}>全部请假</button></div>
        <div className="tm-student-list">
          {roster.map((student, index) => <div className="tm-student-card" key={student.student_id}>
            <div className="tm-student-head"><span>{index + 1}</span><div><strong>{student.student_name}</strong><small>剩余 {student.remaining_hours === null ? '-' : Number(student.remaining_hours)} 课时</small></div></div>
            <div className="tm-segment">{STUDENT_STATUS.map(([value, label]) => <button className={(marks[student.student_id] ?? 'present') === value ? 'active' : ''} key={value} onClick={() => setMarks({ ...marks, [student.student_id]: value })}>{label}</button>)}</div>
            <input className="tm-inline-input" value={remarks[student.student_id] ?? ''} onChange={(e) => setRemarks({ ...remarks, [student.student_id]: e.target.value })} placeholder="备注（可选）" />
          </div>)}
        </div>
        <button className="tm-primary-action" disabled={!allMarked} onClick={submit}><CheckCircle2 size={19} />保存考勤并扣课时</button>
      </>}
    </section>
  );
}

function HomeworkTab() {
  const [mode, setMode] = useState<'assign' | 'grade'>('assign');
  const [classes, setClasses] = useState<any[]>([]);
  const [homework, setHomework] = useState<any[]>([]);
  const [form, setForm] = useState({ classId: '', title: '', content: '', dueAt: '' });
  const [active, setActive] = useState<any>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [reviews, setReviews] = useState<Record<number, { score: string; comment: string }>>({});
  const [message, setMessage] = useState('');

  async function load() {
    const [overview, list] = await Promise.all([api<any>('/api/teacher-mobile/overview'), api<any[]>('/api/teacher-mobile/homework')]);
    setClasses(overview.classes);
    setHomework(list);
  }
  useEffect(() => { load().catch((err) => setMessage(err.message)); }, []);

  async function create(status: 'draft' | 'published') {
    try {
      await api('/api/teacher-mobile/homework', {
        method: 'POST', body: JSON.stringify({ classId: Number(form.classId), title: form.title, content: form.content, status, dueAt: form.dueAt || null })
      });
      setMessage(status === 'published' ? '作业已发布' : '草稿已保存');
      setForm({ classId: '', title: '', content: '', dueAt: '' });
      await load();
    } catch (err: any) { setMessage(err.message); }
  }

  async function openRecords(item: any) {
    setActive(item);
    setMessage('');
    setRecords(await api<any[]>(`/api/teacher-mobile/homework/${item.id}/records`));
  }

  async function review(studentId: number) {
    if (!active) return;
    const value = reviews[studentId] ?? { score: '', comment: '' };
    try {
      await api(`/api/teacher-mobile/homework/${active.id}/records/${studentId}/review`, {
        method: 'POST', body: JSON.stringify(value)
      });
      const rows = await api<any[]>(`/api/teacher-mobile/homework/${active.id}/records`);
      setRecords(rows);
      setMessage('作业点评已保存');
    } catch (err: any) { setMessage(err.message); }
  }

  return (
    <section className="tm-page">
      <div className="tm-page-title"><h1>作业中心</h1><p>布置作业、查看提交并完成点评</p></div>
      <div className="tm-switch"><button className={mode === 'assign' ? 'active' : ''} onClick={() => setMode('assign')}><PenLine size={16} />布置作业</button><button className={mode === 'grade' ? 'active' : ''} onClick={() => setMode('grade')}><BookOpenCheck size={16} />批改点评</button></div>
      {message && <div className="tm-message">{message}</div>}
      {mode === 'assign' && <form className="tm-form-card" onSubmit={(e) => { e.preventDefault(); create('published'); }}>
        <label>班级<select required value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })}><option value="">选择班级</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>作业标题<input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="例如：第三单元练习" /></label>
        <label>作业内容<textarea rows={4} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="填写作业要求" /></label>
        <label>截止时间<input type="datetime-local" value={form.dueAt} onChange={(e) => setForm({ ...form, dueAt: e.target.value })} /></label>
        <div className="tm-form-actions"><button type="button" onClick={() => create('draft')}>存草稿</button><button className="primary" type="submit"><Send size={16} />发布作业</button></div>
      </form>}
      {mode === 'grade' && <div className="tm-list">
        {homework.map((item) => <button className="tm-homework-item" key={item.id} onClick={() => openRecords(item)}>
          <div><strong>{item.title}</strong><span>{item.class_name} · {item.submitted_count}/{item.student_count} 已提交</span></div>
          <div><span className={item.reviewed_count >= item.submitted_count && item.submitted_count > 0 ? 'tm-pill done' : 'tm-pill'}>{item.reviewed_count}/{item.submitted_count} 已点评</span><ChevronRight size={15} /></div>
        </button>)}
        {homework.length === 0 && <div className="tm-empty">还没有布置作业</div>}
      </div>}
      {active && <div className="tm-sheet">
        <div className="tm-sheet-head"><div><span>作业点评</span><h2>{active.title}</h2></div><button onClick={() => setActive(null)}>关闭</button></div>
        {records.map((record) => <div className="tm-review-card" key={record.id}>
          <div className="tm-review-head"><strong>{record.student_name}</strong><span className={record.status === 'reviewed' ? 'tm-pill done' : 'tm-pill'}>{record.status === 'not_submitted' ? '未提交' : record.status === 'reviewed' ? '已点评' : '待点评'}</span></div>
          {record.content && <p className="tm-submission">{record.content}</p>}
          <div className="tm-review-inputs"><input type="number" placeholder="分数" value={reviews[record.student_id]?.score ?? record.score ?? ''} onChange={(e) => setReviews({ ...reviews, [record.student_id]: { score: e.target.value, comment: reviews[record.student_id]?.comment ?? record.comment ?? '' } })} /><input placeholder="写点评" value={reviews[record.student_id]?.comment ?? record.comment ?? ''} onChange={(e) => setReviews({ ...reviews, [record.student_id]: { score: reviews[record.student_id]?.score ?? record.score ?? '', comment: e.target.value } })} /></div>
          <button className="tm-secondary-action" disabled={record.status === 'not_submitted'} onClick={() => review(record.student_id)}><Save size={15} />保存点评</button>
        </div>)}
      </div>}
    </section>
  );
}

function ScoresTab() {
  const [classes, setClasses] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);
  const [roster, setRoster] = useState<any[]>([]);
  const [entry, setEntry] = useState({ classId: '', projectId: '', examId: '', examDate: new Date().toISOString().slice(0, 10) });
  const [values, setValues] = useState<Record<number, { score: string; remark: string }>>({});
  const [message, setMessage] = useState('');

  useEffect(() => {
    Promise.all([api<any>('/api/teacher-mobile/overview'), api<any>('/api/teacher-mobile/scores/dictionaries')])
      .then(([overview, dictionaries]) => {
        setClasses(overview.classes);
        setProjects(dictionaries.projects);
        setExams(dictionaries.exams);
      }).catch((err) => setMessage(err.message));
  }, []);

  async function loadRoster(classId: string) {
    setEntry({ ...entry, classId });
    if (!classId) return setRoster([]);
    try {
      const rows = await api<any[]>(`/api/teacher-mobile/scores/roster?classId=${classId}`);
      setRoster(rows);
      setValues({});
    } catch (err: any) { setMessage(err.message); }
  }

  async function save() {
    try {
      const result = await api<{ count: number }>('/api/teacher-mobile/scores/bulk', {
        method: 'POST',
        body: JSON.stringify({
          classId: Number(entry.classId), projectId: Number(entry.projectId), examId: Number(entry.examId), examDate: entry.examDate,
          scores: roster.map((student) => ({ studentId: student.student_id, score: values[student.student_id]?.score ?? '', remark: values[student.student_id]?.remark ?? '' }))
        })
      });
      setMessage(`已保存 ${result.count} 条成绩`);
    } catch (err: any) { setMessage(err.message); }
  }

  return (
    <section className="tm-page">
      <div className="tm-page-title"><h1>成绩录入</h1><p>选择班级和考试，快速录入整班成绩</p></div>
      {message && <div className="tm-message">{message}</div>}
      <div className="tm-form-card"><label>班级<select value={entry.classId} onChange={(e) => loadRoster(e.target.value)}><option value="">选择班级</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><div className="tm-form-row"><label>考试项目<select value={entry.projectId} onChange={(e) => setEntry({ ...entry, projectId: e.target.value })}><option value="">选择项目</option>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>考试名称<select value={entry.examId} onChange={(e) => setEntry({ ...entry, examId: e.target.value })}><option value="">选择考试</option>{exams.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div><label>考试日期<input type="date" value={entry.examDate} onChange={(e) => setEntry({ ...entry, examDate: e.target.value })} /></label></div>
      {roster.length > 0 && <div className="tm-score-list">{roster.map((student) => <div className="tm-score-row" key={student.student_id}><strong>{student.name}</strong><input type="number" placeholder="成绩" value={values[student.student_id]?.score ?? ''} onChange={(e) => setValues({ ...values, [student.student_id]: { score: e.target.value, remark: values[student.student_id]?.remark ?? '' } })} /><input placeholder="备注" value={values[student.student_id]?.remark ?? ''} onChange={(e) => setValues({ ...values, [student.student_id]: { score: values[student.student_id]?.score ?? '', remark: e.target.value } })} /></div>)}</div>}
      {roster.length > 0 && <button className="tm-primary-action" disabled={!entry.projectId || !entry.examId} onClick={save}><Save size={18} />保存全班成绩</button>}
    </section>
  );
}

function HoursTab() {
  const [classes, setClasses] = useState<any[]>([]);
  const [classId, setClassId] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [message, setMessage] = useState('');

  useEffect(() => { api<any>('/api/teacher-mobile/overview').then((data) => setClasses(data.classes)).catch((err) => setMessage(err.message)); }, []);
  async function load(id: string) {
    setClassId(id);
    if (!id) return setRows([]);
    setRows(await api<any[]>(`/api/teacher-mobile/hours?classId=${id}`));
  }
  async function adjust(enrollmentId: number, hours: number, studentName: string) {
    try {
      const result = await api<any>(`/api/teacher-mobile/hours/${enrollmentId}/adjust`, {
        method: 'POST', body: JSON.stringify({ hours, remark: hours < 0 ? `移动端划扣：${studentName}` : `移动端返还：${studentName}` })
      });
      setMessage(`${studentName} 剩余课时已更新为 ${Number(result.remaining_hours)}`);
      await load(classId);
    } catch (err: any) { setMessage(err.message); }
  }

  return (
    <section className="tm-page">
      <div className="tm-page-title"><h1>课时管理</h1><p>查看班级学员剩余课时，可快速划扣或返还</p></div>
      {message && <div className="tm-message">{message}</div>}
      <div className="tm-form-card"><label>选择班级<select value={classId} onChange={(e) => load(e.target.value)}><option value="">选择班级</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
      <div className="tm-hour-list">{rows.map((item) => <div className="tm-hour-card" key={item.enrollment_id}><div><strong>{item.student_name}</strong><span>{item.lesson_name}</span></div><div className="tm-hours"><b>{Number(item.remaining_hours)}</b><small>剩余课时</small></div><div className="tm-hour-actions"><button onClick={() => adjust(item.enrollment_id, -1, item.student_name)}><Minus size={15} />1</button><button onClick={() => adjust(item.enrollment_id, 1, item.student_name)}><Plus size={15} />1</button></div></div>)}{classId && rows.length === 0 && <div className="tm-empty">该班暂无可管理课时</div>}</div>
    </section>
  );
}
