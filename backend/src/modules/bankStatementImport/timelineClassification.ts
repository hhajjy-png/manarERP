/* ════════════════════════════════════════════════════════════════════════════
   Timeline Classification — منفذ الخادم لقاعدتَي الاتجاه والتصنيف
   --------------------------------------------------------------------------
   نسخة مطابقة (1:1) لقاعدتَي العرض في الواجهة:
     • frontend/src/pages/bankTransactionDirection.ts
     • frontend/src/pages/bankTransactionCategory.ts

   لماذا تكرار مقصود؟ الفلترة تحدث في الخادم (عدّ + ترقيم + تصدير)، والعرض
   يحدث في الواجهة. وجود القاعدة في المكانين أمر لا مفرّ منه في نظام يُرقّم من
   قاعدة البيانات. ما لا يُقبل هو **الانحراف** بينهما — لذلك يوجد ملف حالات
   ذهبية مشترك (`__tests__/classificationGolden.json`) تقرأه حزمتا الاختبار في
   الطرفين، فأي تعديل في أحد الجانبين دون الآخر يُسقط البناء فورًا.

   قواعد صارمة (نفس ما تفرضه الواجهة):
     • التصنيف لا يقرأ debit/credit إطلاقًا.
     • الاتجاه لا يقرأ أي إشارة مستند إطلاقًا.

   PURE. لا Prisma، لا I/O، لا حالة.
   ════════════════════════════════════════════════════════════════════════════ */

// ── الاتجاه ────────────────────────────────────────────────────────────────────

export type TxDirection = 'deposit' | 'withdrawal' | 'neutral';

export interface DirectionalMovement {
  debit:  number | null | undefined;
  credit: number | null | undefined;
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** (دائن − مدين): موجب ⇒ إيداع، سالب ⇒ سحب، صفر ⇒ بدون حركة. */
export function txDirection(t: DirectionalMovement): TxDirection {
  const net = num(t.credit) - num(t.debit);
  if (net > 0) return 'deposit';
  if (net < 0) return 'withdrawal';
  return 'neutral';
}

export function txSignedImpact(t: DirectionalMovement): number {
  return num(t.credit) - num(t.debit);
}

// ── التصنيف ────────────────────────────────────────────────────────────────────

export type TxCategory =
  | 'cheque' | 'transfer' | 'invoice' | 'expense' | 'payroll' | 'voucher'
  | 'receipt_voucher' | 'payment_voucher' | 'journal' | 'bank_fee'
  | 'interest' | 'adjustment' | 'opening_balance' | 'cash' | 'unclassified';

export type TxCategorySource =
  | 'entityType' | 'referenceType' | 'bankFeeType' | 'chequeNumber'
  | 'systemFlag' | 'text' | 'fallback';

/** بلا حقول مبالغ — نفس الفرض المعماري المطبَّق في الواجهة. */
export interface CategorySignals {
  matchedType:  string | null | undefined;
  matchedRef:   string | null | undefined;
  reference:    string | null | undefined;
  bankFeeType:  string | null | undefined;
  chequeNumber: string | null | undefined;
  isBankFee:    boolean | null | undefined;
  description:  string | null | undefined;
}

const ENTITY_CATEGORY: Record<string, TxCategory> = {
  cheque:  'cheque',
  journal: 'journal',
  invoice: 'invoice',
  expense: 'expense',
  payroll: 'payroll',
  payment: 'voucher',
};

const REFERENCE_PREFIXES: Array<{ re: RegExp; category: TxCategory }> = [
  { re: /^(?:mn-)?p?inv-\d/i, category: 'invoice' },
  { re: /^exp-\d/i,           category: 'expense' },
  { re: /^je-\d/i,            category: 'journal' },
];

const FEE_TYPE_CATEGORY: Record<string, TxCategory> = {
  BANK_TRANSFER:   'transfer',
  CHEQUE_PAYMENT:  'cheque',
  CASH_WITHDRAWAL: 'cash',
  INTEREST:        'interest',
  TRANSFER_FEE:    'bank_fee',
  MONTHLY_FEE:     'bank_fee',
  CHARGE:          'bank_fee',
  ATM_FEE:         'bank_fee',
  CHEQUEBOOK_FEE:  'bank_fee',
  OTHER_FEE:       'bank_fee',
};

const TEXT_RULES: Array<{ re: RegExp; category: TxCategory }> = [
  { re: /receipt\s+voucher|سند\s*قبض/i,                                     category: 'receipt_voucher' },
  { re: /payment\s+voucher|سند\s*(?:صرف|دفع)/i,                             category: 'payment_voucher' },
  { re: /opening\s+balance|balance\s+b\/?f|brought\s+forward|رصيد\s*(?:افتتاحي|مُدوَّر|مدور)/i, category: 'opening_balance' },
  { re: /journal(?:\s+(?:entry|voucher))?\b|قيد\s*(?:يومية|محاسبي)/i,        category: 'journal' },
  { re: /reversal|correction|adjustment|تسوية|تصحيح|عكس\s*قيد/i,            category: 'adjustment' },
  { re: /interest|فائدة|فوائد/i,                                            category: 'interest' },
  { re: /\bfees?\b|charges?|commission|رسوم|عمولة/i,                        category: 'bank_fee' },
  { re: /cheque|\bchq\b|check\s*(?:no\.?|number|#)|شيك/i,                    category: 'cheque' },
  { re: /rtgs|swift|remittance|transfer|حوالة|تحويل/i,                      category: 'transfer' },
  { re: /\batm\b|cash\s+(?:deposit|withdrawal)|نقد(?:ي|ًا)|صراف/i,          category: 'cash' },
];

interface CategoryResolution { category: TxCategory; source: TxCategorySource; }

const RESOLVERS: Array<{ source: TxCategorySource; resolve: (t: CategorySignals) => TxCategory | null }> = [
  { source: 'entityType',    resolve: (t) => (t.matchedType ? ENTITY_CATEGORY[t.matchedType] ?? null : null) },
  {
    source: 'referenceType',
    resolve: (t) => {
      for (const candidate of [t.matchedRef, t.reference]) {
        const ref = candidate?.trim();
        if (!ref) continue;
        const hit = REFERENCE_PREFIXES.find((p) => p.re.test(ref));
        if (hit) return hit.category;
      }
      return null;
    },
  },
  { source: 'bankFeeType',  resolve: (t) => (t.bankFeeType ? FEE_TYPE_CATEGORY[t.bankFeeType] ?? null : null) },
  { source: 'chequeNumber', resolve: (t) => (t.chequeNumber?.trim() ? 'cheque' : null) },
  { source: 'systemFlag',   resolve: (t) => (t.isBankFee ? 'bank_fee' : null) },
  {
    source: 'text',
    resolve: (t) => {
      const raw = (t.description ?? '').replace(/\s+/g, ' ').trim();
      if (!raw) return null;
      return TEXT_RULES.find((r) => r.re.test(raw))?.category ?? null;
    },
  },
];

function resolveCategory(t: CategorySignals): CategoryResolution {
  for (const stage of RESOLVERS) {
    const category = stage.resolve(t);
    if (category) return { category, source: stage.source };
  }
  return { category: 'unclassified', source: 'fallback' };
}

export function txCategory(t: CategorySignals): TxCategory {
  return resolveCategory(t).category;
}

export function txCategorySource(t: CategorySignals): TxCategorySource {
  return resolveCategory(t).source;
}

/** كل قيم التصنيف الصالحة — مصدر التحقق في مخطط الاستعلام. */
export const TX_CATEGORIES: readonly TxCategory[] = [
  'cheque', 'transfer', 'invoice', 'expense', 'payroll', 'voucher',
  'receipt_voucher', 'payment_voucher', 'journal', 'bank_fee',
  'interest', 'adjustment', 'opening_balance', 'cash', 'unclassified',
] as const;

export const TX_DIRECTIONS: readonly TxDirection[] = ['deposit', 'withdrawal', 'neutral'] as const;
