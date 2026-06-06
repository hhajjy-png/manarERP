import { Router } from 'express';
import { usersController } from './users.controller';
import { authenticate } from '../../core/middleware/auth.middleware';
import { requirePermission } from '../../core/middleware/rbac.middleware';
import { validate } from '../../core/middleware/validate.middleware';
import { asyncHandler } from '../../core/utils/asyncHandler';
import { createUserSchema, updateUserSchema } from './users.schema';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission('users.read'), asyncHandler(usersController.list));
router.get('/:id', requirePermission('users.read'), asyncHandler(usersController.getById));
router.post('/', requirePermission('users.create'), validate(createUserSchema), asyncHandler(usersController.create));
router.put('/:id', requirePermission('users.update'), validate(updateUserSchema), asyncHandler(usersController.update));
router.delete('/:id', requirePermission('users.delete'), asyncHandler(usersController.remove));

export default router;
