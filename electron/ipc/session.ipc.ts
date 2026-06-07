import { ipcMain, app } from 'electron';

/**
 * الجلسة المُتحقَّق منها — تُملأ فقط بعد نجاح /api/auth/me في Backend.
 * لا يُقبل أي حقل من Renderer مباشرة.
 */
interface VerifiedSession {
  userId: number;
  username: string;
  roleName: string;
  permissions: string[];
}

const BACKEND_BASE = 'http://127.0.0.1:48211';

let currentSession: VerifiedSession | null = null;

/**
 * يتحقق من صلاحية معينة بالاعتماد على الجلسة التي تحقق منها Main Process فقط.
 * في التطوير بدون جلسة: يُسمح. في الإنتاج بدون جلسة: يُرفض.
 */
export function hasSessionPermission(perm: string): boolean {
  if (!currentSession) {
    return !app.isPackaged;
  }
  if (currentSession.roleName === 'SYSTEM_ADMIN') return true;
  return currentSession.permissions.includes(perm);
}

/**
 * يتصل بـ /api/auth/me مع توكن الجلسة للتحقق منه والحصول على بيانات المستخدم.
 * لا يُستخدم أي بيانات قادمة من Renderer.
 */
async function fetchVerifiedSession(token: string): Promise<VerifiedSession | null> {
  try {
    const res = await fetch(`${BACKEND_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;

    const body = (await res.json()) as {
      data: {
        id: number;
        username: string;
        role: { name: string };
        permissions: string[];
      };
    };
    const u = body.data;
    return {
      userId: u.id,
      username: u.username,
      roleName: u.role.name,
      permissions: u.permissions,
    };
  } catch {
    return null;
  }
}

export function registerSessionIpc() {
  /**
   * session:setToken — Renderer يرسل التوكن فقط.
   * Main Process يتحقق منه عبر Backend ويخزن الجلسة بنفسه.
   * لا يُقبل أي حقل آخر (permissions, roleName, userId).
   */
  ipcMain.handle('session:setToken', async (_e, token: string | null) => {
    if (!token) {
      currentSession = null;
      if (!app.isPackaged) {
        // eslint-disable-next-line no-console
        console.log('[session] تم مسح الجلسة');
      }
      return { ok: true };
    }

    const session = await fetchVerifiedSession(token);

    if (session) {
      currentSession = session;
      if (!app.isPackaged) {
        // eslint-disable-next-line no-console
        console.log(`[session] تم التحقق: ${session.username} (${session.roleName})`);
      }
    } else {
      currentSession = null;
      if (!app.isPackaged) {
        // eslint-disable-next-line no-console
        console.warn('[session] فشل التحقق من التوكن — تم إلغاء الجلسة');
      }
    }

    return { ok: !!session };
  });
}
