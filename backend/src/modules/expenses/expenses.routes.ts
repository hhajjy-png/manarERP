import { Router } from 'express';
import { expensesController } from './expenses.controller';
import { authenticate } from '../../core/middleware/auth.middleware';
import { requirePermission } from '../../core/middleware/rbac.middleware';
import { validate } from '../../core/middleware/validate.middleware';
import { asyncHandler } from '../../core/utils/asyncHandler';
import { createExpenseSchema, updateExpenseSchema } from './expenses.schema';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('expenses.read'), asyncHandler(expensesController.list));
router.get('/stats', requirePermission('expenses.read'), asyncHandler(expensesController.stats));
router.get('/:id', requirePermission('expenses.read'), asyncHandler(expensesController.getById));
router.post('/', requirePermission('expenses.create'), validate(createExpenseSchema), asyncHandler(expensesController.create));
router.put('/:id', requirePermission('expenses.update'), validate(updateExpenseSchema), asyncHandler(expensesController.update));
router.patch('/:id/approve', requirePermission('expenses.approve'), asyncHandler(expensesController.approve));
router.patch('/:id/reject', requirePermission('expenses.approve'), asyncHandler(expensesController.reject));
router.delete('/:id', requirePermission('expenses.delete'), asyncHandler(expensesController.remove));

export default router;
