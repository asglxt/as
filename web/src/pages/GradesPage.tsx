import { useEffect, useState, type FormEvent } from 'react';
import Shell from '../Shell.tsx';
import { api } from '../api.ts';

export default function GradesPage() {
  const [classes, setClasses] = useState<any[]>([]);
  const [classId, setClassId] = useState('');
  const [exams, setExams] = useState<any[]>([]);
  const [selectedExam, setSelectedExam] = useState('');
  const [students, setStudents] = useState<any[]>([]);
  const [scores, setScores] = useState<Record<number, string>>({});

  useEffect(() => {
    api<any[]>('/api/classes').then(setClasses);
  }, []);

  async function loadExams(cid: string) {
    if (!cid) return;
    setExams(await api<any[]>(`/api/exams?classId=${cid}`));
    setStudents(await api<any[]>('/api/students'));
  }

  async function createExam(e: FormEvent) {
    e.preventDefault();
    const form = new FormData(e.target as HTMLFormElement);
    await api('/api/exams', {
      method: 'POST',
      body: JSON.stringify({
        classId: Number(classId),
        name: form.get('name'),
        type: form.get('type'),
        examDate: form.get('examDate')
      })
    });
    await loadExams(classId);
  }

  async function saveScores() {
    const payload = Object.entries(scores).map(([studentId, value]) => ({
      studentId: Number(studentId),
      numericScore: value === '' ? null : Number(value)
    }));
    await api(`/api/exams/${selectedExam}/scores/bulk`, { method: 'POST', body: JSON.stringify({ scores: payload }) });
    setScores({});
  }

  async function exportCsv() {
    if (!selectedExam) return;
    const res = await fetch(`/api/exams/${selectedExam}/export`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token') ?? ''}` }
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'scores.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Shell>
      <h1 className="page-title">成绩</h1>
      <div className="form-row">
        <label>班级<select value={classId} onChange={(e) => { setClassId(e.target.value); loadExams(e.target.value); }}>
          <option value="">选择班级</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></label>
        <label>考试<select value={selectedExam} onChange={(e) => setSelectedExam(e.target.value)}>
          <option value="">选择考试</option>
          {exams.map((ex) => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
        </select></label>
      </div>
      <form className="form-row" onSubmit={createExam}>
        <label>考试名称<input name="name" required /></label>
        <label>类型<select name="type"><option value="unit">单元测</option><option value="midterm">期中</option><option value="final">期末</option><option value="level">等级考</option></select></label>
        <label>日期<input name="examDate" type="date" required /></label>
        <button className="btn primary" type="submit">新建考试</button>
      </form>
      <div className="panel">
        <table className="table">
          <thead><tr><th>学员</th><th>分数</th></tr></thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td><input type="number" value={scores[s.id] ?? ''} onChange={(e) => setScores({ ...scores, [s.id]: e.target.value })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn primary" onClick={saveScores} disabled={!selectedExam}>保存成绩</button>
        <button className="btn" onClick={exportCsv} disabled={!selectedExam}>导出 CSV</button>
      </div>
    </Shell>
  );
}
