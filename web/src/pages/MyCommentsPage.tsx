import { useEffect, useState } from 'react';
import Shell from '../Shell.tsx';
import { api } from '../api.ts';
import { useAuth } from '../auth.tsx';

export default function MyCommentsPage() {
  const { user } = useAuth();
  const [comments, setComments] = useState<any[]>([]);

  async function load() {
    setComments(await api<any[]>('/api/me/comments'));
  }

  useEffect(() => {
    load().catch(() => {});
  }, []);

  async function markRead(id: number) {
    await api(`/api/me/comments/${id}/read`, { method: 'POST' });
    await load();
  }

  return (
    <Shell>
      <h1 className="page-title">{user?.role === 'parent' ? '孩子点评' : '我的点评'}</h1>
      {comments.map((c) => (
        <div className="panel" key={c.id}>
          <div className="form-row" style={{ justifyContent: 'space-between' }}>
            <span className="label">{c.student_name} · {c.class_name} · {c.taught_at ? String(c.taught_at).slice(0, 10) : ''}</span>
            {c.read_at ? <span className="subtitle">已读</span> : <button className="btn" onClick={() => markRead(c.id)}>标记已读</button>}
          </div>
          <p>评分：{c.rating ?? '-'}　小红花：{c.flowers}</p>
          <p>{c.content ?? '-'}</p>
        </div>
      ))}
      {comments.length === 0 && <p className="subtitle">暂无点评</p>}
    </Shell>
  );
}