import { BrowserWindow, app, dialog, ipcMain, shell } from 'electron';
import fs from 'fs';
import path from 'path';

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.docx', '.jpg', '.jpeg', '.png', '.gif', '.webp']);

function getAttachmentsDir(): string {
  return process.env.ATTACHMENTS_DIR ?? path.join(app.getPath('userData'), 'data', 'attachments');
}

export function registerAttachmentsIpc() {
  ipcMain.handle('attachments:openFileDialog', async () => {
    const win = BrowserWindow.getFocusedWindow();
    const result = await dialog.showOpenDialog(win!, {
      title: 'اختر ملفًا للإرفاق',
      properties: ['openFile'],
      filters: [
        { name: 'Documents & Images', extensions: ['pdf', 'docx', 'jpg', 'jpeg', 'png', 'gif', 'webp'] },
      ],
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });

  ipcMain.handle('attachments:openPath', async (_e, filePath: string) => {
    const resolved = path.resolve(String(filePath));
    const attachDir = path.resolve(getAttachmentsDir());

    // Must be within ATTACHMENTS_DIR
    if (!resolved.startsWith(attachDir + path.sep) && resolved !== attachDir) {
      return 'not allowed: path outside attachments directory';
    }

    // Must have an allowed extension
    if (!ALLOWED_EXTENSIONS.has(path.extname(resolved).toLowerCase())) {
      return 'not allowed: file type not permitted';
    }

    // Must exist as a regular file
    try {
      const stat = fs.statSync(resolved);
      if (!stat.isFile()) return 'not allowed: not a regular file';
    } catch {
      return 'file not found';
    }

    const err = await shell.openPath(resolved);
    return err || null; // null = success, string = error message
  });
}
