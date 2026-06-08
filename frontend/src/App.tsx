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

export default function App() {
  const { loadSession } = useAuth();
  useEffect(() => { loadSession(); }, [loadSession]);

  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        {/* صفحة طباعة التقرير — خارج التخطيط لطباعة نظيفة بعربية سليمة */}
        <Route path="/print/:type" element={<ProtectedRoute><ReportPrint /></ProtectedRoute>} />
        <Route path="/payroll/:id/payslip" element={<ProtectedRoute><PayrollPayslip /></ProtectedRoute>} />
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
          <Route path="/expenses" element={<ResourcePage moduleKey="expenses" />} />
          <Route path="/users" element={<Users />} />
          <Route path="/invoices" element={<Invoices />} />
          <Route path="/salaries" element={<Salaries />} />
          <Route path="/accounting" element={<Accounting />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/backup" element={<Backup />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/cheques" element={<Cheques />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
