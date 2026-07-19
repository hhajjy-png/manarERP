import { useEffect, useState, type ReactNode } from 'react';
import { api, errorMessage } from '../../api/client';
import { useAuth } from '../../stores/authStore';
import { dateText } from '../../config/modules';
import PrivateAmount from '../PrivateAmount';
import {
  SectionCard,
  MetricCard,
  StatusChip,
  DrawerField,
  EmptyState,
  ErrorBanner,
  SkeletonRows,
  Button,
} from '../explorer/ExplorerKit';
import LeaveSettlementDialog from './LeaveSettlementDialog';
import EntitlementLedgerDialog from './EntitlementLedgerDialog';
import { dayKey, hasMatchingSettlement } from './entitlementLedgerDisplay';
import './EmployeeEntitlementsTab.css';

type Tone = 'neutral' | 'green' | 'red' | 'orange' | 'blue' | 'indigo';

/** يطابق EntitlementResult في backend/src/modules/employees/entitlements.calc.ts (قراءة فقط). */
interface EntitlementResult {
  hasHireDate: boolean;
  hasSalary: boolean;
  duration: { years: number; months: number; days: number; totalDays: number } | null;
  annualEntitlementDays: number;
  accruedLeaveDays: number | null;
  usedLeaveDays: number;
  remainingLeaveDays: number | null;
  dailyWage: number | null;
  leaveAllowanceDays: number | null;
  leaveAllowanceValue: number | null;
  gratuity: {
    serviceYears: number;
    approvedWage: number;
    dailyWage: number;
    firstTierYears: number;
    firstTierAmount: number;
    secondTierYears: number;
    secondTierAmount: number;
    rawTotal: number;
    capAmount: number;
    capApplied: boolean;
    total: number;
  } | null;
  assumptionsApplied: boolean;
}

interface LeaveRow {
  id: number;
  type: string;
  startDate: string;
  endDate: string;
  days: number;
  status: string;
}

interface EntitlementsResponse {
  employee: { id: number; code: string; fullName: string; salary: number; hireDate: string | null; status: string };
  result: EntitlementResult;
  leaveHistory: LeaveRow[];
  settlements: SettlementRow[];
  leaveBaseline: { date: string | null; isSettlement: boolean };
  ledger: LedgerRow[];
}

interface LedgerRow {
  id: number;
  entryType: string;
  entryDate: string;
  description: string | null;
  leaveDays: number | null;
  leaveBalanceSnapshot: number | null;
  amount: number;
  paymentMethod: string;
  notes: string | null;
}

const LEDGER_TYPE_LABEL: Record<string, string> = {
  LEAVE_ALLOWANCE: 'بدل الإجازة',
  END_OF_SERVICE: 'مكافأة نهاية الخدمة',
  OTHER: 'مستحق آخر',
};

interface SettlementRow {
  id: number;
  settlementDate: string;
  leaveDaysSettled: number;
  settlementAmount: number;
  paymentMethod: string;
  notes: string | null;
  createdAt: string;
}

const SETTLEMENT_METHOD_LABEL: Record<string, string> = {
  CASH: 'نقدًا',
  BANK_TRANSFER: 'تحويل بنكي',
  CHEQUE: 'شيك',
  OTHER: 'أخرى',
};

type EmployeeLike = { id: number; fullName?: string | null };

const LEAVE_TYPE_LABEL: Record<string, string> = {
  ANNUAL: 'سنوية',
  SICK: 'مرضية',
  UNPAID: 'بدون راتب',
  EMERGENCY: 'طارئة',
};
const LEAVE_STATUS: Record<string, { label: string; tone: Tone; icon: string }> = {
  APPROVED: { label: 'معتمدة', tone: 'green', icon: 'task_alt' },
  PENDING: { label: 'قيد الاعتماد', tone: 'orange', icon: 'schedule' },
  REJECTED: { label: 'مرفوضة', tone: 'red', icon: 'block' },
};

function formatDurationLong(d: { years: number; months: number; days: number }): string {
  const parts: string[] = [];
  if (d.years) parts.push(`${d.years} سنة`);
  if (d.months) parts.push(`${d.months} شهر`);
  if (d.days || parts.length === 0) parts.push(`${d.days} يوم`);
  return parts.join(' و ');
}

/** يوم/أيام مع لاحقة عربية بسيطة. */
function daysText(n: number): string {
  return `${n} يوم`;
}

/** سبب النقص الدقيق للحقل المطلوب (بلا تخمين). */
function missingReason(needsHire: boolean, needsSalary: boolean, r: EntitlementResult): string | null {
  if (needsHire && !r.hasHireDate) return 'تاريخ التعيين غير مُدخل';
  if (needsSalary && !r.hasSalary) return 'الراتب غير مُدخل';
  return null;
}

/** يعرض «—» + حالة «بيانات غير مكتملة» مع السبب، دون كسر التخطيط. */
function Incomplete({ reason }: { reason: string }) {
  return (
    <span className="ent-incomplete">
      <span className="ent-incomplete-dash">—</span>
      <StatusChip tone="neutral" icon="info">بيانات غير مكتملة</StatusChip>
      <span className="ent-incomplete-reason">{reason}</span>
    </span>
  );
}

/**
 * تبويب «الاستحقاقات» في درج تفاصيل الموظف — قراءة فقط.
 * يُحمَّل بكسل (Lazy): يُركَّب فقط عند تنشيط التبويب، ومُفتاحه معرّف الموظف في الأب
 * فيُعاد تركيبه عند تبديل الموظف (لا بيانات قديمة). الحسابات كلها من الخادم.
 */
export default function EmployeeEntitlementsTab({ employee }: { employee: EmployeeLike }) {
  const { hasPermission } = useAuth();
  const canRead = hasPermission('employees.read');
  // إنشاء التسوية يعيد استخدام صلاحية تعديل الموظف (لا مفتاح صلاحية جديد).
  const canManage = hasPermission('employees.update');

  const [data, setData] = useState<EntitlementsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [showSettlementDialog, setShowSettlementDialog] = useState(false);
  const [showLedgerDialog, setShowLedgerDialog] = useState(false);

  useEffect(() => {
    if (!canRead || !employee?.id) return;
    let alive = true;
    setLoading(true);
    setError('');
    api
      .get(`/employees/${employee.id}/entitlements`)
      .then((res) => { if (alive) setData(res.data?.data ?? null); })
      .catch((e) => { if (alive) setError(errorMessage(e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // reloadKey forces a refetch after a settlement is recorded → recalculated baseline.
  }, [employee?.id, canRead, reloadKey]);

  if (!canRead) {
    return <EmptyState icon="lock" title="صلاحية غير متوفرة" message="لا تملك صلاحية عرض استحقاقات هذا الموظف." tone="neutral" />;
  }
  if (error) return <ErrorBanner>{error}</ErrorBanner>;
  if (loading || !data) return <SkeletonRows rows={6} withAvatar={false} />;

  const { result: r, employee: emp, leaveHistory, settlements, ledger } = data;
  const g = r.gratuity;
  // مجموعة أيام التسويات (YYYY-MM-DD) — لمطابقة شارة «مرتبط بتسوية الإجازة» بصريًا فقط.
  const settlementDayKeys = new Set(settlements.map((s) => dayKey(s.settlementDate)));

  const durReason = missingReason(true, false, r);
  const moneyReason = missingReason(true, true, r);
  const leaveReason = missingReason(true, false, r);

  // الإشعار القانوني يظهر فقط عند نقص بيانات مطلوبة (تاريخ التعيين/الراتب) — أي عندما
  // لا يكون الاحتساب مدعومًا بالكامل بالبيانات المتاحة. مع اكتمال البيانات يبقى الدرج نظيفًا.
  const showLegalNote = !r.hasHireDate || !r.hasSalary;

  // قيمة نقدية موحّدة (يظهر رمز العملة تلقائيًا حسب الإعداد) أو حالة نقص.
  const money = (v: number | null, reason: string | null): ReactNode =>
    v !== null ? <PrivateAmount value={v} level={1} /> : reason ? <Incomplete reason={reason} /> : '—';
  const daysOrIncomplete = (v: number | null, reason: string | null): ReactNode =>
    v !== null ? daysText(v) : reason ? <Incomplete reason={reason} /> : '—';

  return (
    <div className="ent-tab">
      {/* SECTION 1 — بطاقات ملخّص */}
      <div className="ent-kpis">
        <MetricCard
          icon="badge"
          label="مدة الخدمة"
          tone="indigo"
          value={<span className="ent-kpi-value-sm">{r.duration ? formatDurationLong({ years: r.duration.years, months: r.duration.months, days: r.duration.days }) : '—'}</span>}
          sub={!r.duration && durReason ? `بيانات غير مكتملة — ${durReason}` : undefined}
        />
        <MetricCard
          icon="beach_access"
          label="رصيد الإجازات"
          tone="blue"
          value={r.remainingLeaveDays !== null ? daysText(r.remainingLeaveDays) : '—'}
          sub={r.remainingLeaveDays === null && leaveReason ? `بيانات غير مكتملة — ${leaveReason}` : undefined}
        />
        <MetricCard
          icon="payments"
          label="قيمة بدل الإجازة"
          tone="green"
          value={<span className="ent-kpi-value-sm">{r.leaveAllowanceValue !== null ? <PrivateAmount value={r.leaveAllowanceValue} level={1} /> : '—'}</span>}
          sub={r.leaveAllowanceValue === null && moneyReason ? `بيانات غير مكتملة — ${moneyReason}` : undefined}
        />
        <MetricCard
          icon="volunteer_activism"
          label="مكافأة نهاية الخدمة"
          tone="orange"
          value={<span className="ent-kpi-value-sm">{g ? <PrivateAmount value={g.total} level={1} /> : '—'}</span>}
          sub={!g && moneyReason ? `بيانات غير مكتملة — ${moneyReason}` : undefined}
        />
      </div>

      {/* SECTION 2 — الإجازات */}
      <SectionCard title="الإجازات" icon="event_available">
        <div className="ent-fields">
          <DrawerField label="تاريخ التعيين" value={emp.hireDate ? dateText(emp.hireDate) : <Incomplete reason="تاريخ التعيين غير مُدخل" />} />
          <DrawerField label="الاستحقاق السنوي" value={daysText(r.annualEntitlementDays)} />
          <DrawerField label="الرصيد الحالي" value={daysOrIncomplete(r.accruedLeaveDays, leaveReason)} />
          <DrawerField label="الأيام المستخدمة" value={daysText(r.usedLeaveDays)} />
          <DrawerField label="الأيام المتبقية" value={daysOrIncomplete(r.remainingLeaveDays, leaveReason)} />
        </div>
      </SectionCard>

      {/* SECTION 3 — بدل الإجازة */}
      <SectionCard title="بدل الإجازة" icon="savings">
        <div className="ent-fields">
          <DrawerField label="الأيام المستحقة للصرف" value={daysOrIncomplete(r.leaveAllowanceDays, leaveReason)} />
          <DrawerField label="القيمة النقدية" value={money(r.leaveAllowanceValue, moneyReason)} />
        </div>
      </SectionCard>

      {/* SECTION 4 — مكافأة نهاية الخدمة */}
      <SectionCard title="مكافأة نهاية الخدمة" icon="workspace_premium">
        <div className="ent-eos">
          <span className="ent-eos-label">الاستحقاق حتى اليوم</span>
          <span className="ent-eos-value">
            {g ? <PrivateAmount value={g.total} level={1} /> : moneyReason ? <Incomplete reason={moneyReason} /> : '—'}
          </span>
          {g?.capApplied && (
            <span className="ent-eos-cap"><StatusChip tone="orange" icon="info">طُبّق الحد الأقصى (أجر 18 شهرًا)</StatusChip></span>
          )}
        </div>
      </SectionCard>

      {/* SECTION 5 — تفاصيل الاحتساب (بطاقات مدمجة، لا جداول طويلة) */}
      <SectionCard title="تفاصيل الاحتساب" icon="calculate">
        {g ? (
          <div className="ent-calc-grid">
            <div className="ent-calc-cell"><span className="ent-calc-label">مدة الخدمة</span><span className="ent-calc-val">{g.serviceYears} سنة</span></div>
            <div className="ent-calc-cell"><span className="ent-calc-label">الأجر المعتمد</span><span className="ent-calc-val"><PrivateAmount value={g.approvedWage} level={1} /></span></div>
            <div className="ent-calc-cell"><span className="ent-calc-label">الأجر اليومي</span><span className="ent-calc-val"><PrivateAmount value={g.dailyWage} level={1} /></span></div>
            <div className="ent-calc-cell"><span className="ent-calc-label">استحقاق أول مدة</span><span className="ent-calc-val"><PrivateAmount value={g.firstTierAmount} level={1} /></span></div>
            <div className="ent-calc-cell"><span className="ent-calc-label">استحقاق المدة الإضافية</span><span className="ent-calc-val"><PrivateAmount value={g.secondTierAmount} level={1} /></span></div>
            <div className="ent-calc-cell ent-calc-cell--total"><span className="ent-calc-label">إجمالي المكافأة</span><span className="ent-calc-val"><PrivateAmount value={g.total} level={1} /></span></div>
          </div>
        ) : (
          <div className="ent-fields"><DrawerField label="الاحتساب" value={moneyReason ? <Incomplete reason={moneyReason} /> : '—'} /></div>
        )}
      </SectionCard>

      {/* SECTION 6 — سجل الإجازات */}
      <SectionCard title="سجل الإجازات" icon="history">
        {leaveHistory.length === 0 ? (
          <EmptyState icon="event_busy" title="لا يوجد سجل إجازات" message="لم تُسجَّل أي إجازات لهذا الموظف بعد." tone="neutral" />
        ) : (
          <div className="xpl-table-wrap">
            <table className="xpl-table">
              <thead>
                <tr><th>النوع</th><th>تاريخ البداية</th><th>تاريخ النهاية</th><th>عدد الأيام</th><th>الحالة</th></tr>
              </thead>
              <tbody>
                {leaveHistory.map((l) => {
                  const st = LEAVE_STATUS[l.status] ?? { label: l.status, tone: 'neutral' as Tone, icon: 'help' };
                  return (
                    <tr key={l.id}>
                      <td>{LEAVE_TYPE_LABEL[l.type] ?? l.type}</td>
                      <td>{dateText(l.startDate)}</td>
                      <td>{dateText(l.endDate)}</td>
                      <td>{daysText(l.days)}</td>
                      <td><StatusChip tone={st.tone} icon={st.icon}>{st.label}</StatusChip></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* SECTION 7 — سجل تسويات الإجازة (تسجيل يدوي؛ أحدث تسوية تصبح خط أساس الاحتساب) */}
      <SectionCard title="سجل تسويات الإجازة" icon="savings">
        {canManage && (
          <div className="ent-settlement-actions">
            <Button variant="primary" icon="add" onClick={() => setShowSettlementDialog(true)}>تسوية رصيد الإجازة</Button>
          </div>
        )}
        {settlements.length === 0 ? (
          <EmptyState icon="receipt_long" title="لا توجد تسويات" message="لم تُسجَّل أي تسوية لرصيد الإجازة بعد." tone="neutral" />
        ) : (
          <div className="xpl-table-wrap">
            <table className="xpl-table">
              <thead>
                <tr><th>التاريخ</th><th>عدد الأيام</th><th>المبلغ</th><th>طريقة الدفع</th><th>ملاحظات</th></tr>
              </thead>
              <tbody>
                {settlements.map((s) => (
                  <tr key={s.id}>
                    <td>{dateText(s.settlementDate)}</td>
                    <td>{daysText(s.leaveDaysSettled)}</td>
                    <td><PrivateAmount value={s.settlementAmount} level={1} /></td>
                    <td>{SETTLEMENT_METHOD_LABEL[s.paymentMethod] ?? s.paymentMethod}</td>
                    <td>{s.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* SECTION 8 — سجل المستحقات المصروفة (تاريخي فقط — لا يؤثر في أي احتساب) */}
      <SectionCard title="سجل المستحقات المصروفة" icon="account_balance_wallet">
        {canManage && (
          <div className="ent-settlement-actions">
            <Button variant="primary" icon="add" onClick={() => setShowLedgerDialog(true)}>إضافة مستحق</Button>
          </div>
        )}
        {ledger.length === 0 ? (
          <EmptyState icon="receipt_long" title="لا توجد مستحقات مصروفة" message="لم يُسجَّل أي مستحق مصروف لهذا الموظف بعد." tone="neutral" />
        ) : (
          <div className="xpl-table-wrap">
            <table className="xpl-table">
              <thead>
                <tr><th>التاريخ</th><th>النوع</th><th>الوصف</th><th>عدد الأيام</th><th>الرصيد وقت الصرف</th><th>المبلغ</th><th>طريقة الدفع</th><th>ملاحظات</th></tr>
              </thead>
              <tbody>
                {ledger.map((e) => {
                  const isLeaveAllowance = e.entryType === 'LEAVE_ALLOWANCE';
                  // مؤشّر بصري فقط: هل توجد تسوية إجازة بنفس اليوم؟ لا ربط منطقي/حسابي.
                  const linked = isLeaveAllowance && hasMatchingSettlement(e.entryDate, settlementDayKeys);
                  return (
                    <tr key={e.id}>
                      <td>{dateText(e.entryDate)}</td>
                      <td>
                        <span className="ent-ledger-type">
                          {LEDGER_TYPE_LABEL[e.entryType] ?? e.entryType}
                          {linked && <StatusChip tone="blue" icon="link">مرتبط بتسوية الإجازة</StatusChip>}
                        </span>
                      </td>
                      <td>{e.description || '—'}</td>
                      <td>{isLeaveAllowance && e.leaveDays != null ? daysText(e.leaveDays) : '—'}</td>
                      <td>{isLeaveAllowance && e.leaveBalanceSnapshot != null ? daysText(e.leaveBalanceSnapshot) : '—'}</td>
                      <td><PrivateAmount value={e.amount} level={1} /></td>
                      <td>{SETTLEMENT_METHOD_LABEL[e.paymentMethod] ?? e.paymentMethod}</td>
                      <td>{e.notes || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* الإشعار القانوني — يظهر فقط عند وجود افتراضات أو نقص بيانات أثّرت في الاحتساب */}
      {showLegalNote && (
        <div className="ent-legal" role="note">
          <span className="material-symbols-outlined" aria-hidden="true">gavel</span>
          <p>
            القيم تقديرية للاسترشاد فقط ومحسوبة حتى تاريخ اليوم وفق قانون العمل الكويتي رقم 6 لسنة 2010
            (المادتان 70 و51). تعتمد على الافتراضات التالية عند غياب البيانات في النظام: الراتب الشهري المسجّل
            يُعدّ الأجر الشامل للاحتساب، والأجر اليومي = الراتب ÷ 30، ومكافأة نهاية الخدمة تُحتسب على أساس إنهاء
            الخدمة من صاحب العمل أو انتهاء العقد (الاستحقاق الكامل دون تخفيض استقالة، إذ لا يُسجّل النظام سبب
            انتهاء الخدمة). ليست بديلاً عن التسوية النهائية المعتمدة.
          </p>
        </div>
      )}

      {showSettlementDialog && (
        <LeaveSettlementDialog
          employeeId={employee.id}
          defaultDays={r.leaveAllowanceDays}
          defaultAmount={r.leaveAllowanceValue}
          onClose={() => setShowSettlementDialog(false)}
          onSaved={() => { setShowSettlementDialog(false); setReloadKey((k) => k + 1); }}
        />
      )}

      {showLedgerDialog && (
        <EntitlementLedgerDialog
          employeeId={employee.id}
          leaveBalanceDays={r.leaveAllowanceDays}
          leaveAllowanceValue={r.leaveAllowanceValue}
          eosValue={g ? g.total : null}
          onClose={() => setShowLedgerDialog(false)}
          onSaved={() => { setShowLedgerDialog(false); setReloadKey((k) => k + 1); }}
        />
      )}
    </div>
  );
}
