import { Router } from 'express';
import { salariesService } from './salaries.service';
import { authenticate } from '../../core/middleware/auth.middleware';
import { requirePermission } from '../../core/middleware/rbac.middleware';
import { asyncHandler } from '../../core/utils/asyncHandler';
import { ok } from '../../core/utils/response';

const router = Router();
router.use(authenticate);

// نستخدم صلاحية الرواتب الموجودة (payroll)
const canRead = requirePermission('payroll.read');

router.get('/', canRead, asyncHandler(async (req, res) => ok(res, await salariesService.list(req.query))));
router.get('/summary', canRead, asyncHandler(async (_req, res) => ok(res, await salariesService.summary())));

export default router;
