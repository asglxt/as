import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { MessageSquare, Search } from 'lucide-react';
import Shell from '../Shell.tsx';
import { api } from '../api.ts';

export default function CommentsPage() {
  const [tab, setTab] = useState<'list' | 'templates'>('list');
  const [logs, setLogs] = useState<any>({ items: [], total: 0, page: 1, pageSize: 50, summary: { total: 0, completed: 0, pending: 0 } });
  const [filters, setFilters] = useState({ classId: '', status: '', start: '', end: '', page: 1, pageSize: 50 });
  const [templates, setTemplates] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [activeLog, setActiveLog] = useState<any>(null);
  const [roster, setRoster] = useState<any[]>([]);
  const [marks, setMarks] = useState<Record<number, { rating: string; content: string; flowers: string }>>({});
  const [templateForm, setTemplateForm] = useState({ name: '', content: '', defaultRating: '', defaultFlowers: '' });
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [message, setMessage] = useState('');

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (String(value)) params.set(key, String(value));
    return params.toString();
  }, [filters]);

  async function load() {
    setLogs(await api<any>(`/api/comments/logs?${queryString}`));
    setTemplates(await api<any[]>('/api/comments/templates'));
    setClasses(await api<any[]>('/api/classes'));
  }

  useEffect(() => {
    load().catch(() => {});
  }, [queryString]);

  async function openLog(log: any) {
    setActiveLog(log);
    setMarks({});
    const list = await api<any[]>(`/api/attendance/students/${log.schedule_id}`);
    setRoster(list);
    const existing = await api<any[]>(`/api/comments/logs/${log.teaching_log_id}/comments`);
    const next: Record<number, { rating: string; content: string; flowers: string }> = {};
    for (const item of existing) {
      next[item.student_id] = { rating: item.rating ? String(item.rating) : '', content: item.content ?? '', flowers: String(item.flowers ?? 0) };
    }
    setMarks(next);
  }

  function applyTemplate() {
    const template = templates.find((t) => String(t.id) === selectedTemplate);
    if (!template) return;
    const next: Record<number, { rating: string; content: string; flowers: string }> = {};
    for (const r of roster) {
      next[r.student_id] = {
        rating: template.default_rating ? String(template.default_rating) : '',
        content: template.content ?? '',
        flowers: String(template.default_flowers ?? 0)
      };
    }
    setMarks(next);
  }

  async function saveComments() {
    if (!activeLog) return;
    try {
      await api(`/api/comments/record/${activeLog.teaching_log_id}`, {
        method: 'POST',
        body: JSON.stringify({
          comments: roster.map((r) => ({
            studentId: r.student_id,
            rating: marks[r.student_id]?.rating ? Number(marks[r.student_id].rating) : null,
            content: marks[r.student_id]?.content ?? '',
            flowers: marks[r.student_id]?.flowers ? Number(marks[r.student_id].flowers) : 0
          }))
        })
      });
      setMessage('点评已保存');
      setActiveLog(null);
      await load();
    } catch (err: any) {
      setMessage(err.message);
    }
  }

  async function createTemplate(e: FormEvent) {
    e.preventDefault();
    await api('/api/comments/templates', {
      method: 'POST',
      body: JSON.stringify({
        name: templateForm.name,
        content: templateForm.content,
        defaultRating: templateForm.defaultRating ? Number(templateForm.defaultRating) : null,
        defaultFlowers: templateForm.defaultFlowers ? Number(templateForm.defaultFlowers) : 0
      })
    });
    setTemplateForm({ name: '', content: '', defaultRating: '', defaultFlowers: '' });
    setMessage('模板已创建');
    await load();
  }

  return (
    <Shell>
      <div className="panel-header"><div><h1 className="page-title">课堂点评</h1><p className="page-subtitle">按上课记录逐学员点评，统计点评完成率和家长已读率。</p></div></div>
      <div className="tabs"><button className={tab === 'list' ? 'active' : ''} onClick={() => setTab('list')}>点评记录</button><button className={tab === 'templates' ? 'active' : ''} onClick={() => setTab('templates')}>点评模板</button></div>
      {message && <div className="summary-strip"><span>{message}</span></div>}

      {tab === 'list' && (
        <>
          <div className="cards"><div className="stat-card"><b>{logs.summary.total}</b><span>应点评课程</span></div><div className="stat-card"><b>{logs.summary.completed}</b><span>已完成点评</span></div><div className="stat-card"><b>{logs.summary.pending}</b><span>待点评课程</span></div></div>
          <form className="panel" onSubmit={(e) => { e.preventDefault(); setFilters({ ...filters, page: 1 }); }}>
            <div className="form-row">
              <label>班级<select value={filters.classId} onChange={(e) => setFilters({ ...filters, classId: e.target.value })}><option value="">全部班级</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label>点评状态<select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">全部状态</option><option value="pending">待点评</option><option value="completed">已完成</option></select></label>
              <label>开始日期<input type="date" value={filters.start} onChange={(e) => setFilters({ ...filters, start: e.target.value })} /></label>
              <label>结束日期<input type="date" value={filters.end} onChange={(e) => setFilters({ ...filters, end: e.target.value })} /></label>
              <button className="btn primary icon-text" type="submit"><Search size={15} />查询</button>
            </div>
          </form>
          <div className="panel">
            <table className="table">
              <thead><tr><th>上课时间</th><th>班级</th><th>教师</th><th>学员数</th><th>已点评</th><th>已读</th><th>点评率</th><th>已读率</th><th>操作</th></tr></thead>
              <tbody>
                {logs.items.map((log: any) => (
                  <tr key={log.teaching_log_id}>
                    <td>{log.taught_at ? String(log.taught_at).slice(0, 16).replace('T', ' ') : '-'}</td>
                    <td>{log.class_name}</td>
                    <td>{log.teacher_name ?? '-'}</td>
                    <td>{log.student_count}</td>
                    <td>{log.comment_count}</td>
                    <td>{log.read_count}</td>
                    <td>{log.comment_rate}%</td>
                    <td>{log.read_rate}%</td>
                    <td><button className="btn primary" onClick={() => openLog(log)}>点评</button></td>
                  </tr>
                ))}
                {logs.items.length === 0 && <tr><td colSpan={9}><div style={{ padding: 36, textAlign: 'center', color: '#8a96a8' }}><MessageSquare size={28} /><p>暂无符合条件的点评记录</p></div></td></tr>}
              </tbody>
            </table>
          </div>

          {activeLog && (
            <div className="panel">
              <h2>{activeLog.class_name} · 逐学员点评</h2>
              <div className="form-row">
                <label>套用模板<select value={selectedTemplate} onChange={(e) => setSelectedTemplate(e.target.value)}>
                  <option value="">选择模板</option>
                  {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select></label>
                <button className="btn" onClick={applyTemplate} disabled={!selectedTemplate}>应用到全部学员</button>
              </div>
              <table className="table">
                <thead><tr><th>学员</th><th>评分</th><th>评语</th><th>小红花</th></tr></thead>
                <tbody>
                  {roster.map((r) => (
                    <tr key={r.student_id}>
                      <td>{r.student_name}</td>
                      <td><input style={{ width: 60 }} value={marks[r.student_id]?.rating ?? ''} onChange={(e) => setMarks({ ...marks, [r.student_id]: { rating: e.target.value, content: marks[r.student_id]?.content ?? '', flowers: marks[r.student_id]?.flowers ?? '0' } })} /></td>
                      <td><input value={marks[r.student_id]?.content ?? ''} onChange={(e) => setMarks({ ...marks, [r.student_id]: { rating: marks[r.student_id]?.rating ?? '', content: e.target.value, flowers: marks[r.student_id]?.flowers ?? '0' } })} /></td>
                      <td><input style={{ width: 60 }} value={marks[r.student_id]?.flowers ?? '0'} onChange={(e) => setMarks({ ...marks, [r.student_id]: { rating: marks[r.student_id]?.rating ?? '', content: marks[r.student_id]?.content ?? '', flowers: e.target.value } })} /></td>
                    </tr>
                  ))}
                  {roster.length === 0 && <tr><td colSpan={4}>该班级暂无学员</td></tr>}
                </tbody>
              </table>
              <button className="btn primary" onClick={saveComments}>保存点评</button>
              <button className="btn" onClick={() => setActiveLog(null)}>取消</button>
            </div>
          )}
        </>
      )}

      {tab === 'templates' && (
        <>
          <form className="form-row" onSubmit={createTemplate}>
            <label>模板名称<input value={templateForm.name} onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })} /></label>
            <label>评语内容<input value={templateForm.content} onChange={(e) => setTemplateForm({ ...templateForm, content: e.target.value })} /></label>
            <label>默认评分<input style={{ width: 60 }} value={templateForm.defaultRating} onChange={(e) => setTemplateForm({ ...templateForm, defaultRating: e.target.value })} /></label>
            <label>默认小红花<input style={{ width: 60 }} value={templateForm.defaultFlowers} onChange={(e) => setTemplateForm({ ...templateForm, defaultFlowers: e.target.value })} /></label>
            <button className="btn primary" type="submit">新增模板</button>
          </form>
          <div className="panel">
            <table className="table">
              <thead><tr><th>名称</th><th>内容</th><th>默认评分</th><th>默认小红花</th></tr></thead>
              <tbody>
                {templates.map((t) => (
                  <tr key={t.id}><td>{t.name}</td><td>{t.content}</td><td>{t.default_rating ?? '-'}</td><td>{t.default_flowers}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Shell>
  );
}
