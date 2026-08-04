/* Bank Account Explorer — Transaction Classification
   يثبّت الفصل الكامل: «التصنيف» يُشتق من إشارات المستند فقط، ولا يتأثر إطلاقًا
   بالأثر المالي (مدين/دائن)، ولا يُستخدم لتحديد الاتجاه. */
import { describe, it, expect } from 'vitest';
import {
  txCategory, txCategoryLabel, txCategoryIcon, txCategorySource, txCategoryView,
} from '../pages/bankTransactionCategory';
import { txDirection } from '../pages/bankTransactionDirection';
import type { TimelineTransaction, BankFeeType } from '../api/bankStatementImport';

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

describe('txCategory — التصنيف من إشارات المستند البنيوية', () => {
  it.each<[BankFeeType, string]>([
    ['BANK_TRANSFER',   'transfer'],
    ['CHEQUE_PAYMENT',  'cheque'],
    ['CASH_WITHDRAWAL', 'cash'],
    ['INTEREST',        'interest'],
    ['TRANSFER_FEE',    'bank_fee'],
    ['MONTHLY_FEE',     'bank_fee'],
    ['CHARGE',          'bank_fee'],
    ['ATM_FEE',         'bank_fee'],
    ['CHEQUEBOOK_FEE',  'bank_fee'],
    ['OTHER_FEE',       'bank_fee'],
  ])('bankFeeType=%s ⇒ %s', (feeType, expected) => {
    expect(txCategory(tx({ bankFeeType: feeType }))).toBe(expected);
  });

  it('رقم شيك بنيوي ⇒ شيك', () => {
    expect(txCategory(tx({ chequeNumber: '000006' }))).toBe('cheque');
    expect(txCategorySource(tx({ chequeNumber: '000006' }))).toBe('chequeNumber');
  });

  it('راية isBankFee بلا تصنيف ⇒ رسوم بنكية', () => {
    expect(txCategory(tx({ isBankFee: true }))).toBe('bank_fee');
  });
});

describe('txCategory — الأنماط النصية المثبَّتة (عربي/إنجليزي)', () => {
  it.each([
    ['Receipt Voucher 125',            'receipt_voucher'],
    ['سند قبض رقم 125',                'receipt_voucher'],
    ['Payment Voucher 88',             'payment_voucher'],
    ['سند صرف رقم 88',                 'payment_voucher'],
    ['Opening Balance',                'opening_balance'],
    ['رصيد افتتاحي',                   'opening_balance'],
    ['Journal Entry 44',               'journal'],
    ['قيد يومية 44',                   'journal'],
    ['Reversal of duplicate entry',    'adjustment'],
    ['تسوية فروقات',                   'adjustment'],
    ['Inward Clearing Cheque 000006',  'cheque'],
    ['Outgoing RTGS to Gulf Bank',     'transfer'],
    ['تحويل إلى بنك الخليج',            'transfer'],
    ['Interest credited',              'interest'],
    ['Service charge',                 'bank_fee'],
    ['رسوم تحويل',                     'bank_fee'],
    ['ATM Withdrawal',                 'cash'],
  ])('«%s» ⇒ %s', (description, expected) => {
    expect(txCategory(tx({ description }))).toBe(expected);
  });

  it('وصف بلا إشارة معروفة ⇒ غير مصنف (بلا تخمين)', () => {
    expect(txCategory(tx({ description: 'REF 8891 XYZ' }))).toBe('unclassified');
    expect(txCategory(tx({ description: '' }))).toBe('unclassified');
    expect(txCategorySource(tx({ description: '' }))).toBe('fallback');
    expect(txCategoryLabel('unclassified')).toBe('غير مصنف');
  });

  it('«checking account» لا تُقرأ شيكًا (أُسقطت كلمة check المجرّدة)', () => {
    expect(txCategory(tx({ description: 'Fund transfer from checking account' }))).toBe('transfer');
    expect(txCategory(tx({ description: 'Check No. 4471 paid' }))).toBe('cheque');
  });
});

describe('الفصل التام: التصنيف لا يتأثر بالاتجاه', () => {
  const documents: Array<[string, Partial<TimelineTransaction>]> = [
    ['شيك',        { chequeNumber: '000006', description: 'Inward Clearing Cheque 000006' }],
    ['حوالة',      { bankFeeType: 'BANK_TRANSFER', description: 'Outgoing RTGS' }],
    ['سند قبض',    { description: 'Receipt Voucher 125' }],
    ['سند صرف',    { description: 'Payment Voucher 88' }],
    ['قيد يومية',  { description: 'Journal Entry 44' }],
    ['رسوم بنكية', { isBankFee: true, bankFeeType: 'CHARGE', description: 'Monthly Charge' }],
    ['فوائد',      { bankFeeType: 'INTEREST', description: 'Interest' }],
    ['تسوية',      { description: 'Adjustment entry' }],
    ['افتتاحي',    { description: 'Opening Balance' }],
    ['نقدي',       { bankFeeType: 'CASH_WITHDRAWAL', description: 'ATM Withdrawal' }],
    ['غير مصنف',   { description: 'REF 8891' }],
  ];

  it.each(documents)('%s: التصنيف نفسه سواء كانت الحركة مدينة أو دائنة', (_name, over) => {
    const asDebit  = txCategory(tx({ ...over, debit: 255, credit: 0 }));
    const asCredit = txCategory(tx({ ...over, debit: 0, credit: 255 }));
    const asZero   = txCategory(tx({ ...over, debit: 0, credit: 0 }));
    expect(asCredit).toBe(asDebit);
    expect(asZero).toBe(asDebit);
  });

  it.each(documents)('%s: الاتجاه لا يتغيّر بتغيّر التصنيف', (_name, over) => {
    expect(txDirection(tx({ ...over, debit: 255 }))).toBe('withdrawal');
    expect(txDirection(tx({ ...over, credit: 255 }))).toBe('deposit');
  });
});

describe('أمثلة الجدول المطلوبة — النوع | التصنيف', () => {
  const rows: Array<[Partial<TimelineTransaction>, string, string]> = [
    [{ debit: 255, chequeNumber: '000006', description: 'Inward Clearing Cheque 000006' }, 'withdrawal', 'شيك'],
    [{ credit: 255, chequeNumber: '000007', description: 'Cheque collected' },             'deposit',    'شيك'],
    [{ debit: 900, bankFeeType: 'BANK_TRANSFER', description: 'Transfer to Gulf Bank' },   'withdrawal', 'حوالة'],
    [{ credit: 500, description: 'Receipt Voucher 125' },                                  'deposit',    'سند قبض'],
    [{ debit: 3, bankFeeType: 'TRANSFER_FEE', description: 'Transfer fee' },               'withdrawal', 'رسوم بنكية'],
  ];

  it.each(rows)('%o ⇒ اتجاه %s / تصنيف %s', (over, direction, categoryLabel) => {
    const t = tx(over);
    expect(txDirection(t)).toBe(direction);
    expect(txCategoryView(t).label).toBe(categoryLabel);
  });
});

describe('التسميات والأيقونات', () => {
  it('تستخدم الترجمة عند تمريرها، وتعود للعربية عند غيابها', () => {
    expect(txCategoryLabel('receipt_voucher')).toBe('سند قبض');
    expect(txCategoryLabel('opening_balance')).toBe('رصيد افتتاحي');
    expect(txCategoryLabel('cheque', (k) => `T:${k}`)).toBe('T:bank.explorer.category.cheque');
  });

  it('«غير مصنف» بلا رمز خاص فتُستخدم الأيقونة الاحتياطية الممرَّرة', () => {
    expect(txCategoryIcon('unclassified', 'north_east')).toBe('north_east');
    expect(txCategoryIcon('cheque', 'north_east')).toBe('description');
  });
});

describe('ترتيب الأولوية — البنيوي أولًا والنص آخر مرحلة', () => {
  it('نوع الكيان (matchedType) يتقدّم على كل ما دونه', () => {
    const t = tx({
      matchedType: 'payroll', matchedRef: 'EXP-2026-00001', bankFeeType: 'CHEQUE_PAYMENT',
      chequeNumber: '000006', isBankFee: true, description: 'Inward Clearing Cheque',
    });
    expect(txCategory(t)).toBe('payroll');
    expect(txCategorySource(t)).toBe('entityType');
  });

  it('نوع المرجع يتقدّم على bankFeeType ورقم الشيك والنص', () => {
    const t = tx({
      reference: 'JE-2026-00044', bankFeeType: 'CHEQUE_PAYMENT',
      chequeNumber: '000006', isBankFee: true, description: 'Cheque paid',
    });
    expect(txCategory(t)).toBe('journal');
    expect(txCategorySource(t)).toBe('referenceType');
  });

  it('bankFeeType يتقدّم على رقم الشيك والرايات والنص', () => {
    const t = tx({ bankFeeType: 'BANK_TRANSFER', chequeNumber: '000006', isBankFee: true, description: 'ATM Withdrawal' });
    expect(txCategory(t)).toBe('transfer');
    expect(txCategorySource(t)).toBe('bankFeeType');
  });

  it('رقم الشيك يتقدّم على راية الرسوم والنص', () => {
    const t = tx({ chequeNumber: '000006', isBankFee: true, description: 'Monthly charge' });
    expect(txCategory(t)).toBe('cheque');
    expect(txCategorySource(t)).toBe('chequeNumber');
  });

  it('راية النظام تتقدّم على النص', () => {
    const t = tx({ isBankFee: true, description: 'Outgoing RTGS transfer' });
    expect(txCategory(t)).toBe('bank_fee');
    expect(txCategorySource(t)).toBe('systemFlag');
  });

  it('النص لا يعمل إطلاقًا ما دام هناك أي مصدر بنيوي', () => {
    const structural: Array<Partial<TimelineTransaction>> = [
      { matchedType: 'invoice' }, { reference: 'MN-INV-2026-00142' },
      { bankFeeType: 'CHARGE' }, { chequeNumber: '9' }, { isBankFee: true },
    ];
    for (const over of structural) {
      expect(txCategorySource(tx({ ...over, description: 'Receipt Voucher 125' }))).not.toBe('text');
    }
    expect(txCategorySource(tx({ description: 'Receipt Voucher 125' }))).toBe('text');
  });
});

describe('نوع الكيان — خريطة matchedType كاملة', () => {
  it.each<[TimelineTransaction['matchedType'], string]>([
    ['cheque',  'cheque'],
    ['journal', 'journal'],
    ['invoice', 'invoice'],
    ['expense', 'expense'],
    ['payroll', 'payroll'],
    ['payment', 'voucher'],
  ])('matchedType=%s ⇒ %s', (matchedType, expected) => {
    expect(txCategory(tx({ matchedType }))).toBe(expected);
  });

  it('«payment» تُترجم إلى «سند» محايد — تمييز القبض من الصرف يحتاج اتجاهًا وهو ممنوع', () => {
    expect(txCategoryLabel(txCategory(tx({ matchedType: 'payment', debit: 500 })))).toBe('سند');
    expect(txCategoryLabel(txCategory(tx({ matchedType: 'payment', credit: 500 })))).toBe('سند');
  });
});

describe('نوع المرجع — بادئات الترقيم الفعلية للخادم', () => {
  it.each([
    ['MN-INV-2026-00142', 'invoice'],
    ['INV-2026-00142',    'invoice'],
    ['PINV-2026-00007',   'invoice'],
    ['EXP-2026-00031',    'expense'],
    ['JE-2026-00044',     'journal'],
  ])('reference=%s ⇒ %s', (reference, expected) => {
    expect(txCategory(tx({ reference }))).toBe(expected);
  });

  it('مرجع بنكي غير معروف لا يُصنَّف بالمرجع', () => {
    expect(txCategorySource(tx({ reference: 'FT26001234567' }))).toBe('fallback');
  });

  it('matchedRef يُفحص قبل reference', () => {
    expect(txCategory(tx({ matchedRef: 'EXP-2026-1', reference: 'JE-2026-1' }))).toBe('expense');
  });
});
