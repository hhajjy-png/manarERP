import { Router } from 'express';
import { authenticate } from '@core/middleware/auth.middleware';
import { asyncHandler } from '@core/utils/asyncHandler';
import { approvalController } from './approval.controller';

const router = Router();
router.use(authenticate);

router.get('/:entityType/:entityId', asyncHandler(approvalController.getHistory));

export default router;
