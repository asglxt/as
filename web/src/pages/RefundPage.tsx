import { useEffect, useState, type FormEvent } from 'react';
import Shell from '../Shell.tsx';
import { api } from '../api.ts';

const METHODS = [
  ['cash', '现金'], ['wechat', '微信'], ['alipay', '支付宝'], ['bank', '银行卡/POS'], ['balance', '退回余额']
] as const;

export default function RefundPage() {
  const [students, setStudents] = useState<any[]>([]);
  const [studentId, setStudentId] = useState('');
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [enrollmentId, setEnrollmentId] = useState('');
  const [suggestion, setSuggestion] = useState<any>(null);
  const [form, setForm] = useState({ actualAmount: '', reason: '', method: 'wechat' });
  const [message, setMessage] = useState('');

  useEffect(() => {
    api<any[]>('/api/students').then(setStudents).catch(() => {});
  }, []);

  async function loadEnrollments(id: string) {
    setStudentId(id);
    setEnrollmentId('');
    setSuggestion(null);
    if (!id) {
      setEnrollments([]);
      return;
    }
    setEnrollments(await api<any[]>(`/api/enrollments?studentId=${id}`));
  }

  async function loadSuggestion(id: string) {
    setEnrollmentId(id);
    if (!id) {
      setSuggestion(null);
      return;
    }
    const data = await api<any>(`/api/orders/refund-suggestion?enrollmentId=${id}`);
    setSuggestion(data);
    setForm({ ...form, actualAmount: String(data.suggestedAmount) });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await api('/api/orders/refunds', {
        method: 'POST',
        body: JSON.stringify({
          enrollmentId: Number(enrollmentId),
          actualAmount: Number(form.actualAmount),
          reason: form.reason,
          method: form.method
        })
      });
      setMessage('退费已完成，课时与余额已同步扣减');
      setForm({ actualAmount: '', reason: '', method: 'wechat' });
      setSuggestion(null);
      setEnrollmentId('');
      await loadEnrollments(studentId);
    } catch (err: any) {
      setMessage(err.message);
    }
  }

  return (
    <Shell>
      <h1 className="page-title">退费</h1>
      {message && <p className="subtitle">{message}</p>}

      <div className="form-row">
        <label>学员<select value={studentId} onChange={(e) => loadEnrollments(e.target.value)}>
          <option value="">选择学员</option>
          {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select></label>
        <label>报读课程<select value={enrollmentId} onChange={(e) => loadSuggestion(e.target.value)}>
          <option value="">选择报读记录</option>
          {enrollments.map((e) => (
            <option key={e.id} value={e.id}>{e.lesson_name}（剩余 {Number(e.remaining_hours)} 课时）</option>
          ))}
        </select></label>
      </div>

      {suggestion && (
        <div className="panel">
          <h2>退费计算</h2>
          <p>剩余课时：{suggestion.remainingHours}　课时单价：{suggestion.unitPrice} 元　建议退费金额：<b>{suggestion.suggestedAmount} 元</b></p>
          <form className="form-row" onSubmit={submit}>
            <label>实际退费金额<input value={form.actualAmount} onChange={(e) => setForm({ ...form, actualAmount: e.target.value })} /></label>
            <label>退费原因<input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></label>
            <label>退款方式<select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
              {METHODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select></label>
            <button className="btn primary" type="submit">确认退费</button>
          </form>
        </div>
      )}
    </Shell>
  );
}