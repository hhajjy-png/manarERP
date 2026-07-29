import type { ReactNode } from 'react';
import PrivateAmount from '../PrivateAmount';
import { StatusChip, type Tone } from '../explorer/ExplorerKit';

/**
 * أنواع وأدوات مشتركة بين ملخّص «الاستحقاقات» في درج الموظف (EmployeeEntitlementsTab.tsx)
 * وكشف «تفاصيل مستحقات الموظف» الكامل (pages/EmployeeEntitlementsCenter.tsx).
 *
 * قراءة/عرض فقط. كل رقم هنا يأتي حرفيًا من نموذج القراءة الموحَّد
 * GET /employees/:id/entitlements — لا صيغة استحقاق ولا اشتقاق رصيد في الواجهة إطلاقًا.
 */

export type SeparationType = 'EMPLOYER_TERMINATION' | 'RESIGNATION';

/**
 * الفئة الوحيدة القابلة للصرف في هذه الحزمة — بدل الإجازة. مكافأة نهاية الخدمة تقديرية
 * دائمًا ولا تقبل تسجيل دفعة، فلا يمثّلها هذا النوع أصلًا (يُمنع بناء مسار دفع لها بالخطأ).
 */
export type PayableCategory = 'LEAVE_ALLOWANCE';

/** يطابق EntitlementResult في backend/src/modules/employees/entitlements.calc.ts (قراءة فقط). */
export interface EntitlementResult {
  hasHireDate: boolean;
  hasWageBase: boolean;
  duration: { years: number; months: number; days: number; totalDays: number } | null;
  /** هل أتم الموظف 6 أشهر خدمة (قرار العمل المعتمد)؟ null فقط عند غياب تاريخ التعيين. */
  firstYearEligible: boolean | null;
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
    total: number; // إنهاء الخدمة من صاحب العمل (الاستحقاق الكامل، المادة 51)
    resignationFraction: number; // نسبة الاستقالة (المادة 53)
    resignationAmount: number; // إنهاء الخدمة بالاستقالة = total × resignationFraction
  } | null;
  assumptionsApplied: boolean;
}

/** مصدر أجر الاستحقاق — `Employee.salary` وحده، بلا بدلات ولا لقطات رواتب. */
export interface WageBaseComposition {
  baseSalary: number;
  total: number;
  source: 'EMPLOYEE_SALARY';
}

export interface LeaveRow {
  id: number;
  type: string;
  startDate: string;
  endDate: string;
  days: number;
  status: string;
}

/**
 * تفصيل استهلاك رصيد الإجازة السنوية للعرض فقط — netUsedLeaveDays يساوي دائمًا
 * r.usedLeaveDays (نفس منطق الاستثناء المركزي في الخادم).
 */
export interface LeaveExclusionBreakdown {
  grossAnnualLeaveDays: number;
  holidaysExcludedDays: number;
  sickExcludedDays: number;
  netUsedLeaveDays: number;
  holidaysConfiguredCount: number;
}

/** حركة دفع مسجَّلة — واقعة تاريخية ثابتة لا يُعاد احتسابها أبدًا. */
export interface PaymentRow {
  id: number;
  category: string;
  paymentDate: string;
  amount: number;
  paymentMethod: string;
  reference: string | null;
  notes: string | null;
  createdAt: string;
}

/**
 * موقف فئة واحدة كما يشتقّه الخادم: محتسَب − مدفوع = متبقٍّ.
 * `remaining` يكون null للفئات غير القابلة للصرف (لا «متبقٍّ للدفع» لتقدير).
 */
export interface CategoryBalance {
  entitlement: number | null;
  paid: number;
  remaining: number | null;
  payable: boolean;
}

/** سبب انتهاء الخدمة — يحدّد سيناريو مكافأة نهاية الخدمة في المحرّك القائم. */
export type TerminationReason = 'RESIGNATION' | 'EMPLOYER_TERMINATION';

/** دورة حياة التصفية: مسودة تُحتسب حيًّا ← لقطة معتمدة مجمَّدة ← مسدَّدة بالكامل. */
export type SettlementStatus = 'DRAFT' | 'APPROVED' | 'PAID' | 'CANCELLED';

/** دفعة مسجَّلة على التصفية — منفصلة تمامًا عن دفعات المستحقات السابقة للتصفية. */
export interface SettlementPaymentRow {
  id: number;
  paymentDate: string;
  amount: number;
  paymentMethod: string;
  reference: string | null;
  notes: string | null;
  createdAt: string;
}

/**
 * مكوّنات التصفية كما يُرجعها الخادم — بنفس الشكل سواء حُسبت حيًّا (مسودة) أو قُرئت من
 * اللقطة المجمَّدة (معتمدة/مسدَّدة). لا تحتسب الواجهة أيًّا منها.
 */
export interface SettlementComputation {
  hireDate: string | null;
  salaryUsed: number;
  dailyWage: number | null;
  wageDivisor: number;
  serviceDuration: { years: number; months: number; days: number; totalDays: number } | null;
  leaveDays: number | null;
  leaveValue: number | null;
  priorLeavePaid: number;
  leaveRemaining: number | null;
  eosScenario: TerminationReason;
  eosFullAmount: number | null;
  eosFraction: number | null;
  eosAmount: number | null;
  totalAmount: number | null;
}

export interface FinalSettlement {
  id: number;
  status: SettlementStatus;
  lastWorkingDay: string;
  terminationReason: TerminationReason;
  approvedAt: string | null;
  /** الإلغاء حالة نهائية تاريخية — السجل واللقطة والدفعات محفوظة كما هي. */
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  /** true حين تُقرأ القيم من لقطة مجمَّدة بدل احتساب حيّ. */
  isSnapshot: boolean;
  computation: SettlementComputation;
  payments: SettlementPaymentRow[];
  paid: number;
  remaining: number | null;
}

export const TERMINATION_REASON_LABEL: Record<string, string> = {
  RESIGNATION: 'opt.ent.separation.resignation',
  EMPLOYER_TERMINATION: 'opt.ent.separation.employer_termination',
};

export const SETTLEMENT_STATUS: Record<string, { key: string; tone: Tone; icon: string }> = {
  DRAFT: { key: 'opt.ent.settlement.draft', tone: 'orange', icon: 'edit_note' },
  APPROVED: { key: 'opt.ent.settlement.approved', tone: 'blue', icon: 'verified' },
  PAID: { key: 'opt.ent.settlement.paid', tone: 'green', icon: 'task_alt' },
  CANCELLED: { key: 'opt.ent.settlement.cancelled', tone: 'neutral', icon: 'cancel' },
};

export interface EntitlementsResponse {
  employee: { id: number; code: string; fullName: string; salary: number; hireDate: string | null; status: string };
  asOf: string;
  result: EntitlementResult;
  wageBase: WageBaseComposition;
  leaveExclusionBreakdown: LeaveExclusionBreakdown;
  leaveHistory: LeaveRow[];
  payments: {
    entries: PaymentRow[];
    totalsByCategory: Record<string, number>;
    totalRecorded: number;
  };
  balances: {
    leaveAllowance: CategoryBalance;
    endOfService: CategoryBalance;
    totalPayable: number | null;
    totalPaid: number;
    totalRemaining: number | null;
    /** الفئات القابلة للصرف فعلًا — تُقرأ كما هي، ولا تُستنتج من حالة الموظف. */
    payableCategories: string[];
  };
  /** التصفية النهائية **النشطة** — null قبل إنشائها أو بعد إلغاء آخر تصفية. */
  finalSettlement: FinalSettlement | null;
  /** التصفيات الملغاة — تاريخ للعرض فقط، لا يحجب تصفية جديدة ولا يدخل أي احتساب. */
  cancelledSettlements: FinalSettlement[];
  /** تقدير مكافأة نهاية الخدمة الحيّ — سياق حسابي فقط، لا يُصرف ولا يدخل أي إجمالي. */
  estimatedEndOfService: {
    isEstimate: boolean;
    asOf: string;
    terminationAmount: number | null;
    resignationAmount: number | null;
    includedInPayable: boolean;
    payableNow: boolean;
    activationRequires: string;
    scenariosAreHypothetical: boolean;
  };
}

export type EmployeeLike = { id: number; fullName?: string | null };

export const CATEGORY_LABEL: Record<string, string> = {
  LEAVE_ALLOWANCE: 'field.ent.leave_allowance',
  END_OF_SERVICE: 'field.ent.eos',
  OTHER: 'opt.ent.ledger_type.other',
};

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  CASH: 'opt.payment.cash',
  BANK_TRANSFER: 'opt.sal.payment.bank_transfer',
  CHEQUE: 'opt.payment.cheque',
  OTHER: 'cat.other',
};

export const LEAVE_TYPE_LABEL: Record<string, string> = {
  ANNUAL: 'opt.ent.leave_type.annual',
  SICK: 'opt.ent.leave_type.sick',
  UNPAID: 'opt.ent.leave_type.unpaid',
  EMERGENCY: 'opt.ent.leave_type.emergency',
};

export const LEAVE_STATUS: Record<string, { key: string; tone: Tone; icon: string }> = {
  APPROVED: { key: 'opt.ent.leave_status.approved', tone: 'green', icon: 'task_alt' },
  PENDING: { key: 'opt.ent.leave_status.pending', tone: 'orange', icon: 'schedule' },
  REJECTED: { key: 'opt.ent.leave_status.rejected', tone: 'red', icon: 'block' },
};

export function formatDurationLong(d: { years: number; months: number; days: number }, t: (key: string, vars?: Record<string, string | number>) => string): string {
  const parts: string[] = [];
  if (d.years) parts.push(t('unit.ent.years', { n: d.years }));
  if (d.months) parts.push(t('unit.ent.months', { n: d.months }));
  if (d.days || parts.length === 0) parts.push(t('unit.ent.days', { n: d.days }));
  return parts.join(t('msg.ent.duration_join'));
}

/** يوم/أيام مع لاحقة عربية بسيطة. */
export function daysText(n: number, t: (key: string, vars?: Record<string, string | number>) => string): string {
  return t('unit.ent.days', { n });
}

/** نسبة مكافأة الاستقالة (المادة 53) كنص مفهوم. */
export function resignationFractionLabel(fraction: number, t: (key: string, vars?: Record<string, string | number>) => string): string {
  if (fraction === 0) return t('msg.ent.resignation_fraction.none');
  if (fraction === 1) return t('msg.ent.resignation_fraction.full');
  if (Math.abs(fraction - 0.5) < 1e-9) return t('msg.ent.resignation_fraction.half');
  if (Math.abs(fraction - 2 / 3) < 1e-9) return t('msg.ent.resignation_fraction.two_thirds');
  return `${Math.round(fraction * 1000) / 10}%`;
}

/** سبب النقص الدقيق للحقل المطلوب (بلا تخمين). */
export function missingReason(needsHire: boolean, needsWageBase: boolean, r: EntitlementResult, t: (key: string) => string): string | null {
  if (needsHire && !r.hasHireDate) return t('msg.ent.missing_hire_date');
  if (needsWageBase && !r.hasWageBase) return t('msg.ent.missing_wage_base');
  return null;
}

/** يعرض «—» + حالة «بيانات غير مكتملة» مع السبب، دون كسر التخطيط. */
export function Incomplete({ reason, t }: { reason: string; t: (key: string) => string }) {
  return (
    <span className="ent-incomplete">
      <span className="ent-incomplete-dash">—</span>
      <StatusChip tone="neutral" icon="info">{t('tag.ent.incomplete_data')}</StatusChip>
      <span className="ent-incomplete-reason">{reason}</span>
    </span>
  );
}

/** تنبيه ذكي مُشتقّ من بيانات موجودة بالفعل فقط — لا قاعدة عمل جديدة، عرض فقط. */
export interface EntWarning {
  id: string;
  tone: Tone;
  icon: string;
  text: string;
}

/**
 * يبني قائمة التنبيهات من قيم مُحتسَبة بالفعل في الاستجابة — لا يُدخل أي قاعدة عمل
 * جديدة، فقط يُسمّي حالات موجودة أصلاً بصريًا للمستخدم.
 */
export function buildWarnings(
  r: EntitlementResult,
  breakdown: LeaveExclusionBreakdown,
  t: (key: string, vars?: Record<string, string | number>) => string,
): EntWarning[] {
  const warnings: EntWarning[] = [];

  if (r.firstYearEligible === false) {
    warnings.push({ id: 'first-year', tone: 'orange', icon: 'hourglass_empty', text: t('msg.ent.warning.first_year_pending') });
  }

  if (r.accruedLeaveDays !== null && r.usedLeaveDays > r.accruedLeaveDays) {
    warnings.push({ id: 'over-used', tone: 'red', icon: 'warning', text: t('msg.ent.warning.over_used') });
  }

  if (breakdown.grossAnnualLeaveDays > 0 && breakdown.holidaysConfiguredCount === 0) {
    warnings.push({ id: 'no-holidays', tone: 'orange', icon: 'event_busy', text: t('msg.ent.warning.no_holidays_registered') });
  }

  if (!r.hasHireDate || !r.hasWageBase) {
    warnings.push({ id: 'incomplete-data', tone: 'neutral', icon: 'info', text: t('msg.ent.warning.incomplete_employee_data') });
  }

  return warnings;
}

/** بند واحد في النشاط التاريخي الموحَّد — دمج عرضي فقط لسجلات موجودة بالفعل. */
export interface EntTimelineEntry {
  key: string;
  dateIso: string;
  icon: string;
  tone: Tone;
  title: string;
  meta?: ReactNode;
}

/**
 * يدمج سجل الإجازات مع دفعات المستحقات في جدول زمني واحد (الأحدث أولًا). لا بيانات
 * جديدة — دمج/فرز عرضي فقط لمصدرين موجودين في نفس الاستجابة.
 */
export function buildTimeline(
  leaveHistory: LeaveRow[],
  payments: PaymentRow[],
  t: (key: string, vars?: Record<string, string | number>) => string,
): EntTimelineEntry[] {
  const entries: EntTimelineEntry[] = [];

  for (const l of leaveHistory) {
    const st = LEAVE_STATUS[l.status] ?? { key: '', tone: 'neutral' as Tone, icon: 'help' };
    const stLabel = st.key ? t(st.key) : l.status;
    entries.push({
      key: `leave-${l.id}`,
      dateIso: l.startDate,
      icon: st.icon,
      tone: st.tone,
      title: t('msg.ent.timeline.leave_title', { type: LEAVE_TYPE_LABEL[l.type] ? t(LEAVE_TYPE_LABEL[l.type]) : l.type, days: daysText(l.days, t) }),
      meta: <StatusChip tone={st.tone} icon={st.icon}>{stLabel}</StatusChip>,
    });
  }

  for (const p of payments) {
    entries.push({
      key: `payment-${p.id}`,
      dateIso: p.paymentDate,
      icon: 'payments',
      tone: 'indigo',
      title: t('msg.ent.timeline.payment_title', { category: CATEGORY_LABEL[p.category] ? t(CATEGORY_LABEL[p.category]) : p.category }),
      meta: <PrivateAmount value={p.amount} level={1} />,
    });
  }

  return entries.sort((a, b) => (a.dateIso < b.dateIso ? 1 : a.dateIso > b.dateIso ? -1 : 0));
}

/** يُمرِّر بسلاسة إلى قسم بمعرِّف معيّن داخل الصفحة/التبويب. */
export function scrollToEntSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
