import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { DoorOpen, Search } from 'lucide-react';
import Shell from '../Shell.tsx';
import { api } from '../api.ts';

export default function ClassroomsPage() {
  const [data, setData] = useState<any>({ items: [], total: 0, summary: { total: 0, active: 0, disabled: 0, capacity: 0 } });
  const [filters, setFilters] = useState({ campusId: '', status: '', keyword: '' });
  const [campuses, setCampuses] = useState<any[]>([]);
  const [form, setForm] = useState({ campusId: '', name: '', capacity: '' });
  const [message, setMessage] = useState('');

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
    return params.toString();
  }, [filters]);

  async function load() { setData(await api<any>(`/api/classrooms/list?${queryString}`)); }

  useEffect(() => {
    load().catch(() => {});
    api<any[]>('/api/campuses').then(setCampuses).catch(() => {});
  }, [queryString]);

  async function create(e: FormEvent) {
    e.preventDefault();
    try {
      await api('/api/classrooms', {
        method: 'POST',
        body: JSON.stringify({ campusId: Number(form.campusId), name: form.name, capacity: form.capacity ? Number(form.capacity) : null })
      });
      setForm({ ...form, name: '', capacity: '' });
      setMessage('教室已创建');
      await load();
    } catch (err: any) {
      setMessage(err.message);
    }
  }

  async function toggle(room: any) {
    await api(`/api/classrooms/${room.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: room.status === 'active' ? 'disabled' : 'active' })
    });
    await load();
  }

  return (
    <Shell>
      <div className="panel-header"><div><h1 className="page-title">教室</h1><p className="page-subtitle">按校区管理教室容量、启用状态和排课占用。</p></div></div>
      {message && <div className="summary-strip"><span>{message}</span></div>}
      <div className="cards"><div className="stat-card"><b>{data.summary.total}</b><span>教室数量</span></div><div className="stat-card"><b>{data.summary.active}</b><span>启用教室</span></div><div className="stat-card"><b>{data.summary.disabled}</b><span>停用教室</span></div><div className="stat-card"><b>{data.summary.capacity}</b><span>总容量</span></div></div>
      <form className="panel" onSubmit={(e) => e.preventDefault()}>
        <div className="form-row">
          <label>教室名称<input value={filters.keyword} onChange={(e) => setFilters({ ...filters, keyword: e.target.value })} /></label>
          <label>校区<select value={filters.campusId} onChange={(e) => setFilters({ ...filters, campusId: e.target.value })}><option value="">全部校区</option>{campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label>状态<select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">全部状态</option><option value="active">启用</option><option value="disabled">停用</option></select></label>
          <button className="btn primary icon-text" type="submit"><Search size={15} />查询</button>
          <button className="btn" type="button" onClick={() => setFilters({ campusId: '', status: '', keyword: '' })}>清空</button>
        </div>
      </form>
      <form className="form-row" onSubmit={create}>
        <label>校区<select value={form.campusId} onChange={(e) => setForm({ ...form, campusId: e.target.value })}>
          <option value="">选择校区</option>
          {campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></label>
        <label>教室名称<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label>容量<input value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} /></label>
        <button className="btn primary" type="submit">新增教室</button>
      </form>
      <div className="panel">
        <table className="table">
          <thead><tr><th>教室</th><th>校区</th><th>容量</th><th>排课次数</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>
            {data.items.map((room: any) => (
              <tr key={room.id}>
                <td>{room.name}</td>
                <td>{room.campus_name}</td>
                <td>{room.capacity ?? '-'}</td>
                <td>{room.schedule_count}</td>
                <td><span className={room.status === 'active' ? 'badge green' : 'badge orange'}>{room.status === 'active' ? '启用' : '停用'}</span></td>
                <td><button className="btn" onClick={() => toggle(room)}>{room.status === 'active' ? '停用' : '启用'}</button></td>
              </tr>
            ))}
            {data.items.length === 0 && <tr><td colSpan={6}><div style={{ padding: 36, textAlign: 'center', color: '#8a96a8' }}><DoorOpen size={28} /><p>暂无符合条件的教室</p></div></td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
