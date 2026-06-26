import { BrowserWindow, dialog, ipcMain, shell } from 'electron';

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
    const err = await shell.openPath(filePath);
    return err || null; // null = success, string = error message
  });
}
