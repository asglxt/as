import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3, Bell, BookOpen, Boxes, Building2, CalendarDays, CheckSquare, ChevronDown,
  CircleDollarSign, ClipboardList, DoorOpen, FileSpreadsheet, GraduationCap,
  Import, LayoutDashboard, LogOut, MessageSquare, Receipt, School,
  Network, ShieldCheck, Smartphone, Undo2, Upload, Users, Wallet
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from './auth.tsx';
import { api } from './api.ts';

type NavItem = { to: string; label: string; icon: ReactNode; module?: string };
type NavGroup = { key: string; label: string; items: NavItem[] };

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': '工作台', '/students': '学员', '/classes': '班级', '/lessons': '课程',
  '/classrooms': '教室', '/schedules': '排课', '/enrollments': '报读', '/attendance': '记上课',
  '/scores': '成绩', '/comments': '课堂点评', '/homework': '作业', '/orders': '订单',
  '/accounts': '学员账户', '/refunds': '退费', '/reports': '报表', '/import': '导入',
  '/roles': '角色权限', '/organization': '组织架构', '/campuses': '校区设置'
  , '/notifications': '通知公告', '/materials': '教材与杂费'
};

export default function Shell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [openGroup, setOpenGroup] = useState<string>('');
  const [unreadCount, setUnreadCount] = useState(0);
  const isStaff = user?.role === 'admin' || user?.role === 'teacher';
  const can = (key?: string) => !key || user?.role === 'admin' || (user?.modules ?? []).includes(key);

  const groups = useMemo<NavGroup[]>(() => [
    {
      key: 'workbench', label: '工作台', items: [
        { to: '/dashboard', label: '工作台', icon: <LayoutDashboard size={17} />, module: 'dashboard' }
      ]
    },
    {
      key: 'operations', label: '办理管理', items: [
        { to: '/orders', label: '订单与收款', icon: <Receipt size={17} />, module: 'finance' },
        { to: '/accounts', label: '学员账户', icon: <CircleDollarSign size={17} />, module: 'finance' },
        { to: '/refunds', label: '退费管理', icon: <Undo2 size={17} />, module: 'finance' }
        , { to: '/materials', label: '教材与杂费', icon: <Boxes size={17} />, module: 'finance' }
      ]
    },
    {
      key: 'academic', label: '教务管理', items: [
        { to: '/students', label: '学员', icon: <Users size={17} />, module: 'students' },
        { to: '/classes', label: '班级', icon: <School size={17} />, module: 'classes' },
        { to: '/lessons', label: '课程', icon: <BookOpen size={17} />, module: 'lessons' },
        { to: '/classrooms', label: '教室', icon: <DoorOpen size={17} />, module: 'classrooms' },
        { to: '/schedules', label: '排课', icon: <CalendarDays size={17} />, module: 'schedules' },
        { to: '/enrollments', label: '报读与课时', icon: <Wallet size={17} />, module: 'enrollments' },
        { to: '/attendance', label: '记上课', icon: <CheckSquare size={17} />, module: 'attendance' }
      ]
    },
    {
      key: 'teaching', label: '教学管理', items: [
        { to: '/scores', label: '成绩', icon: <FileSpreadsheet size={17} />, module: 'scores' },
        { to: '/comments', label: '课堂点评', icon: <MessageSquare size={17} />, module: 'comments' },
        { to: '/homework', label: '作业', icon: <ClipboardList size={17} />, module: 'homework' }
      ]
    },
    {
      key: 'data', label: '数据中心', items: [
        { to: '/reports', label: '报表中心', icon: <BarChart3 size={17} />, module: 'report' },
        { to: '/import', label: '数据导入', icon: <Import size={17} />, module: 'students' }
      ]
    },
    {
      key: 'internal', label: '内部管理', items: [
        { to: '/organization', label: '组织架构', icon: <Network size={17} />, module: 'org' },
        { to: '/roles', label: '角色与员工', icon: <ShieldCheck size={17} />, module: 'roles' },
        { to: '/campuses', label: '校区设置', icon: <Building2 size={17} />, module: 'org' },
        { to: '/notifications', label: '通知公告', icon: <Bell size={17} />, module: 'notifications' }
      ]
    }
  ], []);

  const visibleGroups = groups
    .map((group) => ({ ...group, items: group.items.filter((item) => can(item.module)) }))
    .filter((group) => group.items.length > 0);

  const activeGroup = visibleGroups.find((group) => group.items.some((item) => location.pathname.startsWith(item.to)));
  const currentGroupKey = openGroup || activeGroup?.key || 'workbench';
  const currentTitle = PAGE_TITLES[location.pathname] ?? (location.pathname.startsWith('/students/') ? '学员详情' : '学校管理');

  useEffect(() => {
    api<{ count: number }>('/api/notifications/unread-count')
      .then((result) => setUnreadCount(Number(result.count)))
      .catch(() => setUnreadCount(0));
  }, [location.pathname, user?.id]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><GraduationCap size={21} /></div>
          <div><strong>学校管理</strong><span>教务运营中心</span></div>
        </div>

        <nav className="side-nav">
          {isStaff && visibleGroups.map((group) => {
            const expanded = currentGroupKey === group.key;
            return (
              <div className="nav-group" key={group.key}>
                <button className={expanded ? 'nav-group-title active' : 'nav-group-title'} onClick={() => setOpenGroup(expanded ? '' : group.key)}>
                  <span>{group.label}</span>
                  <ChevronDown size={15} className={expanded ? 'chevron open' : 'chevron'} />
                </button>
                {expanded && (
                  <div className="nav-group-items">
                    {group.items.map((item) => (
                      <NavLink key={item.to} to={item.to} className={({ isActive }) => isActive ? 'active' : ''}>
                        {item.icon}<span>{item.label}</span>
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {user?.role === 'parent' && (
            <div className="nav-group-items standalone">
              <NavLink to="/my-scores"><FileSpreadsheet size={17} />孩子成绩</NavLink>
              <NavLink to="/my-comments"><MessageSquare size={17} />孩子点评</NavLink>
              <NavLink to="/my-homework"><ClipboardList size={17} />孩子作业</NavLink>
              <NavLink to="/my-orders"><Receipt size={17} />孩子订单</NavLink>
              <NavLink to="/notifications"><Bell size={17} />通知公告</NavLink>
            </div>
          )}
          {user?.role === 'student' && (
            <div className="nav-group-items standalone">
              <NavLink to="/my-scores"><FileSpreadsheet size={17} />我的成绩</NavLink>
              <NavLink to="/my-comments"><MessageSquare size={17} />我的点评</NavLink>
              <NavLink to="/my-homework"><ClipboardList size={17} />我的作业</NavLink>
              <NavLink to="/my-orders"><Receipt size={17} />我的订单</NavLink>
              <NavLink to="/notifications"><Bell size={17} />通知公告</NavLink>
            </div>
          )}
        </nav>

        <div className="sidebar-user">
          <div className="avatar">{user?.displayName?.slice(0, 1) || '用'}</div>
          <div className="user-copy"><strong>{user?.displayName}</strong><span>{user?.role === 'admin' ? '超级管理员' : '教职工'}</span></div>
          <button className="icon-button" onClick={logout} title="退出登录"><LogOut size={17} /></button>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb"><span>学校管理</span><b>/</b><strong>{currentTitle}</strong></div>
          <div className="topbar-actions">{user?.role === 'teacher' && <button className="icon-button" title="手机教师端" onClick={() => navigate('/teacher/mobile')}><Smartphone size={18} /></button>}{user?.role === 'parent' && <button className="icon-button" title="手机家长端" onClick={() => navigate('/parent/mobile')}><Smartphone size={18} /></button>}<button className="icon-button notification-button" title="通知" onClick={() => navigate('/notifications')}><Bell size={18} />{unreadCount > 0 && <span>{unreadCount > 99 ? '99+' : unreadCount}</span>}</button></div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
