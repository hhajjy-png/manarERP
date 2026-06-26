import { Router } from 'express';
import { authenticate } from '../../core/middleware/auth.middleware';
import { requirePermission } from '../../core/middleware/rbac.middleware';
import { getDecisionCenter, getKPITimeline } from './executive.controller';
import { financialExecService } from './financial-exec.service';
import { asyncHandler } from '../../core/utils/asyncHandler';
import { ok } from '../../core/utils/response';

const router = Router();
router.use(authenticate);

const canRead = requirePermission('dashboard.read');

/** مركز القرار التنفيذي — ملخص مالي، بطاقات القرار، تنبيهات V3، نقاط الصحة، توصيات. */
router.get('/decision-center', canRead, getDecisionCenter);

/** مسار KPIs الزمني — 1m / 3m / 6m / 12m. */
router.get('/kpi-timeline', canRead, getKPITimeline);

/** ربحية جميع العقود — الإيرادات والمصروفات وهامش الربح ومعدل التحصيل. */
router.get(
  '/contract-profitability',
  requirePermission('financialdashboard.read'),
  asyncHandler(async (_req, res) => {
    ok(res, await financialExecService.contractProfitability());
  }),
);

/** توزيع المصروفات حسب الفئة — مرتبة تنازلياً بالإجمالي. */
router.get(
  '/expense-breakdown',
  requirePermission('financialdashboard.read'),
  asyncHandler(async (_req, res) => {
    ok(res, await financialExecService.expenseBreakdown());
  }),
);

/** تحليل العملاء — الإيرادات والتحصيل والذمم وعدد الفواتير. */
router.get(
  '/customer-analytics',
  requirePermission('financialdashboard.read'),
  asyncHandler(async (_req, res) => {
    ok(res, await financialExecService.customerAnalytics());
  }),
);

export default router;
