import { useEffect, useState, type FormEvent } from 'react';
import { Building2, Pencil, Plus, Save } from 'lucide-react';
import Shell from '../Shell.tsx';
import { api } from '../api.ts';

interface Campus { id: number; name: string; code: string | null; phone: string | null; address: string | null; principal: string | null; status: string; sort: number; notes: string | null; }
const EMPTY = { name: '', code: '', phone: '', address: '', principal: '', status: 'active', sort: 0, notes: '' };

export default function CampusesPage() {
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [form, setForm] = useState<typeof EMPTY>(EMPTY);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [message, setMessage] = useState('');

  async function load() { setCampuses(await api<Campus[]>('/api/campuses')); }
  useEffect(() => { load().catch((err) => setMessage(err.message)); }, []);

  function edit(item: Campus) {
    setEditingId(item.id);
    setForm({ name: item.name, code: item.code ?? '', phone: item.phone ?? '', address: item.address ?? '', principal: item.principal ?? '', status: item.status, sort: item.sort, notes: item.notes ?? '' });
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      if (editingId) await api(`/api/campuses/${editingId}`, { method: 'PATCH', body: JSON.stringify(form) });
      else await api('/api/campuses', { method: 'POST', body: JSON.stringify(form) });
      setMessage(editingId ? '校区信息已更新' : '校区已创建');
      setEditingId(null);
      setForm(EMPTY);
      await load();
    } catch (err: any) { setMessage(err.message); }
  }

  async function toggleStatus(item: Campus) {
    await api(`/api/campuses/${item.id}`, { method: 'PATCH', body: JSON.stringify({ status: item.status === 'active' ? 'disabled' : 'active' }) });
    await load();
  }

  return (
    <Shell>
      <div className="panel-header"><div><h1 className="page-title">校区设置</h1><p className="page-subtitle">维护校区名称、编码、负责人、联系方式和启用状态。</p></div><button className="btn primary icon-text" onClick={() => { setEditingId(null); setForm(EMPTY); }}><Plus size={15} />新增校区</button></div>
      {message && <div className="summary-strip"><span>{message}</span></div>}
      <div className="workbench-grid">
        <section className="panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-wrap"><table className="table"><thead><tr><th>校区名称</th><th>编码</th><th>负责人</th><th>联系电话</th><th>状态</th><th>排序</th><th>操作</th></tr></thead><tbody>
            {campuses.map((item) => <tr key={item.id}><td><b>{item.name}</b><div className="subtitle">{item.address ?? '未填写地址'}</div></td><td>{item.code ?? '-'}</td><td>{item.principal ?? '-'}</td><td>{item.phone ?? '-'}</td><td><span className={item.status === 'active' ? 'badge green' : 'badge orange'}>{item.status === 'active' ? '启用' : '停用'}</span></td><td>{item.sort}</td><td><button className="btn icon-text" onClick={() => edit(item)}><Pencil size={14} />编辑</button><button className="btn" style={{ marginLeft: 6 }} onClick={() => toggleStatus(item)}>{item.status === 'active' ? '停用' : '启用'}</button></td></tr>)}
            {campuses.length === 0 && <tr><td colSpan={7}><div style={{ padding: 36, textAlign: 'center', color: '#8a96a8' }}><Building2 size={28} /><p>暂无校区</p></div></td></tr>}
          </tbody></table></div>
        </section>
        <form className="panel" onSubmit={save}>
          <div className="panel-header"><h2>{editingId ? '编辑校区' : '新增校区'}</h2>{editingId && <button type="button" className="btn" onClick={() => { setEditingId(null); setForm(EMPTY); }}>取消编辑</button>}</div>
          <div className="form-row"><label style={{ width: '100%' }}>校区名称<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label></div>
          <div className="form-row"><label>校区编码<input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></label><label>负责人<input value={form.principal} onChange={(e) => setForm({ ...form, principal: e.target.value })} /></label></div>
          <div className="form-row"><label style={{ width: '100%' }}>联系电话<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label></div>
          <div className="form-row"><label style={{ width: '100%' }}>校区地址<input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label></div>
          <div className="form-row"><label>状态<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="active">启用</option><option value="disabled">停用</option></select></label><label>排序<input type="number" value={form.sort} onChange={(e) => setForm({ ...form, sort: Number(e.target.value) })} /></label></div>
          <div className="form-row"><label style={{ width: '100%' }}>备注<textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label></div>
          <button className="btn primary icon-text" type="submit"><Save size={15} />{editingId ? '保存修改' : '创建校区'}</button>
        </form>
      </div>
    </Shell>
  );
}
