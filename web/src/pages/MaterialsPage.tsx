import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Archive, Boxes, History, PackageCheck, Plus, Save, Search, Settings2 } from 'lucide-react';
import Shell from '../Shell.tsx';
import { api } from '../api.ts';

const EMPTY_FILTERS = { keyword: '', campusId: '', category: '', status: '', lowStock: '' };
const EMPTY_MATERIAL = {
  campusId: '', name: '', sku: '', category: '教材', unit: '本',
  price: '', costPrice: '', initialStock: '0', warningStock: '3', notes: ''
};
const EMPTY_FEE = { name: '', amount: '', lessonId: '', materialId: '', autoApplyOnEnroll: false, sort: '0' };

export default function MaterialsPage() {
  const [tab, setTab] = useState<'inventory' | 'issues' | 'fees'>('inventory');
  const [data, setData] = useState<any>({ items: [], total: 0, summary: { total: 0, active: 0, disabled: 0, lowStock: 0, stockUnits: 0, stockValue: 0 } });
  const [pending, setPending] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [campuses, setCampuses] = useState<any[]>([]);
  const [lessons, setLessons] = useState<any[]>([]);
  const [fees, setFees] = useState<any[]>([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [materialForm, setMaterialForm] = useState(EMPTY_MATERIAL);
  const [showCreate, setShowCreate] = useState(false);
  const [adjustFor, setAdjustFor] = useState<any>(null);
  const [adjustForm, setAdjustForm] = useState({ campusId: '', type: 'purchase', quantity: '1', remark: '' });
  const [feeForm, setFeeForm] = useState(EMPTY_FEE);
  const [message, setMessage] = useState('');

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (String(value)) params.set(key, String(value));
    return params.toString();
  }, [filters]);

  async function load() {
    setData(await api<any>(`/api/materials/list?${queryString}`));
    setPending(await api<any[]>('/api/materials/order-items/pending'));
    setFees(await api<any[]>('/api/fee-items'));
  }

  useEffect(() => { load().catch((err) => setMessage(err.message)); }, [queryString]);
  useEffect(() => {
    api<any[]>('/api/campuses').then(setCampuses).catch(() => {});
    api<any[]>('/api/lessons').then(setLessons).catch(() => {});
  }, []);

  async function createMaterial(e: FormEvent) {
    e.preventDefault();
    try {
      await api('/api/materials', {
        method: 'POST',
        body: JSON.stringify({
          campusId: Number(materialForm.campusId), name: materialForm.name, sku: materialForm.sku,
          category: materialForm.category, unit: materialForm.unit, price: Number(materialForm.price || 0),
          costPrice: Number(materialForm.costPrice || 0), initialStock: Number(materialForm.initialStock || 0),
          warningStock: Number(materialForm.warningStock || 0), notes: materialForm.notes
        })
      });
      setMessage('教材已创建');
      setMaterialForm(EMPTY_MATERIAL);
      setShowCreate(false);
      await load();
    } catch (err: any) { setMessage(err.message); }
  }

  async function adjustStock(e: FormEvent) {
    e.preventDefault();
    if (!adjustFor) return;
    try {
      await api(`/api/materials/${adjustFor.id}/transactions`, {
        method: 'POST',
        body: JSON.stringify({
          campusId: Number(adjustForm.campusId), type: adjustForm.type,
          quantity: Number(adjustForm.quantity), remark: adjustForm.remark
        })
      });
      setMessage('库存已更新');
      setAdjustFor(null);
      setAdjustForm({ campusId: '', type: 'purchase', quantity: '1', remark: '' });
      await load();
      await loadTransactions(adjustFor.id);
    } catch (err: any) { setMessage(err.message); }
  }

  async function loadTransactions(materialId: number) {
    setTransactions(await api<any[]>(`/api/materials/${materialId}/transactions`));
  }

  async function issueItem(item: any) {
    try {
      await api(`/api/materials/order-items/${item.id}/issue`, {
        method: 'POST', body: JSON.stringify({ remark: '订单领用' })
      });
      setMessage(`已发放：${item.material_name}`);
      await load();
    } catch (err: any) { setMessage(err.message); }
  }

  async function createFee(e: FormEvent) {
    e.preventDefault();
    try {
      await api('/api/fee-items', {
        method: 'POST',
        body: JSON.stringify({
          name: feeForm.name, amount: Number(feeForm.amount || 0),
          lessonId: feeForm.lessonId ? Number(feeForm.lessonId) : null,
          materialId: feeForm.materialId ? Number(feeForm.materialId) : null,
          autoApplyOnEnroll: feeForm.autoApplyOnEnroll, sort: Number(feeForm.sort || 0)
        })
      });
      setMessage('杂费项已保存');
      setFeeForm(EMPTY_FEE);
      await load();
    } catch (err: any) { setMessage(err.message); }
  }

  async function toggleFee(item: any) {
    await api(`/api/fee-items/${item.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: !item.enabled }) });
    await load();
  }

  return (
    <Shell>
      <div className="panel-header"><div><h1 className="page-title">教材与杂费</h1><p className="page-subtitle">管理教材库存、订单领用和报名自动带出的杂费项目。</p></div><button className="btn primary icon-text" onClick={() => setShowCreate((value) => !value)}><Plus size={15} />新增教材</button></div>
      {message && <div className="summary-strip"><span>{message}</span></div>}
      <div className="cards">
        <div className="stat-card"><b>{data.summary.total}</b><span>教材种类</span></div>
        <div className="stat-card"><b>{data.summary.stockUnits}</b><span>库存总量</span></div>
        <div className="stat-card"><b>{data.summary.lowStock}</b><span>库存预警</span></div>
        <div className="stat-card"><b>{data.summary.stockValue.toFixed(2)}</b><span>库存成本</span></div>
      </div>
      <div className="tabs"><button className={tab === 'inventory' ? 'active' : ''} onClick={() => setTab('inventory')}>教材库存</button><button className={tab === 'issues' ? 'active' : ''} onClick={() => setTab('issues')}>待领用与流水</button><button className={tab === 'fees' ? 'active' : ''} onClick={() => setTab('fees')}>杂费设置</button></div>

      {showCreate && <form className="panel" onSubmit={createMaterial}><div className="panel-header"><h2>新增教材</h2><button type="button" className="btn" onClick={() => setShowCreate(false)}>关闭</button></div><div className="form-row"><label>校区<select required value={materialForm.campusId} onChange={(e) => setMaterialForm({ ...materialForm, campusId: e.target.value })}><option value="">选择校区</option>{campuses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>名称<input required value={materialForm.name} onChange={(e) => setMaterialForm({ ...materialForm, name: e.target.value })} /></label><label>编码<input value={materialForm.sku} onChange={(e) => setMaterialForm({ ...materialForm, sku: e.target.value })} /></label><label>分类<input value={materialForm.category} onChange={(e) => setMaterialForm({ ...materialForm, category: e.target.value })} /></label><label>单位<input value={materialForm.unit} onChange={(e) => setMaterialForm({ ...materialForm, unit: e.target.value })} /></label></div><div className="form-row"><label>售价<input type="number" value={materialForm.price} onChange={(e) => setMaterialForm({ ...materialForm, price: e.target.value })} /></label><label>成本价<input type="number" value={materialForm.costPrice} onChange={(e) => setMaterialForm({ ...materialForm, costPrice: e.target.value })} /></label><label>期初库存<input type="number" value={materialForm.initialStock} onChange={(e) => setMaterialForm({ ...materialForm, initialStock: e.target.value })} /></label><label>预警库存<input type="number" value={materialForm.warningStock} onChange={(e) => setMaterialForm({ ...materialForm, warningStock: e.target.value })} /></label><label style={{ flex: 1 }}>备注<input value={materialForm.notes} onChange={(e) => setMaterialForm({ ...materialForm, notes: e.target.value })} /></label></div><button className="btn primary icon-text" type="submit"><Save size={15} />保存教材</button></form>}

      {tab === 'inventory' && <section className="panel" style={{ padding: 0, overflow: 'hidden' }}><div className="toolbar" style={{ padding: 14, margin: 0 }}><label className="compact-field"><Search size={14} /><input placeholder="搜索名称或编码" value={filters.keyword} onChange={(e) => setFilters({ ...filters, keyword: e.target.value })} /></label><select value={filters.campusId} onChange={(e) => setFilters({ ...filters, campusId: e.target.value })}><option value="">全部校区</option>{campuses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">全部状态</option><option value="active">启用</option><option value="disabled">停用</option></select><label className="check-field"><input type="checkbox" checked={filters.lowStock === '1'} onChange={(e) => setFilters({ ...filters, lowStock: e.target.checked ? '1' : '' })} />仅看库存预警</label></div><div className="table-wrap"><table className="table"><thead><tr><th>教材</th><th>分类</th><th>校区库存</th><th>预警值</th><th>售价</th><th>成本</th><th>状态</th><th>操作</th></tr></thead><tbody>{data.items.map((item: any) => <tr key={item.id}><td><b>{item.name}</b><div className="subtitle">{item.sku ?? '未设置编码'} · {item.unit}</div></td><td>{item.category}</td><td><span className={item.low_stock ? 'badge red' : 'badge green'}>{item.stock}</span></td><td>{item.warning_stock}</td><td>{item.price.toFixed(2)}</td><td>{item.cost_price.toFixed(2)}</td><td>{item.status === 'active' ? '启用' : '停用'}</td><td><div className="toolbar" style={{ margin: 0 }}><button className="btn icon-text" onClick={() => { setAdjustFor(item); setAdjustForm({ campusId: String(item.inventory?.[0]?.campusId ?? ''), type: 'purchase', quantity: '1', remark: '' }); }}><Settings2 size={14} />调整库存</button><button className="btn icon-text" onClick={() => loadTransactions(Number(item.id))}><History size={14} />流水</button></div></td></tr>)}{data.items.length === 0 && <tr><td colSpan={8}><div className="empty-state"><Boxes size={28} /><p>暂无教材</p></div></td></tr>}</tbody></table></div></section>}

      {adjustFor && <form className="panel" onSubmit={adjustStock}><div className="panel-header"><h2>调整库存：{adjustFor.name}</h2><button type="button" className="btn" onClick={() => setAdjustFor(null)}>关闭</button></div><div className="form-row"><label>校区<select required value={adjustForm.campusId} onChange={(e) => setAdjustForm({ ...adjustForm, campusId: e.target.value })}><option value="">选择校区</option>{adjustFor.inventory.map((item: any) => <option key={item.campusId} value={item.campusId}>{item.campusName}（现有 {item.stock}）</option>)}</select></label><label>类型<select value={adjustForm.type} onChange={(e) => setAdjustForm({ ...adjustForm, type: e.target.value })}><option value="purchase">采购入库</option><option value="return">退回入库</option><option value="issue">手工领用</option><option value="adjust">盘点调整</option></select></label><label>数量<input required type="number" value={adjustForm.quantity} onChange={(e) => setAdjustForm({ ...adjustForm, quantity: e.target.value })} /></label><label style={{ flex: 1 }}>备注<input value={adjustForm.remark} onChange={(e) => setAdjustForm({ ...adjustForm, remark: e.target.value })} /></label><button className="btn primary icon-text" type="submit"><Save size={15} />确认调整</button></div></form>}

      {tab === 'issues' && <section className="panel" style={{ padding: 0, overflow: 'hidden' }}><div className="table-wrap"><table className="table"><thead><tr><th>订单</th><th>学员</th><th>教材</th><th>数量</th><th>当前库存</th><th>校区</th><th>操作</th></tr></thead><tbody>{pending.map((item) => <tr key={item.id}><td>{item.order_no}</td><td>{item.student_name}</td><td><b>{item.material_name}</b></td><td>{item.quantity} {item.unit}</td><td>{item.stock}</td><td>{item.campus_name ?? '-'}</td><td><button className="btn primary icon-text" disabled={Number(item.stock) < Number(item.quantity)} onClick={() => issueItem(item)}><PackageCheck size={14} />确认领用</button></td></tr>)}{pending.length === 0 && <tr><td colSpan={7}><div className="empty-state"><PackageCheck size={28} /><p>暂无待领用教材</p></div></td></tr>}</tbody></table></div></section>}

      {transactions.length > 0 && <section className="panel"><div className="panel-header"><h2>库存流水</h2><button className="btn" onClick={() => setTransactions([])}>关闭</button></div><div className="table-wrap"><table className="table"><thead><tr><th>类型</th><th>数量</th><th>结存</th><th>学员</th><th>订单</th><th>备注</th><th>时间</th></tr></thead><tbody>{transactions.map((item) => <tr key={item.id}><td>{item.type}</td><td>{Number(item.quantity)}</td><td>{Number(item.balance_after)}</td><td>{item.student_name ?? '-'}</td><td>{item.order_no ?? '-'}</td><td>{item.remark ?? '-'}</td><td>{String(item.created_at).slice(0, 16).replace('T', ' ')}</td></tr>)}</tbody></table></div></section>}

      {tab === 'fees' && <div className="workbench-grid"><form className="panel" onSubmit={createFee}><div className="panel-header"><h2>新增杂费项</h2></div><div className="form-row"><label style={{ width: '100%' }}>名称<input required value={feeForm.name} onChange={(e) => setFeeForm({ ...feeForm, name: e.target.value })} /></label></div><div className="form-row"><label>金额<input required type="number" value={feeForm.amount} onChange={(e) => setFeeForm({ ...feeForm, amount: e.target.value })} /></label><label>适用课程<select value={feeForm.lessonId} onChange={(e) => setFeeForm({ ...feeForm, lessonId: e.target.value })}><option value="">全部课程</option>{lessons.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div><div className="form-row"><label style={{ width: '100%' }}>关联教材<select value={feeForm.materialId} onChange={(e) => setFeeForm({ ...feeForm, materialId: e.target.value })}><option value="">不关联库存</option>{data.items.map((item: any) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div><label className="check-field"><input type="checkbox" checked={feeForm.autoApplyOnEnroll} onChange={(e) => setFeeForm({ ...feeForm, autoApplyOnEnroll: e.target.checked })} />报名或续费时自动带入订单</label><div className="toolbar" style={{ marginTop: 14 }}><button className="btn primary icon-text" type="submit"><Save size={15} />保存杂费项</button></div></form><section className="panel" style={{ padding: 0, overflow: 'hidden' }}><div className="panel-header" style={{ padding: 14, margin: 0 }}><h2>杂费项目</h2></div><div className="table-wrap"><table className="table"><thead><tr><th>名称</th><th>金额</th><th>适用课程</th><th>自动带入</th><th>状态</th><th>操作</th></tr></thead><tbody>{fees.map((item) => <tr key={item.id}><td><b>{item.name}</b><div className="subtitle">{item.material_id ? '已关联教材库存' : '不关联库存'}</div></td><td>{Number(item.amount).toFixed(2)}</td><td>{lessons.find((lesson) => String(lesson.id) === String(item.lesson_id))?.name ?? '全部课程'}</td><td>{item.auto_apply_on_enroll ? <span className="badge green">是</span> : <span className="badge">否</span>}</td><td>{item.enabled ? '启用' : '停用'}</td><td><button className="btn" onClick={() => toggleFee(item)}>{item.enabled ? '停用' : '启用'}</button></td></tr>)}{fees.length === 0 && <tr><td colSpan={6}><div className="empty-state"><Archive size={28} /><p>暂无杂费项</p></div></td></tr>}</tbody></table></div></section></div>}
    </Shell>
  );
}
