import { Router } from 'express';
import { dashboardService } from './dashboard.service';
import { authenticate } from '../../core/middleware/auth.middleware';
import { requirePermission } from '../../core/middleware/rbac.middleware';
import { asyncHandler } from '../../core/utils/asyncHandler';
import { ok } from '../../core/utils/response';

const router = Router();
router.use(authenticate);

const canRead = requirePermission('dashboard.read');

router.get('/overview', canRead, asyncHandler(async (_req, res) => ok(res, await dashboardService.overview())));
router.get('/trend', canRead, asyncHandler(async (_req, res) => ok(res, await dashboardService.monthlyTrend())));
router.get('/contract-status', canRead, asyncHandler(async (_req, res) => ok(res, await dashboardService.contractStatusBreakdown())));
router.get('/activity', canRead, asyncHandler(async (req, res) => ok(res, await dashboardService.recentActivity(Math.min(Number(req.query.limit) || 8, 50)))));

/** لوحة التحكم التنفيذية — جميع KPIs والرسوم والقوائم في استدعاء واحد. */
router.get('/executive', canRead, asyncHandler(async (_req, res) => ok(res, await dashboardService.executive())));

/** ملخص العمليات المعلّقة — pending expenses, draft payroll, unprinted cheques, etc. */
router.get('/operational', canRead, asyncHandler(async (_req, res) => ok(res, await dashboardService.operationalSummary())));

export default router;
