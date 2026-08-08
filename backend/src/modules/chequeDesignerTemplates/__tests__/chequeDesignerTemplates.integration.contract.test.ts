import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Cheque Template Persistence Migration Pack v1 — integration CONTRACT suite.
 *
 * The requirement is that cheque designer templates now travel with local
 * backup, restore, Google Drive sync, the production build and any move to a
 * new machine "with no additional code". That claim is only true because all of
 * those paths operate on the DATABASE FILE as a whole rather than on a list of
 * tables — which is precisely what makes it a claim worth pinning: the day
 * someone converts backup or sync to a per-table export, cheque templates would
 * silently fall out again and nothing else would notice.
 *
 * These tests read the real source files and assert on the structural facts the
 * guarantee rests on. They intentionally do not run a backup: the point is the
 * ABSENCE of a table allow-list anywhere in the chain.
 */

const REPO = path.resolve(__dirname, '../../../../..');

function read(relative: string): string {
  return fs.readFileSync(path.join(REPO, relative), 'utf8');
}

describe('the templates table is part of the database, so it is part of everything that moves the database', () => {
  it('is declared in the Prisma schema and therefore lives inside manar.db', () => {
    const schema = read('backend/prisma/schema.prisma');
    expect(schema).toContain('model ChequeDesignerTemplate');
    expect(schema).toContain('@@map("cheque_designer_templates")');
  });

  it('has a migration, so an existing installation gains the table on upgrade', () => {
    const dir = path.join(REPO, 'backend/prisma/migrations');
    const migration = fs
      .readdirSync(dir)
      .filter((d) => d.includes('cheque_designer_templates'))
      .map((d) => fs.readFileSync(path.join(dir, d, 'migration.sql'), 'utf8'))
      .join('\n');
    expect(migration).toContain('CREATE TABLE "cheque_designer_templates"');
  });

  it('backup copies the whole database file — no table allow-list to fall out of', () => {
    const backup = read('backend/src/shared/services/backup.service.ts');
    expect(backup).toContain('fs.copyFileSync(dbPath, filePath)');
    expect(backup).not.toMatch(/tables\s*[:=]\s*\[/);
  });

  it('restore replaces the whole database file', () => {
    const backup = read('backend/src/shared/services/backup.service.ts');
    // الحقيقة المحمية هنا هي «ملف كامل يحلّ محلّ ملف كامل»، لا اسم المتغيّر الذي
    // يحمل المصدر. Zero Data Loss Certification Pack v1 غيّر المصدر من العمود
    // المخزَّن `backup.filePath` إلى المسار المشتقّ `resolveBackupFile(...)` كي تبقى
    // النسخ قابلة للاستعادة بعد انتقال مجلد البيانات — وهو **تقوية** لنفس الضمانة
    // التي يحرسها هذا الاختبار، لا تراجع عنها. لذلك يُثبَّت الوجهة (`dbPath`) ومصدر
    // المسار (`resolveBackupFile`)، ويُترك اسم المتغيّر الوسيط حرًّا.
    expect(backup).toMatch(/fs\.copyFileSync\(\s*\w+\s*,\s*dbPath\s*\)/);
    expect(backup).toContain('this.resolveBackupFile(backup)');
    expect(backup).not.toMatch(/tables\s*[:=]\s*\[/);
  });

  it('export to an external path — moving to a new machine — copies the whole file', () => {
    const backup = read('backend/src/shared/services/backup.service.ts');
    expect(backup).toContain('fs.copyFileSync(dbPath, targetPath)');
  });

  it('Google Drive sync moves manar.db itself', () => {
    const drive = read('electron/services/googleDriveApi.service.ts');
    expect(drive).toContain("const SYNC_FILE_NAME = 'manar.db'");
  });

  it('the packaged app stores the database under userData, which the installer preserves', () => {
    const launcher = read('electron/services/backendLauncher.ts');
    expect(launcher).toContain("path.join(app.getPath('userData'), 'data')");
    const builder = read('electron-builder.yml');
    expect(builder).toContain('deleteAppDataOnUninstall: false');
  });
});

describe('browser storage is no longer a copy of the templates', () => {
  const STORE = 'frontend/src/components/chequeTemplateManager/chequeDesignerStore.ts';

  it('the store never writes templates to localStorage', () => {
    const source = read(STORE);
    expect(source).not.toContain('localStorage.setItem');
  });

  it('the only localStorage access left is the one-time read and the cleanup that follows it', () => {
    const source = read(STORE);
    const accesses = source.match(/localStorage\.\w+/g) ?? [];
    expect(new Set(accesses)).toEqual(new Set(['localStorage.getItem', 'localStorage.removeItem']));
  });

  it('every read and write goes through the database endpoint', () => {
    const source = read(STORE);
    expect(source).toContain("const BASE = '/cheque-designer-templates'");
    for (const call of ['api.get(', 'api.post(', 'api.put(', 'api.patch(', 'api.delete(']) {
      expect(source).toContain(call);
    }
  });

  it('production cheque printing resolves its template through the database store', () => {
    const page = read('frontend/src/pages/Cheques.tsx');
    expect(page).toContain("from '../components/chequeTemplateManager/chequeDesignerStore'");
    expect(page).toContain('await loadDefaultTemplate()');
    expect(page).toContain('resolveDefaultPrintTemplate(loaded.get)');
  });
});

/**
 * Legacy Cheque Template Recovery Pack v1 — wiring contract.
 *
 * Recovery only ever runs if all three links exist: the main process registers
 * the scan handler, the preload bridges it, and the store calls it. Any one of
 * them going missing turns recovery into a silent no-op that no functional test
 * would notice, because "found nothing" is a perfectly normal outcome.
 */
describe('legacy recovery is wired end to end', () => {
  it('the main process registers the read-only scan handler at startup', () => {
    const main = read('electron/main.ts');
    expect(main).toContain("import { registerLegacyRecoveryIpc } from './ipc/legacyRecovery.ipc'");
    expect(main).toContain('registerLegacyRecoveryIpc();');
  });

  it('the preload bridges the scan to the renderer', () => {
    const preload = read('electron/preload.ts');
    expect(preload).toContain('scanLegacyChequeTemplates');
    expect(preload).toContain("ipcRenderer.invoke('legacyTemplates:scan')");
  });

  it('the IPC handler answers the same channel the preload invokes', () => {
    const ipc = read('electron/ipc/legacyRecovery.ipc.ts');
    expect(ipc).toContain("ipcMain.handle('legacyTemplates:scan'");
  });

  it('the store calls the bridge and posts to the recovery endpoint', () => {
    const store = read('frontend/src/components/chequeTemplateManager/chequeDesignerStore.ts');
    expect(store).toContain('scanLegacyChequeTemplates');
    expect(store).toContain('`${BASE}/legacy-recovery`');
  });

  it('the recovery endpoint exists and is gated like every other template write', () => {
    const routes = read('backend/src/modules/chequeDesignerTemplates/chequeDesignerTemplates.routes.ts');
    expect(routes).toMatch(/router\.get\('\/legacy-recovery', requirePermission\('cheques\.read'\)/);
    expect(routes).toMatch(/router\.post\('\/legacy-recovery', requirePermission\('settings\.update'\)/);
  });

  it('the scanner never writes: no fs write API appears in it', () => {
    const scanner = read('electron/services/legacyTemplateRecovery.ts');
    for (const forbidden of ['writeFile', 'appendFile', 'unlink', 'rm(', 'rmSync', 'mkdir', 'rename', 'openSync', 'createWriteStream']) {
      expect(scanner).not.toContain(forbidden);
    }
  });

  it('the LevelDB reader never writes either', () => {
    const reader = read('electron/services/legacyLevelDb.pure.ts');
    expect(reader).not.toContain('require(');
    for (const forbidden of ['writeFile', 'appendFile', 'unlink', 'rmSync', 'mkdir']) {
      expect(reader).not.toContain(forbidden);
    }
  });

  it('recovery keeps its own durable marker, distinct from the migration marker', () => {
    const service = read('backend/src/modules/chequeDesignerTemplates/chequeDesignerTemplates.service.ts');
    expect(service).toContain("LEGACY_RECOVERY_MARKER_KEY = 'chequeDesigner.legacyRecovery.v1'");
    expect(service).toContain("LEGACY_IMPORT_MARKER_KEY = 'chequeDesigner.localStorageImport.v1'");
  });
});
