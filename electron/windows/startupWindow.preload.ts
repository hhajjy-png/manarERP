import { contextBridge, ipcRenderer } from 'electron';
import type { StartupProgressEvent } from '../services/startupProgressBus';

/**
 * Production Startup Pack v1 — جسر نافذة بدء التشغيل.
 *
 * أضيق سطح ممكن: استقبال أحداث التقدّم، وزرّ واحد للإغلاق يظهر **عند الفشل فقط**.
 * منفصل عن `preload.ts` الرئيسي عمدًا — هذه النافذة تعمل قبل وجود أي خدمة خلفية
 * أو جلسة أو واجهة React، فلا يجوز أن تحمل أي اعتماد عليها.
 */
contextBridge.exposeInMainWorld('startupProgress', {
  onUpdate: (callback: (event: StartupProgressEvent) => void): void => {
    ipcRenderer.on('startup-progress:update', (_e, payload: StartupProgressEvent) => callback(payload));
  },
  /** يُستدعى من زرّ «إغلاق» في حالة الفشل — إنهاء صريح بطلب المستخدم، لا إنهاء صامت. */
  quit: (): void => {
    ipcRenderer.send('startup-progress:quit');
  },
});
