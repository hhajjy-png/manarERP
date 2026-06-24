// Uses "round half away from zero" so -1.5005 → -1.501 (symmetric KWD rounding)
export function normalizeMoney(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value) * 1000) / 1000;
}

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

export function sumDebitCredit<T extends { debit: number; credit: number }>(
  entries: T[]
): { totalDebit: number; totalCredit: number } {
  return entries.reduce(
    (acc, e) => ({ totalDebit: acc.totalDebit + e.debit, totalCredit: acc.totalCredit + e.credit }),
    { totalDebit: 0, totalCredit: 0 }
  );
}
