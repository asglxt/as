import { useEffect, useState, type FormEvent } from 'react';
import { Download, Plus, Search, Save } from 'lucide-react';
import Shell from '../Shell.tsx';
import { api, getToken } from '../api.ts';

const TABS = [['entry', '成绩管理'], ['query', '成绩查询'], ['projects', '项目设置'], ['exams', '考试设置']] as const;
const SOURCES = [['teacher', '机构内'], ['registration', '报名成绩'], ['import', '导入']] as const;

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
  const [entry, setEntry] = useState({ classIds: [] as number[], projectId: '', examId: '', examDate: new Date().toISOString().slice(0, 10), source: 'teacher' });
  const [values, setValues] = useState<Record<string, { score: string; remark: string }>>({});
  const [filters, setFilters] = useState({ classId: '', projectId: '', examId: '', start: '', end: '' });
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [dictName, setDictName] = useState('');
  const [message, setMessage] = useState('');

  async function loadDicts() {
    const [projectList, examList] = await Promise.all([api<any[]>('/api/scores/projects'), api<any[]>('/api/scores/exams')]);
    setProjects(projectList);
    setExams(examList);
  }

  useEffect(() => {
    api<any[]>('/api/classes').then(setClasses).catch(() => {});
    loadDicts().catch(() => {});
  }, []);

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
          body: JSON.stringify({ classId: group.classId, projectId: Number(entry.projectId), examId: Number(entry.examId), examDate: entry.examDate, source: entry.source, scores })
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
    const path = tab === 'projects' ? '/api/scores/projects' : '/api/scores/exams';
    await api(path, { method: 'POST', body: JSON.stringify({ name: dictName }) });
    setDictName('');
    setMessage('已新增');
    await loadDicts();
  }


  return (
    <Shell>
      <div className="panel-header"><div><h1 className="page-title">成绩</h1><p className="page-subtitle">按项目、考试和班级批量录入，支持查询与导出。</p></div></div>
      <div className="tabs">{TABS.map(([key, label]) => <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label}</button>)}</div>
      {message && <div className="summary-strip"><span>{message}</span></div>}

      {tab === 'entry' && (
        <div className="panel">
          <div className="form-row">
            <label>来源<select value={entry.source} onChange={(e) => setEntry({ ...entry, source: e.target.value })}>{SOURCES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
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
          <div className="table-wrap"><table className="table"><thead><tr><th>学员</th><th>项目</th><th>考试</th><th>班级</th><th>成绩</th><th>考试日期</th><th>来源</th><th>备注</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.student_name}</td><td>{row.project_name}</td><td>{row.exam_name}</td><td>{row.class_name ?? '-'}</td><td><b>{row.score ?? '未考'}</b></td><td>{String(row.exam_date).slice(0, 10)}</td><td>{row.source}</td><td>{row.remark ?? '-'}</td></tr>)}</tbody></table></div>
        </div>
      )}


      {(tab === 'projects' || tab === 'exams') && (
        <div className="workbench-grid">
          <section className="panel">
            <div className="panel-header"><h2>{tab === 'projects' ? '项目设置' : '考试设置'}</h2></div>
            <div className="table-wrap"><table className="table"><thead><tr><th>{tab === 'projects' ? '项目' : '考试'}</th><th>排序</th><th>状态</th></tr></thead><tbody>
              {(tab === 'projects' ? projects : exams).map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.sort ?? 0}</td><td><span className={item.enabled === false ? 'badge orange' : 'badge green'}>{item.enabled === false ? '停用' : '启用'}</span></td></tr>)}
            </tbody></table></div>
          </section>
          <form className="panel" onSubmit={createDict}>
            <div className="panel-header"><h2>新增{tab === 'projects' ? '项目' : '考试'}</h2></div>
            <div className="form-row"><label style={{ width: '100%' }}>名称<input required value={dictName} onChange={(e) => setDictName(e.target.value)} /></label></div>
            <button className="btn primary icon-text" type="submit"><Plus size={15} />新增</button>
          </form>
        </div>
      )}
    </Shell>
  );
}

