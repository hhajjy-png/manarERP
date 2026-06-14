import path from 'path';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { backupService } from '../../shared/services/backup.service';
import { settingsService } from '../settings/settings.service';
import { authenticate } from '../../core/middleware/auth.middleware';
import { requirePermission } from '../../core/middleware/rbac.middleware';
import { asyncHandler } from '../../core/utils/asyncHandler';
import { ok, created } from '../../core/utils/response';
import { recordAudit } from '../../core/middleware/audit';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('backups.read'), asyncHandler(async (_req, res) => ok(res, await backupService.list())));

// آخر نسخة احتياطية تلقائية — للعرض في لوحة التحكم
router.get(
  '/last-auto',
  requirePermission('backups.read'),
  asyncHandler(async (_req, res) => {
    const last = await prisma.backup.findFirst({
      where: { type: 'AUTO', status: 'SUCCESS' },
      orderBy: { createdAt: 'desc' },
    });
    ok(res, last);
  }),
);

// حالة النسخ التلقائي — آخر وقت تشغيل، الحالة، الخطأ، ومسار مجلد النسخ
router.get(
  '/auto-status',
  requirePermission('backups.read'),
  asyncHandler(async (_req, res) => {
    const keys = ['backup.auto.lastRunAt', 'backup.auto.lastStatus', 'backup.auto.lastError'];
    const rows = await prisma.setting.findMany({ where: { key: { in: keys } } });
    const map: Record<string, string> = {};
    rows.forEach((r) => { map[r.key] = r.value; });

    ok(res, {
      lastRunAt: map['backup.auto.lastRunAt'] ?? null,
      lastStatus: (map['backup.auto.lastStatus'] ?? 'NEVER') as 'SUCCESS' | 'FAILED' | 'NEVER',
      lastError: map['backup.auto.lastError'] ?? '',
      backupDir: path.resolve(process.cwd(), env.BACKUP_DIR),
    });
  }),
);

// ── إعدادات النسخ التلقائي ─────────────────────────────────────────────────

const backupSettingsSchema = z.object({
  enabled: z.boolean(),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'صيغة الوقت غير صحيحة — استخدم HH:mm'),
  retentionCount: z.number().int().min(1, 'الحد الأدنى 1').max(365, 'الحد الأقصى 365'),
});

router.get(
  '/settings',
  requirePermission('backups.read'),
  asyncHandler(async (_req, res) => {
    const keys = ['backup.auto.enabled', 'backup.auto.time', 'backup.auto.retention'];
    const rows = await prisma.setting.findMany({ where: { key: { in: keys } } });
    const map: Record<string, string> = {};
    rows.forEach((r) => { map[r.key] = r.value; });

    ok(res, {
      enabled: (map['backup.auto.enabled'] ?? 'true') !== 'false',
      time: map['backup.auto.time'] ?? '22:00',
      retentionCount: Math.max(1, parseInt(map['backup.auto.retention'] ?? '30', 10) || 30),
    });
  }),
);

router.put(
  '/settings',
  requirePermission('settings.update'),
  asyncHandler(async (req, res) => {
    const { enabled, time, retentionCount } = backupSettingsSchema.parse(req.body);

    await settingsService.updateMany(
      [
        { key: 'backup.auto.enabled', value: String(enabled), group: 'backup' },
        { key: 'backup.auto.time', value: time, group: 'backup' },
        { key: 'backup.auto.retention', value: String(retentionCount), group: 'backup' },
      ],
      req,
    );

    // سجل تدقيق خاص بإعدادات النسخ الاحتياطية لتمييزها عن تعديلات الإعدادات العامة
    await recordAudit({
      req,
      action: 'BACKUP_SETTINGS_UPDATE',
      module: 'backups',
      newValue: JSON.stringify({ enabled, time, retentionCount }),
    });

    ok(res, { enabled, time, retentionCount }, 'تم حفظ إعدادات النسخ التلقائي');
  }),
);

// ── عمليات النسخ والاستعادة ────────────────────────────────────────────────

router.post(
  '/',
  requirePermission('backups.create'),
  asyncHandler(async (req, res) => {
    const backup = await backupService.create('MANUAL', req.user!.userId);
    await recordAudit({ req, action: 'BACKUP', module: 'backups', entityId: backup.id });
    created(res, backup, 'تم إنشاء النسخة الاحتياطية');
  }),
);

const exportSchema = z.object({ path: z.string().min(1, 'المسار مطلوب') });
router.post(
  '/export',
  requirePermission('backups.create'),
  asyncHandler(async (req, res) => {
    const { path: target } = exportSchema.parse(req.body);
    ok(res, await backupService.exportTo(target), 'تم تصدير قاعدة البيانات');
  }),
);

router.post(
  '/:id/restore',
  requirePermission('backups.update'),
  asyncHandler(async (req, res) => {
    const result = await backupService.restore(Number(req.params.id));
    await recordAudit({ req, action: 'RESTORE', module: 'backups', entityId: Number(req.params.id) });
    ok(res, result, 'تمت الاستعادة — يلزم إعادة تشغيل النظام');
  }),
);

router.delete(
  '/:id',
  requirePermission('backups.update'),
  asyncHandler(async (req, res) => {
    ok(res, await backupService.remove(Number(req.params.id)), 'تم حذف النسخة');
  }),
);

export default router;
