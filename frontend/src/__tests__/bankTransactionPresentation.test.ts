// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  presentTransaction, CONFIDENCE_LABELS,
} from '../pages/bankTransactionPresentation';
import type { TimelineTransaction, BankFeeType } from '../api/bankStatementImport';

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

// Detail must never introduce a digit sequence that is not present in the source.
function digitsIn(s: string): string[] {
  return s.match(/\d+/g) ?? [];
}

describe('Smart Transaction Presentation Engine — presentTransaction', () => {
  // 1) Every bankFeeType maps to an expected structured category label.
  it('maps every bankFeeType to a structured, high-confidence category label', () => {
    const expected: Record<BankFeeType, string> = {
      TRANSFER_FEE:    'رسوم تحويل',
      MONTHLY_FEE:     'رسوم شهرية',
      INTEREST:        'فائدة',
      CHARGE:          'رسوم بنكية',
      ATM_FEE:         'رسوم صراف آلي',
      CHEQUEBOOK_FEE:  'رسوم دفتر شيكات',
      OTHER_FEE:       'رسوم أخرى',
      CASH_WITHDRAWAL: 'سحب نقدي',
      CHEQUE_PAYMENT:  'دفع شيك',
      BANK_TRANSFER:   'تحويل بنكي',
    };
    for (const [type, label] of Object.entries(expected) as [BankFeeType, string][]) {
      const p = presentTransaction(tx({ bankFeeType: type, isBankFee: true, description: 'x', debit: 5 }));
      expect(p.category.label).toBe(label);
      expect(p.category.source).toBe('bankFeeType');
      expect(p.category.confidence).toBe('high');
    }
  });

  // 2) Null bankFeeType falls back to debit/credit direction.
  it('falls back to debit/credit direction when bankFeeType is null', () => {
    expect(presentTransaction(tx({ credit: 1500, description: 'Salary' })).category)
      .toMatchObject({ label: 'إيداع', source: 'direction', confidence: 'high' });
    expect(presentTransaction(tx({ debit: 300, description: 'Purchase' })).category)
      .toMatchObject({ label: 'سحب', source: 'direction', confidence: 'high' });
  });

  // 3) Cheque Paid → cheque number as a safe detail.
  it('extracts the cheque number from "Cheque Paid — Cheque Number: N"', () => {
    const p = presentTransaction(tx({
      description: 'Cheque Paid - Cheque Number: 1, 03926182031583961 AHMAD FALAH NAIF HAJI, CIVIL ID, 293091900822, دفعة شيك',
      debit: 5550,
    }));
    expect(p.category.label).toBe('دفع شيك');
    expect(p.detail?.kind).toBe('cheque');
    expect(p.detail?.text).toBe('شيك رقم 1');
  });

  // 4) Inward Clearing Cheque → number + channel; structured refinement of label.
  it('extracts inward-clearing number and presented-in channel', () => {
    const p = presentTransaction(tx({
      bankFeeType: 'CHEQUE_PAYMENT',
      description: 'Inward Clearing Cheque 000096 Presented in 025', credit: 10500,
    }));
    expect(p.category.label).toBe('شيك مقاصة وارد');
    expect(p.category.source).toBe('bankFeeType');
    expect(p.detail?.text).toBe('رقم 000096 · مقدَّم في 025');
  });

  // 5) Standalone "Presented in XXX" channel extraction.
  it('extracts a standalone presented-in channel as a detail', () => {
    const p = presentTransaction(tx({
      bankFeeType: 'CHEQUE_PAYMENT',
      description: 'Cheque payment Presented in 077', debit: 200,
    }));
    expect(p.detail?.kind).toBe('channel');
    expect(p.detail?.text).toBe('مقدَّم في 077');
  });

  // 6) Explicit structured reference field used as a detail.
  it('uses the explicit reference field as a safe detail', () => {
    const p = presentTransaction(tx({ description: 'راتب يونيو', reference: 'TT-99', credit: 500 }));
    expect(p.detail?.kind).toBe('reference');
    expect(p.detail?.text).toBe('مرجع TT-99');
  });

  // 7) Mixed Latin/Arabic → verbatim Arabic mirror as the detail.
  it('surfaces the verbatim Arabic mirror from a bilingual description', () => {
    const p = presentTransaction(tx({ description: 'Transfer from Project 101 تحويل من مشروع 101', credit: 15800 }));
    expect(p.detail?.kind).toBe('arabic');
    expect(p.detail?.text).toBe('تحويل من مشروع 101');
  });

  // 8) No duplication between the category and the detail.
  it('never duplicates the category label in the detail line', () => {
    const p = presentTransaction(tx({
      bankFeeType: 'MONTHLY_FEE', isBankFee: true,
      description: 'Bank Charges - Monthly Fee رسوم شهرية', debit: 2250,
    }));
    expect(p.category.label).toBe('رسوم شهرية');
    // The Arabic mirror equals the category → suppressed, not repeated.
    expect(p.detail).toBeUndefined();
  });

  // 9) No fabricated values — any digits shown come from the source text/fields.
  it('never shows a number that is absent from the source', () => {
    const samples = [
      tx({ description: 'Cheque Paid - Cheque Number: 42', debit: 10 }),
      tx({ description: 'Inward Clearing Cheque 000096 Presented in 025', credit: 5 }),
      tx({ description: 'Transfer from Project 7 تحويل من مشروع 7', credit: 9 }),
    ];
    for (const s of samples) {
      const p = presentTransaction(s);
      const source = `${p.raw} ${s.reference ?? ''} ${s.chequeNumber ?? ''}`;
      const shown = `${p.category.label} ${p.detail?.text ?? ''}`;
      for (const d of digitsIn(shown)) {
        expect(source).toContain(d);
      }
    }
  });

  // 10) Sensitive tokens (CIVIL ID, mobile, long instrument numbers, names) never promoted.
  it('does not promote CIVIL ID, mobile numbers, or names to the visible lines', () => {
    const p = presentTransaction(tx({
      description: 'Cheque Paid - Cheque Number: 1, 03926182031583961 AHMAD FALAH NAIF HAJI, CIVIL ID, 293091900822, Mobile 96512345678',
      debit: 5550,
    }));
    const shown = `${p.category.label} ${p.detail?.text ?? ''}`;
    expect(shown).not.toContain('293091900822');   // civil id
    expect(shown).not.toContain('03926182031583961'); // instrument no
    expect(shown).not.toContain('96512345678');     // mobile
    expect(shown).not.toMatch(/AHMAD|HAJI/);        // name
    expect(shown).not.toMatch(/\d{8,}/);            // no long digit run anywhere
  });

  // 11) Robustness — empty/whitespace/very long input never throws.
  it('handles empty, whitespace, and very long input without throwing', () => {
    expect(() => presentTransaction(tx({ description: '' }))).not.toThrow();
    expect(() => presentTransaction(tx({ description: '     ' }))).not.toThrow();
    expect(presentTransaction(tx({ description: '   ', credit: 100 })).category.label).toBe('إيداع');
    const long = 'Cheque Paid - Cheque Number: 5 ' + 'x'.repeat(2000);
    expect(() => presentTransaction(tx({ description: long, debit: 1 }))).not.toThrow();
  });

  // 12) Gulf Bank description-only behavior (no structured reference/cheque columns).
  it('works from the description alone for Gulf Bank rows (null structured fields)', () => {
    const p = presentTransaction(tx({
      bankName: 'GULF_BANK', bankFeeType: null, reference: null, chequeNumber: null,
      description: 'Inward Clearing Cheque 000096 Presented in 025', credit: 10500,
    }));
    expect(p.category.label).toBe('شيك مقاصة وارد');
    expect(p.category.source).toBe('text');
    expect(p.detail?.text).toBe('رقم 000096 · مقدَّم في 025');
  });

  // 13) Structured bankFeeType beats misleading raw text.
  it('trusts structured bankFeeType over misleading description prose', () => {
    const p = presentTransaction(tx({
      bankFeeType: 'MONTHLY_FEE', isBankFee: true,
      description: 'Salary payment to employee', debit: 2250,
    }));
    expect(p.category.label).toBe('رسوم شهرية');
    expect(p.category.source).toBe('bankFeeType');
  });

  // Provenance + confidence labels are populated for the Audit tab.
  it('populates provenance and confidence labels', () => {
    const p = presentTransaction(tx({ bankFeeType: 'BANK_TRANSFER', description: 'Outgoing RTGS', debit: 100 }));
    expect(p.provenance.rule).toContain('bankFeeType:BANK_TRANSFER');
    expect(p.raw).toBe('Outgoing RTGS');
    expect(CONFIDENCE_LABELS.high).toBe('عالية');
    expect(CONFIDENCE_LABELS.medium).toBe('متوسطة');
    expect(CONFIDENCE_LABELS.low).toBe('منخفضة');
  });
});
