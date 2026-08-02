/** أنواع «تحليل الشغل والعمولة» المشتركة بين الصفحة ومكوّناتها. */

export type WorkAnalysisStatus = 'DRAFT' | 'COMPLETED' | 'ARCHIVED';

/** صف اتفاقية سعر كما يُعيده `GET /prices/for-invoice` القائم — يُقرأ ولا يُعدَّل. */
export interface PriceAgreementOption {
  id: number;
  asphaltPlant: string;
  companyName: string;
  contractLocation: string;
  contractUnit: string;
  /** سعر العميل. */
  unitPrice: number;
  /**
   * القيمة الافتراضية لسعر صاحب المعدة من الاتفاقية.
   * اختيارية لأن استجابات قديمة (أو اتفاقيات لم تُملأ) قد لا تحملها — تُعامَل كصفر.
   */
  equipmentOwnerPrice?: number;
}

/**
 * سطر في ورقة العمل.
 *
 * `customerPrice` و`itemLabel` و`unit` و`priceAgreementName` **لقطة مجمَّدة** تُنسخ
 * لحظة اختيار الاتفاقية ولا تُعاد قراءتها من `/prices` بعدها إطلاقًا — لا عند إعادة
 * الحساب ولا عند فتح تحليل محفوظ. هذا ما يجعل تعديل الاتفاقية لاحقًا عاجزًا عن
 * تغيير تحليل قديم.
 *
 * `quantity` و`ownerPrice` نصّان لا أرقام: حقل الإدخال يجب أن يقبل الحالة الوسيطة
 * («12.» أثناء الكتابة، أو الفراغ) دون أن يقفز إلى صفر تحت أصابع المستخدم.
 * التحويل إلى رقم يحدث عند الحساب فقط.
 */
export interface WorkAnalysisLineDraft {
  /** مفتاح محلّي ثابت للـ React — ليس معرّف قاعدة بيانات. */
  key: string;
  priceId: number | null;
  priceAgreementName: string;
  itemLabel: string;
  unit: string;
  customerPrice: number;
  quantity: string;
  ownerPrice: string;
}

export interface WorkAnalysisHeaderDraft {
  customerId: string;
  customerName: string;
  contractId: string;
  contractName: string;
  asphaltPlant: string;
  ownerName: string;
  analysisDate: string;
  status: WorkAnalysisStatus;
  notes: string;
}

/** تحليل محفوظ كما يصل من الخادم. */
export interface SavedWorkAnalysis {
  id: number;
  analysisDate: string;
  status: WorkAnalysisStatus;
  customerId: number | null;
  customerName: string;
  contractId: number | null;
  contractName: string | null;
  asphaltPlant: string | null;
  ownerName: string;
  notes: string | null;
  lines: {
    id: number;
    priceId: number | null;
    priceAgreementName: string;
    itemLabel: string;
    unit: string;
    customerPrice: number;
    quantity: number;
    ownerPrice: number;
    sortOrder: number;
  }[];
}

export interface CustomerLite {
  id: number;
  name: string;
  nameEn?: string | null;
}

export interface ContractLite {
  id: number;
  contractNumber?: string | null;
  asphaltPlant?: string | null;
  title?: string | null;
}

/** يبني وصفًا نصيًا لاتفاقية سعر — يُستخدم في القائمة وفي اللقطة معًا. */
export function priceAgreementLabel(price: PriceAgreementOption): string {
  return `${price.asphaltPlant} — ${price.companyName}`;
}

let lineKeySeed = 0;

/** مفتاح محلّي فريد للسطر. عدّاد لا عشوائية — حتمي وقابل للاختبار. */
export function nextLineKey(): string {
  lineKeySeed += 1;
  return `wal-${lineKeySeed}`;
}

export function emptyLine(): WorkAnalysisLineDraft {
  return {
    key: nextLineKey(),
    priceId: null,
    priceAgreementName: '',
    itemLabel: '',
    unit: '',
    customerPrice: 0,
    quantity: '',
    ownerPrice: '',
  };
}

/** يحوّل سطر ورقة العمل إلى المُدخَلات الرقمية التي يتوقّعها محرّك الحساب. */
export function lineAmountsInput(line: WorkAnalysisLineDraft) {
  return {
    customerPrice: line.customerPrice,
    ownerPrice: Number(line.ownerPrice),
    quantity: Number(line.quantity),
  };
}
