import { useEffect, useState } from 'react';
import Shell from '../Shell.tsx';
import { api } from '../api.ts';

const STATUS_OPTIONS = [
  ['present', '到课'], ['absent', '缺课'], ['leave', '请假'], ['makeup', '补课']
] as const;

export default function AttendancePage() {
  const [tab, setTab] = useState<'today' | 'summary'>('today');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState<any[]>([]);
  const [roster, setRoster] = useState<any[]>([]);
  const [activeSchedule, setActiveSchedule] = useState<any>(null);
  const [marks, setMarks] = useState<Record<number, string>>({});
  const [summary, setSummary] = useState<any[]>([]);
  const [message, setMessage] = useState('');

  async function loadToday() {
    setItems(await api<any[]>(`/api/attendance/today?date=${date}`));
  }

  useEffect(() => {
    if (tab === 'today') loadToday().catch(() => {});
    if (tab === 'summary') api<any[]>('/api/attendance/summary').then(setSummary).catch(() => {});
  }, [tab, date]);

  async function openRoster(item: any) {
    setActiveSchedule(item);
    setMarks({});
    setMessage('');
    const list = await api<any[]>(`/api/attendance/students/${item.schedule_id}`);
    setRoster(list);
  }

  async function submit() {
    if (!activeSchedule) return;
    try {
      await api(`/api/attendance/record/${activeSchedule.schedule_id}`, {
        method: 'POST',
        body: JSON.stringify({
          records: roster.map((r) => ({ studentId: r.student_id, status: marks[r.student_id] ?? 'present' }))
        })
      });
      setMessage('已记上课并扣课时');
      setActiveSchedule(null);
      await loadToday();
    } catch (err: any) {
      setMessage(err.message);
    }
  }

  return (
    <Shell>
      <h1 className="page-title">记上课</h1>
      <div className="form-row">
        <button className={tab === 'today' ? 'btn primary' : 'btn'} onClick={() => setTab('today')}>今日上课</button>
        <button className={tab === 'summary' ? 'btn primary' : 'btn'} onClick={() => setTab('summary')}>课时汇总</button>
        {tab === 'today' && (
          <label>日期<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        )}
      </div>
      {message && <p className="subtitle">{message}</p>}

      {tab === 'today' && (
        <>
          <div className="panel">
            <table className="table">
              <thead>
                <tr><th>时间</th><th>班级</th><th>课程</th><th>教师</th><th>校区</th><th>教室</th><th>状态</th><th>操作</th></tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.schedule_id}>
                    <td>{String(item.start_time).slice(0, 5)}-{String(item.end_time).slice(0, 5)}</td>
                    <td>{item.class_name}</td>
                    <td>{item.lesson_name ?? '-'}</td>
                    <td>{item.teacher_name ?? '待定'}</td>
                    <td>{item.campus_name}</td>
                    <td>{item.classroom_name ?? '-'}</td>
                    <td>{item.is_recorded ? '已记录' : '未记录'}</td>
                    <td>
                      <button className="btn primary" disabled={item.is_recorded} onClick={() => openRoster(item)}>
                        {item.is_recorded ? '已记上课' : '记上课'}
                      </button>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && <tr><td colSpan={8}>当天没有排课</td></tr>}
              </tbody>
            </table>
          </div>

          {activeSchedule && (
            <div className="panel">
              <h2>{activeSchedule.class_name} · 点名</h2>
              <table className="table">
                <thead><tr><th>学员</th><th>剩余课时</th><th>出勤</th></tr></thead>
                <tbody>
                  {roster.map((r) => (
                    <tr key={r.student_id}>
                      <td>{r.student_name}</td>
                      <td>{r.remaining_hours === null ? '-' : Number(r.remaining_hours)}</td>
                      <td>
                        <select value={marks[r.student_id] ?? 'present'} onChange={(e) => setMarks({ ...marks, [r.student_id]: e.target.value })}>
                          {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                  {roster.length === 0 && <tr><td colSpan={3}>该班级暂无学员</td></tr>}
                </tbody>
              </table>
              <button className="btn primary" onClick={submit}>保存并扣课时</button>
              <button className="btn" onClick={() => setActiveSchedule(null)}>取消</button>
            </div>
          )}
        </>
      )}

      {tab === 'summary' && (
        <div className="panel">
          <table className="table">
            <thead><tr><th>学员</th><th>课程</th><th>购买课时</th><th>已用课时</th><th>剩余课时</th></tr></thead>
            <tbody>
              {summary.map((row) => (
                <tr key={row.enrollment_id}>
                  <td>{row.student_name}</td><td>{row.lesson_name}</td>
                  <td>{Number(row.purchased_hours)}</td><td>{Number(row.used_hours)}</td><td>{Number(row.remaining_hours)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}