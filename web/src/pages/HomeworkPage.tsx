import { useEffect, useState, type FormEvent } from 'react';
import Shell from '../Shell.tsx';
import { api } from '../api.ts';

export default function HomeworkPage() {
  const [tab, setTab] = useState<'list' | 'draft' | 'create'>('list');
  const [items, setItems] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [records, setRecords] = useState<any[]>([]);
  const [activeHomework, setActiveHomework] = useState<any>(null);
  const [form, setForm] = useState({ classId: '', title: '', content: '', dueAt: '' });
  const [reviewForm, setReviewForm] = useState<Record<number, { score: string; comment: string }>>({});
  const [message, setMessage] = useState('');

  async function load(status?: string) {
    const query = status ? `?status=${status}` : '';
    setItems(await api<any[]>(`/api/homework${query}`));
  }

  useEffect(() => {
    load().catch(() => {});
    api<any[]>('/api/classes').then(setClasses).catch(() => {});
  }, []);

  async function create(e: FormEvent, status: 'draft' | 'published') {
    e.preventDefault();
    try {
      await api('/api/homework', {
        method: 'POST',
        body: JSON.stringify({
          classId: Number(form.classId), title: form.title, content: form.content,
          status, dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null
        })
      });
      setMessage(status === 'draft' ? '已保存草稿' : '已发布作业');
      setForm({ classId: '', title: '', content: '', dueAt: '' });
      await load();
    } catch (err: any) {
      setMessage(err.message);
    }
  }

  async function publish(id: number) {
    await api(`/api/homework/${id}/publish`, { method: 'POST' });
    setMessage('已发布');
    await load();
  }

  async function openRecords(item: any) {
    setActiveHomework(item);
    setRecords(await api<any[]>(`/api/homework/${item.id}/records`));
    setReviewForm({});
  }

  async function review(studentId: number) {
    if (!activeHomework) return;
    const values = reviewForm[studentId] ?? { score: '', comment: '' };
    await api(`/api/homework/${activeHomework.id}/records/${studentId}/review`, {
      method: 'POST',
      body: JSON.stringify({ score: values.score, comment: values.comment })
    });
    setRecords(await api<any[]>(`/api/homework/${activeHomework.id}/records`));
  }

  const STATUS_LABEL: Record<string, string> = { draft: '草稿', published: '已发布', closed: '已关闭' };

  return (
    <Shell>
      <h1 className="page-title">作业</h1>
      <div className="form-row">
        <button className={tab === 'list' ? 'btn primary' : 'btn'} onClick={() => { setTab('list'); load(); }}>作业列表</button>
        <button className={tab === 'draft' ? 'btn primary' : 'btn'} onClick={() => { setTab('draft'); load('draft'); }}>草稿箱</button>
        <button className={tab === 'create' ? 'btn primary' : 'btn'} onClick={() => setTab('create')}>布置作业</button>
      </div>
      {message && <p className="subtitle">{message}</p>}

      {tab === 'create' && (
        <form className="form-row" onSubmit={(e) => create(e, 'published')}>
          <label>班级<select value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })}>
            <option value="">选择班级</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></label>
          <label>标题<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
          <label>内容<input value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} /></label>
          <label>截止时间<input type="datetime-local" value={form.dueAt} onChange={(e) => setForm({ ...form, dueAt: e.target.value })} /></label>
          <button className="btn" type="button" onClick={(e) => create(e as any, 'draft')}>保存草稿</button>
          <button className="btn primary" type="submit">发布作业</button>
        </form>
      )}

      {(tab === 'list' || tab === 'draft') && (
        <>
          <div className="panel">
            <table className="table">
              <thead>
                <tr><th>标题</th><th>班级</th><th>教师</th><th>状态</th><th>学员</th><th>已提交</th><th>已批改</th><th>未读</th><th>截止</th><th>操作</th></tr>
              </thead>
              <tbody>
                {items.map((h) => (
                  <tr key={h.id}>
                    <td>{h.title}</td><td>{h.class_name}</td><td>{h.teacher_name ?? '-'}</td>
                    <td>{STATUS_LABEL[h.status] ?? h.status}</td>
                    <td>{h.student_count}</td><td>{h.submitted_count}</td><td>{h.reviewed_count}</td><td>{h.unread_count}</td>
                    <td>{h.due_at ? String(h.due_at).slice(0, 10) : '-'}</td>
                    <td>
                      {h.status === 'draft' && <button className="btn" onClick={() => publish(h.id)}>发布</button>}
                      <button className="btn primary" onClick={() => openRecords(h)}>批改</button>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && <tr><td colSpan={10}>暂无作业</td></tr>}
              </tbody>
            </table>
          </div>

          {activeHomework && (
            <div className="panel">
              <h2>{activeHomework.title} · 学员作业</h2>
              <table className="table">
                <thead><tr><th>学员</th><th>状态</th><th>提交内容</th><th>评分</th><th>评语</th><th>操作</th></tr></thead>
                <tbody>
                  {records.map((r) => (
                    <tr key={r.id}>
                      <td>{r.student_name}</td>
                      <td>{r.status}</td>
                      <td>{r.content ?? '-'}</td>
                      <td><input style={{ width: 60 }} value={reviewForm[r.student_id]?.score ?? r.score ?? ''} onChange={(e) => setReviewForm({ ...reviewForm, [r.student_id]: { score: e.target.value, comment: reviewForm[r.student_id]?.comment ?? r.comment ?? '' } })} /></td>
                      <td><input value={reviewForm[r.student_id]?.comment ?? r.comment ?? ''} onChange={(e) => setReviewForm({ ...reviewForm, [r.student_id]: { score: reviewForm[r.student_id]?.score ?? r.score ?? '', comment: e.target.value } })} /></td>
                      <td><button className="btn primary" onClick={() => review(r.student_id)} disabled={r.status === 'not_submitted'}>批改</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Shell>
  );
}