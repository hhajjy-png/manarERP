import type { ReactNode } from 'react';
import PrivateAmount from '../PrivateAmount';
import { StatusChip, type Tone } from '../explorer/ExplorerKit';

/**
 * أنواع وأدوات مشتركة بين تبويب «الاستحقاقات» المختصر في درج الموظف
 * (EmployeeEntitlementsTab.tsx) وصفحة «مركز المستحقات» الكاملة
 * (pages/EmployeeEntitlementsCenter.tsx) — قراءة/عرض فقط، مصدر واحد للأنواع
 * والتنسيق بلا أي تكرار للمنطق. كل القيم تأتي حرفيًا من استجابة
 * GET /employees/:id/entitlements (انظر backend/src/modules/employees/employees.service.ts).
 */

export type SeparationType = 'EMPLOYER_TERMINATION' | 'RESIGNATION';

/** يطابق EntitlementResult في backend/src/modules/employees/entitlements.calc.ts (قراءة فقط). */
export interface EntitlementResult {
  hasHireDate: boolean;
  hasWageBase: boolean;
  duration: { years: number; months: number; days: number; totalDays: number } | null;
  /** هل أتم الموظف 9 أشهر خدمة (المادة 70)؟ null فقط عند غياب تاريخ التعيين. */
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

/** تركيبة الأجر المعتمد (المادتان 55/62) — راتب أساسي + بدلات دورية نشطة. للعرض/الشفافية فقط. */
export interface WageBaseComposition {
  baseSalary: number;
  allowancesTotal: number;
  total: number;
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
 * تفصيل استهلاك رصيد الإجازة السنوية للعرض التنفيذي فقط — يطابق
 * LeaveExclusionBreakdown في backend/src/modules/employees/employees.service.ts
 * (قراءة فقط، لا يُستخدم في أي احتساب هنا). netUsedLeaveDays يساوي دائمًا r.usedLeaveDays.
 */
export interface LeaveExclusionBreakdown {
  grossAnnualLeaveDays: number;
  holidaysExcludedDays: number;
  sickExcludedDays: number;
  netUsedLeaveDays: number;
  holidaysConfiguredCount: number;
}

export interface LedgerRow {
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

/** دفعة مقدَّمة يدوية على رصيد الإجازة — توثيق تاريخي فقط (لا تُسقط الاستحقاق، المادتان 73/74). */
export interface SettlementRow {
  id: number;
  settlementDate: string;
  leaveDaysSettled: number;
  settlementAmount: number;
  paymentMethod: string;
  notes: string | null;
  createdAt: string;
}

export interface EntitlementsResponse {
  employee: { id: number; code: string; fullName: string; salary: number; hireDate: string | null; status: string };
  result: EntitlementResult;
  wageBase: WageBaseComposition;
  leaveExclusionBreakdown: LeaveExclusionBreakdown;
  leaveHistory: LeaveRow[];
  settlements: SettlementRow[];
  ledger: LedgerRow[];
}

export type EmployeeLike = { id: number; fullName?: string | null };

export const LEDGER_TYPE_LABEL: Record<string, string> = {
  LEAVE_ALLOWANCE: 'بدل الإجازة',
  END_OF_SERVICE: 'مكافأة نهاية الخدمة',
  OTHER: 'مستحق آخر',
};

export const SETTLEMENT_METHOD_LABEL: Record<string, string> = {
  CASH: 'نقدًا',
  BANK_TRANSFER: 'تحويل بنكي',
  CHEQUE: 'شيك',
  OTHER: 'أخرى',
};

export const LEAVE_TYPE_LABEL: Record<string, string> = {
  ANNUAL: 'سنوية',
  SICK: 'مرضية',
  UNPAID: 'بدون راتب',
  EMERGENCY: 'طارئة',
};

export const LEAVE_STATUS: Record<string, { label: string; tone: Tone; icon: string }> = {
  APPROVED: { label: 'معتمدة', tone: 'green', icon: 'task_alt' },
  PENDING: { label: 'قيد الاعتماد', tone: 'orange', icon: 'schedule' },
  REJECTED: { label: 'مرفوضة', tone: 'red', icon: 'block' },
};

export function formatDurationLong(d: { years: number; months: number; days: number }): string {
  const parts: string[] = [];
  if (d.years) parts.push(`${d.years} سنة`);
  if (d.months) parts.push(`${d.months} شهر`);
  if (d.days || parts.length === 0) parts.push(`${d.days} يوم`);
  return parts.join(' و ');
}

/** يوم/أيام مع لاحقة عربية بسيطة. */
export function daysText(n: number): string {
  return `${n} يوم`;
}

/** نسبة مكافأة الاستقالة (المادة 53) كنص عربي مفهوم مع نطاق سنوات الخدمة. */
export function resignationFractionLabel(fraction: number): string {
  if (fraction === 0) return 'لا يستحق مكافأة (أقل من 3 سنوات خدمة)';
  if (fraction === 1) return '100% — كامل المكافأة (10 سنوات خدمة فأكثر)';
  if (Math.abs(fraction - 0.5) < 1e-9) return '50% (3 إلى أقل من 5 سنوات خدمة)';
  if (Math.abs(fraction - 2 / 3) < 1e-9) return '66.7% (5 إلى أقل من 10 سنوات خدمة)';
  return `${Math.round(fraction * 1000) / 10}%`;
}

/** سبب النقص الدقيق للحقل المطلوب (بلا تخمين). */
export function missingReason(needsHire: boolean, needsWageBase: boolean, r: EntitlementResult): string | null {
  if (needsHire && !r.hasHireDate) return 'تاريخ التعيين غير مُدخل';
  if (needsWageBase && !r.hasWageBase) return 'الأجر الشهري غير مُدخل';
  return null;
}

/** يعرض «—» + حالة «بيانات غير مكتملة» مع السبب، دون كسر التخطيط. */
export function Incomplete({ reason }: { reason: string }) {
  return (
    <span className="ent-incomplete">
      <span className="ent-incomplete-dash">—</span>
      <StatusChip tone="neutral" icon="info">بيانات غير مكتملة</StatusChip>
      <span className="ent-incomplete-reason">{reason}</span>
    </span>
  );
}

/** تنبيه ذكي مُشتقّ من بيانات موجودة بالفعل فقط — لا قاعدة قانونية جديدة، عرض فقط. */
export interface EntWarning {
  id: string;
  tone: Tone;
  icon: string;
  text: string;
}

/**
 * يبني قائمة التنبيهات الذكية من قيم مُحتسَبة بالفعل في الاستجابة — لا يُدخل أي قاعدة
 * عمل جديدة، فقط يُسمّي حالات موجودة أصلاً في result/leaveExclusionBreakdown/settlements/
 * ledger بصريًا للمستخدم.
 */
export function buildWarnings(
  r: EntitlementResult,
  breakdown: LeaveExclusionBreakdown,
  totalSettlementDays: number,
  ledger: LedgerRow[],
): EntWarning[] {
  const warnings: EntWarning[] = [];

  if (r.firstYearEligible === false) {
    warnings.push({
      id: 'first-year',
      tone: 'orange',
      icon: 'hourglass_empty',
      text: 'استحقاق إجازة السنة الأولى معلَّق — يلزم إتمام 9 أشهر خدمة (المادة 70).',
    });
  }

  if (r.accruedLeaveDays !== null && r.usedLeaveDays > r.accruedLeaveDays) {
    warnings.push({
      id: 'over-used',
      tone: 'red',
      icon: 'warning',
      text: 'الأيام المستخدمة تتجاوز الرصيد المستحق حاليًا — الرصيد المتبقي وصل إلى الصفر.',
    });
  }

  if (breakdown.grossAnnualLeaveDays > 0 && breakdown.holidaysConfiguredCount === 0) {
    warnings.push({
      id: 'no-holidays',
      tone: 'orange',
      icon: 'event_busy',
      text: 'لا توجد عطل رسمية مسجَّلة في النظام — قد تُحتسب أيام العطل الرسمية ضمن الإجازة المستخدمة. راجع الإعدادات ← العطل الرسمية.',
    });
  }

  if (r.accruedLeaveDays !== null && totalSettlementDays > r.accruedLeaveDays) {
    warnings.push({
      id: 'settlement-over-advance',
      tone: 'red',
      icon: 'balance',
      text: `دفعات الإجازة المقدَّمة (${daysText(totalSettlementDays)}) تتجاوز الاستحقاق القانوني الحالي (${daysText(r.accruedLeaveDays)}) — فرق يستحق المراجعة.`,
    });
  }

  const staleSnapshot = ledger.find(
    (e) => e.entryType === 'LEAVE_ALLOWANCE' && e.leaveBalanceSnapshot != null && e.leaveBalanceSnapshot !== r.remainingLeaveDays,
  );
  if (staleSnapshot) {
    warnings.push({
      id: 'pending-reconciliation',
      tone: 'blue',
      icon: 'sync_problem',
      text: 'يوجد رصيد مسجَّل في سجل المستحقات يختلف عن الرصيد الحالي — طبيعي لأنه لقطة تاريخية جامدة وقت الصرف، وليس مؤشر خطأ.',
    });
  }

  if (!r.hasHireDate || !r.hasWageBase) {
    warnings.push({
      id: 'incomplete-data',
      tone: 'neutral',
      icon: 'info',
      text: 'بيانات الموظف غير مكتملة (تاريخ التعيين و/أو الراتب) — بعض الاستحقاقات لا يمكن احتسابها حتى تكتمل.',
    });
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

/** يدمج سجل الإجازات + الدفعات المقدَّمة + المستحقات المصروفة في جدول زمني واحد مرتَّب زمنيًا (الأحدث أولًا). لا بيانات جديدة — دمج/فرز عرضي فقط. */
export function buildTimeline(leaveHistory: LeaveRow[], settlements: SettlementRow[], ledger: LedgerRow[]): EntTimelineEntry[] {
  const entries: EntTimelineEntry[] = [];

  for (const l of leaveHistory) {
    const st = LEAVE_STATUS[l.status] ?? { label: l.status, tone: 'neutral' as Tone, icon: 'help' };
    entries.push({
      key: `leave-${l.id}`,
      dateIso: l.startDate,
      icon: st.icon,
      tone: st.tone,
      title: `إجازة ${LEAVE_TYPE_LABEL[l.type] ?? l.type} — ${daysText(l.days)}`,
      meta: <StatusChip tone={st.tone} icon={st.icon}>{st.label}</StatusChip>,
    });
  }

  for (const s of settlements) {
    entries.push({
      key: `settlement-${s.id}`,
      dateIso: s.settlementDate,
      icon: 'savings',
      tone: 'blue',
      title: `دفعة مقدَّمة على الإجازة — ${daysText(s.leaveDaysSettled)}`,
      meta: <PrivateAmount value={s.settlementAmount} level={1} />,
    });
  }

  for (const e of ledger) {
    entries.push({
      key: `ledger-${e.id}`,
      dateIso: e.entryDate,
      icon: 'account_balance_wallet',
      tone: 'indigo',
      title: LEDGER_TYPE_LABEL[e.entryType] ?? e.entryType,
      meta: <PrivateAmount value={e.amount} level={1} />,
    });
  }

  return entries.sort((a, b) => (a.dateIso < b.dateIso ? 1 : a.dateIso > b.dateIso ? -1 : 0));
}

/** يُمرِّر بسلاسة إلى قسم بمعرِّف معيّن داخل الصفحة/التبويب. */
export function scrollToEntSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
