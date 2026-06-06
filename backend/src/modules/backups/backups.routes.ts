import { Router } from 'express';
import { z } from 'zod';
import { backupService } from '../../shared/services/backup.service';
import { authenticate } from '../../core/middleware/auth.middleware';
import { requirePermission } from '../../core/middleware/rbac.middleware';
import { asyncHandler } from '../../core/utils/asyncHandler';
import { ok, created } from '../../core/utils/response';
import { recordAudit } from '../../core/middleware/audit';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('backups.read'), asyncHandler(async (_req, res) => ok(res, await backupService.list())));

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
