import { Router } from 'express';
import { invoicesController } from './invoices.controller';
import { authenticate } from '../../core/middleware/auth.middleware';
import { requirePermission, requireRole } from '../../core/middleware/rbac.middleware';
import { validate } from '../../core/middleware/validate.middleware';
import { asyncHandler } from '../../core/utils/asyncHandler';
import { addPaymentSchema, createInvoiceSchema, forceDeleteInvoiceSchema, updateInvoiceSchema } from './invoices.schema';
import { ROLES } from '../../config/constants';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('invoices.read'), asyncHandler(invoicesController.list));
router.get('/stats', requirePermission('invoices.read'), asyncHandler(invoicesController.getStats));
router.get('/monthly-report', requirePermission('invoices.read'), asyncHandler(invoicesController.getMonthlyReport));
router.get('/:id/force', requireRole(ROLES.SYSTEM_ADMIN), asyncHandler(invoicesController.forceRemovePreview));
router.get('/:id', requirePermission('invoices.read'), asyncHandler(invoicesController.getById));
router.post('/', requirePermission('invoices.create'), validate(createInvoiceSchema), asyncHandler(invoicesController.create));
router.put('/:id', requirePermission('invoices.update'), validate(updateInvoiceSchema), asyncHandler(invoicesController.update));
router.post('/:id/payments', requirePermission('invoices.update'), validate(addPaymentSchema), asyncHandler(invoicesController.addPayment));
router.patch('/:id/cancel', requirePermission('invoices.update'), asyncHandler(invoicesController.cancel));
router.delete('/:id/force', requireRole(ROLES.SYSTEM_ADMIN), validate(forceDeleteInvoiceSchema), asyncHandler(invoicesController.forceRemove));
router.delete('/:id', requirePermission('invoices.delete'), asyncHandler(invoicesController.remove));

export default router;
