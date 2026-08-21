import type { Bank, BankAccount } from '../../api/banks';

/**
 * سجل بنوك مُحاكى لاختبارات شاشة الشيكات — Multi-Bank Cheques Foundation v1.
 *
 * هوية البنك في وحدة الشيكات صارت الحساب البنكي، وطباعة الشيك محروسة بـ
 * `printEnabled` الذي يرسله الخادم. فأي اختبار يرسم شاشة الشيكات ويتوقّع أن
 * تعمل الطباعة يحتاج سجلًا يطابق الإنتاج: بنك الخليج بحسابه الرئيسي المهيأ.
 *
 * الهدف مصدر واحد لهذه البيانات، فلا تتباعد نسخها بين ملفات الاختبار — وحين
 * يُهيّأ بنك ثانٍ مستقبلًا يتغيّر هذا الملف وحده.
 */

export const GULF_BANK_FIXTURE: Bank = {
  id: 1,
  code: 'GULF_BANK',
  nameAr: 'بنك الخليج',
  nameEn: 'Gulf Bank',
  isActive: true,
  accountsCount: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

export const NBK_BANK_FIXTURE: Bank = {
  id: 2,
  code: 'NBK',
  nameAr: 'بنك الكويت الوطني',
  nameEn: 'National Bank of Kuwait (NBK)',
  isActive: true,
  accountsCount: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

/** حساب بنك الخليج الرئيسي — الحساب الوحيد المهيأ للطباعة، كما في الإنتاج. */
export const GULF_ACCOUNT_FIXTURE: BankAccount = {
  id: 1,
  bankId: 1,
  bankCode: 'GULF_BANK',
  bankNameAr: 'بنك الخليج',
  bankNameEn: 'Gulf Bank',
  accountName: 'الحساب الرئيسي',
  label: 'بنك الخليج — الحساب الرئيسي',
  isActive: true,
  accountIsActive: true,
  bankIsActive: true,
  statementAccountKey: null,
  printEnabled: true,
};

/** حساب بنك جديد — مسجَّل وصالح للحفظ، بلا قالب طباعة معتمد. */
export const NBK_ACCOUNT_FIXTURE: BankAccount = {
  id: 2,
  bankId: 2,
  bankCode: 'NBK',
  bankNameAr: 'بنك الكويت الوطني',
  bankNameEn: 'National Bank of Kuwait (NBK)',
  accountName: 'الحساب الجاري',
  label: 'بنك الكويت الوطني — الحساب الجاري',
  isActive: true,
  accountIsActive: true,
  bankIsActive: true,
  statementAccountKey: null,
  printEnabled: false,
};

/**
 * يردّ على مسارَي سجل البنوك، أو `null` إن لم يكن المسار منهما.
 *
 * يُركَّب داخل `api.get` المُحاكى في الاختبار قبل مسارات الشيكات:
 *
 *     const registry = bankRegistryResponse(url);
 *     if (registry) return Promise.resolve(registry as never);
 */
export function bankRegistryResponse(
  url: string,
  options: { banks?: Bank[]; accounts?: BankAccount[] } = {},
): { data: { data: unknown } } | null {
  const banks = options.banks ?? [GULF_BANK_FIXTURE];
  const accounts = options.accounts ?? [GULF_ACCOUNT_FIXTURE];
  // `/banks/accounts` أولًا: `/banks` بادئة له، فترتيب الفحص يهمّ.
  if (url.startsWith('/banks/accounts')) return { data: { data: accounts } };
  if (url.startsWith('/banks/unlinked-cheques')) return { data: { data: { total: 0, groups: [] } } };
  if (url === '/banks') return { data: { data: banks } };
  return null;
}

/**
 * الحقول التي صار الخادم يرفقها بكل شيك، بقيم الحساب المهيأ.
 *
 * تُدمج في fixtures الشيكات القائمة: `{ ...oldCheque, ...gulfChequeAccountFields() }`.
 */
export function gulfChequeAccountFields() {
  return {
    bankAccountId: GULF_ACCOUNT_FIXTURE.id,
    bankAccount: {
      id: GULF_ACCOUNT_FIXTURE.id,
      accountName: GULF_ACCOUNT_FIXTURE.accountName,
      bankNameAr: GULF_ACCOUNT_FIXTURE.bankNameAr,
      label: GULF_ACCOUNT_FIXTURE.label,
      isActive: true,
    },
    printEnabled: true,
  };
}
