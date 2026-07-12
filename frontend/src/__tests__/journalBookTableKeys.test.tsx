// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { ROUTER_FUTURE } from './helpers/router';
import { JournalBookTable } from '../components/financial/JournalBookTable';
import type { JournalBookRow } from '../types/financial.types';
import type { FinancialDrillDownState } from '../components/financial/DrillDownLink';

/**
 * JournalBookTable — ثبات مفاتيح الصفوف.
 *
 * كان `rows.map()` يعيد اختصار الـ Fragment `<>`، وهو **عنصر القائمة الحقيقي** — لكنه
 * لا يقبل مفتاحًا. فكان المفتاح يوضع على الـ `<tr>` **بداخله**، حيث لا يراه React،
 * فيصدر: «Each child in a list should have a unique "key" prop».
 *
 * الإصلاح: `<Fragment key={row.id}>`. لا تغيير في البيانات ولا الترتيب ولا المجاميع.
 */

const currentState: FinancialDrillDownState = {
  returnTo: '/financial',
  reportLabel: 'دفتر اليومية',
  tab: 'journal',
};

function line(accountCode: string, accountName: string, debit: number, credit: number) {
  return { accountCode, accountName, description: 'بيان', debit, credit };
}

/** ثلاثة قيود، أحدها بسطرين متطابقَي القيم — الحالة التي تكشف مفتاحًا غير فريد. */
const rows: JournalBookRow[] = [
  {
    id: 'JE-1', entryNumber: 'JE-2026-001', date: '2026-06-01', description: 'قيد أول',
    referenceType: 'INVOICE', status: 'POSTED', totalDebit: 100, totalCredit: 100, lineCount: 2,
    lines: [line('1100', 'النقدية', 100, 0), line('4100', 'الإيرادات', 0, 100)],
  } as JournalBookRow,
  {
    id: 'JE-2', entryNumber: 'JE-2026-002', date: '2026-06-02', description: 'قيد ثانٍ',
    referenceType: 'EXPENSE', status: 'POSTED', totalDebit: 50, totalCredit: 50, lineCount: 2,
    // سطران متطابقان تمامًا — أي مفتاح مبنيّ على المحتوى وحده كان سيتكرّر.
    lines: [line('5100', 'مصروف', 25, 0), line('5100', 'مصروف', 25, 0)],
  } as JournalBookRow,
  {
    id: 'JE-3', entryNumber: 'JE-2026-003', date: '2026-06-03', description: 'قيد ثالث',
    referenceType: 'MANUAL', status: 'DRAFT', totalDebit: 70, totalCredit: 70, lineCount: 1,
    lines: [line('2100', 'ذمم دائنة', 0, 70)],
  } as JournalBookRow,
];

const renderTable = () =>
  render(
    <MemoryRouter future={ROUTER_FUTURE}>
      <JournalBookTable rows={rows} currentState={currentState} />
    </MemoryRouter>,
  );

/** يلتقط تحذيرات React **للتأكيد عليها** — لا لإسكاتها. `mockRestore` إلزامي بعده. */
function captureConsoleErrors() {
  const seen: string[] = [];
  const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    seen.push(args.map(String).join(' '));
  });
  return { seen, restore: () => spy.mockRestore() };
}

afterEach(cleanup);

describe('مفاتيح صفوف دفتر اليومية', () => {
  it('لا تحذير «unique key» عند التصيير', () => {
    const { seen, restore } = captureConsoleErrors();
    renderTable();
    restore(); // استعادة صريحة — لا كتم يتسرّب إلى ما بعده
    expect(seen.filter((m) => /unique "key" prop/.test(m))).toEqual([]);
  });

  it('ولا تحذير عند فتح الصفوف (حيث يظهر صفّ السطور الثاني داخل نفس عنصر القائمة)', () => {
    const { seen, restore } = captureConsoleErrors();
    renderTable();
    fireEvent.click(screen.getByText('فتح الكل'));
    fireEvent.click(screen.getByText('JE-2026-001').closest('tr')!); // طيّ واحد
    restore();
    expect(seen.filter((m) => /unique "key" prop/.test(m))).toEqual([]);
  });

  it('المفتاح على عنصر القائمة نفسه (Fragment) لا على أبنائه', () => {
    const src = readFileSyncSafe('src/components/financial/JournalBookTable.tsx');
    expect(src).toContain('<Fragment key={row.id}>');
    // الاختصار `<>` لا يقبل مفتاحًا — لا يجوز أن يعود كعنصر قائمة.
    expect(src).not.toMatch(/rows\.map\(row => \(\s*<>/);
    // ولا مفتاح مبني على قيمة متغيّرة أثناء الرسم.
    expect(src).not.toMatch(/Math\.random|Date\.now|crypto\.randomUUID/);
  });
});

describe('البيانات والترتيب والمجاميع — بلا تغيير', () => {
  it('عدد الصفوف وترتيبها كما هما', () => {
    renderTable();
    const entryRows = document.querySelectorAll('tr.journal-entry-row');
    expect(entryRows).toHaveLength(3);
    expect([...entryRows].map((r) => within(r as HTMLElement).getByRole('strong' as never).textContent))
      .toEqual(['JE-2026-001', 'JE-2026-002', 'JE-2026-003']); // نفس ترتيب الخادم
  });

  it('المجاميع والحالات كما هي', () => {
    renderTable();
    const first = document.querySelectorAll('tr.journal-entry-row')[0] as HTMLElement;
    const nums = [...first.querySelectorAll('td.num')].map((td) => td.textContent);
    expect(nums).toHaveLength(2); // مدين ودائن
    expect(nums[0]).toContain('100');
    expect(nums[1]).toContain('100');
    expect(screen.getAllByText(/مرحّل|مسودة/).length).toBeGreaterThan(0);
  });

  it('الفتح يُظهر سطور القيد بترتيبها، والسطران المتطابقان يظهران كلاهما', () => {
    renderTable();
    fireEvent.click(screen.getByText('فتح الكل'));
    const linesRows = document.querySelectorAll('tr.journal-lines-row');
    expect(linesRows).toHaveLength(3); // صفّ سطور لكل قيد

    // القيد الثاني: سطران متطابقان — لا يُدمجان ولا يختفي أحدهما (دليل تفرّد المفاتيح).
    const second = linesRows[1] as HTMLElement;
    const bodyRows = second.querySelectorAll('.journal-lines-table tbody tr');
    expect(bodyRows).toHaveLength(2);
    for (const r of bodyRows) expect(r.textContent).toContain('5100');
  });

  it('الطيّ يعيد إخفاء السطور — لا صفوف عالقة ولا مكرّرة', () => {
    renderTable();
    fireEvent.click(screen.getByText('فتح الكل'));
    expect(document.querySelectorAll('tr.journal-lines-row')).toHaveLength(3);
    fireEvent.click(screen.getByText('إغلاق الكل'));
    expect(document.querySelectorAll('tr.journal-lines-row')).toHaveLength(0);
    expect(document.querySelectorAll('tr.journal-entry-row')).toHaveLength(3); // القيود باقية
  });
});

/** قراءة المصدر — للتحقّق البنيوي من موضع المفتاح. */
function readFileSyncSafe(path: string): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('node:fs').readFileSync(path, 'utf8');
}
