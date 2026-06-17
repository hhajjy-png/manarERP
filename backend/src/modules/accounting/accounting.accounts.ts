import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';

/** عميل Prisma سواء الأساسي أو داخل معاملة ($transaction). */
type Client = Prisma.TransactionClient | typeof prisma;

/**
 * رموز حسابات النظام المستخدمة في الترحيل التلقائي (Phase 1).
 * هذه الرموز هي مصدر الحقيقة الوحيد لربط منطق الترحيل بدليل الحسابات.
 * تُزرع تلقائيًا عبر ensureSystemAccounts() ومن خلال seed دليل الحسابات.
 */
export const SYSTEM_ACCOUNT_CODES = {
  CASH: '1000', // الصندوق
  BANK: '1010', // البنك
  ACCOUNTS_RECEIVABLE: '1100', // ذمم العملاء (مدينون)
  INVENTORY: '1200', // المخزون
  ACCOUNTS_PAYABLE: '2000', // ذمم الموردين (دائنون)
  SALES_REVENUE: '4000', // إيرادات المبيعات
  PURCHASES: '5000', // المشتريات
  PAYROLL_EXPENSE: '5100', // مصروف الرواتب
  GENERAL_EXPENSE: '5200', // مصروفات عامة (Phase B — expense GL posting)
} as const;

export type SystemAccountCode = (typeof SYSTEM_ACCOUNT_CODES)[keyof typeof SYSTEM_ACCOUNT_CODES];

/**
 * دليل الحسابات الأساسي (Chart of Accounts) المطلوب لترحيل القيد المزدوج.
 * يُستخدم في ensureSystemAccounts() وفي seed.ts معًا (idempotent عبر upsert).
 */
export const SYSTEM_ACCOUNTS: {
  code: string;
  name: string;
  type: string;
  normalBalance: string;
}[] = [
  { code: SYSTEM_ACCOUNT_CODES.CASH, name: 'الصندوق', type: 'ASSET', normalBalance: 'DEBIT' },
  { code: SYSTEM_ACCOUNT_CODES.BANK, name: 'البنك', type: 'ASSET', normalBalance: 'DEBIT' },
  { code: SYSTEM_ACCOUNT_CODES.ACCOUNTS_RECEIVABLE, name: 'ذمم العملاء', type: 'ASSET', normalBalance: 'DEBIT' },
  { code: SYSTEM_ACCOUNT_CODES.INVENTORY, name: 'المخزون', type: 'ASSET', normalBalance: 'DEBIT' },
  { code: SYSTEM_ACCOUNT_CODES.ACCOUNTS_PAYABLE, name: 'ذمم الموردين', type: 'LIABILITY', normalBalance: 'CREDIT' },
  { code: SYSTEM_ACCOUNT_CODES.SALES_REVENUE, name: 'إيرادات المبيعات', type: 'REVENUE', normalBalance: 'CREDIT' },
  { code: SYSTEM_ACCOUNT_CODES.PURCHASES, name: 'المشتريات', type: 'EXPENSE', normalBalance: 'DEBIT' },
  { code: SYSTEM_ACCOUNT_CODES.PAYROLL_EXPENSE, name: 'مصروف الرواتب', type: 'EXPENSE', normalBalance: 'DEBIT' },
  { code: SYSTEM_ACCOUNT_CODES.GENERAL_EXPENSE, name: 'مصروفات عامة', type: 'EXPENSE', normalBalance: 'DEBIT' },
];

let accountCache: Map<string, number> | null = null;

/**
 * يضمن وجود حسابات النظام في دليل الحسابات (idempotent).
 * يُستدعى كسلامة تشغيلية قبل أول ترحيل في حال لم يُشغّل seed دليل الحسابات.
 */
export async function ensureSystemAccounts(client: Client = prisma): Promise<void> {
  for (const acc of SYSTEM_ACCOUNTS) {
    await client.account.upsert({
      where: { code: acc.code },
      update: {},
      create: { code: acc.code, name: acc.name, type: acc.type, normalBalance: acc.normalBalance, isActive: true },
    });
  }
  accountCache = null; // إبطال الذاكرة المؤقتة بعد التعديل

  // تحقق دفاعي: لا تسمح بأي ترحيل إذا بقي أي حساب نظام مفقودًا
  const existing = await client.account.findMany({ select: { code: true } });
  const existingCodes = new Set(existing.map((a) => a.code));
  const missing = Object.values(SYSTEM_ACCOUNT_CODES).filter((code) => !existingCodes.has(code));
  if (missing.length > 0) {
    throw new AppError(
      `حسابات النظام غير مكتملة. الحسابات المفقودة: ${missing.join(', ')}. يرجى تشغيل seed.`,
      500,
    );
  }
}

/**
 * يجلب حسابات النظام النشطة كخريطة code → id (مع ذاكرة مؤقتة).
 * عند العمل داخل معاملة يجب تمرير عميل المعاملة لتجنّب قراءة قديمة.
 */
export async function getSystemAccounts(client: Client = prisma): Promise<Map<string, number>> {
  if (accountCache) return accountCache;
  const accounts = await client.account.findMany({
    where: { isActive: true },
    select: { id: true, code: true },
  });
  const map = new Map(accounts.map((a) => [a.code, a.id]));
  accountCache = map;
  return map;
}

/** يبطل الذاكرة المؤقتة لحسابات النظام (يُستخدم في الاختبارات وبعد التعديلات). */
export function clearAccountCache(): void {
  accountCache = null;
}

/** يجلب معرّف الحساب من الخريطة أو يرمي خطأً واضحًا إذا كان مفقودًا. */
export function requireAccount(cache: Map<string, number>, code: string): number {
  const id = cache.get(code);
  if (id === undefined) {
    throw new AppError(`حساب النظام غير موجود في دليل الحسابات: ${code}`, 500);
  }
  return id;
}
