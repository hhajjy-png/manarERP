import { ipcMain } from 'electron';
import { generateNbkSalaryXls } from '../services/nbkXlsExport.service';
import type { NbkExportSheetInput } from '../services/nbkXlsExport.pure';
import { hasSessionPermission } from './session.ipc';

/**
 * NBK Salary Export — Native XLS Generation v1.
 *
 * `sheets` is exactly `PayrollBankExportResult.sheets` from the existing, already
 * validated payroll bank-export preview — this handler does not re-validate payroll
 * business rules, it only forwards to the native Excel COM writer (see
 * nbkXlsExport.service.ts) and reports success/failure. On failure it NEVER falls
 * back to producing a SheetJS-serialized .xls — that path is proven (manual Excel
 * A/B test) to trigger Office File Validation's Protected View warning.
 */
export function registerNbkExportIpc() {
  ipcMain.handle('nbkExport:generateXls', async (_e, sheets: NbkExportSheetInput[]) => {
    if (!hasSessionPermission('payroll.read')) {
      return { success: false, error: 'ليست لديك صلاحية لتصدير ملف الرواتب البنكي' };
    }
    if (!Array.isArray(sheets)) {
      return { success: false, error: 'بيانات التصدير غير صالحة' };
    }

    const result = await generateNbkSalaryXls(sheets);

    if ('errorCode' in result) {
      return { success: false, error: result.errorMessage, errorCode: result.errorCode };
    }
    return { success: true, bytes: new Uint8Array(result.bytes) };
  });
}
