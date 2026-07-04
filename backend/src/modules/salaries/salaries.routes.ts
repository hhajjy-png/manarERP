import { Router } from 'express';
import { salariesService } from './salaries.service';
import { bankAnalyticsService } from './salaries.bankAnalytics.service';
import { authenticate } from '../../core/middleware/auth.middleware';
import { requirePermission } from '../../core/middleware/rbac.middleware';
import { asyncHandler } from '../../core/utils/asyncHandler';
import { ok } from '../../core/utils/response';

const router = Router();
router.use(authenticate);

const canRead = requirePermission('payroll.read');
const canImportRead = requirePermission('import.read');

router.get('/', canRead, asyncHandler(async (req, res) => ok(res, await salariesService.list(req.query))));
router.get('/summary', canRead, asyncHandler(async (_req, res) => ok(res, await salariesService.summary())));

// NOTE: Legacy payroll bank-import routes (POST /bank-import/preview, /bank-import/execute)
// were retired in Phase 1 of the Payroll Bank Import legacy retirement. Bank-file imports now
// go exclusively through the payrollBankImport module (/api/payroll-bank-import/*), gated by the
// payrollBankImport.* permission set. The read-only bank-payments analytics routes below stay.

router.get(
  '/bank-payments/analytics',
  canImportRead,
  asyncHandler(async (req, res) => {
    const filters = {
      payrollMonth: req.query.payrollMonth ? Number(req.query.payrollMonth) : undefined,
      payrollYear: req.query.payrollYear ? Number(req.query.payrollYear) : undefined,
      employeeId: req.query.employeeId ? Number(req.query.employeeId) : undefined,
    };
    ok(res, await bankAnalyticsService.getAnalytics(filters));
  }),
);

router.get(
  '/bank-payments/employees/search',
  canImportRead,
  asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? '');
    ok(res, await bankAnalyticsService.searchEmployees(q));
  }),
);

router.get(
  '/bank-payments/employee/:employeeId',
  canImportRead,
  asyncHandler(async (req, res) => {
    const employeeId = Number(req.params.employeeId);
    const filters = {
      payrollMonth: req.query.payrollMonth ? Number(req.query.payrollMonth) : undefined,
      payrollYear: req.query.payrollYear ? Number(req.query.payrollYear) : undefined,
      employeeId,
    };
    ok(res, await bankAnalyticsService.getEmployeeDetail(employeeId, filters));
  }),
);

router.get(
  '/bank-payments/transactions',
  canImportRead,
  asyncHandler(async (req, res) => {
    const q = req.query as Record<string, string | undefined>;
    const filters = {
      payrollMonth: q.payrollMonth ? Number(q.payrollMonth) : undefined,
      payrollYear: q.payrollYear ? Number(q.payrollYear) : undefined,
      employeeId: q.employeeId ? Number(q.employeeId) : undefined,
      dateFrom: q.dateFrom,
      dateTo: q.dateTo,
      amountFrom: q.amountFrom ? Number(q.amountFrom) : undefined,
      amountTo: q.amountTo ? Number(q.amountTo) : undefined,
      transactionId: q.transactionId,
      civilId: q.civilId,
      bankAccount: q.bankAccount,
      status: q.status,
      search: q.search,
      sortBy: q.sortBy,
      sortDir: (q.sortDir === 'asc' || q.sortDir === 'desc') ? q.sortDir as 'asc' | 'desc' : undefined,
    };
    ok(res, await bankAnalyticsService.getTransactions(filters, req.query as Record<string, unknown>));
  }),
);

router.get(
  '/bank-payments/export',
  canImportRead,
  asyncHandler(async (req, res) => {
    const filters = {
      payrollMonth: req.query.payrollMonth ? Number(req.query.payrollMonth) : undefined,
      payrollYear: req.query.payrollYear ? Number(req.query.payrollYear) : undefined,
      employeeId: req.query.employeeId ? Number(req.query.employeeId) : undefined,
    };
    const buffer = await bankAnalyticsService.exportAnalytics(filters);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="bank-analytics.xlsx"');
    res.send(buffer);
  }),
);

export default router;
