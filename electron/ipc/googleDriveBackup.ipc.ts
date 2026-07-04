// Google Drive Backup IPC (Electron main) — Phase 1 scaffold.
//
// This is where OAuth + the real Drive upload will live in Phase 2 (using
// google-auth-library + Drive REST). Phase 1 wires the channels and the secure
// token store; `connect`/`test`/`uploadLatest` clearly report that OAuth setup
// is pending, while `disconnect`/`status` are already functional.

import { ipcMain, shell } from 'electron';
import { hasSessionPermission } from './session.ipc';
import { hasToken, clearToken, isSecureStorageAvailable } from '../services/googleDrive/tokenStore';

const PHASE2_MSG = 'يتطلب رفع Google Drive إكمال إعداد OAuth (المرحلة 2): مشروع Google Cloud + اعتماد سطح المكتب';

export function registerGoogleDriveIpc(): void {
  // Current local status — safe to expose; contains no token.
  ipcMain.handle('googleDrive:status', () => ({
    secureStorageAvailable: isSecureStorageAvailable(),
    hasToken: hasToken(),
    oauthConfigured: false, // real OAuth client not wired yet (Phase 2)
  }));

  // Begin OAuth — pending Phase 2. Never fabricates a connection.
  ipcMain.handle('googleDrive:connect', () => ({
    ok: false,
    needsSetup: true,
    message: PHASE2_MSG,
  }));

  // Disconnect / revoke locally — deletes the encrypted token if present.
  ipcMain.handle('googleDrive:disconnect', () => {
    if (!hasSessionPermission('backups.update')) {
      return { ok: false, error: 'ليست لديك صلاحية' };
    }
    return { ok: clearToken().ok };
  });

  ipcMain.handle('googleDrive:test', () => ({
    connected: false,
    oauthConfigured: false,
    message: 'لم يُعدّ الاتصال بعد',
  }));

  // Upload latest — pending Phase 2 (real upload needs the OAuth token).
  ipcMain.handle('googleDrive:uploadLatest', () => {
    if (!hasSessionPermission('backups.create')) {
      return { ok: false, error: 'ليست لديك صلاحية' };
    }
    return { ok: false, needsSetup: true, message: PHASE2_MSG };
  });

  // Open the Drive folder (or My Drive) in the system browser.
  ipcMain.handle('googleDrive:openFolder', (_e, folderId?: string) => {
    const url = folderId
      ? `https://drive.google.com/drive/folders/${folderId}`
      : 'https://drive.google.com/drive/my-drive';
    void shell.openExternal(url);
    return { ok: true };
  });
}
