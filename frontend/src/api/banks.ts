import { api } from './client';

/**
 * سجل البنوك والحسابات البنكية — Multi-Bank Cheques Foundation v1.
 *
 * مستقل تمامًا عن `api/bankAccounts.ts`: ذاك يقرأ الحسابات المشتقة من حركات
 * كشوف البنوك (مفتاحها `accountKey` نصي)، وهذا هو السجل المخزَّن (مفتاحه `id`).
 *
 * لا رقم حساب ولا IBAN في هذه الطبقة — الخادم لا يرسلهما أصلًا، والحساب يُعرَّف
 * للمستخدم بـ«اسم البنك — اسم الحساب» عبر الحقل `label` الجاهز من الخادم.
 */

export interface Bank {
  id: number;
  /** معرّف داخلي ثابت (GULF_BANK / NBK / …) لا يعتمد على الاسم العربي. */
  code: string;
  nameAr: string;
  nameEn: string | null;
  isActive: boolean;
  accountsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface BankAccount {
  id: number;
  bankId: number;
  bankCode: string;
  bankNameAr: string;
  bankNameEn: string | null;
  accountName: string;
  /** «بنك الخليج — الحساب الرئيسي» — الشكل الوحيد المعروض في نموذج الشيك. */
  label: string;
  /** فعّال فعليًا = الحساب فعّال وبنكه فعّال. */
  isActive: boolean;
  accountIsActive: boolean;
  bankIsActive: boolean;
  statementAccountKey: string | null;
  /**
   * هل للحساب قالب طباعة معتمد؟
   *
   * الخادم يرسل راية منطقية لا مفتاح القالب: قرار «أي قالب» يخصّ الخادم وحده،
   * والواجهة تحتاج فقط أن تعرف هل تسمح بالطباعة والمعاينة أم تمنعهما.
   */
  printEnabled: boolean;
}

/** الشيكات القديمة التي تعذّر ربطها بحساب بنكي — تقرير «لا تخمين». */
export interface UnlinkedChequesReport {
  total: number;
  groups: { bankName: string; count: number }[];
}

export async function listBanks(): Promise<Bank[]> {
  const res = await api.get('/banks');
  return res.data.data ?? [];
}

export async function createBank(input: { code: string; nameAr: string; nameEn?: string | null; isActive?: boolean }): Promise<Bank> {
  const res = await api.post('/banks', input);
  return res.data.data;
}

export async function updateBank(id: number, input: { nameAr?: string; nameEn?: string | null; isActive?: boolean }): Promise<Bank> {
  const res = await api.put(`/banks/${id}`, input);
  return res.data.data;
}

/** `activeOnly` هو ما يستهلكه منتقي الحساب في نموذج الشيك. */
export async function listBankAccounts(options: { activeOnly?: boolean } = {}): Promise<BankAccount[]> {
  const res = await api.get('/banks/accounts', {
    params: options.activeOnly ? { activeOnly: 'true' } : undefined,
  });
  return res.data.data ?? [];
}

export async function createBankAccount(input: {
  bankId: number;
  accountName: string;
  isActive?: boolean;
  statementAccountKey?: string | null;
}): Promise<BankAccount> {
  const res = await api.post('/banks/accounts', input);
  return res.data.data;
}

export async function updateBankAccount(id: number, input: {
  accountName?: string;
  isActive?: boolean;
  statementAccountKey?: string | null;
}): Promise<BankAccount> {
  const res = await api.put(`/banks/accounts/${id}`, input);
  return res.data.data;
}

export async function getUnlinkedChequesReport(): Promise<UnlinkedChequesReport> {
  const res = await api.get('/banks/unlinked-cheques');
  return res.data.data ?? { total: 0, groups: [] };
}

/**
 * رسالة المنع الموحّدة لحساب بلا قالب طباعة معتمد.
 *
 * مصدر واحد لنصّها حتى لا تتباعد بين نموذج الشيك وشاشة البنوك وأي مستهلك لاحق.
 */
export const PRINT_PROFILE_MISSING_MESSAGE =
  'لم يتم إعداد قالب الطباعة لهذا الحساب البنكي بعد. سيتم تفعيله بعد إدخال نموذج الشيك والأبعاد الفعلية.';
