import { Router } from 'express';
import { rolesController } from './roles.controller';
import { authenticate } from '../../core/middleware/auth.middleware';
import { requirePermission } from '../../core/middleware/rbac.middleware';
import { asyncHandler } from '../../core/utils/asyncHandler';

const router = Router();

router.use(authenticate);

router.get('/permissions', requirePermission('roles.read'), asyncHandler(rolesController.permissions));
router.get('/', requirePermission('roles.read'), asyncHandler(rolesController.list));
router.get('/:id', requirePermission('roles.read'), asyncHandler(rolesController.getById));
router.put('/:id/permissions', requirePermission('roles.update'), asyncHandler(rolesController.setPermissions));

export default router;
