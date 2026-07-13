import { normalizeMoney } from '../../utils/money';

/**
 * مُعاد تصديرها للمستدعين القائمين. السياسة نفسها (نصف بعيدًا عن الصفر) لكنها صارت
 * تُصحّح ضجيج الثنائي أيضًا (EPSILON) — فلم يعد ميزان المراجعة يقرّب بقاعدة تخالف قاعدة
 * الترحيل الذي كتب القيد.
 */
export { normalizeMoney };

export function calculateRunningBalances<T extends { debit: number; credit: number }>(
  openingBalance: number,
  entries: T[]
): (T & { runningBalance: number })[] {
  let balance = openingBalance;
  return entries.map(entry => {
    balance = normalizeMoney(balance + entry.debit - entry.credit);
    return { ...entry, runningBalance: balance };
  });
}

export function calculateClosingBalance(
  openingBalance: number,
  totalDebit: number,
  totalCredit: number
): number {
  return normalizeMoney(openingBalance + totalDebit - totalCredit);
}

/**
 * كان الجمع هنا **خامًا بلا تطبيع**، فتتراكم آثار التمثيل الثنائي في مجاميع ميزان
 * المراجعة والكشوف. التطبيع يقع **مرة واحدة على المجموع النهائي** — لا عند كل خطوة —
 * حتى لا نُقرّب تقريبًا تراكميًا (double rounding).
 */
export function sumDebitCredit<T extends { debit: number; credit: number }>(
  entries: T[]
): { totalDebit: number; totalCredit: number } {
  const raw = entries.reduce(
    (acc, e) => ({ totalDebit: acc.totalDebit + e.debit, totalCredit: acc.totalCredit + e.credit }),
    { totalDebit: 0, totalCredit: 0 }
  );
  return { totalDebit: normalizeMoney(raw.totalDebit), totalCredit: normalizeMoney(raw.totalCredit) };
}
