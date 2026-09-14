import { NavLink } from 'react-router-dom';
import { BookOpen, CalendarDays, DoorOpen, FileSpreadsheet, LayoutDashboard, LogOut, School, ShieldCheck, Upload, Users, Wallet, CheckSquare, MessageSquare, ClipboardList, Receipt, CircleDollarSign, Undo2, BarChart3 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useAuth } from './auth.tsx';

export default function Shell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const isStaff = user?.role === 'admin' || user?.role === 'teacher';
  const can = (key: string) => user?.role === 'admin' || (user?.modules ?? []).includes(key);
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">学校管理</div>
        <nav>
          {isStaff && (
            <>
              <NavLink to="/dashboard"><LayoutDashboard size={16} /> 工作台</NavLink>
              <NavLink to="/students"><Users size={16} /> 学员</NavLink>
              <NavLink to="/classes"><School size={16} /> 班级</NavLink>
              {can('scores') && <NavLink to="/scores"><FileSpreadsheet size={16} /> 成绩</NavLink>}
              {can('comments') && <NavLink to="/comments"><MessageSquare size={16} /> 课堂点评</NavLink>}
              {can('homework') && <NavLink to="/homework"><ClipboardList size={16} /> 作业</NavLink>}
              {can('finance') && <NavLink to="/orders"><Receipt size={16} /> 订单</NavLink>}
              {can('finance') && <NavLink to="/accounts"><CircleDollarSign size={16} /> 学员账户</NavLink>}
              {can('finance') && <NavLink to="/refunds"><Undo2 size={16} /> 退费</NavLink>}
              {can('report') && <NavLink to="/reports"><BarChart3 size={16} /> 报表</NavLink>}
              {user?.role === 'admin' && <NavLink to="/import"><Upload size={16} /> 导入</NavLink>}
              {can('lessons') && <NavLink to="/lessons"><BookOpen size={16} /> 课程</NavLink>}
              {can('classrooms') && <NavLink to="/classrooms"><DoorOpen size={16} /> 教室</NavLink>}
              {can('schedules') && <NavLink to="/schedules"><CalendarDays size={16} /> 排课</NavLink>}
              {can('enrollments') && <NavLink to="/enrollments"><Wallet size={16} /> 报读</NavLink>}
              {can('attendance') && <NavLink to="/attendance"><CheckSquare size={16} /> 记上课</NavLink>}
              {can('roles') && <NavLink to="/roles"><ShieldCheck size={16} /> 角色权限</NavLink>}
            </>
          )}
          {user?.role === 'parent' && <NavLink to="/my-scores"><FileSpreadsheet size={16} /> 孩子成绩</NavLink>}
          {user?.role === 'parent' && <NavLink to="/my-comments"><MessageSquare size={16} /> 孩子点评</NavLink>}
          {user?.role === 'parent' && <NavLink to="/my-homework"><ClipboardList size={16} /> 孩子作业</NavLink>}
          {user?.role === 'parent' && <NavLink to="/my-orders"><Receipt size={16} /> 孩子订单</NavLink>}
          {user?.role === 'student' && <NavLink to="/my-scores"><FileSpreadsheet size={16} /> 我的成绩</NavLink>}
          {user?.role === 'student' && <NavLink to="/my-comments"><MessageSquare size={16} /> 我的点评</NavLink>}
          {user?.role === 'student' && <NavLink to="/my-homework"><ClipboardList size={16} /> 我的作业</NavLink>}
          {user?.role === 'student' && <NavLink to="/my-orders"><Receipt size={16} /> 我的订单</NavLink>}
        </nav>
        <button className="logout" onClick={logout}><LogOut size={16} /> 退出</button>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}