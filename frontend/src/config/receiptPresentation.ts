// ─────────────────────────────────────────────────────────────────────────
//  المقبوضات — مفردات العرض (وسيلة القبض + حالة سداد الفاتورة). مصدر واحد.
//
//  ⚠️ الرموز (value) تطابق `ENUMS.paymentMethod` في
//     backend/src/config/constants.ts، وهي القيم المخزَّنة فعلًا في
//     `Payment.method`. العربية عرضٌ فقط ولا تُرسَل إلى الـAPI أبدًا.
//
//  ملاحظة موثَّقة على `BANK` و`TRANSFER`: كلتاهما تحويل بنكي دلاليًا، ويعاملهما
//  الترحيل المحاسبي بالتساوي (كلتاهما تُدين حساب البنك 1010). أُبقيتا قيمتين
//  متمايزتين لأنهما كذلك في قاعدة البيانات؛ العرض يجمعهما في بطاقة «التحويلات
//  البنكية» ويُبقي الصفّين متمايزين في التفصيل، فلا يضيع تمييز مخزَّن ولا
//  تنقسم بطاقة يقرؤها المستخدم كمفهوم واحد.
// ─────────────────────────────────────────────────────────────────────────

import type { Tone } from '../components/explorer/ExplorerKit';

/** وسائل القبض المخزَّنة فعلًا — نفس ترتيب `ENUMS.paymentMethod`. */
export const RECEIPT_METHODS = ['CASH', 'BANK', 'CHEQUE', 'TRANSFER'] as const;
export type ReceiptMethod = (typeof RECEIPT_METHODS)[number];

export interface ReceiptMethodMeta {
  /** مفتاح i18n — مسار العرض الأساسي. */
  key: string;
  tone: Tone;
  icon: string;
  /**
   * دلالة حقل `reference` لهذه الوسيلة — يتغيّر عنوان الخانة لا الحقل نفسه.
   * `null` = لا مرجع متوقّع، فلا يُعرض عنوان يوحي بحقل غير موجود.
   */
  referenceKey: string | null;
}

export const RECEIPT_METHOD_META: Record<ReceiptMethod, ReceiptMethodMeta> = {
  CASH:     { key: 'rcp.method.cash',     tone: 'green',   icon: 'payments',        referenceKey: null },
  BANK:     { key: 'rcp.method.bank',     tone: 'blue',    icon: 'account_balance', referenceKey: 'rcp.ref.transfer' },
  CHEQUE:   { key: 'rcp.method.cheque',   tone: 'indigo',  icon: 'receipt_long',    referenceKey: 'rcp.ref.cheque' },
  TRANSFER: { key: 'rcp.method.transfer', tone: 'blue',    icon: 'swap_horiz',      referenceKey: 'rcp.ref.transfer' },
};

const METHOD_FALLBACK: ReceiptMethodMeta = {
  key: 'rcp.method.unknown', tone: 'neutral', icon: 'help', referenceKey: null,
};

/** ميتا الوسيلة مع ارتداد آمن — لا ترمي أبدًا على رمز قديم/غير معروف. */
export function receiptMethodMeta(method: string | null | undefined): ReceiptMethodMeta {
  return (method && RECEIPT_METHOD_META[method as ReceiptMethod]) || METHOD_FALLBACK;
}

/**
 * تجميعة البطاقات العلوية: النقدي، الشيكات، والتحويلات البنكية (BANK+TRANSFER).
 * تُستهلَك في بطاقات KPI وفي شريط التفصيل معًا — تعريف واحد لا اثنان.
 */
export const RECEIPT_METHOD_GROUPS: { key: string; labelKey: string; icon: string; tone: Tone; methods: ReceiptMethod[] }[] = [
  { key: 'cash',     labelKey: 'rcp.group.cash',     icon: 'payments',        tone: 'green',  methods: ['CASH'] },
  { key: 'cheque',   labelKey: 'rcp.group.cheque',   icon: 'receipt_long',    tone: 'indigo', methods: ['CHEQUE'] },
  { key: 'transfer', labelKey: 'rcp.group.transfer', icon: 'account_balance', tone: 'blue',   methods: ['BANK', 'TRANSFER'] },
];

// ── حالة سداد الفاتورة المقبوض ضدّها ────────────────────────────────────────
//
// ليست «حالة قبض»: نموذج `Payment` لا يحمل حقل حالة إطلاقًا، وشيك العميل الوارد
// لا كيان له في النظام. القيمتان أدناه هما `Invoice.status` المخزَّنة، وهما
// الوحيدتان الممكنتان على فاتورة عليها دفعة.

export const RECEIPT_INVOICE_STATUSES = ['PAID', 'PARTIAL'] as const;
export type ReceiptInvoiceStatus = (typeof RECEIPT_INVOICE_STATUSES)[number];

export interface ReceiptStatusMeta {
  key: string;
  tone: Tone;
  icon: string;
}

export const RECEIPT_STATUS_META: Record<string, ReceiptStatusMeta> = {
  PAID:    { key: 'rcp.status.paid',    tone: 'green',  icon: 'task_alt' },
  PARTIAL: { key: 'rcp.status.partial', tone: 'orange', icon: 'pending_actions' },
};

const STATUS_FALLBACK: ReceiptStatusMeta = { key: 'rcp.status.unknown', tone: 'neutral', icon: 'help' };

export function receiptStatusMeta(status: string | null | undefined): ReceiptStatusMeta {
  return (status && RECEIPT_STATUS_META[status]) || STATUS_FALLBACK;
}
