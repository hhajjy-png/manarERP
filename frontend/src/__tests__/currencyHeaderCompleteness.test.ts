// @vitest-environment jsdom
/**
 * H-1 — لا خليّة مالية مجرّدة بلا دلالة عملة.
 *
 * الحزمة نقلت رمز العملة من الخليّة إلى عنوان العمود. الخطر الذي وقع فعلًا: خليّة
 * تُحوَّل إلى رقم مجرّد (`MoneyCell`) بينما عنوانها لا يكسب `(KWD)` — فيختفي أي أثر
 * للعملة من الجدول كلّه.
 *
 * الحارس هنا **بنيوي على المصدر**: لكل `<MoneyCell>` نصعد إلى `<thead>` الذي يحويه
 * ونشترط أن يكون فيه `fcMoneyHeader`. فلا يحرس النتيجة وحدها بل يمنع تكرار الخطأ:
 * أي خليّة مجرّدة جديدة تُضاف إلى جدول بلا عنوان عملة تُسقط هذا الاختبار.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fcMoneyHeader } from '../components/financial/financialLabels';

const SRC = path.resolve(__dirname, '..');
const read = (rel: string) => readFileSync(path.join(SRC, rel), 'utf8').split('\n');

/** كل ملف يعرض خلايا مالية مجرّدة. */
const FILES = [
  'pages/Prices.tsx',
  'pages/Invoices.tsx',
  'pages/Accounting.tsx',
  'pages/Expenses.tsx',
  'pages/Salaries.tsx',
  'pages/Inventory.tsx',
  'pages/Maintenance.tsx',
  'components/dashboard/LatestInvoicesTable.tsx',
  'components/dashboard/LatestExpensesTable.tsx',
];

/** يعيد لكل خليّة مالية: رقم سطرها، وهل رأس جدولها يحمل رمز العملة. */
function auditMoneyCells(rel: string): { line: number; headerHasCurrency: boolean }[] {
  const lines = read(rel);
  const out: { line: number; headerHasCurrency: boolean }[] = [];

  lines.forEach((l, i) => {
    if (!l.includes('<MoneyCell')) return;
    let head = -1;
    for (let j = i; j >= Math.max(0, i - 150); j--) {
      if (lines[j].includes('<thead')) { head = j; break; }
    }
    const header = head === -1 ? '' : lines.slice(head, i).join('\n');
    out.push({ line: i + 1, headerHasCurrency: head !== -1 && header.includes('fcMoneyHeader') });
  });

  return out;
}

describe('H-1 — كل خليّة مالية مجرّدة لها عنوان يحمل العملة', () => {
  it.each(FILES)('%s', (file) => {
    const cells = auditMoneyCells(file);
    const orphans = cells.filter((c) => !c.headerHasCurrency).map((c) => `${file}:${c.line}`);
    expect(orphans).toEqual([]);
  });

  it('الملفات الثلاثة التي رصدتها المراجعة تحوي خلايا فعلًا (فلا يمرّ الاختبار فراغًا)', () => {
    expect(auditMoneyCells('pages/Prices.tsx').length).toBeGreaterThanOrEqual(6);
    expect(auditMoneyCells('pages/Invoices.tsx').length).toBeGreaterThanOrEqual(8);
    expect(auditMoneyCells('pages/Accounting.tsx').length).toBeGreaterThanOrEqual(6);
  });
});

describe('الأعمدة التي رصدتها المراجعة — عناوينها تحمل الرمز', () => {
  const src = {
    prices: read('pages/Prices.tsx').join('\n'),
    invoices: read('pages/Invoices.tsx').join('\n'),
    accounting: read('pages/Accounting.tsx').join('\n'),
  };

  it('الأسعار: سعر الوحدة · السعر · إجمالي الاستخدام · إجمالي الإيرادات · إجمالي الفاتورة', () => {
    expect(src.prices).toContain("fcMoneyHeader(t('col.prices.unit_price'))");
    expect(src.prices).toContain("fcMoneyHeader(t('agreements.usage.col.price'))");
    expect(src.prices).toContain("fcMoneyHeader(t('agreements.usage.col.amount'))");
    expect(src.prices).toContain("fcMoneyHeader('إجمالي الإيرادات')");
    expect(src.prices).toContain("fcMoneyHeader('إجمالي الفاتورة')");
    expect(src.prices).toContain("fcMoneyHeader('السعر')");
  });

  it('الفواتير: بنود الفاتورة (السعر · الإجمالي) وملخّص العملاء (إجمالي · محصل · متبقي)', () => {
    expect(src.invoices).toContain("fcMoneyHeader('السعر')");
    expect(src.invoices).toContain("fcMoneyHeader('الإجمالي')");
    expect(src.invoices).toContain("fcMoneyHeader('إجمالي')");
    expect(src.invoices).toContain("fcMoneyHeader('محصل')");
    expect(src.invoices).toContain("fcMoneyHeader('متبقي')");
  });

  it('المحاسبة: إجمالي المدين (وجدول القيد يحمل مدين/دائن أصلًا)', () => {
    expect(src.accounting).toContain("fcMoneyHeader(t('col.acc.total_debit_lbl'))");
    expect(src.accounting).toContain("fcMoneyHeader(t('col.acc.debit'))");
    expect(src.accounting).toContain("fcMoneyHeader(t('col.acc.credit'))");
  });

  it('لم يُعَد الرمز إلى الخلايا: لا MoneyText داخل <td> في هذه الجداول', () => {
    for (const s of Object.values(src)) {
      const tdWithSymbol = s.split('\n').filter((l) => l.includes('<td') && l.includes('<MoneyText'));
      expect(tdWithSymbol).toEqual([]);
    }
  });
});

describe('شكل العنوان — من المصدر المشترك وحده', () => {
  it('«سعر الوحدة» ⇒ «سعر الوحدة (KWD)»', () => {
    expect(fcMoneyHeader('سعر الوحدة')).toBe('سعر الوحدة (KWD)');
    expect(fcMoneyHeader('إجمالي المدين')).toBe('إجمالي المدين (KWD)');
  });

  it('لا يُكتب «(KWD)» يدويًا في هذه الملفات', () => {
    for (const rel of ['pages/Prices.tsx', 'pages/Invoices.tsx', 'pages/Accounting.tsx']) {
      expect(read(rel).join('\n')).not.toContain('(KWD)</th>');
    }
  });
});
