import { useEffect, useState, type FormEvent } from 'react';
import Shell from '../Shell.tsx';
import { api } from '../api.ts';

export default function ClassesPage() {
  const [classes, setClasses] = useState<any[]>([]);
  const [campuses, setCampuses] = useState<any[]>([]);
  const [lessons, setLessons] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [form, setForm] = useState({
    campusId: '', name: '', subject: '', grade: '', lessonId: '',
    teacherId: '', assistantId: '', capacity: '', startDate: '', recruitStatus: 'recruiting'
  });
  const [assignForm, setAssignForm] = useState({ classId: '', studentId: '', lessonId: '' });
  const [message, setMessage] = useState('');

  async function load() {
    setClasses(await api<any[]>('/api/classes'));
  }

  useEffect(() => {
    load().catch(() => {});
    api<any[]>('/api/campuses').then(setCampuses).catch(() => {});
    api<any[]>('/api/lessons').then(setLessons).catch(() => {});
    api<any[]>('/api/students').then(setStudents).catch(() => {});
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    await api('/api/classes', {
      method: 'POST',
      body: JSON.stringify({
        campusId: Number(form.campusId),
        name: form.name,
        subject: form.subject,
        grade: form.grade,
        lessonId: form.lessonId ? Number(form.lessonId) : null,
        teacherId: form.teacherId ? Number(form.teacherId) : null,
        assistantId: form.assistantId ? Number(form.assistantId) : null,
        capacity: form.capacity ? Number(form.capacity) : null,
        startDate: form.startDate || null,
        recruitStatus: form.recruitStatus
      })
    });
    setForm({ ...form, name: '' });
    setMessage('班级已创建');
    await load();
  }

  async function assign(e: FormEvent) {
    e.preventDefault();
    await api(`/api/classes/${assignForm.classId}/students`, {
      method: 'POST',
      body: JSON.stringify({
        studentId: Number(assignForm.studentId),
        lessonId: assignForm.lessonId ? Number(assignForm.lessonId) : null,
        startDate: new Date().toISOString().slice(0, 10)
      })
    });
    setMessage('分班成功');
    await load();
  }

  return (
    <Shell>
      <h1 className="page-title">班级</h1>
      {message && <p className="subtitle">{message}</p>}
      <form className="form-row" onSubmit={create}>
        <label>校区<select value={form.campusId} onChange={(e) => setForm({ ...form, campusId: e.target.value })}>
          <option value="">选择校区</option>
          {campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></label>
        <label>班级名称<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label>科目<input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></label>
        <label>年级<input value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} /></label>
        <label>所属课程<select value={form.lessonId} onChange={(e) => setForm({ ...form, lessonId: e.target.value })}>
          <option value="">选择课程</option>
          {lessons.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select></label>
        <label>班主任 ID<input value={form.teacherId} onChange={(e) => setForm({ ...form, teacherId: e.target.value })} /></label>
        <label>助教 ID<input value={form.assistantId} onChange={(e) => setForm({ ...form, assistantId: e.target.value })} /></label>
        <label>满班人数<input value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} /></label>
        <label>开班日期<input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></label>
        <label>招生状态<select value={form.recruitStatus} onChange={(e) => setForm({ ...form, recruitStatus: e.target.value })}>
          <option value="recruiting">招生中</option>
          <option value="full">已满</option>
          <option value="closed">已关闭</option>
        </select></label>
        <button className="btn primary" type="submit">新增班级</button>
      </form>

      <form className="form-row" onSubmit={assign}>
        <label>分班班级<select value={assignForm.classId} onChange={(e) => setAssignForm({ ...assignForm, classId: e.target.value })}>
          <option value="">选择班级</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></label>
        <label>学员<select value={assignForm.studentId} onChange={(e) => setAssignForm({ ...assignForm, studentId: e.target.value })}>
          <option value="">选择学员</option>
          {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select></label>
        <label>报读课程<select value={assignForm.lessonId} onChange={(e) => setAssignForm({ ...assignForm, lessonId: e.target.value })}>
          <option value="">选择课程</option>
          {lessons.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select></label>
        <button className="btn primary" type="submit">分班</button>
      </form>

      <div className="panel">
        <table className="table">
          <thead>
            <tr>
              <th>班级名称</th><th>所属课程</th><th>人数</th><th>班主任</th><th>助教</th>
              <th>校区</th><th>开班日期</th><th>招生状态</th>
            </tr>
          </thead>
          <tbody>
            {classes.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.lesson_name ?? '-'}</td>
                <td>{c.student_count}</td>
                <td>{c.teacher_name ?? '待定'}</td>
                <td>{c.assistant_name ?? '-'}</td>
                <td>{c.campus_id}</td>
                <td>{c.start_date ? String(c.start_date).slice(0, 10) : '-'}</td>
                <td>{c.recruit_status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}