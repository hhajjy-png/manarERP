import { Router } from 'express';
import { prisma } from '../../config/database';
import { backupService } from '../../shared/services/backup.service';
import { authenticate } from '../../core/middleware/auth.middleware';
import { requirePermission } from '../../core/middleware/rbac.middleware';
import { asyncHandler } from '../../core/utils/asyncHandler';
import { ok } from '../../core/utils/response';
import { AppError } from '../../core/errors/AppError';
import { readConfig, writeConfig } from './googleDriveBackup.config';
import { GD_FOLDER_NAME } from './googleDriveBackup.types';
import { activeDriveProvider, uploadBackupFile, buildBackupMeta } from './googleDriveBackup.service';
import { UpdateConfigSchema } from './googleDriveBackup.schema';

const router = Router();
router.use(authenticate);

const bool = (v: boolean): string => (v ? 'true' : 'false');

// ── Status ──────────────────────────────────────────────────────────────────
router.get(
  '/status',
  requirePermission('backups.read'),
  asyncHandler(async (_req, res) => {
    ok(res, {
      config: await readConfig(),
      providerConfigured: activeDriveProvider.configured,
      folderName: GD_FOLDER_NAME,
    });
  }),
);

// ── Update toggles ──────────────────────────────────────────────────────────
router.put(
  '/config',
  requirePermission('backups.update'),
  asyncHandler(async (req, res) => {
    const parsed = UpdateConfigSchema.safeParse(req.body);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0]?.message ?? 'إعدادات غير صحيحة');
    const patch: Partial<Record<'enabled' | 'uploadAfterManualBackup' | 'uploadAfterAutoBackup', string>> = {};
    if (parsed.data.enabled !== undefined) patch.enabled = bool(parsed.data.enabled);
    if (parsed.data.uploadAfterManualBackup !== undefined) patch.uploadAfterManualBackup = bool(parsed.data.uploadAfterManualBackup);
    if (parsed.data.uploadAfterAutoBackup !== undefined) patch.uploadAfterAutoBackup = bool(parsed.data.uploadAfterAutoBackup);
    await writeConfig(patch, req);
    ok(res, await readConfig());
  }),
);

// ── Test connection ─────────────────────────────────────────────────────────
router.post(
  '/test',
  requirePermission('backups.create'),
  asyncHandler(async (_req, res) => {
    ok(res, {
      connected: await activeDriveProvider.isConnected(),
      configured: activeDriveProvider.configured,
    });
  }),
);

// ── Disconnect (clears server-side flags; Electron clears the token separately) ─
// Same permission as the config mutation + the Electron `googleDrive:disconnect`
// IPC (backups.update) so a role can't get a split-brain half-disconnect.
router.post(
  '/disconnect',
  requirePermission('backups.update'),
  asyncHandler(async (req, res) => {
    await writeConfig({ connected: 'false', folderId: '' }, req);
    ok(res, await readConfig());
  }),
);

// ── Upload the latest local backup to Drive ─────────────────────────────────
// Uploads an existing, verified backup FILE (never the live DB). Cloud failure
// is reported, not thrown — it never affects local backups.
//
// PHASE-2 SEAM: with the real provider the OAuth token lives in Electron
// `safeStorage` (main-process only), so the actual `provider.uploadBackup` call
// moves to Electron main. This route keeps the backend-only halves it uniquely
// can do — find the latest Backup row (Prisma) + checksum + persist lastUpload* —
// and Phase 2 splits it into "prepare here / perform in main". In Phase 1 the
// provider is NullDriveProvider, so this returns a not-connected outcome.
router.post(
  '/upload-latest',
  requirePermission('backups.create'),
  asyncHandler(async (req, res) => {
    const latest = await prisma.backup.findFirst({
      where: { status: 'SUCCESS' },
      orderBy: { createdAt: 'desc' },
    });
    if (!latest) throw AppError.badRequest('لا توجد نسخة احتياطية محلية ناجحة للرفع');

    const meta = buildBackupMeta(latest.fileName, 'manual', {
      createdAt: latest.createdAt.toISOString(),
    });

    const outcome = await uploadBackupFile(activeDriveProvider, latest.filePath, meta, {
      computeChecksum: (p) => backupService.computeChecksum(p),
    });

    await writeConfig(
      { lastUploadAt: outcome.uploadedAt, lastUploadStatus: outcome.success ? 'SUCCESS' : 'FAILED' },
      req,
    );

    ok(res, outcome);
  }),
);

export default router;
