import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../../api/client';
import { useAuth } from '../../stores/authStore';
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
const STATUS_LABEL: Record<string, string> = { PAID: 'مدفوع', APPROVED: 'معتمد', DRAFT: 'مسودة', CANCELLED: 'ملغى' };
const STATUS_ICON: Record<string, string> = { PAID: 'task_alt', APPROVED: 'verified', DRAFT: 'edit_note', CANCELLED: 'block' };
const METHOD_LABEL: Record<string, string> = { BANK: 'تحويل بنكي', TRANSFER: 'تحويل بنكي', CASH: 'نقدي', CHEQUE: 'شيك', CHECK: 'شيك' };
// Labels/tones mirror the app-wide `employeeStatus` renderer (config/modules.tsx)
// so the same employee status reads identically in the basic and financial tabs.
const EMP_STATUS: Record<string, { label: string; tone: Tone }> = {
  ACTIVE: { label: 'نشط', tone: 'green' },
  ON_LEAVE: { label: 'إجازة', tone: 'orange' },
  TERMINATED: { label: 'منتهي الخدمة', tone: 'neutral' },
};

function monthLabel(m: number, y: number): string {
  return `${String(m).padStart(2, '0')}/${y}`;
}

/**
 * Mask a stored bank identifier for display (task: "IBAN masked if available").
 * We only store a single `bankAccount` string per employee, so we label it as an
 * IBAN when it starts with a 2-letter country code, otherwise as a plain account.
 */
function maskAccount(raw?: string | null): { label: string; value: string } | null {
  if (!raw) return null;
  const s = String(raw).replace(/\s+/g, '');
  if (!s) return null;
  const last4 = s.length >= 4 ? s.slice(-4) : s;
  if (/^[A-Za-z]{2}\d/.test(s)) {
    return { label: 'الآيبان (IBAN)', value: `${s.slice(0, 2).toUpperCase()}** **** **** ${last4}` };
  }
  return { label: 'رقم الحساب', value: `**** **** **** ${last4}` };
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
  const account = maskAccount(employee?.bankAccount);
  const empStatus = EMP_STATUS[employee?.status ?? ''] ?? { label: employee?.status ?? '—', tone: 'neutral' as Tone };
  // Graceful degradation: only real data is shown. No fabricated fallbacks —
  // an unknown payment method stays null (its row is hidden), never guessed.
  const method = latest?.paymentMethod
    ? (METHOD_LABEL[latest.paymentMethod] ?? latest.paymentMethod)
    : null;

  return (
    <div className="emp-fin">
      {/* 1) ملخص الرواتب */}
      <SectionCard title="ملخص الرواتب" icon="account_balance_wallet">
        <div className="emp-fin-kpis">
          {/* الراتب الشهري الحالي — from the Employee record, always present. */}
          <div className="emp-fin-tile">
            <span className="emp-fin-tile-label">الراتب الشهري الحالي</span>
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
              <span className="emp-fin-tile-label">آخر شهر صرف</span>
              <span className="emp-fin-tile-value">{monthLabel(latest.month, latest.year)}</span>
            </div>
          )}
          {!error && !loading && latest && (
            <div className="emp-fin-tile">
              <span className="emp-fin-tile-label">حالة التحويل</span>
              <span className="emp-fin-tile-value emp-fin-tile-value--chip">
                <StatusChip tone={STATUS_TONE[latest.status] ?? 'neutral'} icon={STATUS_ICON[latest.status]}>{STATUS_LABEL[latest.status] ?? latest.status}</StatusChip>
              </span>
            </div>
          )}
        </div>
      </SectionCard>

      {/* 2) معلومات الرواتب — only rows backed by real data are rendered. */}
      <SectionCard title="معلومات الرواتب" icon="badge">
        <div className="emp-fin-info">
          {method && <DrawerField label="طريقة الدفع" value={method} />}
          {account && <DrawerField label={account.label} value={account.value} mono />}
          {!error && !loading && latest && <DrawerField label="آخر شهر صرف" value={monthLabel(latest.month, latest.year)} />}
          <DrawerField label="حالة الراتب" value={<StatusChip tone={empStatus.tone}>{empStatus.label}</StatusChip>} />
        </div>
      </SectionCard>

      {/* 3) سجل الرواتب (آخر 12 شهر) */}
      <SectionCard title="سجل الرواتب (آخر 12 شهر)" icon="receipt_long">
        {!canReadPayroll ? (
          <EmptyState icon="lock" title="صلاحية غير متوفرة" message="لا تملك صلاحية عرض سجل الرواتب لهذا الموظف." tone="neutral" />
        ) : error ? (
          <ErrorBanner>{error}</ErrorBanner>
        ) : loading ? (
          <SkeletonRows rows={4} withAvatar={false} />
        ) : records.length === 0 ? (
          <EmptyState icon="receipt_long" title="لا يوجد سجل رواتب" message="لم يتم إنشاء أي رواتب لهذا الموظف بعد." tone="neutral" />
        ) : (
          <>
            <div className="xpl-table-wrap">
              <table className="xpl-table emp-fin-table">
                <thead>
                  <tr>
                    <th>الشهر/السنة</th>
                    <th>{fcMoneyHeader('الراتب الأساسي')}</th>
                    <th>{fcMoneyHeader('البدلات')}</th>
                    <th>{fcMoneyHeader('الاستقطاعات')}</th>
                    <th>{fcMoneyHeader('صافي الراتب')}</th>
                    <th>حالة الدفع</th>
                    <th>تاريخ الدفع</th>
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
                      <td><StatusChip tone={STATUS_TONE[r.status] ?? 'neutral'} icon={STATUS_ICON[r.status]}>{STATUS_LABEL[r.status] ?? r.status}</StatusChip></td>
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
              عرض جميع الرواتب
            </Button>
          </>
        )}
      </SectionCard>
    </div>
  );
}
