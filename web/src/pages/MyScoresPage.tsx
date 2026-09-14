import { useEffect, useState } from 'react';
import Shell from '../Shell.tsx';
import { api } from '../api.ts';
import { useAuth } from '../auth.tsx';

export default function MyScoresPage() {
  const { user } = useAuth();
  const [children, setChildren] = useState<any[]>([]);

  useEffect(() => {
    if (user?.role === 'parent') {
      api<any[]>('/api/me/children').then(setChildren).catch(() => {});
    } else if (user?.role === 'student') {
      api<any>('/api/me/report').then((report) => setChildren([report])).catch(() => {});
    }
  }, [user]);

  return (
    <Shell>
      <h1 className="page-title">{user?.role === 'parent' ? '孩子成绩' : '我的成绩'}</h1>
      {children.map((child) => (
        <div className="panel" key={child.student.id}>
          <h2>{child.student.name}</h2>
          <table className="table">
            <thead>
              <tr><th>考试</th><th>项目</th><th>成绩</th><th>来源</th><th>考试日期</th><th>班级</th><th>备注</th></tr>
            </thead>
            <tbody>
              {child.scores.map((s: any) => (
                <tr key={s.id}>
                  <td>{s.exam_name}</td>
                  <td>{s.project_name}</td>
                  <td>{s.score ?? '-'}</td>
                  <td>{s.source}</td>
                  <td>{String(s.exam_date).slice(0, 10)}</td>
                  <td>{s.class_name ?? '-'}</td>
                  <td>{s.remark ?? '-'}</td>
                </tr>
              ))}
              {child.scores.length === 0 && <tr><td colSpan={7}>暂无成绩</td></tr>}
            </tbody>
          </table>
          <button className="btn primary" onClick={() => window.print()}>打印报告</button>
        </div>
      ))}
    </Shell>
  );
}