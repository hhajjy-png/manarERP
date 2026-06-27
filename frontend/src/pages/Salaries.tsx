import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { useT } from '../lib/i18n';
import DataTable, { PageMeta } from '../components/DataTable';
import StatCard from '../components/StatCard';
import { dateText, money } from '../config/modules';
import { useAuth } from '../stores/authStore';
import { usePersistedState } from '../hooks/usePersistedState';
import ExportExcelButton from '../components/ExportExcelButton';
import { downloadBlob } from '../utils/exportUtils';
import PrivateAmount from '../components/PrivateAmount';

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

export default function Salaries() {
  const { hasPermission } = useAuth();
  const { t } = useT();
  const navigate = useNavigate();
  const [tab, setTab] = usePersistedState<'payroll' | 'history'>('sal:tab', 'payroll');
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [rows, setRows] = useState<PayrollRow[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [page, setPage] = useState(1);
  const [month, setMonth] = usePersistedState<number>('sal:month', initialMonth);
  const [year, setYear] = usePersistedState<number>('sal:year', initialYear);
  const [employeeId, setEmployeeId] = useState('');
  const [status, setStatus] = usePersistedState('sal:status', '');
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
  const [excelBusy, setExcelBusy] = useState(false);

  const canGenerate = hasPermission('payroll.generate') || hasPermission('payroll.create');
  const canApprove = hasPermission('payroll.approve');
  const canPay = hasPermission('payroll.pay');
  const canAdjust = hasPermission('payroll.adjust');
  const canCancel = hasPermission('payroll.cancel');
  const canPayslip = hasPermission('payroll.payslip') || hasPermission('payroll.read');
  const canExport = hasPermission('reports.export') || hasPermission('payroll.read');
  const canImport = hasPermission('import.create');

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
      setMessage(t('page.salaries.generated', { count: res.data.data.generated }));
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
      setMessage(t('page.salaries.input_saved'));
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
      setMessage(t('page.salaries.line_added'));
    });
  }

  async function downloadPayrollExcel() {
    if (!canExport || excelBusy) return;
    setExcelBusy(true);
    setError('');
    try {
      const res = await api.get('/reports/payroll/export', {
        params: {
          month,
          year,
          employeeId: employeeId || undefined,
          status: status || undefined,
          format: 'excel',
        },
        responseType: 'blob',
      });
      downloadBlob(res.data as Blob, `payroll-${month}-${year}.xlsx`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setExcelBusy(false);
    }
  }

  const payrollColumns = [
    { key: 'employee', label: 'col.sal.employee', render: (r: PayrollRow) => <strong>{r.employee?.fullName}</strong> },
    { key: 'period', label: 'col.sal.period', render: (r: PayrollRow) => `${r.month}/${r.year}` },
    { key: 'snapshotBaseSalary', label: 'col.sal.base', render: (r: PayrollRow) => money(r.snapshotBaseSalary ?? r.baseSalary) },
    { key: 'grossSalary', label: 'col.sal.gross', render: (r: PayrollRow) => money(r.grossSalary) },
    { key: 'totalDeductions', label: 'col.sal.deductions', render: (r: PayrollRow) => money(Number(r.totalDeductions ?? 0) + Number(r.totalAdvances ?? 0)) },
    { key: 'overtime', label: 'col.sal.overtime', render: (r: PayrollRow) => `${Number(r.overtimeHours ?? 0).toFixed(3)}h / ${money(r.overtimeAmount)}` },
    { key: 'netSalary', label: 'col.sal.net', render: (r: PayrollRow) => <strong>{money(r.netSalary)}</strong> },
    { key: 'status', label: 'col.status', render: (r: PayrollRow) => {
      const cls = r.status === 'PAID' ? 'green' : r.status === 'APPROVED' ? 'blue' : r.status === 'CANCELLED' ? 'red' : 'amber';
      return <span className={`pill ${cls}`}>{t('payroll.status.' + r.status.toLowerCase())}</span>;
    }},
  ];

  const historyColumns = [
    { key: 'paymentDate', label: 'col.sal.payment_date', render: (r: SalaryPaymentRow) => dateText(r.paymentDate) },
    { key: 'sourceMonth', label: 'col.sal.source_month' },
    { key: 'transactionId', label: 'col.sal.transaction', render: (r: SalaryPaymentRow) => <span style={{ fontFamily: 'monospace' }}>{r.transactionId}</span> },
    { key: 'beneficiaryName', label: 'col.sal.beneficiary', render: (r: SalaryPaymentRow) => <strong>{r.beneficiaryName}</strong> },
    { key: 'bankName', label: 'col.sal.bank' },
    { key: 'amount', label: 'col.amount', render: (r: SalaryPaymentRow) => money(r.amount) },
    { key: 'civilId', label: 'col.civil_id', render: (r: SalaryPaymentRow) => <span style={{ fontFamily: 'monospace' }}>{r.civilId ?? '-'}</span> },
    { key: 'status', label: 'col.status', render: (r: SalaryPaymentRow) => {
      const s = r.status ?? '-';
      return <span className="pill green">{s !== '-' ? t('payroll.status.' + s.toLowerCase()) : s}</span>;
    }},
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>{t('page.salaries.title')}</h2>
          <p>{t('page.salaries.subtitle')}</p>
        </div>
      </div>

      <div className="toolbar">
        <button type="button" className={`btn ${tab === 'payroll' ? '' : 'secondary'}`} onClick={() => setTab('payroll')}>{t('page.salaries.tab_payroll')}</button>
        <button type="button" className={`btn ${tab === 'history' ? '' : 'secondary'}`} onClick={() => setTab('history')}>{t('page.salaries.tab_history')}</button>
      </div>

      {error && <div className="alert error" style={{ marginBottom: 14 }}>{error}</div>}
      {message && <div className="alert success" style={{ marginBottom: 14 }}>{message}</div>}

      {tab === 'payroll' ? (
        <>
          <div className="toolbar">
            <input type="number" min={1} max={12} value={month} onChange={(e) => { setMonth(Number(e.target.value)); setPage(1); }} style={{ width: 100 }} />
            <input type="number" min={2000} max={2100} value={year} onChange={(e) => { setYear(Number(e.target.value)); setPage(1); }} style={{ width: 120 }} />
            <select value={employeeId} onChange={(e) => { setEmployeeId(e.target.value); setPage(1); }}>
              <option value="">{t('page.salaries.all_employees')}</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
            </select>
            <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
              <option value="">{t('page.salaries.all_statuses')}</option>
              <option value="DRAFT">{t('payroll.status.draft')}</option>
              <option value="APPROVED">{t('payroll.status.approved')}</option>
              <option value="PAID">{t('payroll.status.paid')}</option>
              <option value="CANCELLED">{t('payroll.status.cancelled')}</option>
            </select>
            {canGenerate && <button type="button" className="btn" onClick={generatePayroll} disabled={busy}>{t('page.salaries.generate')}</button>}
            {canExport && <ExportExcelButton onExport={downloadPayrollExcel} busy={excelBusy} />}
            {canImport && (
              <button type="button" className="btn secondary" onClick={() => navigate('/import')} disabled={busy}>
                ⬆ {t('page.salaries.import_excel')}
              </button>
            )}
          </div>

          <div className="stats" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
            <StatCard label={t('stat.payroll_records')} value={totals.count} icon="PR" color="var(--blue)" bg="var(--blue-light)" />
            <StatCard label={t('stat.gross_total')} value={<PrivateAmount value={totals.gross} />} icon="GR" color="var(--green)" bg="var(--green-light)" />
            <StatCard label={t('stat.net_total')} value={<PrivateAmount value={totals.net} />} icon="NT" color="var(--amber)" bg="var(--amber-light)" />
            <StatCard label={t('stat.paid_records')} value={totals.paid} icon="PD" color="var(--green)" bg="var(--green-light)" />
          </div>

          {canAdjust && (
            <div className="card" style={{ marginBottom: 18 }}>
              <h3 style={{ marginBottom: 12 }}>{t('page.salaries.adjustments')}</h3>
              <div className="toolbar" style={{ marginBottom: 12 }}>
                <select value={inputEmployeeId} onChange={(e) => setInputEmployeeId(e.target.value)}>
                  <option value="">{t('page.salaries.select_employee')}</option>
                  {employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
                </select>
                <select value={inputKind} onChange={(e) => setInputKind(e.target.value as 'allowance' | 'deduction' | 'advance')}>
                  <option value="allowance">{t('page.salaries.recurring_allowance')}</option>
                  <option value="deduction">{t('page.salaries.recurring_deduction')}</option>
                  <option value="advance">{t('page.salaries.advance')}</option>
                </select>
                <input placeholder={inputKind === 'advance' ? t('page.salaries.notes_ph') : t('page.salaries.name_ph')} value={inputName} onChange={(e) => setInputName(e.target.value)} />
                <input type="number" step="0.001" placeholder={t('page.salaries.amount_ph')} value={inputAmount} onChange={(e) => setInputAmount(e.target.value)} />
                <button type="button" className="btn secondary" disabled={busy} onClick={addPayrollInput}>{t('page.salaries.save_input')}</button>
              </div>
              <div className="toolbar">
                <select value={adjustPayrollId} onChange={(e) => setAdjustPayrollId(e.target.value)}>
                  <option value="">{t('page.salaries.draft_payroll')}</option>
                  {rows.filter((r) => r.status === 'DRAFT').map((r) => <option key={r.id} value={r.id}>{r.employee.fullName} - {r.month}/{r.year}</option>)}
                </select>
                <select value={adjustType} onChange={(e) => setAdjustType(e.target.value as 'ALLOWANCE' | 'DEDUCTION')}>
                  <option value="ALLOWANCE">{t('page.salaries.manual_allowance')}</option>
                  <option value="DEDUCTION">{t('page.salaries.manual_deduction')}</option>
                </select>
                <input placeholder={t('page.salaries.label_ph')} value={adjustLabel} onChange={(e) => setAdjustLabel(e.target.value)} />
                <input type="number" step="0.001" placeholder={t('page.salaries.amount_ph')} value={adjustAmount} onChange={(e) => setAdjustAmount(e.target.value)} />
                <button type="button" className="btn secondary" disabled={busy} onClick={addManualLine}>{t('page.salaries.add_line')}</button>
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
                {canPayslip && <Link className="btn secondary sm" to={`/payroll/${row.id}/payslip`}>{t('page.salaries.payslip')}</Link>}{' '}
                {canApprove && row.status === 'DRAFT' && <button type="button" className="btn secondary sm" disabled={busy} onClick={() => runAction(() => api.patch(`/payroll/${row.id}/approve`))}>{t('page.salaries.approve_btn')}</button>}{' '}
                {canPay && row.status === 'APPROVED' && (
                  payingRowId === row.id
                    ? <>
                        <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} style={{ fontSize: 12, padding: '2px 4px' }}>
                          <option value="CASH">{t('opt.payment.cash')}</option>
                          <option value="BANK">{t('opt.sal.payment.bank_transfer')}</option>
                          <option value="CHEQUE">{t('opt.payment.cheque')}</option>
                          <option value="TRANSFER">{t('opt.payment.transfer')}</option>
                        </select>{' '}
                        <button type="button" className="btn secondary sm" disabled={busy} onClick={() => { setPayingRowId(null); runAction(() => api.patch(`/payroll/${row.id}/pay`, { paymentMethod: payMethod })); }}>{t('page.salaries.confirm')}</button>{' '}
                        <button type="button" className="btn secondary sm" onClick={() => setPayingRowId(null)}>{t('action.cancel')}</button>
                      </>
                    : <button type="button" className="btn secondary sm" disabled={busy} onClick={() => { setPayMethod('BANK'); setPayingRowId(row.id); }}>{t('page.salaries.pay_btn')}</button>
                )}{' '}
                {canCancel && ['DRAFT', 'APPROVED'].includes(row.status) && <button type="button" className="btn secondary sm" disabled={busy} onClick={() => runAction(() => api.patch(`/payroll/${row.id}/cancel`))}>{t('page.salaries.cancel_btn')}</button>}
              </>
            )}
          />
        </>
      ) : (
        <>
          <div className="toolbar">
            <input
              placeholder={t('page.salaries.search_history')}
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
