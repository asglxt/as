import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3, BookOpenCheck, ChevronRight, CircleUserRound, ClipboardCheck, CreditCard,
  GraduationCap, Home, LogOut, MessageSquare, Star, Wallet
} from 'lucide-react';
import { api } from '../api.ts';
import { useAuth } from '../auth.tsx';

type ParentTab = 'home' | 'scores' | 'comments' | 'homework' | 'account';

export default function ParentMobilePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<ParentTab>('home');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [overview, setOverview] = useState<any>(null);
  const [message, setMessage] = useState('');

  async function loadOverview(id?: number | null) {
    const url = id ? `/api/parent-mobile/overview?studentId=${id}` : '/api/parent-mobile/overview';
    const data = await api<any>(url);
    setOverview(data);
    setSelectedId(data.selectedChild.id);
  }
  useEffect(() => { if (user?.role === 'parent') loadOverview().catch((err) => setMessage(err.message)); }, [user]);

  if (!user || user.role !== 'parent') {
    return <div className="tm-gate"><GraduationCap size={32} /><h1>家长手机端</h1><p>请使用家长账号登录。</p><button className="tm-primary-action" onClick={() => { if (user) logout(); navigate('/parent/login'); }}>家长端登录</button></div>;
  }
  if (!overview) return <div className="tm-gate">{message || '正在加载...'}</div>;

  async function switchChild(id: number) {
    setTab('home');
    await loadOverview(id);
  }

  return (
    <div className="teacher-mobile parent-mobile">
      <header className="tm-topbar"><div><span>家长工作台</span><strong>{user.displayName}</strong></div><button className="tm-icon-button" onClick={logout} title="退出登录"><LogOut size={18} /></button></header>
      {overview.children.length > 1 && <div className="pm-child-switcher">{overview.children.map((child: any) => <button className={selectedId === child.id ? 'active' : ''} key={child.id} onClick={() => switchChild(child.id)}><CircleUserRound size={15} />{child.name}</button>)}</div>}
      <main className="tm-main">
        {tab === 'home' && <ParentHome data={overview} go={setTab} />}
        {tab === 'scores' && <ParentScores studentId={selectedId!} />}
        {tab === 'comments' && <ParentComments studentId={selectedId!} onChanged={() => loadOverview(selectedId)} />}
        {tab === 'homework' && <ParentHomework studentId={selectedId!} onChanged={() => loadOverview(selectedId)} />}
        {tab === 'account' && <ParentAccount studentId={selectedId!} />}
      </main>
      <nav className="tm-bottom-nav"><MobileItem active={tab === 'home'} icon={<Home size={20} />} label="首页" onClick={() => setTab('home')} /><MobileItem active={tab === 'scores'} icon={<BarChart3 size={20} />} label="成绩" onClick={() => setTab('scores')} /><MobileItem active={tab === 'comments'} icon={<MessageSquare size={20} />} label="点评" onClick={() => setTab('comments')} /><MobileItem active={tab === 'homework'} icon={<BookOpenCheck size={20} />} label="作业" onClick={() => setTab('homework')} /><MobileItem active={tab === 'account'} icon={<Wallet size={20} />} label="账户" onClick={() => setTab('account')} /></nav>
    </div>
  );
}

function MobileItem({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return <button className={active ? 'active' : ''} onClick={onClick}>{icon}<span>{label}</span></button>;
}

function ParentHome({ data, go }: { data: any; go: (tab: ParentTab) => void }) {
  const latest = data.stats.latestScore;
  return (
    <>
      <section className="tm-hero pm-child-hero"><div><span>{data.selectedChild.campus_name ?? '校区'}</span><h1>{data.selectedChild.name}的学习动态</h1><p>成绩、点评、作业和账户集中查看</p></div><div className="tm-hero-mark"><CircleUserRound size={28} /></div></section>
      <section className="tm-stat-grid">
        <div><Star size={18} /><b>{latest?.score ?? '-'}</b><span>最近成绩</span></div>
        <div><MessageSquare size={18} /><b>{data.stats.unreadComments}</b><span>未读点评</span></div>
        <div><BookOpenCheck size={18} /><b>{data.stats.pendingHomework}</b><span>待完成作业</span></div>
        <div><CreditCard size={18} /><b>{data.stats.balance}</b><span>账户余额</span></div>
      </section>
      <section className="tm-section"><div className="tm-section-title"><h2>最近成绩</h2><button className="pm-link-button" onClick={() => go('scores')}>全部成绩<ChevronRight size={14} /></button></div>{latest ? <div className="pm-highlight-card"><div><span>{latest.project_name} · {latest.exam_name}</span><strong>{latest.score ?? '未出分'}</strong></div><small>{String(latest.exam_date).slice(0, 10)} · {latest.class_name ?? ''}</small></div> : <div className="tm-empty">暂无成绩</div>}</section>
      <section className="tm-section"><div className="tm-section-title"><h2>最新动态</h2></div><div className="pm-activity-list">{data.latestComments.map((item: any) => <button key={`c-${item.id}`} onClick={() => go('comments')}><MessageSquare size={17} /><div><strong>老师点评</strong><span>{item.content}</span></div><ChevronRight size={15} /></button>)}{data.latestHomework.map((item: any) => <button key={`h-${item.id}`} onClick={() => go('homework')}><BookOpenCheck size={17} /><div><strong>{item.title}</strong><span>{item.status === 'reviewed' ? '老师已批改' : item.status === 'submitted' ? '已提交，等待批改' : '待提交'}</span></div><ChevronRight size={15} /></button>)}{data.latestComments.length === 0 && data.latestHomework.length === 0 && <div className="tm-empty">暂无最新动态</div>}</div></section>
    </>
  );
}

function ParentScores({ studentId }: { studentId: number }) {
  const [report, setReport] = useState<any>(null);
  useEffect(() => { api<any>(`/api/parent-mobile/scores?studentId=${studentId}`).then(setReport).catch(() => {}); }, [studentId]);
  if (!report) return <div className="tm-loading">正在加载成绩...</div>;
  return <section className="tm-page"><div className="tm-page-title"><h1>成绩报告</h1><p>{report.student.name}的成绩记录</p></div><div className="pm-score-list">{report.scores.map((item: any) => <div className="pm-score-card" key={item.id}><div><span>{item.project_name} · {item.exam_name}</span><h3>{item.class_name ?? '未关联班级'}</h3><small>{String(item.exam_date).slice(0, 10)} · {item.source}</small></div><strong>{item.score ?? '-'}</strong>{item.remark && <p>{item.remark}</p>}</div>)}{report.scores.length === 0 && <div className="tm-empty">暂无成绩记录</div>}</div></section>;
}

function ParentComments({ studentId, onChanged }: { studentId: number; onChanged: () => void }) {
  const [items, setItems] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  async function load() { setItems(await api<any[]>(`/api/parent-mobile/comments?studentId=${studentId}`)); }
  useEffect(() => { load().catch((err) => setMessage(err.message)); }, [studentId]);
  async function read(id: number) { await api(`/api/parent-mobile/comments/${id}/read`, { method: 'POST' }); await load(); onChanged(); }
  return <section className="tm-page"><div className="tm-page-title"><h1>课堂点评</h1><p>查看老师反馈，点开后记录已读</p></div>{message && <div className="tm-message">{message}</div>}<div className="pm-comment-list">{items.map((item) => <div className={item.read_at ? 'pm-comment-card read' : 'pm-comment-card'} key={item.id}><div className="pm-comment-head"><div><strong>{item.class_name}</strong><span>{String(item.taught_at).slice(0, 10)}</span></div><span className="tm-pill done"><Star size={12} />{item.rating ?? '-'} · {item.flowers}朵</span></div><p>{item.content ?? '暂无点评内容'}</p>{!item.read_at && <button onClick={() => read(item.id)}><ClipboardCheck size={15} />标记已读</button>}</div>)}{items.length === 0 && <div className="tm-empty">暂无课堂点评</div>}</div></section>;
}

function ParentHomework({ studentId, onChanged }: { studentId: number; onChanged: () => void }) {
  const [items, setItems] = useState<any[]>([]);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [message, setMessage] = useState('');
  async function load() { setItems(await api<any[]>(`/api/parent-mobile/homework?studentId=${studentId}`)); }
  useEffect(() => { load().catch((err) => setMessage(err.message)); }, [studentId]);
  async function submit(recordId: number) {
    try {
      await api(`/api/parent-mobile/homework/${recordId}/submit`, { method: 'POST', body: JSON.stringify({ content: drafts[recordId] ?? '' }) });
      setMessage('作业已提交');
      await load(); onChanged();
    } catch (err: any) { setMessage(err.message); }
  }
  const labels: Record<string, string> = { not_submitted: '待提交', submitted: '待批改', reviewed: '已批改' };
  return <section className="tm-page"><div className="tm-page-title"><h1>孩子作业</h1><p>查看作业要求、提交内容和老师批改结果</p></div>{message && <div className="tm-message">{message}</div>}<div className="pm-homework-list">{items.map((item) => <div className="pm-homework-card" key={item.id}><div className="pm-homework-head"><div><span>{item.class_name}</span><h3>{item.title}</h3></div><span className="tm-pill">{labels[item.status] ?? item.status}</span></div><p>{item.homework_content ?? '暂无作业说明'}</p><small>截止：{item.due_at ? String(item.due_at).slice(0, 16).replace('T', ' ') : '不限'}</small>{item.status === 'reviewed' ? <div className="pm-review-result"><span>评分 <b>{item.score ?? '-'}</b></span><p>{item.comment ?? '老师暂未填写评语'}</p></div> : item.status === 'submitted' ? <div className="tm-message">已提交，等待老师批改</div> : <div className="pm-submit-row"><input placeholder="填写提交内容" value={drafts[item.id] ?? ''} onChange={(e) => setDrafts({ ...drafts, [item.id]: e.target.value })} /><button onClick={() => submit(item.id)}>提交</button></div>}</div>)}{items.length === 0 && <div className="tm-empty">暂无作业</div>}</div></section>;
}

function ParentAccount({ studentId }: { studentId: number }) {
  const [data, setData] = useState<any>({ orders: [], account: { balance: 0, points: 0, transactions: [] } });
  useEffect(() => { api<any>(`/api/parent-mobile/orders?studentId=${studentId}`).then(setData).catch(() => {}); }, [studentId]);
  const typeLabels: Record<string, string> = { enroll: '报名', renew: '续费', recharge: '充值', transfer: '转课', refund: '退费', material: '教材' };
  return <section className="tm-page"><div className="tm-page-title"><h1>订单与账户</h1><p>查看缴费记录、余额和账户流水</p></div><div className="pm-balance-card"><div><span>账户余额</span><strong>¥ {Number(data.account.balance).toFixed(2)}</strong></div><div><span>积分</span><b>{data.account.points}</b></div></div><section className="tm-section"><div className="tm-section-title"><h2>订单记录</h2></div><div className="pm-order-list">{data.orders.map((item: any) => <div className="pm-order-card" key={item.id}><div><span>{item.order_no}</span><h3>{typeLabels[item.order_type] ?? item.order_type}</h3><small>{String(item.created_at).slice(0, 10)}</small></div><div><strong>¥ {Number(item.received).toFixed(2)}</strong><span className={item.payment_status === 'paid' ? 'tm-pill done' : 'tm-pill'}>{item.payment_status === 'paid' ? '已结清' : item.payment_status === 'partial' ? '部分收款' : '未收款'}</span></div></div>)}{data.orders.length === 0 && <div className="tm-empty">暂无订单</div>}</div></section><section className="tm-section"><div className="tm-section-title"><h2>账户流水</h2></div><div className="pm-transaction-list">{data.account.transactions.map((item: any) => <div key={item.id}><div><strong>{item.type === 'recharge' ? '余额充值' : item.type === 'consume' ? '账户消费' : item.type === 'refund' ? '退费入账' : '账户调整'}</strong><span>{item.remark ?? '-'}</span></div><b>{Number(item.amount) > 0 ? '+' : ''}{Number(item.amount).toFixed(2)}</b></div>)}{data.account.transactions.length === 0 && <div className="tm-empty">暂无账户流水</div>}</div></section></section>;
}
