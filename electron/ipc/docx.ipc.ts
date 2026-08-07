import { BrowserWindow, dialog, ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';

/**
 * Word (.docx) export IPC (Form Editor UX Rebuild v2).
 *
 * Unlike `pdf:exportHtml`, the renderer hands over the FINISHED file bytes — the
 * `docx` package builds the whole .docx client-side from the letter's Block Model (see
 * `components/letters/studio/docxExport.ts`), so there is nothing left to render here.
 * This handler's only job is the one thing the renderer cannot do itself: show the
 * native save dialog and write the bytes where the user chose, exactly as
 * `pdf:exportHtml` does for PDF.
 */
export function registerDocxIpc() {
  ipcMain.handle('docx:export', async (event, bytes: Uint8Array, suggestedName: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return { success: false, error: 'تعذّر الوصول إلى نافذة التطبيق' };

    const safeDefault = suggestedName
      ? (suggestedName.toLowerCase().endsWith('.docx') ? suggestedName : `${suggestedName}.docx`)
      : 'document.docx';

    const saveResult = await dialog.showSaveDialog(win, {
      title: 'حفظ ملف Word',
      defaultPath: safeDefault,
      filters: [{ name: 'Word', extensions: ['docx'] }],
    });

    if (saveResult.canceled || !saveResult.filePath) {
      return { success: false, canceled: true };
    }

    const filePath = saveResult.filePath;

    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      await fs.promises.writeFile(filePath, bytes);

      const { size } = fs.statSync(filePath);
      // eslint-disable-next-line no-console
      console.log(`[docx:export] تم الحفظ: ${filePath} (${size} بايت)`);
      return { success: true, path: filePath, sizeBytes: size };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[docx:export] خطأ:', err);
      return {
        success: false,
        error: `فشل حفظ ملف Word: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  });
}
