// Pure accounting validation utilities — no Prisma, no side effects.

type JournalLine = { debit?: number; credit?: number };

/**
 * Validates that a set of journal lines is balanced (total debit = total credit)
 * and contains at least two lines. Throws on violation.
 */
export function validateJournalBalance(lines: JournalLine[]): void {
  if (lines.length < 2) {
    throw new Error('القيد يجب أن يحتوي على سطرين على الأقل');
  }
  const totalDebit  = lines.reduce((s, l) => s + (l.debit  ?? 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (l.credit ?? 0), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.001) {
    throw new Error('القيد غير متوازن: إجمالي المدين لا يساوي إجمالي الدائن');
  }
}
