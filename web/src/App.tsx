import { Navigate, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './auth.tsx';
import LoginPage from './pages/LoginPage.tsx';
import DashboardPage from './pages/DashboardPage.tsx';
import StudentsPage from './pages/StudentsPage.tsx';
import StudentDetailPage from './pages/StudentDetailPage.tsx';
import ClassesPage from './pages/ClassesPage.tsx';
import ImportPage from './pages/ImportPage.tsx';
import MyScoresPage from './pages/MyScoresPage.tsx';
import RolesPage from './pages/RolesPage.tsx';
import LessonsPage from './pages/LessonsPage.tsx';
import ClassroomsPage from './pages/ClassroomsPage.tsx';
import SchedulesPage from './pages/SchedulesPage.tsx';
import EnrollmentsPage from './pages/EnrollmentsPage.tsx';
import AttendancePage from './pages/AttendancePage.tsx';
import ScoresPage from './pages/ScoresPage.tsx';
import CommentsPage from './pages/CommentsPage.tsx';
import MyCommentsPage from './pages/MyCommentsPage.tsx';
import HomeworkPage from './pages/HomeworkPage.tsx';
import MyHomeworkPage from './pages/MyHomeworkPage.tsx';
import OrdersPage from './pages/OrdersPage.tsx';
import AccountsPage from './pages/AccountsPage.tsx';
import RefundPage from './pages/RefundPage.tsx';
import MyOrdersPage from './pages/MyOrdersPage.tsx';
import ReportsPage from './pages/ReportsPage.tsx';

function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />
      <Route path="/students" element={<RequireAuth><StudentsPage /></RequireAuth>} />
      <Route path="/students/:id" element={<RequireAuth><StudentDetailPage /></RequireAuth>} />
      <Route path="/classes" element={<RequireAuth><ClassesPage /></RequireAuth>} />
      <Route path="/scores" element={<RequireAuth><ScoresPage /></RequireAuth>} />
      <Route path="/comments" element={<RequireAuth><CommentsPage /></RequireAuth>} />
      <Route path="/my-comments" element={<RequireAuth><MyCommentsPage /></RequireAuth>} />
      <Route path="/homework" element={<RequireAuth><HomeworkPage /></RequireAuth>} />
      <Route path="/my-homework" element={<RequireAuth><MyHomeworkPage /></RequireAuth>} />
      <Route path="/orders" element={<RequireAuth><OrdersPage /></RequireAuth>} />
      <Route path="/accounts" element={<RequireAuth><AccountsPage /></RequireAuth>} />
      <Route path="/refunds" element={<RequireAuth><RefundPage /></RequireAuth>} />
      <Route path="/my-orders" element={<RequireAuth><MyOrdersPage /></RequireAuth>} />
      <Route path="/reports" element={<RequireAuth><ReportsPage /></RequireAuth>} />
      <Route path="/import" element={<RequireAuth><ImportPage /></RequireAuth>} />
      <Route path="/my-scores" element={<RequireAuth><MyScoresPage /></RequireAuth>} />
      <Route path="/roles" element={<RequireAuth><RolesPage /></RequireAuth>} />
      <Route path="/lessons" element={<RequireAuth><LessonsPage /></RequireAuth>} />
      <Route path="/classrooms" element={<RequireAuth><ClassroomsPage /></RequireAuth>} />
      <Route path="/schedules" element={<RequireAuth><SchedulesPage /></RequireAuth>} />
      <Route path="/enrollments" element={<RequireAuth><EnrollmentsPage /></RequireAuth>} />
      <Route path="/attendance" element={<RequireAuth><AttendancePage /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
