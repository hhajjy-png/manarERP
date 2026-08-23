import { Router } from 'express';
import { reportsService } from './reports.service';
import { buildExcel } from '../../shared/services/reportEngine/excel.service';
import { buildReportHtml } from '../../shared/services/reportEngine/html.service';
import { loadReportBranding } from '../../shared/services/reportEngine/brandingLoader';
import { applyInvoicePrintLayout } from './invoicePrintLayout';
import { authenticate } from '../../core/middleware/auth.middleware';
import { requirePermission } from '../../core/middleware/rbac.middleware';
import { asyncHandler } from '../../core/utils/asyncHandler';
import { ok } from '../../core/utils/response';
import { sendExcel } from '../../core/utils/excelResponse';
import { recordAudit } from '../../core/middleware/audit';
import { AppError } from '../../core/errors/AppError';
import { ROLES } from '../../config/constants';

// Reports that require an additional module permission beyond reports.read / reports.export.
//
// لا مفتاح صلاحية **جديد** هنا إطلاقًا: كل قيمة أدناه مفتاح قائم في `constants.ts`
// تملكه وحدته الأصلية. القاعدة أن مركز التقارير لا يصير بابًا خلفيًا لبيانات وحدة
// لا يملك المستخدم قراءتها في شاشتها.
//
// `employee-entitlements-monthly` يتبع سابقة `payroll` حرفيًا، ويستعمل مفتاح وحدته
// (`employeeCompensation.read`) لا مفتاح الرواتب: الوحدتان معزولتان عمدًا — من يملك
// صلاحية الرواتب لا يرث صلاحية المستحقات الشهرية والعكس صحيح.
const REPORT_EXTRA_PERMISSION: Record<string, string> = {
  payroll: 'payroll.read',
  'employee-entitlements-monthly': 'employeeCompensation.read',
  // تأمين المركبات — يتبع نفس السابقة: مركز التقارير ليس بابًا خلفيًا لبيانات وحدة
  // لا يملك المستخدم قراءتها في شاشتها.
  'vehicle-insurance': 'vehicleInsurance.read',
  // التقريران المُكمَلان في Financial Accuracy Hotfix Pack v1 — يقرآن بيانات وحدتيهما
  // فيرثان مفتاحيهما بنفس القاعدة أعلاه.
  'expenses-by-company': 'expenses.read',
  'prices-usage': 'prices.read',
};

function assertReportAccess(type: string, roleName: string, permissions: string[]): void {
  const extra = REPORT_EXTRA_PERMISSION[type];
  if (extra && roleName !== ROLES.SYSTEM_ADMIN && !permissions.includes(extra)) {
    throw AppError.forbidden('ليست لديك صلاحية لعرض هذا التقرير');
  }
}

const router = Router();
router.use(authenticate);

/** معاينة بيانات التقرير كـ JSON (للعرض في الواجهة قبل التصدير). */
router.get(
  '/:type/preview',
  requirePermission('reports.read'),
  asyncHandler(async (req, res) => {
    const { type } = req.params;
    assertReportAccess(type, req.user!.roleName, req.permissions ?? []);
    const data = await reportsService.build(type, req.query);
    ok(res, data);
  }),
);

/** تصدير التقرير كـ Excel أو HTML (يُرسَم PDF منه في Chromium). `format=pdf` مرفوض
 *  صراحةً — انظر شرح تقاعد PDFKit في الفرع أدناه. format=excel|html */
router.get(
  '/:type/export',
  requirePermission('reports.export'),
  asyncHandler(async (req, res) => {
    const { type } = req.params;
    assertReportAccess(type, req.user!.roleName, req.permissions ?? []);
    const rawFormat = req.query.format as string;
    const format = rawFormat === 'html' ? 'html' : rawFormat === 'pdf' ? 'pdf' : 'excel';
    const data = await reportsService.build(type, req.query);

    await recordAudit({ req, action: 'EXPORT', module: 'reports', entityId: type, newValue: { format } });

    if (format === 'html') {
      const branding = await loadReportBranding();
      const isInvoiceReport = type === 'invoices';
      const { data: printData, options: invoiceOptions } = isInvoiceReport
        ? applyInvoicePrintLayout(data, req.query.status as string | undefined)
        : { data, options: {} };
      const html = buildReportHtml(printData, {
        profile: 'a4-landscape',
        branding,
        showPageNumbers: true,
        generatedBy: req.user?.username,
        ...invoiceOptions,
      });
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', `inline; filename="report-${type}.html"`);
      return res.send(Buffer.from(html, 'utf-8'));
    }

    if (format === 'pdf') {
      /**
       * تقاعد PDFKit.
       *
       * كان هذا الفرع يبني PDF بـ PDFKit، وهو **لا يشكّل العربية ولا يوصل حروفها**، وكان
       * يبحث عن خط `Amiri-Regular.ttf` **غير موجود في المستودع أصلًا** — فيسقط إلى
       * Helvetica بلا محارف عربية. أي أن كل تقرير عربي خرج منه كان معطوبًا.
       *
       * ولم تكن الواجهة تستدعيه أبدًا: زرّ «تصدير PDF» يطلب `format=html` ثم يرسم المستند
       * في نافذة Chromium خفية (`exportPdfFromHtml`) — نفس التقارير، نفس البيانات، وعربية
       * سليمة. فالمسار الصحيح قائم ويعمل، والقديم كان فخًّا صامتًا.
       *
       * نردّ بخطأ صريح بدل أن نُرجع Excel صامتًا (تغيير سلوك خفي) أو ملفًا معطوبًا.
       */
      return res.status(400).json({
        success: false,
        error:
          'تصدير PDF من الخادم متوقّف (لا يدعم تشكيل العربية). استخدم format=html ثم تصدير PDF من التطبيق.',
      });
    }

    const buf = await buildExcel(data);
    sendExcel(res, buf, `report-${type}.xlsx`);
  }),
);

export default router;
