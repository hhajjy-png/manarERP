import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../stores/authStore';
import { useT } from '../lib/i18n';
import { dateText } from '../config/modules';
import PrivateAmount from '../components/PrivateAmount';
import {
  ExecutiveHeader,
  IdChip,
  SectionCard,
  MetricCard,
  StatusChip,
  DrawerField,
  EmptyState,
  ErrorBanner,
  SkeletonRows,
  Button,
  Tabs,
  type Tone,
} from '../components/explorer/ExplorerKit';
import '../components/explorer/explorer-kit.css';
import LeaveSettlementDialog from '../components/employee/LeaveSettlementDialog';
import EntitlementLedgerDialog from '../components/employee/EntitlementLedgerDialog';
import { dayKey, hasMatchingSettlement } from '../components/employee/entitlementLedgerDisplay';
import {
  type SeparationType,
  LEDGER_TYPE_LABEL,
  SETTLEMENT_METHOD_LABEL,
  LEAVE_TYPE_LABEL,
  LEAVE_STATUS,
  formatDurationLong,
  daysText,
  resignationFractionLabel,
  missingReason,
  Incomplete,
  buildWarnings,
  buildTimeline,
  scrollToEntSection,
  type EntitlementsResponse,
} from '../components/employee/entitlementsShared';
import '../components/employee/EmployeeEntitlementsTab.css';
import './EmployeeEntitlementsCenter.css';

/* عتبات عرضية للمؤشرات الصحية فقط (لا قاعدة قانونية جديدة) — تُسمّي حالات موجودة أصلاً
   في البيانات بصريًا. أرقام إرشادية للعرض لا تدخل أي احتساب قانوني. */
const DAY_MS = 86_400_000;
const STALE_DISBURSEMENT_DAYS = 365;
const HIGH_LEAVE_BALANCE_DAYS = 30;

/** بطاقة قابلة للطيّ (تصميم متّسق مع SectionCard/xpl-card — بلا لغة تصميم جديدة). */
function CollapsibleCard({
  title,
  icon,
  defaultOpen = true,
  children,
}: {
  title: string;
  icon: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="xpl-card entc-collapsible" open={defaultOpen}>
      <summary className="entc-collapsible-summary">
        <span className="material-symbols-outlined" aria-hidden="true">{icon}</span>
        <span className="entc-collapsible-title">{title}</span>
        <span className="material-symbols-outlined entc-collapsible-chevron" aria-hidden="true">expand_more</span>
      </summary>
      <div className="xpl-card--pad">{children}</div>
    </details>
  );
}

/**
 * مركز المستحقات — الصفحة الكاملة المستقلة لتجربة استحقاقات موظف واحد (حزمة إعادة
 * هيكلة تجربة الاستحقاقات v1). تنقل هنا كل المحتوى المتقدّم الذي كان سابقًا في تبويب
 * درج الموظف (الملخص التنفيذي، تسوية الرصيد، تسوية الدفعات المقدَّمة، ملخص التسويات،
 * الجدول الزمني، دفتر المستحقات، الجداول التفصيلية) — نفس نقطة القراءة
 * GET /employees/:id/entitlements ونفس الحسابات تمامًا، بلا أي تكرار للمنطق (كل
 * الدوال المساعدة مستوردة من entitlementsShared.tsx المشترك مع التبويب المختصر).
 */
export default function EmployeeEntitlementsCenter() {
  const { id: idParam } = useParams<{ id: string }>();
  const employeeId = Number(idParam);
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const { t } = useT();
  const canRead = hasPermission('employees.read');
  // إنشاء الدفعة المقدَّمة/المستحق يعيد استخدام صلاحية تعديل الموظف (لا مفتاح صلاحية جديد).
  const canManage = hasPermission('employees.update');

  const [data, setData] = useState<EntitlementsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [showSettlementDialog, setShowSettlementDialog] = useState(false);
  const [showLedgerDialog, setShowLedgerDialog] = useState(false);
  const [separationType, setSeparationType] = useState<SeparationType>('EMPLOYER_TERMINATION');

  const validId = Number.isFinite(employeeId) && employeeId > 0;

  useEffect(() => {
    if (!canRead || !validId) return;
    let alive = true;
    setLoading(true);
    setError('');
    api
      .get(`/employees/${employeeId}/entitlements`)
      .then((res) => { if (alive) setData(res.data?.data ?? null); })
      .catch((e) => { if (alive) setError(errorMessage(e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // reloadKey forces a refetch after a settlement/ledger entry is recorded.
  }, [employeeId, validId, canRead, reloadKey]);

  // مشتقّات عرضية محسوبة مرة واحدة لكل تغيّر بيانات فعلي — لا استدعاء API إضافي،
  // إعادة استخدام data المجلوبة بالفعل من نفس نقطة القراءة التي يستخدمها التبويب.
  const settlementTotals = useMemo(() => {
    if (!data) return { count: 0, totalDays: 0, totalAmount: 0, lastDate: null as string | null };
    const { settlements } = data;
    return {
      count: settlements.length,
      totalDays: settlements.reduce((sum, s) => sum + s.leaveDaysSettled, 0),
      totalAmount: settlements.reduce((sum, s) => sum + s.settlementAmount, 0),
      lastDate: settlements[0]?.settlementDate ?? null, // مُرتَّبة من الأحدث من الخادم أصلاً
    };
  }, [data]);

  // أحدث تاريخ صرف مستحق — يُستخدم فقط في مؤشّر «قِدَم آخر صرف» ضمن المؤشرات الصحية
  // (لا نفترض ترتيب الخادم فنحسب الأقصى صراحةً).
  const lastLedgerDate = useMemo(() => {
    if (!data) return null;
    let lastDate: string | null = null;
    for (const e of data.ledger) {
      if (lastDate === null || e.entryDate > lastDate) lastDate = e.entryDate;
    }
    return lastDate;
  }, [data]);

  const warnings = useMemo(
    () => (data ? buildWarnings(data.result, data.leaveExclusionBreakdown, settlementTotals.totalDays, data.ledger, t) : []),
    [data, settlementTotals.totalDays, t],
  );

  const timeline = useMemo(
    () => (data ? buildTimeline(data.leaveHistory, data.settlements, data.ledger, t) : []),
    [data, t],
  );

  const pageShell = (content: ReactNode) => (
    <div className="xpl-scope xpl-page entc-page" dir="rtl">
      <ExecutiveHeader icon="badge" title={t('page.ent.center_title')} onBack={() => navigate('/employees')} />
      {content}
    </div>
  );

  if (!validId) return pageShell(<ErrorBanner>{t('msg.ent.invalid_employee_id')}</ErrorBanner>);
  if (!canRead) {
    return pageShell(
      <EmptyState icon="lock" title={t('msg.ent.no_permission_title')} message={t('msg.ent.no_permission_message')} tone="neutral" />,
    );
  }
  if (error) return pageShell(<ErrorBanner>{error}</ErrorBanner>);
  if (loading || !data) return pageShell(<SkeletonRows rows={8} withAvatar={false} />);

  const { result: r, employee: emp, wageBase, leaveExclusionBreakdown: brk, leaveHistory, settlements, ledger } = data;
  const g = r.gratuity;
  // مبلغ مكافأة نهاية الخدمة وفق الأساس المختار — الاثنان محتسَبان دومًا في الخادم.
  const eosAmount = g ? (separationType === 'RESIGNATION' ? g.resignationAmount : g.total) : null;
  // مجموعة أيام الدفعات المقدَّمة (YYYY-MM-DD) — لمطابقة شارة العرض البصرية فقط.
  const settlementDayKeys = new Set(settlements.map((s) => dayKey(s.settlementDate)));

  const durReason = missingReason(true, false, r, t);
  const moneyReason = missingReason(true, true, r, t);
  const leaveReason = missingReason(true, false, r, t);

  const money = (v: number | null, reason: string | null): ReactNode =>
    v !== null ? <PrivateAmount value={v} level={1} /> : reason ? <Incomplete reason={reason} t={t} /> : '—';
  const daysOrIncomplete = (v: number | null, reason: string | null): ReactNode =>
    v !== null ? daysText(v, t) : reason ? <Incomplete reason={reason} t={t} /> : '—';

  // ── مشتقّات عرضية للوحة المركز المالي (Employee Financial Position Dashboard v1) ──
  // «إجمالي الالتزام الحالي» = بدل الإجازة + مكافأة نهاية الخدمة فقط — جمع عرضي مباشر
  // لقيمتين قانونيتين من المحرّك، بلا أي تفسير مشتق ولا أي مرجع لسجل المستحقات. بدل الإجازة
  // ومكافأة نهاية الخدمة يكونان null معًا عند نقص البيانات (moneyReason).
  const hasLiability = r.leaveAllowanceValue !== null && eosAmount !== null;
  const liability = hasLiability ? (r.leaveAllowanceValue as number) + (eosAmount as number) : null;
  const finMoney = (v: number | null): ReactNode =>
    v !== null ? <PrivateAmount value={v} level={1} /> : moneyReason ? <Incomplete reason={moneyReason} t={t} /> : '—';

  // المؤشّرات الصحية — عرض فقط، مشتقّة حصريًا من قيم موجودة في الاستجابة. الحالات الإيجابية
  // تُعرض فقط حين لا يغطّي أحد التنبيهات (buildWarnings) نفس الحالة، فلا يتكرر أي معنى؛ ثم
  // تُدمج التنبيهات الفعلية كما هي بلا فقدان أي منها.
  const lastLedgerMs = lastLedgerDate ? new Date(lastLedgerDate).getTime() : null;
  const disbursementAgeDays = lastLedgerMs !== null ? Math.floor((Date.now() - lastLedgerMs) / DAY_MS) : null;
  const healthItems: { id: string; tone: Tone; icon: string; text: string }[] = [];
  if (r.firstYearEligible === true) {
    healthItems.push({ id: 'h-eligible', tone: 'green', icon: 'verified', text: t('msg.ent.health.eligible_for_leave') });
  }
  if (r.hasHireDate && r.hasWageBase) {
    healthItems.push({ id: 'h-complete', tone: 'green', icon: 'task_alt', text: t('msg.ent.health.complete_data') });
  }
  if (ledger.length === 0) {
    healthItems.push({ id: 'h-no-disb', tone: 'neutral', icon: 'account_balance_wallet', text: t('msg.ent.health.no_disbursement') });
  } else if (disbursementAgeDays !== null && disbursementAgeDays > STALE_DISBURSEMENT_DAYS && lastLedgerDate) {
    healthItems.push({ id: 'h-old-disb', tone: 'blue', icon: 'history', text: t('msg.ent.health.stale_disbursement', { date: dateText(lastLedgerDate) }) });
  } else if (lastLedgerDate) {
    healthItems.push({ id: 'h-recent-disb', tone: 'green', icon: 'schedule', text: t('msg.ent.health.recent_disbursement', { date: dateText(lastLedgerDate) }) });
  }
  if (r.remainingLeaveDays !== null && r.remainingLeaveDays > HIGH_LEAVE_BALANCE_DAYS) {
    healthItems.push({ id: 'h-high-leave', tone: 'orange', icon: 'beach_access', text: t('msg.ent.health.high_leave_balance', { days: daysText(r.remainingLeaveDays, t) }) });
  }
  for (const w of warnings) {
    healthItems.push({ id: w.id, tone: w.tone, icon: w.icon, text: w.text });
  }

  return (
    <div className="xpl-scope xpl-page entc-page" dir="rtl">
      {/* Header (الجزء 4) */}
      <ExecutiveHeader
        icon="badge"
        title={emp.fullName}
        subtitle={t('msg.ent.emp_code_subtitle', { code: emp.code })}
        onBack={() => navigate('/employees')}
        chips={
          <>
            <StatusChip tone={emp.status === 'ACTIVE' ? 'green' : 'neutral'} icon={emp.status === 'ACTIVE' ? 'check_circle' : 'block'}>
              {emp.status === 'ACTIVE' ? t('opt.emp.active') : emp.status}
            </StatusChip>
            {r.duration && <IdChip icon="badge" tone="indigo">{t('msg.ent.duration_service', { duration: formatDurationLong({ years: r.duration.years, months: r.duration.months, days: r.duration.days }, t) })}</IdChip>}
          </>
        }
      />

      {/* ══ لوحة المركز المالي التنفيذي (Employee Financial Position Dashboard v1) ══
          إعادة تنظيم بصري فقط: كل القيم تأتي حرفيًا من نفس استجابة API، بلا أي احتساب/
          منطق/قاعدة قانونية جديدة. «قيمة بدل الإجازة» و«مكافأة نهاية الخدمة» انتقلتا هنا
          كطرفَي معادلة المركز المالي؛ وأُعيد تجميع باقي الإحصاءات في «تحليلات الخدمة»
          أدناه — لا حذف لأي قيمة، ظهور واحد لكل قيمة في أنسب موضع. مبنيّة بمكوّنات
          ExplorerKit (SectionCard/MetricCard) وtokensها، RTL، متجاوبة. */}
      <div className="entc-dashboard">
        {/* 1 + 2. الملخص المالي التنفيذي + بطاقة المركز المالي — قيم قانونية مباشرة فقط:
             «إجمالي الالتزام الحالي» = بدل الإجازة + مكافأة نهاية الخدمة. لا يُشتقّ أي رقم
             من سجل المستحقات ولا يُعرض أي «مصروف/مدفوع/رصيد/متبقٍّ». */}
        <SectionCard title={t('section.ent.financial_position')} icon="account_balance">
          <div className="entc-fin-headline">
            <span className="entc-fin-headline-label">{t('field.ent.total_current_liability')}</span>
            <span className="entc-fin-headline-value">
              {liability !== null ? <PrivateAmount value={liability} level={1} /> : moneyReason ? <Incomplete reason={moneyReason} t={t} /> : '—'}
            </span>
            <span className="entc-fin-headline-hint">{t('msg.ent.liability_hint')}</span>
          </div>

          <div className="entc-fin-flow">
            <div className="entc-fin-term">
              <MetricCard
                icon="payments"
                label={t('field.ent.leave_allowance')}
                tone="green"
                value={<span className="ent-kpi-value-sm">{finMoney(r.leaveAllowanceValue)}</span>}
              />
            </div>
            <span className="entc-fin-op" aria-hidden="true">+</span>
            <div className="entc-fin-term">
              <MetricCard
                icon="volunteer_activism"
                label={t('field.ent.eos')}
                tone="orange"
                value={<span className="ent-kpi-value-sm">{finMoney(eosAmount)}</span>}
                sub={eosAmount !== null ? (separationType === 'RESIGNATION' ? t('msg.ent.basis_resignation') : t('msg.ent.basis_termination')) : undefined}
              />
            </div>
          </div>

          <div className="ent-recon-note">
            <span className="material-symbols-outlined" aria-hidden="true">info</span>
            <span>
              {t('msg.ent.legal_estimate_note')}
            </span>
          </div>
        </SectionCard>

        {/* 3. المؤشرات الصحية — مشتقّة من بيانات موجودة فقط، تُعيد استخدام هيئة .ent-warning
             العامة بلا لغة تصميم جديدة */}
        {healthItems.length > 0 && (
          <div className="entc-health">
            <div className="ent-section-heading">{t('section.ent.health_indicators')}</div>
            <div className="entc-health-grid">
              {healthItems.map((h) => (
                <div key={h.id} className={`ent-warning ent-warning--${h.tone}`}>
                  <span className="material-symbols-outlined" aria-hidden="true">{h.icon}</span>
                  <span>{h.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 4. تحليلات الخدمة — إحصاءات الموظف موحَّدة في شبكة متجاوبة نظيفة (نفس القيم
             السابقة تمامًا، إعادة تجميع فقط: تاريخ التعيين/مدة الخدمة/الأجر انتقلت من شريط
             البيانات، وبقية الإحصاءات من بطاقات KPI السابقة) */}
        <div className="ent-section-heading">{t('section.ent.service_analytics')}</div>
        <div className="entc-analytics">
          <MetricCard
            icon="event"
            label={t('field.hire_date')}
            tone="indigo"
            value={<span className="ent-kpi-value-sm">{emp.hireDate ? dateText(emp.hireDate) : <Incomplete reason={t('msg.ent.missing_hire_date')} t={t} />}</span>}
          />
          <MetricCard
            icon="badge"
            label={t('field.ent.service_duration')}
            tone="indigo"
            value={<span className="ent-kpi-value-sm">{r.duration ? formatDurationLong({ years: r.duration.years, months: r.duration.months, days: r.duration.days }, t) : (durReason ? <Incomplete reason={durReason} t={t} /> : '—')}</span>}
          />
          <MetricCard
            icon="account_balance_wallet"
            label={t('field.ent.approved_wage')}
            tone="indigo"
            value={<span className="ent-kpi-value-sm">{wageBase.total > 0 ? <PrivateAmount value={wageBase.total} level={1} /> : (moneyReason ? <Incomplete reason={moneyReason} t={t} /> : '—')}</span>}
          />
          <MetricCard
            icon="event_available"
            label={t('field.ent.total_legal_entitlement')}
            tone="indigo"
            value={daysOrIncomplete(r.accruedLeaveDays, leaveReason)}
          />
          <MetricCard
            icon="beach_access"
            label={t('field.ent.current_leave_balance')}
            tone="blue"
            value={r.remainingLeaveDays !== null ? daysText(r.remainingLeaveDays, t) : '—'}
            sub={
              r.firstYearEligible === false
                ? t('msg.ent.not_yet_eligible_full')
                : r.remainingLeaveDays === null && leaveReason
                  ? t('msg.ent.incomplete_data_reason', { reason: leaveReason })
                  : undefined
            }
          />
          <MetricCard
            icon="event_busy"
            label={t('field.ent.leave_used')}
            tone="blue"
            value={daysText(r.usedLeaveDays, t)}
            sub={brk.grossAnnualLeaveDays > r.usedLeaveDays ? t('msg.ent.leave_used_sub', { days: daysText(brk.grossAnnualLeaveDays, t) }) : undefined}
          />
          <MetricCard icon="celebration" label={t('field.ent.holidays_excluded')} tone="green" value={daysText(brk.holidaysExcludedDays, t)} />
          <MetricCard icon="medical_information" label={t('field.ent.sick_excluded')} tone="green" value={daysText(brk.sickExcludedDays, t)} />
          <MetricCard
            icon="savings"
            label={t('field.ent.total_advances')}
            tone="orange"
            value={String(settlementTotals.count)}
            sub={settlementTotals.count > 0 ? <PrivateAmount value={settlementTotals.totalAmount} level={1} /> : t('msg.ent.no_advances_short')}
          />
        </div>
      </div>

      {/* تفاصيل إضافية — مطويّة افتراضيًا لتقليل التمرير (الجزء 4: «تجنّب كتل تمرير طويلة») */}
      <CollapsibleCard title={t('section.ent.additional_details_calc')} icon="calculate" defaultOpen={false}>
        <div className="ent-fields">
          <DrawerField label={t('field.ent.annual_entitlement')} value={daysText(r.annualEntitlementDays, t)} />
          <DrawerField label={t('field.ent.leave_allowance_days')} value={daysOrIncomplete(r.leaveAllowanceDays, leaveReason)} />
          <DrawerField label={t('field.ent.leave_allowance_value')} value={money(r.leaveAllowanceValue, moneyReason)} />
        </div>

        <div className="entc-subhead">{t('section.ent.eos_title')}</div>
        <Tabs
          tabs={[
            { key: 'EMPLOYER_TERMINATION', label: t('opt.ent.separation.employer_termination'), icon: 'business_center' },
            { key: 'RESIGNATION', label: t('opt.ent.separation.resignation'), icon: 'exit_to_app' },
          ]}
          active={separationType}
          onChange={setSeparationType}
        />
        <div className="ent-eos">
          <span className="ent-eos-label">
            {separationType === 'RESIGNATION'
              ? t('msg.ent.eos_basis_resignation_note')
              : t('msg.ent.eos_basis_termination_note')}
          </span>
          <span className="ent-eos-value">
            {eosAmount !== null ? <PrivateAmount value={eosAmount} level={1} /> : moneyReason ? <Incomplete reason={moneyReason} t={t} /> : '—'}
          </span>
          {g && separationType === 'RESIGNATION' && (
            <span className="ent-eos-fraction">{t('msg.ent.entitlement_percentage', { value: resignationFractionLabel(g.resignationFraction, t) })}</span>
          )}
          {g?.capApplied && separationType === 'EMPLOYER_TERMINATION' && (
            <span className="ent-eos-cap"><StatusChip tone="orange" icon="info">{t('msg.ent.cap_applied')}</StatusChip></span>
          )}
        </div>

        {g && (
          <div className="ent-calc-grid">
            <div className="ent-calc-cell"><span className="ent-calc-label">{t('field.ent.service_duration')}</span><span className="ent-calc-val">{t('unit.ent.years', { n: g.serviceYears })}</span></div>
            <div className="ent-calc-cell"><span className="ent-calc-label">{t('field.ent.approved_wage')}</span><span className="ent-calc-val"><PrivateAmount value={g.approvedWage} level={1} /></span></div>
            {wageBase.allowancesTotal > 0 && (
              <div className="ent-calc-cell"><span className="ent-calc-label">{t('field.ent.active_periodic_allowances')}</span><span className="ent-calc-val"><PrivateAmount value={wageBase.allowancesTotal} level={1} /></span></div>
            )}
            <div className="ent-calc-cell"><span className="ent-calc-label">{t('field.ent.daily_wage')}</span><span className="ent-calc-val"><PrivateAmount value={g.dailyWage} level={1} /></span></div>
            <div className="ent-calc-cell"><span className="ent-calc-label">{t('field.ent.first_tier_entitlement')}</span><span className="ent-calc-val"><PrivateAmount value={g.firstTierAmount} level={1} /></span></div>
            <div className="ent-calc-cell"><span className="ent-calc-label">{t('field.ent.second_tier_entitlement')}</span><span className="ent-calc-val"><PrivateAmount value={g.secondTierAmount} level={1} /></span></div>
            <div className="ent-calc-cell"><span className="ent-calc-label">{t('field.ent.calc_factor')}</span><span className="ent-calc-val">{separationType === 'RESIGNATION' ? resignationFractionLabel(g.resignationFraction, t) : t('msg.ent.full_entitlement_employer')}</span></div>
            <div className="ent-calc-cell ent-calc-cell--total"><span className="ent-calc-label">{t('field.ent.total_gratuity')}</span><span className="ent-calc-val"><PrivateAmount value={eosAmount ?? 0} level={1} /></span></div>
          </div>
        )}
      </CollapsibleCard>

      {/* التنبيهات الذكية أُدمجت الآن ضمن «المؤشرات الصحية» أعلى الصفحة (نفس نصوص
          buildWarnings حرفيًا، بلا فقدان أي تنبيه) — إعادة تنظيم بصري فقط. */}

      {/* Leave Reconciliation (الجزء 4) — شرح بصري فقط، بلا أي احتساب جديد */}
      <SectionCard title={t('section.ent.leave_balance_reconciliation')} icon="account_tree">
        {r.accruedLeaveDays !== null ? (
          <>
            <div className="ent-recon-flow">
              <div className="ent-recon-step ent-recon-step--primary">
                <span className="ent-recon-step-label">{t('field.ent.legal_entitlement')}</span>
                <span className="ent-recon-step-val">{daysText(r.accruedLeaveDays, t)}</span>
              </div>
              <span className="ent-recon-arrow material-symbols-outlined" aria-hidden="true">arrow_downward</span>
              <div className="ent-recon-step">
                <span className="ent-recon-step-label">{t('field.ent.gross_annual_leave')}</span>
                <span className="ent-recon-step-val">{daysText(brk.grossAnnualLeaveDays, t)}</span>
              </div>
              <span className="ent-recon-arrow material-symbols-outlined" aria-hidden="true">arrow_downward</span>
              <div className="ent-recon-step ent-recon-step--exclude">
                <span className="ent-recon-step-label">{t('field.ent.holidays_excluded_note')}</span>
                <span className="ent-recon-step-val">{daysText(brk.holidaysExcludedDays, t)}</span>
              </div>
              <span className="ent-recon-arrow material-symbols-outlined" aria-hidden="true">arrow_downward</span>
              <div className="ent-recon-step ent-recon-step--exclude">
                <span className="ent-recon-step-label">{t('field.ent.sick_excluded_note')}</span>
                <span className="ent-recon-step-val">{daysText(brk.sickExcludedDays, t)}</span>
              </div>
              <span className="ent-recon-arrow material-symbols-outlined" aria-hidden="true">arrow_downward</span>
              <div className="ent-recon-step ent-recon-step--subtotal">
                <span className="ent-recon-step-label">{t('field.ent.net_leave_used')}</span>
                <span className="ent-recon-step-val">{daysText(r.usedLeaveDays, t)}</span>
              </div>
              <span className="ent-recon-arrow material-symbols-outlined" aria-hidden="true">arrow_downward</span>
              <div className="ent-recon-step ent-recon-step--primary">
                <span className="ent-recon-step-label">{t('field.ent.final_remaining_balance')}</span>
                <span className="ent-recon-step-val">{r.remainingLeaveDays !== null ? daysText(r.remainingLeaveDays, t) : '—'}</span>
              </div>
            </div>
            <div className="ent-recon-note">
              <span className="material-symbols-outlined" aria-hidden="true">info</span>
              <span>
                {t('msg.ent.advances_note')}
              </span>
            </div>
          </>
        ) : (
          <div className="ent-fields"><DrawerField label={t('field.ent.reconciliation')} value={leaveReason ? <Incomplete reason={leaveReason} t={t} /> : '—'} /></div>
        )}
      </SectionCard>

      {/* Leave Advance Reconciliation (الجزء 4) */}
      <SectionCard title={t('section.ent.advance_reconciliation')} icon="balance">
        {r.accruedLeaveDays !== null ? (
          <>
            <div className="ent-fields ent-fields--flow">
              <DrawerField label={t('field.ent.total_entitlement_alt')} value={daysText(r.accruedLeaveDays, t)} />
              <DrawerField label={t('field.ent.leave_paid_advance')} value={daysText(settlementTotals.totalDays, t)} />
              <DrawerField
                label={t('field.ent.expected_remaining_final')}
                value={daysText(Math.max(0, r.accruedLeaveDays - settlementTotals.totalDays), t)}
              />
            </div>
            {settlementTotals.totalDays > r.accruedLeaveDays && (
              <div className="ent-recon-note ent-recon-note--warn">
                <span className="material-symbols-outlined" aria-hidden="true">warning</span>
                <span>
                  {t('msg.ent.advance_exceeds_warning', {
                    advanceDays: daysText(settlementTotals.totalDays, t),
                    excessDays: daysText(settlementTotals.totalDays - r.accruedLeaveDays, t),
                  })}
                </span>
              </div>
            )}
            <div className="ent-recon-note">
              <span className="material-symbols-outlined" aria-hidden="true">info</span>
              <span>
                {t('msg.ent.advance_reconciliation_note')}
              </span>
            </div>
          </>
        ) : (
          <div className="ent-fields"><DrawerField label={t('field.ent.reconciliation')} value={leaveReason ? <Incomplete reason={leaveReason} t={t} /> : '—'} /></div>
        )}
      </SectionCard>

      {/* Settlement Summary (الجزء 4) */}
      <SectionCard
        title={t('section.ent.advances_summary')}
        icon="summarize"
        actions={
          <div className="ent-settlement-summary-actions">
            {settlementTotals.count > 0 && (
              <Button variant="secondary" icon="arrow_downward" small onClick={() => scrollToEntSection('entc-section-settlements')}>
                {t('action.ent.view_settlements_log')}
              </Button>
            )}
            {ledger.length > 0 && (
              <Button variant="secondary" icon="arrow_downward" small onClick={() => scrollToEntSection('entc-section-ledger')}>
                {t('action.ent.view_ledger')}
              </Button>
            )}
          </div>
        }
      >
        {settlementTotals.count === 0 ? (
          <EmptyState icon="receipt_long" title={t('msg.ent.no_advances_title')} message={t('msg.ent.no_advances_message')} tone="neutral" />
        ) : (
          <div className="ent-calc-grid">
            <div className="ent-calc-cell">
              <span className="ent-calc-label">{t('field.ent.settlement_count')}</span>
              <span className="ent-calc-val">{settlementTotals.count}</span>
            </div>
            <div className="ent-calc-cell">
              <span className="ent-calc-label">{t('field.ent.last_settlement_date')}</span>
              <span className="ent-calc-val">{settlementTotals.lastDate ? dateText(settlementTotals.lastDate) : '—'}</span>
            </div>
            <div className="ent-calc-cell">
              <span className="ent-calc-label">{t('field.ent.total_days_paid')}</span>
              <span className="ent-calc-val">{daysText(settlementTotals.totalDays, t)}</span>
            </div>
            <div className="ent-calc-cell ent-calc-cell--total">
              <span className="ent-calc-label">{t('field.ent.total_amount_paid')}</span>
              <span className="ent-calc-val"><PrivateAmount value={settlementTotals.totalAmount} level={1} /></span>
            </div>
          </div>
        )}
      </SectionCard>

      {/* Historical Timeline (الجزء 4) */}
      <SectionCard title={t('section.ent.historical_activity')} icon="timeline">
        {timeline.length === 0 ? (
          <EmptyState icon="history" title={t('msg.ent.no_activity_title')} message={t('msg.ent.no_activity_message')} tone="neutral" />
        ) : (
          <>
            <ul className="xpl-timeline">
              {timeline.slice(0, 15).map((it) => (
                <li className="xpl-timeline-item" key={it.key}>
                  <span className={`xpl-timeline-dot xpl-dot--${it.tone}`}>
                    <span className="material-symbols-outlined" aria-hidden="true">{it.icon}</span>
                  </span>
                  <div className="xpl-timeline-body">
                    <span className="xpl-timeline-title">{it.title}</span>
                    {it.meta != null && <span className="xpl-timeline-meta">{it.meta}</span>}
                  </div>
                  <span className="xpl-timeline-time">{dateText(it.dateIso)}</span>
                </li>
              ))}
            </ul>
            {timeline.length > 15 && (
              <p className="ent-timeline-more">
                {t('msg.ent.timeline_more', { total: timeline.length })}
              </p>
            )}
          </>
        )}
      </SectionCard>

      {/* Historical Ledger (الجزء 4) */}
      <div id="entc-section-ledger">
        <SectionCard title={t('section.ent.ledger_history')} icon="account_balance_wallet">
          {canManage && (
            <div className="ent-settlement-actions">
              <Button variant="primary" icon="add" onClick={() => setShowLedgerDialog(true)}>{t('page.ent.add_ledger_entry')}</Button>
            </div>
          )}
          {ledger.length === 0 ? (
            <EmptyState icon="receipt_long" title={t('msg.ent.no_ledger_title')} message={t('msg.ent.no_ledger_message')} tone="neutral" />
          ) : (
            <div className="xpl-table-wrap entc-table--journal">
              <table className="xpl-table">
                <thead>
                  <tr><th>{t('col.date')}</th><th>{t('col.type')}</th><th>{t('col.description')}</th><th>{t('field.ent.days_count')}</th><th>{t('col.ent.balance_at_disbursement')}</th><th>{t('col.amount')}</th><th>{t('field.payment_method')}</th><th>{t('field.notes')}</th></tr>
                </thead>
                <tbody>
                  {ledger.map((e) => {
                    const isLeaveAllowance = e.entryType === 'LEAVE_ALLOWANCE';
                    // مؤشّر بصري فقط: هل توجد دفعة مقدَّمة بنفس اليوم؟ لا ربط منطقي/حسابي.
                    const linked = isLeaveAllowance && hasMatchingSettlement(e.entryDate, settlementDayKeys);
                    return (
                      <tr key={e.id}>
                        <td>{dateText(e.entryDate)}</td>
                        <td>
                          <span className="ent-ledger-type">
                            {LEDGER_TYPE_LABEL[e.entryType] ? t(LEDGER_TYPE_LABEL[e.entryType]) : e.entryType}
                            {linked && <StatusChip tone="blue" icon="link">{t('tag.ent.linked_to_advance')}</StatusChip>}
                          </span>
                        </td>
                        <td>{e.description || '—'}</td>
                        <td>{isLeaveAllowance && e.leaveDays != null ? daysText(e.leaveDays, t) : '—'}</td>
                        <td>{isLeaveAllowance && e.leaveBalanceSnapshot != null ? daysText(e.leaveBalanceSnapshot, t) : '—'}</td>
                        <td><PrivateAmount value={e.amount} level={1} /></td>
                        <td>{SETTLEMENT_METHOD_LABEL[e.paymentMethod] ? t(SETTLEMENT_METHOD_LABEL[e.paymentMethod]) : e.paymentMethod}</td>
                        <td>{e.notes || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>

      {/* Detailed tables (الجزء 4) — مطويّة (مفتوحة افتراضيًا) لتقليل التمرير الطويل */}
      <CollapsibleCard title={t('section.ent.leave_history')} icon="event_available">
        {leaveHistory.length === 0 ? (
          <EmptyState icon="event_busy" title={t('msg.ent.no_leave_history_title')} message={t('msg.ent.no_leave_history_message')} tone="neutral" />
        ) : (
          <div className="xpl-table-wrap">
            <table className="xpl-table">
              <thead>
                <tr><th>{t('col.type')}</th><th>{t('field.start_date')}</th><th>{t('field.end_date')}</th><th>{t('field.ent.days_count')}</th><th>{t('col.status')}</th></tr>
              </thead>
              <tbody>
                {leaveHistory.map((l) => {
                  const st = LEAVE_STATUS[l.status] ?? { key: '', tone: 'neutral' as const, icon: 'help' };
                  const stLabel = st.key ? t(st.key) : l.status;
                  return (
                    <tr key={l.id}>
                      <td>{LEAVE_TYPE_LABEL[l.type] ? t(LEAVE_TYPE_LABEL[l.type]) : l.type}</td>
                      <td>{dateText(l.startDate)}</td>
                      <td>{dateText(l.endDate)}</td>
                      <td>{daysText(l.days, t)}</td>
                      <td><StatusChip tone={st.tone} icon={st.icon}>{stLabel}</StatusChip></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleCard>

      <div id="entc-section-settlements">
        <CollapsibleCard title={t('section.ent.settlements_history')} icon="savings">
          {canManage && (
            <div className="ent-settlement-actions">
              <Button variant="primary" icon="add" onClick={() => setShowSettlementDialog(true)}>{t('action.ent.record_advance')}</Button>
            </div>
          )}
          {settlements.length === 0 ? (
            <EmptyState icon="receipt_long" title={t('msg.ent.no_advances_title')} message={t('msg.ent.no_advances_message')} tone="neutral" />
          ) : (
            <div className="xpl-table-wrap">
              <table className="xpl-table">
                <thead>
                  <tr><th>{t('col.date')}</th><th>{t('field.ent.days_count')}</th><th>{t('col.amount')}</th><th>{t('field.payment_method')}</th><th>{t('field.notes')}</th></tr>
                </thead>
                <tbody>
                  {settlements.map((s) => (
                    <tr key={s.id}>
                      <td>{dateText(s.settlementDate)}</td>
                      <td>{daysText(s.leaveDaysSettled, t)}</td>
                      <td><PrivateAmount value={s.settlementAmount} level={1} /></td>
                      <td>{SETTLEMENT_METHOD_LABEL[s.paymentMethod] ? t(SETTLEMENT_METHOD_LABEL[s.paymentMethod]) : s.paymentMethod}</td>
                      <td>{s.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CollapsibleCard>
      </div>

      {/* الإشعار القانوني — دائم الظهور (لا يُخفى عند اكتمال البيانات) */}
      <div className="ent-legal" role="note">
        <span className="material-symbols-outlined" aria-hidden="true">gavel</span>
        <p>
          {t('msg.ent.legal_notice_full')}
        </p>
      </div>

      {showSettlementDialog && (
        <LeaveSettlementDialog
          employeeId={employeeId}
          defaultDays={r.leaveAllowanceDays}
          defaultAmount={r.leaveAllowanceValue}
          onClose={() => setShowSettlementDialog(false)}
          onSaved={() => { setShowSettlementDialog(false); setReloadKey((k) => k + 1); }}
        />
      )}

      {showLedgerDialog && (
        <EntitlementLedgerDialog
          employeeId={employeeId}
          leaveBalanceDays={r.leaveAllowanceDays}
          leaveAllowanceValue={r.leaveAllowanceValue}
          eosValue={eosAmount}
          onClose={() => setShowLedgerDialog(false)}
          onSaved={() => { setShowLedgerDialog(false); setReloadKey((k) => k + 1); }}
        />
      )}
    </div>
  );
}
