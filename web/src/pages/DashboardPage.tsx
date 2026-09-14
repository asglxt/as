import { useEffect, useState } from 'react';
import Shell from '../Shell.tsx';
import { api } from '../api.ts';
import { useAuth } from '../auth.tsx';

export default function DashboardPage() {
  const { user } = useAuth();
  const [students, setStudents] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);

  useEffect(() => {
    if (user?.role === 'admin' || user?.role === 'teacher') {
      api<any[]>('/api/students').then(setStudents).catch(() => {});
      api<any[]>('/api/classes').then(setClasses).catch(() => {});
    }
  }, [user]);

  return (
    <Shell>
      <h1 className="page-title">工作台</h1>
      {user?.role === 'admin' || user?.role === 'teacher' ? (
        <div className="cards">
          <div className="stat-card"><b>{students.length}</b>在读学员</div>
          <div className="stat-card"><b>{classes.length}</b>班级</div>
        </div>
      ) : (
        <p>请从左侧菜单查看成绩。</p>
      )}
    </Shell>
  );
}
