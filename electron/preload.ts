import { contextBridge, ipcRenderer } from 'electron';

/**
 * جسر آمن (contextBridge) يكشف واجهة محدودة للواجهة الأمامية فقط.
 * لا نعرّض ipcRenderer كاملًا حفاظًا على الأمان.
 */
const api = {
  /** عنوان الخدمة الخلفية المحلية. */
  apiBaseUrl: 'http://127.0.0.1:48211/api',

  /** اختيار مسار لحفظ نسخة/تصدير قاعدة البيانات. */
  chooseSavePath: (defaultName: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:save', defaultName),

  /** اختيار ملف نسخة احتياطية للاستعادة. */
  chooseBackupFile: (): Promise<string | null> => ipcRenderer.invoke('dialog:openBackup'),

  /** إعادة تشغيل التطبيق (بعد الاستعادة). */
  restartApp: (): Promise<void> => ipcRenderer.invoke('app:restart'),

  /** طباعة الصفحة الحالية (للفواتير/التقارير). */
  printPage: (): Promise<void> => ipcRenderer.invoke('app:print'),

  /** معلومات التطبيق (الإصدار). */
  getAppInfo: (): Promise<{ version: string; platform: string }> =>
    ipcRenderer.invoke('app:info'),

  // ─── Backup / Restore (Electron IPC مباشر — مستقل عن الخادم الخلفي) ────────

  /** إنشاء نسخة احتياطية — يفتح حوار الحفظ في العملية الرئيسية. */
  backupCreate: (): Promise<{
    success: boolean;
    canceled?: boolean;
    path?: string;
    sizeBytes?: number;
    error?: string;
  }> => ipcRenderer.invoke('backup:create'),

  /**
   * استعادة قاعدة البيانات من ملف .db خارجي.
   * ينشئ نسخة أمان تلقائية قبل الاستعادة ويوقف الخادم الخلفي.
   */
  backupRestore: (sourcePath: string): Promise<{
    success: boolean;
    requiresRestart?: boolean;
    autoBackupPath?: string;
    sizeBytes?: number;
    error?: string;
  }> => ipcRenderer.invoke('backup:restore', sourcePath),

  /** إرجاع معلومات مسار قاعدة البيانات الحالية. */
  getDbPath: (): Promise<{
    dir: string;
    backupDir: string;
    exists: boolean;
    sizeBytes: number;
    isDev: boolean;
  }> => ipcRenderer.invoke('backup:getDatabasePath'),

  /** إرسال توكن الجلسة إلى العملية الرئيسية للتحقق منه عبر Backend. */
  setSessionToken: (token: string | null): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('session:setToken', token),

  /** إعادة قراءة إعدادات النسخ التلقائي وتطبيقها على الجدولة. */
  backupReconfigure: (): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('backup:reconfigure'),

  /** تصدير الصفحة الحالية كملف PDF — يفتح حوار الحفظ في العملية الرئيسية. */
  exportPdf: (suggestedName: string): Promise<{
    success: boolean;
    canceled?: boolean;
    path?: string;
    sizeBytes?: number;
    error?: string;
  }> => ipcRenderer.invoke('pdf:export', suggestedName),

  /** تصدير HTML كـ PDF عبر Chromium (يُستخدم للتقارير العربية). */
  exportPdfFromHtml: (
    html: string,
    suggestedName: string,
  ): Promise<{
    success: boolean;
    canceled?: boolean;
    path?: string;
    sizeBytes?: number;
    error?: string;
  }> => ipcRenderer.invoke('pdf:exportHtml', html, suggestedName),

  /** فتح مربع حوار اختيار ملف للإرفاق — يُعيد المسار أو null إذا ألغى المستخدم. */
  openFileDialog: (): Promise<string | null> =>
    ipcRenderer.invoke('attachments:openFileDialog'),

  /** فتح ملف مرفق بالتطبيق الافتراضي للنظام — يُعيد null عند النجاح أو رسالة الخطأ. */
  openAttachment: (filePath: string): Promise<string | null> =>
    ipcRenderer.invoke('attachments:openPath', filePath),

  // ─── Print Center Foundation v1 (additive — printPage/exportPdf above unchanged) ──

  /** بوابة الطباعة الموحّدة — تُرسل أمر طباعة مُهيكل إلى العملية الرئيسية. */
  printSubmit: (job: unknown): Promise<{
    status: 'printed' | 'exported' | 'canceled' | 'failed';
    filePath?: string;
    sizeBytes?: number;
    error?: string;
  }> => ipcRenderer.invoke('print:submit', job),

  /** قائمة الطابعات المتاحة في النظام (لا واجهة تستهلكها بعد — أساس المرحلة القادمة). */
  listPrinters: (): Promise<
    Array<{ name: string; displayName: string; description: string; isDefault: boolean; status: number }>
  > => ipcRenderer.invoke('print:listPrinters'),

  // ─── Print Center Phase 2 — معاينة PDF ────────────────────────────────────────

  /** توليد معاينة PDF من مستند مُركّب — تُعيد نفس البايتات التي ستُحفظ لاحقًا. */
  printPreview: (request: unknown): Promise<
    | { ok: true; token: string; pageCount: number; sizeBytes: number; data: Uint8Array }
    | { ok: false; error: string }
  > => ipcRenderer.invoke('print:preview', request),

  /** حفظ ملف PDF من معاينة مُولّدة مسبقًا (نفس البايتات — لا إعادة توليد). */
  printSavePdf: (args: { token: string; suggestedFileName?: string }): Promise<{
    status: 'exported' | 'canceled' | 'failed';
    sizeBytes?: number;
    error?: string;
  }> => ipcRenderer.invoke('print:savePdf', args),

  /** تحرير موارد المعاينة. */
  printReleasePreview: (args: { token: string }): Promise<{ released: boolean }> =>
    ipcRenderer.invoke('print:releasePreview', args),
};

contextBridge.exposeInMainWorld('manar', api);

export type ManarApi = typeof api;
