import { useEffect, useState, type FormEvent } from 'react';
import Shell from '../Shell.tsx';
import { api } from '../api.ts';

export default function ClassroomsPage() {
  const [rooms, setRooms] = useState<any[]>([]);
  const [campuses, setCampuses] = useState<any[]>([]);
  const [form, setForm] = useState({ campusId: '', name: '', capacity: '' });
  const [message, setMessage] = useState('');

  async function load() {
    setRooms(await api<any[]>('/api/classrooms'));
  }

  useEffect(() => {
    load().catch(() => {});
    api<any[]>('/api/campuses').then(setCampuses).catch(() => {});
  }, []);

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
      <h1 className="page-title">教室</h1>
      {message && <p className="subtitle">{message}</p>}
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
          <thead><tr><th>教室</th><th>校区</th><th>容量</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>
            {rooms.map((room) => (
              <tr key={room.id}>
                <td>{room.name}</td>
                <td>{room.campus_name}</td>
                <td>{room.capacity ?? '-'}</td>
                <td>{room.status === 'active' ? '启用' : '停用'}</td>
                <td><button className="btn" onClick={() => toggle(room)}>{room.status === 'active' ? '停用' : '启用'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}