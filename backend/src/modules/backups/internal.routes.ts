import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { backupService } from '../../shared/services/backup.service';
import { asyncHandler } from '../../core/utils/asyncHandler';
import { ok } from '../../core/utils/response';

const router = Router();

function requireInternalSecret(req: Request, res: Response, next: NextFunction): void {
  const secret = req.headers['x-internal-secret'];
  if (!env.INTERNAL_SECRET || secret !== env.INTERNAL_SECRET) {
    res.status(403).json({ success: false, error: 'Forbidden' });
    return;
  }
  next();
}

router.use(requireInternalSecret);

// GET /api/internal/backup-settings
// Called by Electron scheduler on startup to read configuration from the DB.
router.get('/backup-settings', asyncHandler(async (_req, res) => {
  const rows = await prisma.setting.findMany({
    where: { key: { in: ['backup.auto.enabled', 'backup.auto.time', 'backup.auto.retention'] } },
  });
  const map: Record<string, string> = {};
  rows.forEach((r) => { map[r.key] = r.value; });

  const enabled = (map['backup.auto.enabled'] ?? 'true') !== 'false';
  const time = map['backup.auto.time'] ?? '02:00';
  const retention = Math.max(1, parseInt(map['backup.auto.retention'] ?? '30', 10) || 30);

  const [hourStr, minuteStr] = time.split(':');
  const hour = parseInt(hourStr, 10) || 2;
  const minute = parseInt(minuteStr, 10) || 0;
  const cronExpr = `${minute} ${hour} * * *`;

  ok(res, { enabled, time, retention, cronExpr });
}));

// GET /api/internal/last-auto-time
// Returns the createdAt timestamp of the most recent successful AUTO backup.
// Used by Electron catch-up logic to decide if a backup was missed.
router.get('/last-auto-time', asyncHandler(async (_req, res) => {
  const last = await prisma.backup.findFirst({
    where: { type: 'AUTO', status: 'SUCCESS' },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  ok(res, { createdAt: last?.createdAt ?? null });
}));

// POST /api/internal/trigger-auto-backup
// Called by Electron scheduler to run a WAL-safe auto backup entirely inside the backend.
// backupService.create() performs PRAGMA wal_checkpoint(FULL) before copying.
router.post('/trigger-auto-backup', asyncHandler(async (_req, res) => {
  const retentionRow = await prisma.setting.findUnique({ where: { key: 'backup.auto.retention' } });
  const retention = Math.max(1, parseInt(retentionRow?.value ?? '30', 10) || 30);

  const backup = await backupService.create('AUTO');

  await prisma.auditLog.create({
    data: {
      userId: null,
      action: 'AUTO_BACKUP',
      module: 'system',
      entityId: String(backup.id),
      newValue: JSON.stringify({ fileName: backup.fileName, fileSize: backup.sizeBytes, retentionCount: retention }),
    },
  });

  const pruned = await backupService.pruneAutoBackups(retention);

  if (pruned.length > 0) {
    await prisma.auditLog.create({
      data: {
        userId: null,
        action: 'AUTO_BACKUP_CLEANUP',
        module: 'system',
        newValue: JSON.stringify({ deletedFiles: pruned }),
      },
    });
  }

  ok(res, { backup, pruned });
}));

export default router;
