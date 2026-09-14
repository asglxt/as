import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Bell, BookTemplate, CheckCircle2, Eye, FileText, Plus, Save, Search, Send,
  Undo2, Users, XCircle
} from 'lucide-react';
import Shell from '../Shell.tsx';
import { api } from '../api.ts';
import { useAuth } from '../auth.tsx';

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿', pending: '审核中', published: '已发布', rejected: '已驳回', recalled: '已撤回'
};
const AUDIENCE_LABELS: Record<string, string> = { all: '全校员工', campus: '指定校区', class: '指定班级' };
const STATUS_CLASSES: Record<string, string> = {
  draft: '', pending: 'orange', published: 'green', rejected: 'red', recalled: ''
};
const EMPTY_FILTERS = { keyword: '', status: '', audienceType: '', campusId: '', page: 1, pageSize: 20 };
const EMPTY_FORM = {
  title: '', content: '', category: 'general', audienceType: 'all', campusId: '',
  classIds: [] as string[], templateId: ''
};

interface NotificationList {
  items: any[];
  total: number;
  page: number;
  pageSize: number;
  summary: {
    total: number; draft: number; pending: number; published: number; recalled: number;
    rejected: number; recipients: number; reads: number; readRate: number;
  };
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const canManage = user?.role === 'admin' || (user?.modules ?? []).includes('notifications');
  return canManage ? <NotificationManagement /> : <NotificationInbox />;
}

function NotificationInbox() {
  const [items, setItems] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [message, setMessage] = useState('');

  async function load() {
    const rows = await api<any[]>('/api/notifications/mine');
    setItems(rows);
    setSelected((current: any) => current ? rows.find((row) => row.id === current.id) ?? null : null);
  }

  useEffect(() => { load().catch((err) => setMessage(err.message)); }, []);

  async function open(item: any) {
    setSelected(item);
    if (!item.read_at) {
      try {
        await api(`/api/notifications/${item.id}/read`, { method: 'POST', body: '{}' });
        await load();
      } catch (err: any) { setMessage(err.message); }
    }
  }

  return (
    <Shell>
      <div className="panel-header"><div><h1 className="page-title">通知公告</h1><p className="page-subtitle">查看学校、校区和班级发送的最新通知。</p></div></div>
      {message && <div className="summary-strip"><span>{message}</span></div>}
      <div className="workbench-grid">
        <section className="panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-wrap"><table className="table"><thead><tr><th>状态</th><th>标题</th><th>发布时间</th><th>操作</th></tr></thead><tbody>
            {items.map((item) => <tr key={item.id}><td>{!item.read_at ? <span className="badge blue">未读</span> : <span className="badge">已读</span>}</td><td><b>{item.title}</b><div className="subtitle">{item.status === 'recalled' ? `已撤回${item.recall_reason ? `：${item.recall_reason}` : ''}` : String(item.content).slice(0, 42)}</div></td><td>{item.published_at ? String(item.published_at).slice(0, 16).replace('T', ' ') : '-'}</td><td><button className="btn icon-text" onClick={() => open(item)}><Eye size={14} />查看</button></td></tr>)}
            {items.length === 0 && <tr><td colSpan={4}><div className="empty-state"><Bell size={28} /><p>暂无通知</p></div></td></tr>}
          </tbody></table></div>
        </section>
        <section className="panel">
          {selected ? <><div className="panel-header"><h2>{selected.title}</h2><span className={`badge ${STATUS_CLASSES[selected.status] ?? ''}`}>{STATUS_LABELS[selected.status] ?? selected.status}</span></div><div className="notification-content">{selected.content}</div><p className="subtitle">{selected.published_at ? `发布时间：${String(selected.published_at).slice(0, 16).replace('T', ' ')}` : ''}</p>{selected.recall_reason && <p className="subtitle">撤回原因：{selected.recall_reason}</p>}</> : <div className="empty-state"><Bell size={30} /><p>选择一条通知查看详情</p></div>}
        </section>
      </div>
    </Shell>
  );
}

function NotificationManagement() {
  const [data, setData] = useState<NotificationList>({
    items: [], total: 0, page: 1, pageSize: 20,
    summary: { total: 0, draft: 0, pending: 0, published: 0, recalled: 0, rejected: 0, recipients: 0, reads: 0, readRate: 0 }
  });
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [tab, setTab] = useState<'notices' | 'templates'>('notices');
  const [campuses, setCampuses] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [templateForm, setTemplateForm] = useState({ name: '', title: '', content: '', category: 'general' });
  const [showCreate, setShowCreate] = useState(false);
  const [showTemplate, setShowTemplate] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [reviewFor, setReviewFor] = useState<number | null>(null);
  const [reviewReason, setReviewReason] = useState('');
  const [recallFor, setRecallFor] = useState<number | null>(null);
  const [recallReason, setRecallReason] = useState('');
  const [message, setMessage] = useState('');

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (String(value)) params.set(key, String(value));
    return params.toString();
  }, [filters]);

  async function load() { setData(await api<NotificationList>(`/api/notifications/list?${queryString}`)); }
  async function loadTemplates() { setTemplates(await api<any[]>('/api/notifications/templates')); }

  useEffect(() => { load().catch((err) => setMessage(err.message)); }, [queryString]);
  useEffect(() => {
    api<any[]>('/api/campuses').then(setCampuses).catch(() => {});
    api<any[]>('/api/classes').then(setClasses).catch(() => {});
    loadTemplates().catch(() => {});
  }, []);

  function applyTemplate(templateId: string) {
    const template = templates.find((item) => String(item.id) === templateId);
    setForm((current) => ({
      ...current,
      templateId,
      title: template?.title ?? current.title,
      content: template?.content ?? current.content,
      category: template?.category ?? current.category
    }));
  }

  async function create(event: FormEvent, action: 'draft' | 'pending' | 'published') {
    event.preventDefault();
    try {
      await api('/api/notifications', {
        method: 'POST',
        body: JSON.stringify({
          title: form.title,
          content: form.content,
          category: form.category,
          audienceType: form.audienceType,
          campusId: form.audienceType === 'campus' ? Number(form.campusId) : null,
          classIds: form.audienceType === 'class' ? form.classIds.map(Number) : [],
          templateId: form.templateId ? Number(form.templateId) : null,
          status: action
        })
      });
      setMessage(action === 'draft' ? '通知草稿已保存' : action === 'pending' ? '通知已提交审核' : '通知已发布');
      setForm(EMPTY_FORM);
      setShowCreate(false);
      await load();
    } catch (err: any) { setMessage(err.message); }
  }

  async function runAction(id: number, action: 'submit' | 'publish', success: string) {
    try {
      await api(`/api/notifications/${id}/${action}`, { method: 'POST', body: '{}' });
      setMessage(success);
      await load();
      if (detail?.notification?.id === id) await openDetail(id);
    } catch (err: any) { setMessage(err.message); }
  }

  async function review(approved: boolean) {
    if (!reviewFor) return;
    try {
      await api(`/api/notifications/${reviewFor}/review`, {
        method: 'POST', body: JSON.stringify({ approved, reason: reviewReason })
      });
      setMessage(approved ? '审核已通过并发布' : '通知已驳回');
      setReviewFor(null);
      setReviewReason('');
      await load();
    } catch (err: any) { setMessage(err.message); }
  }

  async function recall() {
    if (!recallFor) return;
    try {
      await api(`/api/notifications/${recallFor}/recall`, {
        method: 'POST', body: JSON.stringify({ reason: recallReason })
      });
      setMessage('通知已撤回');
      setRecallFor(null);
      setRecallReason('');
      await load();
    } catch (err: any) { setMessage(err.message); }
  }

  async function openDetail(id: number) { setDetail(await api<any>(`/api/notifications/${id}`)); }

  async function createTemplate(event: FormEvent) {
    event.preventDefault();
    try {
      await api('/api/notifications/templates', { method: 'POST', body: JSON.stringify(templateForm) });
      setMessage('通知模板已保存');
      setTemplateForm({ name: '', title: '', content: '', category: 'general' });
      setShowTemplate(false);
      await loadTemplates();
    } catch (err: any) { setMessage(err.message); }
  }

  function audienceText(item: any) {
    if (item.audience_type === 'all') return '全校员工';
    if (item.audience_type === 'campus') return item.campus_name ?? '指定校区';
    return item.class_names?.join('、') || '指定班级';
  }

  return (
    <Shell>
      <div className="panel-header"><div><h1 className="page-title">通知公告</h1><p className="page-subtitle">统一管理校内通知、定向发送、审核和阅读回执。</p></div><div className="toolbar" style={{ margin: 0 }}><button className="btn icon-text" onClick={() => setShowTemplate((value) => !value)}><BookTemplate size={15} />新建模板</button><button className="btn primary icon-text" onClick={() => { setShowCreate(true); setTab('notices'); }}><Plus size={15} />新建通知</button></div></div>
      {message && <div className="summary-strip"><span>{message}</span></div>}
      <div className="cards">
        <div className="stat-card"><b>{data.summary.total}</b><span>通知总数</span></div>
        <div className="stat-card"><b>{data.summary.published}</b><span>已发布</span></div>
        <div className="stat-card"><b>{data.summary.pending}</b><span>待审核</span></div>
        <div className="stat-card"><b>{data.summary.readRate}%</b><span>整体阅读率</span></div>
      </div>
      <div className="tabs"><button className={tab === 'notices' ? 'active' : ''} onClick={() => setTab('notices')}>通知记录</button><button className={tab === 'templates' ? 'active' : ''} onClick={() => setTab('templates')}>模板库</button></div>

      {showTemplate && <form className="panel" onSubmit={createTemplate}><div className="panel-header"><h2>新建通知模板</h2><button type="button" className="btn" onClick={() => setShowTemplate(false)}>关闭</button></div><div className="form-row"><label>模板名称<input required value={templateForm.name} onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })} /></label><label>默认标题<input required value={templateForm.title} onChange={(e) => setTemplateForm({ ...templateForm, title: e.target.value })} /></label><label>分类<select value={templateForm.category} onChange={(e) => setTemplateForm({ ...templateForm, category: e.target.value })}><option value="general">通用通知</option><option value="academic">教务通知</option><option value="finance">财务通知</option><option value="activity">活动通知</option></select></label></div><div className="form-row"><label style={{ width: '100%' }}>模板正文<textarea required rows={5} value={templateForm.content} onChange={(e) => setTemplateForm({ ...templateForm, content: e.target.value })} /></label></div><button className="btn primary icon-text" type="submit"><Save size={15} />保存模板</button></form>}

      {showCreate && <form className="panel" onSubmit={(event) => create(event, 'draft')}><div className="panel-header"><h2>新建通知</h2><button type="button" className="btn" onClick={() => setShowCreate(false)}>关闭</button></div><div className="form-row"><label>套用模板<select value={form.templateId} onChange={(e) => applyTemplate(e.target.value)}><option value="">不套用模板</option>{templates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>通知分类<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}><option value="general">通用通知</option><option value="academic">教务通知</option><option value="finance">财务通知</option><option value="activity">活动通知</option></select></label><label>发送范围<select value={form.audienceType} onChange={(e) => setForm({ ...form, audienceType: e.target.value, campusId: '', classIds: [] })}><option value="all">全校员工</option><option value="campus">指定校区</option><option value="class">指定班级</option></select></label>{form.audienceType === 'campus' && <label>发送校区<select required value={form.campusId} onChange={(e) => setForm({ ...form, campusId: e.target.value })}><option value="">选择校区</option>{campuses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}{form.audienceType === 'class' && <label>发送班级<select required multiple size={4} value={form.classIds} onChange={(e) => setForm({ ...form, classIds: Array.from(e.target.selectedOptions).map((option) => option.value) })}>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}</div><div className="form-row"><label style={{ width: '100%' }}>通知标题<input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label></div><div className="form-row"><label style={{ width: '100%' }}>通知正文<textarea required rows={6} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} /></label></div><div className="toolbar" style={{ margin: 0 }}><button className="btn icon-text" type="submit"><Save size={15} />保存草稿</button><button className="btn icon-text" type="button" onClick={(event) => create(event, 'pending')}><Send size={15} />提交审核</button><button className="btn primary icon-text" type="button" onClick={(event) => create(event, 'published')}><CheckCircle2 size={15} />直接发布</button></div></form>}

      {tab === 'notices' && <section className="panel" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="toolbar" style={{ padding: 14, margin: 0 }}><label className="compact-field"><Search size={14} /><input placeholder="搜索标题或正文" value={filters.keyword} onChange={(e) => setFilters({ ...filters, keyword: e.target.value, page: 1 })} /></label><select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}><option value="">全部状态</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select value={filters.audienceType} onChange={(e) => setFilters({ ...filters, audienceType: e.target.value, page: 1 })}><option value="">全部范围</option>{Object.entries(AUDIENCE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select value={filters.campusId} onChange={(e) => setFilters({ ...filters, campusId: e.target.value, page: 1 })}><option value="">全部校区</option>{campuses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><span className="spacer" /><span className="subtitle">已送达 {data.summary.recipients} 人次，阅读 {data.summary.reads} 人次</span></div>
        <div className="table-wrap"><table className="table"><thead><tr><th>通知标题</th><th>发送范围</th><th>状态</th><th>送达人数</th><th>阅读率</th><th>创建人</th><th>创建时间</th><th>操作</th></tr></thead><tbody>
          {data.items.map((item) => <tr key={item.id}><td><b>{item.title}</b><div className="subtitle">{String(item.content).slice(0, 36)}</div></td><td>{audienceText(item)}</td><td><span className={`badge ${STATUS_CLASSES[item.status] ?? ''}`}>{STATUS_LABELS[item.status] ?? item.status}</span></td><td>{item.recipient_count}</td><td><div className="progress-track"><span style={{ width: `${item.read_rate}%` }} /></div><span className="subtitle">{item.read_rate}%（{item.read_count}/{item.recipient_count}）</span></td><td>{item.created_by_name ?? '-'}</td><td>{String(item.created_at).slice(0, 10)}</td><td><div className="toolbar" style={{ margin: 0 }}><button className="btn icon-text" onClick={() => openDetail(Number(item.id))}><Eye size={14} />详情</button>{['draft','rejected'].includes(item.status) && <button className="btn icon-text" onClick={() => runAction(Number(item.id), 'submit', '通知已提交审核')}><Send size={14} />送审</button>}{item.status === 'pending' && <button className="btn icon-text" onClick={() => setReviewFor(Number(item.id))}><CheckCircle2 size={14} />审核</button>}{['draft','rejected'].includes(item.status) && <button className="btn icon-text" onClick={() => runAction(Number(item.id), 'publish', '通知已发布')}><CheckCircle2 size={14} />发布</button>}{item.status === 'published' && <button className="btn danger icon-text" onClick={() => setRecallFor(Number(item.id))}><Undo2 size={14} />撤回</button>}</div></td></tr>)}
          {data.items.length === 0 && <tr><td colSpan={8}><div className="empty-state"><Bell size={28} /><p>暂无通知</p></div></td></tr>}
        </tbody></table></div>
        <div className="toolbar" style={{ padding: 14, margin: 0 }}><span className="subtitle">共 {data.total} 条，第 {data.page} 页</span><span className="spacer" /><button className="btn" disabled={data.page <= 1} onClick={() => setFilters({ ...filters, page: filters.page - 1 })}>上一页</button><button className="btn" disabled={data.page * data.pageSize >= data.total} onClick={() => setFilters({ ...filters, page: filters.page + 1 })}>下一页</button></div>
      </section>}

      {tab === 'templates' && <section className="panel" style={{ padding: 0, overflow: 'hidden' }}><div className="table-wrap"><table className="table"><thead><tr><th>模板名称</th><th>默认标题</th><th>分类</th><th>创建人</th><th>创建时间</th></tr></thead><tbody>{templates.map((item) => <tr key={item.id}><td><b>{item.name}</b></td><td>{item.title}</td><td>{item.category}</td><td>{item.created_by_name ?? '-'}</td><td>{String(item.created_at).slice(0, 10)}</td></tr>)}{templates.length === 0 && <tr><td colSpan={5}><div className="empty-state"><FileText size={28} /><p>暂无模板</p></div></td></tr>}</tbody></table></div></section>}

      {reviewFor && <section className="panel"><div className="panel-header"><h2>审核通知</h2><button className="btn" onClick={() => setReviewFor(null)}>关闭</button></div><div className="form-row"><label style={{ flex: 1 }}>驳回原因<textarea rows={3} value={reviewReason} onChange={(e) => setReviewReason(e.target.value)} placeholder="审核通过时可不填写" /></label></div><div className="toolbar" style={{ margin: 0 }}><button className="btn primary icon-text" onClick={() => review(true)}><CheckCircle2 size={15} />审核通过并发布</button><button className="btn danger icon-text" onClick={() => review(false)}><XCircle size={15} />驳回</button></div></section>}

      {recallFor && <section className="panel"><div className="panel-header"><h2>撤回通知</h2><button className="btn" onClick={() => setRecallFor(null)}>关闭</button></div><div className="form-row"><label style={{ flex: 1 }}>撤回原因<input value={recallReason} onChange={(e) => setRecallReason(e.target.value)} /></label><button className="btn danger icon-text" onClick={recall}><Undo2 size={15} />确认撤回</button></div></section>}

      {detail && <section className="panel"><div className="panel-header"><h2>通知详情：{detail.notification.title}</h2><button className="btn" onClick={() => setDetail(null)}>关闭</button></div><div className="summary-strip"><span>发送范围 <b>{audienceText(detail.notification)}</b></span><span>送达 <b>{detail.notification.recipient_count}</b></span><span>已读 <b>{detail.notification.read_count}</b></span><span>阅读率 <b>{detail.notification.read_rate}%</b></span></div><div className="notification-content">{detail.notification.content}</div><div className="table-wrap"><table className="table"><thead><tr><th>接收人</th><th>身份</th><th>阅读状态</th><th>阅读时间</th></tr></thead><tbody>{detail.recipients.map((item: any) => <tr key={item.id}><td>{item.display_name}</td><td>{item.role === 'parent' ? '家长' : item.role === 'student' ? '学生' : '教职工'}</td><td>{item.read_at ? <span className="badge green">已读</span> : <span className="badge orange">未读</span>}</td><td>{item.read_at ? String(item.read_at).slice(0, 16).replace('T', ' ') : '-'}</td></tr>)}</tbody></table></div></section>}
    </Shell>
  );
}
