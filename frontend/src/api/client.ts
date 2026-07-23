import axios from 'axios';
import { useUI } from '../stores/uiStore';
import { t } from '../lib/i18n';

/** معلومات نسخة قاعدة بيانات واحدة (محلية أو سحابية) — لعرضها في حوار حلّ التعارض. */
interface DatabaseVersionInfo {
  sha256: string;
  sizeBytes: number;
  modifiedAt: string;
  deviceId: string | null;
  deviceName: string | null;
}

interface SyncConflictInfo {
  local: DatabaseVersionInfo;
  remote: DatabaseVersionInfo;
  recommendation: 'LOCAL' | 'REMOTE' | 'UNKNOWN';
}

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
      // ─── Attachments IPC ────────────────────────────────────────────────────────
      openFileDialog: () => Promise<string | null>;
      openAttachment: (filePath: string) => Promise<string | null>;
      // ─── Print Center Foundation v1 (additive; printPage/exportPdf above unchanged) ──
      /** Optional: absent on an older preload build — every caller must guard. */
      printSubmit?: (job: unknown) => Promise<{
        status: 'printed' | 'exported' | 'canceled' | 'failed';
        filePath?: string;
        sizeBytes?: number;
        error?: string;
      }>;
      listPrinters?: () => Promise<
        Array<{
          name: string;
          displayName: string;
          description: string;
          isDefault: boolean;
          status: number;
        }>
      >;
      // ─── True Chromium WYSIWYG Preview POC ─────────────────────────────────────
      /** Optional: absent on an older preload build — every caller must guard. */
      generateWysiwygPreviewPoc?: (html: string) => Promise<{
        ok: boolean;
        pdf?: Uint8Array;
        /** `null` when the page count could not be parsed confidently — never 0. */
        pageCount?: number | null;
        readyMs?: number;
        error?: string;
      }>;
      /** Optional: absent on an older preload build — every caller must guard. */
      wysiwygViewerActivate?: () => Promise<number | null>;
      wysiwygViewerDeactivate?: (token: number) => Promise<boolean>;

      // ─── Google Drive Sync Foundation v1 ────────────────────────────────────────
      /** Optional: absent on an older preload build — every caller must guard. */
      syncGetStatus?: () => Promise<{
        status: string;
        message: string;
        configured: boolean;
        authenticated: boolean;
        account: string | null;
        lastSyncAt: string | null;
        lastUploadAt: string | null;
        lastDownloadAt: string | null;
        lastSyncedVersion: number | null;
        lastError: string | null;
        localDb: { exists: boolean; sizeBytes: number };
        device: { deviceId: string; deviceName: string };
      }>;
      syncGetLog?: () => Promise<Array<{
        at: string;
        action: string;
        result: string;
        message: string;
        deviceId?: string;
        deviceName?: string;
        conflictResolved?: boolean;
        resolutionSelected?: 'LOCAL' | 'REMOTE';
      }>>;
      syncAuthenticate?: () => Promise<{ ok: boolean; email?: string; error?: string }>;
      syncDisconnect?: () => Promise<{ ok: boolean }>;
      syncNow?: () => Promise<{
        ok: boolean;
        action: string;
        error?: string;
        requiresRestart?: boolean;
        /** الخادم الخلفي أُعيد تشغيله تلقائيًا — الواجهة تحتاج لإعادة تحميل نفسها فقط. */
        backendRestarted?: boolean;
        conflict?: SyncConflictInfo;
      }>;
      syncUpload?: () => Promise<{ ok: boolean; error?: string }>;
      syncDownload?: () => Promise<{
        ok: boolean;
        error?: string;
        requiresRestart?: boolean;
        backendRestarted?: boolean;
      }>;
      /** Optional: absent on an older preload build — every caller must guard. */
      syncGetConflict?: () => Promise<SyncConflictInfo | null>;
      syncResolveConflict?: (choice: 'LOCAL' | 'REMOTE') => Promise<{
        ok: boolean;
        error?: string;
        requiresRestart?: boolean;
        backendRestarted?: boolean;
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

// UNPAID/OVERDUE/CANCELLED reuse the existing inv.status.* dictionary keys
// (byte-identical Arabic wording); PARTIAL/PAID use their own error.invoice_status.*
// keys because inv.status.partial/paid carry different Arabic wording.
const STATUS_LABEL_KEYS: Record<string, string> = {
  UNPAID: 'inv.status.unpaid',
  PARTIAL: 'error.invoice_status.partial',
  PAID: 'error.invoice_status.paid',
  OVERDUE: 'inv.status.overdue',
  CANCELLED: 'inv.status.cancelled',
};

const NETWORK_ERROR_STRINGS = ['network error', 'econnrefused', 'err_connection_refused', 'failed to fetch', 'networkerror'];

const HTTP_STATUS_MESSAGE_KEYS: Record<number, string> = {
  400: 'error.http.400',
  403: 'error.http.403',
  404: 'error.http.404',
  408: 'error.http.408',
  409: 'error.http.409',
  413: 'error.http.413',
  422: 'error.http.422',
  429: 'error.http.429',
  500: 'error.http.500',
  503: 'error.http.503',
};

/**
 * Extracts the unified, lang-aware error message from a server/network error.
 * Reads the current UI language directly from the uiStore (outside React —
 * this file has no hook access and is called from ~70 call sites app-wide,
 * so the function signature must not change). `errorMessage(err)` keeps
 * working exactly as before; it simply now resolves strings via `t()`.
 */
export function errorMessage(err: unknown): string {
  const lang = useUI.getState().lang;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const e = err as any;
  const data = e?.response?.data;

  // أخطاء الشبكة (لا اتصال بالخادم)
  if (!e?.response) {
    const msg = (e?.message ?? '').toLowerCase();
    if (NETWORK_ERROR_STRINGS.some(s => msg.includes(s)) || e?.code === 'ECONNREFUSED' || e?.code === 'ERR_NETWORK') {
      return t('error.network.no_connection', lang);
    }
    if (e?.code === 'ECONNABORTED' || msg.includes('timeout')) {
      return t('error.network.timeout', lang);
    }
    return e?.message ?? t('error.generic_unexpected', lang);
  }

  // رسالة الخادم إن وُجدت
  if (!data) {
    const status = e?.response?.status as number | undefined;
    const key = status !== undefined ? HTTP_STATUS_MESSAGE_KEYS[status] : undefined;
    return (key ? t(key, lang) : undefined) ?? t('error.generic_unexpected', lang);
  }

  const details = data.details;

  // رسالة تفصيلية لتعارض رقم الفاتورة
  if (details && typeof details === 'object' && details.code === 'DUPLICATE_INVOICE_NUMBER') {
    const rec = details.conflictingRecord;
    const lines = [t('error.duplicate_invoice.number_used', lang, { value: details.value ?? '' })];
    if (rec?.partyName) lines.push(t('error.duplicate_invoice.party', lang, { value: rec.partyName }));
    if (rec?.issueDate) {
      const d = new Date(rec.issueDate as string);
      if (!isNaN(d.getTime())) lines.push(t('error.duplicate_invoice.date', lang, { value: d.toLocaleDateString('ar-KW') }));
    }
    if (rec?.status) {
      const statusKey = STATUS_LABEL_KEYS[rec.status as string];
      const statusLabel = statusKey ? t(statusKey, lang) : rec.status;
      lines.push(t('error.duplicate_invoice.status', lang, { value: statusLabel }));
    }
    return lines.join('\n');
  }

  // تعارض رقم قيد اليومية (entryNumber)
  if (details && typeof details === 'object' && details.code === 'DUPLICATE_ENTRY_NUMBER') {
    return t('error.duplicate_journal_entry_numbering', lang);
  }

  // ترحيل مزدوج للقيد المحاسبي
  if (details && typeof details === 'object' && details.code === 'DUPLICATE_JOURNAL_ENTRY') {
    return data.message ?? t('error.duplicate_journal_entry_exists', lang);
  }

  // أخطاء حقول Zod — نعرض أول خطأ
  if (details && typeof details === 'object' && !details.code) {
    const firstArr = Object.values(details as Record<string, string[]>).find(
      (v) => Array.isArray(v) && v.length > 0,
    ) as string[] | undefined;
    if (firstArr) return `${data.message}: ${firstArr[0]}`;
  }

  return data.message ?? e?.message ?? t('error.generic_unexpected', lang);
}
