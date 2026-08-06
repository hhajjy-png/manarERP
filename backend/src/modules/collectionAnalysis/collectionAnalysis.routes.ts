import { Router } from 'express';
import { authenticate } from '@core/middleware/auth.middleware';
import { requirePermission } from '@core/middleware/rbac.middleware';
import { asyncHandler } from '@core/utils/asyncHandler';
import { collectionAnalysisController } from './collectionAnalysis.controller';

/**
 * تحليل التحصيلات — قراءة فقط، بلا أي كتابة.
 *
 * يحرسه `reports.read` ولا يُنشئ مفتاح صلاحية جديدًا — نفس سياسة «مركز التحليل
 * المالي» حرفيًا وللسبب نفسه: الصفحة لا تكشف أي بيان لا يظهر أصلًا في مركز
 * التقارير (نفس الفواتير والتحصيلات بنفس قواعد المحرّك التشغيلي)، وإضافة وحدة
 * صلاحيات جديدة كانت ستتطلّب تعديل `constants.ts` + الـ seed + إعادة توزيع
 * الصلاحيات على الأدوار في قواعد بيانات منشورة أصلًا — مخاطرة تشغيلية بلا مقابل
 * أمني. التصدير يحرسه `reports.export` كبقيّة تصديرات التقارير.
 */
const router = Router();
router.use(authenticate);

router.get('/', requirePermission('reports.read'), asyncHandler(collectionAnalysisController.report));

router.get(
  '/drilldown',
  requirePermission('reports.read'),
  asyncHandler(collectionAnalysisController.drilldown),
);

router.get(
  '/export',
  requirePermission('reports.export'),
  asyncHandler(collectionAnalysisController.exportExcel),
);

export default router;
