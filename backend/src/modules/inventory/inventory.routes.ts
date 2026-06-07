import { Router } from 'express';
import { categoriesController, materialsController } from './inventory.controller';
import { authenticate } from '@core/middleware/auth.middleware';
import { requirePermission } from '@core/middleware/rbac.middleware';
import { validate } from '@core/middleware/validate.middleware';
import { asyncHandler } from '@core/utils/asyncHandler';
import {
  createCategorySchema,
  updateCategorySchema,
  createMaterialSchema,
  updateMaterialSchema,
} from './inventory.schema';

const router = Router();
router.use(authenticate);

// ── تصنيفات المواد ────────────────────────────────────────────────────────

router.get('/categories', requirePermission('inventory.read'), asyncHandler(categoriesController.list));
router.get('/categories/:id', requirePermission('inventory.read'), asyncHandler(categoriesController.getById));
router.post('/categories', requirePermission('inventory.create'), validate(createCategorySchema), asyncHandler(categoriesController.create));
router.put('/categories/:id', requirePermission('inventory.update'), validate(updateCategorySchema), asyncHandler(categoriesController.update));
router.delete('/categories/:id', requirePermission('inventory.delete'), asyncHandler(categoriesController.remove));

// ── المواد ────────────────────────────────────────────────────────────────

router.get('/materials', requirePermission('inventory.read'), asyncHandler(materialsController.list));
router.get('/materials/:id', requirePermission('inventory.read'), asyncHandler(materialsController.getById));
router.post('/materials', requirePermission('inventory.create'), validate(createMaterialSchema), asyncHandler(materialsController.create));
router.put('/materials/:id', requirePermission('inventory.update'), validate(updateMaterialSchema), asyncHandler(materialsController.update));
router.delete('/materials/:id', requirePermission('inventory.delete'), asyncHandler(materialsController.remove));

export default router;
