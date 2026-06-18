import { Router } from 'express';
import { salariesService } from './salaries.service';
import { salariesBankImportService } from './salaries.bankImport.service';
import { authenticate } from '../../core/middleware/auth.middleware';
import { requirePermission } from '../../core/middleware/rbac.middleware';
import { asyncHandler } from '../../core/utils/asyncHandler';
import { ok } from '../../core/utils/response';

const router = Router();
router.use(authenticate);

const canRead = requirePermission('payroll.read');
const canImportRead = requirePermission('import.read');
const canImportCreate = requirePermission('import.create');

router.get('/', canRead, asyncHandler(async (req, res) => ok(res, await salariesService.list(req.query))));
router.get('/summary', canRead, asyncHandler(async (_req, res) => ok(res, await salariesService.summary())));

router.post(
  '/bank-import/preview',
  canImportRead,
  asyncHandler(async (req, res) => ok(res, await salariesBankImportService.preview(req.body.rows))),
);

router.post(
  '/bank-import/execute',
  canImportCreate,
  asyncHandler(async (req, res) => ok(res, await salariesBankImportService.execute(req.body.rows, req))),
);

export default router;
