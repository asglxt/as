import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Search, Users } from 'lucide-react';
import Shell from '../Shell.tsx';
import { api } from '../api.ts';
import { useAuth } from '../auth.tsx';

const STATUS_LABELS: Record<string, string> = { active: '在读', inactive: '停课', graduated: '结课' };
const RECRUIT_LABELS: Record<string, string> = { recruiting: '招生中', full: '已满', closed: '已关闭' };

export default function ClassDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [data, setData] = useState<any>(null);
  const [allClasses, setAllClasses] = useState<any[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [status, setStatus] = useState('');
  const [keyword, setKeyword] = useState('');
  const [transferStudent, setTransferStudent] = useState<any>(null);
  const [message, setMessage] = useState('');

  async function load() {
    const [detail, classes] = await Promise.all([
      api<any>(`/api/classes/${id}`),
      api<any[]>('/api/classes').catch(() => [])
    ]);
    setData(detail);
    setAllClasses(classes);
    setSelected([]);
  }

  useEffect(() => { load().catch((error) => setMessage(error.message)); }, [id]);

  const students = useMemo(() => {
    const rows = data?.students ?? [];
    if (!keyword.trim()) return rows;
    const query = keyword.trim().toLowerCase();
    return rows.filter((item: any) => item.name.toLowerCase().includes(query) || String(item.guardian_phone ?? '').includes(query));
  }, [data, keyword]);

  function toggleAll(checked: boolean) {
    setSelected(checked ? students.map((item: any) => Number(item.id)) : []);
  }

  function toggleOne(studentId: number, checked: boolean) {
    setSelected((current) => checked ? [...new Set([...current, studentId])] : current.filter((item) => item !== studentId));
  }

  async function applyStatus() {
    if (!selected.length || !status) return;
    try {
      const result = await api<{ count: number }>('/api/students/batch', {
        method: 'POST', body: JSON.stringify({ ids: selected, status })
      });
      setMessage(`已调整 ${result.count} 名学员状态`);
      setStatus('');
      await load();
    } catch (error: any) {
      setMessage(error.message);
    }
  }

  async function submitTransfer(event: FormEvent) {
    event.preventDefault();
    if (!transferStudent?.toClassId) return;
    try {
      await api(`/api/students/${transferStudent.studentId}/transfer`, {
        method: 'POST',
        body: JSON.stringify({ fromClassId: Number(id), toClassId: Number(transferStudent.toClassId) })
      });
      setTransferStudent(null);
      setMessage('转班已办理');
      await load();
    } catch (error: any) {
      setMessage(error.message);
    }
  }

  if (!data) return <Shell><h1 className="page-title">班级管理</h1><p className="subtitle">{message || '正在加载...'}</p></Shell>;
  const cls = data.class;

  return (
    <Shell>
      <div className="panel-header">
        <div>
          <Link className="btn icon-text" to="/classes"><ArrowLeft size={15} />返回班级列表</Link>
          <h1 className="page-title" style={{ marginTop: 14 }}>{cls.name}</h1>
          <p className="page-subtitle">{cls.campus_name ?? '未设置校区'} · {cls.grade} · {cls.subject}</p>
        </div>
        <span className={`badge ${cls.recruit_status === 'recruiting' ? 'green' : 'orange'}`}>{RECRUIT_LABELS[cls.recruit_status] ?? cls.recruit_status}</span>
      </div>
      {message && <div className="summary-strip"><span>{message}</span></div>}

      <div className="cards">
        <div className="stat-card"><b>{cls.student_count}</b><span>班级学员</span></div>
        <div className="stat-card"><b>{cls.capacity ?? '-'}</b><span>班级容量</span></div>
        <div className="stat-card"><b>{cls.teacher_name ?? '待定'}</b><span>班主任</span></div>
        <div className="stat-card"><b>{cls.assistant_name ?? '待定'}</b><span>助教</span></div>
      </div>

      <div className="workbench-grid" style={{ gridTemplateColumns: 'minmax(0, .8fr) minmax(0, 1.4fr)' }}>
        <section className="panel">
          <div className="panel-header"><h2>班级信息</h2></div>
          <div className="table-wrap"><table className="table"><tbody>
            <tr><th>所属课程</th><td>{cls.lesson_name ?? '-'}</td></tr>
            <tr><th>开班日期</th><td>{cls.start_date?.slice(0, 10) ?? '-'}</td></tr>
            <tr><th>上课时间</th><td>{cls.schedule ?? '待定'}</td></tr>
            <tr><th>招生状态</th><td>{RECRUIT_LABELS[cls.recruit_status] ?? cls.recruit_status}</td></tr>
          </tbody></table></div>
        </section>

        <section className="panel">
          <div className="panel-header"><h2>班级学员</h2><span className="subtitle"><Users size={14} /> 共 {students.length} 人</span></div>
          <div className="toolbar">
            <label style={{ flex: 1 }}><span className="subtitle">搜索学员</span><div className="toolbar" style={{ margin: 0 }}><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="姓名或家长手机号" style={{ flex: 1 }} /><Search size={15} color="#7b879a" /></div></label>
            {isAdmin && <><select className="btn" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">调整状态</option><option value="active">设为在读</option><option value="inactive">设为停课</option><option value="graduated">设为结课</option></select><button className="btn primary" type="button" disabled={!selected.length || !status} onClick={applyStatus}>应用到已选</button></>}
            <span className="subtitle">已选择 {selected.length} 人</span>
          </div>
          <div className="table-wrap"><table className="table"><thead><tr><th><input type="checkbox" checked={students.length > 0 && selected.length === students.length} onChange={(event) => toggleAll(event.target.checked)} /></th><th>学员姓名</th><th>联系方式</th><th>性别</th><th>学员状态</th><th>入班日期</th>{isAdmin && <th>操作</th>}</tr></thead><tbody>
            {students.map((student: any) => <tr key={student.id}><td><input type="checkbox" checked={selected.includes(Number(student.id))} onChange={(event) => toggleOne(Number(student.id), event.target.checked)} /></td><td><Link to={`/students/${student.id}`}>{student.name}</Link></td><td>{student.guardian_phone ?? '-'}</td><td>{student.gender ?? '-'}</td><td><span className={`badge ${student.status === 'active' ? 'green' : 'orange'}`}>{STATUS_LABELS[student.status] ?? student.status}</span></td><td>{student.start_date?.slice(0, 10) ?? '-'}</td>{isAdmin && <td><button className="btn" type="button" onClick={() => setTransferStudent({ studentId: student.id, name: student.name, toClassId: '' })}>转班</button></td>}</tr>)}
            {students.length === 0 && <tr><td colSpan={isAdmin ? 7 : 6}><p className="subtitle">暂无符合条件的学员</p></td></tr>}
          </tbody></table></div>
        </section>
      </div>

      {transferStudent && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setTransferStudent(null); }}>
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="class-transfer-title">
            <form onSubmit={submitTransfer}>
              <div className="modal-header"><div><h2 id="class-transfer-title">办理转班</h2><p className="subtitle">{transferStudent.name} 将从当前班级转入新班级。</p></div><button className="btn" type="button" onClick={() => setTransferStudent(null)}>关闭</button></div>
              <div className="modal-body"><div className="form-row"><label>当前班级<input value={cls.name} disabled /></label><label>转入班级<select required value={transferStudent.toClassId} onChange={(event) => setTransferStudent({ ...transferStudent, toClassId: event.target.value })}><option value="">选择新班级</option>{allClasses.filter((item) => Number(item.id) !== Number(id)).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.subject} · {item.teacher_name ?? '待定'}</option>)}</select></label></div></div>
              <div className="modal-footer"><button className="btn" type="button" onClick={() => setTransferStudent(null)}>取消</button><button className="btn primary" type="submit">确认转班</button></div>
            </form>
          </section>
        </div>
      )}
    </Shell>
  );
}
