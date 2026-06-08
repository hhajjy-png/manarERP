import { Router } from 'express';
import {
  categoriesController,
  materialsController,
  purchaseOrdersController,
  goodsReceiptsController,
} from './inventory.controller';
import { authenticate } from '@core/middleware/auth.middleware';
import { requirePermission } from '@core/middleware/rbac.middleware';
import { validate } from '@core/middleware/validate.middleware';
import { asyncHandler } from '@core/utils/asyncHandler';
import {
  createCategorySchema,
  updateCategorySchema,
  createMaterialSchema,
  updateMaterialSchema,
  createPurchaseOrderSchema,
  updatePurchaseOrderSchema,
  createGoodsReceiptSchema,
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

// ── أوامر الشراء ──────────────────────────────────────────────────────────

router.get('/purchase-orders', requirePermission('inventory.read'), asyncHandler(purchaseOrdersController.list));
router.get('/purchase-orders/:id', requirePermission('inventory.read'), asyncHandler(purchaseOrdersController.getById));
router.post('/purchase-orders', requirePermission('inventory.create'), validate(createPurchaseOrderSchema), asyncHandler(purchaseOrdersController.create));
router.put('/purchase-orders/:id', requirePermission('inventory.update'), validate(updatePurchaseOrderSchema), asyncHandler(purchaseOrdersController.update));
router.post('/purchase-orders/:id/submit', requirePermission('inventory.update'), asyncHandler(purchaseOrdersController.submit));
router.post('/purchase-orders/:id/cancel', requirePermission('inventory.update'), asyncHandler(purchaseOrdersController.cancel));
router.delete('/purchase-orders/:id', requirePermission('inventory.delete'), asyncHandler(purchaseOrdersController.remove));

// ── سندات الاستلام ────────────────────────────────────────────────────────

router.get('/goods-receipts', requirePermission('inventory.read'), asyncHandler(goodsReceiptsController.list));
router.get('/goods-receipts/:id', requirePermission('inventory.read'), asyncHandler(goodsReceiptsController.getById));
router.post('/goods-receipts', requirePermission('inventory.create'), validate(createGoodsReceiptSchema), asyncHandler(goodsReceiptsController.create));
router.post('/goods-receipts/:id/post', requirePermission('inventory.approve'), asyncHandler(goodsReceiptsController.post));
router.delete('/goods-receipts/:id', requirePermission('inventory.delete'), asyncHandler(goodsReceiptsController.remove));

export default router;
