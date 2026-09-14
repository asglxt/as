import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CalendarDays, ClipboardList, Receipt, TrendingDown, Users } from 'lucide-react';
import Shell from '../Shell.tsx';
import { api } from '../api.ts';
import { useAuth } from '../auth.tsx';

interface DashboardSummary {
  students: number;
  schedulesToday: number;
  teachingLogsToday: number;
  arrearsOrders: number;
  tasks: Array<{ key: string; label: string; count: number; url: string }>;
  quickActions: Array<{ key: string; label: string; url: string }>;
}

const ICONS: Record<string, typeof Users> = {
  arrears: Receipt,
  attendance: CalendarDays,
  scores: ClipboardList,
  homework: ClipboardList
};

export default function DashboardPage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [scoreAlerts, setScoreAlerts] = useState<any[]>([]);

  useEffect(() => {
    if (user?.role === 'admin' || user?.role === 'teacher') {
      api<DashboardSummary>('/api/dashboard/summary').then(setSummary).catch(() => {});
      api<any[]>('/api/scores/analytics/alerts').then(setScoreAlerts).catch(() => setScoreAlerts([]));
    }
  }, [user]);

  if (user?.role !== 'admin' && user?.role !== 'teacher') {
    return <Shell><h1 className="page-title">工作台</h1><p>请从左侧菜单查看成绩和通知。</p></Shell>;
  }

  return (
    <Shell>
      <h1 className="page-title">工作台</h1>
      <p className="page-subtitle">今日待办、经营概况和常用操作集中在这里。</p>
      <div className="cards">
        <div className="stat-card"><b>{summary?.students ?? 0}</b><span>在读学员</span></div>
        <div className="stat-card"><b>{summary?.schedulesToday ?? 0}</b><span>今日排课</span></div>
        <div className="stat-card"><b>{summary?.teachingLogsToday ?? 0}</b><span>今日已记上课</span></div>
        <div className="stat-card"><b>{summary?.arrearsOrders ?? 0}</b><span>待处理欠费</span></div>
      </div>

      <div className="workbench-grid">
        <section className="panel">
          <div className="panel-header"><h2>待办提醒</h2><Bell size={17} color="#7b879a" /></div>
          <div className="task-list">
            {(summary?.tasks ?? []).map((task) => {
              const Icon = ICONS[task.key] ?? ClipboardList;
              return (
                <Link className="task-item" key={task.key} to={task.url}>
                  <div className="task-count">{task.count}</div>
                  <span>{task.label}</span>
                  <Icon size={17} color="#8190a5" />
                </Link>
              );
            })}
          </div>
        </section>

        <div className="workbench-side">
          <section className="panel">
            <div className="panel-header"><h2>成绩预警</h2><span className={`badge ${scoreAlerts.length ? 'orange' : 'green'}`}>{scoreAlerts.length}</span></div>
            <div className="task-list">
              {scoreAlerts.slice(0, 5).map((alert) => <Link className="task-item score-alert-task" key={`${alert.student_id}-${alert.id}`} to={`/students/${alert.student_id}`}><div className="task-count"><TrendingDown size={16} /></div><div><b>{alert.student_name}</b><div className="subtitle">{alert.title} · 变动 {Number(alert.change).toFixed(1)} 分</div></div></Link>)}
              {scoreAlerts.length === 0 && <p className="subtitle">暂无明显成绩下滑预警</p>}
            </div>
          </section>
          <section className="panel">
            <div className="panel-header"><h2>常用功能</h2></div>
            <div className="quick-grid">
              {(summary?.quickActions ?? []).map((action) => (
                <Link className="quick-action" key={action.key} to={action.url}>{action.label}</Link>
              ))}
            </div>
          </section>
          <section className="panel">
            <div className="panel-header"><h2>今日总览</h2></div>
            <div className="summary-strip" style={{ margin: 0 }}>
              <span>排课完成率 <b>{summary?.schedulesToday ? Math.round((summary.teachingLogsToday / summary.schedulesToday) * 100) : 0}%</b></span>
              <span>待跟进 <b>{(summary?.arrearsOrders ?? 0) + (summary?.tasks.reduce((sum, task) => sum + task.count, 0) ?? 0)}</b></span>
            </div>
          </section>
        </div>
      </div>
    </Shell>
  );
}
