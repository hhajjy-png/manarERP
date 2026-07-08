import { Router } from 'express';
import { paymentsController } from './payments.controller';
import { authenticate } from '../../core/middleware/auth.middleware';
import { requireRole } from '../../core/middleware/rbac.middleware';
import { validate } from '../../core/middleware/validate.middleware';
import { asyncHandler } from '../../core/utils/asyncHandler';
import { correctCollectionDateSchema } from './payments.schema';
import { ROLES } from '../../config/constants';

const router = Router();
router.use(authenticate);

/**
 * تصحيح تاريخ التحصيل الرسمي لدفعة تاريخية — مدير النظام فقط.
 * إجراء إداري تصحيحي للسجلات التاريخية؛ لا ينشئ دفعة جديدة ولا يغيّر أي بيانات مالية أخرى.
 */
router.patch(
  '/:paymentId/collection-date',
  requireRole(ROLES.SYSTEM_ADMIN),
  validate(correctCollectionDateSchema),
  asyncHandler(paymentsController.correctCollectionDate),
);

export default router;
