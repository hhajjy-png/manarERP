/**
 * مسارات كشف المستحقات الشهرية البنكي.
 *
 * ═══ الصلاحيات ═══
 * تُعاد استخدام مفاتيح وحدة المستحقات القائمة، بلا مفتاح جديد — وهو نفس ما فعله كشف
 * الرواتب البنكي حين أعاد استخدام `payroll.read`. السبب عملي لا أسلوبي: مفتاح صلاحية
 * جديد لا يصل إلى قواعد البيانات القائمة إلا عبر إعادة تشغيل الـ seed، فينتهي بقدرة
 * لا يملكها أحد سوى مدير النظام (الذي يتجاوز الـ RBAC أصلًا) بعد التحديث.
 *
 *   • القراءة والمعاينة والتصدير → `employeeCompensation.read`
 *     (التصدير تنزيل لبيانات يقرأها صاحب الصلاحية أصلًا، والملف يُولَّد في العميل.)
 *   • الاعتماد وإلغاء الاعتماد   → `employeeCompensation.approve`
 *
 * صلاحية الرواتب لا تمنح شيئًا هنا، وصلاحية هذه الوحدة لا تمنح شيئًا في الرواتب.
 * لا مسار واحد بلا `authenticate` + `requirePermission`.
 */
import { Router } from 'express';
import { authenticate } from '../../core/middleware/auth.middleware';
import { requirePermission } from '../../core/middleware/rbac.middleware';
import { validate } from '../../core/middleware/validate.middleware';
import { asyncHandler } from '../../core/utils/asyncHandler';
import { entitlementsBankExportController as controller } from './entitlementsBankExport.controller';
import {
  approveStatementSchema,
  periodQuerySchema,
  previewQuerySchema,
  unapproveStatementSchema,
} from './entitlementsBankExport.schema';

const router = Router();
router.use(authenticate);

const READ = requirePermission('employeeCompensation.read');
const APPROVE = requirePermission('employeeCompensation.approve');

// ── قراءة ────────────────────────────────────────────────────────────────────
router.get('/profiles', READ, asyncHandler(controller.profiles));
router.get('/month', READ, validate(periodQuerySchema), asyncHandler(controller.month));
router.get('/preview', READ, validate(previewQuerySchema), asyncHandler(controller.preview));

// ── اعتماد الكشف ─────────────────────────────────────────────────────────────
// الكتابة الوحيدة في هذه الوحدة، وهي محصورة في جدولي الكشف وسجل التدقيق: لا تمسّ
// الرواتب ولا حسبات المستحقات ولا المحاسبة ولا المصروفات.
router.post('/approve', APPROVE, validate(approveStatementSchema), asyncHandler(controller.approve));
router.post('/unapprove', APPROVE, validate(unapproveStatementSchema), asyncHandler(controller.unapprove));

export default router;
