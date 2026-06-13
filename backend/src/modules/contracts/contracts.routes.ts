import { Router } from 'express';
import { contractsController } from './contracts.controller';
import { authenticate } from '../../core/middleware/auth.middleware';
import { requirePermission, requireRole } from '../../core/middleware/rbac.middleware';
import { ROLES } from '../../config/constants';
import { validate } from '../../core/middleware/validate.middleware';
import { asyncHandler } from '../../core/utils/asyncHandler';
import { createContractSchema, updateContractSchema } from './contracts.schema';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('contracts.read'), asyncHandler(contractsController.list));
router.get('/summary', requirePermission('contracts.read'), asyncHandler(contractsController.summary));
router.get('/:id/force', requireRole(ROLES.SYSTEM_ADMIN), asyncHandler(contractsController.forceRemovePreview));
router.get('/:id', requirePermission('contracts.read'), asyncHandler(contractsController.getById));
router.post('/', requirePermission('contracts.create'), validate(createContractSchema), asyncHandler(contractsController.create));
router.put('/:id', requirePermission('contracts.update'), validate(updateContractSchema), asyncHandler(contractsController.update));
router.delete('/:id/force', requireRole(ROLES.SYSTEM_ADMIN), asyncHandler(contractsController.forceRemove));
router.delete('/:id', requirePermission('contracts.delete'), asyncHandler(contractsController.remove));

export default router;
