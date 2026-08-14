import { describe, it, expect } from 'vitest';
import { nbkEntitlementsXlsProfile } from '../profiles/nbkEntitlementsXlsProfile';
import { nbkSalaryXlsProfile } from '../../payrollBankExport/profiles/nbkSalaryXlsProfile';
import type { BankTransferSource } from '../../../shared/services/bankExport/types';
import type { PayrollExportSource } from '../../payrollBankExport/types';

/* ════════════════════════════════════════════════════════════════════════════
   عقد ملف المستحقات البنكي: **نفس صيغة البنك حرفيًا**.

   الملف المقبول من البنك واحد لا اثنان. الكشفان يختلفان في مصدر المبلغ وفي اسم
   الملف فقط؛ أي فرق في الأوراق أو الأعمدة أو ترتيبها أو أنواع الخلايا يعني ملفًا
   قد يرفضه البنك. هذه الاختبارات تقارن الكشفين عمودًا بعمود بدل الاكتفاء بوصفهما.
   ════════════════════════════════════════════════════════════════════════════ */

function ent(over: Partial<BankTransferSource> = {}): BankTransferSource {
  return {
    employeeCode: 'EMP-1', fullName: 'محمد علي', fullNameEn: 'Mohammed Ali',
    civilId: '290010112345', bankAccount: '1234567890', amount: 200, ...over,
  };
}
function sal(over: Partial<PayrollExportSource> = {}): PayrollExportSource {
  return {
    employeeCode: 'EMP-1', fullName: 'محمد علي', fullNameEn: 'Mohammed Ali',
    civilId: '290010112345', bankAccount: '1234567890', netSalary: 200, ...over,
  };
}

describe('nbkEntitlementsXlsProfile — identity & format', () => {
  it('is its own profile, distinct from the salary profile', () => {
    expect(nbkEntitlementsXlsProfile.id).toBe('nbk_entitlements_xls');
    expect(nbkEntitlementsXlsProfile.id).not.toBe(nbkSalaryXlsProfile.id);
    expect(nbkEntitlementsXlsProfile.label).not.toBe(nbkSalaryXlsProfile.label);
  });

  it('is KWD with 3-decimal amounts and a .xls extension', () => {
    expect(nbkEntitlementsXlsProfile.currency).toBe('KWD');
    expect(nbkEntitlementsXlsProfile.amountDecimals).toBe(3);
    expect(nbkEntitlementsXlsProfile.fileExtension).toBe('xls');
  });

  it('produces the SAME sheets, in the same bank order, as the salary file', () => {
    const e = nbkEntitlementsXlsProfile.build([ent()], 8, 2026);
    const s = nbkSalaryXlsProfile.build([sal()], 8, 2026);
    expect(e.sheets.map((x) => x.name)).toEqual(['Salary Details', 'Bank Codes']);
    expect(e.sheets.map((x) => x.name)).toEqual(s.sheets.map((x) => x.name));
  });

  it('produces byte-for-byte identical columns, formats and widths to the salary file', () => {
    const e = nbkEntitlementsXlsProfile.build([ent()], 8, 2026);
    const s = nbkSalaryXlsProfile.build([sal()], 8, 2026);
    expect(e.sheets[0].columns).toEqual(s.sheets[0].columns);
    expect(e.sheets[0].widthsWch).toEqual(s.sheets[0].widthsWch);
    expect(e.sheets[1].columns).toEqual(s.sheets[1].columns);
    expect(e.sheets[1].rows).toEqual(s.sheets[1].rows); // the whole Bank Codes reference list
  });

  it('maps a row exactly like the salary file does for the same amount', () => {
    const e = nbkEntitlementsXlsProfile.build([ent({ amount: 200 })], 8, 2026);
    const s = nbkSalaryXlsProfile.build([sal({ netSalary: 200 })], 8, 2026);
    expect(e.sheets[0].rows[0]).toEqual(s.sheets[0].rows[0]);
    expect(e.sheets[0].rows[0]).toMatchObject({
      serial: 1, name: 'Mohammed Ali', civilId: 290010112345,
      account: 1234567890, bank: 'NBK', currency: 'KWD', amount: 200,
    });
  });

  it('keeps an IBAN account as text and derives the same bank code', () => {
    const r = nbkEntitlementsXlsProfile.build([ent({ bankAccount: 'KW00GULB0000000000001234561000' })], 8, 2026);
    expect(r.sheets[0].rows[0].account).toBe('KW00GULB0000000000001234561000');
    expect(r.sheets[0].rows[0].bank).toBe('GBK');
  });

  it('rounds the transfer amount to 3 decimals (KWD)', () => {
    const r = nbkEntitlementsXlsProfile.build([ent({ amount: 200.00049 }), ent({ employeeCode: 'EMP-2', amount: 0.0005 })], 8, 2026);
    expect(r.sheets[0].rows[0].amount).toBe(200);
    expect(r.sheets[0].rows[1].amount).toBe(0.001);
    expect(r.summary.totalAmount).toBe(200.001);
  });
});

describe('nbkEntitlementsXlsProfile — validation matches the salary statement', () => {
  it('blocks a missing English name, civil id, or bank account — same rules as salary', () => {
    const r = nbkEntitlementsXlsProfile.build([ent({ fullNameEn: null, civilId: null, bankAccount: null })], 8, 2026);
    expect(r.valid).toBe(false);
    expect(r.errors.map((x) => x.field).sort()).toEqual(['account', 'civilId', 'name']);
    // The Arabic name is NEVER written to the file, even as a fallback.
    expect(r.sheets[0].rows[0].name).toBe('');
  });

  it('blocks a zero or negative transfer amount — nothing is exported', () => {
    for (const amount of [0, -0.001, -50]) {
      const r = nbkEntitlementsXlsProfile.build([ent({ amount })], 8, 2026);
      expect(r.valid).toBe(false);
      expect(r.errors.some((x) => x.field === 'amount')).toBe(true);
    }
  });

  it('says «المستحقات», not «الراتب», when the amount blocker fires', () => {
    const e = nbkEntitlementsXlsProfile.build([ent({ amount: 0 })], 8, 2026);
    const s = nbkSalaryXlsProfile.build([sal({ netSalary: 0 })], 8, 2026);
    expect(e.errors.find((x) => x.field === 'amount')?.message).toContain('المستحقات');
    expect(s.errors.find((x) => x.field === 'amount')?.message).toContain('الراتب');
  });

  it('an empty statement is not valid (no rows ⇒ no file)', () => {
    const r = nbkEntitlementsXlsProfile.build([], 8, 2026);
    expect(r.valid).toBe(false);
    expect(r.summary.employeeCount).toBe(0);
  });

  it('sums several employees correctly', () => {
    const r = nbkEntitlementsXlsProfile.build(
      [ent({ amount: 200 }), ent({ employeeCode: 'EMP-2', amount: 125.5 }), ent({ employeeCode: 'EMP-3', amount: 74.25 })],
      8, 2026,
    );
    expect(r.valid).toBe(true);
    expect(r.summary.employeeCount).toBe(3);
    expect(r.summary.totalAmount).toBe(399.75);
    expect(r.sheets[0].rows.map((x) => x.serial)).toEqual([1, 2, 3]);
  });
});
