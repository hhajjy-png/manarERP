import { Router } from 'express';
import { authenticate }      from '@core/middleware/auth.middleware';
import { requirePermission } from '@core/middleware/rbac.middleware';
import { asyncHandler }      from '@core/utils/asyncHandler';
import {
  getStatement,     exportStatement,
  getArAging,       exportArAging,
  getApAging,       exportApAging,
  getGlStatement,   exportGlStatement,
  getGlReport,      exportGlReport,
  getTrialBalance,  exportTrialBalance,
  getJournalBook,   exportJournalBook,
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

// ─── GL Statement ─────────────────────────────────────────────────────────────
router.get('/gl-statement/:accountId',        requirePermission('gl.read'),   asyncHandler(getGlStatement));
router.get('/gl-statement/:accountId/export', requirePermission('gl.export'), asyncHandler(exportGlStatement));

// ─── GL Report ────────────────────────────────────────────────────────────────
router.get('/gl-report',        requirePermission('gl.read'),   asyncHandler(getGlReport));
router.get('/gl-report/export', requirePermission('gl.export'), asyncHandler(exportGlReport));

// ─── Trial Balance ────────────────────────────────────────────────────────────
router.get('/trial-balance',        requirePermission('trialbalance.read'),   asyncHandler(getTrialBalance));
router.get('/trial-balance/export', requirePermission('trialbalance.export'), asyncHandler(exportTrialBalance));

// ─── Journal Book ─────────────────────────────────────────────────────────────
router.get('/journal-book',        requirePermission('journal.read'),   asyncHandler(getJournalBook));
router.get('/journal-book/export', requirePermission('journal.export'), asyncHandler(exportJournalBook));

export default router;
