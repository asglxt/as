import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Ban, CircleDollarSign, Eye, Plus, Receipt, Search, Tag } from 'lucide-react';
import Shell from '../Shell.tsx';
import { api } from '../api.ts';

const ORDER_TYPES = [['enroll', '报名'], ['renew', '续费'], ['recharge', '充值'], ['transfer', '转课'], ['refund', '退费'], ['material', '教材']] as const;
const METHODS = [['cash', '现金'], ['wechat', '微信'], ['alipay', '支付宝'], ['bank', '银行卡/POS'], ['balance', '余额抵扣']] as const;
const PAYMENT_LABELS: Record<string, string> = { unpaid: '未收款', partial: '部分收款', paid: '已结清' };
const STATUS_LABELS: Record<string, string> = { draft: '草稿', confirmed: '已完成', cancelled: '已作废' };

interface OrderListResponse {
  items: any[];
  total: number;
  page: number;
  pageSize: number;
  summary: { receivable: number; received: number; accountChange: number; arrears: number; points: number };
}

const EMPTY_FILTERS = { keyword: '', type: '', campusId: '', paymentStatus: '', status: '', start: '', end: '', page: 1, pageSize: 20 };
const EMPTY_ITEM = { itemType: 'course', lessonId: '', name: '', quantity: '1', unitPrice: '' };

export default function OrdersPage() {
  const [data, setData] = useState<OrderListResponse>({ items: [], total: 0, page: 1, pageSize: 20, summary: { receivable: 0, received: 0, accountChange: 0, arrears: 0, points: 0 } });
  const [students, setStudents] = useState<any[]>([]);
  const [lessons, setLessons] = useState<any[]>([]);
  const [campuses, setCampuses] = useState<any[]>([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ studentId: '', orderType: 'enroll', campusId: '', orderSource: '前台', tags: '' });
  const [items, setItems] = useState([{ ...EMPTY_ITEM }]);
  const [payFor, setPayFor] = useState<number | null>(null);
  const [payForm, setPayForm] = useState({ method: 'wechat', amount: '' });
  const [cancelFor, setCancelFor] = useState<number | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [detail, setDetail] = useState<any>(null);
  const [message, setMessage] = useState('');

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (String(value)) params.set(key, String(value));
    return params.toString();
  }, [filters]);

  async function load() { setData(await api<OrderListResponse>(`/api/orders/list?${queryString}`)); }
  useEffect(() => { load().catch((err) => setMessage(err.message)); }, [queryString]);
  useEffect(() => {
    api<any[]>('/api/students').then(setStudents).catch(() => {});
    api<any[]>('/api/lessons').then(setLessons).catch(() => {});
    api<any[]>('/api/campuses').then(setCampuses).catch(() => {});
  }, []);

  function updateItem(index: number, patch: Partial<typeof EMPTY_ITEM>) {
    setItems((current) => current.map((item, i) => i === index ? { ...item, ...patch } : item));
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    try {
      const res = await api<any>('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          studentId: Number(form.studentId), orderType: form.orderType, campusId: form.campusId ? Number(form.campusId) : null,
          orderSource: form.orderSource, tags: form.tags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean),
          items: items.map((item) => ({ itemType: item.itemType, lessonId: item.lessonId ? Number(item.lessonId) : null, name: item.name || lessons.find((lesson) => String(lesson.id) === item.lessonId)?.name || '未命名明细', quantity: Number(item.quantity || 1), unitPrice: Number(item.unitPrice || 0) }))
        })
      });
      setMessage(`订单已创建：应收 ${Number(res.receivable)} 元`);
      setForm({ studentId: '', orderType: 'enroll', campusId: '', orderSource: '前台', tags: '' });
      setItems([{ ...EMPTY_ITEM }]);
      setShowCreate(false);
      await load();
    } catch (err: any) { setMessage(err.message); }
  }

  async function pay(e: FormEvent) {
    e.preventDefault();
    if (!payFor) return;
    try {
      await api(`/api/orders/${payFor}/payments`, { method: 'POST', body: JSON.stringify({ method: payForm.method, amount: Number(payForm.amount) }) });
      setMessage('收款已登记');
      setPayFor(null);
      setPayForm({ method: 'wechat', amount: '' });
      await load();
    } catch (err: any) { setMessage(err.message); }
  }

  async function cancelOrder() {
    if (!cancelFor || !cancelReason.trim()) return;
    try {
      await api(`/api/orders/${cancelFor}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'cancelled', reason: cancelReason }) });
      setMessage('订单已作废');
      setCancelFor(null);
      setCancelReason('');
      await load();
    } catch (err: any) { setMessage(err.message); }
  }

  async function openDetail(id: number) { setDetail(await api<any>(`/api/orders/${id}`)); }


  return (
    <Shell>
      <div className="panel-header"><div><h1 className="page-title">订单与收款</h1><p className="page-subtitle">报名、续费、充值、退费、转课和教材杂费统一管理。</p></div><button className="btn primary icon-text" onClick={() => setShowCreate((value) => !value)}><Plus size={15} />新建订单</button></div>
      {message && <div className="summary-strip"><span>{message}</span></div>}

      <div className="cards">
        <div className="stat-card"><b>{data.summary.receivable.toFixed(2)}</b><span>应收合计</span></div>
        <div className="stat-card"><b>{data.summary.received.toFixed(2)}</b><span>实收合计</span></div>
        <div className="stat-card"><b>{data.summary.accountChange.toFixed(2)}</b><span>账户变动</span></div>
        <div className="stat-card"><b>{data.summary.arrears.toFixed(2)}</b><span>欠费合计</span></div>
      </div>

      <form className="panel" onSubmit={(e) => { e.preventDefault(); setFilters({ ...filters, page: 1 }); }}>
        <div className="form-row">
          <label>学员/订单号<input value={filters.keyword} onChange={(e) => setFilters({ ...filters, keyword: e.target.value })} placeholder="姓名、电话或订单号" /></label>
          <label>订单类型<select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}><option value="">全部类型</option>{ORDER_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>校区<select value={filters.campusId} onChange={(e) => setFilters({ ...filters, campusId: e.target.value })}><option value="">全部校区</option>{campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}</select></label>
          <label>收款状态<select value={filters.paymentStatus} onChange={(e) => setFilters({ ...filters, paymentStatus: e.target.value })}><option value="">全部状态</option><option value="unpaid">未收款</option><option value="partial">部分收款</option><option value="paid">已结清</option></select></label>
          <label>订单状态<select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">全部状态</option><option value="confirmed">已完成</option><option value="cancelled">已作废</option></select></label>
          <label>开始日期<input type="date" value={filters.start} onChange={(e) => setFilters({ ...filters, start: e.target.value })} /></label>
          <label>结束日期<input type="date" value={filters.end} onChange={(e) => setFilters({ ...filters, end: e.target.value })} /></label>
          <button className="btn primary icon-text" type="submit"><Search size={15} />查询</button>
          <button className="btn" type="button" onClick={() => setFilters(EMPTY_FILTERS)}>清空</button>
        </div>
      </form>

      {showCreate && (
        <form className="panel" onSubmit={create}>
          <div className="panel-header"><h2>新建订单</h2><button type="button" className="btn" onClick={() => setShowCreate(false)}>关闭</button></div>
          <div className="form-row">
            <label>学员<select required value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })}><option value="">选择学员</option>{students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}</select></label>
            <label>订单类型<select value={form.orderType} onChange={(e) => setForm({ ...form, orderType: e.target.value })}>{ORDER_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label>校区<select value={form.campusId} onChange={(e) => setForm({ ...form, campusId: e.target.value })}><option value="">选择校区</option>{campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}</select></label>
            <label>订单来源<input value={form.orderSource} onChange={(e) => setForm({ ...form, orderSource: e.target.value })} /></label>
            <label>订单标签<input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="多个标签用逗号分隔" /></label>
          </div>
          <h2>订单明细</h2>
          {items.map((item, index) => <div className="form-row" key={index}><label>类型<select value={item.itemType} onChange={(e) => updateItem(index, { itemType: e.target.value })}><option value="course">课程</option><option value="material">教材</option><option value="recharge">充值</option><option value="transfer">转课</option></select></label><label>课程<select value={item.lessonId} onChange={(e) => updateItem(index, { lessonId: e.target.value })}><option value="">自定义</option>{lessons.map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.name}</option>)}</select></label><label>名称<input value={item.name} onChange={(e) => updateItem(index, { name: e.target.value })} /></label><label>数量<input type="number" value={item.quantity} onChange={(e) => updateItem(index, { quantity: e.target.value })} /></label><label>单价<input type="number" value={item.unitPrice} onChange={(e) => updateItem(index, { unitPrice: e.target.value })} /></label>{items.length > 1 && <button type="button" className="btn danger" onClick={() => setItems(items.filter((_, i) => i !== index))}>删除</button>}</div>)}
          <div className="toolbar"><button type="button" className="btn" onClick={() => setItems([...items, { ...EMPTY_ITEM }])}>添加明细</button><button className="btn primary" type="submit">保存订单</button></div>
        </form>
      )}


      <section className="panel" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrap"><table className="table"><thead><tr><th>订单号</th><th>学员</th><th>订单类型</th><th>订单标签</th><th>应收</th><th>实收</th><th>欠费</th><th>账户变动</th><th>收款状态</th><th>订单状态</th><th>经办校区</th><th>经办人</th><th>日期</th><th>操作</th></tr></thead><tbody>
          {data.items.map((order) => <tr key={order.id}><td>{order.order_no}</td><td><b>{order.student_name}</b><div className="subtitle">{order.student_phone ?? '-'}</div></td><td>{ORDER_TYPES.find(([value]) => value === order.order_type)?.[1] ?? order.order_type}</td><td>{order.tags?.length ? order.tags.map((tag: string) => <span className="badge blue" key={tag} style={{ marginRight: 4 }}>{tag}</span>) : '-'}</td><td>{order.receivable.toFixed(2)}</td><td>{order.received.toFixed(2)}</td><td>{order.arrears.toFixed(2)}</td><td>{order.account_change.toFixed(2)}</td><td><span className={order.payment_status === 'paid' ? 'badge green' : order.payment_status === 'partial' ? 'badge orange' : 'badge red'}>{PAYMENT_LABELS[order.payment_status] ?? order.payment_status}</span></td><td><span className={order.status === 'cancelled' ? 'badge red' : 'badge green'}>{STATUS_LABELS[order.status] ?? order.status}</span></td><td>{order.campus_name ?? '-'}</td><td>{order.operator_name ?? '-'}</td><td>{String(order.created_at).slice(0, 10)}</td><td><div className="toolbar" style={{ margin: 0 }}><button className="btn icon-text" onClick={() => openDetail(Number(order.id))}><Eye size={14} />详情</button>{order.status !== 'cancelled' && <button className="btn icon-text" disabled={order.payment_status === 'paid'} onClick={() => { setPayFor(Number(order.id)); setPayForm({ method: 'wechat', amount: String(Math.max(0, order.arrears)) }); }}><CircleDollarSign size={14} />收款</button>}{order.status !== 'cancelled' && Number(order.received) === 0 && <button className="btn danger icon-text" onClick={() => setCancelFor(Number(order.id))}><Ban size={14} />作废</button>}</div></td></tr>)}
          {data.items.length === 0 && <tr><td colSpan={14}><div style={{ padding: 36, textAlign: 'center', color: '#8a96a8' }}><Receipt size={28} /><p>暂无订单</p></div></td></tr>}
        </tbody></table></div>
      </section>

      <div className="toolbar"><span className="subtitle">共 {data.total} 条，第 {data.page} 页</span><span className="spacer" /><button className="btn" disabled={data.page <= 1} onClick={() => setFilters({ ...filters, page: filters.page - 1 })}>上一页</button><button className="btn" disabled={data.page * data.pageSize >= data.total} onClick={() => setFilters({ ...filters, page: filters.page + 1 })}>下一页</button></div>

      {payFor && (
        <form className="panel" onSubmit={pay}>
          <div className="panel-header"><h2>登记收款</h2><button type="button" className="btn" onClick={() => setPayFor(null)}>关闭</button></div>
          <div className="form-row"><label>收款方式<select value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}>{METHODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>收款金额<input required type="number" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} /></label><button className="btn primary" type="submit">确认收款</button></div>
        </form>
      )}

      {cancelFor && (
        <section className="panel">
          <div className="panel-header"><h2>作废订单</h2><button className="btn" onClick={() => setCancelFor(null)}>关闭</button></div>
          <div className="form-row"><label style={{ flex: 1 }}>作废原因<input required value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} /></label><button className="btn danger" onClick={cancelOrder}>确认作废</button></div>
        </section>
      )}

      {detail && (
        <section className="panel">
          <div className="panel-header"><h2>订单明细：{detail.order_no}</h2><button className="btn" onClick={() => setDetail(null)}>关闭</button></div>
          <div className="summary-strip"><span>学员 <b>{detail.student_name ?? detail.student_id}</b></span><span>应收 <b>{Number(detail.receivable).toFixed(2)}</b></span><span>实收 <b>{Number(detail.received).toFixed(2)}</b></span><span>欠费 <b>{Number(detail.arrears).toFixed(2)}</b></span></div>
          <div className="table-wrap"><table className="table"><thead><tr><th>明细名称</th><th>类型</th><th>数量</th><th>单价</th><th>金额</th></tr></thead><tbody>{detail.items.map((item: any) => <tr key={item.id}><td>{item.name}</td><td>{item.item_type}</td><td>{item.quantity}</td><td>{item.unit_price}</td><td>{item.amount}</td></tr>)}</tbody></table></div>
          {detail.cancel_reason && <p className="subtitle">作废原因：{detail.cancel_reason}</p>}
        </section>
      )}
    </Shell>
  );
}


