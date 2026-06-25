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
      backupCreate: () => Promise<{
        success: boolean; canceled?: boolean; path?: string; sizeBytes?: number; error?: string;
      }>;
      backupRestore: (sourcePath: string) => Promise<{
        success: boolean; requiresRestart?: boolean;
        autoBackupPath?: string; sizeBytes?: number; error?: string;
      }>;
      getDbPath: () => Promise<{
        dir: string; backupDir: string; exists: boolean; sizeBytes: number; isDev: boolean;
      }>;
      // ─── Session IPC ────────────────────────────────────────────────────────────
      setSessionToken: (token: string | null) => Promise<{ ok: boolean }>;
      // ─── Scheduler IPC ──────────────────────────────────────────────────────────
      backupReconfigure: () => Promise<{ ok: boolean }>;
      // ─── PDF Export IPC ─────────────────────────────────────────────────────────
      exportPdf: (suggestedName: string) => Promise<{
        success: boolean; canceled?: boolean; path?: string; sizeBytes?: number; error?: string;
      }>;
      exportPdfFromHtml: (html: string, suggestedName: string) => Promise<{
        success: boolean; canceled?: boolean; path?: string; sizeBytes?: number; error?: string;
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

const STATUS_LABELS: Record<string, string> = {
  UNPAID: 'غير مدفوعة', PARTIAL: 'مدفوعة جزئياً', PAID: 'مدفوعة',
  OVERDUE: 'متأخرة', CANCELLED: 'ملغاة',
};

/** استخراج رسالة الخطأ العربية الموحّدة من الخادم. */
export function errorMessage(err: unknown): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const e = err as any;
  const data = e?.response?.data;
  if (!data) return e?.message ?? 'حدث خطأ غير متوقع';

  const details = data.details;

  // رسالة تفصيلية لتعارض رقم الفاتورة
  if (details && typeof details === 'object' && details.code === 'DUPLICATE_INVOICE_NUMBER') {
    const rec = details.conflictingRecord;
    const lines = [`رقم الفاتورة مستخدم مسبقاً: ${details.value ?? ''}`];
    if (rec?.partyName) lines.push(`الجهة: ${rec.partyName}`);
    if (rec?.issueDate) {
      const d = new Date(rec.issueDate as string);
      if (!isNaN(d.getTime())) lines.push(`التاريخ: ${d.toLocaleDateString('ar-KW')}`);
    }
    if (rec?.status) lines.push(`الحالة: ${STATUS_LABELS[rec.status as string] ?? rec.status}`);
    return lines.join('\n');
  }

  // تعارض رقم قيد اليومية (entryNumber)
  if (details && typeof details === 'object' && details.code === 'DUPLICATE_ENTRY_NUMBER') {
    return 'حدث تعارض في ترقيم القيود المحاسبية — يرجى المحاولة مرة أخرى';
  }

  // ترحيل مزدوج للقيد المحاسبي
  if (details && typeof details === 'object' && details.code === 'DUPLICATE_JOURNAL_ENTRY') {
    return data.message ?? 'قيد محاسبي موجود مسبقاً لهذا المستند';
  }

  // أخطاء حقول Zod — نعرض أول خطأ
  if (details && typeof details === 'object' && !details.code) {
    const firstArr = Object.values(details as Record<string, string[]>).find(
      (v) => Array.isArray(v) && v.length > 0,
    ) as string[] | undefined;
    if (firstArr) return `${data.message}: ${firstArr[0]}`;
  }

  return data.message ?? e?.message ?? 'حدث خطأ غير متوقع';
}
