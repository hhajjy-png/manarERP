/* ════════════════════════════════════════════════════════════════════════════
   Comprehensive Reports — Monthly Employee Entitlements Report Pack v1.

   طبقة **بناء تقرير خالصة** فوق وحدة «مستحقات الموظف الشهرية»
   (`EmployeeCompensationCalculation`). لا Prisma هنا ولا I/O: الخدمة تُنفّذ استعلامًا
   واحدًا وتُمرّر صفوفه، وهذه الوحدة تحوّلها إلى أعمدة وصفوف ومجاميع وأقسام.

   ═══ لماذا لا يُعاد حساب رقم واحد ═══
   كل مبلغ يُقرأ من **الإجماليات المخزَّنة** التي كتبها محرّك الوحدة وقت الحفظ
   (`totalOvertimeAmount` · `totalOtherEarnings` · `totalDeductions` · `netAmount`)،
   ومن **لقطة** الموظف المحفوظة مع الكشف (`basicSalarySnapshot` وأخواتها). لا معادلة
   ثانية، ولا قراءة من ملف الموظف الحيّ: التقرير يعرض ما اعتُمد فعلًا لذلك الشهر، لا
   ما يُنتجه إعادة الاحتساب اليوم. منطق الاحتساب في تلك الوحدة لم يُمسّ إطلاقًا.

   ═══ تصنيف الاستحقاقات الأخرى ═══
   الوحدة تُخزّن الاستحقاقات غير الإضافي في `CompensationEarningLine` بستة أنواع.
   التقرير يعرض ثلاثة أعمدة:
     · البدلات        = ALLOWANCE
     · المكافآت       = BONUS | GRANT | INCENTIVE
     · استحقاقات أخرى = الباقي — ويُشتقّ **طرحًا** من `totalOtherEarnings` المخزَّن
                        لا جمعًا لأنواع مُعدَّدة، فأي نوع يُضاف مستقبلًا يظهر في
                        العمود الثالث بدل أن يختفي من الجدول بصمت.
   وبذلك تبقى المعادلة مغلقة في كل صف:
     الأساسي + الإضافي + المكافآت + البدلات + أخرى − الاستقطاعات = الصافي

   ═══ «الديون المسددة» عمود شارح لا عمود إضافي ═══
   سطور `DEBT_REPAYMENT` **جزء من** `totalDeductions` أصلًا. العمود يُظهر كم من
   الاستقطاع كان سداد مديونية، ولا يُطرح مرة ثانية.
   ════════════════════════════════════════════════════════════════════════════ */

import { ARABIC_MONTHS } from '../../core/utils/arabicMonths';
import { formatCurrency } from '../../shared/utils/currency';
import { formatDisplayDate, formatDisplayDateTime } from '../../shared/utils/dateDisplay';
import { roundMoney, sumMoney } from '../../shared/utils/money';
import type { ReportColumn, ReportInput, ReportKpi, ReportSection } from '../../shared/services/reportEngine/excel.service';

/** حالات الكشف المعروفة للوحدة — الاعتماد تنظيمي بحت ولا يقفل السجل. */
export const ENTITLEMENT_STATUSES = ['DRAFT', 'APPROVED'] as const;

/** أنواع الاستحقاقات التي تُعرض في عمود «المكافآت». البدلات لها عمودها. */
const BONUS_EARNING_TYPES = new Set(['BONUS', 'GRANT', 'INCENTIVE']);
const ALLOWANCE_EARNING_TYPE = 'ALLOWANCE';
/** نوع الاستقطاع الذي يمثّل سداد مديونية مربوطة بالسجل. */
const DEBT_REPAYMENT_TYPE = 'DEBT_REPAYMENT';

const UNSPECIFIED_DEPARTMENT = 'بدون قسم';
const TOTAL_LABEL = 'الإجمالي';

/** الشكل الذي تحتاجه هذه الوحدة من صفّ الحسبة — لا شيء غيره. */
export interface EntitlementCalcRow {
  employeeId: number;
  year: number;
  month: number;
  status: string;
  employeeNumberSnapshot: string;
  employeeNameSnapshot: string;
  jobTitleSnapshot: string | null;
  departmentSnapshot: string | null;
  basicSalarySnapshot: number;
  totalOvertimeAmount: number;
  totalOtherEarnings: number;
  totalDeductions: number;
  netAmount: number;
  approvedAt: Date | null;
  earningLines: { type: string; amount: number }[];
  deductionLines: { type: string; amount: number }[];
}

/** الفلاتر المطبَّقة فعلًا — تُستخدم لبناء سطر الفترة تحت العنوان فقط. */
export interface EntitlementReportFilters {
  year?: number;
  month?: number;
  employeeName?: string;
  department?: string;
  status?: string;
  /**
   * لحظة إصدار التقرير — تُمرَّر من الخدمة صراحةً بدل قراءة `new Date()` هنا، فتبقى
   * هذه الوحدة خالصة وحتمية وقابلة للاختبار. تظهر في سطر الفترة، فيحمل المستند
   * المطبوع تاريخ **ووقت** إصداره دون تعديل قالب الطباعة المشترك بين كل التقارير.
   */
  generatedAt?: Date;
}

/** صفّ التقرير بعد التحويل. */
interface EntitlementReportRow {
  employeeNumber: string;
  employeeName: string;
  jobTitle: string;
  department: string;
  year: number;
  month: string;
  basicSalary: number;
  overtime: number;
  bonuses: number;
  allowances: number;
  otherEarnings: number;
  deductions: number;
  debtRepaid: number;
  netAmount: number;
  status: string;
  approvedAt: string;
}

export function entitlementStatusAr(status: string): string {
  if (status === 'APPROVED') return 'معتمد';
  if (status === 'DRAFT') return 'مسودة';
  return status;
}

/** اسم الشهر العربي من رقمه (1..12) — يعود إلى الرقم إن خرج عن المدى. */
function monthNameAr(month: number): string {
  return ARABIC_MONTHS[month - 1] ?? String(month);
}

const money = (header: string, key: string, width: number): ReportColumn => ({
  header,
  key,
  width,
  numFmt: '#,##0.000',
  format: 'currency',
});

/** أعمدة الجدول الرئيسي — الترتيب هنا هو ترتيب العرض والطباعة وExcel معًا. */
const COLUMNS: ReportColumn[] = [
  { header: 'الرقم الوظيفي', key: 'employeeNumber', width: 14 },
  { header: 'اسم الموظف', key: 'employeeName', width: 30 },
  { header: 'المسمى الوظيفي', key: 'jobTitle', width: 20 },
  { header: 'القسم', key: 'department', width: 18 },
  { header: 'السنة', key: 'year', width: 8 },
  { header: 'الشهر', key: 'month', width: 12 },
  money('الراتب الأساسي', 'basicSalary', 16),
  money('العمل الإضافي', 'overtime', 16),
  money('المكافآت', 'bonuses', 14),
  money('البدلات', 'allowances', 14),
  money('استحقاقات أخرى', 'otherEarnings', 16),
  money('الاستقطاعات', 'deductions', 16),
  money('الديون المسددة', 'debtRepaid', 16),
  money('صافي المستحق', 'netAmount', 18),
  { header: 'حالة الكشف', key: 'status', width: 12 },
  { header: 'تاريخ الاعتماد', key: 'approvedAt', width: 16 },
];

/** مجموع مبالغ السطور التي يقبلها المُرشِّح — بسياسة تقريب الدينار وحدها. */
function sumLines(lines: readonly { type: string; amount: number }[], accept: (type: string) => boolean): number {
  return sumMoney(lines.filter((l) => accept(l.type)).map((l) => Number(l.amount ?? 0)));
}

function toReportRow(c: EntitlementCalcRow): EntitlementReportRow {
  const bonuses = sumLines(c.earningLines ?? [], (t) => BONUS_EARNING_TYPES.has(t));
  const allowances = sumLines(c.earningLines ?? [], (t) => t === ALLOWANCE_EARNING_TYPE);
  // طرحًا لا جمعًا: أي نوع استحقاق جديد يظهر هنا بدل أن يسقط من الجدول.
  const otherEarnings = roundMoney(Number(c.totalOtherEarnings ?? 0) - bonuses - allowances);
  return {
    employeeNumber: c.employeeNumberSnapshot,
    employeeName: c.employeeNameSnapshot,
    jobTitle: c.jobTitleSnapshot ?? '',
    department: c.departmentSnapshot ?? '',
    year: c.year,
    month: monthNameAr(c.month),
    basicSalary: roundMoney(Number(c.basicSalarySnapshot ?? 0)),
    overtime: roundMoney(Number(c.totalOvertimeAmount ?? 0)),
    bonuses,
    allowances,
    otherEarnings,
    deductions: roundMoney(Number(c.totalDeductions ?? 0)),
    debtRepaid: sumLines(c.deductionLines ?? [], (t) => t === DEBT_REPAYMENT_TYPE),
    netAmount: roundMoney(Number(c.netAmount ?? 0)),
    status: entitlementStatusAr(c.status),
    approvedAt: c.approvedAt ? formatDisplayDate(c.approvedAt) : '',
  };
}

/** إجماليات مجموعة صفوف — تعبير واحد يخدم المجموع الكلي ومجاميع الأقسام معًا. */
function totalsOf(rows: readonly EntitlementReportRow[]) {
  const sumOf = (pick: (r: EntitlementReportRow) => number) => sumMoney(rows.map(pick));
  return {
    basicSalary: sumOf((r) => r.basicSalary),
    overtime: sumOf((r) => r.overtime),
    bonuses: sumOf((r) => r.bonuses),
    allowances: sumOf((r) => r.allowances),
    otherEarnings: sumOf((r) => r.otherEarnings),
    deductions: sumOf((r) => r.deductions),
    debtRepaid: sumOf((r) => r.debtRepaid),
    netAmount: sumOf((r) => r.netAmount),
  };
}

/** سطر الفترة والفلاتر تحت العنوان — يقول صراحةً ما الذي شمله التقرير. */
function periodLabel(f: EntitlementReportFilters): string {
  const parts: string[] = [];
  if (f.month && f.year) parts.push(`${monthNameAr(f.month)} ${f.year}`);
  else if (f.month) parts.push(monthNameAr(f.month));
  else if (f.year) parts.push(`سنة ${f.year}`);
  else parts.push('كل الفترات');
  if (f.employeeName) parts.push(`الموظف: ${f.employeeName}`);
  if (f.department) parts.push(`القسم: ${f.department}`);
  if (f.status) parts.push(`الحالة: ${entitlementStatusAr(f.status)}`);
  return parts.join(' — ');
}

/**
 * قسم «ملخّص حسب القسم» — تجميع الصفوف المعروضة نفسها، بلا استعلام ثانٍ، فلا يمكن
 * أن ينحرف عن الجدول الرئيسي ولا أن يتجاهل فلترًا نشطًا.
 */
function departmentSection(
  rows: readonly EntitlementReportRow[],
  employeesByDepartment: ReadonlyMap<string, ReadonlySet<number>>,
  totalEmployees: number,
): ReportSection {
  const groups = new Map<string, EntitlementReportRow[]>();
  for (const r of rows) {
    const key = r.department || UNSPECIFIED_DEPARTMENT;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }

  const sectionRows = [...groups.entries()]
    .map(([department, list]) => ({
      department,
      statements: list.length,
      employees: employeesByDepartment.get(department)?.size ?? 0,
      ...totalsOf(list),
    }))
    .sort((a, b) => b.netAmount - a.netAmount);

  const grand = totalsOf(rows);
  return {
    title: 'ملخّص المستحقات حسب القسم',
    note: 'تجميع للصفوف المعروضة أعلاه نفسها — لا استعلام إضافي ولا معادلة ثانية. والديون المسددة محتسَبة ضمن إجمالي الاستقطاعات ولا تُطرح مرة ثانية.',
    sheetName: 'حسب القسم',
    columns: [
      { header: 'القسم', key: 'department', width: 22 },
      { header: 'عدد الكشوف', key: 'statements', width: 12, align: 'center' },
      { header: 'عدد الموظفين', key: 'employees', width: 12, align: 'center' },
      money('الراتب الأساسي', 'basicSalary', 16),
      money('العمل الإضافي', 'overtime', 16),
      money('المكافآت', 'bonuses', 14),
      money('البدلات', 'allowances', 14),
      money('الاستقطاعات', 'deductions', 16),
      money('صافي المستحق', 'netAmount', 18),
    ],
    rows: sectionRows as unknown as Record<string, unknown>[],
    totalsRow: {
      department: TOTAL_LABEL,
      statements: rows.length,
      employees: totalEmployees,
      basicSalary: grand.basicSalary,
      overtime: grand.overtime,
      bonuses: grand.bonuses,
      allowances: grand.allowances,
      deductions: grand.deductions,
      netAmount: grand.netAmount,
    },
  };
}

/** قسم «ملخّص حسب حالة الكشف» — يفصل المعتمد عن المسودة بالأرقام لا بالانطباع. */
function statusSection(rows: readonly EntitlementReportRow[]): ReportSection {
  const groups = new Map<string, EntitlementReportRow[]>();
  for (const r of rows) {
    const list = groups.get(r.status) ?? [];
    list.push(r);
    groups.set(r.status, list);
  }
  const sectionRows = [...groups.entries()].map(([status, list]) => {
    const t = totalsOf(list);
    return { status, statements: list.length, deductions: t.deductions, netAmount: t.netAmount };
  });
  const grand = totalsOf(rows);
  return {
    title: 'ملخّص المستحقات حسب حالة الكشف',
    sheetName: 'حسب الحالة',
    columns: [
      { header: 'حالة الكشف', key: 'status', width: 16 },
      { header: 'عدد الكشوف', key: 'statements', width: 12, align: 'center' },
      money('الاستقطاعات', 'deductions', 16),
      money('صافي المستحق', 'netAmount', 18),
    ],
    rows: sectionRows as unknown as Record<string, unknown>[],
    totalsRow: {
      status: TOTAL_LABEL,
      statements: rows.length,
      deductions: grand.deductions,
      netAmount: grand.netAmount,
    },
  };
}

/**
 * يبني التقرير كاملًا من صفوف الحسبات المُحمَّلة مسبقًا. **خالصة**: لا قاعدة بيانات
 * ولا وقت نظام — نفس المدخلات تُنتج نفس المخرجات دائمًا، فتُختبر مباشرة.
 */
export function buildEmployeeEntitlementsReport(
  calcs: readonly EntitlementCalcRow[],
  filters: EntitlementReportFilters = {},
): ReportInput {
  const rows = calcs.map(toReportRow);
  const totals = totalsOf(rows);

  const employeeIds = new Set(calcs.map((c) => c.employeeId));
  const employeesByDepartment = new Map<string, Set<number>>();
  for (const c of calcs) {
    const key = c.departmentSnapshot || UNSPECIFIED_DEPARTMENT;
    const set = employeesByDepartment.get(key) ?? new Set<number>();
    set.add(c.employeeId);
    employeesByDepartment.set(key, set);
  }

  const approved = calcs.filter((c) => c.status === 'APPROVED').length;
  const drafts = calcs.length - approved;

  const kpis: ReportKpi[] = [
    { label: 'عدد الكشوف', value: calcs.length, icon: 'description', color: 'blue', hint: `${employeeIds.size} موظف` },
    { label: 'إجمالي صافي المستحقات', value: totals.netAmount, format: 'currency', icon: 'payments', color: 'green' },
    { label: 'إجمالي الرواتب الأساسية', value: totals.basicSalary, format: 'currency', icon: 'account_balance_wallet' },
    { label: 'إجمالي العمل الإضافي', value: totals.overtime, format: 'currency', icon: 'more_time', color: 'blue' },
    { label: 'إجمالي المكافآت والبدلات', value: roundMoney(totals.bonuses + totals.allowances), format: 'currency', icon: 'card_giftcard' },
    { label: 'إجمالي الاستقطاعات', value: totals.deductions, format: 'currency', icon: 'remove_circle', color: 'red', hint: `منها ديون مسددة: ${formatCurrency(totals.debtRepaid)}` },
    { label: 'كشوف معتمدة', value: approved, icon: 'verified', color: 'green', hint: `${drafts} مسودة` },
  ];

  return {
    title: 'تقرير مستحقات الموظفين الشهرية',
    subtitle:
      `${periodLabel(filters)} — عدد الكشوف: ${calcs.length} — عدد الموظفين: ${employeeIds.size}` +
      ` — إجمالي صافي المستحقات: ${formatCurrency(totals.netAmount)}` +
      (filters.generatedAt ? ` — تاريخ ووقت الإصدار: ${formatDisplayDateTime(filters.generatedAt)}` : ''),
    columns: COLUMNS,
    rows: rows as unknown as Record<string, unknown>[],
    totalsRow: {
      employeeNumber: '',
      employeeName: `${TOTAL_LABEL} (${employeeIds.size} موظف)`,
      basicSalary: totals.basicSalary,
      overtime: totals.overtime,
      bonuses: totals.bonuses,
      allowances: totals.allowances,
      otherEarnings: totals.otherEarnings,
      deductions: totals.deductions,
      debtRepaid: totals.debtRepaid,
      netAmount: totals.netAmount,
    },
    kpis,
    sections: rows.length > 0 ? [departmentSection(rows, employeesByDepartment, employeeIds.size), statusSection(rows)] : [],
  };
}
