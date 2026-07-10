import { Suspense, lazy, useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './stores/authStore';
import { FinancialPeriodProvider } from './context/FinancialPeriodContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import PageLoader from './components/PageLoader';
// Login is the first screen — kept eager to avoid a load waterfall on first paint.
import Login from './pages/Login';

// All authenticated / standalone pages are lazy-loaded so their code (and the
// heavy libraries they pull in — recharts, xlsx, mammoth, jszip) leaves the
// initial bundle and is fetched only when the route is actually opened.
const Dashboard = lazy(() => import('./pages/Dashboard'));
const ResourcePage = lazy(() => import('./pages/ResourcePage'));
const Invoices = lazy(() => import('./pages/Invoices'));
const Salaries = lazy(() => import('./pages/Salaries'));
const Accounting = lazy(() => import('./pages/Accounting'));
const Reports = lazy(() => import('./pages/Reports'));
const ReportPrint = lazy(() => import('./pages/ReportPrint'));
const PayrollPayslip = lazy(() => import('./pages/PayrollPayslip'));
const Settings = lazy(() => import('./pages/Settings'));
const Backup = lazy(() => import('./pages/Backup'));
const Users = lazy(() => import('./pages/Users'));
const Inventory = lazy(() => import('./pages/Inventory'));
const Cheques = lazy(() => import('./pages/Cheques'));
const DataImport = lazy(() => import('./pages/DataImport'));
const AuditLog = lazy(() => import('./pages/AuditLog'));
const Maintenance = lazy(() => import('./pages/Maintenance'));
const Prices = lazy(() => import('./pages/Prices'));
const Attendance = lazy(() => import('./pages/Attendance'));
const Forms = lazy(() => import('./pages/Forms'));
const Expenses = lazy(() => import('./pages/Expenses'));
const InvoicePreview = lazy(() => import('./pages/InvoicePreview'));
const SalaryCertificate = lazy(() => import('./pages/SalaryCertificate'));
const ToWhomItMayConcern = lazy(() => import('./pages/ToWhomItMayConcern'));
const LeaveRequest = lazy(() => import('./pages/LeaveRequest'));
const ReturnToWork = lazy(() => import('./pages/ReturnToWork'));
const SalaryAdvance = lazy(() => import('./pages/SalaryAdvance'));
const Resignation = lazy(() => import('./pages/Resignation'));
const EmployeeWarning = lazy(() => import('./pages/EmployeeWarning'));
const PerformanceEvaluation = lazy(() => import('./pages/PerformanceEvaluation'));
const EmploymentContract = lazy(() => import('./pages/EmploymentContract'));
const PayrollBankImport = lazy(() => import('./pages/PayrollBankImport'));
const BankStatementImport = lazy(() => import('./pages/BankStatementImport'));
const BankReconciliation = lazy(() => import('./pages/BankReconciliation'));
const BankSalaryAnalytics = lazy(() => import('./pages/BankSalaryAnalytics'));
const BankAccounts = lazy(() => import('./pages/BankAccounts'));
const BankAccountExplorer = lazy(() => import('./pages/BankAccountExplorer'));
const Quotation = lazy(() => import('./pages/Quotation'));
const PurchaseRequest = lazy(() => import('./pages/PurchaseRequest'));
const ExecutiveDecisionCenter = lazy(() => import('./pages/ExecutiveDecisionCenter'));
const FinancialOperationsDashboard = lazy(() => import('./pages/FinancialOperationsDashboard'));
const Statements = lazy(() => import('./pages/Statements'));
const FinancialCenter = lazy(() => import('./pages/FinancialCenter'));
const Integrations = lazy(() => import('./pages/Integrations'));
const DocumentExpirationCenter = lazy(() => import('./pages/DocumentExpirationCenter'));
const DocumentVerify = lazy(() => import('./pages/DocumentVerify'));
const PaymentVoucher = lazy(() => import('./pages/PaymentVoucher'));
const ReceiptVoucher = lazy(() => import('./pages/ReceiptVoucher'));
const AIAssistant = lazy(() => import('./pages/AIAssistant'));

export default function App() {
  const { loadSession } = useAuth();
  useEffect(() => { loadSession(); }, [loadSession]);

  return (
    <HashRouter>
      {/* الفترة المالية العامة — سياق على مستوى التطبيق ينجو من التنقّل بين الصفحات
          (خارج Suspense) ويعاد تهيئته إلى السنة الحالية عند إعادة التشغيل. */}
      <FinancialPeriodProvider>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          {/* صفحة التحقق من الوثائق — عامة، لا تتطلب تسجيل الدخول */}
          <Route path="/verify/:uuid" element={<DocumentVerify />} />
          {/* صفحة طباعة التقرير — خارج التخطيط لطباعة نظيفة بعربية سليمة */}
          <Route path="/print/:type" element={<ProtectedRoute><ReportPrint /></ProtectedRoute>} />
          <Route path="/payroll/:id/payslip" element={<ProtectedRoute><PayrollPayslip /></ProtectedRoute>} />
          <Route path="/invoices/:id/preview" element={<ProtectedRoute><InvoicePreview /></ProtectedRoute>} />
          <Route path="/forms/salary-certificate/:employeeId" element={<ProtectedRoute><SalaryCertificate /></ProtectedRoute>} />
          <Route path="/forms/to-whom-it-may-concern/:employeeId" element={<ProtectedRoute><ToWhomItMayConcern /></ProtectedRoute>} />
          <Route path="/forms/leave-request/:employeeId" element={<ProtectedRoute><LeaveRequest /></ProtectedRoute>} />
          <Route path="/forms/return-to-work/:employeeId" element={<ProtectedRoute><ReturnToWork /></ProtectedRoute>} />
          <Route path="/forms/salary-advance/:employeeId" element={<ProtectedRoute><SalaryAdvance /></ProtectedRoute>} />
          <Route path="/forms/resignation/:employeeId" element={<ProtectedRoute><Resignation /></ProtectedRoute>} />
          <Route path="/forms/employee-warning/:employeeId" element={<ProtectedRoute><EmployeeWarning /></ProtectedRoute>} />
          <Route path="/forms/performance-evaluation/:employeeId" element={<ProtectedRoute><PerformanceEvaluation /></ProtectedRoute>} />
          <Route path="/forms/employment-contract" element={<ProtectedRoute><EmploymentContract /></ProtectedRoute>} />
          <Route path="/forms/employment-contract/:employeeId" element={<ProtectedRoute><EmploymentContract /></ProtectedRoute>} />
          <Route path="/forms/quotation" element={<ProtectedRoute><Quotation /></ProtectedRoute>} />
          <Route path="/forms/purchase-request" element={<ProtectedRoute><PurchaseRequest /></ProtectedRoute>} />
          <Route path="/forms/payment-voucher/:chequeId" element={<ProtectedRoute><PaymentVoucher /></ProtectedRoute>} />
          <Route path="/forms/receipt-voucher" element={<ProtectedRoute><ReceiptVoucher /></ProtectedRoute>} />
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Dashboard />} />
            <Route path="/contracts" element={<ResourcePage moduleKey="contracts" />} />
            <Route path="/customers" element={<ResourcePage moduleKey="customers" />} />
            <Route path="/equipment" element={<ResourcePage moduleKey="equipment" />} />
            <Route path="/employees" element={<ResourcePage moduleKey="employees" />} />
            <Route path="/suppliers" element={<ResourcePage moduleKey="suppliers" />} />
            <Route path="/expenses" element={<Expenses />} />
            <Route path="/users" element={<Users />} />
            <Route path="/invoices" element={<Invoices />} />
            <Route path="/salaries" element={<Salaries />} />
            <Route path="/accounting" element={<Accounting />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/executive" element={<ExecutiveDecisionCenter />} />
            <Route path="/financial-ops" element={<FinancialOperationsDashboard />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/backup" element={<Backup />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/cheques" element={<Cheques />} />
            <Route path="/import" element={<DataImport />} />
            <Route path="/payroll/bank-import" element={<PayrollBankImport />} />
            <Route path="/payroll/bank-analytics" element={<BankSalaryAnalytics />} />
            <Route path="/audit" element={<AuditLog />} />
            <Route path="/maintenance" element={<Maintenance />} />
            <Route path="/prices" element={<Prices />} />
            <Route path="/attendance" element={<Attendance />} />
            <Route path="/forms" element={<Forms />} />
            <Route path="/statements" element={<Statements />} />
            <Route path="/financial" element={<FinancialCenter />} />
            <Route path="/integrations" element={<Integrations />} />
            <Route path="/bank-statement-import" element={<BankStatementImport />} />
            <Route path="/bank-reconciliation" element={<BankReconciliation />} />
            <Route path="/bank-reconciliation/:importId" element={<BankReconciliation />} />
            <Route path="/bank-accounts" element={<BankAccounts />} />
            <Route path="/bank-accounts/:accountKey" element={<BankAccountExplorer />} />
            <Route path="/expirations" element={<DocumentExpirationCenter />} />
            <Route path="/ai-assistant" element={<AIAssistant />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
      </FinancialPeriodProvider>
    </HashRouter>
  );
}
