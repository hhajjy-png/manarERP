import { create } from 'zustand';
import { api, getToken, setToken } from '../api/client';
import { clearPersistedUIState } from '../hooks/usePersistedState';
import { clearSyncedPreferenceCache, flushPreferenceWrites } from '../lib/syncedPreferences';

/** إرسال توكن الجلسة إلى Electron Main Process للتحقق منه عبر Backend مباشرة. */
function syncElectronToken(token: string | null) {
  if (typeof window === 'undefined' || !window.manar?.setSessionToken) return;
  window.manar.setSessionToken(token);
}

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
  /** Canonical SYSTEM_ADMIN check — single source of truth instead of each page
   * independently comparing `user.role.name === 'SYSTEM_ADMIN'`. */
  isSystemAdmin: () => boolean;
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
      syncElectronToken(token);
    } finally {
      set({ loading: false });
    }
  },

  async logout() {
    // Zero Data Loss Certification Pack v1 — تُدفع آخر كتابات التفضيلات إلى قاعدة
    // البيانات **قبل** إبطال الرمز. بدون هذا كان تفضيل غُيِّر في آخر نصف ثانية قبل
    // الخروج يضيع، لأن الدفعة المؤجّلة كانت سترسَل بعد إبطال الجلسة فتُرفض بـ401.
    await flushPreferenceWrites();
    try {
      await api.post('/auth/logout');
    } catch {
      // نتجاهل أخطاء الخروج
    }
    // المخبأ المحلي للتفضيلات يُمسح مع بقية حالة الواجهة: التفضيلات صارت لكل مستخدم
    // في القاعدة بينما `localStorage` لكل جهاز، فبقاؤها كان سيُظهر تفضيلات المستخدم
    // السابق للمستخدم التالي في اللحظة بين دخوله واكتمال المزامنة.
    clearSyncedPreferenceCache();
    clearPersistedUIState();
    setToken(null);
    set({ user: null });
    syncElectronToken(null);
  },

  /** استعادة الجلسة عند فتح التطبيق إن وُجد رمز صالح. */
  async loadSession() {
    if (!getToken()) {
      set({ initialized: true });
      return;
    }
    try {
      const res = await api.get('/auth/me');
      const user = res.data.data as AuthUser;
      set({ user });
      syncElectronToken(getToken());
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } }).response?.status;
      if (status === 401) {
        setToken(null);
        syncElectronToken(null);
      }
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

  isSystemAdmin() {
    return get().user?.role.name === 'SYSTEM_ADMIN';
  },
}));
