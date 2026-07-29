import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../stores/authStore';
import { useT } from '../lib/i18n';
import { dateText } from '../config/modules';
import { formatMoneyCell } from '../lib/format/currency';
import PrivateAmount from '../components/PrivateAmount';
import {
  ExecutiveHeader,
  IdChip,
  SectionCard,
  StatusChip,
  DrawerField,
  EmptyState,
  ErrorBanner,
  SkeletonRows,
  Button,
  Tabs,
} from '../components/explorer/ExplorerKit';
import '../components/explorer/explorer-kit.css';
import EntitlementPaymentDialog from '../components/employee/EntitlementPaymentDialog';
import FinalSettlementDialog from '../components/employee/FinalSettlementDialog';
import FinalSettlementApproveDialog from '../components/employee/FinalSettlementApproveDialog';
import SettlementPaymentDialog from '../components/employee/SettlementPaymentDialog';
import FinalSettlementCancelDialog from '../components/employee/FinalSettlementCancelDialog';
import ConfirmModal from '../components/ConfirmModal';
import {
  type SeparationType,
  type PayableCategory,
  type PaymentRow,
  type SettlementPaymentRow,
  CATEGORY_LABEL,
  PAYMENT_METHOD_LABEL,
  TERMINATION_REASON_LABEL,
  SETTLEMENT_STATUS,
  LEAVE_TYPE_LABEL,
  LEAVE_STATUS,
  formatDurationLong,
  daysText,
  resignationFractionLabel,
  missingReason,
  Incomplete,
  buildWarnings,
  buildTimeline,
  type EntitlementsResponse,
} from '../components/employee/entitlementsShared';
import '../components/employee/EmployeeEntitlementsTab.css';
import './EmployeeEntitlementsCenter.css';

/* عتبة عرضية لتنبيه إرشادي واحد (لا قاعدة عمل جديدة) — تُسمّي حالة موجودة أصلاً بصريًا. */
const HIGH_LEAVE_BALANCE_DAYS = 30;

/** الفئة الوحيدة القابلة للصرف في هذه الحزمة (انظر PAYABLE_CATEGORIES في الخادم). */
const LEAVE_ALLOWANCE_CATEGORY: PayableCategory = 'LEAVE_ALLOWANCE';

/**
 * قسم قابل للطيّ — الوسيلة الوحيدة للإفصاح التدريجي في هذه الصفحة.
 * `meta` يظهر في السطر المطويّ نفسه، فيبقى جوهر القسم مقروءًا دون فتحه.
 */
function Disclosure({
  title,
  icon,
  meta,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon: string;
  meta?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="xpl-card entc-collapsible" open={defaultOpen}>
      <summary className="entc-collapsible-summary">
        <span className="material-symbols-outlined" aria-hidden="true">{icon}</span>
        <span className="entc-collapsible-title">{title}</span>
        {meta != null && <span className="entc-collapsible-meta">{meta}</span>}
        <span className="material-symbols-outlined entc-collapsible-chevron" aria-hidden="true">expand_more</span>
      </summary>
      <div className="xpl-card--pad">{children}</div>
    </details>
  );
}

/**
 * مجموعة بيانات مضغوطة — عنوان صغير فوق شبكة من أزواج (عنوان/قيمة) قصيرة.
 * تحلّ محلّ تسلسل صفوف كاملة العرض: نفس المعلومات، مسح بصري أسرع، وارتفاع أقلّ بكثير.
 */
function DataGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="entc-group">
      <div className="entc-group-title">{title}</div>
      <dl className="entc-group-grid">{children}</dl>
    </div>
  );
}

/** زوج واحد داخل مجموعة بيانات — العنوان أعلى والقيمة أسفله لسهولة المسح في RTL. */
function Datum({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="entc-datum">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/** رقم واحد بعنوانه — وحدة العرض الأساسية بدل بطاقة KPI مستقلة لكل قيمة. */
function Figure({ label, value, tone }: { label: string; value: ReactNode; tone?: 'accent' }) {
  return (
    <div className={`entc-figure${tone === 'accent' ? ' entc-figure--accent' : ''}`}>
      <span className="entc-figure-label">{label}</span>
      <span className="entc-figure-value">{value}</span>
    </div>
  );
}

/**
 * «تفاصيل مستحقات الموظف» — الكشف المركزي الوحيد لمستحقات موظف واحد.
 *
 * ترتيب الصفحة يتبع مسار العمل اليومي لا ترتيب البيانات: الموقف المالي أولًا، ثم استحقاق
 * الإجازة وإجراء الدفع، ثم سجل الدفعات. كل ما هو شارح أو تاريخي أو تقديري يعيش خلف إفصاح
 * مطويّ افتراضيًا — إخفاءٌ للضجيج لا حذفٌ للمعلومة: كل قيمة كانت معروضة سابقًا ما تزال
 * موجودة، إما في العرض الأساسي أو داخل القسم المناسب.
 *
 * كل الأرقام تأتي من نموذج قراءة واحد (GET /employees/:id/entitlements) — لا تُعيد هذه
 * الصفحة بناء أي حقيقة استحقاق، ولا تحتوي أي صيغة احتساب.
 */
export default function EmployeeEntitlementsCenter() {
  const { id: idParam } = useParams<{ id: string }>();
  const employeeId = Number(idParam);
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const { t } = useT();
  const canRead = hasPermission('employees.read');
  // تسجيل الدفعة يعيد استخدام صلاحية تعديل الموظف (لا مفتاح صلاحية جديد).
  const canManage = hasPermission('employees.update');

  const [data, setData] = useState<EntitlementsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  // تصحيح سجل الدفعات: تعديل حركة قائمة، أو حذفها بعد تأكيد صريح.
  const [editingPayment, setEditingPayment] = useState<PaymentRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PaymentRow | null>(null);
  const [rowError, setRowError] = useState('');
  const [separationType, setSeparationType] = useState<SeparationType>('EMPLOYER_TERMINATION');
  // التصفية النهائية — مسار مستقل عن الدفع اليومي.
  const [settlementDialog, setSettlementDialog] = useState<'create' | 'edit' | null>(null);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showSettlementPayment, setShowSettlementPayment] = useState(false);
  const [editingSettlementPayment, setEditingSettlementPayment] = useState<SettlementPaymentRow | null>(null);
  const [deleteSettlementPayment, setDeleteSettlementPayment] = useState<SettlementPaymentRow | null>(null);
  const [showCancelSettlement, setShowCancelSettlement] = useState(false);
  const [showDeleteDraft, setShowDeleteDraft] = useState(false);

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
    // reloadKey forces a refetch after a payment is recorded, edited, or deleted.
  }, [employeeId, validId, canRead, reloadKey]);

  const warnings = useMemo(
    () => (data ? buildWarnings(data.result, data.leaveExclusionBreakdown, t) : []),
    [data, t],
  );

  const timeline = useMemo(
    () => (data ? buildTimeline(data.leaveHistory, data.payments.entries, t) : []),
    [data, t],
  );

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    setRowError('');
    try {
      await api.delete(`/employees/${employeeId}/entitlement-payments/${target.id}`);
      // الإجماليات مُشتقّة في الخادم — تُعاد قراءتها بدل تعديل أي رصيد محليًا.
      setReloadKey((k) => k + 1);
    } catch (e) {
      setRowError(errorMessage(e));
    }
  };

  /** حذف دفعة تصفية — الحالة تُشتق من جديد في الخادم بعد الحذف. */
  const confirmDeleteSettlementPayment = async () => {
    if (!deleteSettlementPayment) return;
    const target = deleteSettlementPayment;
    setDeleteSettlementPayment(null);
    setRowError('');
    try {
      await api.delete(`/employees/${employeeId}/final-settlement/payments/${target.id}`);
      setReloadKey((k) => k + 1);
    } catch (e) {
      setRowError(errorMessage(e));
    }
  };

  /** حذف مسودة لم تُعتمد — الحذف الفعلي الوحيد المسموح في هذا النطاق. */
  const confirmDeleteDraft = async () => {
    setShowDeleteDraft(false);
    setRowError('');
    try {
      await api.delete(`/employees/${employeeId}/final-settlement`);
      setReloadKey((k) => k + 1);
    } catch (e) {
      setRowError(errorMessage(e));
    }
  };

  const pageShell = (content: ReactNode) => (
    <div className="xpl-scope xpl-page entc-page">
      <ExecutiveHeader icon="badge" title={t('page.ent.statement_title')} onBack={() => navigate('/employees')} />
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

  const {
    result: r,
    employee: emp,
    wageBase,
    leaveExclusionBreakdown: brk,
    leaveHistory,
    payments,
    balances,
    estimatedEndOfService: eos,
    finalSettlement: fs,
    cancelledSettlements,
    asOf,
  } = data;
  const g = r.gratuity;
  const eosAmount = separationType === 'RESIGNATION' ? eos.resignationAmount : eos.terminationAmount;

  const durReason = missingReason(true, false, r, t);
  const moneyReason = missingReason(true, true, r, t);
  const leaveReason = missingReason(true, false, r, t);

  const money = (v: number | null, reason: string | null): ReactNode =>
    v !== null ? <PrivateAmount value={v} level={1} /> : reason ? <Incomplete reason={reason} t={t} /> : '—';
  const daysOrIncomplete = (v: number | null, reason: string | null): ReactNode =>
    v !== null ? daysText(v, t) : reason ? <Incomplete reason={reason} t={t} /> : '—';

  // تنبيه إرشادي واحد داخل قسم الإجازة (كان بطاقة ضمن «المؤشرات الصحية») — يُعرض عند
  // تجاوز العتبة فقط، لا كبطاقة دائمة.
  const highLeaveBalance = r.remainingLeaveDays !== null && r.remainingLeaveDays > HIGH_LEAVE_BALANCE_DAYS;
  // وجود تصفية معتمدة يجعل التقدير الحيّ سياقًا تاريخيًا لا نتيجة قابلة للاعتماد.
  const settlementApproved = fs !== null && fs.status !== 'DRAFT';
  // لا وسم نجاح دائم: الحالة السليمة لا تُعلن عن نفسها، والتنبيهات وحدها استثنائية
  // (warnings أدناه) — نفس قواعد التحقق القائمة بلا أي تغيير.

  return (
    <div className="xpl-scope xpl-page entc-page">
      {/* ══ أ. ترويسة الموظف — هوية وتاريخ الاحتساب فقط (لا تكرار لبيانات الخدمة) ══ */}
      <ExecutiveHeader
        icon="badge"
        title={emp.fullName}
        subtitle={t('msg.ent.statement_subtitle', { code: emp.code })}
        onBack={() => navigate('/employees')}
        chips={
          <>
            <StatusChip tone={emp.status === 'ACTIVE' ? 'green' : 'neutral'} icon={emp.status === 'ACTIVE' ? 'check_circle' : 'block'}>
              {emp.status === 'ACTIVE' ? t('opt.emp.active') : emp.status}
            </StatusChip>
            <IdChip icon="event" tone="blue">{t('msg.ent.as_of', { date: dateText(asOf) })}</IdChip>
          </>
        }
      />

      {/* ══ ب. الموقف المالي — البطل البصري: المستحق − المدفوع = المتبقي ══ */}
      <section className="xpl-card entc-hero" aria-label={t('section.ent.payable_position')}>
        <div className="entc-hero-grid">
          <div className="entc-hero-term">
            <span className="entc-hero-term-label">{t('field.ent.total_payable_entitlement')}</span>
            <span className="entc-hero-term-value">{money(balances.totalPayable, moneyReason)}</span>
          </div>
          <span className="entc-hero-op" aria-hidden="true">−</span>
          <div className="entc-hero-term">
            <span className="entc-hero-term-label">{t('field.ent.total_paid')}</span>
            <span className="entc-hero-term-value"><PrivateAmount value={balances.totalPaid} level={1} /></span>
            <span className="entc-hero-term-sub">
              {payments.entries.length > 0 ? t('msg.ent.payments_count', { n: payments.entries.length }) : t('msg.ent.no_payments_short')}
            </span>
          </div>
          <span className="entc-hero-op" aria-hidden="true">=</span>
          <div className="entc-hero-term entc-hero-term--primary">
            <span className="entc-hero-term-label">{t('field.ent.remaining_payable')}</span>
            <span className="entc-hero-term-value">{money(balances.totalRemaining, moneyReason)}</span>
          </div>
        </div>
        <p className="entc-hero-hint">
          {t('msg.ent.payable_hint')} {t('msg.ent.payable_excludes_eos_note')}
        </p>
      </section>

      {/* تنبيهات استثنائية فقط — تظهر عند وجود ما يستدعي الانتباه، لا كقسم دائم */}
      {warnings.length > 0 && (
        <div className="entc-alerts">
          {warnings.map((w) => (
            <div key={w.id} className={`ent-warning ent-warning--${w.tone}`}>
              <span className="material-symbols-outlined" aria-hidden="true">{w.icon}</span>
              <span>{w.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* ══ ج. استحقاق الإجازة السنوية — الأرقام الثلاثة + إجراء الدفع ══ */}
      <SectionCard title={t('section.ent.leave_entitlement')} icon="beach_access">
        <div className="entc-figures">
          <Figure
            label={t('field.ent.current_leave_balance')}
            value={r.remainingLeaveDays !== null ? daysText(r.remainingLeaveDays, t) : daysOrIncomplete(null, leaveReason)}
          />
          <Figure label={t('field.ent.daily_wage')} value={money(r.dailyWage, moneyReason)} />
          <Figure label={t('field.ent.leave_allowance_value')} value={money(balances.leaveAllowance.entitlement, moneyReason)} tone="accent" />
        </div>

        {r.firstYearEligible === false && (
          <p className="entc-inline-note">{t('msg.ent.not_yet_eligible_full')}</p>
        )}
        {highLeaveBalance && (
          <p className="entc-inline-note">
            {t('msg.ent.health.high_leave_balance', { days: daysText(r.remainingLeaveDays as number, t) })}
          </p>
        )}
      </SectionCard>

      {/* ══ د. سجل دفعات المستحقات — منطقة تشغيلية أساسية ══ */}
      <SectionCard
        title={t('section.ent.payment_history')}
        icon="receipt_long"
        actions={
          canManage && balances.leaveAllowance.payable ? (
            <Button variant="primary" icon="payments" small onClick={() => setShowPaymentDialog(true)}>
              {t('action.ent.record_payment')}
            </Button>
          ) : undefined
        }
      >
        {rowError && <ErrorBanner>{rowError}</ErrorBanner>}
        {payments.entries.length === 0 ? (
          <EmptyState icon="receipt_long" title={t('msg.ent.no_payments_title')} message={t('msg.ent.no_payments_message')} tone="neutral" />
        ) : (
          <>
            <div className="xpl-table-wrap entc-table--journal">
              <table className="xpl-table">
                <thead>
                  <tr>
                    <th>{t('col.date')}</th>
                    <th>{t('col.type')}</th>
                    <th>{t('col.ent.reference')}</th>
                    <th>{t('col.amount')}</th>
                    <th>{t('field.payment_method')}</th>
                    <th>{t('field.notes')}</th>
                    {canManage && <th>{t('col.actions')}</th>}
                  </tr>
                </thead>
                <tbody>
                  {payments.entries.map((p) => (
                    <tr key={p.id}>
                      <td>{dateText(p.paymentDate)}</td>
                      <td>{CATEGORY_LABEL[p.category] ? t(CATEGORY_LABEL[p.category]) : p.category}</td>
                      <td>{p.reference || '—'}</td>
                      <td><PrivateAmount value={p.amount} level={1} /></td>
                      <td>{PAYMENT_METHOD_LABEL[p.paymentMethod] ? t(PAYMENT_METHOD_LABEL[p.paymentMethod]) : p.paymentMethod}</td>
                      <td>{p.notes || '—'}</td>
                      {canManage && (
                        <td>
                          <div className="entc-row-actions">
                            <Button variant="secondary" icon="edit" small onClick={() => setEditingPayment(p)}>
                              {t('action.edit')}
                            </Button>
                            <Button variant="ghost" icon="delete" small onClick={() => setDeleteTarget(p)}>
                              {t('action.delete')}
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="entc-total-line">
              <span>{t('field.ent.total_paid')}</span>
              <span><PrivateAmount value={payments.totalRecorded} level={1} /></span>
            </div>
          </>
        )}
      </SectionCard>

      {/* ══ هـ. التصفية النهائية — مسار انتهاء الخدمة، منفصل عن الدفع اليومي ══ */}
      {fs === null ? (
        canManage && (
          <SectionCard title={t('section.ent.final_settlement')} icon="assignment_turned_in">
            <div className="entc-settlement-empty">
              <p className="entc-inline-note">
                {cancelledSettlements.length > 0 ? t('msg.ent.settlement_cancelled_can_recreate') : t('msg.ent.no_settlement_note')}
              </p>
              <Button variant="secondary" icon="assignment_turned_in" small onClick={() => setSettlementDialog('create')}>
                {cancelledSettlements.length > 0 ? t('action.ent.create_new_settlement') : t('action.ent.create_settlement')}
              </Button>
            </div>
          </SectionCard>
        )
      ) : (
        <SectionCard
          title={t('section.ent.final_settlement')}
          icon="assignment_turned_in"
          actions={
            <div className="entc-row-actions">
              <StatusChip tone={SETTLEMENT_STATUS[fs.status].tone} icon={SETTLEMENT_STATUS[fs.status].icon}>
                {t(SETTLEMENT_STATUS[fs.status].key)}
              </StatusChip>
              {canManage && fs.status === 'DRAFT' && (
                <>
                  <Button variant="secondary" icon="edit" small onClick={() => setSettlementDialog('edit')}>
                    {t('action.ent.edit_settlement')}
                  </Button>
                  <Button variant="ghost" icon="delete" small onClick={() => setShowDeleteDraft(true)}>
                    {t('action.ent.delete_draft')}
                  </Button>
                  <Button variant="primary" icon="verified" small onClick={() => setShowApproveDialog(true)}>
                    {t('action.ent.approve_settlement')}
                  </Button>
                </>
              )}
              {canManage && fs.status === 'APPROVED' && (
                <Button variant="primary" icon="payments" small onClick={() => setShowSettlementPayment(true)}>
                  {t('action.ent.record_settlement_payment')}
                </Button>
              )}
              {/* الإلغاء متاح للمعتمدة والمسدَّدة — حالة نهائية بلا حذف لأي بيانات. */}
              {canManage && (fs.status === 'APPROVED' || fs.status === 'PAID') && (
                <Button variant="ghost" icon="cancel" small onClick={() => setShowCancelSettlement(true)}>
                  {t('action.ent.cancel_settlement')}
                </Button>
              )}
            </div>
          }
        >
          {rowError && <ErrorBanner>{rowError}</ErrorBanner>}
          <dl className="entc-group-grid">
            <div className="entc-datum"><dt>{t('field.ent.last_working_day')}</dt><dd>{dateText(fs.lastWorkingDay)}</dd></div>
            <div className="entc-datum"><dt>{t('field.ent.termination_reason')}</dt><dd>{t(TERMINATION_REASON_LABEL[fs.terminationReason])}</dd></div>
            {fs.approvedAt && (
              <div className="entc-datum"><dt>{t('field.ent.approved_at')}</dt><dd>{dateText(fs.approvedAt)}</dd></div>
            )}
          </dl>

          {/* المكوّنان + الإجمالي — لا مكوّن ثالث */}
          <div className="entc-settlement-lines">
            <div className="entc-settlement-line">
              <span>{t('field.ent.leave_allowance_value')}</span>
              <span>{money(fs.computation.leaveValue, moneyReason)}</span>
            </div>
            <div className="entc-settlement-line entc-settlement-line--deduct">
              <span>{t('field.ent.prior_leave_paid')}</span>
              <span><PrivateAmount value={fs.computation.priorLeavePaid} level={1} /></span>
            </div>
            <div className="entc-settlement-line entc-settlement-line--subtotal">
              <span>{t('field.ent.leave_remaining_component')}</span>
              <span>{money(fs.computation.leaveRemaining, moneyReason)}</span>
            </div>
            <div className="entc-settlement-line">
              <span>{t('field.ent.eos')}</span>
              <span>{money(fs.computation.eosAmount, moneyReason)}</span>
            </div>
            <div className="entc-settlement-line entc-settlement-line--total">
              <span>{t('field.ent.settlement_total')}</span>
              <span>{money(fs.computation.totalAmount, moneyReason)}</span>
            </div>
          </div>

          {fs.status === 'DRAFT' ? (
            <p className="entc-inline-note">{t('msg.ent.settlement_draft_note')}</p>
          ) : (
            <>
              <div className="entc-figures entc-figures--settlement">
                <Figure label={t('field.ent.settlement_total')} value={money(fs.computation.totalAmount, moneyReason)} />
                <Figure label={t('field.ent.total_paid')} value={<PrivateAmount value={fs.paid} level={1} />} />
                <Figure
                  label={t('field.ent.remaining_payable')}
                  value={fs.remaining !== null ? <PrivateAmount value={fs.remaining} level={1} /> : '—'}
                  tone="accent"
                />
              </div>
              {fs.status === 'PAID' && <p className="entc-inline-note">{t('msg.ent.settlement_fully_paid_note')}</p>}
            </>
          )}

          {/* سجل دفعات التصفية — منفصل صراحةً عن سجل دفعات المستحقات أعلاه */}
          {fs.payments.length > 0 && (
            <div className="xpl-table-wrap entc-table--journal">
              <table className="xpl-table">
                <thead>
                  <tr>
                    <th>{t('col.date')}</th>
                    <th>{t('col.ent.reference')}</th>
                    <th>{t('col.amount')}</th>
                    <th>{t('field.payment_method')}</th>
                    <th>{t('field.notes')}</th>
                    {canManage && fs.status !== 'CANCELLED' && <th>{t('col.actions')}</th>}
                  </tr>
                </thead>
                <tbody>
                  {fs.payments.map((sp) => (
                    <tr key={sp.id}>
                      <td>{dateText(sp.paymentDate)}</td>
                      <td>{sp.reference || '—'}</td>
                      <td><PrivateAmount value={sp.amount} level={1} /></td>
                      <td>{PAYMENT_METHOD_LABEL[sp.paymentMethod] ? t(PAYMENT_METHOD_LABEL[sp.paymentMethod]) : sp.paymentMethod}</td>
                      <td>{sp.notes || '—'}</td>
                      {canManage && fs.status !== 'CANCELLED' && (
                        <td>
                          <div className="entc-row-actions">
                            <Button variant="secondary" icon="edit" small onClick={() => setEditingSettlementPayment(sp)}>
                              {t('action.edit')}
                            </Button>
                            <Button variant="ghost" icon="delete" small onClick={() => setDeleteSettlementPayment(sp)}>
                              {t('action.delete')}
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* تفاصيل الاحتساب المجمَّدة/الحيّة — إفصاح تدريجي، لا تُعرض كل حقول اللقطة افتراضيًا */}
          <details className="entc-methodology">
            <summary>
              <span className="material-symbols-outlined" aria-hidden="true">calculate</span>
              {t('section.ent.settlement_calc_details')}
            </summary>
            <dl className="entc-group-grid" style={{ marginTop: 8 }}>
              <div className="entc-datum"><dt>{t('field.hire_date')}</dt><dd>{fs.computation.hireDate ? dateText(fs.computation.hireDate) : '—'}</dd></div>
              <div className="entc-datum"><dt>{t('field.ent.service_duration')}</dt><dd>{fs.computation.serviceDuration ? formatDurationLong(fs.computation.serviceDuration, t) : '—'}</dd></div>
              <div className="entc-datum"><dt>{t('field.ent.salary_used')}</dt><dd><PrivateAmount value={fs.computation.salaryUsed} level={1} /></dd></div>
              <div className="entc-datum"><dt>{t('field.ent.daily_wage')}</dt><dd>{money(fs.computation.dailyWage, moneyReason)}</dd></div>
              <div className="entc-datum"><dt>{t('field.ent.current_leave_balance')}</dt><dd>{fs.computation.leaveDays !== null ? daysText(fs.computation.leaveDays, t) : '—'}</dd></div>
              <div className="entc-datum"><dt>{t('field.ent.eos_scenario')}</dt><dd>{t(TERMINATION_REASON_LABEL[fs.computation.eosScenario])}</dd></div>
              <div className="entc-datum"><dt>{t('field.ent.eos_full_amount')}</dt><dd>{money(fs.computation.eosFullAmount, moneyReason)}</dd></div>
              <div className="entc-datum"><dt>{t('field.ent.calc_factor')}</dt><dd>{fs.computation.eosFraction !== null ? resignationFractionLabel(fs.computation.eosFraction, t) : '—'}</dd></div>
            </dl>
            <p className="entc-inline-note">
              {fs.isSnapshot ? t('msg.ent.settlement_snapshot_note') : t('msg.ent.settlement_live_note')}
            </p>
          </details>
        </SectionCard>
      )}

      {/* سجل التصفيات الملغاة — تاريخ محفوظ بالكامل، خلف إفصاح مطويّ */}
      {cancelledSettlements.length > 0 && (
        <Disclosure
          title={t('section.ent.cancelled_settlements')}
          icon="history"
          meta={<StatusChip tone="neutral" icon="cancel">{String(cancelledSettlements.length)}</StatusChip>}
        >
          {cancelledSettlements.map((cs) => (
            <div key={cs.id} className="entc-cancelled-item">
              <dl className="entc-group-grid">
                <div className="entc-datum"><dt>{t('field.ent.last_working_day')}</dt><dd>{dateText(cs.lastWorkingDay)}</dd></div>
                <div className="entc-datum"><dt>{t('field.ent.termination_reason')}</dt><dd>{t(TERMINATION_REASON_LABEL[cs.terminationReason])}</dd></div>
                <div className="entc-datum">
                  <dt>{t('field.ent.settlement_total')}</dt>
                  <dd>{cs.computation.totalAmount !== null ? <PrivateAmount value={cs.computation.totalAmount} level={1} /> : '—'}</dd>
                </div>
                <div className="entc-datum"><dt>{t('field.ent.total_paid')}</dt><dd><PrivateAmount value={cs.paid} level={1} /></dd></div>
                <div className="entc-datum"><dt>{t('field.ent.cancelled_at')}</dt><dd>{cs.cancelledAt ? dateText(cs.cancelledAt) : '—'}</dd></div>
                <div className="entc-datum"><dt>{t('field.ent.cancellation_reason')}</dt><dd>{cs.cancellationReason || '—'}</dd></div>
              </dl>

              {cs.payments.length > 0 && (
                <div className="xpl-table-wrap entc-table--journal">
                  <table className="xpl-table">
                    <thead>
                      <tr>
                        <th>{t('col.date')}</th>
                        <th>{t('col.ent.reference')}</th>
                        <th>{t('col.amount')}</th>
                        <th>{t('field.payment_method')}</th>
                        <th>{t('field.notes')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cs.payments.map((sp) => (
                        <tr key={sp.id}>
                          <td>{dateText(sp.paymentDate)}</td>
                          <td>{sp.reference || '—'}</td>
                          <td><PrivateAmount value={sp.amount} level={1} /></td>
                          <td>{PAYMENT_METHOD_LABEL[sp.paymentMethod] ? t(PAYMENT_METHOD_LABEL[sp.paymentMethod]) : sp.paymentMethod}</td>
                          <td>{sp.notes || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
          <p className="entc-inline-note">{t('msg.ent.cancelled_history_note')}</p>
        </Disclosure>
      )}

      {/* ══ و. تفاصيل احتساب رصيد الإجازة — شرح كامل، مطويّ افتراضيًا ══ */}
      <Disclosure title={t('section.ent.leave_balance_reconciliation')} icon="calculate">
        <DataGroup title={t('section.ent.service_data')}>
          <Datum
            label={t('field.hire_date')}
            value={emp.hireDate ? dateText(emp.hireDate) : (durReason ? <Incomplete reason={durReason} t={t} /> : '—')}
          />
          <Datum label={t('field.ent.as_of_date')} value={dateText(asOf)} />
          <Datum
            label={t('field.ent.service_duration')}
            value={r.duration ? formatDurationLong({ years: r.duration.years, months: r.duration.months, days: r.duration.days }, t) : (durReason ? <Incomplete reason={durReason} t={t} /> : '—')}
          />
          <Datum
            label={t('field.ent.eligibility')}
            value={
              r.firstYearEligible === null
                ? '—'
                : r.firstYearEligible
                  ? <StatusChip tone="green" icon="verified">{t('opt.ent.eligible')}</StatusChip>
                  : <StatusChip tone="orange" icon="hourglass_empty">{t('opt.ent.not_eligible_6m')}</StatusChip>
            }
          />
        </DataGroup>

        <DataGroup title={t('section.ent.calc_basis')}>
          <Datum
            label={t('field.ent.salary_used')}
            value={wageBase.total > 0 ? <PrivateAmount value={wageBase.total} level={1} /> : (moneyReason ? <Incomplete reason={moneyReason} t={t} /> : '—')}
          />
          <Datum label={t('field.ent.daily_wage')} value={money(r.dailyWage, moneyReason)} />
          <Datum label={t('field.ent.annual_entitlement')} value={daysText(r.annualEntitlementDays, t)} />
          <Datum label={t('field.ent.total_legal_entitlement')} value={daysOrIncomplete(r.accruedLeaveDays, leaveReason)} />
        </DataGroup>

        <p className="entc-inline-note">{t('msg.ent.salary_source_note')}</p>

        {/* سلسلة الوصول إلى الرصيد النهائي — نفس التسلسل السابق بلا أي احتساب في الواجهة */}
        {r.accruedLeaveDays !== null ? (
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
        ) : (
          <div className="ent-fields"><DrawerField label={t('field.ent.reconciliation')} value={leaveReason ? <Incomplete reason={leaveReason} t={t} /> : '—'} /></div>
        )}

        <div className="entc-total-line">
          <span>{t('field.ent.leave_allowance_value')}</span>
          <span>{money(balances.leaveAllowance.entitlement, moneyReason)}</span>
        </div>

        <div className="ent-recon-note">
          <span className="material-symbols-outlined" aria-hidden="true">info</span>
          <span>{t('msg.ent.payment_does_not_consume_leave')}</span>
        </div>

        {/* منهجية الاحتساب — نص القواعد المعتمدة، مطويّ داخل الشرح بدل تذييل دائم */}
        <details className="entc-methodology">
          <summary>
            <span className="material-symbols-outlined" aria-hidden="true">gavel</span>
            {t('section.ent.methodology')}
          </summary>
          <p>{t('msg.ent.legal_notice_full')}</p>
        </details>
      </Disclosure>

      {/* ══ ز. مكافأة نهاية الخدمة التقديرية — سياق حسابي حيّ فقط ══
          متى وُجدت تصفية معتمدة تصبح هي النتيجة الموثوقة، ويُوسَم هذا القسم صراحةً بأنه
          غير معتمد حتى لا يظهر رقمان «نهائيان» متنافسان. */}
      <Disclosure
        title={t('section.ent.estimated_eos')}
        icon="volunteer_activism"
        meta={
          settlementApproved ? (
            <StatusChip tone="neutral" icon="history">{t('tag.ent.superseded_by_settlement')}</StatusChip>
          ) : (
            <StatusChip tone="blue" icon="query_stats">{t('tag.ent.estimated_only')}</StatusChip>
          )
        }
      >
        <div className="entc-estimate">
          <div className="ent-recon-note">
            <span className="material-symbols-outlined" aria-hidden="true">info</span>
            <span>{settlementApproved ? t('msg.ent.eos_superseded_note') : t('msg.ent.eos_estimate_note')}</span>
          </div>

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
              {separationType === 'RESIGNATION' ? t('msg.ent.eos_basis_resignation_note') : t('msg.ent.eos_basis_termination_note')}
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
            <DataGroup title={t('section.ent.calc_basis')}>
              <Datum label={t('field.ent.service_duration')} value={t('unit.ent.years', { n: g.serviceYears })} />
              <Datum label={t('field.ent.salary_used')} value={<PrivateAmount value={g.approvedWage} level={1} />} />
              <Datum label={t('field.ent.daily_wage')} value={<PrivateAmount value={g.dailyWage} level={1} />} />
              <Datum label={t('field.ent.first_tier_entitlement')} value={<PrivateAmount value={g.firstTierAmount} level={1} />} />
              <Datum label={t('field.ent.second_tier_entitlement')} value={<PrivateAmount value={g.secondTierAmount} level={1} />} />
              <Datum
                label={t('field.ent.calc_factor')}
                value={separationType === 'RESIGNATION' ? resignationFractionLabel(g.resignationFraction, t) : t('msg.ent.full_entitlement_employer')}
              />
              <Datum label={t('field.ent.total_gratuity')} value={<PrivateAmount value={eosAmount ?? 0} level={1} />} />
            </DataGroup>
          )}

          <p className="entc-inline-note">{t('msg.ent.eos_requires_final_settlement')}</p>
        </div>
      </Disclosure>

      {/* ══ ح. النشاط التاريخي — مطويّ ══ */}
      <Disclosure title={t('section.ent.historical_activity')} icon="timeline">
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
              <p className="ent-timeline-more">{t('msg.ent.timeline_more', { total: timeline.length })}</p>
            )}
          </>
        )}
      </Disclosure>

      {/* ══ ط. سجل الإجازات — مطويّ ══ */}
      <Disclosure title={t('section.ent.leave_history')} icon="event_available">
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
      </Disclosure>

      {showPaymentDialog && (
        <EntitlementPaymentDialog
          employeeId={employeeId}
          category={LEAVE_ALLOWANCE_CATEGORY}
          balance={balances.leaveAllowance}
          onClose={() => setShowPaymentDialog(false)}
          onSaved={() => { setShowPaymentDialog(false); setReloadKey((k) => k + 1); }}
        />
      )}

      {editingPayment && (
        <EntitlementPaymentDialog
          employeeId={employeeId}
          category={LEAVE_ALLOWANCE_CATEGORY}
          balance={balances.leaveAllowance}
          payment={editingPayment}
          onClose={() => setEditingPayment(null)}
          onSaved={() => { setEditingPayment(null); setReloadKey((k) => k + 1); }}
        />
      )}

      {settlementDialog && (
        <FinalSettlementDialog
          employeeId={employeeId}
          settlement={settlementDialog === 'edit' ? fs : null}
          onClose={() => setSettlementDialog(null)}
          onSaved={() => { setSettlementDialog(null); setReloadKey((k) => k + 1); }}
        />
      )}

      {showApproveDialog && fs && (
        <FinalSettlementApproveDialog
          employeeId={employeeId}
          employeeName={emp.fullName}
          settlement={fs}
          onClose={() => setShowApproveDialog(false)}
          onApproved={() => { setShowApproveDialog(false); setReloadKey((k) => k + 1); }}
        />
      )}

      {showSettlementPayment && fs && (
        <SettlementPaymentDialog
          employeeId={employeeId}
          settlement={fs}
          onClose={() => setShowSettlementPayment(false)}
          onSaved={() => { setShowSettlementPayment(false); setReloadKey((k) => k + 1); }}
        />
      )}

      {editingSettlementPayment && fs && (
        <SettlementPaymentDialog
          employeeId={employeeId}
          settlement={fs}
          payment={editingSettlementPayment}
          onClose={() => setEditingSettlementPayment(null)}
          onSaved={() => { setEditingSettlementPayment(null); setReloadKey((k) => k + 1); }}
        />
      )}

      {showCancelSettlement && fs && (
        <FinalSettlementCancelDialog
          employeeId={employeeId}
          settlement={fs}
          onClose={() => setShowCancelSettlement(false)}
          onCancelled={() => { setShowCancelSettlement(false); setReloadKey((k) => k + 1); }}
        />
      )}

      {deleteSettlementPayment && (
        <ConfirmModal
          title={t('action.ent.delete_settlement_payment')}
          message={`${t('msg.ent.confirm_delete_settlement_payment')}\n${formatMoneyCell(deleteSettlementPayment.amount)} — ${dateText(deleteSettlementPayment.paymentDate)}`}
          confirmLabel={t('action.delete')}
          variant="danger"
          onConfirm={confirmDeleteSettlementPayment}
          onCancel={() => setDeleteSettlementPayment(null)}
        />
      )}

      {showDeleteDraft && (
        <ConfirmModal
          title={t('action.ent.delete_draft')}
          message={t('msg.ent.confirm_delete_draft')}
          confirmLabel={t('action.delete')}
          variant="danger"
          onConfirm={confirmDeleteDraft}
          onCancel={() => setShowDeleteDraft(false)}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          title={t('action.ent.delete_payment')}
          message={`${t('msg.ent.confirm_delete_payment')}\n${formatMoneyCell(deleteTarget.amount)} — ${dateText(deleteTarget.paymentDate)}`}
          confirmLabel={t('action.delete')}
          variant="danger"
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
