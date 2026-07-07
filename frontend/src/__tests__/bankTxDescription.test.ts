// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { describeTransaction } from '../pages/BankAccountExplorer';
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

describe('describeTransaction — display-only parser', () => {
  it('parses "Cheque Paid" keeping the cheque number on line 1 and the name on line 2', () => {
    const d = describeTransaction(tx({
      description: 'Cheque Paid - Cheque Number: 1, 03926182031583961 AHMAD FALAH NAIF HAJI, CIVIL ID, 293091900822, دفعة شيك',
      debit: 5550, credit: 0,
    }));
    expect(d.primary).toBe('Cheque Paid — Cheque Number: 1');
    expect(d.secondary).toBe('AHMAD FALAH NAIF HAJI');
  });

  it('parses "Inward Clearing Cheque" with the presented channel on line 2', () => {
    const d = describeTransaction(tx({ description: 'Inward Clearing Cheque 000096 Presented in 025', credit: 10500 }));
    expect(d.primary).toBe('Inward Clearing Cheque 000096');
    expect(d.secondary).toBe('Presented in 025');
  });

  it('parses "Bank Charges" into category + specific fee', () => {
    const d = describeTransaction(tx({ description: 'Bank Charges - Monthly Fee', debit: 2250, isBankFee: true }));
    expect(d.primary).toBe('Bank Charges');
    expect(d.secondary).toBe('Monthly Fee');
  });

  it('splits a mixed Latin/Arabic description into Latin (line 1) + Arabic (line 2)', () => {
    const d = describeTransaction(tx({ description: 'Transfer from Project 101 تحويل من مشروع 101', credit: 15800 }));
    expect(d.primary).toBe('Transfer from Project 101');
    expect(d.secondary).toBe('تحويل من مشروع 101');
  });

  it('falls back to a single line for a plain description with no extractable detail', () => {
    const d = describeTransaction(tx({ description: 'راتب يونيو' }));
    expect(d.primary).toBe('راتب يونيو');
    expect(d.secondary).toBeUndefined();
  });

  it('uses the reference as a last-resort detail when nothing else is extractable', () => {
    const d = describeTransaction(tx({ description: 'راتب يونيو', reference: 'REF-1' }));
    expect(d.primary).toBe('راتب يونيو');
    expect(d.secondary).toBe('REF-1');
  });

  it('never duplicates the reference already present in the description', () => {
    const d = describeTransaction(tx({ description: 'Salary REF-1', reference: 'REF-1' }));
    expect(d.secondary).not.toBe('REF-1');
  });

  it('falls back to the type label when the description is empty', () => {
    const d = describeTransaction(tx({ description: '   ', credit: 100 }));
    expect(d.primary).toBe('إيداع');
  });

  it('collapses whitespace and does not throw on odd input', () => {
    const d = describeTransaction(tx({ description: '   Bank   Charges   ' }));
    expect(d.primary).toBe('Bank Charges');
  });
});
