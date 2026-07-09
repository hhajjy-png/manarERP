import { describe, it, expect } from 'vitest';
import { nbkSalaryXlsProfile, deriveBeneficiaryBank } from '../profiles/nbkSalaryXlsProfile';
import type { PayrollExportSource } from '../types';

function src(over: Partial<PayrollExportSource> = {}): PayrollExportSource {
  return {
    employeeCode: 'EMP-1', fullName: 'محمد علي', fullNameEn: 'Mohammed Ali',
    civilId: '290010112345', bankAccount: '1234567890', netSalary: 300, ...over,
  };
}

describe('nbkSalaryXlsProfile — structure & format', () => {
  it('is the NBK profile: id, KWD currency, 3-decimal amounts, .xls extension', () => {
    expect(nbkSalaryXlsProfile.id).toBe('nbk_salary_xls');
    expect(nbkSalaryXlsProfile.currency).toBe('KWD');
    expect(nbkSalaryXlsProfile.amountDecimals).toBe(3);
    expect(nbkSalaryXlsProfile.fileExtension).toBe('xls');
  });

  it('produces exactly two sheets in the bank order: Salary Details, then Bank Codes', () => {
    const r = nbkSalaryXlsProfile.build([src()], 5, 2026);
    expect(r.sheets.map((s) => s.name)).toEqual(['Salary Details', 'Bank Codes']);
  });

  it('Salary Details columns match the template headers/order exactly', () => {
    const r = nbkSalaryXlsProfile.build([src()], 5, 2026);
    expect(r.sheets[0].columns.map((c) => c.header)).toEqual([
      'Payment Serial Number',
      'Beneficiary Name',
      'Beneficiary Civil Id',
      'Account # for NBK A/C & IBAN for other Bank',
      "Beneficiary Bank (Refer next sheet 'Bank Codes' for list of Banks)",
      'Payment Currency (only KWD)',
      'Payment Amount',
    ]);
    // Civil Id carries the template's integer format; amount stays General (no forced numFmt).
    expect(r.sheets[0].columns.find((c) => c.key === 'civilId')?.numFmt).toBe('0');
    expect(r.sheets[0].columns.find((c) => c.key === 'amount')?.numFmt).toBeUndefined();
    // Template column widths are preserved.
    expect(r.sheets[0].widthsWch).toEqual([14.5, 44.21, 20.07, 35.07, 24.93, 17.79, 16.21]);
  });

  it('maps a row: serial, English name, NUMERIC civil id + account, bank CODE, KWD, numeric amount', () => {
    const r = nbkSalaryXlsProfile.build([src({ netSalary: 300 })], 5, 2026);
    expect(r.sheets[0].rows[0]).toMatchObject({
      serial: 1, name: 'Mohammed Ali', civilId: 290010112345,
      account: 1234567890, bank: 'NBK', currency: 'KWD', amount: 300,
    });
    // Civil Id and NBK account are numbers (matching the template cell type).
    expect(typeof r.sheets[0].rows[0].civilId).toBe('number');
    expect(typeof r.sheets[0].rows[0].account).toBe('number');
  });

  it('keeps an IBAN account as a string (letters) rather than a number', () => {
    const r = nbkSalaryXlsProfile.build([src({ bankAccount: 'KW00GULB0000000000001234561000' })], 5, 2026);
    expect(r.sheets[0].rows[0].account).toBe('KW00GULB0000000000001234561000');
    expect(r.sheets[0].rows[0].bank).toBe('GBK'); // template bank code
  });

  it('rounds Payment Amount to 3 decimals (KWD)', () => {
    const r = nbkSalaryXlsProfile.build([src({ netSalary: 300.12349 })], 5, 2026);
    expect(r.sheets[0].rows[0].amount).toBe(300.123);
  });

  it('summary total equals the sum of the exported (3dp) amounts', () => {
    const r = nbkSalaryXlsProfile.build(
      [src({ employeeCode: 'A', netSalary: 300.005 }), src({ employeeCode: 'B', netSalary: 199.995 })],
      5, 2026,
    );
    expect(r.summary.employeeCount).toBe(2);
    expect(r.summary.totalAmount).toBe(500);
    const rowsTotal = r.sheets[0].rows.reduce((s, row) => s + Number(row.amount), 0);
    expect(Math.round(rowsTotal * 1000) / 1000).toBe(r.summary.totalAmount);
  });

  it('derives the template Beneficiary Bank CODE from a Kuwaiti IBAN, else NBK', () => {
    expect(deriveBeneficiaryBank('KW81NBOK0000000000001234561000')).toBe('NBK');
    expect(deriveBeneficiaryBank('KW00GULB0000000000001234561000')).toBe('GBK');
    expect(deriveBeneficiaryBank('KW00KFHO0000000000001234561000')).toBe('KFH');
    expect(deriveBeneficiaryBank('1234567890')).toBe('NBK');                 // plain account → NBK
    expect(deriveBeneficiaryBank('KW00ZZZZ0000000000001234561000')).toBe('NBK'); // unknown IBAN → NBK
  });

  it('Bank Codes sheet reproduces the template list exactly (25 rows, NBK first with trailing space)', () => {
    const r = nbkSalaryXlsProfile.build([src()], 5, 2026);
    const bc = r.sheets[1];
    expect(bc.name).toBe('Bank Codes');
    expect(bc.columns.map((c) => c.header)).toEqual(['Bank Code', 'Bank Name']);
    expect(bc.rows).toHaveLength(25);
    expect(bc.rows[0]).toEqual({ code: 'NBK', name: 'NBK-National Bank of Kuwait ' });
    expect(bc.rows).toContainEqual({ code: 'GBK', name: 'GBK-Gulf Bank' });
    expect(bc.rows).toContainEqual({ code: 'KFH', name: 'KFH-Kuwait Finance House' });
    expect(bc.widthsWch).toEqual([35.93, 52.5]);
  });
});

describe('nbkSalaryXlsProfile — validation blocks export', () => {
  it('valid=true only with rows and zero errors', () => {
    expect(nbkSalaryXlsProfile.build([src()], 5, 2026).valid).toBe(true);
    expect(nbkSalaryXlsProfile.build([], 5, 2026).valid).toBe(false); // empty month
  });

  it('missing civil id → error, not valid', () => {
    const r = nbkSalaryXlsProfile.build([src({ civilId: null })], 5, 2026);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.field === 'civilId')).toBe(true);
  });

  it('missing account/IBAN → error, not valid', () => {
    const r = nbkSalaryXlsProfile.build([src({ bankAccount: '  ' })], 5, 2026);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.field === 'account')).toBe(true);
  });

  it('zero or negative amount → error, not valid', () => {
    expect(nbkSalaryXlsProfile.build([src({ netSalary: 0 })], 5, 2026).errors.some((e) => e.field === 'amount')).toBe(true);
    expect(nbkSalaryXlsProfile.build([src({ netSalary: -5 })], 5, 2026).errors.some((e) => e.field === 'amount')).toBe(true);
  });
});

describe('nbkSalaryXlsProfile — Beneficiary Name is ENGLISH-ONLY', () => {
  it('uses the English name when available', () => {
    const r = nbkSalaryXlsProfile.build([src({ fullNameEn: 'Mohammed Ali', fullName: 'محمد علي' })], 5, 2026);
    expect(r.valid).toBe(true);
    expect(r.sheets[0].rows[0].name).toBe('Mohammed Ali');
  });

  it('does NOT fall back to the Arabic name — a missing English name BLOCKS the export', () => {
    const r = nbkSalaryXlsProfile.build([src({ fullNameEn: null, fullName: 'محمد علي' })], 5, 2026);
    expect(r.valid).toBe(false);
    const nameErr = r.errors.find((e) => e.field === 'name');
    expect(nameErr).toBeDefined();
    expect(nameErr?.message).toContain('اسم الموظف الإنجليزي مطلوب للتصدير البنكي NBK');
    // The Arabic name is NEVER placed in the exported Beneficiary Name cell.
    expect(r.sheets[0].rows[0].name).not.toBe('محمد علي');
    expect(r.sheets[0].rows[0].name).toBe('');
  });

  it('a whitespace-only English name is treated as missing (blocks)', () => {
    const r = nbkSalaryXlsProfile.build([src({ fullNameEn: '   ', fullName: 'محمد علي' })], 5, 2026);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.field === 'name')).toBe(true);
  });

  it('no Arabic characters ever appear in an exported Beneficiary Name', () => {
    const r = nbkSalaryXlsProfile.build([
      src({ employeeCode: 'A', fullNameEn: 'John Smith', fullName: 'جون سميث' }),
      src({ employeeCode: 'B', fullNameEn: 'Ali Hassan', fullName: 'علي حسن' }),
    ], 5, 2026);
    expect(r.valid).toBe(true);
    for (const row of r.sheets[0].rows) {
      expect(/[؀-ۿ]/.test(String(row.name))).toBe(false);
    }
  });
});
