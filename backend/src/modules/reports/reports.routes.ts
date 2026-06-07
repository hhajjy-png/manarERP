import { Router } from 'express';
import { reportsService } from './reports.service';
import { buildExcel } from '../../shared/services/reportEngine/excel.service';
import { buildPdf } from '../../shared/services/reportEngine/pdf.service';
import { authenticate } from '../../core/middleware/auth.middleware';
import { requirePermission } from '../../core/middleware/rbac.middleware';
import { asyncHandler } from '../../core/utils/asyncHandler';
import { ok } from '../../core/utils/response';
import { recordAudit } from '../../core/middleware/audit';
import { AppError } from '../../core/errors/AppError';
import { ROLES } from '../../config/constants';

// Reports that require an additional module permission beyond reports.read / reports.export.
const REPORT_EXTRA_PERMISSION: Record<string, string> = {
  payroll: 'payroll.read',
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

/** تصدير التقرير كـ Excel أو PDF. format=excel|pdf */
router.get(
  '/:type/export',
  requirePermission('reports.export'),
  asyncHandler(async (req, res) => {
    const { type } = req.params;
    assertReportAccess(type, req.user!.roleName, req.permissions ?? []);
    const format = (req.query.format as string) === 'pdf' ? 'pdf' : 'excel';
    const data = await reportsService.build(type, req.query);

    await recordAudit({ req, action: 'EXPORT', module: 'reports', entityId: type, newValue: { format } });

    if (format === 'pdf') {
      const buf = await buildPdf(data);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="report-${type}.pdf"`);
      res.send(buf);
    } else {
      const buf = await buildExcel(data);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="report-${type}.xlsx"`);
      res.send(buf);
    }
  }),
);

export default router;
