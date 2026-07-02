import { Router } from 'express';
import { chequesController } from './cheques.controller';
import { authenticate } from '../../core/middleware/auth.middleware';
import { requirePermission, requireRole } from '../../core/middleware/rbac.middleware';
import { validate } from '../../core/middleware/validate.middleware';
import { asyncHandler } from '../../core/utils/asyncHandler';
import { createChequeSchema, updateChequeSchema, forceDeleteChequeSchema } from './cheques.schema';
import { ROLES } from '../../config/constants';

const router = Router();
router.use(authenticate);

// /stats must be registered before /:id to avoid Express matching 'stats' as an id param
router.get('/stats', requirePermission('cheques.read'), asyncHandler(chequesController.stats));
router.get('/', requirePermission('cheques.read'), asyncHandler(chequesController.list));
// /:id/force (SYSTEM_ADMIN force-delete preview) must be registered before /:id
router.get('/:id/force', requireRole(ROLES.SYSTEM_ADMIN), asyncHandler(chequesController.forceRemovePreview));
router.get('/:id', requirePermission('cheques.read'), asyncHandler(chequesController.getById));
router.post('/', requirePermission('cheques.create'), validate(createChequeSchema), asyncHandler(chequesController.create));
router.put('/:id', requirePermission('cheques.update'), validate(updateChequeSchema), asyncHandler(chequesController.update));
router.post('/:id/mark-printed', requirePermission('cheques.print'), asyncHandler(chequesController.markPrinted));
router.post('/:id/cancel', requirePermission('cheques.cancel'), asyncHandler(chequesController.cancel));
router.post('/:id/payment-voucher-number', requirePermission('cheques.print'), asyncHandler(chequesController.generatePaymentVoucherNumber));
router.delete('/:id/force', requireRole(ROLES.SYSTEM_ADMIN), validate(forceDeleteChequeSchema), asyncHandler(chequesController.forceRemove));

export default router;
