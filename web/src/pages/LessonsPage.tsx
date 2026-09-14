import { useEffect, useState, type FormEvent } from 'react';
import Shell from '../Shell.tsx';
import { api } from '../api.ts';

const TABS = [
  ['list', '课程列表'], ['categories', '课程类别'], ['subjects', '科目设置'], ['upgrades', '升期关系']
] as const;

export default function LessonsPage() {
  const [tab, setTab] = useState<string>('list');
  const [lessons, setLessons] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [upgrades, setUpgrades] = useState<any[]>([]);
  const [campuses, setCampuses] = useState<any[]>([]);
  const [form, setForm] = useState({ name: '', categoryId: '', subjectId: '', teachingMode: 'small_class', feeMode: 'per_hour', campusId: '' });
  const [simpleName, setSimpleName] = useState('');
  const [upgradeForm, setUpgradeForm] = useState({ fromLessonId: '', toLessonId: '' });
  const [message, setMessage] = useState('');

  async function loadAll() {
    setLessons(await api<any[]>('/api/lessons'));
    setCategories(await api<any[]>('/api/lessons/categories'));
    setSubjects(await api<any[]>('/api/lessons/subjects'));
    setUpgrades(await api<any[]>('/api/lessons/upgrades'));
  }

  useEffect(() => {
    loadAll().catch(() => {});
    api<any[]>('/api/campuses').then(setCampuses).catch(() => {});
  }, []);

  async function createLesson(e: FormEvent) {
    e.preventDefault();
    await api('/api/lessons', {
      method: 'POST',
      body: JSON.stringify({
        name: form.name,
        categoryId: form.categoryId ? Number(form.categoryId) : null,
        subjectId: form.subjectId ? Number(form.subjectId) : null,
        teachingMode: form.teachingMode,
        feeMode: form.feeMode,
        campusId: form.campusId ? Number(form.campusId) : null
      })
    });
    setForm({ ...form, name: '' });
    setMessage('课程已创建');
    await loadAll();
  }

  async function createSimple(e: FormEvent) {
    e.preventDefault();
    const path = tab === 'categories' ? '/api/lessons/categories' : '/api/lessons/subjects';
    await api(path, { method: 'POST', body: JSON.stringify({ name: simpleName }) });
    setSimpleName('');
    setMessage('已创建');
    await loadAll();
  }

  async function createUpgrade(e: FormEvent) {
    e.preventDefault();
    await api('/api/lessons/upgrades', {
      method: 'POST',
      body: JSON.stringify({ fromLessonId: Number(upgradeForm.fromLessonId), toLessonId: Number(upgradeForm.toLessonId) })
    });
    setUpgradeForm({ fromLessonId: '', toLessonId: '' });
    setMessage('升期关系已创建');
    await loadAll();
  }

  return (
    <Shell>
      <h1 className="page-title">课程</h1>
      <div className="form-row">
        {TABS.map(([key, label]) => (
          <button key={key} className={tab === key ? 'btn primary' : 'btn'} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>
      {message && <p className="subtitle">{message}</p>}

      {tab === 'list' && (
        <>
          <form className="form-row" onSubmit={createLesson}>
            <label>课程名称<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label>课程类别<select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
              <option value="">选择类别</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></label>
            <label>科目<select value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })}>
              <option value="">选择科目</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select></label>
            <label>授课模式<select value={form.teachingMode} onChange={(e) => setForm({ ...form, teachingMode: e.target.value })}>
              <option value="small_class">小班</option>
              <option value="one_to_one">一对一</option>
              <option value="big_class">大班</option>
            </select></label>
            <label>收费模式<select value={form.feeMode} onChange={(e) => setForm({ ...form, feeMode: e.target.value })}>
              <option value="per_hour">按课时</option>
              <option value="per_period">按期</option>
              <option value="per_time">按时间</option>
            </select></label>
            <label>开课校区<select value={form.campusId} onChange={(e) => setForm({ ...form, campusId: e.target.value })}>
              <option value="">全校区</option>
              {campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></label>
            <button className="btn primary" type="submit">新增课程</button>
          </form>
          <div className="panel">
            <table className="table">
              <thead><tr><th>课程名称</th><th>类别</th><th>科目</th><th>授课模式</th><th>收费模式</th><th>开班数</th><th>状态</th></tr></thead>
              <tbody>
                {lessons.map((l) => (
                  <tr key={l.id}>
                    <td>{l.name}</td><td>{l.category_name ?? '-'}</td><td>{l.subject_name ?? '-'}</td>
                    <td>{l.teaching_mode}</td><td>{l.fee_mode}</td><td>{l.class_count}</td><td>{l.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {(tab === 'categories' || tab === 'subjects') && (
        <>
          <form className="form-row" onSubmit={createSimple}>
            <label>{tab === 'categories' ? '类别名称' : '科目名称'}<input value={simpleName} onChange={(e) => setSimpleName(e.target.value)} /></label>
            <button className="btn primary" type="submit">新增</button>
          </form>
          <div className="panel">
            <table className="table">
              <thead><tr><th>名称</th><th>排序</th><th>启用</th></tr></thead>
              <tbody>
                {(tab === 'categories' ? categories : subjects).map((item) => (
                  <tr key={item.id}><td>{item.name}</td><td>{item.sort}</td><td>{item.enabled ? '是' : '否'}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'upgrades' && (
        <>
          <form className="form-row" onSubmit={createUpgrade}>
            <label>从课程<select value={upgradeForm.fromLessonId} onChange={(e) => setUpgradeForm({ ...upgradeForm, fromLessonId: e.target.value })}>
              <option value="">选择课程</option>
              {lessons.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select></label>
            <label>到课程<select value={upgradeForm.toLessonId} onChange={(e) => setUpgradeForm({ ...upgradeForm, toLessonId: e.target.value })}>
              <option value="">选择课程</option>
              {lessons.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select></label>
            <button className="btn primary" type="submit">新增升期关系</button>
          </form>
          <div className="panel">
            <table className="table">
              <thead><tr><th>从课程</th><th>到课程</th><th>排序</th></tr></thead>
              <tbody>
                {upgrades.map((u) => (
                  <tr key={u.id}>
                    <td>{lessons.find((l) => l.id === u.from_lesson_id)?.name ?? u.from_lesson_id}</td>
                    <td>{lessons.find((l) => l.id === u.to_lesson_id)?.name ?? u.to_lesson_id}</td>
                    <td>{u.sort}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Shell>
  );
}