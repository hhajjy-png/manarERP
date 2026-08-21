import { Request } from 'express';
import { roundMoney } from '../../shared/utils/money';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';
import { recordAudit } from '../../core/middleware/audit';
import { buildPaginatedResult, getPagination, PaginationQuery } from '../../core/utils/pagination';
import { buildOrderBy, SortWhitelist } from '../../core/utils/sort';

// القائمة البيضاء للفرز (Enterprise Data Grid Foundation) — أعمدة سجل الشيكات.
const CHEQUES_SORTABLE: SortWhitelist = {
  chequeNumber: 'chequeNumber',
  beneficiaryName: 'beneficiaryName',
  bankName: 'bankName',
  amount: 'amount',
  chequeDate: 'chequeDate',
  status: 'status',
  paymentVoucherNumber: { field: 'paymentVoucherNumber', nullable: true },
};
const CHEQUES_DEFAULT_ORDER = [{ createdAt: 'desc' as const }];
import { localDateRange, toLocalDateString } from '../../core/utils/dateWindows';
import {
  CreateChequeInput,
  UpdateChequeInput,
  ReprintChequeInput,
  SaveTemplateVersionInput,
  CalibrationGeometryInput,
} from './cheques.schema';

/** Setting key prefix for the active per-bank calibration template. Mirrors the
 *  frontend `SETTING_KEY_PREFIX` in utils/chequeTemplate.ts. */
const TEMPLATE_SETTING_PREFIX = 'cheque.template.';
const templateSettingKey = (bank: string) => `${TEMPLATE_SETTING_PREFIX}${bank}`;

/** Single Setting key holding the Calibration Studio geometry (page/cheque mm). */
const GEOMETRY_SETTING_KEY = 'cheque.calibration.geometry';

/** Server-side defaults, mirrored in frontend utils/chequeGeometry.ts. A4 landscape
 *  page; offsetYMm matches the production print offset (CHEQUE_PAGE_OFFSET_Y_MM=40).
 *  These are safe starting points — the operator refines them against a real cheque. */
const DEFAULT_GEOMETRY: CalibrationGeometryInput = {
  pageWidthMm: 297,
  pageHeightMm: 210,
  chequeWidthMm: 175,
  chequeHeightMm: 80,
  offsetXMm: 0,
  offsetYMm: 40,
};

/** The filter inputs shared by the cheques list, the cheques report and the Excel export. */
export interface ChequeFilterQuery {
  status?: string;
  from?: string;
  to?: string;
  search?: string;
}

/**
 * THE single source of truth for "which cheques match these filters"
 * (Cheques Reporting & Excel Export Pack v1).
 *
 * Extracted verbatim from `list()` so the cheques screen, the Cheques report and
 * the Excel export cannot drift apart. The date window itself now comes from the
 * project-wide `localDateRange()` (Backend Date-Boundary Unification Pack v1), so
 * this builder and the reports layer's generic `dateWhere()` resolve an identical
 * instant for an identical `from`/`to` — the divergence this comment used to warn
 * about (UTC vs local midnight) no longer exists anywhere in the backend.
 *
 * Semantics (unchanged from the original `list()` code):
 *   • the period always applies to `chequeDate` — the date the user typed on the
 *     cheque — never `createdAt`/`updatedAt`/`printedAt`;
 *   • `to` is inclusive to the end of that local day (23:59:59.999);
 *   • `search` matches beneficiary name, cheque number or bank name;
 *   • `status` is the raw DRAFT/PRINTED/CANCELLED value.
 */
export function buildChequeFilterWhere(query: ChequeFilterQuery): Prisma.ChequeWhereInput {
  const where: Prisma.ChequeWhereInput = {};

  if (query.status) where.status = query.status;
  const dateRange = localDateRange(query.from, query.to);
  if (dateRange) where.chequeDate = dateRange;
  if (query.search) {
    where.OR = [
      { beneficiaryName: { contains: query.search } },
      { chequeNumber: { contains: query.search } },
      { bankName: { contains: query.search } },
    ];
  }

  return where;
}

/** Default row order for the cheques list — reused by the report so both agree. */
export const CHEQUES_REPORT_ORDER = CHEQUES_DEFAULT_ORDER;

/** الحساب البنكي كما يُرفق بكل شيك في المخرجات. */
const chequeAccountInclude = {
  bankAccount: {
    select: {
      id: true,
      accountName: true,
      isActive: true,
      printProfileKey: true,
      bank: { select: { id: true, code: true, nameAr: true, isActive: true } },
    },
  },
} as const;

type ChequeWithAccount = Prisma.ChequeGetPayload<{ include: typeof chequeAccountInclude }>;

/**
 * يضيف لكل شيك ما تحتاجه الواجهة عن حسابه البنكي.
 *
 * `printProfileKey` **لا يُسرَّب كقيمة** — يُختزل إلى راية `printEnabled`. الواجهة
 * تحتاج أن تعرف «هل الطباعة مسموحة؟» لا «أي قالب؟»؛ تمرير المفتاح كان سيغري
 * ببناء منطق اختيار قالب في العميل، وهو قرار يخصّ الخادم وحده.
 *
 * كل الحقول القائمة تبقى كما هي حرفيًا — الإضافة إضافية بحتة، فلا يتأثر
 * التصدير إلى Excel ولا التقارير ولا أي قارئ حالي.
 */
function withAccountView(cheque: ChequeWithAccount, printableBankNames: ReadonlySet<string>) {
  const account = cheque.bankAccount;
  return {
    ...cheque,
    bankAccount: account
      ? {
          id: account.id,
          accountName: account.accountName,
          isActive: account.isActive && account.bank.isActive,
          bankId: account.bank.id,
          bankCode: account.bank.code,
          bankNameAr: account.bank.nameAr,
          label: `${account.bank.nameAr} — ${account.accountName}`,
        }
      : null,
    /**
     * الطباعة مسموحة فقط لحساب يحمل قالب طباعة معتمدًا.
     *
     * شيك Legacy بلا حساب (`bankAccountId = null`) لا يُسمح بطباعته لمجرد غياب
     * الحساب: يُسمح فقط إذا كان اسم بنكه النصي يطابق بنكًا **له فعلًا** حساب
     * بقالب طباعة معتمد. بنك Legacy مجهول لا يُخمَّن ولا يُطبع بقالب بنك آخر.
     */
    printEnabled: account ? !!account.printProfileKey : printableBankNames.has(cheque.bankName),
  };
}

/**
 * أسماء البنوك (`Bank.nameAr`) التي لها فعلًا حساب واحد على الأقل بقالب طباعة
 * معتمد — أي البنوك التي يستطيع النظام الطباعة لها حقًا.
 *
 * هذه هي المرجعية الوحيدة للحكم على شيك Legacy بلا `bankAccountId`: اسم بنكه
 * النصي إمّا يطابق بنكًا قابلًا للطباعة فتُسمح طباعته بقالبه، أو لا يطابق فلا
 * يُطبع إطلاقًا. مشتقّة من السجل لا من اسم بنك مكتوب في الشيفرة، فإضافة بنك
 * ثانٍ قابل للطباعة مستقبلًا لا تحتاج تعديل سطر هنا.
 */
async function loadPrintableBankNames(): Promise<ReadonlySet<string>> {
  const banks = await prisma.bank.findMany({
    where: { accounts: { some: { printProfileKey: { not: null } } } },
    select: { nameAr: true },
  });
  return new Set(banks.map((b) => b.nameAr));
}

const NO_PRINTABLE_BANKS: ReadonlySet<string> = new Set<string>();

/**
 * نفس المرجعية، لكن تُحمَّل **فقط عند الحاجة**: هي لا تعني شيئًا إلا لشيك بلا
 * `bankAccountId`. الشيك المربوط بحساب تُقرأ رايته من قالب حسابه مباشرةً.
 *
 * قاعدة إنتاج مُرحَّلة بالكامل ليس فيها شيك غير مربوط، فهذا المسار لا يُصدر أي
 * استعلام إضافي في الحالة الطبيعية.
 */
async function printableBankNamesFor(
  cheques: readonly { bankAccountId: number | null }[],
): Promise<ReadonlySet<string>> {
  const hasUnlinked = cheques.some((c) => c.bankAccountId == null);
  return hasUnlinked ? loadPrintableBankNames() : NO_PRINTABLE_BANKS;
}

export class ChequesService {
  /** إحصاء الشيكات — يتبع نفس نطاق الفترة (chequeDate) الذي تتبعه القائمة.
   *  printedTotal: إجمالي مبلغ كل الشيكات PRINTED ضمن نفس نطاق الفترة، محسوبًا على
   *  مستوى قاعدة البيانات (SUM) عبر كل صفحات الـPagination — وليس فقط الصفحة المحمّلة
   *  حاليًا في الواجهة (Cheque Management Visual Polish Pack v1 — Hero Metric). */
  async stats(query: { from?: string; to?: string } = {}) {
    const dateWhere: Prisma.ChequeWhereInput = {};
    const dateRange = localDateRange(query.from, query.to);
    if (dateRange) dateWhere.chequeDate = dateRange;
    const [total, draft, printed, cancelled, printedAgg] = await Promise.all([
      prisma.cheque.count({ where: dateWhere }),
      prisma.cheque.count({ where: { ...dateWhere, status: 'DRAFT' } }),
      prisma.cheque.count({ where: { ...dateWhere, status: 'PRINTED' } }),
      prisma.cheque.count({ where: { ...dateWhere, status: 'CANCELLED' } }),
      prisma.cheque.aggregate({ where: { ...dateWhere, status: 'PRINTED' }, _sum: { amount: true } }),
    ]);
    return { total, draft, printed, cancelled, printedTotal: roundMoney(printedAgg._sum.amount ?? 0) };
  }

  async list(query: PaginationQuery & { status?: string; from?: string; to?: string }) {
    const pagination = getPagination(query);
    const where = buildChequeFilterWhere(query);

    const orderBy = buildOrderBy(query, CHEQUES_SORTABLE, CHEQUES_DEFAULT_ORDER, [{ id: 'desc' }]) as Prisma.ChequeOrderByWithRelationInput[];
    const [data, total] = await Promise.all([
      prisma.cheque.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy,
        include: chequeAccountInclude,
      }),
      prisma.cheque.count({ where }),
    ]);
    const printableBankNames = await printableBankNamesFor(data);
    return buildPaginatedResult(data.map((c) => withAccountView(c, printableBankNames)), total, pagination);
  }

  async getById(id: number) {
    const cheque = await prisma.cheque.findUnique({ where: { id }, include: chequeAccountInclude });
    if (!cheque) throw AppError.notFound('الشيك غير موجود');
    return withAccountView(cheque, await printableBankNamesFor([cheque]));
  }

  /**
   * يحمّل حسابًا بنكيًا صالحًا للإصدار عليه، أو يرمي خطأً مفهومًا.
   *
   * حساب موقوف — أو حساب بنكه موقوف — لا يجوز إصدار شيك جديد عليه. الشيكات
   * القديمة المرتبطة به تبقى كما هي بلا أي مساس؛ الإيقاف يمنع الإصدار الجديد
   * فقط، وهو الفرق بين «أوقفنا الحساب» و«نحذف تاريخه».
   */
  private async requireIssuableAccount(bankAccountId: number) {
    const account = await prisma.bankAccount.findUnique({
      where: { id: bankAccountId },
      include: { bank: true },
    });
    if (!account) throw AppError.notFound('الحساب البنكي غير موجود');
    if (!account.isActive) throw AppError.badRequest(`الحساب البنكي «${account.accountName}» موقوف — لا يمكن إصدار شيكات جديدة عليه`);
    if (!account.bank.isActive) throw AppError.badRequest(`البنك «${account.bank.nameAr}» موقوف — لا يمكن إصدار شيكات جديدة عليه`);
    return account;
  }

  /**
   * يفرض تفرّد رقم الشيك **ضمن الحساب البنكي الواحد**.
   *
   * الرقم 123456 يمكن أن يوجد في بنك الخليج وفي بنك آخر، وهما شيكان مختلفان
   * تمامًا — فالتفرّد العالمي القديم كان يمنع واقعًا مشروعًا.
   *
   * `bankAccountId: null` يمرّ هنا كـ`IS NULL` في Prisma، فالشيكات القديمة غير
   * المربوطة بحساب تظل محروسة على مستوى الخدمة رغم أن فهرس SQLite الفريد لا
   * يحرسها (القيم NULL متمايزة داخل الفهارس الفريدة هناك).
   */
  private async assertChequeNumberFree(
    bankAccountId: number | null,
    chequeNumber: string,
    excludeChequeId?: number,
  ) {
    const existing = await prisma.cheque.findFirst({
      where: {
        chequeNumber,
        bankAccountId,
        ...(excludeChequeId ? { id: { not: excludeChequeId } } : {}),
      },
    });
    if (!existing) return;
    // `chequeDate` عمود DateTime، فـ`String(date)` ينتج صيغة Date الكاملة بالإنجليزية
    // ("Sat Aug 16 2026 03:00:00 GMT+0300…") و`slice(0,10)` يقتطع منها "Sat Aug 16":
    // اسم يوم إنجليزي بلا سنة داخل رسالة عربية. `toLocalDateString` هو المُنسّق المعتمد.
    throw AppError.conflict(
      `رقم الشيك «${chequeNumber}» مستخدم بالفعل في هذا الحساب البنكي (المستفيد: ${existing.beneficiaryName}، التاريخ: ${toLocalDateString(existing.chequeDate)})`,
    );
  }

  async create(input: CreateChequeInput, req: Request) {
    const account = await this.requireIssuableAccount(input.bankAccountId);
    await this.assertChequeNumberFree(account.id, input.chequeNumber);

    const cheque = await prisma.cheque.create({
      data: {
        chequeNumber: input.chequeNumber,
        chequeDate: input.chequeDate,
        beneficiaryName: input.beneficiaryName,
        // مبلغ الشيك يُطبَع على ورقة بنكية — يُخزَّن بدقّة الدينار، لا خامًا.
        amount: roundMoney(input.amount),
        currency: input.currency ?? 'KWD',
        description: input.description ?? null,
        bankAccountId: account.id,
        // مشتق من البنك، لا من نص يرسله العميل — فلا يمكن أن يتناقض اسم البنك
        // المخزَّن مع الحساب المرتبط.
        bankName: account.bank.nameAr,
        notes: input.notes ?? null,
        status: 'DRAFT',
      },
      include: chequeAccountInclude,
    });
    await recordAudit({
      req,
      action: 'CREATE',
      module: 'cheques',
      entityId: cheque.id,
      newValue: {
        chequeNumber: cheque.chequeNumber,
        beneficiaryName: cheque.beneficiaryName,
        bankAccountId: cheque.bankAccountId,
        bankName: cheque.bankName,
        bankAccount: `${account.bank.nameAr} — ${account.accountName}`,
        amount: cheque.amount,
        currency: cheque.currency,
        chequeDate: cheque.chequeDate,
      },
    });
    return withAccountView(cheque, await printableBankNamesFor([cheque]));
  }

  async update(id: number, input: UpdateChequeInput, req: Request) {
    const current = await prisma.cheque.findUnique({ where: { id } });
    if (!current) throw AppError.notFound('الشيك غير موجود');
    if (current.status === 'CANCELLED') throw AppError.badRequest('لا يمكن تعديل شيك ملغي');
    // Cheque Printed Record Editing Fix v1 — a PRINTED cheque stays editable.
    //
    // The cheques module is an operational/reference register for PRINTING, not an
    // immutable financial ledger: it posts nothing to the GL and owns no accounting
    // entry. Locking a record the moment it was printed meant a mis-keyed payee,
    // amount or date could never be corrected — the operator had to cancel and
    // re-create, which broke the cheque-number continuity the register exists to
    // preserve. Editing is therefore allowed at any status except CANCELLED (a
    // cancelled cheque is genuinely terminal and its guard above is untouched).
    //
    // The edit is still fully accountable and non-destructive:
    //   • `recordAudit` below logs the UPDATE with the complete old and new values;
    //   • print STATE is untouched — this method writes only the eight business
    //     fields, never `status`, `printedAt`, `printCount`, `cancelledAt`, and it
    //     never touches ChequePrintLog, so the print history of an already-printed
    //     cheque survives an edit intact;
    //   • the chequeNumber uniqueness check below still applies.
    // Re-printing an edited PRINTED cheque continues to go through the existing
    // reprint flow (justification + logged), which is deliberately unchanged.

    // تغيير الحساب البنكي: يُعاد اشتقاق `bankName` من البنك الجديد، ويُعاد فحص
    // تفرّد الرقم ضمن الحساب الهدف — فنقل شيك إلى حساب يحمل الرقم نفسه مرفوض.
    // عدم تمرير `bankAccountId` يُبقي الشيك على حسابه الحالي كما هو (بما في ذلك
    // شيكات Legacy غير المربوطة: تبقى بلا حساب ولا تُخمَّن).
    const accountChanged =
      input.bankAccountId !== undefined && input.bankAccountId !== current.bankAccountId;
    const account = accountChanged ? await this.requireIssuableAccount(input.bankAccountId!) : null;
    const targetAccountId = account ? account.id : current.bankAccountId;

    const numberChanged = !!input.chequeNumber && input.chequeNumber !== current.chequeNumber;
    if (numberChanged || accountChanged) {
      await this.assertChequeNumberFree(
        targetAccountId,
        input.chequeNumber ?? current.chequeNumber,
        id,
      );
    }

    const cheque = await prisma.cheque.update({
      where: { id },
      data: {
        chequeNumber: input.chequeNumber ?? current.chequeNumber,
        chequeDate: input.chequeDate ?? current.chequeDate,
        beneficiaryName: input.beneficiaryName ?? current.beneficiaryName,
        amount: input.amount === undefined ? current.amount : roundMoney(input.amount),
        currency: input.currency ?? current.currency,
        description: input.description === undefined ? current.description : (input.description ?? null),
        bankAccountId: targetAccountId,
        bankName: account ? account.bank.nameAr : current.bankName,
        notes: input.notes === undefined ? current.notes : (input.notes ?? null),
      },
      include: chequeAccountInclude,
    });
    await recordAudit({
      req,
      action: 'UPDATE',
      module: 'cheques',
      entityId: id,
      oldValue: current,
      // تغيير الحساب البنكي حدث جوهري (يغيّر هوية الشيك ونطاق تفرّد رقمه)، فيُذكر
      // صراحةً في السجل بدل أن يُستنتج من فرق حقول.
      newValue: accountChanged
        ? {
            ...input,
            bankAccountChanged: { from: current.bankAccountId, to: targetAccountId },
            bankName: cheque.bankName,
          }
        : input,
    });
    return withAccountView(cheque, await printableBankNamesFor([cheque]));
  }

  // ── بوابة الطباعة (Multi-Bank Cheques Foundation v1) ───────────────────────

  /**
   * يمنع تسجيل طباعة شيك على حساب بنكي بلا قالب طباعة معتمد.
   *
   * في هذه الحزمة الحساب الوحيد المهيأ هو حساب بنك الخليج الرئيسي
   * (`printProfileKey = 'CLASSIC_GULF_V1'`)، فطباعته تستمر بمسار Classic بلا
   * أي تغيير. أي بنك أو حساب جديد يُمنع من الطباعة — لا يرث صورة بنك الخليج
   * ولا مقاساته ولا إحداثياته ولا معايرته، ولا يوجد fallback من أي نوع.
   *
   * الحفظ والتعديل والإلغاء والإدارة تبقى مسموحة: الممنوع هو الطباعة وحدها.
   *
   * الشيكات القديمة غير المربوطة بحساب (`bankAccountId = null`) تُترك على
   * سلوكها السابق عمدًا: منعها كان سيكسر إعادة طباعة سجلات قائمة لم يخترها
   * المستخدم ولا يستطيع إصلاحها من داخل هذه الحزمة.
   */
  private async assertAccountPrintable(bankAccountId: number | null, bankName?: string) {
    if (bankAccountId == null) {
      // شيك Legacy بلا حساب: لا يُطبع لمجرد غياب الحساب. يُسمح فقط إذا كان اسم
      // بنكه النصي يطابق بنكًا له فعلًا حساب بقالب طباعة معتمد — وإلا فبنكه
      // مجهول للنظام، ولا يجوز تخمينه ولا طباعته بقالب بنك آخر.
      // هنا الشيك بلا حساب يقينًا، فالتحميل مطلوب لا كسول.
      const printableBankNames = await loadPrintableBankNames();
      if (bankName && printableBankNames.has(bankName)) return;
      throw AppError.badRequest(
        `هذا الشيك غير مرتبط بحساب بنكي، وبنكه «${bankName ?? 'غير معروف'}» ليس له حساب بقالب طباعة معتمد. اربطه بالحساب البنكي الصحيح قبل الطباعة.`,
      );
    }
    const account = await prisma.bankAccount.findUnique({
      where: { id: bankAccountId },
      include: { bank: true },
    });
    if (!account) throw AppError.notFound('الحساب البنكي غير موجود');
    if (!account.printProfileKey) {
      throw AppError.badRequest(
        `لم يتم إعداد قالب الطباعة للحساب البنكي «${account.bank.nameAr} — ${account.accountName}» بعد. سيتم تفعيله بعد إدخال نموذج الشيك والأبعاد الفعلية.`,
      );
    }
  }

  async markPrinted(id: number, req: Request) {
    const current = await prisma.cheque.findUnique({ where: { id } });
    if (!current) throw AppError.notFound('الشيك غير موجود');
    if (current.status === 'CANCELLED') throw AppError.badRequest('لا يمكن طباعة شيك ملغي');
    if (current.status === 'PRINTED') throw AppError.badRequest('الشيك مطبوع بالفعل');
    await this.assertAccountPrintable(current.bankAccountId, current.bankName);

    // First print: flip status and open the print log (sequence 1, no reason).
    // Atomic so the counter and the log row can never diverge. Lifecycle rules
    // (reject CANCELLED / already-PRINTED) are unchanged — only logging is added.
    const cheque = await prisma.$transaction(async (tx) => {
      const updated = await tx.cheque.update({
        where: { id },
        data: { status: 'PRINTED', printedAt: new Date(), printCount: 1 },
      });
      await tx.chequePrintLog.create({
        data: {
          chequeId: id,
          sequence: 1,
          reason: null,
          printedById: req.user?.userId ?? null,
          printedByName: req.user?.username ?? null,
        },
      });
      return updated;
    });

    await recordAudit({
      req,
      action: 'PRINT',
      module: 'cheques',
      entityId: id,
      newValue: { status: 'PRINTED', sequence: 1 },
    });
    return cheque;
  }

  /**
   * إعادة طباعة شيك مطبوع مع تسجيل السبب. لا تغيّر حالة الشيك (يبقى PRINTED)،
   * ولا تؤثر على سند الصرف أو المحاسبة أو مطابقة كشف الحساب البنكي — تضيف فقط
   * سطراً في سجل الطباعة وتزيد عدّاد الطباعة. إعادة الطباعة مسموحة (لا تُمنع)
   * لكنها موثّقة وقابلة للتدقيق.
   */
  async reprint(id: number, input: ReprintChequeInput, req: Request) {
    const current = await prisma.cheque.findUnique({ where: { id } });
    if (!current) throw AppError.notFound('الشيك غير موجود');
    if (current.status === 'CANCELLED') throw AppError.badRequest('لا يمكن إعادة طباعة شيك ملغي');
    if (current.status !== 'PRINTED') {
      throw AppError.badRequest('إعادة الطباعة متاحة فقط لشيك مطبوع مسبقاً');
    }
    await this.assertAccountPrintable(current.bankAccountId, current.bankName);

    const { cheque, sequence } = await prisma.$transaction(async (tx) => {
      // Re-read inside the transaction so the sequence is derived from the
      // committed state, not the stale outer read — this is what keeps the count
      // and log sequence atomic when two reprints race (the second waits on the
      // write lock and then sees the first request's printCount).
      const fresh = await tx.cheque.findUnique({ where: { id } });
      if (!fresh) throw AppError.notFound('الشيك غير موجود');

      // Legacy bootstrap: a cheque printed BEFORE this feature has printCount 0 and
      // no ChequePrintLog. Its original print really happened (status PRINTED,
      // printedAt set), so we record that original as sequence 1 using the REAL
      // printedAt. We do NOT fabricate anything: the user is genuinely unknown
      // (null), and an initial print never carries a reason (null). The reprint
      // itself is then sequence 2 — never presented or stored as an initial print.
      const isLegacyUntracked = fresh.printCount === 0;
      if (isLegacyUntracked) {
        await tx.chequePrintLog.create({
          data: {
            chequeId: id,
            sequence: 1,
            reason: null,
            note: 'سجل تلقائي — طُبع قبل تفعيل تتبّع الطباعة (المستخدم والوقت الأصلي كما هو مُسجَّل، غير مؤكَّد)',
            printedById: null,
            printedByName: null,
            printedAt: fresh.printedAt ?? undefined,
          },
        });
      }

      // Legacy: 0 → 2 (1 untracked original + this reprint). Modern: n → n + 1.
      const nextSequence = Math.max(fresh.printCount, 1) + 1;
      const updated = await tx.cheque.update({
        where: { id },
        data: { printCount: nextSequence },
      });
      await tx.chequePrintLog.create({
        data: {
          chequeId: id,
          sequence: nextSequence,
          reason: input.reason,
          note: input.note ?? null,
          printedById: req.user?.userId ?? null,
          printedByName: req.user?.username ?? null,
        },
      });
      return { cheque: updated, sequence: nextSequence };
    });

    await recordAudit({
      req,
      action: 'PRINT',
      module: 'cheques',
      entityId: id,
      newValue: { reprint: true, sequence, reason: input.reason },
    });
    return cheque;
  }

  /** سجل الطباعة/إعادة الطباعة لشيك، من الأقدم إلى الأحدث. */
  async listPrintLogs(id: number) {
    const cheque = await prisma.cheque.findUnique({ where: { id } });
    if (!cheque) throw AppError.notFound('الشيك غير موجود');
    return prisma.chequePrintLog.findMany({
      where: { chequeId: id },
      orderBy: { sequence: 'asc' },
    });
  }

  async cancel(id: number, req: Request) {
    const current = await prisma.cheque.findUnique({ where: { id } });
    if (!current) throw AppError.notFound('الشيك غير موجود');
    if (current.status === 'CANCELLED') throw AppError.badRequest('الشيك ملغي بالفعل');

    const cheque = await prisma.cheque.update({
      where: { id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
    await recordAudit({
      req,
      action: 'CANCEL',
      module: 'cheques',
      entityId: id,
      newValue: { status: 'CANCELLED' },
    });
    return cheque;
  }

  /**
   * Returns the Payment Voucher number for a cheque, generating one on first call.
   *
   * Generation rules:
   * - Number is generated ONLY when the user requests it (Print Payment Voucher).
   * - Sequence is stored in the Setting key "finance.paymentVoucher.lastSequence".
   * - Format: PV-000001 (global, never resets, never reuses deleted numbers).
   * - The entire read-increment-write is atomic inside a Prisma transaction.
   * - Subsequent calls for the same cheque return the already-stored number (idempotent).
   */
  async getOrCreatePaymentVoucherNumber(id: number): Promise<string> {
    const cheque = await prisma.cheque.findUnique({ where: { id } });
    if (!cheque) throw AppError.notFound('الشيك غير موجود');
    if (cheque.status === 'CANCELLED') throw AppError.badRequest('لا يمكن إصدار سند صرف لشيك ملغي');

    // Idempotent: return existing number without writing
    if (cheque.paymentVoucherNumber) return cheque.paymentVoucherNumber;

    const SETTINGS_KEY = 'finance.paymentVoucher.lastSequence';

    const voucherNumber = await prisma.$transaction(async (tx) => {
      // Re-read inside the transaction: two concurrent requests can both see null
      // outside, but only the first one to acquire the write lock will find null here.
      const fresh = await tx.cheque.findUnique({ where: { id } });
      if (!fresh) throw AppError.notFound('الشيك غير موجود');
      if (fresh.paymentVoucherNumber) return fresh.paymentVoucherNumber;

      const setting = await tx.setting.findUnique({ where: { key: SETTINGS_KEY } });
      const lastSeq = setting ? parseInt(setting.value, 10) : 0;
      const nextSeq = isNaN(lastSeq) ? 1 : lastSeq + 1;
      const number = `PV-${String(nextSeq).padStart(6, '0')}`;

      await tx.setting.upsert({
        where: { key: SETTINGS_KEY },
        update: { value: String(nextSeq) },
        create: { key: SETTINGS_KEY, value: String(nextSeq), group: 'finance' },
      });

      await tx.cheque.update({
        where: { id },
        data: { paymentVoucherNumber: number },
      });

      return number;
    });

    return voucherNumber;
  }

  /**
   * معاينة الحذف النهائي (SYSTEM_ADMIN فقط عبر الراوت).
   * لا تحذف شيئاً — تُرجع بيانات الشيك وما سيتأثر لعرضها في نافذة التأكيد.
   */
  async forceRemovePreview(id: number) {
    const cheque = await prisma.cheque.findUnique({ where: { id } });
    if (!cheque) throw AppError.notFound('الشيك غير موجود');

    // حركات كشف الحساب البنكي المطابَقة بهذا الشيك (مرجع تسوية، بلا FK)
    const bankMatchesCount = await prisma.bankStatementTransaction.count({
      where: { matchedType: 'cheque', matchedId: id },
    });

    const willBeDeleted: string[] = ['سجل الشيك'];

    const warnings: string[] = [];
    if (cheque.status === 'CANCELLED') {
      warnings.push('هذا الشيك ملغى بالفعل — الإلغاء هو الإجراء المعتاد، والحذف النهائي استثنائي لا يمكن التراجع عنه');
    }
    if (cheque.status === 'PRINTED') {
      warnings.push('هذا الشيك مطبوع — الحذف النهائي يزيل سجله بالكامل من النظام');
    }
    if (cheque.paymentVoucherNumber) {
      warnings.push(`صدر لهذا الشيك سند صرف رقم ${cheque.paymentVoucherNumber} — لن يُعاد استخدام هذا الرقم بعد الحذف`);
    }
    if (bankMatchesCount > 0) {
      warnings.push(`هذا الشيك مطابَق بـ ${bankMatchesCount} حركة في كشف حساب بنكي — سيتم فك ارتباطها (تُحفظ الحركات وتعود «غير مطابَقة» ولا تُحذف)`);
    }

    return {
      id: cheque.id,
      chequeNumber: cheque.chequeNumber,
      beneficiaryName: cheque.beneficiaryName,
      amount: cheque.amount,
      currency: cheque.currency,
      bankName: cheque.bankName,
      chequeDate: cheque.chequeDate,
      status: cheque.status,
      printedAt: cheque.printedAt,
      cancelledAt: cheque.cancelledAt,
      paymentVoucherNumber: cheque.paymentVoucherNumber,
      hasPaymentVoucher: !!cheque.paymentVoucherNumber,
      bankMatchesCount,
      willBeDeleted,
      warnings,
    };
  }

  /**
   * الحذف النهائي للشيك (SYSTEM_ADMIN فقط عبر الراوت).
   * يتطلب تطابق رقم الشيك للتأكيد. يفك ارتباط حركات كشف الحساب البنكي المطابَقة
   * (دون حذفها) ثم يحذف سجل الشيك داخل معاملة واحدة، ويسجّل الحدث في سجل التدقيق.
   */
  async forceRemove(id: number, confirmation: string, req: Request) {
    const cheque = await prisma.cheque.findUnique({ where: { id } });
    if (!cheque) throw AppError.notFound('الشيك غير موجود');

    if (confirmation !== cheque.chequeNumber) {
      throw AppError.badRequest('يجب كتابة رقم الشيك بشكل مطابق للتأكيد');
    }

    const bankMatchesCount = await prisma.bankStatementTransaction.count({
      where: { matchedType: 'cheque', matchedId: id },
    });

    await prisma.$transaction(async (tx) => {
      // فك ارتباط حركات كشف الحساب المطابَقة بهذا الشيك — نحفظ السجلات البنكية المستوردة ولا نحذفها
      if (bankMatchesCount > 0) {
        await tx.bankStatementTransaction.updateMany({
          where: { matchedType: 'cheque', matchedId: id },
          data: { reconcileStatus: 'UNMATCHED', matchedType: null, matchedId: null, matchedRef: null, matchConfidence: null },
        });
      }
      await tx.cheque.delete({ where: { id } });
    });

    await recordAudit({
      req,
      action: 'DELETE',
      module: 'cheques',
      entityId: id,
      newValue: {
        forceDelete: true,
        chequeNumber: cheque.chequeNumber,
        beneficiaryName: cheque.beneficiaryName,
        amount: cheque.amount,
        currency: cheque.currency,
        bankName: cheque.bankName,
        status: cheque.status,
        hadPaymentVoucher: !!cheque.paymentVoucherNumber,
        paymentVoucherNumber: cheque.paymentVoucherNumber,
        bankMatchesCleared: bankMatchesCount,
      },
    });

    return { deleted: true };
  }

  // ── Cheque calibration template versioning ─────────────────────────────────
  // The ACTIVE template stays exactly where it was: Setting key
  // `cheque.template.<bank>`. Saving/restoring additionally appends an immutable
  // snapshot to cheque_template_versions so calibration is never silently
  // overwritten without recoverable history. Printing reads the active Setting,
  // unchanged.

  /**
   * حفظ نموذج معايرة لبنك: يكتب النموذج الفعّال في Setting (كما كان) ويضيف نسخة
   * تاريخية جديدة برقم تصاعدي. عملية واحدة ذرّية.
   */
  async saveTemplateVersion(input: SaveTemplateVersionInput, req: Request) {
    const templateJson = JSON.stringify(input.template);

    const version = await prisma.$transaction(async (tx) => {
      const last = await tx.chequeTemplateVersion.findFirst({
        where: { bankName: input.bankName },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      const nextVersion = (last?.version ?? 0) + 1;

      const created = await tx.chequeTemplateVersion.create({
        data: {
          bankName: input.bankName,
          version: nextVersion,
          template: templateJson,
          note: input.note ?? null,
          createdById: req.user?.userId ?? null,
          createdByName: req.user?.username ?? null,
        },
      });

      // Keep the active template in sync (this is the source printing reads).
      await tx.setting.upsert({
        where: { key: templateSettingKey(input.bankName) },
        update: { value: templateJson },
        create: { key: templateSettingKey(input.bankName), value: templateJson, group: 'cheque' },
      });

      return created;
    });

    await recordAudit({
      req,
      action: 'UPDATE',
      module: 'cheques',
      entityId: version.id,
      newValue: { chequeTemplate: input.bankName, version: version.version },
    });
    return version;
  }

  /** قائمة نسخ نموذج المعايرة لبنك، من الأحدث إلى الأقدم. */
  async listTemplateVersions(bankName: string) {
    return prisma.chequeTemplateVersion.findMany({
      where: { bankName },
      orderBy: { version: 'desc' },
    });
  }

  /**
   * استعادة نسخة سابقة: تُنشئ نسخة جديدة (append-only) بمحتوى النسخة المستعادة
   * وتحدّث النموذج الفعّال. لا تُحذف أي نسخة، والاستعادة نفسها تُسجَّل كنسخة جديدة.
   */
  async restoreTemplateVersion(versionId: number, req: Request) {
    const source = await prisma.chequeTemplateVersion.findUnique({ where: { id: versionId } });
    if (!source) throw AppError.notFound('النسخة غير موجودة');

    const restored = await prisma.$transaction(async (tx) => {
      const last = await tx.chequeTemplateVersion.findFirst({
        where: { bankName: source.bankName },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      const nextVersion = (last?.version ?? 0) + 1;

      const created = await tx.chequeTemplateVersion.create({
        data: {
          bankName: source.bankName,
          version: nextVersion,
          template: source.template,
          note: `استعادة النسخة ${source.version}`,
          createdById: req.user?.userId ?? null,
          createdByName: req.user?.username ?? null,
        },
      });

      await tx.setting.upsert({
        where: { key: templateSettingKey(source.bankName) },
        update: { value: source.template },
        create: { key: templateSettingKey(source.bankName), value: source.template, group: 'cheque' },
      });

      return created;
    });

    await recordAudit({
      req,
      action: 'UPDATE',
      module: 'cheques',
      entityId: restored.id,
      newValue: {
        chequeTemplateRestore: source.bankName,
        restoredFromVersion: source.version,
        newVersion: restored.version,
      },
    });
    return restored;
  }

  // ── Calibration Studio geometry ────────────────────────────────────────────
  // Additive Setting only. Read is open to calibrators; write is SYSTEM_ADMIN-only
  // (enforced on the route). Never touches templates or the print engine.

  /** Returns the stored calibration geometry merged over defaults (defaults if absent/corrupt). */
  async getCalibrationGeometry(): Promise<CalibrationGeometryInput> {
    const row = await prisma.setting.findUnique({ where: { key: GEOMETRY_SETTING_KEY } });
    if (!row) return { ...DEFAULT_GEOMETRY };
    try {
      const parsed = JSON.parse(row.value) as Partial<CalibrationGeometryInput>;
      return { ...DEFAULT_GEOMETRY, ...parsed };
    } catch {
      return { ...DEFAULT_GEOMETRY };
    }
  }

  /** Persists the calibration geometry (SYSTEM_ADMIN only via the route). */
  async saveCalibrationGeometry(input: CalibrationGeometryInput, req: Request) {
    const value = JSON.stringify(input);
    await prisma.setting.upsert({
      where: { key: GEOMETRY_SETTING_KEY },
      update: { value },
      create: { key: GEOMETRY_SETTING_KEY, value, group: 'cheque' },
    });
    await recordAudit({
      req,
      action: 'UPDATE',
      module: 'cheques',
      newValue: { calibrationGeometry: input },
    });
    return input;
  }
}

export const chequesService = new ChequesService();
