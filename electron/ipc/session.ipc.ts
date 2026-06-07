import { ipcMain, app } from 'electron';

export interface ElectronSession {
  userId: number;
  username: string;
  roleName: string;
  permissions: string[];
}

let currentSession: ElectronSession | null = null;

export function getSession(): ElectronSession | null {
  return currentSession;
}

/**
 * تحقق من صلاحية في العملية الرئيسية.
 * SYSTEM_ADMIN يتجاوز الفحص دائمًا.
 * في بيئة التطوير بدون جلسة: يُسمح (first-run/dev fallback).
 * في الإنتاج بدون جلسة: يُرفض.
 * TODO: ربط هذا بجلسة تسجيل دخول حقيقية مستمرة عبر Electron session store
 */
export function hasSessionPermission(perm: string): boolean {
  if (!currentSession) {
    return !app.isPackaged; // dev: allow, prod: deny
  }
  if (currentSession.roleName === 'SYSTEM_ADMIN') return true;
  return currentSession.permissions.includes(perm);
}

export function registerSessionIpc() {
  ipcMain.handle('session:setUser', (_e, session: ElectronSession | null) => {
    currentSession = session;
    // eslint-disable-next-line no-console
    console.log(`[session] المستخدم الحالي: ${session ? `${session.username} (${session.roleName})` : 'لا أحد'}`);
    return { ok: true };
  });
}
