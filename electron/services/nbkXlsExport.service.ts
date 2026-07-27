/**
 * NBK Salary Export — Native XLS Generation v1.
 *
 * Replaces SheetJS as the FINAL writer for the NBK bank salary export ONLY. SheetJS's
 * BIFF8/XLS writer (used everywhere else the app produces .xls) was proven — by a
 * manual Microsoft Excel A/B test against a native-Excel-COM control file — to trigger
 * Office File Validation's Protected View warning ("Office has detected a problem with
 * this file..."), regardless of input quality. Native Excel COM automation does not.
 *
 * Ownership / safety: `New-Object -ComObject Excel.Application` inside the PowerShell
 * script always creates a brand-new COM server process — it never attaches to an
 * existing interactive Excel session, and the script never enumerates or kills Excel
 * by process name. This module's own timeout only ever terminates the `powershell.exe`
 * child it spawned — never any Excel process.
 */
import { app } from 'electron';
import { execFile, ExecFileException } from 'child_process';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { getUserDataPaths } from './backendLauncher';
import {
  buildNbkExportPayload,
  parseNbkExportResultFile,
  NBK_EXPORT_MESSAGES,
  NbkExportSheetInput,
  NbkExportOutcome,
} from './nbkXlsExport.pure';

const GENERATION_TIMEOUT_MS = 45_000;

export type NbkExportResult =
  | { bytes: Buffer }
  | { errorCode: string; errorMessage: string };

function resolveAssetPath(fileName: string): string {
  const { backendCwd } = getUserDataPaths();
  return path.join(backendCwd, 'assets', 'nbk-export', fileName);
}

/**
 * Generates the NBK salary .xls through native Microsoft Excel COM automation.
 * `sheets` is exactly what the existing validated payroll bank-export engine
 * returned (`PayrollBankExportResult.sheets`) — this function does not re-derive
 * rows, serials, or eligibility; it only serializes what it is given.
 */
export async function generateNbkSalaryXls(sheets: NbkExportSheetInput[]): Promise<NbkExportResult> {
  const templatePath = resolveAssetPath('NBK_Salary_Native_Template.xls');
  const scriptPath = resolveAssetPath('generate-nbk-xls.ps1');

  if (!fs.existsSync(scriptPath)) {
    // eslint-disable-next-line no-console
    console.error('[nbkExport] generator script missing on disk');
    return { errorCode: 'TEMPLATE_MISSING', errorMessage: NBK_EXPORT_MESSAGES.TEMPLATE_MISSING };
  }
  if (!fs.existsSync(templatePath)) {
    // eslint-disable-next-line no-console
    console.error('[nbkExport] canonical template missing on disk');
    return { errorCode: 'TEMPLATE_MISSING', errorMessage: NBK_EXPORT_MESSAGES.TEMPLATE_MISSING };
  }

  const rowCount = sheets.find((s) => s.name === 'Salary Details')?.rows.length ?? 0;
  const startedAt = Date.now();
  // eslint-disable-next-line no-console
  console.log(`[nbkExport] started rows=${rowCount}`);

  const workDir = path.join(app.getPath('temp'), `manar-nbk-export-${randomUUID()}`);
  fs.mkdirSync(workDir, { recursive: true });

  try {
    // Isolated working copy — the shipped canonical template on disk is never opened directly.
    const workingTemplate = path.join(workDir, 'template.xls');
    const outputPath = path.join(workDir, 'output.xls');
    const payloadPath = path.join(workDir, 'payload.json');
    const resultPath = path.join(workDir, 'result.json');

    fs.copyFileSync(templatePath, workingTemplate);

    let payload;
    try {
      payload = buildNbkExportPayload(workingTemplate, outputPath, sheets);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[nbkExport] payload build failed:', err instanceof Error ? err.message : String(err));
      return { errorCode: 'TEMPLATE_STRUCTURE_INVALID', errorMessage: NBK_EXPORT_MESSAGES.TEMPLATE_STRUCTURE_INVALID };
    }
    fs.writeFileSync(payloadPath, JSON.stringify(payload), 'utf8');

    const outcome = await runPowerShellWriter(scriptPath, payloadPath, resultPath);

    if (!outcome.ok) {
      // eslint-disable-next-line no-console
      console.error(`[nbkExport] failed code=${outcome.code} durationMs=${Date.now() - startedAt}`);
      return { errorCode: outcome.code, errorMessage: outcome.message };
    }

    const bytes = fs.readFileSync(outcome.path);
    // eslint-disable-next-line no-console
    console.log(`[nbkExport] success sizeBytes=${bytes.length} rowCount=${outcome.rowCount} durationMs=${Date.now() - startedAt}`);
    return { bytes };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[nbkExport] unexpected error:', err instanceof Error ? err.message : String(err));
    return { errorCode: 'GENERATION_FAILED', errorMessage: NBK_EXPORT_MESSAGES.GENERATION_FAILED };
  } finally {
    // Best-effort cleanup — this directory briefly held salary/employee data.
    fs.rm(workDir, { recursive: true, force: true }, () => { /* best-effort */ });
  }
}

/** Spawns the isolated PowerShell/Excel-COM writer with a bounded timeout. On
 *  timeout only the `powershell.exe` child is terminated — never Excel itself
 *  (the script's own try/finally is what closes/quits Excel on every path). */
function runPowerShellWriter(scriptPath: string, payloadPath: string, resultPath: string): Promise<NbkExportOutcome> {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy', 'Bypass',
        '-File', scriptPath,
        '-PayloadPath', payloadPath,
        '-ResultPath', resultPath,
      ],
      { timeout: GENERATION_TIMEOUT_MS, windowsHide: true },
      (error, _stdout, stderr) => {
        let raw: string | null = null;
        try {
          raw = fs.readFileSync(resultPath, 'utf8');
        } catch {
          // The script did not get far enough to write a result file.
        }

        if (raw == null) {
          const timedOut = !!error && (error as ExecFileException).killed === true;
          if (stderr) {
            // eslint-disable-next-line no-console
            console.error('[nbkExport] powershell stderr (truncated):', stderr.slice(0, 300));
          }
          resolve(
            timedOut
              ? { ok: false, code: 'TIMEOUT', message: NBK_EXPORT_MESSAGES.TIMEOUT }
              : { ok: false, code: 'GENERATION_FAILED', message: NBK_EXPORT_MESSAGES.GENERATION_FAILED },
          );
          return;
        }
        resolve(parseNbkExportResultFile(raw));
      },
    );
  });
}
