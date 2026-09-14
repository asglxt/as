import { useEffect, useState, type FormEvent } from 'react';
import Shell from '../Shell.tsx';
import { api, getToken } from '../api.ts';

const TABS = [
  ['entry', '成绩录入'], ['query', '成绩查询'], ['projects', '项目设置'], ['exams', '考试设置']
] as const;

const SOURCES = [['teacher', '教师录入'], ['import', '导入'], ['registration', '报名成绩']] as const;

export default function ScoresPage() {
  const [tab, setTab] = useState<string>('entry');
  const [classes, setClasses] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);
  const [roster, setRoster] = useState<any[]>([]);
  const [entry, setEntry] = useState({
    classId: '', projectId: '', examId: '', examDate: new Date().toISOString().slice(0, 10), source: 'teacher'
  });
  const [values, setValues] = useState<Record<number, { score: string; remark: string }>>({});
  const [filters, setFilters] = useState({ classId: '', projectId: '', examId: '', start: '', end: '' });
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [dictForm, setDictForm] = useState({ name: '', sort: '' });
  const [message, setMessage] = useState('');

  async function loadDicts() {
    setProjects(await api<any[]>('/api/scores/projects'));
    setExams(await api<any[]>('/api/scores/exams'));
  }

  useEffect(() => {
    api<any[]>('/api/classes').then(setClasses).catch(() => {});
    loadDicts().catch(() => {});
  }, []);

  async function loadRoster(classId: string) {
    if (!classId) {
      setRoster([]);
      return;
    }
    const list = await api<any[]>(`/api/classes/${classId}/students`);
    setRoster(list);
    setValues({});
  }

  async function submitScores(e: FormEvent) {
    e.preventDefault();
    try {
      const payload = {
        classId: Number(entry.classId),
        projectId: Number(entry.projectId),
        examId: Number(entry.examId),
        examDate: entry.examDate,
        source: entry.source,
        scores: roster.map((r) => ({
          studentId: r.student_id,
          score: values[r.student_id]?.score ?? '',
          remark: values[r.student_id]?.remark ?? ''
        }))
      };
      const res = await api<{ count: number }>('/api/scores/bulk', { method: 'POST', body: JSON.stringify(payload) });
      setMessage(`已保存 ${res.count} 条成绩`);
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
    const res = await fetch(`/api/scores/export?${params.toString()}`, {
      headers: { Authorization: `Bearer ${getToken() ?? ''}` }
    });
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
    try {
      await api(path, {
        method: 'POST',
        body: JSON.stringify({ name: dictForm.name, sort: dictForm.sort ? Number(dictForm.sort) : 0 })
      });
      setDictForm({ name: '', sort: '' });
      setMessage('已新增');
      await loadDicts();
    } catch (err: any) {
      setMessage(err.message);
    }
  }

  return (
    <Shell>
      <h1 className="page-title">成绩</h1>
      <div className="form-row">
        {TABS.map(([key, label]) => (
          <button key={key} className={tab === key ? 'btn primary' : 'btn'} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>
      {message && <p className="subtitle">{message}</p>}

      {tab === 'entry' && (
        <>
          <form className="form-row" onSubmit={submitScores}>
            <label>班级<select value={entry.classId} onChange={(e) => { setEntry({ ...entry, classId: e.target.value }); loadRoster(e.target.value); }}>
              <option value="">选择班级</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></label>
            <label>项目<select value={entry.projectId} onChange={(e) => setEntry({ ...entry, projectId: e.target.value })}>
              <option value="">选择项目</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select></label>
            <label>考试<select value={entry.examId} onChange={(e) => setEntry({ ...entry, examId: e.target.value })}>
              <option value="">选择考试</option>
              {exams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select></label>
            <label>考试日期<input type="date" value={entry.examDate} onChange={(e) => setEntry({ ...entry, examDate: e.target.value })} /></label>
            <label>来源<select value={entry.source} onChange={(e) => setEntry({ ...entry, source: e.target.value })}>
              {SOURCES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select></label>
            <button className="btn primary" type="submit" disabled={!roster.length}>保存成绩</button>
          </form>
          <div className="panel">
            <table className="table">
              <thead><tr><th>学员</th><th>成绩</th><th>备注</th></tr></thead>
              <tbody>
                {roster.map((r) => (
                  <tr key={r.student_id}>
                    <td>{r.student_name}</td>
                    <td><input value={values[r.student_id]?.score ?? ''} onChange={(e) => setValues({ ...values, [r.student_id]: { score: e.target.value, remark: values[r.student_id]?.remark ?? '' } })} /></td>
                    <td><input value={values[r.student_id]?.remark ?? ''} onChange={(e) => setValues({ ...values, [r.student_id]: { score: values[r.student_id]?.score ?? '', remark: e.target.value } })} /></td>
                  </tr>
                ))}
                {roster.length === 0 && <tr><td colSpan={3}>请先选择班级</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'query' && (
        <>
          <form className="form-row" onSubmit={search}>
            <label>班级<select value={filters.classId} onChange={(e) => setFilters({ ...filters, classId: e.target.value })}>
              <option value="">全部班级</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></label>
            <label>项目<select value={filters.projectId} onChange={(e) => setFilters({ ...filters, projectId: e.target.value })}>
              <option value="">全部项目</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select></label>
            <label>考试<select value={filters.examId} onChange={(e) => setFilters({ ...filters, examId: e.target.value })}>
              <option value="">全部考试</option>
              {exams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select></label>
            <label>开始日期<input type="date" value={filters.start} onChange={(e) => setFilters({ ...filters, start: e.target.value })} /></label>
            <label>结束日期<input type="date" value={filters.end} onChange={(e) => setFilters({ ...filters, end: e.target.value })} /></label>
            <button className="btn primary" type="submit">查询</button>
            <button className="btn" type="button" onClick={exportCsv}>导出 CSV</button>
          </form>
          <div className="panel">
            <p className="subtitle">共 {total} 条</p>
            <table className="table">
              <thead><tr><th>学员</th><th>项目</th><th>考试</th><th>成绩</th><th>来源</th><th>考试日期</th><th>班级</th><th>备注</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.student_name}</td><td>{r.project_name}</td><td>{r.exam_name}</td>
                    <td>{r.score ?? '-'}</td><td>{r.source}</td>
                    <td>{String(r.exam_date).slice(0, 10)}</td><td>{r.class_name ?? '-'}</td><td>{r.remark ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {(tab === 'projects' || tab === 'exams') && (
        <>
          <form className="form-row" onSubmit={createDict}>
            <label>名称<input value={dictForm.name} onChange={(e) => setDictForm({ ...dictForm, name: e.target.value })} /></label>
            <label>排序<input value={dictForm.sort} onChange={(e) => setDictForm({ ...dictForm, sort: e.target.value })} /></label>
            <button className="btn primary" type="submit">新增</button>
          </form>
          <div className="panel">
            <table className="table">
              <thead><tr><th>名称</th><th>排序</th><th>启用</th></tr></thead>
              <tbody>
                {(tab === 'projects' ? projects : exams).map((item) => (
                  <tr key={item.id}><td>{item.name}</td><td>{item.sort}</td><td>{item.enabled ? '是' : '否'}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Shell>
  );
}