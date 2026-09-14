import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Shell from '../Shell.tsx';
import { api } from '../api.ts';

function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d;
}

function fmt(date: Date) {
  return date.toISOString().slice(0, 10);
}

const DAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const VIEWS = [['time', '时间课表'], ['teacher', '教师课表'], ['classroom', '教室课表'], ['class', '班级课表']] as const;

export default function SchedulesPage() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [view, setView] = useState<string>('time');
  const [schedules, setSchedules] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [classrooms, setClassrooms] = useState<any[]>([]);
  const [campuses, setCampuses] = useState<any[]>([]);
  const [form, setForm] = useState({ classId: '', campusId: '', date: '', startTime: '19:00', endTime: '20:30', teacherId: '', classroomId: '' });
  const [message, setMessage] = useState('');

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [weekStart]);

  async function load() {
    const start = fmt(days[0]);
    const end = fmt(days[6]);
    setSchedules(await api<any[]>(`/api/schedules?start=${start}&end=${end}`));
  }

  useEffect(() => {
    load().catch(() => {});
    api<any[]>('/api/classes').then(setClasses).catch(() => {});
    api<any[]>('/api/classrooms').then(setClassrooms).catch(() => {});
    api<any[]>('/api/campuses').then(setCampuses).catch(() => {});
  }, [weekStart]);

  async function create(e: FormEvent) {
    e.preventDefault();
    try {
      await api('/api/schedules', {
        method: 'POST',
        body: JSON.stringify({
          classId: Number(form.classId),
          campusId: Number(form.campusId),
          date: form.date,
          startTime: form.startTime,
          endTime: form.endTime,
          teacherId: form.teacherId ? Number(form.teacherId) : null,
          classroomId: form.classroomId ? Number(form.classroomId) : null
        })
      });
      setMessage('排课成功');
      await load();
    } catch (err: any) {
      setMessage(err.message);
    }
  }

  function shiftWeek(delta: number) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + delta * 7);
    setWeekStart(d);
  }

  function cardText(item: any) {
    if (view === 'teacher') return `${item.teacher_name ?? '待定'} · ${item.class_name}`;
    if (view === 'classroom') return `${item.classroom_name ?? '待定'} · ${item.class_name}`;
    if (view === 'class') return `${item.class_name} · ${item.teacher_name ?? '待定'}`;
    return `${item.class_name} · ${item.teacher_name ?? '待定'} · ${item.classroom_name ?? '待定'}`;
  }

  return (
    <Shell>
      <h1 className="page-title">排课</h1>
      {message && <p className="subtitle">{message}</p>}
      <div className="form-row">
        <button className="btn" onClick={() => shiftWeek(-1)}>上一周</button>
        <button className="btn" onClick={() => setWeekStart(startOfWeek(new Date()))}>本周</button>
        <button className="btn" onClick={() => shiftWeek(1)}>下一周</button>
        <span className="label">{fmt(days[0])} ~ {fmt(days[6])}</span>
        {VIEWS.map(([key, label]) => (
          <button key={key} className={view === key ? 'btn primary' : 'btn'} onClick={() => setView(key)}>{label}</button>
        ))}
      </div>

      <form className="form-row" onSubmit={create}>
        <label>班级<select value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })}>
          <option value="">选择班级</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></label>
        <label>校区<select value={form.campusId} onChange={(e) => setForm({ ...form, campusId: e.target.value })}>
          <option value="">选择校区</option>
          {campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></label>
        <label>日期<input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
        <label>开始<input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} /></label>
        <label>结束<input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} /></label>
        <label>教师 ID<input value={form.teacherId} onChange={(e) => setForm({ ...form, teacherId: e.target.value })} /></label>
        <label>教室<select value={form.classroomId} onChange={(e) => setForm({ ...form, classroomId: e.target.value })}>
          <option value="">选择教室</option>
          {classrooms.map((r) => <option key={r.id} value={r.id}>{r.campus_name} · {r.name}</option>)}
        </select></label>
        <button className="btn primary" type="submit">排课</button>
      </form>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
        {days.map((day, index) => {
          const dayKey = fmt(day);
          const items = schedules.filter((s) => String(s.schedule_date).slice(0, 10) === dayKey);
          return (
            <div key={dayKey} className="panel" style={{ minHeight: 160 }}>
              <h2 style={{ fontSize: '0.85rem' }}>{DAY_LABELS[index]} {dayKey.slice(5)}</h2>
              {items.length === 0 && <p className="subtitle">无课</p>}
              {items.map((item) => (
                <div key={item.id} style={{ border: '1px solid #e3e5e8', borderRadius: 6, padding: 6, marginBottom: 6, fontSize: '0.72rem' }}>
                  <div><b>{String(item.start_time).slice(0, 5)}-{String(item.end_time).slice(0, 5)}</b></div>
                  <div>{cardText(item)}</div>
                  <div>{item.is_recorded ? '已记上课' : '未记录'}</div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </Shell>
  );
}