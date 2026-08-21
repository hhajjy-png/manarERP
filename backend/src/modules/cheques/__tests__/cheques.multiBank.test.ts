import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChequesService } from '../cheques.service';
import { createChequeSchema, updateChequeSchema } from '../cheques.schema';

/**
 * Multi-Bank Cheques Foundation v1 — عقد الوحدة.
 *
 * ما تثبته هذه المجموعة:
 *   • الشيك يُنشأ بحساب بنكي، و`bankName` يُشتق من البنك لا من نص العميل.
 *   • تفرّد رقم الشيك صار **لكل حساب**: نفس الرقم مرفوض داخل الحساب الواحد،
 *     ومسموح في حسابين مختلفين.
 *   • رقم الشيك يدوي 100% — لا مسار توليد ولا اقتراح في الخدمة.
 *   • الطباعة ممنوعة على حساب بلا قالب طباعة معتمد، بلا أي fallback إلى قالب
 *     بنك الخليج أو صورته أو مقاساته.
 *   • الحفظ والتعديل يبقيان مسموحين لحساب غير مهيأ للطباعة.
 */

vi.mock('../../../config/database', () => ({
  prisma: {
    cheque: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() },
    bank: { findMany: vi.fn() },
    bankAccount: { findUnique: vi.fn() },
    chequePrintLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../../core/middleware/audit', () => ({ recordAudit: vi.fn() }));

import { prisma } from '../../../config/database';
import { recordAudit } from '../../../core/middleware/audit';

// Prisma's generated client types do not describe a plain mock implementation,
// and these are unit tests of the service's own logic — same convention as the
// sibling cheque suites.
const mp = prisma as any;
const req = { user: { userId: 7, username: 'accountant' } } as any;
const service = new ChequesService();

/** حساب بنك الخليج الرئيسي — الحساب الوحيد المهيأ للطباعة في هذه الحزمة. */
const GULF_ACCOUNT = {
  id: 1,
  accountName: 'الحساب الرئيسي',
  isActive: true,
  printProfileKey: 'CLASSIC_GULF_V1',
  bank: { id: 1, code: 'GULF_BANK', nameAr: 'بنك الخليج', isActive: true },
};

/** حساب بنك جديد — مسجَّل وصالح للحفظ، لكن بلا قالب طباعة معتمد. */
const NBK_ACCOUNT = {
  id: 2,
  accountName: 'الحساب الجاري',
  isActive: true,
  printProfileKey: null,
  bank: { id: 2, code: 'NBK', nameAr: 'بنك الكويت الوطني', isActive: true },
};

const ACCOUNTS: Record<number, typeof GULF_ACCOUNT> = { 1: GULF_ACCOUNT, 2: NBK_ACCOUNT as any };

function makeCheque(overrides: Record<string, unknown> = {}) {
  return {
    id: 46,
    chequeNumber: '000002',
    chequeDate: new Date('2026-08-02T00:00:00.000Z'),
    beneficiaryName: 'مستفيد',
    amount: 1370,
    currency: 'KWD',
    description: null,
    bankAccountId: 1,
    bankName: 'بنك الخليج',
    notes: null,
    status: 'DRAFT',
    printedAt: null,
    cancelledAt: null,
    printCount: 0,
    paymentVoucherNumber: null,
    ...overrides,
  } as any;
}

const VALID_CREATE = {
  chequeNumber: '000123',
  chequeDate: new Date('2026-08-02T00:00:00.000Z'),
  beneficiaryName: 'مستفيد',
  amount: 100,
  currency: 'KWD' as const,
  bankAccountId: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  mp.bankAccount.findUnique.mockImplementation(async (args: any) => ACCOUNTS[args.where.id] ?? null);
  mp.cheque.findFirst.mockResolvedValue(null);
  mp.bank.findMany.mockResolvedValue([{ nameAr: 'بنك الخليج' }]);
  mp.cheque.create.mockImplementation(async (args: any) => ({ id: 500, ...args.data, bankAccount: null }));
  mp.cheque.update.mockImplementation(async (args: any) => ({ id: args.where.id, ...args.data, bankAccount: null }));
});

// ── هوية البنك ────────────────────────────────────────────────────────────────

describe('cheque creation is driven by the bank account', () => {
  it('derives bankName from the account bank — never from client input', async () => {
    await service.create({ ...VALID_CREATE, bankAccountId: 2 } as any, req);
    const data = mp.cheque.create.mock.calls[0][0].data;
    expect(data.bankAccountId).toBe(2);
    expect(data.bankName).toBe('بنك الكويت الوطني');
  });

  it('rejects a payload that carries no bank account at all', () => {
    const { bankAccountId: _omitted, ...withoutAccount } = VALID_CREATE;
    const parsed = createChequeSchema.safeParse({ body: { ...withoutAccount, chequeDate: '2026-08-02' } });
    expect(parsed.success).toBe(false);
  });

  it('ignores any bankName the client tries to send — it is not part of the contract', () => {
    const parsed = createChequeSchema.safeParse({
      body: { ...VALID_CREATE, chequeDate: '2026-08-02', bankName: 'بنك مزيّف' },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.body).not.toHaveProperty('bankName');
  });

  it('rejects an unknown bank account', async () => {
    await expect(service.create({ ...VALID_CREATE, bankAccountId: 99 } as any, req))
      .rejects.toThrow('الحساب البنكي غير موجود');
    expect(prisma.cheque.create).not.toHaveBeenCalled();
  });

  it('refuses to issue on a deactivated account, without touching its existing cheques', async () => {
    mp.bankAccount.findUnique.mockResolvedValue({ ...NBK_ACCOUNT, isActive: false });
    await expect(service.create({ ...VALID_CREATE, bankAccountId: 2 } as any, req)).rejects.toThrow(/موقوف/);
    expect(prisma.cheque.create).not.toHaveBeenCalled();
  });

  it('refuses to issue when the BANK itself is deactivated', async () => {
    mp.bankAccount.findUnique.mockResolvedValue({
      ...NBK_ACCOUNT,
      bank: { ...NBK_ACCOUNT.bank, isActive: false },
    });
    await expect(service.create({ ...VALID_CREATE, bankAccountId: 2 } as any, req)).rejects.toThrow(/موقوف/);
  });

  it('records the bank account in the audit trail', async () => {
    await service.create(VALID_CREATE as any, req);
    expect(vi.mocked(recordAudit).mock.calls[0][0]).toMatchObject({
      action: 'CREATE',
      module: 'cheques',
      newValue: expect.objectContaining({ bankAccountId: 1, bankAccount: 'بنك الخليج — الحساب الرئيسي' }),
    });
  });
});

// ── تفرّد رقم الشيك لكل حساب ─────────────────────────────────────────────────

describe('cheque number uniqueness is scoped to the bank account', () => {
  it('rejects the same number twice within the SAME account', async () => {
    mp.cheque.findFirst.mockResolvedValue(makeCheque({ id: 77, chequeNumber: '000123' }));
    await expect(service.create(VALID_CREATE as any, req)).rejects.toThrow(/مستخدم بالفعل في هذا الحساب البنكي/);
    expect(prisma.cheque.create).not.toHaveBeenCalled();
  });

  it('scopes the duplicate probe to the target account', async () => {
    await service.create({ ...VALID_CREATE, bankAccountId: 2 } as any, req);
    expect(mp.cheque.findFirst.mock.calls[0][0].where).toMatchObject({
      chequeNumber: '000123',
      bankAccountId: 2,
    });
  });

  it('ALLOWS the same number in two different accounts', async () => {
    // لا تكرار داخل الحساب الهدف — وهو ما يعنيه أن الرقم نفسه مشروع في بنك آخر.
    mp.cheque.findFirst.mockResolvedValue(null);
    await expect(service.create({ ...VALID_CREATE, bankAccountId: 2 } as any, req)).resolves.toBeTruthy();
    expect(prisma.cheque.create).toHaveBeenCalledTimes(1);
  });

  it('re-checks uniqueness in the TARGET account when a cheque moves accounts', async () => {
    mp.cheque.findUnique.mockResolvedValue(makeCheque({ bankAccountId: 1 }));
    mp.cheque.findFirst.mockResolvedValue(makeCheque({ id: 88, bankAccountId: 2 }));
    await expect(service.update(46, { bankAccountId: 2 } as any, req)).rejects.toThrow(/مستخدم بالفعل/);
    expect(prisma.cheque.update).not.toHaveBeenCalled();
  });

  it('probes legacy unlinked cheques as their own IS NULL scope', async () => {
    mp.cheque.findUnique.mockResolvedValue(makeCheque({ bankAccountId: null, bankName: 'بنك قديم' }));
    await service.update(46, { chequeNumber: '000999' } as any, req);
    expect(mp.cheque.findFirst.mock.calls[0][0].where).toMatchObject({
      chequeNumber: '000999',
      bankAccountId: null,
    });
  });
});

// ── الترقيم يدوي 100% ─────────────────────────────────────────────────────────

describe('cheque numbering stays manual', () => {
  it('stores exactly the number the user typed', async () => {
    await service.create({ ...VALID_CREATE, chequeNumber: '000777' } as any, req);
    expect(mp.cheque.create.mock.calls[0][0].data.chequeNumber).toBe('000777');
  });

  it('requires a number — nothing is generated when it is missing', () => {
    const { chequeNumber: _omitted, ...withoutNumber } = VALID_CREATE;
    const parsed = createChequeSchema.safeParse({ body: { ...withoutNumber, chequeDate: '2026-08-02' } });
    expect(parsed.success).toBe(false);
  });

  it('leaves the number untouched on a partial edit', async () => {
    const current = makeCheque();
    mp.cheque.findUnique.mockResolvedValue(current);
    await service.update(46, { notes: 'تعديل' } as any, req);
    expect(mp.cheque.update.mock.calls[0][0].data.chequeNumber).toBe(current.chequeNumber);
  });

  it('accepts a partial edit that names no bank account (legacy cheques are not guessed)', async () => {
    const parsed = updateChequeSchema.safeParse({ body: { notes: 'x' } });
    expect(parsed.success).toBe(true);
  });
});

// ── بوابة الطباعة ─────────────────────────────────────────────────────────────

describe('printing is blocked for an account with no approved print profile', () => {
  const printableMessage = /لم يتم إعداد قالب الطباعة/;

  it('blocks mark-printed for a new bank account', async () => {
    mp.cheque.findUnique.mockResolvedValue(makeCheque({ bankAccountId: 2, status: 'DRAFT' }));
    await expect(service.markPrinted(46, req)).rejects.toThrow(printableMessage);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('blocks reprint for a new bank account', async () => {
    mp.cheque.findUnique.mockResolvedValue(makeCheque({ bankAccountId: 2, status: 'PRINTED', printCount: 1 }));
    await expect(service.reprint(46, { reason: 'PAPER_JAM' } as any, req)).rejects.toThrow(printableMessage);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('names the account in the message so the user knows what to configure', async () => {
    mp.cheque.findUnique.mockResolvedValue(makeCheque({ bankAccountId: 2 }));
    await expect(service.markPrinted(46, req)).rejects.toThrow(/بنك الكويت الوطني — الحساب الجاري/);
  });

  it('ALLOWS Gulf Bank to print exactly as before — the regression contract', async () => {
    mp.cheque.findUnique.mockResolvedValue(makeCheque({ bankAccountId: 1, status: 'DRAFT' }));
    mp.$transaction.mockImplementation(async (fn: any) =>
      fn({
        cheque: { update: vi.fn().mockResolvedValue(makeCheque({ status: 'PRINTED' })), findUnique: vi.fn() },
        chequePrintLog: { create: vi.fn() },
      }));
    await expect(service.markPrinted(46, req)).resolves.toBeTruthy();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('leaves legacy unlinked cheques on their previous behaviour', async () => {
    mp.cheque.findUnique.mockResolvedValue(makeCheque({ bankAccountId: null, status: 'DRAFT' }));
    mp.$transaction.mockImplementation(async (fn: any) =>
      fn({
        cheque: { update: vi.fn().mockResolvedValue(makeCheque({ status: 'PRINTED' })), findUnique: vi.fn() },
        chequePrintLog: { create: vi.fn() },
      }));
    await expect(service.markPrinted(46, req)).resolves.toBeTruthy();
  });

  it('still allows SAVING and EDITING a cheque on an unprintable account', async () => {
    await expect(service.create({ ...VALID_CREATE, bankAccountId: 2 } as any, req)).resolves.toBeTruthy();

    mp.cheque.findUnique.mockResolvedValue(makeCheque({ bankAccountId: 2, bankName: 'بنك الكويت الوطني' }));
    await expect(service.update(46, { amount: 999 } as any, req)).resolves.toBeTruthy();
  });
});

// ── Legacy hardening gate ─────────────────────────────────────────────────────
//
// شيك قديم بلا `bankAccountId` لا يُطبع لمجرد غياب الحساب. العقد:
//   • بنكه النصي يطابق بنكًا له حساب بقالب معتمد ⇒ يُطبع بقالب بنكه هو.
//   • بنك Legacy مجهول ⇒ لا يُخمَّن ولا يُطبع بقالب بنك آخر.
// هذا يغلق المسار الذي كان يجعل شيك «بنك برقان» قديمًا يطبع بإحداثيات الخليج.

describe('legacy cheques with no bank account are not printable by default', () => {
  beforeEach(() => {
    // بنك الخليج وحده له حساب بقالب معتمد — كما في الإنتاج بعد الترحيل.
    mp.bank.findMany.mockResolvedValue([{ nameAr: 'بنك الخليج' }]);
  });

  it('ALLOWS a legacy Gulf cheque — its bank really is printable', async () => {
    mp.cheque.findUnique.mockResolvedValue(makeCheque({ bankAccountId: null, bankName: 'بنك الخليج', status: 'DRAFT' }));
    mp.$transaction.mockImplementation(async (fn: any) =>
      fn({
        cheque: { update: vi.fn().mockResolvedValue(makeCheque({ status: 'PRINTED' })), findUnique: vi.fn() },
        chequePrintLog: { create: vi.fn() },
      }));
    await expect(service.markPrinted(46, req)).resolves.toBeTruthy();
  });

  it('BLOCKS a legacy cheque of a bank that has no approved profile', async () => {
    mp.cheque.findUnique.mockResolvedValue(makeCheque({ bankAccountId: null, bankName: 'بنك برقان', status: 'DRAFT' }));
    await expect(service.markPrinted(46, req)).rejects.toThrow(/غير مرتبط بحساب بنكي/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('BLOCKS a legacy cheque whose bank name is unknown to the registry', async () => {
    mp.cheque.findUnique.mockResolvedValue(makeCheque({ bankAccountId: null, bankName: 'بنك مجهول', status: 'DRAFT' }));
    await expect(service.markPrinted(46, req)).rejects.toThrow(/بنك مجهول/);
  });

  it('BLOCKS reprint on the same rule', async () => {
    mp.cheque.findUnique.mockResolvedValue(makeCheque({ bankAccountId: null, bankName: 'بنك برقان', status: 'PRINTED', printCount: 1 }));
    await expect(service.reprint(46, { reason: 'PAPER_JAM' } as any, req)).rejects.toThrow(/غير مرتبط بحساب بنكي/);
  });

  it('marks an unlinked cheque of an unprintable bank as printEnabled=false in the list', async () => {
    mp.cheque.findMany.mockResolvedValue([
      { ...makeCheque({ bankAccountId: null, bankName: 'بنك برقان' }), bankAccount: null },
      { ...makeCheque({ id: 47, bankAccountId: null, bankName: 'بنك الخليج' }), bankAccount: null },
    ]);
    mp.cheque.count.mockResolvedValue(2);
    const result: any = await service.list({} as any);
    expect(result.data[0].printEnabled).toBe(false); // برقان — لا قالب
    expect(result.data[1].printEnabled).toBe(true);  // الخليج — قابل للطباعة
  });
});
