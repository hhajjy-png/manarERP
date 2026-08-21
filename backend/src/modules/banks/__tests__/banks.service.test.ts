import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BanksService, bankAccountLabel } from '../banks.service';
import { createBankSchema, createBankAccountSchema, updateBankSchema } from '../banks.schema';

/**
 * سجل البنوك والحسابات — Multi-Bank Cheques Foundation v1.
 *
 * ما تثبته هذه المجموعة:
 *   • العرض للمستخدم هو «اسم البنك — اسم الحساب» فقط، بلا رقم حساب ولا IBAN.
 *   • `printProfileKey` لا يُقبَل من الـAPI ولا يُسرَّب في المخرجات — يُختزل إلى
 *     راية `printEnabled` فقط.
 *   • `code` معرّف داخلي غير عربي، وغير قابل للتعديل بعد الإنشاء.
 *   • تقرير الشيكات غير المربوطة يُخرِج القيم كما هي بلا تخمين.
 */

vi.mock('../../../config/database', () => ({
  prisma: {
    bank: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    bankAccount: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    cheque: { groupBy: vi.fn() },
  },
}));

vi.mock('../../../core/middleware/audit', () => ({ recordAudit: vi.fn() }));

import { prisma } from '../../../config/database';
import { recordAudit } from '../../../core/middleware/audit';

const mp = prisma as any;
const req = { user: { userId: 3, username: 'manager' } } as any;
const service = new BanksService();

const GULF_BANK = { id: 1, code: 'GULF_BANK', nameAr: 'بنك الخليج', nameEn: 'Gulf Bank', isActive: true };

function makeAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    bankId: 1,
    accountName: 'الحساب الرئيسي',
    isActive: true,
    statementAccountKey: null,
    printProfileKey: 'CLASSIC_GULF_V1',
    bank: GULF_BANK,
    ...overrides,
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mp.bank.findUnique.mockResolvedValue(GULF_BANK);
  mp.bankAccount.findUnique.mockResolvedValue(null);
});

// ── العرض ─────────────────────────────────────────────────────────────────────

describe('bank account presentation', () => {
  it('labels an account as "bank — account", nothing more', () => {
    expect(bankAccountLabel('بنك الخليج', 'الحساب الرئيسي')).toBe('بنك الخليج — الحساب الرئيسي');
  });

  it('never exposes an account number, IBAN or the raw print profile key', async () => {
    mp.bankAccount.findMany.mockResolvedValue([makeAccount()]);
    const [account] = await service.listAccounts();
    expect(account).not.toHaveProperty('accountNumber');
    expect(account).not.toHaveProperty('iban');
    expect(account).not.toHaveProperty('printProfileKey');
    expect(account.label).toBe('بنك الخليج — الحساب الرئيسي');
  });

  it('reduces the print profile to a boolean the UI can gate on', async () => {
    mp.bankAccount.findMany.mockResolvedValue([
      makeAccount({ id: 1, printProfileKey: 'CLASSIC_GULF_V1' }),
      makeAccount({ id: 2, accountName: 'حساب جديد', printProfileKey: null }),
    ]);
    const accounts = await service.listAccounts();
    expect(accounts.map((a) => a.printEnabled)).toEqual([true, false]);
  });

  it('treats an account of a deactivated bank as inactive', async () => {
    mp.bankAccount.findMany.mockResolvedValue([
      makeAccount({ isActive: true, bank: { ...GULF_BANK, isActive: false } }),
    ]);
    const [account] = await service.listAccounts();
    expect(account.isActive).toBe(false);
  });

  it('filters to issuable accounts when the cheque form asks for active ones', async () => {
    mp.bankAccount.findMany.mockResolvedValue([]);
    await service.listAccounts({ activeOnly: true });
    expect(mp.bankAccount.findMany.mock.calls[0][0].where).toEqual({
      isActive: true,
      bank: { isActive: true },
    });
  });
});

// ── العقد ─────────────────────────────────────────────────────────────────────

describe('the API contract keeps print profiles out of reach', () => {
  it('drops printProfileKey from a bank-account create payload', () => {
    const parsed = createBankAccountSchema.safeParse({
      body: { bankId: 1, accountName: 'حساب جديد', printProfileKey: 'CLASSIC_GULF_V1' },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.body).not.toHaveProperty('printProfileKey');
  });

  it('creates a new account with no print profile at all', async () => {
    mp.bankAccount.create.mockResolvedValue(makeAccount({ id: 2, accountName: 'حساب جديد', printProfileKey: null }));
    const account = await service.createAccount({ bankId: 1, accountName: 'حساب جديد' } as any, req);
    expect(mp.bankAccount.create.mock.calls[0][0].data).not.toHaveProperty('printProfileKey');
    expect(account.printEnabled).toBe(false);
  });

  it('rejects an Arabic bank code — the internal id must not depend on the display name', () => {
    expect(createBankSchema.safeParse({ body: { code: 'بنك', nameAr: 'بنك' } }).success).toBe(false);
    expect(createBankSchema.safeParse({ body: { code: 'lowercase', nameAr: 'بنك' } }).success).toBe(false);
    expect(createBankSchema.safeParse({ body: { code: 'NEW_BANK', nameAr: 'بنك جديد' } }).success).toBe(true);
  });

  it('does not accept a code change on update — the anchor is immutable', () => {
    const parsed = updateBankSchema.safeParse({ body: { code: 'OTHER', nameAr: 'اسم جديد' } });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.body).not.toHaveProperty('code');
  });
});

// ── القيود والتدقيق ───────────────────────────────────────────────────────────

describe('registry integrity and audit', () => {
  it('rejects a duplicate bank code', async () => {
    await expect(service.createBank({ code: 'GULF_BANK', nameAr: 'مكرر' } as any, req))
      .rejects.toThrow(/مستخدم بالفعل/);
  });

  it('rejects two accounts with the same name under one bank', async () => {
    mp.bankAccount.findUnique.mockResolvedValue(makeAccount());
    await expect(service.createAccount({ bankId: 1, accountName: 'الحساب الرئيسي' } as any, req))
      .rejects.toThrow(/يوجد حساب باسم/);
  });

  it('rejects an account under an unknown bank', async () => {
    mp.bank.findUnique.mockResolvedValue(null);
    await expect(service.createAccount({ bankId: 99, accountName: 'حساب' } as any, req))
      .rejects.toThrow('البنك غير موجود');
  });

  it('audits bank creation', async () => {
    mp.bank.findUnique.mockResolvedValue(null);
    mp.bank.create.mockResolvedValue({ ...GULF_BANK, id: 11, code: 'NEW_BANK', nameAr: 'بنك جديد' });
    await service.createBank({ code: 'NEW_BANK', nameAr: 'بنك جديد' } as any, req);
    expect(vi.mocked(recordAudit).mock.calls[0][0]).toMatchObject({ action: 'CREATE', module: 'banks' });
  });

  it('audits deactivation under its own action, not a generic UPDATE', async () => {
    mp.bank.update.mockResolvedValue({ ...GULF_BANK, isActive: false });
    await service.updateBank(1, { isActive: false } as any, req);
    expect(vi.mocked(recordAudit).mock.calls[0][0]).toMatchObject({ action: 'DEACTIVATE', module: 'banks' });
  });

  it('audits reactivation as ACTIVATE', async () => {
    mp.bank.findUnique.mockResolvedValue({ ...GULF_BANK, isActive: false });
    mp.bank.update.mockResolvedValue({ ...GULF_BANK, isActive: true });
    await service.updateBank(1, { isActive: true } as any, req);
    expect(vi.mocked(recordAudit).mock.calls[0][0]).toMatchObject({ action: 'ACTIVATE' });
  });

  it('audits an account rename as a plain UPDATE', async () => {
    mp.bankAccount.findUnique.mockResolvedValueOnce(makeAccount()).mockResolvedValueOnce(null);
    mp.bankAccount.update.mockResolvedValue(makeAccount({ accountName: 'اسم جديد' }));
    await service.updateAccount(1, { accountName: 'اسم جديد' } as any, req);
    expect(vi.mocked(recordAudit).mock.calls[0][0]).toMatchObject({ action: 'UPDATE', module: 'banks' });
  });

  it('exposes no delete path at all', () => {
    expect((service as any).deleteBank).toBeUndefined();
    expect((service as any).deleteAccount).toBeUndefined();
  });
});

// ── تقرير سلامة الترحيل ───────────────────────────────────────────────────────

describe('unlinked cheques report', () => {
  it('reports legacy bank names verbatim without guessing an account', async () => {
    mp.cheque.groupBy.mockResolvedValue([
      { bankName: 'بنك مجهول', _count: { _all: 3 } },
      { bankName: 'Gulf Bank', _count: { _all: 1 } },
    ]);
    const report = await service.unlinkedChequesReport();
    expect(report.total).toBe(4);
    expect(report.groups).toEqual([
      { bankName: 'بنك مجهول', count: 3 },
      { bankName: 'Gulf Bank', count: 1 },
    ]);
  });

  it('reports nothing to decide on a fully migrated database', async () => {
    mp.cheque.groupBy.mockResolvedValue([]);
    const report = await service.unlinkedChequesReport();
    expect(report).toEqual({ total: 0, groups: [] });
  });

  it('only looks at cheques with no bank account', async () => {
    mp.cheque.groupBy.mockResolvedValue([]);
    await service.unlinkedChequesReport();
    expect(mp.cheque.groupBy.mock.calls[0][0].where).toEqual({ bankAccountId: null });
  });
});
