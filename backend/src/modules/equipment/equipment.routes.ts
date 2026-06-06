import { Router } from 'express';
import { equipmentController } from './equipment.controller';
import { authenticate } from '../../core/middleware/auth.middleware';
import { requirePermission } from '../../core/middleware/rbac.middleware';
import { validate } from '../../core/middleware/validate.middleware';
import { asyncHandler } from '../../core/utils/asyncHandler';
import { createEquipmentSchema, updateEquipmentSchema } from './equipment.schema';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('equipment.read'), asyncHandler(equipmentController.list));
router.get('/summary', requirePermission('equipment.read'), asyncHandler(equipmentController.summary));
router.get('/expiring', requirePermission('equipment.read'), asyncHandler(equipmentController.expiring));
router.get('/:id', requirePermission('equipment.read'), asyncHandler(equipmentController.getById));
router.post('/', requirePermission('equipment.create'), validate(createEquipmentSchema), asyncHandler(equipmentController.create));
router.put('/:id', requirePermission('equipment.update'), validate(updateEquipmentSchema), asyncHandler(equipmentController.update));
router.delete('/:id', requirePermission('equipment.delete'), asyncHandler(equipmentController.remove));

export default router;
