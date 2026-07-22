// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { buildTransactionIntelligence } from '../pages/bankTransactionIntelligence';
import type { TimelineTransaction } from '../api/bankStatementImport';

function tx(over: Partial<TimelineTransaction> = {}): TimelineTransaction {
  return {
    id: 1, importId: 9, importBatchLabel: 'Import #9', fileName: 'jun.csv',
    importedAt: '2026-06-01T00:00:00.000Z', bankName: 'GULF_BANK', accountKey: 'A',
    statementDate: '2026-06-10', postingDate: null, description: '',
    reference: null, debit: 0, credit: 0, balance: 5000, currency: 'KWD',
    chequeNumber: null, reconcileStatus: 'UNMATCHED', matchedType: null, matchedRef: null,
    isDuplicate: false, isBankFee: false, bankFeeType: null, transactionFingerprint: 'abc',
    ...over,
  };
}

describe('Bank Transaction Intelligence Engine v2 — buildTransactionIntelligence', () => {
  it('resolves incoming cheque clearing: direction, presentation type, rich title and summary', () => {
    const m = buildTransactionIntelligence(tx({
      bankFeeType: 'CHEQUE_PAYMENT',
      description: 'Inward Clearing Cheque 000096 Presented in 025', credit: 10500,
    }));
    expect(m.chequeNumber).toBe('000096');
    expect(m.presentedBranch).toBe('025');
    expect(m.chequeDirection).toBe('incoming');
    expect(m.chequePresentationType).toBe('clearing');
    expect(m.title).toBe('شيك وارد للمقاصة');
    expect(m.summary).toBe('شيك رقم 000096 تم تقديمه للمقاصة عبر فرع 025.');
  });

  it('resolves outgoing cheque clearing from the structured cheque-number field, without a branch', () => {
    const m = buildTransactionIntelligence(tx({
      bankFeeType: 'CHEQUE_PAYMENT', chequeNumber: '4521',
      description: 'Outgoing Clearing Cheque', debit: 500,
    }));
    expect(m.chequeNumber).toBe('4521');
    expect(m.chequeDirection).toBe('outgoing');
    expect(m.chequePresentationType).toBe('clearing');
    expect(m.title).toBe('شيك صادر للمقاصة');
    expect(m.summary).toBe('شيك رقم 4521 تم تقديمه للمقاصة.');
  });

  it('detects a returned cheque independently of clearing direction', () => {
    const m = buildTransactionIntelligence(tx({
      description: 'Cheque Returned - Insufficient Funds', debit: 100,
    }));
    expect(m.chequeDirection).toBeUndefined();
    expect(m.chequePresentationType).toBe('returned');
    expect(m.title).toBe('شيك مرتجع');
  });

  it('extracts an ATM ID via a strict labelled anchor and generates the amount-aware ATM-withdrawal summary', () => {
    const m = buildTransactionIntelligence(tx({
      description: 'ATM Withdrawal ATM ID: 004521', debit: 20,
    }));
    expect(m.atmId).toBe('004521');
    expect(m.channel).toBe('atm');
    expect(m.title).toBe('سحب نقدي عبر جهاز الصراف');
    expect(m.summary).toBe('تم سحب 20.000 KWD عبر جهاز الصراف.');
  });

  it('extracts a device ID via the relaxed no-separator numeric fallback ("ATM 004521")', () => {
    const m = buildTransactionIntelligence(tx({
      description: 'ATM 004521 Cash Withdrawal', debit: 20,
    }));
    expect(m.atmId).toBe('004521');
  });

  it('never extracts an ATM ID when no digit run immediately follows the label (guards the relaxed fallback)', () => {
    const m = buildTransactionIntelligence(tx({
      description: 'ATM Withdrawal successful', debit: 5,
    }));
    expect(m.atmId).toBeUndefined();
  });

  it('resolves a cash deposit made via ATM: rich title + amount-aware ATM-deposit summary', () => {
    const m = buildTransactionIntelligence(tx({
      description: 'Cash Deposit via ATM', credit: 50,
    }));
    expect(m.channel).toBe('atm');
    expect(m.title).toBe('إيداع نقدي');
    expect(m.summary).toBe('تم إيداع 50.000 KWD عبر جهاز الصراف.');
  });

  it('generates a plain amount-based withdrawal summary when no other signal applies', () => {
    const m = buildTransactionIntelligence(tx({
      description: 'Misc withdrawal', debit: 4670,
    }));
    expect(m.summary).toBe('تم سحب 4,670.000 KWD.');
  });

  it('generates a plain amount-based deposit summary when no other signal applies', () => {
    const m = buildTransactionIntelligence(tx({
      description: 'Salary payment', credit: 15459,
    }));
    expect(m.summary).toBe('تم إيداع مبلغ 15,459.000 KWD.');
  });

  it('detects an internal transfer keyword and extracts both accounts via the relaxed fallback', () => {
    const m = buildTransactionIntelligence(tx({
      description: 'Internal Transfer From A/C 001 To A/C 002', debit: 300,
    }));
    expect(m.title).toBe('تحويل داخلي');
    expect(m.sourceAccount).toBe('001');
    expect(m.destinationAccount).toBe('002');
    expect(m.summary).toBe('تحويل داخلي بين الحسابات.');
  });

  it('extracts a counterparty name and generates a "transfer from" summary for a credit', () => {
    const m = buildTransactionIntelligence(tx({
      description: 'Bank Transfer Beneficiary: Ali Trading Co', credit: 1000,
    }));
    expect(m.counterparty).toBe('Ali Trading Co');
    expect(m.summary).toBe('تحويل بنكي من Ali Trading Co.');
  });

  it('never fabricates a structured field when no anchored signal exists (the amount-based summary is not fabrication — debit/credit are always genuine)', () => {
    const m = buildTransactionIntelligence(tx({
      description: 'Miscellaneous adjustment 12345', debit: 10,
    }));
    expect(m.chequeNumber).toBeUndefined();
    expect(m.chequeDirection).toBeUndefined();
    expect(m.atmId).toBeUndefined();
    expect(m.counterparty).toBeUndefined();
    expect(m.summary).toBe('تم سحب 10.000 KWD.');
  });

  it('produces no summary at all for the true edge case of a zero-amount transaction', () => {
    const m = buildTransactionIntelligence(tx({ description: 'Zero-amount marker', debit: 0, credit: 0 }));
    expect(m.summary).toBeUndefined();
  });

  it('handles empty, whitespace, and very long descriptions without throwing', () => {
    expect(() => buildTransactionIntelligence(tx({ description: '' }))).not.toThrow();
    expect(() => buildTransactionIntelligence(tx({ description: '   ' }))).not.toThrow();
    const long = 'ATM ID: 1234 ' + 'x'.repeat(2000);
    expect(() => buildTransactionIntelligence(tx({ description: long, debit: 1 }))).not.toThrow();
  });
});
