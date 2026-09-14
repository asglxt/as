import { useEffect, useState, type FormEvent } from 'react';
import Shell from '../Shell.tsx';
import { api } from '../api.ts';

const ORDER_TYPES = [
  ['enroll', '报名'], ['renew', '续费'], ['recharge', '充值'],
  ['transfer', '转课'], ['refund', '退费'], ['material', '教材']
] as const;

const METHODS = [
  ['cash', '现金'], ['wechat', '微信'], ['alipay', '支付宝'], ['bank', '银行卡/POS'], ['balance', '余额抵扣']
] as const;

const STATUS_LABEL: Record<string, string> = { unpaid: '未收款', partial: '部分收款', paid: '已结清' };

interface ItemRow { itemType: string; lessonId: string; name: string; quantity: string; unitPrice: string }

export default function OrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [lessons, setLessons] = useState<any[]>([]);
  const [campuses, setCampuses] = useState<any[]>([]);
  const [filters, setFilters] = useState({ studentId: '', type: '' });
  const [form, setForm] = useState({ studentId: '', orderType: 'enroll', campusId: '' });
  const [items, setItems] = useState<ItemRow[]>([{ itemType: 'course', lessonId: '', name: '', quantity: '1', unitPrice: '' }]);
  const [payFor, setPayFor] = useState<number | null>(null);
  const [payForm, setPayForm] = useState({ method: 'wechat', amount: '' });
  const [detail, setDetail] = useState<any>(null);
  const [message, setMessage] = useState('');

  async function load() {
    const params = new URLSearchParams();
    if (filters.studentId) params.set('studentId', filters.studentId);
    if (filters.type) params.set('type', filters.type);
    setOrders(await api<any[]>(`/api/orders?${params.toString()}`));
  }

  useEffect(() => {
    load().catch(() => {});
    api<any[]>('/api/students').then(setStudents).catch(() => {});
    api<any[]>('/api/lessons').then(setLessons).catch(() => {});
    api<any[]>('/api/campuses').then(setCampuses).catch(() => {});
  }, []);

  function updateItem(index: number, patch: Partial<ItemRow>) {
    setItems(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    try {
      const res = await api<any>('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          studentId: Number(form.studentId),
          orderType: form.orderType,
          campusId: form.campusId ? Number(form.campusId) : null,
          items: items.map((item) => ({
            itemType: item.itemType,
            lessonId: item.lessonId ? Number(item.lessonId) : null,
            name: item.name || lessons.find((l) => String(l.id) === item.lessonId)?.name || '未命名明细',
            quantity: Number(item.quantity || 1),
            unitPrice: Number(item.unitPrice || 0)
          }))
        })
      });
      setMessage(`订单已创建：应收 ${Number(res.receivable)} 元`);
      setItems([{ itemType: 'course', lessonId: '', name: '', quantity: '1', unitPrice: '' }]);
      await load();
    } catch (err: any) {
      setMessage(err.message);
    }
  }

  async function pay(e: FormEvent) {
    e.preventDefault();
    if (!payFor) return;
    try {
      await api(`/api/orders/${payFor}/payments`, {
        method: 'POST',
        body: JSON.stringify({ method: payForm.method, amount: Number(payForm.amount) })
      });
      setMessage('收款已登记');
      setPayFor(null);
      setPayForm({ method: 'wechat', amount: '' });
      await load();
    } catch (err: any) {
      setMessage(err.message);
    }
  }

  async function openDetail(id: number) {
    setDetail(await api<any>(`/api/orders/${id}`));
  }

  return (
    <Shell>
      <h1 className="page-title">订单</h1>
      {message && <p className="subtitle">{message}</p>}

      <form className="form-row" onSubmit={create}>
        <label>学员<select value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })}>
          <option value="">选择学员</option>
          {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select></label>
        <label>订单类型<select value={form.orderType} onChange={(e) => setForm({ ...form, orderType: e.target.value })}>
          {ORDER_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <label>校区<select value={form.campusId} onChange={(e) => setForm({ ...form, campusId: e.target.value })}>
          <option value="">选择校区</option>
          {campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></label>
      </form>

      <div className="panel">
        <h2>订单明细</h2>
        {items.map((item, index) => (
          <div className="form-row" key={index}>
            <label>类型<select value={item.itemType} onChange={(e) => updateItem(index, { itemType: e.target.value })}>
              <option value="course">课程课时</option>
              <option value="material">教材杂费</option>
              <option value="recharge">余额充值</option>
              <option value="transfer">转课</option>
            </select></label>
            {item.itemType === 'course' && (
              <label>课程<select value={item.lessonId} onChange={(e) => updateItem(index, { lessonId: e.target.value })}>
                <option value="">选择课程</option>
                {lessons.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select></label>
            )}
            <label>名称<input value={item.name} onChange={(e) => updateItem(index, { name: e.target.value })} /></label>
            <label>数量<input value={item.quantity} onChange={(e) => updateItem(index, { quantity: e.target.value })} /></label>
            <label>单价<input value={item.unitPrice} onChange={(e) => updateItem(index, { unitPrice: e.target.value })} /></label>
            <button className="btn" type="button" onClick={() => setItems(items.filter((_, i) => i !== index))} disabled={items.length === 1}>删除</button>
          </div>
        ))}
        <button className="btn" type="button" onClick={() => setItems([...items, { itemType: 'course', lessonId: '', name: '', quantity: '1', unitPrice: '' }])}>添加明细</button>
        <button className="btn primary" type="button" onClick={create}>创建订单</button>
      </div>

      {payFor && (
        <form className="form-row" onSubmit={pay}>
          <label>收款方式<select value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}>
            {METHODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>
          <label>收款金额<input value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} /></label>
          <button className="btn primary" type="submit">确认收款</button>
          <button className="btn" type="button" onClick={() => setPayFor(null)}>取消</button>
        </form>
      )}

      <form className="form-row" onSubmit={(e) => { e.preventDefault(); load(); }}>
        <label>按学员筛选<select value={filters.studentId} onChange={(e) => setFilters({ ...filters, studentId: e.target.value })}>
          <option value="">全部学员</option>
          {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select></label>
        <label>按类型筛选<select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
          <option value="">全部类型</option>
          {ORDER_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <button className="btn" type="submit">查询</button>
      </form>

      <div className="panel">
        <table className="table">
          <thead>
            <tr>
              <th>订单号</th><th>学员</th><th>类型</th><th>应收</th><th>实收</th><th>欠费</th>
              <th>到款状态</th><th>经办校区</th><th>日期</th><th>操作</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td>{o.order_no}</td><td>{o.student_name}</td><td>{o.order_type}</td>
                <td>{Number(o.receivable)}</td><td>{Number(o.received)}</td><td>{Number(o.arrears)}</td>
                <td>{STATUS_LABEL[o.payment_status] ?? o.payment_status}</td>
                <td>{o.campus_name ?? '-'}</td>
                <td>{String(o.created_at).slice(0, 10)}</td>
                <td>
                  <button className="btn primary" onClick={() => setPayFor(o.id)} disabled={o.payment_status === 'paid'}>收款</button>
                  <button className="btn" onClick={() => openDetail(o.id)}>明细</button>
                </td>
              </tr>
            ))}
            {orders.length === 0 && <tr><td colSpan={10}>暂无订单</td></tr>}
          </tbody>
        </table>
      </div>

      {detail && (
        <div className="panel">
          <h2>订单 {detail.order_no}</h2>
          <table className="table">
            <thead><tr><th>明细</th><th>数量</th><th>单价</th><th>金额</th></tr></thead>
            <tbody>
              {detail.items.map((item: any) => (
                <tr key={item.id}><td>{item.name}</td><td>{Number(item.quantity)}</td><td>{Number(item.unit_price)}</td><td>{Number(item.amount)}</td></tr>
              ))}
            </tbody>
          </table>
          <h2>收款记录</h2>
          <table className="table">
            <thead><tr><th>方式</th><th>金额</th><th>时间</th></tr></thead>
            <tbody>
              {detail.payments.map((p: any) => (
                <tr key={p.id}><td>{p.method}</td><td>{Number(p.amount)}</td><td>{String(p.paid_at).slice(0, 19).replace('T', ' ')}</td></tr>
              ))}
            </tbody>
          </table>
          <button className="btn" onClick={() => window.print()}>打印收据</button>
          <button className="btn" onClick={() => setDetail(null)}>关闭</button>
        </div>
      )}
    </Shell>
  );
}