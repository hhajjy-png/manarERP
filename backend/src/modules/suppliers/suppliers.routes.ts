import { Router } from 'express';
import { suppliersController } from './suppliers.controller';
import { authenticate } from '../../core/middleware/auth.middleware';
import { requirePermission } from '../../core/middleware/rbac.middleware';
import { validate } from '../../core/middleware/validate.middleware';
import { asyncHandler } from '../../core/utils/asyncHandler';
import { createSupplierSchema, updateSupplierSchema } from './suppliers.schema';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('suppliers.read'), asyncHandler(suppliersController.list));
router.get('/:id', requirePermission('suppliers.read'), asyncHandler(suppliersController.getById));
router.post('/', requirePermission('suppliers.create'), validate(createSupplierSchema), asyncHandler(suppliersController.create));
router.put('/:id', requirePermission('suppliers.update'), validate(updateSupplierSchema), asyncHandler(suppliersController.update));
router.patch('/:id/archive', requirePermission('suppliers.update'), asyncHandler(suppliersController.archive));
router.patch('/:id/unarchive', requirePermission('suppliers.update'), asyncHandler(suppliersController.unarchive));
router.delete('/:id', requirePermission('suppliers.delete'), asyncHandler(suppliersController.remove));

export default router;
