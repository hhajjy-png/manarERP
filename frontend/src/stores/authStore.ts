import { create } from 'zustand';
import { api, getToken, setToken } from '../api/client';

export interface AuthUser {
  id: number;
  username: string;
  fullName: string;
  email?: string | null;
  role: { id: number; name: string; displayName: string };
  permissions: string[];
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  initialized: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  loadSession: () => Promise<void>;
  hasPermission: (perm: string) => boolean;
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  loading: false,
  initialized: false,

  async login(username, password) {
    set({ loading: true });
    try {
      const res = await api.post('/auth/login', { username, password });
      const { token, user } = res.data.data;
      setToken(token);
      set({ user });
    } finally {
      set({ loading: false });
    }
  },

  async logout() {
    try {
      await api.post('/auth/logout');
    } catch {
      // نتجاهل أخطاء الخروج
    }
    setToken(null);
    set({ user: null });
  },

  /** استعادة الجلسة عند فتح التطبيق إن وُجد رمز صالح. */
  async loadSession() {
    if (!getToken()) {
      set({ initialized: true });
      return;
    }
    try {
      const res = await api.get('/auth/me');
      set({ user: res.data.data });
    } catch {
      setToken(null);
    } finally {
      set({ initialized: true });
    }
  },

  hasPermission(perm) {
    const u = get().user;
    if (!u) return false;
    if (u.role.name === 'SYSTEM_ADMIN') return true;
    return u.permissions.includes(perm);
  },
}));
