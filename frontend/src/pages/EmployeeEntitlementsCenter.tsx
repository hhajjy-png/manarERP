import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../stores/authStore';
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
    () => (data ? buildWarnings(data.result, data.leaveExclusionBreakdown, settlementTotals.totalDays, data.ledger) : []),
    [data, settlementTotals.totalDays],
  );

  const timeline = useMemo(
    () => (data ? buildTimeline(data.leaveHistory, data.settlements, data.ledger) : []),
    [data],
  );

  const pageShell = (content: ReactNode) => (
    <div className="xpl-scope xpl-page entc-page" dir="rtl">
      <ExecutiveHeader icon="badge" title="مركز المستحقات" onBack={() => navigate('/employees')} />
      {content}
    </div>
  );

  if (!validId) return pageShell(<ErrorBanner>معرّف الموظف غير صالح.</ErrorBanner>);
  if (!canRead) {
    return pageShell(
      <EmptyState icon="lock" title="صلاحية غير متوفرة" message="لا تملك صلاحية عرض استحقاقات هذا الموظف." tone="neutral" />,
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

  const durReason = missingReason(true, false, r);
  const moneyReason = missingReason(true, true, r);
  const leaveReason = missingReason(true, false, r);

  const money = (v: number | null, reason: string | null): ReactNode =>
    v !== null ? <PrivateAmount value={v} level={1} /> : reason ? <Incomplete reason={reason} /> : '—';
  const daysOrIncomplete = (v: number | null, reason: string | null): ReactNode =>
    v !== null ? daysText(v) : reason ? <Incomplete reason={reason} /> : '—';

  // ── مشتقّات عرضية للوحة المركز المالي (Employee Financial Position Dashboard v1) ──
  // «إجمالي الالتزام الحالي» = بدل الإجازة + مكافأة نهاية الخدمة فقط — جمع عرضي مباشر
  // لقيمتين قانونيتين من المحرّك، بلا أي تفسير مشتق ولا أي مرجع لسجل المستحقات. بدل الإجازة
  // ومكافأة نهاية الخدمة يكونان null معًا عند نقص البيانات (moneyReason).
  const hasLiability = r.leaveAllowanceValue !== null && eosAmount !== null;
  const liability = hasLiability ? (r.leaveAllowanceValue as number) + (eosAmount as number) : null;
  const finMoney = (v: number | null): ReactNode =>
    v !== null ? <PrivateAmount value={v} level={1} /> : moneyReason ? <Incomplete reason={moneyReason} /> : '—';

  // المؤشّرات الصحية — عرض فقط، مشتقّة حصريًا من قيم موجودة في الاستجابة. الحالات الإيجابية
  // تُعرض فقط حين لا يغطّي أحد التنبيهات (buildWarnings) نفس الحالة، فلا يتكرر أي معنى؛ ثم
  // تُدمج التنبيهات الفعلية كما هي بلا فقدان أي منها.
  const lastLedgerMs = lastLedgerDate ? new Date(lastLedgerDate).getTime() : null;
  const disbursementAgeDays = lastLedgerMs !== null ? Math.floor((Date.now() - lastLedgerMs) / DAY_MS) : null;
  const healthItems: { id: string; tone: Tone; icon: string; text: string }[] = [];
  if (r.firstYearEligible === true) {
    healthItems.push({ id: 'h-eligible', tone: 'green', icon: 'verified', text: 'الموظف مؤهل للإجازة السنوية (أتمّ 9 أشهر خدمة).' });
  }
  if (r.hasHireDate && r.hasWageBase) {
    healthItems.push({ id: 'h-complete', tone: 'green', icon: 'task_alt', text: 'بيانات الموظف الأساسية مكتملة (تاريخ التعيين والأجر المعتمد).' });
  }
  if (ledger.length === 0) {
    healthItems.push({ id: 'h-no-disb', tone: 'neutral', icon: 'account_balance_wallet', text: 'لا توجد مستحقات مصروفة مسجَّلة لهذا الموظف بعد.' });
  } else if (disbursementAgeDays !== null && disbursementAgeDays > STALE_DISBURSEMENT_DAYS && lastLedgerDate) {
    healthItems.push({ id: 'h-old-disb', tone: 'blue', icon: 'history', text: `آخر صرف مستحق كان قبل أكثر من سنة (${dateText(lastLedgerDate)}).` });
  } else if (lastLedgerDate) {
    healthItems.push({ id: 'h-recent-disb', tone: 'green', icon: 'schedule', text: `آخر صرف مستحق: ${dateText(lastLedgerDate)}.` });
  }
  if (r.remainingLeaveDays !== null && r.remainingLeaveDays > HIGH_LEAVE_BALANCE_DAYS) {
    healthItems.push({ id: 'h-high-leave', tone: 'orange', icon: 'beach_access', text: `رصيد إجازة مرتفع (${daysText(r.remainingLeaveDays)}) — قد يستدعي جدولة إجازة أو تسوية.` });
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
        subtitle={`الرقم الوظيفي: ${emp.code}`}
        onBack={() => navigate('/employees')}
        chips={
          <>
            <StatusChip tone={emp.status === 'ACTIVE' ? 'green' : 'neutral'} icon={emp.status === 'ACTIVE' ? 'check_circle' : 'block'}>
              {emp.status === 'ACTIVE' ? 'نشط' : emp.status}
            </StatusChip>
            {r.duration && <IdChip icon="badge" tone="indigo">{formatDurationLong({ years: r.duration.years, months: r.duration.months, days: r.duration.days })} خدمة</IdChip>}
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
        <SectionCard title="المركز المالي" icon="account_balance">
          <div className="entc-fin-headline">
            <span className="entc-fin-headline-label">إجمالي الالتزام الحالي</span>
            <span className="entc-fin-headline-value">
              {liability !== null ? <PrivateAmount value={liability} level={1} /> : moneyReason ? <Incomplete reason={moneyReason} /> : '—'}
            </span>
            <span className="entc-fin-headline-hint">بدل الإجازة + مكافأة نهاية الخدمة (تقديري حتى تاريخ اليوم)</span>
          </div>

          <div className="entc-fin-flow">
            <div className="entc-fin-term">
              <MetricCard
                icon="payments"
                label="بدل الإجازة"
                tone="green"
                value={<span className="ent-kpi-value-sm">{finMoney(r.leaveAllowanceValue)}</span>}
              />
            </div>
            <span className="entc-fin-op" aria-hidden="true">+</span>
            <div className="entc-fin-term">
              <MetricCard
                icon="volunteer_activism"
                label="مكافأة نهاية الخدمة"
                tone="orange"
                value={<span className="ent-kpi-value-sm">{finMoney(eosAmount)}</span>}
                sub={eosAmount !== null ? (separationType === 'RESIGNATION' ? 'أساس: استقالة' : 'أساس: إنهاء من صاحب العمل') : undefined}
              />
            </div>
          </div>

          <div className="ent-recon-note">
            <span className="material-symbols-outlined" aria-hidden="true">info</span>
            <span>
              قيم قانونية تقديرية حتى تاريخ اليوم فقط (المحرّك القانوني) — ليست بديلاً عن التسوية
              النهائية الرسمية.
            </span>
          </div>
        </SectionCard>

        {/* 3. المؤشرات الصحية — مشتقّة من بيانات موجودة فقط، تُعيد استخدام هيئة .ent-warning
             العامة بلا لغة تصميم جديدة */}
        {healthItems.length > 0 && (
          <div className="entc-health">
            <div className="ent-section-heading">المؤشرات الصحية</div>
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
        <div className="ent-section-heading">تحليلات الخدمة</div>
        <div className="entc-analytics">
          <MetricCard
            icon="event"
            label="تاريخ التعيين"
            tone="indigo"
            value={<span className="ent-kpi-value-sm">{emp.hireDate ? dateText(emp.hireDate) : <Incomplete reason="تاريخ التعيين غير مُدخل" />}</span>}
          />
          <MetricCard
            icon="badge"
            label="مدة الخدمة"
            tone="indigo"
            value={<span className="ent-kpi-value-sm">{r.duration ? formatDurationLong({ years: r.duration.years, months: r.duration.months, days: r.duration.days }) : (durReason ? <Incomplete reason={durReason} /> : '—')}</span>}
          />
          <MetricCard
            icon="account_balance_wallet"
            label="الأجر المعتمد"
            tone="indigo"
            value={<span className="ent-kpi-value-sm">{wageBase.total > 0 ? <PrivateAmount value={wageBase.total} level={1} /> : (moneyReason ? <Incomplete reason={moneyReason} /> : '—')}</span>}
          />
          <MetricCard
            icon="event_available"
            label="الاستحقاق القانوني الإجمالي"
            tone="indigo"
            value={daysOrIncomplete(r.accruedLeaveDays, leaveReason)}
          />
          <MetricCard
            icon="beach_access"
            label="رصيد الإجازة الحالي"
            tone="blue"
            value={r.remainingLeaveDays !== null ? daysText(r.remainingLeaveDays) : '—'}
            sub={
              r.firstYearEligible === false
                ? 'غير مؤهل بعد — يلزم إتمام 9 أشهر خدمة'
                : r.remainingLeaveDays === null && leaveReason
                  ? `بيانات غير مكتملة — ${leaveReason}`
                  : undefined
            }
          />
          <MetricCard
            icon="event_busy"
            label="الإجازة المستخدمة"
            tone="blue"
            value={daysText(r.usedLeaveDays)}
            sub={brk.grossAnnualLeaveDays > r.usedLeaveDays ? `من أصل ${daysText(brk.grossAnnualLeaveDays)} محجوزة` : undefined}
          />
          <MetricCard icon="celebration" label="عطل رسمية مستثناة" tone="green" value={daysText(brk.holidaysExcludedDays)} />
          <MetricCard icon="medical_information" label="إجازة مرضية مستثناة" tone="green" value={daysText(brk.sickExcludedDays)} />
          <MetricCard
            icon="savings"
            label="إجمالي الدفعات المقدَّمة"
            tone="orange"
            value={String(settlementTotals.count)}
            sub={settlementTotals.count > 0 ? <PrivateAmount value={settlementTotals.totalAmount} level={1} /> : 'لا توجد دفعات'}
          />
        </div>
      </div>

      {/* تفاصيل إضافية — مطويّة افتراضيًا لتقليل التمرير (الجزء 4: «تجنّب كتل تمرير طويلة») */}
      <CollapsibleCard title="تفاصيل إضافية والاحتساب" icon="calculate" defaultOpen={false}>
        <div className="ent-fields">
          <DrawerField label="الاستحقاق السنوي" value={daysText(r.annualEntitlementDays)} />
          <DrawerField label="الأيام المستحقة لبدل الإجازة" value={daysOrIncomplete(r.leaveAllowanceDays, leaveReason)} />
          <DrawerField label="القيمة النقدية لبدل الإجازة" value={money(r.leaveAllowanceValue, moneyReason)} />
        </div>

        <div className="entc-subhead">مكافأة نهاية الخدمة (المادتان 51 و53)</div>
        <Tabs
          tabs={[
            { key: 'EMPLOYER_TERMINATION', label: 'إنهاء من صاحب العمل', icon: 'business_center' },
            { key: 'RESIGNATION', label: 'استقالة', icon: 'exit_to_app' },
          ]}
          active={separationType}
          onChange={setSeparationType}
        />
        <div className="ent-eos">
          <span className="ent-eos-label">
            {separationType === 'RESIGNATION'
              ? 'الاستحقاق حتى اليوم — بافتراض استقالة الموظف (المادة 53)'
              : 'الاستحقاق حتى اليوم — بافتراض إنهاء الخدمة من صاحب العمل (المادة 51)'}
          </span>
          <span className="ent-eos-value">
            {eosAmount !== null ? <PrivateAmount value={eosAmount} level={1} /> : moneyReason ? <Incomplete reason={moneyReason} /> : '—'}
          </span>
          {g && separationType === 'RESIGNATION' && (
            <span className="ent-eos-fraction">نسبة الاستحقاق: {resignationFractionLabel(g.resignationFraction)}</span>
          )}
          {g?.capApplied && separationType === 'EMPLOYER_TERMINATION' && (
            <span className="ent-eos-cap"><StatusChip tone="orange" icon="info">طُبّق الحد الأقصى (أجر 18 شهرًا)</StatusChip></span>
          )}
        </div>

        {g && (
          <div className="ent-calc-grid">
            <div className="ent-calc-cell"><span className="ent-calc-label">مدة الخدمة</span><span className="ent-calc-val">{g.serviceYears} سنة</span></div>
            <div className="ent-calc-cell"><span className="ent-calc-label">الأجر المعتمد</span><span className="ent-calc-val"><PrivateAmount value={g.approvedWage} level={1} /></span></div>
            {wageBase.allowancesTotal > 0 && (
              <div className="ent-calc-cell"><span className="ent-calc-label">منها بدلات دورية نشطة</span><span className="ent-calc-val"><PrivateAmount value={wageBase.allowancesTotal} level={1} /></span></div>
            )}
            <div className="ent-calc-cell"><span className="ent-calc-label">الأجر اليومي</span><span className="ent-calc-val"><PrivateAmount value={g.dailyWage} level={1} /></span></div>
            <div className="ent-calc-cell"><span className="ent-calc-label">استحقاق أول مدة</span><span className="ent-calc-val"><PrivateAmount value={g.firstTierAmount} level={1} /></span></div>
            <div className="ent-calc-cell"><span className="ent-calc-label">استحقاق المدة الإضافية</span><span className="ent-calc-val"><PrivateAmount value={g.secondTierAmount} level={1} /></span></div>
            <div className="ent-calc-cell"><span className="ent-calc-label">معامل الاحتساب</span><span className="ent-calc-val">{separationType === 'RESIGNATION' ? resignationFractionLabel(g.resignationFraction) : '100% (إنهاء من صاحب العمل)'}</span></div>
            <div className="ent-calc-cell ent-calc-cell--total"><span className="ent-calc-label">إجمالي المكافأة</span><span className="ent-calc-val"><PrivateAmount value={eosAmount ?? 0} level={1} /></span></div>
          </div>
        )}
      </CollapsibleCard>

      {/* التنبيهات الذكية أُدمجت الآن ضمن «المؤشرات الصحية» أعلى الصفحة (نفس نصوص
          buildWarnings حرفيًا، بلا فقدان أي تنبيه) — إعادة تنظيم بصري فقط. */}

      {/* Leave Reconciliation (الجزء 4) — شرح بصري فقط، بلا أي احتساب جديد */}
      <SectionCard title="تسوية رصيد الإجازة" icon="account_tree">
        {r.accruedLeaveDays !== null ? (
          <>
            <div className="ent-recon-flow">
              <div className="ent-recon-step ent-recon-step--primary">
                <span className="ent-recon-step-label">الاستحقاق القانوني</span>
                <span className="ent-recon-step-val">{daysText(r.accruedLeaveDays)}</span>
              </div>
              <span className="ent-recon-arrow material-symbols-outlined" aria-hidden="true">arrow_downward</span>
              <div className="ent-recon-step">
                <span className="ent-recon-step-label">الإجازة السنوية المحجوزة (إجمالي خام)</span>
                <span className="ent-recon-step-val">{daysText(brk.grossAnnualLeaveDays)}</span>
              </div>
              <span className="ent-recon-arrow material-symbols-outlined" aria-hidden="true">arrow_downward</span>
              <div className="ent-recon-step ent-recon-step--exclude">
                <span className="ent-recon-step-label">− عطل رسمية مستثناة (لا تُحتسب استهلاكًا)</span>
                <span className="ent-recon-step-val">{daysText(brk.holidaysExcludedDays)}</span>
              </div>
              <span className="ent-recon-arrow material-symbols-outlined" aria-hidden="true">arrow_downward</span>
              <div className="ent-recon-step ent-recon-step--exclude">
                <span className="ent-recon-step-label">− إجازة مرضية معتمدة مستثناة (لا تُحتسب استهلاكًا)</span>
                <span className="ent-recon-step-val">{daysText(brk.sickExcludedDays)}</span>
              </div>
              <span className="ent-recon-arrow material-symbols-outlined" aria-hidden="true">arrow_downward</span>
              <div className="ent-recon-step ent-recon-step--subtotal">
                <span className="ent-recon-step-label">= الإجازة المستخدمة صافيًا</span>
                <span className="ent-recon-step-val">{daysText(r.usedLeaveDays)}</span>
              </div>
              <span className="ent-recon-arrow material-symbols-outlined" aria-hidden="true">arrow_downward</span>
              <div className="ent-recon-step ent-recon-step--primary">
                <span className="ent-recon-step-label">= الرصيد النهائي المتبقي</span>
                <span className="ent-recon-step-val">{r.remainingLeaveDays !== null ? daysText(r.remainingLeaveDays) : '—'}</span>
              </div>
            </div>
            <div className="ent-recon-note">
              <span className="material-symbols-outlined" aria-hidden="true">info</span>
              <span>
                الدفعات المقدَّمة على الإجازة (سجل منفصل أدناه) توثيق تاريخي فقط — لا تُخصَم من
                هذا الرصيد ولا تُغيّره (المادتان 73 و74).
              </span>
            </div>
          </>
        ) : (
          <div className="ent-fields"><DrawerField label="التسوية" value={leaveReason ? <Incomplete reason={leaveReason} /> : '—'} /></div>
        )}
      </SectionCard>

      {/* Leave Advance Reconciliation (الجزء 4) */}
      <SectionCard title="تسوية الدفعات المقدَّمة على الإجازة" icon="balance">
        {r.accruedLeaveDays !== null ? (
          <>
            <div className="ent-fields ent-fields--flow">
              <DrawerField label="إجمالي الاستحقاق القانوني" value={daysText(r.accruedLeaveDays)} />
              <DrawerField label="الإجازة المدفوعة مقدَّمًا" value={daysText(settlementTotals.totalDays)} />
              <DrawerField
                label="المتبقي المتوقع عند التسوية النهائية"
                value={daysText(Math.max(0, r.accruedLeaveDays - settlementTotals.totalDays))}
              />
            </div>
            {settlementTotals.totalDays > r.accruedLeaveDays && (
              <div className="ent-recon-note ent-recon-note--warn">
                <span className="material-symbols-outlined" aria-hidden="true">warning</span>
                <span>
                  فرق: الدفعات المقدَّمة ({daysText(settlementTotals.totalDays)}) تتجاوز الاستحقاق القانوني الحالي
                  بمقدار {daysText(settlementTotals.totalDays - r.accruedLeaveDays)}.
                </span>
              </div>
            )}
            <div className="ent-recon-note">
              <span className="material-symbols-outlined" aria-hidden="true">info</span>
              <span>
                هذه تسوية إرشادية للدفعات المقدَّمة فقط — لا تُخصَم من رصيد الإجازة القانوني
                المعروض أعلاه (المادتان 73 و74)، وليست بديلاً عن التسوية النهائية الرسمية.
              </span>
            </div>
          </>
        ) : (
          <div className="ent-fields"><DrawerField label="التسوية" value={leaveReason ? <Incomplete reason={leaveReason} /> : '—'} /></div>
        )}
      </SectionCard>

      {/* Settlement Summary (الجزء 4) */}
      <SectionCard
        title="ملخص الدفعات المقدَّمة"
        icon="summarize"
        actions={
          <div className="ent-settlement-summary-actions">
            {settlementTotals.count > 0 && (
              <Button variant="secondary" icon="arrow_downward" small onClick={() => scrollToEntSection('entc-section-settlements')}>
                عرض سجل الدفعات
              </Button>
            )}
            {ledger.length > 0 && (
              <Button variant="secondary" icon="arrow_downward" small onClick={() => scrollToEntSection('entc-section-ledger')}>
                عرض دفتر المستحقات
              </Button>
            )}
          </div>
        }
      >
        {settlementTotals.count === 0 ? (
          <EmptyState icon="receipt_long" title="لا توجد دفعات مقدَّمة" message="لم تُسجَّل أي دفعة مقدَّمة على الإجازة بعد." tone="neutral" />
        ) : (
          <div className="ent-calc-grid">
            <div className="ent-calc-cell">
              <span className="ent-calc-label">عدد الدفعات</span>
              <span className="ent-calc-val">{settlementTotals.count}</span>
            </div>
            <div className="ent-calc-cell">
              <span className="ent-calc-label">تاريخ آخر دفعة</span>
              <span className="ent-calc-val">{settlementTotals.lastDate ? dateText(settlementTotals.lastDate) : '—'}</span>
            </div>
            <div className="ent-calc-cell">
              <span className="ent-calc-label">إجمالي الأيام المدفوعة</span>
              <span className="ent-calc-val">{daysText(settlementTotals.totalDays)}</span>
            </div>
            <div className="ent-calc-cell ent-calc-cell--total">
              <span className="ent-calc-label">إجمالي المبلغ المدفوع</span>
              <span className="ent-calc-val"><PrivateAmount value={settlementTotals.totalAmount} level={1} /></span>
            </div>
          </div>
        )}
      </SectionCard>

      {/* Historical Timeline (الجزء 4) */}
      <SectionCard title="النشاط التاريخي" icon="timeline">
        {timeline.length === 0 ? (
          <EmptyState icon="history" title="لا يوجد نشاط بعد" message="لم يُسجَّل أي نشاط استحقاقات لهذا الموظف بعد." tone="neutral" />
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
                عرض أحدث 15 من أصل {timeline.length} — التفاصيل الكاملة في الجداول أدناه.
              </p>
            )}
          </>
        )}
      </SectionCard>

      {/* Historical Ledger (الجزء 4) */}
      <div id="entc-section-ledger">
        <SectionCard title="سجل المستحقات المصروفة (دفتر المستحقات التاريخي)" icon="account_balance_wallet">
          {canManage && (
            <div className="ent-settlement-actions">
              <Button variant="primary" icon="add" onClick={() => setShowLedgerDialog(true)}>إضافة مستحق</Button>
            </div>
          )}
          {ledger.length === 0 ? (
            <EmptyState icon="receipt_long" title="لا توجد مستحقات مصروفة" message="لم يُسجَّل أي مستحق مصروف لهذا الموظف بعد." tone="neutral" />
          ) : (
            <div className="xpl-table-wrap entc-table--journal">
              <table className="xpl-table">
                <thead>
                  <tr><th>التاريخ</th><th>النوع</th><th>الوصف</th><th>عدد الأيام</th><th>الرصيد وقت الصرف</th><th>المبلغ</th><th>طريقة الدفع</th><th>ملاحظات</th></tr>
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
                            {LEDGER_TYPE_LABEL[e.entryType] ?? e.entryType}
                            {linked && <StatusChip tone="blue" icon="link">مرتبط بدفعة مقدَّمة</StatusChip>}
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
      </div>

      {/* Detailed tables (الجزء 4) — مطويّة (مفتوحة افتراضيًا) لتقليل التمرير الطويل */}
      <CollapsibleCard title="سجل الإجازات" icon="event_available">
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
                  const st = LEAVE_STATUS[l.status] ?? { label: l.status, tone: 'neutral' as const, icon: 'help' };
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
      </CollapsibleCard>

      <div id="entc-section-settlements">
        <CollapsibleCard title="سجل الدفعات المقدَّمة على الإجازة" icon="savings">
          {canManage && (
            <div className="ent-settlement-actions">
              <Button variant="primary" icon="add" onClick={() => setShowSettlementDialog(true)}>تسجيل دفعة مقدَّمة</Button>
            </div>
          )}
          {settlements.length === 0 ? (
            <EmptyState icon="receipt_long" title="لا توجد دفعات مقدَّمة" message="لم تُسجَّل أي دفعة مقدَّمة على الإجازة بعد." tone="neutral" />
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
        </CollapsibleCard>
      </div>

      {/* الإشعار القانوني — دائم الظهور (لا يُخفى عند اكتمال البيانات) */}
      <div className="ent-legal" role="note">
        <span className="material-symbols-outlined" aria-hidden="true">gavel</span>
        <p>
          القيم أعلاه تقديرية للاسترشاد فقط، محسوبة حتى تاريخ اليوم وفق قانون العمل الكويتي رقم 6
          لسنة 2010. الأجر اليومي = الأجر الشهري المعتمد ÷ 26 (خط الأساس القانوني المعتمد للمشروع).
          الأجر الشهري المعتمد = الراتب الأساسي + البدلات الدورية النشطة حاليًا (المادتان 55 و62).
          مكافأة نهاية الخدمة (المادة 51) تُعرض بسيناريوهَين صريحَين: الاستحقاق الكامل عند إنهاء
          الخدمة من صاحب العمل، أو المخفَّض بنسبة الاستقالة (المادة 53) — تحقّق من اختيار الأساس
          الصحيح أعلاه قبل الاعتماد على أي رقم. رصيد الإجازة السنوية (المادة 70) يتراكم دومًا من
          تاريخ التعيين؛ أي دفعة مقدَّمة مسجَّلة في «سجل الدفعات المقدَّمة على الإجازة» توثيق تاريخي
          فقط ولا تُسقط أو تُنقص هذا الاستحقاق (المادتان 73 و74). هذه الأرقام ليست بديلاً عن التسوية
          النهائية الرسمية المعتمدة.
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
