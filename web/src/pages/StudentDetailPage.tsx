import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Shell from '../Shell.tsx';
import { api } from '../api.ts';

interface StudentDetail {
  student: any;
  guardians: any[];
  classes: any[];
  scores: any[];
  growthRecords: any[];
  orders: any[];
  account: { balance: number; points: number; updatedAt: string | null };
}

const TABS = [
  ['overview', '基础信息'], ['classes', '报读课程'], ['scores', '成绩'],
  ['growth', '成长记录'], ['orders', '订单'], ['account', '学员账户']
] as const;

const STATUS_LABELS: Record<string, string> = { active: '在读', inactive: '停课', graduated: '结课' };

export default function StudentDetailPage() {
  const { id } = useParams();
  const [detail, setDetail] = useState<StudentDetail | null>(null);
  const [tab, setTab] = useState<string>('overview');
  const [growth, setGrowth] = useState({ type: '课堂点评', content: '' });
  const [message, setMessage] = useState('');

  async function load() {
    setDetail(await api<StudentDetail>(`/api/students/${id}`));
  }

  useEffect(() => {
    load().catch((err) => setMessage(err.message));
  }, [id]);

  async function addGrowth(e: FormEvent) {
    e.preventDefault();
    if (!growth.content.trim()) return;
    await api(`/api/students/${id}/growth`, { method: 'POST', body: JSON.stringify(growth) });
    setGrowth({ type: '课堂点评', content: '' });
    setMessage('成长记录已保存');
    await load();
  }

  if (!detail) {
    return <Shell><h1 className="page-title">学员详情</h1><p className="subtitle">{message || '正在加载...'}</p></Shell>;
  }

  const student = detail.student;
  return (
    <Shell>
      <div className="panel-header">
        <div>
          <Link className="btn icon-text" to="/students"><ArrowLeft size={15} />返回学员列表</Link>
          <h1 className="page-title" style={{ marginTop: 14 }}>{student.name}</h1>
          <p className="page-subtitle">{student.campus_name ?? '未分配校区'} · {student.class_names || '暂未分班'}</p>
        </div>
        <span className={`badge ${student.status === 'active' ? 'green' : 'orange'}`}>{STATUS_LABELS[student.status] ?? student.status}</span>
      </div>

      {message && <div className="summary-strip"><span>{message}</span></div>}


      <div className="tabs">{TABS.map(([key, label]) => <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label}</button>)}</div>

      {tab === 'overview' && (
        <div className="workbench-grid">
          <section className="panel">
            <div className="panel-header"><h2>学员资料</h2></div>
            <div className="table-wrap"><table className="table"><tbody>
              <tr><th>学员编号</th><td>{student.student_no ?? '-'}</td><th>学员姓名</th><td>{student.name}</td></tr>
              <tr><th>性别</th><td>{student.gender ?? '-'}</td><th>生日</th><td>{student.birthday?.slice(0, 10) ?? '-'}</td></tr>
              <tr><th>就读学校</th><td>{student.school_name ?? '-'}</td><th>年级</th><td>{student.grade ?? '-'}</td></tr>
              <tr><th>报名日期</th><td>{student.enrollment_date?.slice(0, 10) ?? '-'}</td><th>来源</th><td>{student.source ?? '-'}</td></tr>
              <tr><th>报读校区</th><td>{student.campus_name ?? '-'}</td><th>折扣说明</th><td>{student.discount ?? '-'}</td></tr>
              <tr><th>家庭住址</th><td colSpan={3}>{student.address ?? '-'}</td></tr>
              <tr><th>主要联系方式</th><td colSpan={3}>{student.guardian_phone ?? '-'}</td></tr>
            </tbody></table></div>
          </section>
          <div className="workbench-side">
            <section className="panel"><div className="panel-header"><h2>监护人</h2></div>{detail.guardians.length ? detail.guardians.map((item) => <div key={item.id} className="task-item"><div><b>{item.name}</b> <span className="badge blue">{item.relation ?? '联系人'}</span>{item.is_primary && <span className="badge green" style={{ marginLeft: 4 }}>主要联系人</span>}{item.is_emergency && <span className="badge orange" style={{ marginLeft: 4 }}>紧急联系人</span>}<div className="subtitle">电话：{item.phone ?? '-'}　微信：{item.wechat ?? '-'}</div></div></div>) : <p className="subtitle">暂无监护人信息</p>}</section>
            <section className="panel"><div className="panel-header"><h2>账户概览</h2></div><div className="cards" style={{ gridTemplateColumns: '1fr 1fr', margin: 0 }}><div className="stat-card"><b>{detail.account.balance}</b><span>账户余额</span></div><div className="stat-card"><b>{detail.account.points}</b><span>积分</span></div></div></section>
          </div>
        </div>
      )}

      {tab === 'classes' && (
        <div className="panel"><div className="table-wrap"><table className="table"><thead><tr><th>班级</th><th>课程</th><th>教师</th><th>年级/科目</th><th>状态</th></tr></thead><tbody>{detail.classes.map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.lesson_name ?? '-'}</td><td>{item.teacher_name ?? '待定'}</td><td>{[item.grade, item.subject].filter(Boolean).join(' / ') || '-'}</td><td>{item.status}</td></tr>)}</tbody></table></div></div>
      )}

      {tab === 'scores' && (
        <div className="panel"><div className="table-wrap"><table className="table"><thead><tr><th>考试日期</th><th>项目</th><th>考试</th><th>班级</th><th>成绩</th><th>来源</th><th>备注</th></tr></thead><tbody>{detail.scores.map((item) => <tr key={item.id}><td>{item.exam_date?.slice(0, 10)}</td><td>{item.project_name}</td><td>{item.exam_name}</td><td>{item.class_name ?? '-'}</td><td><b>{item.score ?? '未考'}</b></td><td>{item.source}</td><td>{item.remark ?? '-'}</td></tr>)}</tbody></table></div></div>
      )}


      {tab === 'growth' && (
        <div className="workbench-grid">
          <section className="panel">
            <div className="panel-header"><h2>成长记录</h2></div>
            {detail.growthRecords.length ? detail.growthRecords.map((item) => <div className="task-item" key={item.id}><div className="task-count">{item.type?.slice(0, 1)}</div><div><b>{item.type}</b><p className="subtitle" style={{ margin: '4px 0 0' }}>{item.content}</p></div><span>{String(item.occurred_at).slice(0, 10)}</span></div>) : <p className="subtitle">暂无成长记录</p>}
          </section>
          <form className="panel" onSubmit={addGrowth}>
            <div className="panel-header"><h2>新增记录</h2></div>
            <div className="form-row"><label style={{ width: '100%' }}>类型<select value={growth.type} onChange={(e) => setGrowth({ ...growth, type: e.target.value })}><option>课堂点评</option><option>作业练习</option><option>在校表现</option><option>课外活动</option><option>学期总结</option><option>备注</option></select></label></div>
            <div className="form-row"><label style={{ width: '100%' }}>内容<textarea rows={5} value={growth.content} onChange={(e) => setGrowth({ ...growth, content: e.target.value })} /></label></div>
            <button className="btn primary" type="submit">保存记录</button>
          </form>
        </div>
      )}

      {tab === 'orders' && (
        <div className="panel"><div className="table-wrap"><table className="table"><thead><tr><th>订单号</th><th>类型</th><th>应收</th><th>实收</th><th>欠费</th><th>付款状态</th><th>日期</th></tr></thead><tbody>{detail.orders.map((item) => <tr key={item.id}><td>{item.order_no}</td><td>{item.order_type}</td><td>{item.receivable}</td><td>{item.received}</td><td>{item.arrears}</td><td>{item.payment_status}</td><td>{String(item.created_at).slice(0, 10)}</td></tr>)}</tbody></table></div></div>
      )}

      {tab === 'account' && (
        <div className="cards"><div className="stat-card"><b>{detail.account.balance}</b><span>可用余额</span></div><div className="stat-card"><b>{detail.account.points}</b><span>积分</span></div><div className="stat-card"><b>{detail.orders.length}</b><span>订单数量</span></div></div>
      )}
    </Shell>
  );
}


