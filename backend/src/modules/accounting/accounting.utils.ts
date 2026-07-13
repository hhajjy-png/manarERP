// Pure accounting validation utilities — no Prisma, no side effects.
import { sumMoney, moneyEquals } from '../../shared/utils/money';

type JournalLine = { debit?: number; credit?: number };

/**
 * Validates that a set of journal lines is balanced (total debit = total credit)
 * and contains at least two lines. Throws on violation.
 *
 * حارس القيد اليدوي. كان يجمع **بلا تقريب** ويقارن بتسامح `0.001` — أي بفلس كامل، وهو
 * أصغر وحدة نقدية في الدينار: قيد مختلّ بفلس كان يمرّ. صار يجمع بوحدة النقود القانونية
 * ويقارن بـ `moneyEquals` — نفس الحارس الذي يحمي مسار الترحيل المركزي (`gl.service`)،
 * فلا يبقى بابان بمعيارين.
 */
export function validateJournalBalance(lines: JournalLine[]): void {
  if (lines.length < 2) {
    throw new Error('القيد يجب أن يحتوي على سطرين على الأقل');
  }
  const totalDebit  = sumMoney(lines.map((l) => l.debit  ?? 0));
  const totalCredit = sumMoney(lines.map((l) => l.credit ?? 0));
  if (!moneyEquals(totalDebit, totalCredit)) {
    throw new Error('القيد غير متوازن: إجمالي المدين لا يساوي إجمالي الدائن');
  }
}
