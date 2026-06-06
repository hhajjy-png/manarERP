import { Router } from 'express';
import { customersController } from './customers.controller';
import { authenticate } from '../../core/middleware/auth.middleware';
import { requirePermission } from '../../core/middleware/rbac.middleware';
import { validate } from '../../core/middleware/validate.middleware';
import { asyncHandler } from '../../core/utils/asyncHandler';
import { createCustomerSchema, updateCustomerSchema } from './customers.schema';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('customers.read'), asyncHandler(customersController.list));
router.get('/:id', requirePermission('customers.read'), asyncHandler(customersController.getById));
router.post('/', requirePermission('customers.create'), validate(createCustomerSchema), asyncHandler(customersController.create));
router.put('/:id', requirePermission('customers.update'), validate(updateCustomerSchema), asyncHandler(customersController.update));
router.patch('/:id/archive', requirePermission('customers.update'), asyncHandler(customersController.archive));
router.patch('/:id/unarchive', requirePermission('customers.update'), asyncHandler(customersController.unarchive));
router.delete('/:id', requirePermission('customers.delete'), asyncHandler(customersController.remove));

export default router;
