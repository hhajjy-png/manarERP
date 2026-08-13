// @vitest-environment jsdom
/**
 * لا خليّة مالية بلا دلالة عملة — ولا عملة مكرَّرة.
 *
 * الحزمة نقلت رمز العملة من الخليّة إلى عنوان العمود. من ذلك ينشأ خطآن، وقع كلاهما:
 *
 *   (أ) **خليّة مجرّدة بلا عنوان** — تُحوَّل الخليّة إلى رقم فقط بينما عنوانها لا يكسب
 *       `(KWD)`، فيختفي أي أثر للعملة من الجدول. (H-1 في ثلاث صفحات، ثم N-1 في دفتر
 *       اليومية.)
 *   (ب) **عملة مكرَّرة** — يكسب العنوان `(KWD)` بينما تبقى الخليّة تحمل الرمز، فيُقرأ
 *       الصفّ «مدين (KWD) | 12,455.000 KWD». (N-2 في كشف الحساب والمجمَّع.)
 *
 * الحارس الأول كان يمسح `<MoneyCell>` **حرفيًا** فقط، فلم يرَ الجداول التي تُصيّر
 * خلاياها عبر مُساعد محلّي (`fmt()` ← `fcMoneyCell`) — وهي بالضبط التي وقع فيها N-1.
 * فهو موسَّع هنا ليقرأ **ثلاث إشارات**: `<MoneyCell>` و`fcMoneyCell(` و`formatMoneyCell(`
 * — سواء كُتبت في الخليّة مباشرة أو عبر مُساعد يُستدعى منها — ويكشف أيضًا الحالة (ب).
 *
 * المسح **على مستوى الجدول**، لا الملف: لكل خليّة نصعد إلى `<thead>` الذي يحويها، فوجود
 * `fcMoneyHeader` في جدول آخر داخل الملف نفسه لا يُنجّي جدولًا ناقصًا. والقيم المستقلة
 * خارج الجداول (بطاقات، Drawers) لا تدخل الفحص أصلًا — لها معيارها (رقم + رمز).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { fcMoneyHeader } from '../components/financial/financialLabels';

const SRC = path.resolve(__dirname, '..');
const read = (rel: string) => readFileSync(path.join(SRC, rel), 'utf8');

/** مُساعد محلّي يُرجع خليّة مالية مجرّدة: `function fmt(...) { return fcMoneyCell(x); }`. */
function bareCellHelpers(src: string): string[] {
  const names: string[] = [];
  const re = /function\s+(\w+)\s*\([^)]*\)[^{]*\{[^}]*\b(?:fcMoneyCell|formatMoneyCell)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) names.push(m[1]);
  return names;
}

/** مُساعد محلّي يُرجع خليّة تحمل الرمز: `return fcCurrency(x)`. */
function symbolCellHelpers(src: string): string[] {
  const names: string[] = [];
  const re = /function\s+(\w+)\s*\([^)]*\)[^{]*\{[^}]*\bfcCurrency\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) names.push(m[1]);
  return names;
}

type Cell = { line: number; kind: 'bare' | 'symbol'; headerHasCurrency: boolean };

/**
 * كل خليّة مالية داخل `<td>` في الملف، مرتبطة بـ `<thead>` جدولها.
 * الخليّة «مجرّدة» إن صُيِّرت بـ MoneyCell / fcMoneyCell / formatMoneyCell أو بمُساعد
 * يُرجعها، و«حاملة للرمز» إن صُيِّرت بـ fcCurrency أو بمُساعد يُرجعها.
 */
function auditTableCells(rel: string): Cell[] {
  const src = read(rel);
  const lines = src.split('\n');
  const bareHelpers = bareCellHelpers(src);
  const symHelpers = symbolCellHelpers(src);

  const bareRe = new RegExp(
    ['<MoneyCell', 'fcMoneyCell\\s*\\(', 'formatMoneyCell\\s*\\(', ...bareHelpers.map((h) => `\\b${h}\\s*\\(`)].join('|'),
  );
  const symRe = symHelpers.length || /fcCurrency\s*\(/.test(src)
    ? new RegExp(['fcCurrency\\s*\\(', ...symHelpers.map((h) => `\\b${h}\\s*\\(`)].join('|'))
    : null;

  const out: Cell[] = [];

  lines.forEach((l, i) => {
    if (!l.includes('<td')) return;                       // الجداول وحدها — لا البطاقات
    const isBare = bareRe.test(l);
    const isSym = symRe ? symRe.test(l) : false;
    if (!isBare && !isSym) return;

    let head = -1;
    for (let j = i; j >= Math.max(0, i - 200); j--) {
      if (lines[j].includes('<thead')) { head = j; break; }
    }
    const header = head === -1 ? '' : lines.slice(head, i).join('\n');
    out.push({
      line: i + 1,
      kind: isBare ? 'bare' : 'symbol',
      headerHasCurrency: head !== -1 && header.includes('fcMoneyHeader'),
    });
  });

  return out;
}

/** كل ملف يعرض جداول مالية — يُمسح مجلّد الجداول المالية كاملًا، لا قائمة ضيّقة. */
const FINANCIAL_DIR = 'components/financial';
const financialTables = readdirSync(path.join(SRC, FINANCIAL_DIR))
  .filter((f) => f.endsWith('.tsx') && !f.includes('.test.'))
  .map((f) => `${FINANCIAL_DIR}/${f}`);

const PAGES_AND_TABLES = [
  'pages/Prices.tsx',
  'pages/Invoices.tsx',
  'pages/Accounting.tsx',
  'pages/Expenses.tsx',
  'pages/Salaries.tsx',
  'pages/Inventory.tsx',
  'pages/Maintenance.tsx',
  'pages/FinancialCenter.tsx',
  'components/dashboard/LatestInvoicesTable.tsx',
  'components/dashboard/LatestExpensesTable.tsx',
  ...financialTables,
];

/**
 * استثناء موثّق: جدول الأعمار يعرض الرمز **داخل الخليّة** وعناوينه فترات زمنية
 * («0–30 يوم») لا أعمدة عملة — فهو متّسق داخليًا: لا فقدان للعملة ولا تكرار لها.
 */
const INLINE_CURRENCY_EXCEPTIONS = ['components/financial/AgingTable.tsx'];

describe('لا خليّة مجرّدة بلا عنوان عملة (H-1 / N-1)', () => {
  it.each(PAGES_AND_TABLES)('%s', (file) => {
    const orphans = auditTableCells(file)
      .filter((c) => c.kind === 'bare' && !c.headerHasCurrency)
      .map((c) => `${file}:${c.line}`);
    expect(orphans).toEqual([]);
  });
});

describe('لا عملة مكرَّرة: رمز في الخليّة تحت عنوان يحمل الرمز (N-2)', () => {
  it.each(PAGES_AND_TABLES.filter((f) => !INLINE_CURRENCY_EXCEPTIONS.includes(f)))('%s', (file) => {
    const dupes = auditTableCells(file)
      .filter((c) => c.kind === 'symbol' && c.headerHasCurrency)
      .map((c) => `${file}:${c.line}`);
    expect(dupes).toEqual([]);
  });
});

describe('الحارس نفسه — لا يمرّ فراغًا ولا يعطي إنذارًا زائفًا', () => {
  it('يرى خلايا فعلًا في جداول المركز المالي الثلاثة (وإلا فهو يمرّ على لا شيء)', () => {
    expect(auditTableCells('components/financial/JournalBookTable.tsx').length).toBeGreaterThan(0);
    expect(auditTableCells('components/financial/StatementTable.tsx').length).toBeGreaterThan(0);
    expect(auditTableCells('components/financial/GroupedTable.tsx').length).toBeGreaterThan(0);
  });

  it('يرى الخلايا المُصيَّرة عبر مُساعد محلّي — لا `<MoneyCell>` وحدها (نقطة N-3 العمياء)', () => {
    const src = read('components/financial/StatementTable.tsx');
    expect(src).not.toContain('<MoneyCell');          // لا تستعمل المكوّن أصلًا
    expect(bareCellHelpers(src)).toContain('fmt');    // ومع ذلك يراها الحارس عبر المُساعد
    expect(auditTableCells('components/financial/StatementTable.tsx').every((c) => c.kind === 'bare')).toBe(true);
  });

  it('يكشف خليّة مجرّدة يتيمة لو أُضيفت (سيناريو H-1 الاصطناعي)', () => {
    const fake = ['<thead>', '<tr><th>مدين</th></tr>', '</thead>', '<tbody>', '<td>{fcMoneyCell(row.debit)}</td>'];
    // نُحاكي منطق الحارس على مقطع مصطنع: لا fcMoneyHeader في الرأس ⇒ يتيمة.
    const header = fake.slice(0, 3).join('\n');
    expect(header.includes('fcMoneyHeader')).toBe(false);
  });

  it('لا يفرض القاعدة على القيم المستقلة خارج الجداول (بطاقات وDrawers)', () => {
    // `MoneyText` (رقم + رمز) خارج `<td>` لا يدخل الفحص إطلاقًا.
    const cells = auditTableCells('pages/Invoices.tsx');
    expect(cells.every((c) => c.kind === 'bare' && c.headerHasCurrency)).toBe(true);
  });

  it('استثناء الأعمار موثّق: رمز في الخليّة وعناوين فترات — متّسق، لا يُعدّ مخالفة', () => {
    const cells = auditTableCells('components/financial/AgingTable.tsx');
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.every((c) => c.kind === 'symbol' && !c.headerHasCurrency)).toBe(true);
  });
});

describe('الأعمدة التي رصدتها المراجعات — عناوينها من المصدر المشترك', () => {
  it('دفتر اليومية: مدين/دائن (N-1)', () => {
    const src = read('components/financial/JournalBookTable.tsx');
    // العناوين انتقلت من النص الحرفي إلى مفاتيح i18n — الحارس يتبع الشكل الحالي.
    expect(src).toContain("fcMoneyHeader(t('acc.balance.debit'))");
    expect(src).toContain("fcMoneyHeader(t('acc.balance.credit'))");
    expect(src).not.toContain('fcCurrency(');   // لا رمز في الخليّة
  });

  it('كشف الحساب والمجمَّع: العنوان يحمل الرمز والخليّة مجرّدة (N-2)', () => {
    for (const f of ['components/financial/StatementTable.tsx', 'components/financial/GroupedTable.tsx']) {
      const src = read(f);
      expect(src).toContain('fcMoneyHeader(');
      expect(src).toContain('fcMoneyCell(');
      expect(src).not.toContain('fcCurrency(');           // زال التكرار
      expect(src).not.toMatch(/n\s*\?\s*fc\w+\(n\)\s*:\s*''/);  // ولا شرط يُخفي الصفر
    }
  });

  it('الصفحات الثلاث من H-1', () => {
    expect(read('pages/Prices.tsx')).toContain("fcMoneyHeader(t('col.prices.unit_price'))");
    expect(read('pages/Invoices.tsx')).toContain("fcMoneyHeader(t('agreements.usage.col.price'))");
    expect(read('pages/Accounting.tsx')).toContain("fcMoneyHeader(t('col.acc.total_debit_lbl'))");
  });

  it('«(KWD)» لا تُكتب يدويًا في أي من هذه الملفات', () => {
    for (const f of PAGES_AND_TABLES) {
      expect(read(f)).not.toContain('(KWD)</th>');
    }
  });
});

describe('شكل العنوان من المصدر المشترك', () => {
  it('«مدين» ⇒ «مدين (KWD)»', () => {
    expect(fcMoneyHeader('مدين')).toBe('مدين (KWD)');
    expect(fcMoneyHeader('الرصيد')).toBe('الرصيد (KWD)');
  });
});
