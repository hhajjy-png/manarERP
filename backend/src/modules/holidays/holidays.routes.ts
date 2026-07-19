import { Router } from 'express';
import { holidaysController } from './holidays.controller';
import { authenticate } from '../../core/middleware/auth.middleware';
import { requirePermission } from '../../core/middleware/rbac.middleware';
import { validate } from '../../core/middleware/validate.middleware';
import { asyncHandler } from '../../core/utils/asyncHandler';
import { createHolidaySchema } from './holidays.schema';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('employees.read'), asyncHandler(holidaysController.list));
router.post('/', requirePermission('employees.update'), validate(createHolidaySchema), asyncHandler(holidaysController.create));
router.delete('/:id', requirePermission('employees.update'), asyncHandler(holidaysController.remove));

export default router;
