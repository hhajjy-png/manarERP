import { Router } from 'express';
import { authenticate } from '@core/middleware/auth.middleware';
import { requirePermission } from '@core/middleware/rbac.middleware';
import { asyncHandler } from '@core/utils/asyncHandler';
import { ok } from '@core/utils/response';
import { expirationsService } from './expirations.service';
import { expirationFiltersSchema } from './expirations.schema';

const router = Router();
router.use(authenticate);

router.get(
  '/summary',
  requirePermission('expirations.read'),
  asyncHandler(async (_req, res) => {
    ok(res, await expirationsService.summary());
  }),
);

router.get(
  '/',
  requirePermission('expirations.read'),
  asyncHandler(async (req, res) => {
    const filters = expirationFiltersSchema.parse(req.query);
    ok(res, await expirationsService.list(filters));
  }),
);

router.get(
  '/export',
  requirePermission('expirations.export'),
  asyncHandler(async (req, res) => {
    const filters = expirationFiltersSchema.parse(req.query);
    const buf = await expirationsService.exportExcel(filters);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="expirations.xlsx"');
    res.send(buf);
  }),
);

export default router;
