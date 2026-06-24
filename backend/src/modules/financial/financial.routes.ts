import { Router } from 'express';
import { authenticate }      from '@core/middleware/auth.middleware';
import { requirePermission } from '@core/middleware/rbac.middleware';
import { asyncHandler }      from '@core/utils/asyncHandler';
import {
  getStatement, exportStatement,
  getArAging, exportArAging,
  getApAging, exportApAging,
} from './financial.controller';

const router = Router();
router.use(authenticate);

// ─── Statement Center ─────────────────────────────────────────────────────────
router.get('/statements/:entityType/:id',        requirePermission('statements.read'),   asyncHandler(getStatement));
router.get('/statements/:entityType/:id/export', requirePermission('statements.export'), asyncHandler(exportStatement));

// ─── AR Aging ─────────────────────────────────────────────────────────────────
router.get('/ar-aging',        requirePermission('aging.read'),   asyncHandler(getArAging));
router.get('/ar-aging/export', requirePermission('aging.export'), asyncHandler(exportArAging));

// ─── AP Aging ─────────────────────────────────────────────────────────────────
router.get('/ap-aging',        requirePermission('aging.read'),   asyncHandler(getApAging));
router.get('/ap-aging/export', requirePermission('aging.export'), asyncHandler(exportApAging));

export default router;
