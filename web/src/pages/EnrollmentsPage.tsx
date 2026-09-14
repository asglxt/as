import { useEffect, useState, type FormEvent } from 'react';
import Shell from '../Shell.tsx';
import { api } from '../api.ts';

export default function EnrollmentsPage() {
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [lessons, setLessons] = useState<any[]>([]);
  const [campuses, setCampuses] = useState<any[]>([]);
  const [form, setForm] = useState({ studentId: '', lessonId: '', campusId: '', purchasedHours: '', totalFee: '', paidFee: '' });
  const [adjust, setAdjust] = useState({ id: 0, hours: '', remark: '' });
  const [transactions, setTransactions] = useState<any[]>([]);
  const [txFor, setTxFor] = useState<number | null>(null);
  const [message, setMessage] = useState('');

  async function load() {
    setEnrollments(await api<any[]>('/api/enrollments'));
  }

  useEffect(() => {
    load().catch(() => {});
    api<any[]>('/api/students').then(setStudents).catch(() => {});
    api<any[]>('/api/lessons').then(setLessons).catch(() => {});
    api<any[]>('/api/campuses').then(setCampuses).catch(() => {});
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    try {
      await api('/api/enrollments', {
        method: 'POST',
        body: JSON.stringify({
          studentId: Number(form.studentId),
          lessonId: Number(form.lessonId),
          campusId: Number(form.campusId),
          purchasedHours: Number(form.purchasedHours || 0),
          totalFee: Number(form.totalFee || 0),
          paidFee: Number(form.paidFee || 0)
        })
      });
      setMessage('报读成功');
      setForm({ ...form, purchasedHours: '', totalFee: '', paidFee: '' });
      await load();
    } catch (err: any) {
      setMessage(err.message);
    }
  }

  async function submitAdjust(e: FormEvent) {
    e.preventDefault();
    try {
      await api(`/api/enrollments/${adjust.id}/adjust`, {
        method: 'POST',
        body: JSON.stringify({ hours: Number(adjust.hours), remark: adjust.remark })
      });
      setMessage('课时已调整');
      setAdjust({ id: 0, hours: '', remark: '' });
      await load();
    } catch (err: any) {
      setMessage(err.message);
    }
  }

  async function showTransactions(id: number) {
    setTxFor(id);
    setTransactions(await api<any[]>(`/api/enrollments/${id}/transactions`));
  }

  return (
    <Shell>
      <h1 className="page-title">报读与课时</h1>
      {message && <p className="subtitle">{message}</p>}

      <form className="form-row" onSubmit={create}>
        <label>学员<select value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })}>
          <option value="">选择学员</option>
          {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select></label>
        <label>课程<select value={form.lessonId} onChange={(e) => setForm({ ...form, lessonId: e.target.value })}>
          <option value="">选择课程</option>
          {lessons.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select></label>
        <label>校区<select value={form.campusId} onChange={(e) => setForm({ ...form, campusId: e.target.value })}>
          <option value="">选择校区</option>
          {campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></label>
        <label>购买课时<input value={form.purchasedHours} onChange={(e) => setForm({ ...form, purchasedHours: e.target.value })} /></label>
        <label>总学费<input value={form.totalFee} onChange={(e) => setForm({ ...form, totalFee: e.target.value })} /></label>
        <label>实缴<input value={form.paidFee} onChange={(e) => setForm({ ...form, paidFee: e.target.value })} /></label>
        <button className="btn primary" type="submit">新增报读</button>
      </form>

      {adjust.id > 0 && (
        <form className="form-row" onSubmit={submitAdjust}>
          <label>调整课时（正数增加/负数减少）<input value={adjust.hours} onChange={(e) => setAdjust({ ...adjust, hours: e.target.value })} /></label>
          <label>备注<input value={adjust.remark} onChange={(e) => setAdjust({ ...adjust, remark: e.target.value })} /></label>
          <button className="btn primary" type="submit">保存调整</button>
          <button className="btn" type="button" onClick={() => setAdjust({ id: 0, hours: '', remark: '' })}>取消</button>
        </form>
      )}

      <div className="panel">
        <table className="table">
          <thead>
            <tr>
              <th>学员</th><th>课程</th><th>购买课时</th><th>已用</th><th>剩余</th>
              <th>总学费</th><th>实缴</th><th>欠费</th><th>校区</th><th>状态</th><th>操作</th>
            </tr>
          </thead>
          <tbody>
            {enrollments.map((e) => (
              <tr key={e.id}>
                <td>{e.student_name}</td><td>{e.lesson_name}</td>
                <td>{Number(e.purchased_hours)}</td><td>{Number(e.used_hours)}</td><td>{Number(e.remaining_hours)}</td>
                <td>{Number(e.total_fee)}</td><td>{Number(e.paid_fee)}</td><td>{Number(e.arrears)}</td>
                <td>{e.campus_name}</td><td>{e.status}</td>
                <td>
                  <button className="btn" onClick={() => setAdjust({ id: e.id, hours: '', remark: '' })}>调整课时</button>
                  <button className="btn" onClick={() => showTransactions(e.id)}>课时流水</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {txFor && (
        <div className="panel">
          <h2>课时流水 #{txFor}</h2>
          <table className="table">
            <thead><tr><th>类型</th><th>课时</th><th>变动后余额</th><th>备注</th><th>操作人</th><th>时间</th></tr></thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id}>
                  <td>{t.type}</td><td>{Number(t.hours)}</td><td>{Number(t.balance_after)}</td>
                  <td>{t.remark ?? '-'}</td><td>{t.created_by_name ?? '-'}</td>
                  <td>{String(t.created_at).slice(0, 19).replace('T', ' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}