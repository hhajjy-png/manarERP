import { Router } from 'express';
import { authenticate } from '@core/middleware/auth.middleware.js';
import { requirePermission } from '@core/middleware/rbac.middleware.js';
import {
  previewHandler,
  executeHandler,
  listHandler,
  workspaceHandler,
  updateStatusHandler,
  bulkUpdateStatusHandler,
  postingSuggestionsHandler,
  exportReportHandler,
} from './controller.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// POST /api/bank-statement-import/preview
router.post('/preview',   requirePermission('bankStatementImport.create'), previewHandler);

// POST /api/bank-statement-import/execute
router.post('/execute',   requirePermission('bankStatementImport.create'), executeHandler);

// GET  /api/bank-statement-import
router.get('/',           requirePermission('bankStatementImport.read'),   listHandler);

// GET  /api/bank-statement-import/:importId/workspace
router.get('/:importId/workspace',   requirePermission('bankStatementImport.read'),      workspaceHandler);

// PATCH /api/bank-statement-import/:importId/transactions/:transactionId/status
router.patch(
  '/:importId/transactions/:transactionId/status',
  requirePermission('bankStatementImport.reconcile'),
  updateStatusHandler,
);

// POST /api/bank-statement-import/:importId/bulk-status
router.post(
  '/:importId/bulk-status',
  requirePermission('bankStatementImport.reconcile'),
  bulkUpdateStatusHandler,
);

// GET  /api/bank-statement-import/:importId/transactions/:transactionId/suggestions
router.get(
  '/:importId/transactions/:transactionId/suggestions',
  requirePermission('bankStatementImport.reconcile'),
  postingSuggestionsHandler,
);

// GET  /api/bank-statement-import/:importId/export
router.get(
  '/:importId/export',
  requirePermission('bankStatementImport.export'),
  exportReportHandler,
);

export default router;
