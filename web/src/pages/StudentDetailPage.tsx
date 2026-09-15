import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Shell from '../Shell.tsx';
import { api } from '../api.ts';
import ScoreAnalyticsPanel from '../components/ScoreAnalyticsPanel.tsx';

interface StudentDetail {
  student: any;
  guardians: any[];
  classes: any[];
  attendanceRecords: any[];
  scores: any[];
  growthRecords: any[];
  orders: any[];
  account: { balance: number; points: number; updatedAt: string | null };
  auditLogs: any[];
}

const TABS = [
  ['overview', '基础信息'], ['classes', '报读课程'], ['attendance', '上课记录'], ['scores', '成绩'], ['analytics', '成绩分析'],
  ['growth', '成长记录'], ['orders', '订单'], ['account', '学员账户'], ['logs', '操作日志']
] as const;

const STATUS_LABELS: Record<string, string> = { active: '在读', inactive: '停课', graduated: '结课' };
const ATTENDANCE_LABELS: Record<string, string> = { present: '出勤', absent: '缺勤', leave: '请假', makeup: '补课' };
const AUDIT_LABELS: Record<string, string> = {
  'student.create': '创建学员', 'student.update': '修改资料', 'student.batch_update': '批量调整',
  'student.class.add': '添加课程', 'student.transfer': '办理转班', 'student.growth.create': '新增成长记录'
};
const AUDIT_FIELD_LABELS: Record<string, string> = {
  name: '姓名', status: '状态', campusId: '校区', advisorId: '课程顾问', classId: '班级',
  fromClassId: '原班级', toClassId: '新班级', type: '类型'
};

function editFormFromStudent(student: any) {
  return {
    name: student.name ?? '', studentNo: student.student_no ?? '', gender: student.gender ?? '',
    birthday: student.birthday?.slice(0, 10) ?? '', enrollmentDate: student.enrollment_date?.slice(0, 10) ?? '',
    source: student.source ?? '', discount: student.discount ?? '', schoolName: student.school_name ?? '',
    grade: student.grade ?? '', address: student.address ?? '', advisorId: student.advisor_id ? String(student.advisor_id) : '',
    notes: student.notes ?? ''
  };
}

export default function StudentDetailPage() {
  const { id } = useParams();
  const [detail, setDetail] = useState<StudentDetail | null>(null);
  const [tab, setTab] = useState<string>('overview');
  const [growth, setGrowth] = useState({ type: '课堂点评', content: '' });
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>(null);
  const [classes, setClasses] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [transfer, setTransfer] = useState({ fromClassId: '', toClassId: '' });
  const [message, setMessage] = useState('');

  async function load() {
    const result = await api<StudentDetail>(`/api/students/${id}`);
    setDetail(result);
    setEditForm(editFormFromStudent(result.student));
  }

  useEffect(() => {
    load().catch((err) => setMessage(err.message));
    api<any[]>('/api/classes').then(setClasses).catch(() => {});
    api<any[]>('/api/roles/staff').then(setStaff).catch(() => {});
  }, [id]);

  async function addGrowth(e: FormEvent) {
    e.preventDefault();
    if (!growth.content.trim()) return;
    await api(`/api/students/${id}/growth`, { method: 'POST', body: JSON.stringify(growth) });
    setGrowth({ type: '课堂点评', content: '' });
    setMessage('成长记录已保存');
    await load();
  }

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    try {
      await api(`/api/students/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...editForm,
          advisorId: editForm.advisorId ? Number(editForm.advisorId) : null
        })
      });
      setEditing(false);
      setMessage('学员资料已保存');
      await load();
    } catch (err: any) {
      setMessage(err.message);
    }
  }

  async function transferClass(e: FormEvent) {
    e.preventDefault();
    if (!transfer.fromClassId || !transfer.toClassId) return;
    try {
      await api(`/api/students/${id}/transfer`, {
        method: 'POST',
        body: JSON.stringify({ fromClassId: Number(transfer.fromClassId), toClassId: Number(transfer.toClassId) })
      });
      setTransfer({ fromClassId: '', toClassId: '' });
      setMessage('转班已办理');
      await load();
    } catch (err: any) {
      setMessage(err.message);
    }
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
        <div className="toolbar" style={{ margin: 0 }}>
          <span className={`badge ${student.status === 'active' ? 'green' : 'orange'}`}>{STATUS_LABELS[student.status] ?? student.status}</span>
          {!editing ? <button className="btn" type="button" onClick={() => setEditing(true)}>编辑资料</button> : <button className="btn" type="button" onClick={() => { setEditing(false); setEditForm(editFormFromStudent(student)); }}>取消编辑</button>}
        </div>
      </div>

      {message && <div className="summary-strip"><span>{message}</span></div>}


      <div className="tabs">{TABS.map(([key, label]) => <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label}</button>)}</div>

      {tab === 'overview' && editing && editForm && (
        <form className="panel" onSubmit={saveProfile}>
          <div className="panel-header"><h2>编辑学员资料</h2></div>
          <div className="form-row">
            <label>学员姓名<input required value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></label>
            <label>学员编号<input value={editForm.studentNo} onChange={(e) => setEditForm({ ...editForm, studentNo: e.target.value })} /></label>
            <label>性别<select value={editForm.gender} onChange={(e) => setEditForm({ ...editForm, gender: e.target.value })}><option value="">未设置</option><option value="男">男</option><option value="女">女</option></select></label>
            <label>生日<input type="date" value={editForm.birthday} onChange={(e) => setEditForm({ ...editForm, birthday: e.target.value })} /></label>
            <label>报名日期<input type="date" value={editForm.enrollmentDate} onChange={(e) => setEditForm({ ...editForm, enrollmentDate: e.target.value })} /></label>
          </div>
          <div className="form-row">
            <label>就读学校<input value={editForm.schoolName} onChange={(e) => setEditForm({ ...editForm, schoolName: e.target.value })} /></label>
            <label>年级<input value={editForm.grade} onChange={(e) => setEditForm({ ...editForm, grade: e.target.value })} /></label>
            <label>来源<input value={editForm.source} onChange={(e) => setEditForm({ ...editForm, source: e.target.value })} /></label>
            <label>课程顾问<select value={editForm.advisorId} onChange={(e) => setEditForm({ ...editForm, advisorId: e.target.value })}><option value="">未指定</option>{staff.map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}</select></label>
            <label>折扣说明<input value={editForm.discount} onChange={(e) => setEditForm({ ...editForm, discount: e.target.value })} /></label>
          </div>
          <div className="form-row"><label style={{ flex: 1 }}>家庭住址<input value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} /></label></div>
          <div className="form-row"><label style={{ flex: 1 }}>备注<textarea rows={3} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} /></label></div>
          <button className="btn primary" type="submit">保存资料</button>
        </form>
      )}

      {tab === 'overview' && !editing && (
        <div className="workbench-grid">
          <section className="panel">
            <div className="panel-header"><h2>学员资料</h2></div>
            <div className="table-wrap"><table className="table"><tbody>
              <tr><th>学员编号</th><td>{student.student_no ?? '-'}</td><th>学员姓名</th><td>{student.name}</td></tr>
              <tr><th>性别</th><td>{student.gender ?? '-'}</td><th>生日</th><td>{student.birthday?.slice(0, 10) ?? '-'}</td></tr>
              <tr><th>就读学校</th><td>{student.school_name ?? '-'}</td><th>年级</th><td>{student.grade ?? '-'}</td></tr>
              <tr><th>报名日期</th><td>{student.enrollment_date?.slice(0, 10) ?? '-'}</td><th>课程顾问</th><td>{student.advisor_name ?? '未指定'}</td></tr>
              <tr><th>来源</th><td>{student.source ?? '-'}</td><th>报读校区</th><td>{student.campus_name ?? '-'}</td></tr>
              <tr><th>折扣说明</th><td colSpan={3}>{student.discount ?? '-'}</td></tr>
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
        <div>
          <form className="panel" onSubmit={transferClass}>
            <div className="panel-header"><h2>办理转班</h2><span className="subtitle">学员从原班级转入新班级后会保留历史记录。</span></div>
            <div className="form-row">
              <label>原班级<select required value={transfer.fromClassId} onChange={(e) => setTransfer({ ...transfer, fromClassId: e.target.value })}><option value="">选择原班级</option>{detail.classes.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.subject}</option>)}</select></label>
              <label>新班级<select required value={transfer.toClassId} onChange={(e) => setTransfer({ ...transfer, toClassId: e.target.value })}><option value="">选择新班级</option>{classes.filter((item) => String(item.id) !== transfer.fromClassId).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.subject}</option>)}</select></label>
              <button className="btn primary" type="submit">确认转班</button>
            </div>
          </form>
          <div className="panel"><div className="table-wrap"><table className="table"><thead><tr><th>班级</th><th>课程</th><th>教师</th><th>年级/科目</th><th>状态</th></tr></thead><tbody>{detail.classes.map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.lesson_name ?? '-'}</td><td>{item.teacher_name ?? '待定'}</td><td>{[item.grade, item.subject].filter(Boolean).join(' / ') || '-'}</td><td>{item.status}</td></tr>)}</tbody></table></div></div>
        </div>
      )}

      {tab === 'attendance' && (
        <div className="panel"><div className="table-wrap"><table className="table"><thead><tr><th>上课日期</th><th>班级</th><th>课程</th><th>教师</th><th>考勤</th><th>划扣课时</th><th>备注</th></tr></thead><tbody>{detail.attendanceRecords.map((item) => <tr key={item.id}><td>{item.schedule_date ?? String(item.created_at).slice(0, 10)}</td><td>{item.class_name}</td><td>{item.lesson_name ?? '-'}</td><td>{item.teacher_name ?? '-'}</td><td><span className={`badge ${item.status === 'present' ? 'green' : item.status === 'absent' ? 'red' : 'orange'}`}>{ATTENDANCE_LABELS[item.status] ?? item.status}</span></td><td>{item.hours_deducted}</td><td>{item.remark ?? '-'}</td></tr>)}{detail.attendanceRecords.length === 0 && <tr><td colSpan={7}><p className="subtitle">暂无上课记录</p></td></tr>}</tbody></table></div></div>
      )}

      {tab === 'scores' && (
        <div className="panel"><div className="table-wrap"><table className="table"><thead><tr><th>考试日期</th><th>项目</th><th>考试</th><th>班级</th><th>成绩</th><th>来源</th><th>备注</th></tr></thead><tbody>{detail.scores.map((item) => <tr key={item.id}><td>{item.exam_date?.slice(0, 10)}</td><td>{item.project_name}</td><td>{item.exam_name}</td><td>{item.class_name ?? '-'}</td><td><b>{item.score ?? '未考'}</b></td><td>{item.source_path ?? item.source}</td><td>{item.remark ?? '-'}</td></tr>)}</tbody></table></div></div>
      )}

      {tab === 'analytics' && <ScoreAnalyticsPanel studentId={Number(id)} />}


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

      {tab === 'logs' && (
        <div className="panel"><div className="table-wrap"><table className="table"><thead><tr><th>时间</th><th>操作</th><th>操作人</th><th>详情</th></tr></thead><tbody>{detail.auditLogs.map((item) => <tr key={item.id}><td>{String(item.created_at).replace('T', ' ').slice(0, 16)}</td><td>{AUDIT_LABELS[item.action] ?? item.action}</td><td>{item.actor_name ?? '系统'}</td><td>{Object.entries(item.detail ?? {}).map(([key, value]) => `${AUDIT_FIELD_LABELS[key] ?? key}: ${value}`).join(' · ') || '-'}</td></tr>)}{detail.auditLogs.length === 0 && <tr><td colSpan={4}><p className="subtitle">暂无操作日志</p></td></tr>}</tbody></table></div></div>
      )}
    </Shell>
  );
}


