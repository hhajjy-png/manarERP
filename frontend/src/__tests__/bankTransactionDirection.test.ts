/* Bank Account Explorer — Transaction Direction Logic
   يثبّت القاعدة: «النوع» يُشتق من الأثر المالي الحقيقي (دائن − مدين) فقط،
   ولا يتأثر إطلاقًا بنوع المستند (شيك/حوالة/رسوم/قيد). */
import { describe, it, expect } from 'vitest';
import {
  txDirection, txDirectionLabel, txSignedImpact, txDirectionView,
} from '../pages/bankTransactionDirection';
import type { TimelineTransaction } from '../api/bankStatementImport';

function tx(over: Partial<TimelineTransaction> = {}): TimelineTransaction {
  return {
    id: 1, importId: 1, importBatchLabel: 'B1', fileName: 'f.xlsx', importedAt: '2026-01-01',
    bankName: 'NBK', accountKey: 'ACC', statementDate: '2026-01-01', postingDate: null,
    description: '', reference: null, debit: 0, credit: 0, balance: null, currency: 'KWD',
    chequeNumber: null, reconcileStatus: 'PENDING' as TimelineTransaction['reconcileStatus'],
    matchedType: null, matchedRef: null, isDuplicate: false, isBankFee: false,
    bankFeeType: null, transactionFingerprint: null,
    ...over,
  };
}

describe('txDirection — الاتجاه من الأثر المالي فقط', () => {
  it('مدين موجب ⇒ سحب', () => {
    expect(txDirection(tx({ debit: 255 }))).toBe('withdrawal');
  });

  it('دائن موجب ⇒ إيداع', () => {
    expect(txDirection(tx({ credit: 1500 }))).toBe('deposit');
  });

  it('بلا مدين ولا دائن ⇒ بدون حركة', () => {
    expect(txDirection(tx())).toBe('neutral');
  });

  it('دائن سالب (حركة عكسية) ⇒ سحب — الإشارة هي الحكم', () => {
    expect(txDirection(tx({ credit: -255 }))).toBe('withdrawal');
  });

  it('مدين سالب (عكس قيد سحب) ⇒ إيداع', () => {
    expect(txDirection(tx({ debit: -255 }))).toBe('deposit');
  });

  it('قيم غير رقمية تُعامل كصفر ولا ترمي استثناء', () => {
    expect(txDirection({ debit: null, credit: undefined })).toBe('neutral');
    expect(txDirection({ debit: Number.NaN, credit: 10 })).toBe('deposit');
  });
});

describe('نوع المستند لا يغيّر الاتجاه أبدًا', () => {
  const documents: Array<[string, Partial<TimelineTransaction>]> = [
    ['شيك مقاصة وارد',   { chequeNumber: '000006', description: 'Inward Clearing Cheque 000006' }],
    ['شيك مقاصة صادر',   { chequeNumber: '000012', description: 'Outgoing Clearing Cheque 000012' }],
    ['شيك مصنَّف بنكيًا', { bankFeeType: 'CHEQUE_PAYMENT', description: 'Cheque Paid' }],
    ['حوالة بنكية',      { bankFeeType: 'BANK_TRANSFER', description: 'Outgoing RTGS' }],
    ['رسوم بنكية',       { isBankFee: true, bankFeeType: 'CHARGE', description: 'Monthly Charge' }],
    ['سحب نقدي',         { bankFeeType: 'CASH_WITHDRAWAL', description: 'ATM Withdrawal' }],
    ['قيد/عملية عادية',  { description: 'Journal adjustment' }],
  ];

  it.each(documents)('%s بمبلغ مدين ⇒ سحب', (_name, over) => {
    const t = tx({ ...over, debit: 255 });
    expect(txDirection(t)).toBe('withdrawal');
    expect(txDirectionView(t).label).toBe('سحب');
  });

  it.each(documents)('%s بمبلغ دائن ⇒ إيداع', (_name, over) => {
    const t = tx({ ...over, credit: 255 });
    expect(txDirection(t)).toBe('deposit');
    expect(txDirectionView(t).label).toBe('إيداع');
  });
});

describe('الحالة المُبلَّغ عنها — شيك مقاصة وارد بمبلغ سالب', () => {
  const reported = tx({
    description: 'Inward Clearing Cheque 000006 Presented in KFH',
    chequeNumber: '000006', debit: 255, balance: 70085.32,
  });

  it('النوع = سحب وليس «شيك»', () => {
    expect(txDirectionView(reported).label).toBe('سحب');
    expect(txDirectionView(reported).direction).toBe('withdrawal');
  });

  it('الأثر المالي سالب ومطابق للنقص في الرصيد', () => {
    expect(txSignedImpact(reported)).toBe(-255);
    expect(70340.32 + txSignedImpact(reported)).toBeCloseTo(70085.32, 3);
  });
});

describe('الاتساق العام: التسمية لا تخالف إشارة المبلغ', () => {
  it('لا توجد حالة يظهر فيها «إيداع» بأثر سالب أو «سحب» بأثر موجب', () => {
    const samples = [
      tx({ debit: 10 }), tx({ credit: 10 }), tx({ debit: 10, chequeNumber: '5' }),
      tx({ credit: 10, chequeNumber: '5' }), tx({ debit: 10, isBankFee: true, bankFeeType: 'CHARGE' }),
      tx({ credit: 10, bankFeeType: 'BANK_TRANSFER' }), tx({ debit: 0, credit: 0 }),
      tx({ credit: -10 }), tx({ debit: -10 }),
    ];
    for (const s of samples) {
      const impact = txSignedImpact(s);
      const label  = txDirectionView(s).label;
      if (impact > 0) expect(label).toBe(txDirectionLabel('deposit'));
      else if (impact < 0) expect(label).toBe(txDirectionLabel('withdrawal'));
      else expect(label).toBe(txDirectionLabel('neutral'));
    }
  });
});

describe('التسميات', () => {
  it('تستخدم الترجمة عند تمريرها، وتعود للعربية عند غيابها', () => {
    expect(txDirectionLabel('withdrawal')).toBe('سحب');
    expect(txDirectionLabel('deposit')).toBe('إيداع');
    expect(txDirectionLabel('neutral')).toBe('بدون حركة');
    expect(txDirectionLabel('withdrawal', (k) => `T:${k}`)).toBe('T:bank.explorer.badge_withdrawal');
  });
});
