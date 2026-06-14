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
// Persists lastRunAt/lastStatus/lastError to the Setting table after every attempt.
// Always returns HTTP 200 so the Electron process gets a clean response even on failure.
// Response body includes { status: 'SUCCESS'|'FAILED'|'SKIPPED', error, lastRunAt } for observability.
router.post('/trigger-auto-backup', asyncHandler(async (_req, res) => {
  // If auto backup is disabled, skip without touching status or creating FAILED entries.
  const enabledRow = await prisma.setting.findUnique({ where: { key: 'backup.auto.enabled' } });
  if (enabledRow?.value === 'false') {
    return ok(res, { status: 'SKIPPED', reason: 'disabled', backup: null, pruned: [], error: null, lastRunAt: null });
  }

  const now = new Date().toISOString();

  const retentionRow = await prisma.setting.findUnique({ where: { key: 'backup.auto.retention' } });
  const retention = Math.max(1, parseInt(retentionRow?.value ?? '30', 10) || 30);

  // Upsert a single status setting key — reduces repetition in both branches.
  async function setStatus(key: string, value: string) {
    await prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value, group: 'backup' },
    });
  }

  let backup = null;
  let pruned: string[] = [];
  let errorMsg: string | null = null;

  try {
    backup = await backupService.create('AUTO');

    // Persist SUCCESS status.
    await setStatus('backup.auto.lastRunAt', now);
    await setStatus('backup.auto.lastStatus', 'SUCCESS');
    await setStatus('backup.auto.lastError', '');

    await prisma.auditLog.create({
      data: {
        userId: null,
        action: 'AUTO_BACKUP',
        module: 'system',
        entityId: String(backup.id),
        newValue: JSON.stringify({ fileName: backup.fileName, fileSize: backup.sizeBytes, retentionCount: retention }),
      },
    });

    pruned = await backupService.pruneAutoBackups(retention);

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
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : 'فشل النسخ التلقائي';

    // Persist FAILED status — use individual catches so one failure doesn't block the rest.
    await setStatus('backup.auto.lastRunAt', now).catch(() => {});
    await setStatus('backup.auto.lastStatus', 'FAILED').catch(() => {});
    await setStatus('backup.auto.lastError', errorMsg).catch(() => {});

    await prisma.auditLog.create({
      data: {
        userId: null,
        action: 'AUTO_BACKUP',
        module: 'system',
        newValue: JSON.stringify({ error: errorMsg }),
      },
    }).catch(() => {});
  }

  ok(res, {
    status: errorMsg ? 'FAILED' : 'SUCCESS',
    backup,
    pruned,
    error: errorMsg,
    lastRunAt: now,
  });
}));

export default router;
