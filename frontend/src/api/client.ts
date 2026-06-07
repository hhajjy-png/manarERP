import axios from 'axios';

/** عنوان الخدمة المحلية — من جسر Electron إن وُجد، وإلا الافتراضي. */
declare global {
  interface Window {
    manar?: {
      apiBaseUrl: string;
      chooseSavePath: (n: string) => Promise<string | null>;
      chooseBackupFile: () => Promise<string | null>;
      restartApp: () => Promise<void>;
      printPage: () => Promise<void>;
      getAppInfo: () => Promise<{ version: string; platform: string }>;
      // ─── Backup / Restore IPC ────────────────────────────────────────────────
      backupCreate: (targetPath: string) => Promise<{
        success: boolean; path?: string; sizeBytes?: number; error?: string;
      }>;
      backupRestore: (sourcePath: string) => Promise<{
        success: boolean; requiresRestart?: boolean;
        autoBackupPath?: string; sizeBytes?: number; error?: string;
      }>;
      getDbPath: () => Promise<{
        dir: string; backupDir: string; exists: boolean; sizeBytes: number; isDev: boolean;
      }>;
    };
  }
}

const baseURL = window.manar?.apiBaseUrl ?? 'http://127.0.0.1:48211/api';

export const api = axios.create({ baseURL, timeout: 20000 });

const TOKEN_KEY = 'manar.token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

// إرفاق رمز الجلسة مع كل طلب
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// عند انتهاء الجلسة (401) نخرج المستخدم
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401 && getToken()) {
      setToken(null);
      if (!location.hash.includes('/login')) location.hash = '#/login';
    }
    return Promise.reject(error);
  },
);

/** استخراج رسالة الخطأ العربية الموحّدة من الخادم. */
export function errorMessage(err: unknown): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const e = err as any;
  return e?.response?.data?.message ?? e?.message ?? 'حدث خطأ غير متوقع';
}
