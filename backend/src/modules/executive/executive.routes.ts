import { Router } from 'express';
import { authenticate } from '../../core/middleware/auth.middleware';
import { requirePermission } from '../../core/middleware/rbac.middleware';
import { getDecisionCenter, getKPITimeline } from './executive.controller';

const router = Router();
router.use(authenticate);

const canRead = requirePermission('dashboard.read');

/** مركز القرار التنفيذي — ملخص مالي، بطاقات القرار، تنبيهات V3، نقاط الصحة، توصيات. */
router.get('/decision-center', canRead, getDecisionCenter);

/** مسار KPIs الزمني — 1m / 3m / 6m / 12m. */
router.get('/kpi-timeline', canRead, getKPITimeline);

export default router;
