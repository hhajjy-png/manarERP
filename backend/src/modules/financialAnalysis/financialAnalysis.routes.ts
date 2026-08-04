import { Router } from 'express';
import { authenticate } from '@core/middleware/auth.middleware';
import { requirePermission } from '@core/middleware/rbac.middleware';
import { asyncHandler } from '@core/utils/asyncHandler';
import { financialAnalysisController } from './financialAnalysis.controller';

/**
 * مركز التحليل المالي — قراءة فقط، بلا أي كتابة.
 *
 * يحرسه `reports.read` عمدًا ولا يُنشئ مفتاح صلاحية جديدًا: الصفحة لا تكشف أي
 * بيان لا يظهر أصلًا في مركز التقارير (نفس الفواتير والمصروفات والتحصيلات بنفس
 * قواعد المحرّك التشغيلي)، وإضافة وحدة صلاحيات جديدة كانت ستتطلّب تعديل
 * `constants.ts` + الـ seed + إعادة توزيع الصلاحيات على الأدوار في قواعد بيانات
 * منشورة أصلًا — مخاطرة تشغيلية بلا مقابل أمني.
 */
const router = Router();
router.use(authenticate);

router.get('/', requirePermission('reports.read'), asyncHandler(financialAnalysisController.report));

router.get(
  '/drilldown',
  requirePermission('reports.read'),
  asyncHandler(financialAnalysisController.drilldown),
);

/** تصدير Excel — يحرسه `reports.export` كبقية تصديرات التقارير في النظام. */
router.get(
  '/export',
  requirePermission('reports.export'),
  asyncHandler(financialAnalysisController.exportExcel),
);

export default router;
