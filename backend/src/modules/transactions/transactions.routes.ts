import { Router } from 'express';
import { transactionsController } from './transactions.controller';
import { authenticate } from '../../core/middleware/auth.middleware';
import { requirePermission } from '../../core/middleware/rbac.middleware';
import { asyncHandler } from '../../core/utils/asyncHandler';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('transactions.read'), asyncHandler(transactionsController.list));
router.get('/ledger', requirePermission('transactions.read'), asyncHandler(transactionsController.ledger));
router.get('/profit-loss', requirePermission('transactions.read', 'reports.read'), asyncHandler(transactionsController.profitAndLoss));
router.post('/', requirePermission('transactions.create'), asyncHandler(transactionsController.createManual));

export default router;
