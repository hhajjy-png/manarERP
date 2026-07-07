import { BrowserWindow, dialog, ipcMain, app } from 'electron';
import fs from 'fs';
import path from 'path';

export function registerPdfIpc() {
  ipcMain.handle('pdf:exportHtml', async (event, html: string, suggestedName: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return { success: false, error: 'تعذّر الوصول إلى نافذة التطبيق' };

    const safeDefault = suggestedName
      ? (suggestedName.toLowerCase().endsWith('.pdf') ? suggestedName : `${suggestedName}.pdf`)
      : 'report.pdf';

    const saveResult = await dialog.showSaveDialog(win, {
      title:      'حفظ PDF',
      defaultPath: safeDefault,
      filters:    [{ name: 'PDF', extensions: ['pdf'] }],
    });

    if (saveResult.canceled || !saveResult.filePath) {
      return { success: false, canceled: true };
    }

    const filePath  = saveResult.filePath;
    const tmpPath   = path.join(app.getPath('temp'), `manar-report-${Date.now()}.html`);
    let   hiddenWin: BrowserWindow | null = null;

    try {
      await fs.promises.writeFile(tmpPath, html, 'utf-8');

      hiddenWin = new BrowserWindow({
        show: false,
        webPreferences: {
          nodeIntegration:  false,
          contextIsolation: true,
          sandbox:          true,
        },
      });

      await hiddenWin.loadFile(tmpPath);
      await new Promise<void>((resolve) => setTimeout(resolve, 400));

      const pdfBuffer = await hiddenWin.webContents.printToPDF({
        printBackground:   true,
        preferCSSPageSize: true,
      });

      hiddenWin.close();
      hiddenWin = null;
      await fs.promises.unlink(tmpPath).catch(() => {});

      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      await fs.promises.writeFile(filePath, pdfBuffer);

      const { size } = fs.statSync(filePath);
      // eslint-disable-next-line no-console
      console.log(`[pdf:exportHtml] تم الحفظ: ${filePath} (${size} بايت)`);
      return { success: true, path: filePath, sizeBytes: size };
    } catch (err) {
      hiddenWin?.close();
      await fs.promises.unlink(tmpPath).catch(() => {});
      // eslint-disable-next-line no-console
      console.error('[pdf:exportHtml] خطأ:', err);
      return {
        success: false,
        error: `فشل تصدير PDF: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  });

  ipcMain.handle('pdf:export', async (event, suggestedName: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) {
      return { success: false, error: 'تعذّر الوصول إلى نافذة التطبيق' };
    }

    const safeDefault = suggestedName
      ? (suggestedName.toLowerCase().endsWith('.pdf') ? suggestedName : `${suggestedName}.pdf`)
      : 'document.pdf';

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
