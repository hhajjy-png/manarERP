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
};

contextBridge.exposeInMainWorld('manar', api);

export type ManarApi = typeof api;
