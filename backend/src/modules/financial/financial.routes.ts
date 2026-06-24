import { Router } from 'express';
import { authenticate }      from '@core/middleware/auth.middleware';
import { requirePermission } from '@core/middleware/rbac.middleware';
import { asyncHandler }      from '@core/utils/asyncHandler';
import { getStatement, exportStatement } from './financial.controller';

const router = Router();
router.use(authenticate);

// ─── Statement Center ─────────────────────────────────────────────────────────
router.get('/statements/:entityType/:id',        requirePermission('statements.read'),   asyncHandler(getStatement));
router.get('/statements/:entityType/:id/export', requirePermission('statements.export'), asyncHandler(exportStatement));

// Parts 3–5 append additional routes here.

export default router;
