import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import DataTable, { PageMeta } from '../components/DataTable';
import StatCard from '../components/StatCard';
import { dateText, money } from '../config/modules';
import { useAuth } from '../stores/authStore';

type EmployeeOption = { id: number; fullName: string; code: string };
type PayrollLine = { id: number; type: string; label: string; amount: number };
type PayrollRow = {
  id: number;
  employee: { id: number; code: string; fullName: string; department?: string | null };
  month: number;
  year: number;
  snapshotBaseSalary: number;
  baseSalary: number;
  grossSalary: number;
  netSalary: number;
  totalAllowances: number;
  totalDeductions: number;
  totalAdvances: number;
  overtimeHours: number;
  overtimeAmount: number;
  status: string;
  paidAt?: string | null;
  lines: PayrollLine[];
};
type SalaryPaymentRow = {
  id: number;
  paymentDate?: string | null;
  sourceMonth?: string | null;
  transactionId: string;
  beneficiaryName: string;
  bankName?: string | null;
  amount: number;
  civilId?: string | null;
  status?: string | null;
};

const now = new Date();
const initialMonth = now.getMonth() + 1;
const initialYear = now.getFullYear();

function statusPill(status: string) {
  const cls = status === 'PAID' ? 'green' : status === 'APPROVED' ? 'blue' : status === 'CANCELLED' ? 'red' : 'amber';
  return <span className={`pill ${cls}`}>{status}</span>;
}

export default function Salaries() {
  const { hasPermission } = useAuth();
  const [tab, setTab] = useState<'payroll' | 'history'>('payroll');
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [rows, setRows] = useState<PayrollRow[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [page, setPage] = useState(1);
  const [month, setMonth] = useState(initialMonth);
  const [year, setYear] = useState(initialYear);
  const [employeeId, setEmployeeId] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [adjustPayrollId, setAdjustPayrollId] = useState('');
  const [adjustType, setAdjustType] = useState<'ALLOWANCE' | 'DEDUCTION'>('ALLOWANCE');
  const [adjustLabel, setAdjustLabel] = useState('');
  const [adjustAmount, setAdjustAmount] = useState('');

  const [inputEmployeeId, setInputEmployeeId] = useState('');
  const [inputKind, setInputKind] = useState<'allowance' | 'deduction' | 'advance'>('allowance');
  const [inputName, setInputName] = useState('');
  const [inputAmount, setInputAmount] = useState('');

  const [historyRows, setHistoryRows] = useState<SalaryPaymentRow[]>([]);
  const [historyMeta, setHistoryMeta] = useState<PageMeta | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyQuery, setHistoryQuery] = useState('');

  const [payingRowId, setPayingRowId] = useState<number | null>(null);
  const [payMethod, setPayMethod] = useState('BANK');

  const canGenerate = hasPermission('payroll.generate') || hasPermission('payroll.create');
  const canApprove = hasPermission('payroll.approve');
  const canPay = hasPermission('payroll.pay');
  const canAdjust = hasPermission('payroll.adjust');
  const canCancel = hasPermission('payroll.cancel');
  const canPayslip = hasPermission('payroll.payslip') || hasPermission('payroll.read');

  async function loadPayroll() {
    const res = await api.get('/payroll', {
      params: {
        page,
        pageSize: 12,
        month,
        year,
        employeeId: employeeId || undefined,
        status: status || undefined,
      },
    });
    setRows(res.data.data.data ?? []);
    setMeta(res.data.data.meta ?? null);
  }

  async function loadHistory() {
    const res = await api.get('/salaries', { params: { page: historyPage, pageSize: 12, search: historyQuery } });
    setHistoryRows(res.data.data.data ?? []);
    setHistoryMeta(res.data.data.meta ?? null);
  }

  useEffect(() => {
    api.get('/employees', { params: { pageSize: 500, status: 'ACTIVE' } })
      .then((res) => setEmployees(res.data.data.data ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadPayroll().catch((e) => setError(errorMessage(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, month, year, employeeId, status]);

  useEffect(() => {
    if (tab === 'history') loadHistory().catch((e) => setError(errorMessage(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, historyPage, historyQuery]);

  const totals = useMemo(() => {
    return rows.reduce((acc, row) => {
      acc.gross += Number(row.grossSalary ?? 0);
      acc.net += Number(row.netSalary ?? 0);
      acc.count += 1;
      if (row.status === 'PAID') acc.paid += 1;
      return acc;
    }, { gross: 0, net: 0, count: 0, paid: 0 });
  }, [rows]);

  async function runAction(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await fn();
      await loadPayroll();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function generatePayroll() {
    await runAction(async () => {
      const res = await api.post('/payroll/generate', {
        month,
        year,
        employeeId: employeeId ? Number(employeeId) : undefined,
      });
      setMessage(`Generated ${res.data.data.generated} payroll records.`);
    });
  }

  async function addPayrollInput() {
    if (!inputEmployeeId || !inputAmount || (inputKind !== 'advance' && !inputName.trim())) return;
    await runAction(async () => {
      const payload = {
        employeeId: Number(inputEmployeeId),
        name: inputName,
        amount: Number(inputAmount),
      };
      if (inputKind === 'allowance') await api.post('/payroll/allowances', payload);
      if (inputKind === 'deduction') await api.post('/payroll/recurring-deductions', payload);
      if (inputKind === 'advance') await api.post('/payroll/advances', { employeeId: Number(inputEmployeeId), amount: Number(inputAmount), notes: inputName });
      setInputName('');
      setInputAmount('');
      setMessage('Payroll input saved.');
    });
  }

  async function addManualLine() {
    if (!adjustPayrollId || !adjustLabel.trim() || !adjustAmount) return;
    await runAction(async () => {
      await api.post(`/payroll/${adjustPayrollId}/lines`, {
        type: adjustType,
        label: adjustLabel,
        amount: Number(adjustAmount),
      });
      setAdjustLabel('');
      setAdjustAmount('');
      setMessage('Adjustment line added.');
    });
  }

  const payrollColumns = [
    { key: 'employee', label: 'Employee', render: (r: PayrollRow) => <strong>{r.employee?.fullName}</strong> },
    { key: 'period', label: 'Period', render: (r: PayrollRow) => `${r.month}/${r.year}` },
    { key: 'snapshotBaseSalary', label: 'Base', render: (r: PayrollRow) => money(r.snapshotBaseSalary ?? r.baseSalary) },
    { key: 'grossSalary', label: 'Gross', render: (r: PayrollRow) => money(r.grossSalary) },
    { key: 'totalDeductions', label: 'Deductions', render: (r: PayrollRow) => money(Number(r.totalDeductions ?? 0) + Number(r.totalAdvances ?? 0)) },
    { key: 'overtime', label: 'Overtime', render: (r: PayrollRow) => `${Number(r.overtimeHours ?? 0).toFixed(3)}h / ${money(r.overtimeAmount)}` },
    { key: 'netSalary', label: 'Net', render: (r: PayrollRow) => <strong>{money(r.netSalary)}</strong> },
    { key: 'status', label: 'Status', render: (r: PayrollRow) => statusPill(r.status) },
  ];

  const historyColumns = [
    { key: 'paymentDate', label: 'Payment date', render: (r: SalaryPaymentRow) => dateText(r.paymentDate) },
    { key: 'sourceMonth', label: 'Source month' },
    { key: 'transactionId', label: 'Transaction', render: (r: SalaryPaymentRow) => <span style={{ fontFamily: 'monospace' }}>{r.transactionId}</span> },
    { key: 'beneficiaryName', label: 'Beneficiary', render: (r: SalaryPaymentRow) => <strong>{r.beneficiaryName}</strong> },
    { key: 'bankName', label: 'Bank' },
    { key: 'amount', label: 'Amount', render: (r: SalaryPaymentRow) => money(r.amount) },
    { key: 'civilId', label: 'Civil ID', render: (r: SalaryPaymentRow) => <span style={{ fontFamily: 'monospace' }}>{r.civilId ?? '-'}</span> },
    { key: 'status', label: 'Status', render: (r: SalaryPaymentRow) => <span className="pill green">{r.status ?? '-'}</span> },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Payroll</h2>
          <p>Monthly payroll generation, approvals, payment posting, payslips, and imported salary history.</p>
        </div>
      </div>

      <div className="toolbar">
        <button className={`btn ${tab === 'payroll' ? '' : 'secondary'}`} onClick={() => setTab('payroll')}>Payroll runs</button>
        <button className={`btn ${tab === 'history' ? '' : 'secondary'}`} onClick={() => setTab('history')}>Imported history</button>
      </div>

      {error && <div className="alert error" style={{ marginBottom: 14 }}>{error}</div>}
      {message && <div className="alert success" style={{ marginBottom: 14 }}>{message}</div>}

      {tab === 'payroll' ? (
        <>
          <div className="toolbar">
            <input type="number" min={1} max={12} value={month} onChange={(e) => { setMonth(Number(e.target.value)); setPage(1); }} style={{ width: 100 }} />
            <input type="number" min={2000} max={2100} value={year} onChange={(e) => { setYear(Number(e.target.value)); setPage(1); }} style={{ width: 120 }} />
            <select value={employeeId} onChange={(e) => { setEmployeeId(e.target.value); setPage(1); }}>
              <option value="">All active employees</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
            </select>
            <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
              <option value="">All statuses</option>
              <option value="DRAFT">DRAFT</option>
              <option value="APPROVED">APPROVED</option>
              <option value="PAID">PAID</option>
              <option value="CANCELLED">CANCELLED</option>
            </select>
            {canGenerate && <button className="btn" onClick={generatePayroll} disabled={busy}>Generate</button>}
          </div>

          <div className="stats" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
            <StatCard label="Payroll records" value={totals.count} icon="PR" color="var(--blue)" bg="var(--blue-light)" />
            <StatCard label="Gross total" value={money(totals.gross)} icon="GR" color="var(--green)" bg="var(--green-light)" />
            <StatCard label="Net total" value={money(totals.net)} icon="NT" color="var(--amber)" bg="var(--amber-light)" />
            <StatCard label="Paid records" value={totals.paid} icon="PD" color="var(--green)" bg="var(--green-light)" />
          </div>

          {canAdjust && (
            <div className="card" style={{ marginBottom: 18 }}>
              <h3 style={{ marginBottom: 12 }}>Payroll inputs and adjustments</h3>
              <div className="toolbar" style={{ marginBottom: 12 }}>
                <select value={inputEmployeeId} onChange={(e) => setInputEmployeeId(e.target.value)}>
                  <option value="">Employee</option>
                  {employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
                </select>
                <select value={inputKind} onChange={(e) => setInputKind(e.target.value as 'allowance' | 'deduction' | 'advance')}>
                  <option value="allowance">Recurring allowance</option>
                  <option value="deduction">Recurring deduction</option>
                  <option value="advance">Advance</option>
                </select>
                <input placeholder={inputKind === 'advance' ? 'Notes' : 'Name'} value={inputName} onChange={(e) => setInputName(e.target.value)} />
                <input type="number" step="0.001" placeholder="Amount" value={inputAmount} onChange={(e) => setInputAmount(e.target.value)} />
                <button className="btn secondary" disabled={busy} onClick={addPayrollInput}>Save input</button>
              </div>
              <div className="toolbar">
                <select value={adjustPayrollId} onChange={(e) => setAdjustPayrollId(e.target.value)}>
                  <option value="">Draft payroll</option>
                  {rows.filter((r) => r.status === 'DRAFT').map((r) => <option key={r.id} value={r.id}>{r.employee.fullName} - {r.month}/{r.year}</option>)}
                </select>
                <select value={adjustType} onChange={(e) => setAdjustType(e.target.value as 'ALLOWANCE' | 'DEDUCTION')}>
                  <option value="ALLOWANCE">Manual allowance</option>
                  <option value="DEDUCTION">Manual deduction</option>
                </select>
                <input placeholder="Label" value={adjustLabel} onChange={(e) => setAdjustLabel(e.target.value)} />
                <input type="number" step="0.001" placeholder="Amount" value={adjustAmount} onChange={(e) => setAdjustAmount(e.target.value)} />
                <button className="btn secondary" disabled={busy} onClick={addManualLine}>Add line</button>
              </div>
            </div>
          )}

          <DataTable
            columns={payrollColumns}
            rows={rows}
            meta={meta}
            onPage={setPage}
            actions={(row: PayrollRow) => (
              <>
                {canPayslip && <Link className="btn secondary sm" to={`/payroll/${row.id}/payslip`}>Payslip</Link>}{' '}
                {canApprove && row.status === 'DRAFT' && <button className="btn secondary sm" disabled={busy} onClick={() => runAction(() => api.patch(`/payroll/${row.id}/approve`))}>Approve</button>}{' '}
                {canPay && row.status === 'APPROVED' && (
                  payingRowId === row.id
                    ? <>
                        <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} style={{ fontSize: 12, padding: '2px 4px' }}>
                          <option value="CASH">نقداً</option>
                          <option value="BANK">تحويل بنكي</option>
                          <option value="CHEQUE">شيك</option>
                          <option value="TRANSFER">تحويل</option>
                        </select>{' '}
                        <button className="btn secondary sm" disabled={busy} onClick={() => { setPayingRowId(null); runAction(() => api.patch(`/payroll/${row.id}/pay`, { paymentMethod: payMethod })); }}>تأكيد</button>{' '}
                        <button className="btn secondary sm" onClick={() => setPayingRowId(null)}>إلغاء</button>
                      </>
                    : <button className="btn secondary sm" disabled={busy} onClick={() => { setPayMethod('BANK'); setPayingRowId(row.id); }}>Pay</button>
                )}{' '}
                {canCancel && ['DRAFT', 'APPROVED'].includes(row.status) && <button className="btn secondary sm" disabled={busy} onClick={() => runAction(() => api.patch(`/payroll/${row.id}/cancel`))}>Cancel</button>}
              </>
            )}
          />
        </>
      ) : (
        <>
          <div className="toolbar">
            <input
              placeholder="Search imported salary payments"
              value={historyQuery}
              onChange={(e) => { setHistoryQuery(e.target.value); setHistoryPage(1); }}
              style={{ flex: 1, minWidth: 260 }}
            />
          </div>
          <DataTable columns={historyColumns} rows={historyRows} meta={historyMeta} onPage={setHistoryPage} />
        </>
      )}
    </div>
  );
}
