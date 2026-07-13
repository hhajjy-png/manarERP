import { describe, it, expect } from 'vitest';
import { validateJournalBalance } from '../accounting.utils';

type Line = { debit?: number; credit?: number };

describe('validateJournalBalance', () => {
  // ── Minimum-lines guard ───────────────────────────────────────────────────

  it('throws when there are fewer than 2 lines', () => {
    expect(() => validateJournalBalance([{ debit: 100, credit: 0 }]))
      .toThrow('القيد يجب أن يحتوي على سطرين على الأقل');
  });

  it('throws when there are zero lines', () => {
    expect(() => validateJournalBalance([])).toThrow();
  });

  // ── Balanced entries ──────────────────────────────────────────────────────

  it('does not throw for a simple balanced entry (debit = credit)', () => {
    const lines: Line[] = [
      { debit: 100, credit: 0 },
      { debit: 0, credit: 100 },
    ];
    expect(() => validateJournalBalance(lines)).not.toThrow();
  });

  it('does not throw when total debit equals total credit across multiple lines', () => {
    const lines: Line[] = [
      { debit: 200, credit: 0 },
      { debit: 50, credit: 0 },
      { debit: 0, credit: 150 },
      { debit: 0, credit: 100 },
    ];
    expect(() => validateJournalBalance(lines)).not.toThrow();
  });

  // ── Unbalanced entries ────────────────────────────────────────────────────

  it('throws for an unbalanced entry (debit ≠ credit)', () => {
    const lines: Line[] = [
      { debit: 100, credit: 0 },
      { debit: 0, credit: 80 },
    ];
    expect(() => validateJournalBalance(lines)).toThrow('القيد غير متوازن');
  });

  it('throws when debit exceeds credit', () => {
    const lines: Line[] = [
      { debit: 500, credit: 0 },
      { debit: 0, credit: 499 },
    ];
    expect(() => validateJournalBalance(lines)).toThrow();
  });

  // ── Tolerance boundary ────────────────────────────────────────────────────

  /**
   * كان هذا الاختبار يُرمّز **العيب نفسه**: تسامح `0.001` يساوي فلسًا كاملًا — أصغر وحدة
   * نقدية في الدينار — فكان القيد المختلّ بفلس يمرّ. و`100.0009` ليس ضجيجًا ثنائيًا
   * (الضجيج في حدود 1e-16)، بل **تسعة أعشار الفلس**: يُقرَّب عند التخزين إلى `100.001`،
   * فيُخزَّن قيدٌ مختلٌّ فعلًا. لا يجوز قبوله.
   *
   * التسامح الآن **تنفيذي لا محاسبي**: يبتلع ضجيج التمثيل وحده.
   */
  it('accepts binary-noise imbalance (0.1 + 0.2 vs 0.3) — representation, not a real difference', () => {
    const lines: Line[] = [
      { debit: 0.1, credit: 0 },
      { debit: 0.2, credit: 0 },
      { debit: 0, credit: 0.3 },
    ];
    expect(() => validateJournalBalance(lines)).not.toThrow();
  });

  it('rejects an imbalance that normalizes to a full fils (0.0009 → 0.001)', () => {
    const lines: Line[] = [
      { debit: 100.0009, credit: 0 },
      { debit: 0, credit: 100 },
    ];
    expect(() => validateJournalBalance(lines)).toThrow();
  });

  it('rejects an exact one-fils imbalance — the whole point of the hardening', () => {
    const lines: Line[] = [
      { debit: 100.001, credit: 0 },
      { debit: 0, credit: 100 },
    ];
    expect(() => validateJournalBalance(lines)).toThrow();
  });

  it('rejects entries whose imbalance exceeds 0.001', () => {
    const lines: Line[] = [
      { debit: 100.002, credit: 0 },
      { debit: 0, credit: 100 },
    ];
    expect(() => validateJournalBalance(lines)).toThrow();
  });

  // ── KWD precision scenarios ───────────────────────────────────────────────

  it('handles KWD 3-decimal amounts without floating-point false positives', () => {
    // 125.750 debit, 125.750 credit — must not falsely trigger imbalance
    const lines: Line[] = [
      { debit: 125.750, credit: 0 },
      { debit: 0, credit: 125.750 },
    ];
    expect(() => validateJournalBalance(lines)).not.toThrow();
  });

  it('handles undefined debit/credit as zero', () => {
    const lines: Line[] = [
      { debit: 100 },          // credit defaults to 0
      { credit: 100 },         // debit defaults to 0
    ];
    expect(() => validateJournalBalance(lines)).not.toThrow();
  });

  // ── Zero-value entry ──────────────────────────────────────────────────────

  it('accepts an all-zero balanced entry (trivially balanced)', () => {
    const lines: Line[] = [
      { debit: 0, credit: 0 },
      { debit: 0, credit: 0 },
    ];
    expect(() => validateJournalBalance(lines)).not.toThrow();
  });
});
