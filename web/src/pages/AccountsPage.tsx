import { useEffect, useState, type FormEvent } from 'react';
import Shell from '../Shell.tsx';
import { api } from '../api.ts';

export default function AccountsPage() {
  const [tab, setTab] = useState<'account' | 'fees'>('account');
  const [students, setStudents] = useState<any[]>([]);
  const [studentId, setStudentId] = useState('');
  const [account, setAccount] = useState<any>({ balance: 0, points: 0, transactions: [] });
  const [adjustForm, setAdjustForm] = useState({ amount: '', remark: '' });
  const [fees, setFees] = useState<any[]>([]);
  const [feeForm, setFeeForm] = useState({ name: '', amount: '' });
  const [message, setMessage] = useState('');

  useEffect(() => {
    api<any[]>('/api/students').then(setStudents).catch(() => {});
    api<any[]>('/api/fee-items').then(setFees).catch(() => {});
  }, []);

  async function loadAccount(id: string) {
    setStudentId(id);
    if (!id) return;
    setAccount(await api<any>(`/api/accounts/${id}`));
  }

  async function adjust(e: FormEvent) {
    e.preventDefault();
    try {
      await api(`/api/accounts/${studentId}/adjust`, {
        method: 'POST',
        body: JSON.stringify({ amount: Number(adjustForm.amount), remark: adjustForm.remark })
      });
      setMessage('余额已调整');
      setAdjustForm({ amount: '', remark: '' });
      await loadAccount(studentId);
    } catch (err: any) {
      setMessage(err.message);
    }
  }

  async function createFee(e: FormEvent) {
    e.preventDefault();
    await api('/api/fee-items', {
      method: 'POST',
      body: JSON.stringify({ name: feeForm.name, amount: Number(feeForm.amount || 0) })
    });
    setFeeForm({ name: '', amount: '' });
    setMessage('杂费项已创建');
    setFees(await api<any[]>('/api/fee-items'));
  }

  return (
    <Shell>
      <h1 className="page-title">学员账户</h1>
      <div className="form-row">
        <button className={tab === 'account' ? 'btn primary' : 'btn'} onClick={() => setTab('account')}>账户与流水</button>
        <button className={tab === 'fees' ? 'btn primary' : 'btn'} onClick={() => setTab('fees')}>杂费设置</button>
      </div>
      {message && <p className="subtitle">{message}</p>}

      {tab === 'account' && (
        <>
          <div className="form-row">
            <label>选择学员<select value={studentId} onChange={(e) => loadAccount(e.target.value)}>
              <option value="">选择学员</option>
              {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select></label>
            <span className="label">余额：{account.balance} 元　积分：{account.points}</span>
          </div>
          <form className="form-row" onSubmit={adjust}>
            <label>调整金额（正加负减）<input value={adjustForm.amount} onChange={(e) => setAdjustForm({ ...adjustForm, amount: e.target.value })} /></label>
            <label>备注<input value={adjustForm.remark} onChange={(e) => setAdjustForm({ ...adjustForm, remark: e.target.value })} /></label>
            <button className="btn primary" type="submit" disabled={!studentId}>保存调整</button>
          </form>
          <div className="panel">
            <table className="table">
              <thead><tr><th>类型</th><th>金额</th><th>变动后余额</th><th>备注</th><th>时间</th></tr></thead>
              <tbody>
                {account.transactions?.map((t: any) => (
                  <tr key={t.id}>
                    <td>{t.type}</td><td>{Number(t.amount)}</td><td>{Number(t.balance_after)}</td>
                    <td>{t.remark ?? '-'}</td><td>{String(t.created_at).slice(0, 19).replace('T', ' ')}</td>
                  </tr>
                ))}
                {(!account.transactions || account.transactions.length === 0) && <tr><td colSpan={5}>暂无流水</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'fees' && (
        <>
          <form className="form-row" onSubmit={createFee}>
            <label>名称<input value={feeForm.name} onChange={(e) => setFeeForm({ ...feeForm, name: e.target.value })} /></label>
            <label>金额<input value={feeForm.amount} onChange={(e) => setFeeForm({ ...feeForm, amount: e.target.value })} /></label>
            <button className="btn primary" type="submit">新增杂费项</button>
          </form>
          <div className="panel">
            <table className="table">
              <thead><tr><th>名称</th><th>金额</th><th>启用</th></tr></thead>
              <tbody>
                {fees.map((f) => (
                  <tr key={f.id}><td>{f.name}</td><td>{Number(f.amount)}</td><td>{f.enabled ? '是' : '否'}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Shell>
  );
}