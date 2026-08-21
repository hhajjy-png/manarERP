import { Request } from 'express';
import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';
import { recordAudit } from '../../core/middleware/audit';
import {
  CreateBankInput,
  UpdateBankInput,
  CreateBankAccountInput,
  UpdateBankAccountInput,
} from './banks.schema';

/**
 * سجل البنوك والحسابات البنكية — Multi-Bank Cheques Foundation v1.
 *
 * هذه الوحدة **مستقلة تمامًا** عن وحدة `bankAccounts` القائمة
 * (`/api/bank-accounts`): تلك عرض مشتق للقراءة فقط من `accountKey` في حركات
 * كشوف البنوك ولا تملك جدولًا، وهذه هي الكيان المخزَّن. لم يُمسّ أي مسار أو
 * عقد فيها؛ الجسر الوحيد بينهما هو الحقل الاختياري `statementAccountKey`.
 *
 * حدود مقصودة لهذه الحزمة:
 *   • لا حذف — البنك أو الحساب المرتبط بشيكات مُصدَرة سجل تاريخي دائم.
 *     الإيقاف (`isActive = false`) هو المسار، ولا مسار حذف هنا إطلاقًا.
 *   • لا كتابة لـ`printProfileKey` من أي مسار — لا يوجد حتى مُدخَل له.
 *   • لا ربط بالمحاسبة العامة: لا `glAccountId`، ولا قيد، ولا مساس بالحساب 1010.
 */

/** الشكل المعروض للحساب في منتقي الشيك: «بنك الخليج — الحساب الرئيسي». */
export function bankAccountLabel(bankNameAr: string, accountName: string): string {
  return `${bankNameAr} — ${accountName}`;
}

/** الحقول المعروضة لحساب بنكي. `printProfileKey` **لا يُسرَّب كقيمة** — تُشتق
 *  منه راية منطقية واحدة (`printEnabled`) لأن الواجهة لا تحتاج غيرها ولا يجوز
 *  أن تبني عليه منطق اختيار قالب. */
function toAccountView(account: {
  id: number;
  bankId: number;
  accountName: string;
  isActive: boolean;
  statementAccountKey: string | null;
  printProfileKey: string | null;
  bank: { id: number; code: string; nameAr: string; nameEn: string | null; isActive: boolean };
}) {
  return {
    id: account.id,
    bankId: account.bankId,
    bankCode: account.bank.code,
    bankNameAr: account.bank.nameAr,
    bankNameEn: account.bank.nameEn,
    accountName: account.accountName,
    label: bankAccountLabel(account.bank.nameAr, account.accountName),
    isActive: account.isActive && account.bank.isActive,
    accountIsActive: account.isActive,
    bankIsActive: account.bank.isActive,
    statementAccountKey: account.statementAccountKey,
    /** true فقط عندما يكون للحساب قالب طباعة معتمد. الواجهة تمنع الطباعة
     *  والمعاينة عندما تكون false، والخادم يفرض المنع نفسه في وحدة الشيكات. */
    printEnabled: !!account.printProfileKey,
  };
}

export type BankAccountView = ReturnType<typeof toAccountView>;

const accountInclude = {
  bank: { select: { id: true, code: true, nameAr: true, nameEn: true, isActive: true } },
} as const;

export class BanksService {
  // ── البنوك ────────────────────────────────────────────────────────────────

  async listBanks() {
    const banks = await prisma.bank.findMany({
      orderBy: [{ isActive: 'desc' }, { nameAr: 'asc' }],
      include: { _count: { select: { accounts: true } } },
    });
    return banks.map((b) => ({
      id: b.id,
      code: b.code,
      nameAr: b.nameAr,
      nameEn: b.nameEn,
      isActive: b.isActive,
      accountsCount: b._count.accounts,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    }));
  }

  async createBank(input: CreateBankInput, req: Request) {
    const existing = await prisma.bank.findUnique({ where: { code: input.code } });
    if (existing) {
      throw AppError.conflict(`معرّف البنك «${input.code}» مستخدم بالفعل للبنك «${existing.nameAr}»`);
    }

    const bank = await prisma.bank.create({
      data: {
        code: input.code,
        nameAr: input.nameAr,
        nameEn: input.nameEn ?? null,
        isActive: input.isActive ?? true,
      },
    });
    await recordAudit({
      req,
      action: 'CREATE',
      module: 'banks',
      entityId: bank.id,
      newValue: { code: bank.code, nameAr: bank.nameAr, nameEn: bank.nameEn, isActive: bank.isActive },
    });
    return bank;
  }

  async updateBank(id: number, input: UpdateBankInput, req: Request) {
    const current = await prisma.bank.findUnique({ where: { id } });
    if (!current) throw AppError.notFound('البنك غير موجود');

    const bank = await prisma.bank.update({
      where: { id },
      data: {
        nameAr: input.nameAr ?? current.nameAr,
        nameEn: input.nameEn === undefined ? current.nameEn : (input.nameEn ?? null),
        isActive: input.isActive ?? current.isActive,
      },
    });

    // إيقاف/تفعيل حدث إداري مستقل عن التسمية — يُسجَّل باسمه ليقرأ في سجل
    // التدقيق كما هو، لا مختبئًا داخل UPDATE عام.
    const activationChanged = input.isActive !== undefined && input.isActive !== current.isActive;
    await recordAudit({
      req,
      action: activationChanged ? (bank.isActive ? 'ACTIVATE' : 'DEACTIVATE') : 'UPDATE',
      module: 'banks',
      entityId: id,
      oldValue: { code: current.code, nameAr: current.nameAr, nameEn: current.nameEn, isActive: current.isActive },
      newValue: { code: bank.code, nameAr: bank.nameAr, nameEn: bank.nameEn, isActive: bank.isActive },
    });
    return bank;
  }

  // ── الحسابات البنكية ──────────────────────────────────────────────────────

  /**
   * قائمة الحسابات. `activeOnly` هو ما يستهلكه منتقي الحساب في نموذج الشيك:
   * حساب موقوف — أو حساب بنك موقوف — لا يجوز إصدار شيك جديد عليه، لكن شيكاته
   * القديمة تبقى كما هي بلا مساس.
   */
  async listAccounts(options: { activeOnly?: boolean } = {}) {
    const accounts = await prisma.bankAccount.findMany({
      where: options.activeOnly ? { isActive: true, bank: { isActive: true } } : undefined,
      orderBy: [{ bank: { nameAr: 'asc' } }, { accountName: 'asc' }],
      include: accountInclude,
    });
    return accounts.map(toAccountView);
  }

  async getAccount(id: number) {
    const account = await prisma.bankAccount.findUnique({ where: { id }, include: accountInclude });
    if (!account) throw AppError.notFound('الحساب البنكي غير موجود');
    return toAccountView(account);
  }

  async createAccount(input: CreateBankAccountInput, req: Request) {
    const bank = await prisma.bank.findUnique({ where: { id: input.bankId } });
    if (!bank) throw AppError.notFound('البنك غير موجود');

    const duplicate = await prisma.bankAccount.findUnique({
      where: { bankId_accountName: { bankId: input.bankId, accountName: input.accountName } },
    });
    if (duplicate) {
      throw AppError.conflict(`يوجد حساب باسم «${input.accountName}» لدى «${bank.nameAr}» — اسم الحساب هو ما يميّز حسابات البنك الواحد`);
    }

    const account = await prisma.bankAccount.create({
      data: {
        bankId: input.bankId,
        accountName: input.accountName,
        isActive: input.isActive ?? true,
        statementAccountKey: input.statementAccountKey ?? null,
        // printProfileKey يبقى null عمدًا: حساب جديد بلا قالب طباعة معتمد، فلا
        // طباعة ولا معاينة له حتى تُعتمد أبعاد شيكه الحقيقية في حزمة لاحقة.
      },
      include: accountInclude,
    });

    await recordAudit({
      req,
      action: 'CREATE',
      module: 'banks',
      entityId: account.id,
      newValue: {
        bankAccount: bankAccountLabel(bank.nameAr, account.accountName),
        bankCode: bank.code,
        isActive: account.isActive,
        statementAccountKey: account.statementAccountKey,
      },
    });
    return toAccountView(account);
  }

  async updateAccount(id: number, input: UpdateBankAccountInput, req: Request) {
    const current = await prisma.bankAccount.findUnique({ where: { id }, include: accountInclude });
    if (!current) throw AppError.notFound('الحساب البنكي غير موجود');

    if (input.accountName && input.accountName !== current.accountName) {
      const duplicate = await prisma.bankAccount.findUnique({
        where: { bankId_accountName: { bankId: current.bankId, accountName: input.accountName } },
      });
      if (duplicate) {
        throw AppError.conflict(`يوجد حساب باسم «${input.accountName}» لدى «${current.bank.nameAr}»`);
      }
    }

    const account = await prisma.bankAccount.update({
      where: { id },
      data: {
        accountName: input.accountName ?? current.accountName,
        isActive: input.isActive ?? current.isActive,
        statementAccountKey:
          input.statementAccountKey === undefined
            ? current.statementAccountKey
            : (input.statementAccountKey ?? null),
      },
      include: accountInclude,
    });

    const activationChanged = input.isActive !== undefined && input.isActive !== current.isActive;
    await recordAudit({
      req,
      action: activationChanged ? (account.isActive ? 'ACTIVATE' : 'DEACTIVATE') : 'UPDATE',
      module: 'banks',
      entityId: id,
      oldValue: {
        bankAccount: bankAccountLabel(current.bank.nameAr, current.accountName),
        isActive: current.isActive,
        statementAccountKey: current.statementAccountKey,
      },
      newValue: {
        bankAccount: bankAccountLabel(account.bank.nameAr, account.accountName),
        isActive: account.isActive,
        statementAccountKey: account.statementAccountKey,
      },
    });
    return toAccountView(account);
  }

  // ── تقرير سلامة الترحيل ───────────────────────────────────────────────────

  /**
   * الشيكات التي لم يُربَط بها حساب بنكي، مجمّعة حسب قيمة `bankName` النصية.
   *
   * هذا هو مخرَج «لا تخمين» المطلوب: الـmigration يربط حصرًا القيمة الحرفية
   * «بنك الخليج»؛ أي قيمة Legacy أخرى تظهر هنا ليقرر المستخدم بنفسه إلى أي
   * حساب تنتمي. لا شيك يُحذف ولا يُعدَّل ولا يُخمَّن بنكه في أي مسار.
   *
   * قاعدة تطوير نظيفة تُرجع مصفوفة فارغة — وهو ما يعنيه «لا يوجد ما يحتاج قرارًا».
   */
  async unlinkedChequesReport() {
    const groups = await prisma.cheque.groupBy({
      by: ['bankName'],
      where: { bankAccountId: null },
      _count: { _all: true },
      orderBy: { _count: { bankName: 'desc' } },
    });
    const total = groups.reduce((sum, g) => sum + g._count._all, 0);
    return {
      total,
      groups: groups.map((g) => ({ bankName: g.bankName, count: g._count._all })),
    };
  }
}

export const banksService = new BanksService();
