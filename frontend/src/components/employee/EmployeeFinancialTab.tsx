import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../../api/client';
import { useAuth } from '../../stores/authStore';
import { useT } from '../../lib/i18n';
import { formatNumber } from '../../lib/format';
import { dateText } from '../../config/modules';
import PrivateAmount from '../PrivateAmount';
import {
  SectionCard,
  StatusChip,
  EmptyState,
  ErrorBanner,
  SkeletonRows,
  DrawerField,
  Button,
} from '../explorer/ExplorerKit';
import './EmployeeFinancialTab.css';
import { fcMoneyHeader } from '../financial/financialLabels';

type Tone = 'neutral' | 'green' | 'red' | 'orange' | 'blue' | 'indigo';

/** Read-only slice of the Payroll record returned by GET /api/payroll?employeeId= */
type PayrollRecord = {
  id: number;
  month: number;
  year: number;
  baseSalary: number;
  snapshotBaseSalary: number;
  totalAllowances: number;
  totalDeductions: number;
  totalAdvances: number;
  netSalary: number;
  grossSalary: number;
  status: string;
  paidAt?: string | null;
  paymentMethod?: string | null;
};

/** Fields we read off the selected employee row (already in the drawer's local state). */
type EmployeeLike = {
  id: number;
  fullName?: string | null;
  salary?: number | null;
  bankAccount?: string | null;
  status?: string | null;
};

const STATUS_TONE: Record<string, Tone> = { PAID: 'green', APPROVED: 'blue', DRAFT: 'orange', CANCELLED: 'neutral' };
const STATUS_LABEL: Record<string, string> = { PAID: 'payroll.status.paid', APPROVED: 'payroll.status.approved', DRAFT: 'payroll.status.draft', CANCELLED: 'payroll.status.cancelled' };
const STATUS_ICON: Record<string, string> = { PAID: 'task_alt', APPROVED: 'verified', DRAFT: 'edit_note', CANCELLED: 'block' };
const METHOD_LABEL: Record<string, string> = { BANK: 'opt.sal.payment.bank_transfer', TRANSFER: 'opt.sal.payment.bank_transfer', CASH: 'opt.ent.method_cash_alt', CHEQUE: 'opt.payment.cheque', CHECK: 'opt.payment.cheque' };
// Labels/tones mirror the app-wide `employeeStatus` renderer (config/modules.tsx)
// so the same employee status reads identically in the basic and financial tabs.
const EMP_STATUS: Record<string, { key: string; tone: Tone }> = {
  ACTIVE: { key: 'opt.emp.active', tone: 'green' },
  ON_LEAVE: { key: 'opt.emp.on_leave', tone: 'orange' },
  TERMINATED: { key: 'opt.emp.terminated', tone: 'neutral' },
};

function monthLabel(m: number, y: number): string {
  return `${String(m).padStart(2, '0')}/${y}`;
}

/**
 * Mask a stored bank identifier for display (task: "IBAN masked if available").
 * We only store a single `bankAccount` string per employee, so we label it as an
 * IBAN when it starts with a 2-letter country code, otherwise as a plain account.
 */
function maskAccount(raw: string | null | undefined, t: (key: string) => string): { label: string; value: string } | null {
  if (!raw) return null;
  const s = String(raw).replace(/\s+/g, '');
  if (!s) return null;
  const last4 = s.length >= 4 ? s.slice(-4) : s;
  if (/^[A-Za-z]{2}\d/.test(s)) {
    return { label: t('field.ent.iban'), value: `${s.slice(0, 2).toUpperCase()}** **** **** ${last4}` };
  }
  return { label: t('field.ent.account_number'), value: `**** **** **** ${last4}` };
}

/**
 * Financial ("مالية") tab of the employee details drawer. Read-only.
 * Payroll history is lazy-loaded here — this component only mounts when the tab
 * is active, so no payroll request fires while the drawer sits on البيانات الأساسية.
 * Keyed by employee id in the parent, so switching employees remounts (no stale data).
 */
export default function EmployeeFinancialTab({ employee }: { employee: EmployeeLike }) {
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const { t } = useT();
  const canReadPayroll = hasPermission('payroll.read');

  const [records, setRecords] = useState<PayrollRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!canReadPayroll || !employee?.id) return;
    let alive = true;
    setLoading(true);
    setError('');
    // Reuse the existing payroll list endpoint — newest-first, capped at 12.
    api
      .get('/payroll', { params: { employeeId: employee.id, page: 1, pageSize: 12 } })
      .then((res) => { if (alive) setRecords(res.data?.data?.data ?? []); })
      .catch((e) => { if (alive) setError(errorMessage(e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [employee?.id, canReadPayroll]);

  const latest = records[0] ?? null;
  const account = maskAccount(employee?.bankAccount, t);
  const empStatusKey = EMP_STATUS[employee?.status ?? ''];
  const empStatus = { label: empStatusKey ? t(empStatusKey.key) : (employee?.status ?? '—'), tone: empStatusKey?.tone ?? ('neutral' as Tone) };
  // Graceful degradation: only real data is shown. No fabricated fallbacks —
  // an unknown payment method stays null (its row is hidden), never guessed.
  const method = latest?.paymentMethod
    ? (METHOD_LABEL[latest.paymentMethod] ? t(METHOD_LABEL[latest.paymentMethod]) : latest.paymentMethod)
    : null;

  return (
    <div className="emp-fin">
      {/* 1) ملخص الرواتب */}
      <SectionCard title={t('section.ent.salary_summary')} icon="account_balance_wallet">
        <div className="emp-fin-kpis">
          {/* الراتب الشهري الحالي — from the Employee record, always present. */}
          <div className="emp-fin-tile">
            <span className="emp-fin-tile-label">{t('field.ent.current_monthly_salary')}</span>
            {/* البلاطة عمود مرن، فكان «KWD» يهبط إلى سطر ثالث تحت الرقم — وهو الشكل
                الذي تمنعه القاعدة. الآن الرقم والرمز نصٌّ واحد من المُنسّق المشترك،
                والرمز يتبع إعداد العملة (KWD / د.ك) بدل ثابت في الشيفرة. */}
            <span className="emp-fin-tile-value">
              <PrivateAmount value={employee?.salary ?? 0} level={1} />
            </span>
          </div>
          {/* آخر شهر صرف / حالة التحويل — from the latest payroll; hidden when there
              is none, and while loading/on error, so a failed fetch never degrades
              into a summary that looks like "no payroll yet" (the error shows below). */}
          {!error && !loading && latest && (
            <div className="emp-fin-tile">
              <span className="emp-fin-tile-label">{t('field.ent.last_payment_month')}</span>
              <span className="emp-fin-tile-value">{monthLabel(latest.month, latest.year)}</span>
            </div>
          )}
          {!error && !loading && latest && (
            <div className="emp-fin-tile">
              <span className="emp-fin-tile-label">{t('field.ent.transfer_status')}</span>
              <span className="emp-fin-tile-value emp-fin-tile-value--chip">
                <StatusChip tone={STATUS_TONE[latest.status] ?? 'neutral'} icon={STATUS_ICON[latest.status]}>{STATUS_LABEL[latest.status] ? t(STATUS_LABEL[latest.status]) : latest.status}</StatusChip>
              </span>
            </div>
          )}
        </div>
      </SectionCard>

      {/* 2) معلومات الرواتب — only rows backed by real data are rendered. */}
      <SectionCard title={t('section.ent.payroll_info')} icon="badge">
        <div className="emp-fin-info">
          {method && <DrawerField label={t('field.payment_method')} value={method} />}
          {account && <DrawerField label={account.label} value={account.value} mono />}
          {!error && !loading && latest && <DrawerField label={t('field.ent.last_payment_month')} value={monthLabel(latest.month, latest.year)} />}
          <DrawerField label={t('field.ent.salary_status')} value={<StatusChip tone={empStatus.tone}>{empStatus.label}</StatusChip>} />
        </div>
      </SectionCard>

      {/* 3) سجل الرواتب (آخر 12 شهر) */}
      <SectionCard title={t('section.ent.payroll_history_12mo')} icon="receipt_long">
        {!canReadPayroll ? (
          <EmptyState icon="lock" title={t('msg.ent.no_permission_title')} message={t('msg.ent.no_payroll_permission_message')} tone="neutral" />
        ) : error ? (
          <ErrorBanner>{error}</ErrorBanner>
        ) : loading ? (
          <SkeletonRows rows={4} withAvatar={false} />
        ) : records.length === 0 ? (
          <EmptyState icon="receipt_long" title={t('msg.ent.no_payroll_history_title')} message={t('msg.ent.no_payroll_history_message')} tone="neutral" />
        ) : (
          <>
            <div className="xpl-table-wrap">
              <table className="xpl-table emp-fin-table">
                <thead>
                  <tr>
                    <th>{t('col.ent.month_year')}</th>
                    <th>{fcMoneyHeader(t('col.ent.base_salary'))}</th>
                    <th>{fcMoneyHeader(t('col.ent.allowances'))}</th>
                    <th>{fcMoneyHeader(t('lbl.payslip.deductions'))}</th>
                    <th>{fcMoneyHeader(t('lbl.payslip.net'))}</th>
                    <th>{t('col.ent.payment_status')}</th>
                    <th>{t('col.sal.payment_date')}</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <tr key={r.id}>
                      <td>{monthLabel(r.month, r.year)}</td>
                      <td><PrivateAmount value={formatNumber(r.snapshotBaseSalary || r.baseSalary)} level={1} /></td>
                      <td><PrivateAmount value={formatNumber(r.totalAllowances)} level={1} /></td>
                      <td><PrivateAmount value={formatNumber(r.totalDeductions)} level={1} /></td>
                      <td><strong><PrivateAmount value={formatNumber(r.netSalary)} level={1} /></strong></td>
                      <td><StatusChip tone={STATUS_TONE[r.status] ?? 'neutral'} icon={STATUS_ICON[r.status]}>{STATUS_LABEL[r.status] ? t(STATUS_LABEL[r.status]) : r.status}</StatusChip></td>
                      <td>{r.paidAt ? dateText(r.paidAt) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button
              variant="ghost"
              icon="open_in_new"
              block
              // Pass the name so Salaries can show it in its (ACTIVE-only) employee
              // filter even for on-leave/terminated employees not in that dropdown.
              onClick={() => navigate('/salaries', { state: { employeeId: employee.id, employeeName: employee.fullName ?? '' } })}
            >
              {t('action.ent.view_all_salaries')}
            </Button>
          </>
        )}
      </SectionCard>
    </div>
  );
}
