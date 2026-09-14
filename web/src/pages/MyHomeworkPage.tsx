import { useEffect, useState } from 'react';
import Shell from '../Shell.tsx';
import { api } from '../api.ts';
import { useAuth } from '../auth.tsx';

const STATUS_LABEL: Record<string, string> = {
  not_submitted: '未提交', submitted: '已提交', reviewed: '已批改'
};

export default function MyHomeworkPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [message, setMessage] = useState('');

  async function load() {
    setItems(await api<any[]>('/api/me/homework'));
  }

  useEffect(() => {
    load().catch(() => {});
  }, []);

  async function submit(recordId: number) {
    try {
      await api(`/api/me/homework/${recordId}/submit`, {
        method: 'POST',
        body: JSON.stringify({ content: drafts[recordId] ?? '' })
      });
      setMessage('已提交');
      await load();
    } catch (err: any) {
      setMessage(err.message);
    }
  }

  return (
    <Shell>
      <h1 className="page-title">{user?.role === 'parent' ? '孩子作业' : '我的作业'}</h1>
      {message && <p className="subtitle">{message}</p>}
      {items.map((h) => (
        <div className="panel" key={h.id}>
          <div className="form-row" style={{ justifyContent: 'space-between' }}>
            <span className="label">{h.student_name} · {h.class_name} · {h.title}</span>
            <span className="subtitle">{STATUS_LABEL[h.status] ?? h.status}</span>
          </div>
          <p>{h.homework_content ?? '-'}</p>
          <p className="subtitle">截止：{h.due_at ? String(h.due_at).slice(0, 16).replace('T', ' ') : '不限'}</p>
          {h.status === 'reviewed' ? (
            <p>评分：{h.score ?? '-'}　评语：{h.comment ?? '-'}</p>
          ) : h.status === 'submitted' ? (
            <p className="subtitle">已提交，等待老师批改</p>
          ) : (
            <div className="form-row">
              <label>提交内容<input value={drafts[h.id] ?? ''} onChange={(e) => setDrafts({ ...drafts, [h.id]: e.target.value })} /></label>
              <button className="btn primary" onClick={() => submit(h.id)}>提交作业</button>
            </div>
          )}
        </div>
      ))}
      {items.length === 0 && <p className="subtitle">暂无作业</p>}
    </Shell>
  );
}