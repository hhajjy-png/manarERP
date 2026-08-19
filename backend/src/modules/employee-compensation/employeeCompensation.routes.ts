/**
 * مسارات مستحقات الموظف الشهرية.
 *
 * كلها خلف `authenticate` + `requirePermission('employeeCompensation.*')`. لا مسار
 * واحد بلا حارس، ولا إعادة استخدام لمفاتيح صلاحيات الرواتب: من يملك صلاحية الرواتب
 * لا يرث تلقائيًا صلاحية هذه الوحدة، والعكس صحيح.
 *
 * **لا مسار كتابة هنا يستدعي أي خدمة رواتب أو محاسبة** (المتطلبان ٣٠ و٣١). قراءة
 * الموظف تتم داخل خدمة هذه الوحدة عبر Prisma مباشرة، بحقول محدَّدة، وبلا أي كتابة.
 */
import { Router } from 'express';
import { employeeCompensationController as controller, employeeCompensationDebtController as debtController } from './employeeCompensation.controller';
import { authenticate } from '../../core/middleware/auth.middleware';
import { requirePermission } from '../../core/middleware/rbac.middleware';
import { validate } from '../../core/middleware/validate.middleware';
import { asyncHandler } from '../../core/utils/asyncHandler';
import {
  annualFileSchema,
  createCalculationSchema,
  createDebtSchema,
  createManualPaymentSchema,
  employeeParamsSchema,
  updateDebtSchema,
  updateManualPaymentSchema,
  idParamsSchema,
  listSummariesSchema,
  monthParamsSchema,
  previewCalculationSchema,
  reverseOvertimeSchema,
  updateCalculationSchema,
  updateCompanyOvertimeRateSchema,
} from './employeeCompensation.schema';

const router = Router();
router.use(authenticate);

const READ = requirePermission('employeeCompensation.read');
const CREATE = requirePermission('employeeCompensation.create');
const UPDATE = requirePermission('employeeCompensation.update');
const DELETE = requirePermission('employeeCompensation.delete');
const APPROVE = requirePermission('employeeCompensation.approve');
const PRINT = requirePermission('employeeCompensation.print');

// ── قراءة ────────────────────────────────────────────────────────────────────
router.get('/summaries', READ, validate(listSummariesSchema), asyncHandler(controller.listSummaries));
router.get('/employees/:employeeId/years/:year', READ, validate(annualFileSchema), asyncHandler(controller.getAnnualFile));
router.get('/employees/:employeeId/years/:year/months/:month', READ, validate(monthParamsSchema), asyncHandler(controller.getMonth));
router.get('/calculations/:id', READ, validate(idParamsSchema), asyncHandler(controller.getById));

// ── إعداد سعر ساعة الإضافي المعتمد من الشركة ─────────────────────────────────
// إعداد إداري واحد للوحدة كلها. **لا مفتاح صلاحية جديد** (المتطلب ١٩): القراءة بـ
// `read` لأن كل محرّر شهر يحتاج الافتراضي ليبدأ منه، والتعديل بأعلى صلاحية تحرير في
// الوحدة (`update`). ولا مفتاح `payroll.*` هنا ولا في أي مكان من هذه الوحدة.
router.get('/settings/overtime-rate', READ, asyncHandler(controller.getCompanyOvertimeSettings));
router.put('/settings/overtime-rate', UPDATE, validate(updateCompanyOvertimeRateSchema), asyncHandler(controller.updateCompanyOvertimeSettings));

// ── أدوات حساب بلا أثر تخزيني ────────────────────────────────────────────────
// تُصنَّف قراءةً لأنها لا تكتب شيئًا: تستدعي المحرّك الخالص وتعيد النتيجة.
router.post('/preview', READ, validate(previewCalculationSchema), asyncHandler(controller.preview));
router.post('/reverse-overtime', READ, validate(reverseOvertimeSchema), asyncHandler(controller.reverseOvertime));

// ── كتابة ────────────────────────────────────────────────────────────────────
router.post('/employees/:employeeId/years/:year/months/:month', CREATE, validate(createCalculationSchema), asyncHandler(controller.create));
router.post('/employees/:employeeId/years/:year/months/:month/copy-previous', CREATE, validate(monthParamsSchema), asyncHandler(controller.copyPrevious));
router.put('/calculations/:id', UPDATE, validate(updateCalculationSchema), asyncHandler(controller.update));
router.post('/calculations/:id/approve', APPROVE, validate(idParamsSchema), asyncHandler(controller.approve));
router.delete('/calculations/:id', DELETE, validate(idParamsSchema), asyncHandler(controller.remove));

// ── بيانات الطباعة ───────────────────────────────────────────────────────────
// الكشف المختصر والتقرير التفصيلي مسارَان **منفصلان** عمدًا: الأول لا يحمل أجر الساعة
// ولا المعاملات ولا الحسبة العكسية أصلًا، فلا تتسرّب تلك البيانات إلى مستند يوقّعه
// الموظف حتى لو أخطأ قالبُ عرضٍ يومًا ما.
router.get('/calculations/:id/statement', PRINT, validate(idParamsSchema), asyncHandler(controller.statement));
router.get('/calculations/:id/detailed', PRINT, validate(idParamsSchema), asyncHandler(controller.detailedReport));

// الطباعة الجماعية — **تجميع وترتيب لمستندات قائمة، لا مستند جديد**. المساران قراءة
// خالصة تحت `print`: الأول يملأ قائمتَي الحوار (موظف ذو كشوف · سنواته)، والثاني يعيد
// كشوف السنة مرتّبة تصاعديًا مبنيّةً بنفس دالة الكشف الفردي حرفيًا.
router.get('/print-index', PRINT, asyncHandler(controller.printIndex));
router.get('/employees/:employeeId/years/:year/statements', PRINT, validate(annualFileSchema), asyncHandler(controller.yearStatements));

// ── سجل المديونيات والسلف ────────────────────────────────────────────────────
// نفس مفاتيح صلاحيات الوحدة، بلا مفتاح جديد: السجل امتداد لها لا وحدة ثانية، ومن
// يملك تحرير حسبة الشهر هو نفسه من يملك تسجيل سلفة الموظف.
//
// **السجل غير مرتبط بسنة**: مساره تحت الموظف لا تحت سنة، فمديونية ٢٠٢٦ تظهر في
// ٢٠٢٧ بلا نسخ ولا ترحيل (المتطلب ٢٢).
router.get('/employees/:employeeId/debts', READ, validate(employeeParamsSchema), asyncHandler(debtController.list));
router.get('/employees/:employeeId/debts/open', READ, validate(employeeParamsSchema), asyncHandler(debtController.listOpen));
router.get('/debts/:id', READ, validate(idParamsSchema), asyncHandler(debtController.getById));
router.post('/employees/:employeeId/debts', CREATE, validate(createDebtSchema), asyncHandler(debtController.create));
router.put('/debts/:id', UPDATE, validate(updateDebtSchema), asyncHandler(debtController.update));
router.delete('/debts/:id', DELETE, validate(idParamsSchema), asyncHandler(debtController.remove));

// السداد اليدوي — حركة دفتر خارج الحسبة الشهرية. أما سداد الشهر فلا مسار مستقل له:
// يُنشأ ويُعدَّل ويُحذف عبر حفظ الحسبة نفسها، فيبقى مصدر واحد لا مصدران متنافسان.
router.post('/debts/:id/payments', CREATE, validate(createManualPaymentSchema), asyncHandler(debtController.createManualPayment));
router.put('/debt-payments/:id', UPDATE, validate(updateManualPaymentSchema), asyncHandler(debtController.updateManualPayment));
router.delete('/debt-payments/:id', DELETE, validate(idParamsSchema), asyncHandler(debtController.deleteManualPayment));

export default router;
