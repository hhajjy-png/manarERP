/* ════════════════════════════════════════════════════════════════════════════
   Bank Transaction Category — تصنيف المستند (مصدر الحركة)
   --------------------------------------------------------------------------
   مسؤولية واحدة فقط: «ما هو المستند الذي أنتج هذه الحركة؟».

   قاعدة صارمة (مفروضة معماريًا لا بالاتفاق):
     • هذه الوحدة لا تستورد `bankTransactionDirection` إطلاقًا.
     • واجهة الإدخال `CategorySignals` لا تحتوي حقول المبالغ أصلًا، فلا يمكن
       لأي دالة هنا قراءة الأثر المالي حتى لو أراد كاتب الكود ذلك.
     • اختبار معماري (`bankTransactionSeparation.test.ts`) يفحص نص الملفين
       ويفشل البناء عند أي استيراد متبادل أو تسرّب مفاهيمي.

   ترتيب الأولوية (Structural first, Text last):
     1) نوع الكيان الحقيقي  — `matchedType` (ربط مُصالَح بمستند فعلي في النظام)
     2) نوع المرجع          — بادئة مرقّمة معروفة في `matchedRef`/`reference`
     3) تصنيف البنك البنيوي — `bankFeeType`
     4) حقل رقم الشيك       — `chequeNumber`
     5) رايات النظام        — `isBankFee`
     6) قواعد نصية          — احتياطي أخير فقط، على وصف البنك
     ⇒ وإلا: `unclassified` («غير مصنف») — إعلان صريح بأن النظام لم يستطع
        التصنيف، لا تخمين ولا تسمية مُرضية.

   لا تُستشار مرحلة أدنى ما دامت مرحلة أعلى أعطت نتيجة. القواعد النصية لا
   تعمل إطلاقًا على حركة تملك أي بيانات بنيوية مفيدة.

   PURE PRESENTATION. لا كتابة، ولا منطق محاسبي، ولا ترحيل.

   ── ملاحظة تصميمية: مفهوم ثالث مستقبلي (Transaction Source) ───────────────
   إضافة «مصدر الحركة» (Manual / Sales / Purchasing / Payroll / Cheque Module /
   Bank Import / Journal / Opening Balance / System / API) لا تتطلب إعادة
   هيكلة: تُنشأ وحدة ثالثة `bankTransactionSource.ts` بنفس هذا الشكل
   (واجهة `SourceSignals` خاصة بها + `txSource()` + `txSourceLabel()` +
   `txSourceView()`)، وتُستهلك كـ view ثالث مستقل بجانب `txDirectionView` و
   `txCategoryView`. لا شيء هنا يحتاج تعديلًا لأن هذه الوحدة لا تصدّر أي
   افتراض عن عدد المفاهيم ولا عن ترتيب عرضها.
   ════════════════════════════════════════════════════════════════════════════ */
import type { TimelineTransaction, MatchedType } from '../api/bankStatementImport';

/** تصنيف المستند — مصدر الحركة، بلا أي دلالة اتجاه. */
export type TxCategory =
  | 'cheque'
  | 'transfer'
  | 'invoice'
  | 'expense'
  | 'payroll'
  | 'voucher'
  | 'receipt_voucher'
  | 'payment_voucher'
  | 'journal'
  | 'bank_fee'
  | 'interest'
  | 'adjustment'
  | 'opening_balance'
  | 'cash'
  | 'unclassified';

/** المرحلة التي حسمت التصنيف — تُعرض في التدقيق وتثبّت أن النص آخر مرحلة. */
export type TxCategorySource =
  | 'entityType'
  | 'referenceType'
  | 'bankFeeType'
  | 'chequeNumber'
  | 'systemFlag'
  | 'text'
  | 'fallback';

type TranslateFn = (key: string) => string;

function tr(key: string, fallback: string, translate?: TranslateFn): string {
  return translate ? translate(key) : fallback;
}

/**
 * الحد الأدنى المطلوب للتصنيف. لاحظ غياب حقول المبالغ عمدًا وبنيويًا: النوع
 * نفسه يمنع استخدام الأثر المالي داخل هذه الوحدة.
 */
export interface CategorySignals {
  matchedType:  MatchedType | null | undefined;
  matchedRef:   string | null | undefined;
  reference:    string | null | undefined;
  bankFeeType:  string | null | undefined;
  chequeNumber: string | null | undefined;
  isBankFee:    boolean | null | undefined;
  description:  string | null | undefined;
}

// ── (1) نوع الكيان الحقيقي — أقوى مصدر: ربط مُصالَح بمستند فعلي ───────────────
// `matchedType` يعني أن الحركة طُوبقت فعليًا مع سجل في النظام، فهو أدق من أي
// استنتاج آخر. «payment» يُترجم إلى «سند» المحايد لأن تمييز القبض من الصرف
// يتطلب الاتجاه — وهو ممنوع هنا.
const ENTITY_CATEGORY: Record<MatchedType, TxCategory> = {
  cheque:  'cheque',
  journal: 'journal',
  invoice: 'invoice',
  expense: 'expense',
  payroll: 'payroll',
  payment: 'voucher',
};

// ── (2) نوع المرجع — بادئات الترقيم الفعلية المولَّدة في الخادم ───────────────
// مستخرجة من مولّدات الأرقام الحقيقية في backend (invoices/expenses/transactions):
//   MN-INV-YYYY- | INV-YYYY- | PINV-YYYY-  → فاتورة
//   EXP-YYYY-                              → مصروف
//   JE-YYYY-                               → قيد يومية
// مطابقة مثبَّتة على بداية النص وبفاصل صريح — ليست مطابقة نصية حرة.
const REFERENCE_PREFIXES: Array<{ re: RegExp; category: TxCategory }> = [
  { re: /^(?:mn-)?p?inv-\d/i, category: 'invoice' },
  { re: /^exp-\d/i,           category: 'expense' },
  { re: /^je-\d/i,            category: 'journal' },
];

// ── (3) تصنيف البنك البنيوي ──────────────────────────────────────────────────
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

// ── (6) القواعد النصية — احتياطي أخير فقط ────────────────────────────────────
// كل قاعدة باقية هنا لأن الكشوف البنكية المستوردة كثيرًا ما تصل بلا أي حقل
// بنيوي مقابل (بنك بلا عمود رقم شيك، أو بلا تصنيف رسوم). القواعد التي كان لها
// مصدر بنيوي كامل حُذفت أو رُبطت بمرحلتها الأعلى.
// الترتيب: الأكثر تحديدًا أولًا؛ الرسوم قبل الشيك/الحوالة كي لا تُقرأ «رسوم
// تحويل» كحوالة ولا «رسوم دفتر شيكات» كشيك.
const TEXT_RULES: Array<{ re: RegExp; category: TxCategory }> = [
  { re: /receipt\s+voucher|سند\s*قبض/i,                                     category: 'receipt_voucher' },
  { re: /payment\s+voucher|سند\s*(?:صرف|دفع)/i,                             category: 'payment_voucher' },
  { re: /opening\s+balance|balance\s+b\/?f|brought\s+forward|رصيد\s*(?:افتتاحي|مُدوَّر|مدور)/i, category: 'opening_balance' },
  { re: /journal(?:\s+(?:entry|voucher))?\b|قيد\s*(?:يومية|محاسبي)/i,        category: 'journal' },
  { re: /reversal|correction|adjustment|تسوية|تصحيح|عكس\s*قيد/i,            category: 'adjustment' },
  { re: /interest|فائدة|فوائد/i,                                            category: 'interest' },
  { re: /\bfees?\b|charges?|commission|رسوم|عمولة/i,                        category: 'bank_fee' },
  // «check» المجرّدة أُسقطت عمدًا (تطابق «checking account» وغيرها)؛ لا تُقبل
  // إلا مسبوقة بترقيم صريح.
  { re: /cheque|\bchq\b|check\s*(?:no\.?|number|#)|شيك/i,                    category: 'cheque' },
  { re: /rtgs|swift|remittance|transfer|حوالة|تحويل/i,                      category: 'transfer' },
  { re: /\batm\b|cash\s+(?:deposit|withdrawal)|نقد(?:ي|ًا)|صراف/i,          category: 'cash' },
];

// ── سلسلة الاستدلال ──────────────────────────────────────────────────────────
// مرحلة واحدة مرتَّبة، تُستخدم لاشتقاق التصنيف ومصدره معًا — بلا أي تكرار منطق.

interface CategoryResolution { category: TxCategory; source: TxCategorySource; }

const RESOLVERS: Array<{ source: TxCategorySource; resolve: (t: CategorySignals) => TxCategory | null }> = [
  {
    source: 'entityType',
    resolve: (t) => (t.matchedType ? ENTITY_CATEGORY[t.matchedType] ?? null : null),
  },
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
  {
    source: 'bankFeeType',
    resolve: (t) => (t.bankFeeType ? FEE_TYPE_CATEGORY[t.bankFeeType] ?? null : null),
  },
  {
    source: 'chequeNumber',
    resolve: (t) => (t.chequeNumber?.trim() ? 'cheque' : null),
  },
  {
    source: 'systemFlag',
    resolve: (t) => (t.isBankFee ? 'bank_fee' : null),
  },
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

/** تصنيف المستند — بنيوي أولًا، والنص آخر مرحلة، بلا أي نظر للأثر المالي. */
export function txCategory(t: CategorySignals): TxCategory {
  return resolveCategory(t).category;
}

/** المرحلة التي حسمت التصنيف — للتدقيق والشفافية. */
export function txCategorySource(t: CategorySignals): TxCategorySource {
  return resolveCategory(t).source;
}

const CATEGORY_LABELS: Record<TxCategory, { key: string; label: string }> = {
  cheque:          { key: 'bank.explorer.category.cheque',          label: 'شيك' },
  transfer:        { key: 'bank.explorer.category.transfer',        label: 'حوالة' },
  invoice:         { key: 'bank.explorer.category.invoice',         label: 'فاتورة' },
  expense:         { key: 'bank.explorer.category.expense',         label: 'مصروف' },
  payroll:         { key: 'bank.explorer.category.payroll',         label: 'رواتب' },
  voucher:         { key: 'bank.explorer.category.voucher',         label: 'سند' },
  receipt_voucher: { key: 'bank.explorer.category.receipt_voucher', label: 'سند قبض' },
  payment_voucher: { key: 'bank.explorer.category.payment_voucher', label: 'سند صرف' },
  journal:         { key: 'bank.explorer.category.journal',         label: 'قيد يومية' },
  bank_fee:        { key: 'bank.explorer.category.bank_fee',        label: 'رسوم بنكية' },
  interest:        { key: 'bank.explorer.category.interest',        label: 'فوائد' },
  adjustment:      { key: 'bank.explorer.category.adjustment',      label: 'تسوية' },
  opening_balance: { key: 'bank.explorer.category.opening_balance', label: 'رصيد افتتاحي' },
  cash:            { key: 'bank.explorer.category.cash',            label: 'نقدي' },
  unclassified:    { key: 'bank.explorer.category.unclassified',    label: 'غير مصنف' },
};

/**
 * رمز أيقونة التصنيف. `unclassified` بلا رمز خاص — تُعاد `fallback` التي
 * يمررها المتصل. الوحدة تستقبل نصًّا فقط ولا تعرف شيئًا عن الاتجاه.
 */
const CATEGORY_ICONS: Record<TxCategory, string | null> = {
  cheque:          'description',
  transfer:        'swap_horiz',
  invoice:         'receipt',
  expense:         'shopping_cart',
  payroll:         'groups',
  voucher:         'article',
  receipt_voucher: 'receipt_long',
  payment_voucher: 'payments',
  journal:         'menu_book',
  bank_fee:        'percent',
  interest:        'trending_up',
  adjustment:      'tune',
  opening_balance: 'flag',
  cash:            'local_atm',
  unclassified:    null,
};

export function txCategoryLabel(category: TxCategory, translate?: TranslateFn): string {
  const entry = CATEGORY_LABELS[category];
  return tr(entry.key, entry.label, translate);
}

export function txCategoryIcon(category: TxCategory, fallback: string): string {
  return CATEGORY_ICONS[category] ?? fallback;
}

export interface TxCategoryView {
  category: TxCategory;
  label:    string;
  source:   TxCategorySource;
}

/** العرض الموحّد لتصنيف المستند — المصدر الوحيد لعمود «التصنيف» في كل الشاشات. */
export function txCategoryView(t: TimelineTransaction, translate?: TranslateFn): TxCategoryView {
  const { category, source } = resolveCategory(t);
  return { category, label: txCategoryLabel(category, translate), source };
}
