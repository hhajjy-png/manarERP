import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { errorHandler, notFoundHandler } from './core/errors/errorHandler';

// راوترات الوحدات
import authRoutes from './modules/auth/auth.routes';
import usersRoutes from './modules/users/users.routes';
import rolesRoutes from './modules/roles/roles.routes';
import customersRoutes from './modules/customers/customers.routes';
import contractsRoutes from './modules/contracts/contracts.routes';
import suppliersRoutes from './modules/suppliers/suppliers.routes';
import invoicesRoutes from './modules/invoices/invoices.routes';
import expensesRoutes from './modules/expenses/expenses.routes';
import transactionsRoutes from './modules/transactions/transactions.routes';
import equipmentRoutes from './modules/equipment/equipment.routes';
import maintenanceRoutes from './modules/maintenance/maintenance.routes';
import employeesRoutes from './modules/employees/employees.routes';
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
import importRoutes from './modules/import/import.routes';

/**
 * إنشاء تطبيق Express وتهيئة الـ Middlewares والمسارات.
 * منفصل عن server.ts ليسهل اختباره.
 */
export function createApp(): Application {
  const app = express();

  app.use(helmet());
  // الخدمة محلية فقط؛ نسمح للواجهة (Electron / Vite dev) بالوصول.
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

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
  app.use('/api/expenses', expensesRoutes);
  app.use('/api/transactions', transactionsRoutes);
  app.use('/api/equipment', equipmentRoutes);
  app.use('/api/maintenance', maintenanceRoutes);
  app.use('/api/employees', employeesRoutes);
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
  app.use('/api/import', importRoutes);

  // معالجة المسارات غير الموجودة + الأخطاء (يجب أن تكون في النهاية)
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
