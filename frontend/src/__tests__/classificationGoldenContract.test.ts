/**
 * عقد التصنيف/الاتجاه — جانب الواجهة.
 *
 * يقرأ **نفس** ملف الحالات الذهبية الذي يقرأه اختبار الخادم
 * (backend/src/modules/bankStatementImport/__tests__/classificationGolden.json).
 * الفلترة تحدث في الخادم والعرض يحدث هنا، فوجود القاعدة في الطرفين حتمي —
 * وهذا الملف هو ما يمنع انحرافهما: أي تعديل في أحد الجانبين دون الآخر يُسقط
 * أحد الاختبارين فورًا.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { txDirection, txSignedImpact } from '../pages/bankTransactionDirection';
import { txCategory, txCategorySource } from '../pages/bankTransactionCategory';

interface GoldenCase {
  name: string;
  row: Record<string, unknown>;
  direction: string;
  category: string;
  source: string;
}

// vitest يعمل بجذر حزمة الواجهة؛ الملف يعيش في حزمة الخادم — مسار واحد مشترك.
const goldenPath = join(
  process.cwd(), '..', 'backend', 'src', 'modules', 'bankStatementImport',
  '__tests__', 'classificationGolden.json',
);
const golden = JSON.parse(readFileSync(goldenPath, 'utf8')) as { cases: GoldenCase[] };

describe('عقد التصنيف الذهبي — الواجهة', () => {
  it('الملف المشترك موجود ويحتوي حالات فعلية', () => {
    expect(golden.cases.length).toBeGreaterThanOrEqual(30);
  });

  it.each(golden.cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(txDirection(c.row as never)).toBe(c.direction);
    expect(txCategory(c.row as never)).toBe(c.category);
    expect(txCategorySource(c.row as never)).toBe(c.source);
  });

  it('إشارة الأثر المالي تطابق الاتجاه في كل حالة', () => {
    for (const c of golden.cases) {
      const impact = txSignedImpact(c.row as never);
      if (c.direction === 'deposit') expect(impact).toBeGreaterThan(0);
      else if (c.direction === 'withdrawal') expect(impact).toBeLessThan(0);
      else expect(impact).toBe(0);
    }
  });
});
