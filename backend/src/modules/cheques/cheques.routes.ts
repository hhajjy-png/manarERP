import { Router } from 'express';
import { chequesController } from './cheques.controller';
import { authenticate } from '../../core/middleware/auth.middleware';
import { requirePermission } from '../../core/middleware/rbac.middleware';
import { validate } from '../../core/middleware/validate.middleware';
import { asyncHandler } from '../../core/utils/asyncHandler';
import { createChequeSchema, updateChequeSchema } from './cheques.schema';

const router = Router();
router.use(authenticate);

// /stats must be registered before /:id to avoid Express matching 'stats' as an id param
router.get('/stats', requirePermission('cheques.read'), asyncHandler(chequesController.stats));
router.get('/', requirePermission('cheques.read'), asyncHandler(chequesController.list));
router.get('/:id', requirePermission('cheques.read'), asyncHandler(chequesController.getById));
router.post('/', requirePermission('cheques.create'), validate(createChequeSchema), asyncHandler(chequesController.create));
router.put('/:id', requirePermission('cheques.update'), validate(updateChequeSchema), asyncHandler(chequesController.update));
router.post('/:id/mark-printed', requirePermission('cheques.print'), asyncHandler(chequesController.markPrinted));
router.post('/:id/cancel', requirePermission('cheques.cancel'), asyncHandler(chequesController.cancel));

export default router;
