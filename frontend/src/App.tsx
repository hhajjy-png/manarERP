import { useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './stores/authStore';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ResourcePage from './pages/ResourcePage';
import Invoices from './pages/Invoices';
import Salaries from './pages/Salaries';
import Accounting from './pages/Accounting';
import Reports from './pages/Reports';
import ReportPrint from './pages/ReportPrint';
import PayrollPayslip from './pages/PayrollPayslip';
import Settings from './pages/Settings';
import Backup from './pages/Backup';
import Users from './pages/Users';
import Inventory from './pages/Inventory';
import Cheques from './pages/Cheques';
import DataImport from './pages/DataImport';
import AuditLog from './pages/AuditLog';
import Maintenance from './pages/Maintenance';
import Prices from './pages/Prices';
import Attendance from './pages/Attendance';
import Forms from './pages/Forms';
import Expenses from './pages/Expenses';
import InvoicePreview from './pages/InvoicePreview';
import SalaryCertificate from './pages/SalaryCertificate';
import ToWhomItMayConcern from './pages/ToWhomItMayConcern';
import LeaveRequest from './pages/LeaveRequest';
import ReturnToWork from './pages/ReturnToWork';
import SalaryAdvance from './pages/SalaryAdvance';
import Resignation from './pages/Resignation';
import EmployeeWarning from './pages/EmployeeWarning';
import PerformanceEvaluation from './pages/PerformanceEvaluation';
import EmploymentContract from './pages/EmploymentContract';
import PayrollBankImport from './pages/PayrollBankImport';
import BankStatementImport from './pages/BankStatementImport';
import BankReconciliation from './pages/BankReconciliation';
import BankSalaryAnalytics from './pages/BankSalaryAnalytics';
import Quotation from './pages/Quotation';
import PurchaseRequest from './pages/PurchaseRequest';
import ExecutiveDecisionCenter from './pages/ExecutiveDecisionCenter';
import FinancialOperationsDashboard from './pages/FinancialOperationsDashboard';
import Statements from './pages/Statements';
import FinancialCenter from './pages/FinancialCenter';
import Integrations from './pages/Integrations';
import DocumentExpirationCenter from './pages/DocumentExpirationCenter';
import DocumentVerify from './pages/DocumentVerify';
import PaymentVoucher from './pages/PaymentVoucher';
import ReceiptVoucher from './pages/ReceiptVoucher';
import AIAssistant from './pages/AIAssistant';

export default function App() {
  const { loadSession } = useAuth();
  useEffect(() => { loadSession(); }, [loadSession]);

  return (
    <HashRouter>
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
          <Route path="/expirations" element={<DocumentExpirationCenter />} />
          <Route path="/ai-assistant" element={<AIAssistant />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
