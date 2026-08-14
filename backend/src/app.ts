import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { errorHandler, notFoundHandler } from './core/errors/errorHandler';
import { requestContextMiddleware } from './core/context/requestContext';

// راوترات الوحدات
import authRoutes from './modules/auth/auth.routes';
import usersRoutes from './modules/users/users.routes';
import rolesRoutes from './modules/roles/roles.routes';
import customersRoutes from './modules/customers/customers.routes';
import contractsRoutes from './modules/contracts/contracts.routes';
import suppliersRoutes from './modules/suppliers/suppliers.routes';
import invoicesRoutes from './modules/invoices/invoices.routes';
import paymentsRoutes from './modules/payments/payments.routes';
import expensesRoutes from './modules/expenses/expenses.routes';
import transactionsRoutes from './modules/transactions/transactions.routes';
import equipmentRoutes from './modules/equipment/equipment.routes';
import maintenanceRoutes from './modules/maintenance/maintenance.routes';
import employeesRoutes from './modules/employees/employees.routes';
import holidaysRoutes from './modules/holidays/holidays.routes';
import payrollRoutes from './modules/payroll/payroll.routes';
import salariesRoutes from './modules/salaries/salaries.routes';
import dashboardRoutes from './modules/dashboard/dashboard.routes';
import settingsRoutes from './modules/settings/settings.routes';
import auditRoutes from './modules/audit/audit.routes';
import backupsRoutes from './modules/backups/backups.routes';
import reportsRoutes from './modules/reports/reports.routes';
import accountingRoutes from './modules/accounting/accounting.routes';
import inventoryRoutes from './modules/inventory/inventory.routes';
import chequesRoutes from './modules/cheques/cheques.routes';
import chequeDesignerTemplatesRoutes from './modules/chequeDesignerTemplates/chequeDesignerTemplates.routes';
import importRoutes from './modules/import/import.routes';
import pricesRoutes from './modules/prices/prices.routes';
import workAnalysisRoutes from './modules/workAnalysis/workAnalysis.routes';
// مستحقات الموظف الشهرية — وحدة مستقلة، لا تكتب خارج جداولها الأربعة.
import employeeCompensationRoutes from './modules/employee-compensation/employeeCompensation.routes';
import formsRoutes from './modules/forms/forms.routes';
import internalRoutes from './modules/backups/internal.routes';
import executiveRoutes from './modules/executive/executive.routes';
import approvalHistoryRoutes from './modules/approval/approval.routes';
import { registerApprovalModules } from './modules/approval/approval.registry';
import statementsRoutes from './modules/statements/statements.routes';
import financialRoutes  from './modules/financial/financial.routes';
import verificationRoutes from './modules/verification/verification.routes';
import integrationsRoutes from './modules/integrations/integrations.routes';
import payrollBankImportRoutes from './modules/payrollBankImport/routes';
import payrollBankExportRoutes from './modules/payrollBankExport/payrollBankExport.routes';
import entitlementsBankExportRoutes from './modules/entitlementsBankExport/entitlementsBankExport.routes';
import bankStatementImportRoutes from './modules/bankStatementImport/routes.js';
import bankAccountsRoutes from './modules/bankAccounts/bankAccounts.routes.js';
import expirationsRoutes from './modules/expirations/expirations.routes';
import financialAnalysisRoutes from './modules/financialAnalysis/financialAnalysis.routes';
import collectionAnalysisRoutes from './modules/collectionAnalysis/collectionAnalysis.routes';
import printingRoutes from './modules/printing/printing.routes';
import attachmentsRouter from './modules/attachments/attachments.routes';
import searchRoutes from './modules/search/search.routes';
import lettersRoutes from './modules/letters/letters.routes';

/**
 * إنشاء تطبيق Express وتهيئة الـ Middlewares والمسارات.
 * منفصل عن server.ts ليسهل اختباره.
 */
export function createApp(): Application {
  // تسجيل وحدات الاعتماد قبل استقبال أي طلب — بدونه يرفض سجلّ الاعتماد كل نوع كيان.
  registerApprovalModules();

  const app = express();

  app.use(helmet());
  // الخدمة تعمل على localhost فقط — لا يمكن الوصول إليها من الشبكة.
  //
  // Origins المسموح بها:
  //   1. !origin (no Origin header) — طلبات من Electron Main Process أو أدوات مثل curl.
  //   2. 'null' (string) — Electron Production يحمّل الواجهة عبر win.loadFile() بروتوكول file://
  //      وعندما يرسل Renderer طلب HTTP إلى 127.0.0.1، يرسل المتصفح Origin: null.
  //      لا يوجد app:// في هذا المشروع — file:// هو البروتوكول الوحيد في الإنتاج.
  //   3. Vite dev server — http://localhost:5173 و http://127.0.0.1:5173.
  //
  // لا يوجد wildcard ولا origin: true.
  const ALLOWED_ORIGINS = new Set([
    'http://localhost:5173',    // Vite dev server
    'http://127.0.0.1:5173',   // Vite dev server (alt)
    'null',                     // Electron production: file:// page → Origin: null
  ]);
  app.use(cors({
    origin(origin, cb) {
      // !origin: no Origin header (Electron main, health checks, local tools)
      // ALLOWED_ORIGINS.has(origin): Vite dev or Electron production (null)
      if (!origin || ALLOWED_ORIGINS.has(origin)) return cb(null, true);
      return cb(new Error('CORS: origin not allowed'));
    },
    credentials: true,
  }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // يفتح سياق الطلب (AsyncLocalStorage) قبل كل الراوترات.
  // حارس قفل الفترة داخل طبقة GL يقرأ الفاعل من هنا دون تمريره عبر التواقيع.
  app.use(requestContextMiddleware);

  // فحص صحة الخدمة
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ success: true, status: 'ok', time: new Date().toISOString() });
  });

  // المسارات
  app.use('/api/auth', authRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api/roles', rolesRoutes);
  app.use('/api/customers', customersRoutes);
  app.use('/api/contracts', contractsRoutes);
  app.use('/api/suppliers', suppliersRoutes);
  app.use('/api/invoices', invoicesRoutes);
  app.use('/api/payments', paymentsRoutes);
  app.use('/api/expenses', expensesRoutes);
  app.use('/api/transactions', transactionsRoutes);
  app.use('/api/equipment', equipmentRoutes);
  app.use('/api/maintenance', maintenanceRoutes);
  app.use('/api/employees', employeesRoutes);
  app.use('/api/holidays', holidaysRoutes);
  app.use('/api/payroll', payrollRoutes);
  app.use('/api/salaries', salariesRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/audit', auditRoutes);
  app.use('/api/backups', backupsRoutes);
  app.use('/api/reports', reportsRoutes);
  app.use('/api/accounting', accountingRoutes);
  app.use('/api/inventory', inventoryRoutes);
  app.use('/api/cheques', chequesRoutes);
  app.use('/api/cheque-designer-templates', chequeDesignerTemplatesRoutes);
  app.use('/api/import', importRoutes);
  app.use('/api/prices', pricesRoutes);
  app.use('/api/forms', formsRoutes);
  app.use('/api/internal', internalRoutes);
  app.use('/api/executive', executiveRoutes);
  app.use('/api/approval-history', approvalHistoryRoutes);
  app.use('/api/statements', statementsRoutes);
  app.use('/api/financial',  financialRoutes);
  app.use('/api/verify', verificationRoutes);
  app.use('/api/integrations', integrationsRoutes);
  app.use('/api/payroll-bank-import', payrollBankImportRoutes);
  app.use('/api/payroll-bank-export', payrollBankExportRoutes);
  // كشف المستحقات الشهرية البنكي — مسار مستقل عن كشف الرواتب البنكي تمامًا.
  app.use('/api/entitlements-bank-export', entitlementsBankExportRoutes);
  app.use('/api/bank-statement-import', bankStatementImportRoutes);
  app.use('/api/bank-accounts', bankAccountsRoutes);
  app.use('/api/expirations', expirationsRoutes);
  app.use('/api/financial-analysis', financialAnalysisRoutes);
  // تحليل التحصيلات — محرّك مستقل يربط سنة إصدار الفاتورة بسنة تحصيلها.
  app.use('/api/collection-analysis', collectionAnalysisRoutes);
  // Print Center Foundation v1 — audit sink for PRINT / PDF_EXPORT events.
  app.use('/api/printing', printingRoutes);
  app.use('/api/attachments', attachmentsRouter);
  app.use('/api/search', searchRoutes);
  app.use('/api/letters', lettersRoutes);
  // تحليل الشغل والعمولة — أداة تحليل داخلية خارج الدورة المحاسبية.
  app.use('/api/work-analysis', workAnalysisRoutes);
  app.use('/api/employee-compensation', employeeCompensationRoutes);

  // معالجة المسارات غير الموجودة + الأخطاء (يجب أن تكون في النهاية)
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
