/**
 * كشف المستحقات الشهرية البنكي — الخدمة.
 *
 * ═══ ما تفعله هذه الوحدة ═══
 * تحوّل حسبات **مستحقات الموظف الشهرية المعتمدة** إلى ملف تحويل بنكي بنفس صيغة ملف
 * الرواتب تمامًا. المعادلة المالية الوحيدة الجديدة في المشروع كله هي:
 *
 *     bankEntitlementAmount = roundMoney(netAmount − basicSalarySnapshot)
 *
 * كلا الرقمين يُقرآن من **نفس سجل الحسبة الشهرية**: `netAmount` و`basicSalarySnapshot`.
 * لا يُقرأ راتب الموظف الحيّ من ملف الموظف أبدًا، ولا يُعاد احتساب إضافي أو مكافأة أو
 * استقطاع هنا — محرّك المستحقات وحده يملك ذلك.
 *
 * ═══ ما لا تفعله ═══
 * لا تكتب في Payroll ولا SalaryPayment ولا EmployeeCompensation ولا Employee.
 * لا قيد محاسبي، لا مصروف، لا مطابقة بنكية، لا تعديل على كشف الرواتب البنكي.
 * جداولها الوحيدة للكتابة: `entitlements_bank_statements(_lines)` وسجل التدقيق.
 *
 * ═══ التجميد عند الاعتماد ═══
 * وحدة المستحقات تسمح بتعديل الحسبة **بعد** اعتمادها. لذلك لا يجوز أن يبقى الملف
 * البنكي معتمدًا على قيم حيّة: عند اعتماد الكشف تُنسخ كل قيمة تدخل الملف (الصافي،
 * الراتب الأساسي، مبلغ التحويل، الاسم الإنجليزي، الرقم المدني، الحساب البنكي) إلى
 * سطر مجمَّد. أي تعديل لاحق على الحسبة لا يمسّ ذلك السطر إطلاقًا. تغييرُ كشفٍ معتمد
 * يتطلّب إلغاء اعتماده صراحةً — إجراءً مسجَّلًا في سجل التدقيق، لا تغييرًا صامتًا.
 */

import { Request } from 'express';
import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';
import { recordAudit } from '../../core/middleware/audit';
import { roundMoney } from '../../shared/utils/money';
import { validateBankFields } from '../../shared/services/bankExport/nbkTransferCore';
import type { BankExportProfile, BankExportResult, BankTransferSource } from '../../shared/services/bankExport/types';
import { ENTITLEMENTS_LABELS, nbkEntitlementsXlsProfile } from './profiles/nbkEntitlementsXlsProfile';

const AUDIT_MODULE = 'employeeCompensation';

/** سجل ملفات البنك لهذا الكشف — منفصل تمامًا عن سجل ملفات كشف الرواتب. */
const PROFILES: Record<string, BankExportProfile> = {
  [nbkEntitlementsXlsProfile.id]: nbkEntitlementsXlsProfile,
};

export function listEntitlementsExportProfiles() {
  return Object.values(PROFILES).map((p) => ({
    id: p.id,
    label: p.label,
    fileExtension: p.fileExtension,
    currency: p.currency,
  }));
}

/**
 * **المعادلة الوحيدة.** لا تُعرَّف صيغة ثانية في أي مكان آخر من هذه الحزمة.
 * كلا المدخلين من نفس سجل الحسبة الشهرية المعتمدة.
 */
export function entitlementTransferAmount(netAmount: number, basicSalarySnapshot: number): number {
  return roundMoney(Number(netAmount) - Number(basicSalarySnapshot));
}

/** حالة الموظف في شهر الكشف — قيمة واحدة صريحة، لا إخفاء صامت. */
export type EntitlementEligibility =
  | 'READY'                 // جاهز للإضافة إلى الكشف
  | 'NO_CALCULATION'        // لا يوجد كشف مستحقات لهذا الشهر
  | 'NOT_APPROVED'          // كشف المستحقات غير معتمد
  | 'NO_AMOUNT'             // لا يوجد مبلغ مستحق للتحويل (≤ 0)
  | 'BANK_DATA_INCOMPLETE'; // لا توجد بيانات بنكية مكتملة

export interface EntitlementCandidateRow {
  employeeId: number;
  employeeCode: string;
  employeeName: string;
  employeeNameEn: string | null;
  civilId: string | null;
  bankAccount: string | null;
  employeeStatus: string;
  /** معرّف حسبة الشهر — null حين لا توجد حسبة. */
  calculationId: number | null;
  /** حالة الحسبة الشهرية كما هي (DRAFT | APPROVED)، أو null حين لا توجد. */
  calculationStatus: string | null;
  /** صافي المستحق الشهري من الحسبة — null حين لا توجد حسبة. */
  netAmount: number | null;
  /** الراتب الأساسي من لقطة نفس الحسبة (لا من ملف الموظف الحيّ). */
  basicSalary: number | null;
  /** مبلغ التحويل = net − basic. null حين لا توجد حسبة. */
  transferAmount: number | null;
  eligibility: EntitlementEligibility;
  /** الأسباب المانعة بنصّها العربي — فارغة حين READY. */
  blockers: string[];
}

export interface EntitlementStatementSummary {
  id: number;
  year: number;
  month: number;
  profileId: string;
  currency: string;
  status: string;
  employeeCount: number;
  totalAmount: number;
  approvedAt: Date;
  approvedByName: string | null;
}

const EMPLOYEE_SELECT = {
  id: true,
  code: true,
  fullName: true,
  fullNameEn: true,
  civilId: true,
  bankAccount: true,
  status: true,
} as const;

function assertPeriod(month: number, year: number): void {
  if (!Number.isInteger(month) || month < 1 || month > 12) throw AppError.badRequest('الشهر غير صالح');
  if (!Number.isInteger(year) || year < 2020 || year > 2100) throw AppError.badRequest('السنة غير صالحة');
}

function actor(req: Request): { id: number | null; name: string | null } {
  return { id: req.user?.userId ?? null, name: req.user?.username ?? null };
}

/** ترتيب الكشف = ترتيب كشف الرواتب البنكي نفسه: الرقم الوظيفي تصاعديًا. */
function byEmployeeCode<T extends { employeeCode: string }>(a: T, b: T): number {
  return a.employeeCode.localeCompare(b.employeeCode, 'en');
}

function toStatementSummary(s: {
  id: number; year: number; month: number; profileId: string; currency: string; status: string;
  employeeCount: number; totalAmount: number; approvedAt: Date; approvedByName: string | null;
}): EntitlementStatementSummary {
  return {
    id: s.id, year: s.year, month: s.month, profileId: s.profileId, currency: s.currency,
    status: s.status, employeeCount: s.employeeCount, totalAmount: s.totalAmount,
    approvedAt: s.approvedAt, approvedByName: s.approvedByName,
  };
}

/**
 * يبني صفوف الأهلية للشهر المطلوب من قراءتين فقط (موظفون + حسبات الشهر).
 * قراءة بحتة: لا كتابة، ولا استدعاء لأي خدمة رواتب أو محاسبة.
 */
async function buildCandidateRows(month: number, year: number): Promise<EntitlementCandidateRow[]> {
  // حسبات هذا الشهر بالضبط — لا يُستخدم تاريخ اليوم في تحديد الحسبة إطلاقًا.
  const calcs = await prisma.employeeCompensationCalculation.findMany({
    where: { year, month },
    select: {
      id: true, employeeId: true, status: true,
      netAmount: true, basicSalarySnapshot: true,
    },
  });
  const calcByEmployee = new Map(calcs.map((c) => [c.employeeId, c]));

  // الموظفون النشطون + كل موظف له حسبة هذا الشهر (ولو لم يعد نشطًا): موظف احتُسبت
  // مستحقاته ثم غادر يجب أن يبقى مرئيًا، لا أن يختفي من الكشف بلا أثر.
  const employees = await prisma.employee.findMany({
    where: { OR: [{ status: 'ACTIVE' }, { id: { in: calcs.map((c) => c.employeeId) } }] },
    select: EMPLOYEE_SELECT,
  });

  const rows = employees.map<EntitlementCandidateRow>((e) => {
    const calc = calcByEmployee.get(e.id) ?? null;
    const base = {
      employeeId: e.id,
      employeeCode: e.code,
      employeeName: e.fullName,
      employeeNameEn: e.fullNameEn,
      civilId: e.civilId,
      bankAccount: e.bankAccount,
      employeeStatus: e.status,
      calculationId: calc?.id ?? null,
      calculationStatus: calc?.status ?? null,
    };

    if (!calc) {
      return {
        ...base, netAmount: null, basicSalary: null, transferAmount: null,
        eligibility: 'NO_CALCULATION', blockers: ['لا يوجد كشف مستحقات لهذا الشهر'],
      };
    }

    const transferAmount = entitlementTransferAmount(calc.netAmount, calc.basicSalarySnapshot);
    const money = {
      netAmount: calc.netAmount,
      basicSalary: calc.basicSalarySnapshot,
      transferAmount,
    };

    if (calc.status !== 'APPROVED') {
      return { ...base, ...money, eligibility: 'NOT_APPROVED', blockers: ['كشف المستحقات غير معتمد'] };
    }
    if (!(transferAmount > 0)) {
      return { ...base, ...money, eligibility: 'NO_AMOUNT', blockers: ['لا يوجد مبلغ مستحق للتحويل'] };
    }

    // نفس تحقّق كشف الرواتب البنكي حرفيًا — الدالة نفسها من المحرّك المشترك، لا نسخة ثانية.
    const bankErrors = validateBankFields(toTransferSource(base, transferAmount), transferAmount, ENTITLEMENTS_LABELS);
    if (bankErrors.length > 0) {
      return { ...base, ...money, eligibility: 'BANK_DATA_INCOMPLETE', blockers: bankErrors.map((x) => x.message) };
    }

    return { ...base, ...money, eligibility: 'READY', blockers: [] };
  });

  return rows.sort(byEmployeeCode);
}

/** `create` مع ترجمة انتهاك الفهرس الفريد (P2002) إلى رسالة الازدواج الصريحة نفسها. */
async function createStatement(args: Parameters<typeof prisma.entitlementsBankStatement.create>[0]) {
  try {
    return await prisma.entitlementsBankStatement.create(args);
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') {
      throw AppError.conflict('يوجد كشف مستحقات معتمد لهذا الشهر بالفعل — ألغِ اعتماده أولاً قبل اعتماد كشف جديد');
    }
    throw err;
  }
}

/** لقطة موظف → صف تحويل للمحرّك المشترك. المبلغ يأتي محسوبًا، لا يُشتقّ هنا. */
function toTransferSource(
  e: { employeeCode: string; employeeName: string; employeeNameEn: string | null; civilId: string | null; bankAccount: string | null },
  amount: number,
): BankTransferSource {
  return {
    employeeCode: e.employeeCode,
    fullName: e.employeeName,
    fullNameEn: e.employeeNameEn,
    civilId: e.civilId,
    bankAccount: e.bankAccount,
    amount,
  };
}

export const entitlementsBankExportService = {
  /**
   * جدول الشهر: صفوف الأهلية + الكشف المعتمد لهذا الشهر إن وُجد (سطوره مجمَّدة).
   * قراءة بحتة.
   */
  async getMonth(month: number, year: number) {
    assertPeriod(month, year);

    const [rows, statement] = await Promise.all([
      buildCandidateRows(month, year),
      prisma.entitlementsBankStatement.findUnique({
        where: { year_month: { year, month } },
        include: { lines: { orderBy: { sortOrder: 'asc' } } },
      }),
    ]);

    return {
      year,
      month,
      rows,
      statement: statement ? toStatementSummary(statement) : null,
      // سطور الكشف المعتمد بقيمها المجمَّدة — هي مصدر الملف البنكي، لا الصفوف الحيّة.
      statementLines: statement
        ? statement.lines.map((l) => ({
            employeeId: l.employeeId,
            calculationId: l.calculationId,
            employeeCode: l.employeeCodeSnapshot,
            employeeName: l.employeeNameSnapshot,
            employeeNameEn: l.employeeNameEnSnapshot,
            civilId: l.civilIdSnapshot,
            bankAccount: l.bankAccountSnapshot,
            netAmount: l.netAmountSnapshot,
            basicSalary: l.basicSalarySnapshot,
            transferAmount: l.transferAmount,
          }))
        : [],
    };
  },

  /**
   * يعتمد كشف الشهر ويجمّد قيمه.
   *
   * يعيد التحقّق من أهلية **كل** موظف مطلوب على الخادم — اختيار الواجهة ليس مصدر ثقة.
   * `@@unique([year, month])` هو الحارس البنيوي ضد كشفين لنفس الشهر، و
   * `@@unique([statementId, employeeId])` ضد تكرار موظف داخل الكشف.
   */
  async approve(params: { month: number; year: number; employeeIds: number[]; profileId: string }, req: Request) {
    const { month, year, employeeIds, profileId } = params;
    assertPeriod(month, year);

    const profile = PROFILES[profileId];
    if (!profile) throw AppError.badRequest('ملف التصدير غير مدعوم');

    const unique = [...new Set(employeeIds)];
    if (unique.length === 0) throw AppError.badRequest('اختر موظفًا واحدًا على الأقل');

    const existing = await prisma.entitlementsBankStatement.findUnique({ where: { year_month: { year, month } } });
    if (existing) {
      throw AppError.conflict('يوجد كشف مستحقات معتمد لهذا الشهر بالفعل — ألغِ اعتماده أولاً قبل اعتماد كشف جديد');
    }

    const rows = await buildCandidateRows(month, year);
    const byId = new Map(rows.map((r) => [r.employeeId, r]));

    const selected = unique.map((id) => {
      const row = byId.get(id);
      if (!row) throw AppError.badRequest(`الموظف رقم ${id} غير موجود ضمن موظفي هذا الشهر`);
      return row;
    });

    const rejected = selected.filter((r) => r.eligibility !== 'READY');
    if (rejected.length > 0) {
      throw AppError.badRequest(
        'تعذّر اعتماد الكشف — يوجد موظفون غير مؤهّلين ضمن الاختيار',
        rejected.map((r) => ({
          employeeId: r.employeeId,
          employeeCode: r.employeeCode,
          employeeName: r.employeeName,
          eligibility: r.eligibility,
          blockers: r.blockers,
        })),
      );
    }

    const ordered = [...selected].sort(byEmployeeCode);
    const totalAmount = roundMoney(ordered.reduce((s, r) => s + (r.transferAmount ?? 0), 0));
    const who = actor(req);

    // الفحص أعلاه يمنع الحالة المتوقّعة؛ هذا يمسك السباق: طلبا اعتماد متزامنان لنفس
    // الشهر. الفهرس الفريد يرفض الثاني، ويُترجَم هنا إلى نفس الرسالة الصريحة بدل خطأ خام.
    const created = await createStatement({
      data: {
        year,
        month,
        profileId: profile.id,
        currency: profile.currency,
        status: 'APPROVED',
        employeeCount: ordered.length,
        totalAmount,
        approvedById: who.id,
        approvedByName: who.name,
        lines: {
          create: ordered.map((r, i) => ({
            employeeId: r.employeeId,
            calculationId: r.calculationId,
            employeeCodeSnapshot: r.employeeCode,
            employeeNameSnapshot: r.employeeName,
            employeeNameEnSnapshot: r.employeeNameEn,
            civilIdSnapshot: r.civilId,
            bankAccountSnapshot: r.bankAccount,
            netAmountSnapshot: r.netAmount ?? 0,
            basicSalarySnapshot: r.basicSalary ?? 0,
            transferAmount: r.transferAmount ?? 0,
            sortOrder: i,
          })),
        },
      },
      include: { lines: { orderBy: { sortOrder: 'asc' } } },
    });

    await recordAudit({
      req,
      action: 'APPROVE',
      module: AUDIT_MODULE,
      entityId: created.id,
      newValue: {
        entity: 'entitlementsBankStatement',
        year, month, profileId: profile.id,
        employeeCount: created.employeeCount,
        totalAmount: created.totalAmount,
      },
    });

    return toStatementSummary(created);
  },

  /**
   * يلغي اعتماد كشف الشهر ويحذف لقطته.
   * إجراء صريح مسجَّل في سجل التدقيق — الطريق الوحيد لتغيير كشف معتمد، حتى لا يتغيّر
   * ملف بنكي صدر فعلًا بسبب تعديل لاحق في حسبة المستحقات بصمت.
   */
  async unapprove(params: { month: number; year: number }, req: Request) {
    const { month, year } = params;
    assertPeriod(month, year);

    const existing = await prisma.entitlementsBankStatement.findUnique({ where: { year_month: { year, month } } });
    if (!existing) throw AppError.notFound('لا يوجد كشف مستحقات معتمد لهذا الشهر');

    await prisma.entitlementsBankStatement.delete({ where: { id: existing.id } });

    await recordAudit({
      req,
      action: 'DELETE',
      module: AUDIT_MODULE,
      entityId: existing.id,
      oldValue: {
        entity: 'entitlementsBankStatement',
        year, month,
        employeeCount: existing.employeeCount,
        totalAmount: existing.totalAmount,
      },
    });

    return { year, month, removed: true };
  },

  /**
   * يبني الملف البنكي من **لقطة الكشف المعتمد** — لا من الحسبات الحيّة.
   * لا كشف معتمد ⇒ لا ملف: هذا هو نظير «مسير الرواتب يجب أن يكون معتمدًا» في كشف الرواتب.
   */
  async buildPreview(profileId: string, month: number, year: number): Promise<BankExportResult> {
    assertPeriod(month, year);
    const profile = PROFILES[profileId];
    if (!profile) throw AppError.badRequest('ملف التصدير غير مدعوم');

    const statement = await prisma.entitlementsBankStatement.findUnique({
      where: { year_month: { year, month } },
      include: { lines: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!statement) {
      throw AppError.badRequest('لا يوجد كشف مستحقات معتمد لهذا الشهر — اعتمد الكشف أولاً ثم صدّر الملف');
    }

    const sources: BankTransferSource[] = statement.lines.map((l) => ({
      employeeCode: l.employeeCodeSnapshot,
      fullName: l.employeeNameSnapshot,
      fullNameEn: l.employeeNameEnSnapshot,
      civilId: l.civilIdSnapshot,
      bankAccount: l.bankAccountSnapshot,
      amount: l.transferAmount,
    }));

    return profile.build(sources, month, year);
  },
};
