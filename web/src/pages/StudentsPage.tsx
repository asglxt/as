import { useEffect, useState, type FormEvent } from 'react';
import Shell from '../Shell.tsx';
import { api } from '../api.ts';

export default function StudentsPage() {
  const [students, setStudents] = useState<any[]>([]);
  const [campuses, setCampuses] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [campusId, setCampusId] = useState('');

  async function load() {
    setStudents(await api<any[]>('/api/students'));
  }
  useEffect(() => {
    load();
    api<any[]>('/api/campuses').then(setCampuses).catch(() => {});
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    await api('/api/students', { method: 'POST', body: JSON.stringify({ name, guardianPhone, campusId: Number(campusId) }) });
    setName('');
    setGuardianPhone('');
    await load();
  }

  return (
    <Shell>
      <h1 className="page-title">学员</h1>
      <form className="form-row" onSubmit={create}>
        <label>姓名<input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>家长电话<input value={guardianPhone} onChange={(e) => setGuardianPhone(e.target.value)} /></label>
        <label>校区<select value={campusId} onChange={(e) => setCampusId(e.target.value)}>
          <option value="">选择校区</option>
          {campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></label>
        <button className="btn primary" type="submit">新增学员</button>
      </form>
      <div className="panel">
        <table className="table">
          <thead><tr><th>姓名</th><th>家长电话</th><th>状态</th></tr></thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.id}><td>{s.name}</td><td>{s.guardian_phone ?? '-'}</td><td>{s.status}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
