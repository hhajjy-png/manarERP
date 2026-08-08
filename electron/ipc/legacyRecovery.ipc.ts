import { ipcMain, app } from 'electron';
import { scanLegacyChequeTemplates } from '../services/legacyTemplateRecovery';
import type { RecoveryScanResult } from '../services/legacyTemplateRecovery';

/**
 * Legacy Cheque Template Recovery Pack v1 — IPC surface.
 *
 * Exposes a single READ-ONLY channel. The renderer asks whether any cheque
 * designer templates are recoverable from a previous `userData` folder; the
 * main process answers with whatever it found and where. The renderer then
 * hands the payload to the ordinary backend import endpoint, which is what
 * enforces the "only once, only into an empty database" rules — this channel
 * decides nothing and writes nothing.
 *
 * The scan is confined to the Electron `appData` root, so nothing outside the
 * per-user application-data area is ever read, and the channel returns no file
 * contents other than the one storage key it is looking for.
 */
export function registerLegacyRecoveryIpc(): void {
  ipcMain.handle('legacyTemplates:scan', async (): Promise<RecoveryScanResult> => {
    try {
      return scanLegacyChequeTemplates(app.getPath('appData'));
    } catch (err) {
      // A scan failure is never allowed to surface as a rejected invoke: the
      // renderer treats "nothing to recover" and "could not look" identically,
      // and neither may interrupt ordinary use of the application.
      return { found: null, inspected: [{ path: '(appData)', outcome: `error:${(err as Error).message}` }] };
    }
  });
}
