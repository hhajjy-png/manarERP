import { BrowserWindow, dialog, ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';

export function registerPdfIpc() {
  ipcMain.handle('pdf:export', async (event, suggestedName: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) {
      return { success: false, error: 'تعذّر الوصول إلى نافذة التطبيق' };
    }

    const safeDefault = suggestedName ? `${suggestedName}.pdf` : 'document.pdf';

    const saveResult = await dialog.showSaveDialog(win, {
      title: 'حفظ PDF',
      defaultPath: safeDefault,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });

    if (saveResult.canceled || !saveResult.filePath) {
      return { success: false, canceled: true };
    }

    const filePath = saveResult.filePath;

    try {
      const pdfBuffer = await win.webContents.printToPDF({
        pageSize: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
      });

      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      await fs.promises.writeFile(filePath, pdfBuffer);

      const { size } = fs.statSync(filePath);
      // eslint-disable-next-line no-console
      console.log(`[pdf:export] تم الحفظ: ${filePath} (${size} بايت)`);
      return { success: true, path: filePath, sizeBytes: size };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[pdf:export] خطأ:', err);
      return {
        success: false,
        error: `فشل تصدير PDF: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  });
}
