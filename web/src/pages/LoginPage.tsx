import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GraduationCap, Users } from 'lucide-react';
import { useAuth } from '../auth.tsx';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      const user = await login(username, password);
      navigate(user.role === 'teacher' ? '/teacher/mobile' : user.role === 'parent' ? '/parent/mobile' : '/dashboard');
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <h1>学校管理系统</h1>
        <label>账号<input value={username} onChange={(e) => setUsername(e.target.value)} /></label>
        <label>密码<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {error && <p className="error">{error}</p>}
        <button type="submit">登录</button>
        <div className="login-role-entries">
          <Link to="/teacher/login"><GraduationCap size={18} /><span><b>教师端登录</b><small>考勤、作业、成绩、课时</small></span></Link>
          <Link to="/parent/login"><Users size={18} /><span><b>家长端登录</b><small>成绩、点评、作业、账户</small></span></Link>
        </div>
      </form>
    </div>
  );
}
