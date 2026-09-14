import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api.ts';

export interface User {
  id: number;
  username: string | null;
  displayName: string;
  role: 'admin' | 'teacher' | 'parent' | 'student';
  modules?: string[];
}

interface AuthState {
  user: User | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

async function withPermissions(user: User): Promise<User> {
  try {
    const perms = await api<{ modules: string[] }>('/api/roles/my-permissions');
    return { ...user, modules: perms.modules };
  } catch {
    return user;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    api<User>('/api/auth/me')
      .then((me) => withPermissions(me))
      .then(setUser)
      .catch(() => {
        localStorage.removeItem('token');
      });
  }, []);

  async function login(username: string, password: string) {
    const data = await api<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    localStorage.setItem('token', data.token);
    setUser(await withPermissions(data.user));
  }

  function logout() {
    localStorage.removeItem('token');
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}