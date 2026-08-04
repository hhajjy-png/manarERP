/**
 * عقد التصنيف/الاتجاه — جانب الخادم.
 * يقرأ نفس ملف الحالات الذهبية الذي تقرأه الواجهة، فأي انحراف بين الطرفين يظهر
 * فورًا في أحد الجانبين أو كليهما.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  txDirection, txCategory, txCategorySource, txSignedImpact,
  TX_CATEGORIES, TX_DIRECTIONS,
} from '../timelineClassification.js';

interface GoldenCase {
  name: string;
  row: Record<string, unknown>;
  direction: string;
  category: string;
  source: string;
}

// vitest يعمل بجذر حزمة الخادم — مسار ثابت يتجنّب import.meta (module=CommonJS).
const goldenPath = join(process.cwd(), 'src/modules/bankStatementImport/__tests__/classificationGolden.json');
const golden = JSON.parse(readFileSync(goldenPath, 'utf8')) as { cases: GoldenCase[] };

describe('عقد التصنيف الذهبي — الخادم', () => {
  it('الملف يحتوي حالات فعلية', () => {
    expect(golden.cases.length).toBeGreaterThanOrEqual(30);
  });

  it.each(golden.cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(txDirection(c.row as never)).toBe(c.direction);
    expect(txCategory(c.row as never)).toBe(c.category);
    expect(txCategorySource(c.row as never)).toBe(c.source);
  });

  it('كل قيمة متوقَّعة في الملف ضمن المجموعات المُعلَنة', () => {
    for (const c of golden.cases) {
      expect(TX_DIRECTIONS).toContain(c.direction as never);
      expect(TX_CATEGORIES).toContain(c.category as never);
    }
  });

  it('إشارة الأثر المالي تطابق الاتجاه في كل حالة', () => {
    for (const c of golden.cases) {
      const impact = txSignedImpact(c.row as never);
      if (c.direction === 'deposit') expect(impact).toBeGreaterThan(0);
      else if (c.direction === 'withdrawal') expect(impact).toBeLessThan(0);
      else expect(impact).toBe(0);
    }
  });

  it('التصنيف لا يتغيّر بعكس المبالغ (فصل تام)', () => {
    for (const c of golden.cases) {
      const flipped = { ...c.row, debit: c.row.credit, credit: c.row.debit };
      expect(txCategory(flipped as never)).toBe(c.category);
    }
  });
});
