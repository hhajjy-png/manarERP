import { Router } from 'express';
import { z } from 'zod';
import { settingsService } from './settings.service';
import { authenticate } from '../../core/middleware/auth.middleware';
import { requirePermission } from '../../core/middleware/rbac.middleware';
import { asyncHandler } from '../../core/utils/asyncHandler';
import { ok } from '../../core/utils/response';

const router = Router();
router.use(authenticate);

const updateSchema = z.object({
  settings: z.array(z.object({ key: z.string().min(1), value: z.string(), group: z.string().optional() })).min(1),
});

router.get('/', requirePermission('settings.read'), asyncHandler(async (_req, res) => ok(res, await settingsService.getAll())));

router.put(
  '/',
  requirePermission('settings.update'),
  asyncHandler(async (req, res) => {
    const { settings } = updateSchema.parse(req.body);
    ok(res, await settingsService.updateMany(settings, req), 'تم حفظ الإعدادات');
  }),
);

export default router;
