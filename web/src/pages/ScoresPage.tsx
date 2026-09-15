import { useEffect, useState, type FormEvent } from 'react';
import { BarChart3, Download, Plus, Search, Save } from 'lucide-react';
import Shell from '../Shell.tsx';
import { api, getToken } from '../api.ts';
import ScoreAnalyticsPanel from '../components/ScoreAnalyticsPanel.tsx';

const TABS = [['entry', '成绩管理'], ['analytics', '成绩分析'], ['ratings', '班级评级'], ['query', '成绩查询'], ['settings', '考试设置']] as const;

interface RosterGroup {
  classId: number;
  className: string;
  students: Array<{ student_id: number; name: string; phone: string | null; status: string }>;
}

export default function ScoresPage() {
  const [tab, setTab] = useState<string>('entry');
  const [classes, setClasses] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);
  const [roster, setRoster] = useState<RosterGroup[]>([]);
  const [entry, setEntry] = useState({ classIds: [] as number[], projectId: '', examId: '', examDate: new Date().toISOString().slice(0, 10), sourceId: '' });
  const [values, setValues] = useState<Record<string, { score: string; remark: string }>>({});
  const [filters, setFilters] = useState({ classId: '', projectId: '', examId: '', start: '', end: '' });
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [dictName, setDictName] = useState('');
  const [message, setMessage] = useState('');
  const [students, setStudents] = useState<any[]>([]);
  const [analyticsStudentId, setAnalyticsStudentId] = useState('');
  const [ratings, setRatings] = useState<any>({ rows: [], summary: { total: 0, s: 0, a: 0, qihang: 0 } });
  const [ratingClassId, setRatingClassId] = useState('');
  const [sources, setSources] = useState<any[]>([]);
  const [sourceForm, setSourceForm] = useState({ parentId: '', name: '' });
  const [settingsTab, setSettingsTab] = useState<'sources' | 'projects' | 'exams'>('sources');

  async function loadDicts() {
    const [projectList, examList, sourceList] = await Promise.all([api<any[]>('/api/scores/projects'), api<any[]>('/api/scores/exams'), api<any[]>('/api/scores/sources')]);
    setProjects(projectList);
    setExams(examList);
    setSources(sourceList);
  }

  useEffect(() => {
    api<any[]>('/api/classes').then(setClasses).catch(() => {});
    api<any[]>('/api/students').then(setStudents).catch(() => {});
    loadDicts().catch(() => {});
  }, []);

  useEffect(() => {
    if (tab !== 'ratings') return;
    const suffix = ratingClassId ? `?classId=${ratingClassId}` : '';
    api<any>(`/api/scores/analytics/class-ratings${suffix}`).then(setRatings).catch((err) => setMessage(err.message));
  }, [tab, ratingClassId]);

  async function loadRoster() {
    if (!entry.classIds.length) { setRoster([]); return; }
    const result = await api<RosterGroup[]>(`/api/scores/roster?classIds=${entry.classIds.join(',')}&includeInactive=0`);
    setRoster(result);
    setValues({});
  }

  function setScore(classId: number, studentId: number, patch: Partial<{ score: string; remark: string }>) {
    const key = `${classId}-${studentId}`;
    setValues((current) => {
      const previous = current[key] ?? { score: '', remark: '' };
      return { ...current, [key]: { ...previous, ...patch } };
    });
  }

  async function submitScores() {
    try {
      let count = 0;
      for (const group of roster) {
        const scores = group.students.map((student) => ({
          studentId: student.student_id,
          score: values[`${group.classId}-${student.student_id}`]?.score ?? '',
          remark: values[`${group.classId}-${student.student_id}`]?.remark ?? ''
        }));
        const result = await api<{ count: number }>('/api/scores/bulk', {
          method: 'POST',
          body: JSON.stringify({ classId: group.classId, projectId: Number(entry.projectId), examId: Number(entry.examId), examDate: entry.examDate, source: 'teacher', sourceId: entry.sourceId ? Number(entry.sourceId) : null, scores })
        });
        count += result.count;
      }
      setMessage(`已保存 ${count} 条成绩`);
    } catch (err: any) {
      setMessage(err.message);
    }
  }

  async function search(e: FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (filters.classId) params.set('classId', filters.classId);
    if (filters.projectId) params.set('projectId', filters.projectId);
    if (filters.examId) params.set('examId', filters.examId);
    if (filters.start) params.set('start', filters.start);
    if (filters.end) params.set('end', filters.end);
    params.set('limit', '100');
    const data = await api<{ rows: any[]; total: number }>(`/api/scores?${params.toString()}`);
    setRows(data.rows);
    setTotal(data.total);
  }

  async function exportCsv() {
    const params = new URLSearchParams();
    if (filters.classId) params.set('classId', filters.classId);
    if (filters.projectId) params.set('projectId', filters.projectId);
    if (filters.examId) params.set('examId', filters.examId);
    const res = await fetch(`/api/scores/export?${params.toString()}`, { headers: { Authorization: `Bearer ${getToken() ?? ''}` } });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'scores.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function createDict(e: FormEvent) {
    e.preventDefault();
    const path = settingsTab === 'projects' ? '/api/scores/projects' : '/api/scores/exams';
    await api(path, { method: 'POST', body: JSON.stringify({ name: dictName }) });
    setDictName('');
    setMessage('已新增');
    await loadDicts();
  }

  async function createSource(e: FormEvent) {
    e.preventDefault();
    try {
      await api('/api/scores/sources', { method: 'POST', body: JSON.stringify({ parentId: Number(sourceForm.parentId), name: sourceForm.name }) });
      setSourceForm({ parentId: '', name: '' });
      setMessage('成绩来源已新增');
      await loadDicts();
    } catch (err: any) { setMessage(err.message); }
  }

  async function toggleSource(item: any) {
    try {
      await api(`/api/scores/sources/${item.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: !item.enabled }) });
      await loadDicts();
    } catch (err: any) { setMessage(err.message); }
  }

  async function deleteSource(item: any) {
    try {
      await api(`/api/scores/sources/${item.id}`, { method: 'DELETE' });
      setMessage('成绩来源已删除');
      await loadDicts();
    } catch (err: any) { setMessage(err.message); }
  }


  return (
    <Shell>
      <div className="panel-header"><div><h1 className="page-title">成绩</h1><p className="page-subtitle">按项目、考试和班级批量录入，支持查询与导出。</p></div></div>
      <div className="tabs">{TABS.map(([key, label]) => <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label}</button>)}</div>
      {message && <div className="summary-strip"><span>{message}</span></div>}

      {tab === 'entry' && (
        <div className="panel">
          <div className="form-row">
            <label>成绩来源<select value={entry.sourceId} onChange={(e) => setEntry({ ...entry, sourceId: e.target.value })}><option value="">选择来源</option>{sources.map((root) => <optgroup key={root.id} label={root.name}>{root.children.filter((child: any) => child.enabled).map((child: any) => <option key={child.id} value={child.id}>{child.name}</option>)}</optgroup>)}</select></label>
            <label>项目<select value={entry.projectId} onChange={(e) => setEntry({ ...entry, projectId: e.target.value })}><option value="">选择项目</option>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label>考试日期<input type="date" value={entry.examDate} onChange={(e) => setEntry({ ...entry, examDate: e.target.value })} /></label>
            <label>考试<select value={entry.examId} onChange={(e) => setEntry({ ...entry, examId: e.target.value })}><option value="">选择考试</option>{exams.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          </div>
          <div className="panel" style={{ background: '#f8fafc' }}>
            <div className="panel-header"><h2>选择班级</h2><button className="btn primary icon-text" onClick={loadRoster}><Search size={15} />加载学员</button></div>
            <div className="toolbar">{classes.map((item) => <label key={item.id} className="btn"><input type="checkbox" checked={entry.classIds.includes(item.id)} onChange={(e) => setEntry({ ...entry, classIds: e.target.checked ? [...entry.classIds, item.id] : entry.classIds.filter((id) => id !== item.id) })} /> {item.name}</label>)}</div>
          </div>

          {roster.map((group) => (
            <div className="panel" key={group.classId}>
              <div className="panel-header"><h2>{group.className}</h2><span className="subtitle">{group.students.length} 名在读学员</span></div>
              <div className="table-wrap"><table className="table"><thead><tr><th>学员姓名</th><th>联系方式</th><th>成绩</th><th>备注</th></tr></thead><tbody>
                {group.students.map((student) => {
                  const key = `${group.classId}-${student.student_id}`;
                  return <tr key={student.student_id}><td>{student.name}</td><td>{student.phone ?? '-'}</td><td><input style={{ width: 100 }} value={values[key]?.score ?? ''} onChange={(e) => setScore(group.classId, student.student_id, { score: e.target.value })} placeholder="缺考留空" /></td><td><input style={{ width: '100%' }} value={values[key]?.remark ?? ''} onChange={(e) => setScore(group.classId, student.student_id, { remark: e.target.value })} placeholder="最多150字" /></td></tr>;
                })}
              </tbody></table></div>
            </div>
          ))}
          {roster.length > 0 && <button className="btn primary icon-text" onClick={submitScores}><Save size={15} />保存成绩</button>}
        </div>
      )}

      {tab === 'query' && (
        <div className="panel">
          <form className="form-row" onSubmit={search}>
            <label>班级<select value={filters.classId} onChange={(e) => setFilters({ ...filters, classId: e.target.value })}><option value="">全部班级</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label>项目<select value={filters.projectId} onChange={(e) => setFilters({ ...filters, projectId: e.target.value })}><option value="">全部项目</option>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label>考试<select value={filters.examId} onChange={(e) => setFilters({ ...filters, examId: e.target.value })}><option value="">全部考试</option>{exams.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label>开始日期<input type="date" value={filters.start} onChange={(e) => setFilters({ ...filters, start: e.target.value })} /></label>
            <label>结束日期<input type="date" value={filters.end} onChange={(e) => setFilters({ ...filters, end: e.target.value })} /></label>
            <button className="btn primary icon-text" type="submit"><Search size={15} />查询</button>
            <button className="btn icon-text" type="button" onClick={exportCsv}><Download size={15} />导出</button>
          </form>
          <div className="summary-strip"><span>当前结果 <b>{total}</b> 条</span></div>
          <div className="table-wrap"><table className="table"><thead><tr><th>学员</th><th>项目</th><th>考试</th><th>班级</th><th>成绩</th><th>考试日期</th><th>来源</th><th>备注</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.student_name}</td><td>{row.project_name}</td><td>{row.exam_name}</td><td>{row.class_name ?? '-'}</td><td><b>{row.score ?? '未考'}</b></td><td>{String(row.exam_date).slice(0, 10)}</td><td>{row.source_path ?? row.source}</td><td>{row.remark ?? '-'}</td></tr>)}</tbody></table></div>
        </div>
      )}

      {tab === 'analytics' && (
        <div className="panel">
          <div className="panel-header"><h2>学员成绩分析</h2><select className="btn" value={analyticsStudentId} onChange={(e) => setAnalyticsStudentId(e.target.value)}><option value="">选择学员</option>{students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}</select></div>
          {analyticsStudentId ? <ScoreAnalyticsPanel studentId={Number(analyticsStudentId)} /> : <p className="subtitle">选择学员后查看成长趋势、班级排名和同年级机构排名。</p>}
        </div>
      )}

      {tab === 'ratings' && (
        <div className="panel">
          <div className="panel-header"><h2>班级考试评级</h2><select className="btn" value={ratingClassId} onChange={(e) => setRatingClassId(e.target.value)}><option value="">全部班级</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
          <div className="cards"><div className="stat-card"><b>{ratings.summary.s}</b><span>S班次数</span></div><div className="stat-card"><b>{ratings.summary.a}</b><span>A+班次数</span></div><div className="stat-card"><b>{ratings.summary.qihang}</b><span>启航班次数</span></div></div>
          <div className="table-wrap"><table className="table"><thead><tr><th>考试日期</th><th>班级</th><th>项目/考试</th><th>平均分</th><th>评级</th><th>最高分</th><th>最低分</th><th>参考人数</th><th>任课教师</th></tr></thead><tbody>{ratings.rows.map((row: any) => <tr key={`${row.class_id}-${row.project_id}-${row.exam_id}-${row.exam_date}`}><td>{String(row.exam_date).slice(0, 10)}</td><td><b>{row.class_name}</b><div className="subtitle">{row.grade}</div></td><td>{row.project_name}<div className="subtitle">{row.exam_name}</div></td><td><b>{Number(row.average_score).toFixed(2)}</b></td><td><span className={`badge ${row.rating === 'S班' ? 'green' : row.rating === 'A+班' ? 'blue' : 'orange'}`}>{row.rating}</span></td><td>{row.max_score}</td><td>{row.min_score}</td><td>{row.participant_count}</td><td>{row.teacher_name ?? '-'}</td></tr>)}{ratings.rows.length === 0 && <tr><td colSpan={9}><div className="empty-state"><BarChart3 size={28} /><p>暂无可评级的成绩数据</p></div></td></tr>}</tbody></table></div>
        </div>
      )}

      {tab === 'settings' && <div className="tabs sub-tabs"><button className={settingsTab === 'sources' ? 'active' : ''} onClick={() => setSettingsTab('sources')}>成绩来源</button><button className={settingsTab === 'projects' ? 'active' : ''} onClick={() => setSettingsTab('projects')}>考试项目</button><button className={settingsTab === 'exams' ? 'active' : ''} onClick={() => setSettingsTab('exams')}>考试名称</button></div>}

      {tab === 'settings' && settingsTab === 'sources' && (
        <div className="workbench-grid">
          <section className="panel">
            <div className="panel-header"><h2>成绩来源设置</h2><span className="subtitle">机构内 / 学校内 / 其他第三方</span></div>
            <div className="table-wrap"><table className="table"><thead><tr><th>一级来源</th><th>考试来源</th><th>状态</th><th>操作</th></tr></thead><tbody>{sources.flatMap((root) => root.children.map((child: any) => <tr key={child.id}><td>{root.name}</td><td>{child.name}</td><td><span className={child.enabled ? 'badge green' : 'badge orange'}>{child.enabled ? '启用' : '停用'}</span></td><td><button className="btn" onClick={() => toggleSource(child)}>{child.enabled ? '停用' : '启用'}</button><button className="btn danger" style={{ marginLeft: 6 }} onClick={() => deleteSource(child)}>删除</button></td></tr>))}{sources.length === 0 && <tr><td colSpan={4}>暂无来源</td></tr>}</tbody></table></div>
          </section>
          <form className="panel" onSubmit={createSource}>
            <div className="panel-header"><h2>新增考试来源</h2></div>
            <div className="form-row"><label style={{ width: '100%' }}>一级来源<select required value={sourceForm.parentId} onChange={(e) => setSourceForm({ ...sourceForm, parentId: e.target.value })}><option value="">选择一级来源</option>{sources.map((root) => <option key={root.id} value={root.id}>{root.name}</option>)}</select></label></div>
            <div className="form-row"><label style={{ width: '100%' }}>来源名称<input required value={sourceForm.name} onChange={(e) => setSourceForm({ ...sourceForm, name: e.target.value })} placeholder="例如：周测" /></label></div>
            <button className="btn primary icon-text" type="submit"><Plus size={15} />新增来源</button>
          </form>
        </div>
      )}


      {tab === 'settings' && (settingsTab === 'projects' || settingsTab === 'exams') && (
        <div className="workbench-grid">
          <section className="panel">
            <div className="panel-header"><h2>{settingsTab === 'projects' ? '考试项目' : '考试名称'}</h2></div>
            <div className="table-wrap"><table className="table"><thead><tr><th>{settingsTab === 'projects' ? '项目' : '考试'}</th><th>排序</th><th>状态</th></tr></thead><tbody>
              {(settingsTab === 'projects' ? projects : exams).map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.sort ?? 0}</td><td><span className={item.enabled === false ? 'badge orange' : 'badge green'}>{item.enabled === false ? '停用' : '启用'}</span></td></tr>)}
            </tbody></table></div>
          </section>
          <form className="panel" onSubmit={createDict}>
            <div className="panel-header"><h2>新增{settingsTab === 'projects' ? '项目' : '考试'}</h2></div>
            <div className="form-row"><label style={{ width: '100%' }}>名称<input required value={dictName} onChange={(e) => setDictName(e.target.value)} /></label></div>
            <button className="btn primary icon-text" type="submit"><Plus size={15} />新增</button>
          </form>
        </div>
      )}
    </Shell>
  );
}

