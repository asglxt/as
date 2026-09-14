import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, Users } from 'lucide-react';
import { useAuth } from '../auth.tsx';

export default function MobileRoleLoginPage({ role }: { role: 'teacher' | 'parent' }) {
  const { login, logout } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const target = role === 'teacher' ? '/teacher/mobile' : '/parent/mobile';
  const title = role === 'teacher' ? '教师手机端' : '家长手机端';
  const demoUsername = role === 'teacher' ? 'teacher1' : 'parent1';

  function fillDemo() {
    setUsername(demoUsername);
    setPassword('123456');
    setError('');
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const user = await login(username, password);
      if (user.role !== role) {
        logout();
        setError(role === 'teacher' ? '该账号不是教师账号，请使用教师账号登录。' : '该账号不是家长账号，请使用家长账号登录。');
        return;
      }
      navigate(target);
    } catch (err: any) { setError(err.message); }
  }

  return (
    <div className="role-login-wrap">
      <form className="role-login-card" onSubmit={submit}>
        <div className={`role-login-mark ${role}`}>{role === 'teacher' ? <GraduationCap size={25} /> : <Users size={25} />}</div>
        <span>{role === 'teacher' ? '老师考勤、作业、成绩与课时' : '孩子成绩、点评、作业与账户'}</span>
        <h1>{title}</h1>
        <label>账号<input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} /></label>
        <label>密码<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {error && <p className="error">{error}</p>}
        <button className="role-demo-button" type="button" onClick={fillDemo}>一键填入试用账号</button>
        <button type="submit">登录{title}</button>
        <div className="role-login-links"><button type="button" onClick={() => navigate(role === 'teacher' ? '/parent/login' : '/teacher/login')}>切换至{role === 'teacher' ? '家长端' : '教师端'}</button><button type="button" onClick={() => navigate('/login')}>管理后台登录</button></div>
      </form>
    </div>
  );
}
