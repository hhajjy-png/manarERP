// @vitest-environment jsdom
/**
 * جداول المركز المالي — تُصيَّر ببيانات فعلية، لا بفحص نصّي للمصدر.
 *
 * العقد: **الرمز مرّة واحدة في عنوان العمود، والخليّة رقم مجرّد**، والصفر قيمة
 * («0.000») لا فراغًا. هذا ما خالفه N-1 (خلايا بلا عملة في دفتر اليومية) وN-2
 * (تكرار العملة وإخفاء الصفر في كشف الحساب والمجمَّع).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render as rtlRender, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { ROUTER_FUTURE } from './helpers/router';

/** الجداول تحوي روابط تنقّل (DrillDownLink) فتحتاج راوترًا. */
const render = (ui: ReactElement) =>
  rtlRender(<MemoryRouter future={ROUTER_FUTURE}>{ui}</MemoryRouter>);

import { StatementTable } from '../components/financial/StatementTable';
import { GroupedTable } from '../components/financial/GroupedTable';
import { JournalBookTable } from '../components/financial/JournalBookTable';

let currencyLanguage: 'english' | 'arabic' = 'english';
vi.mock('../stores/settingsStore', () => ({
  currentCurrencyLanguage: () => currencyLanguage,
  useSettings: (sel: (s: Record<string, unknown>) => unknown) => sel({ currencyLanguage }),
}));
vi.mock('../stores/uiStore', () => ({ useUI: () => false }));

const STATE = { reportType: 'statement', filters: {} } as never;

const STATEMENT_ROWS = [
  { id: 's1', date: '2026-01-31', referenceType: 'INVOICE', referenceId: 1, referenceNumber: 'INV-1',
    description: 'فاتورة', debit: 12455, credit: 0, runningBalance: 12455 },
  { id: 's2', date: '2026-02-01', referenceType: 'PAYMENT', referenceId: 2, referenceNumber: 'PAY-1',
    description: 'تحصيل', debit: 0, credit: 12455, runningBalance: 0 },
] as never;

const JOURNAL_ROWS = [
  {
    id: 'j1', entryNumber: 'JE-1', date: '2026-01-31', description: 'قيد',
    referenceType: 'INVOICE', referenceId: 1, referenceNumber: 'INV-1', status: 'POSTED',
    totalDebit: 12455, totalCredit: 12455,
    lines: [
      { accountCode: '1100', accountName: 'الصندوق', description: 'قبض', debit: 12455, credit: 0 },
      { accountCode: '4100', accountName: 'الإيرادات', description: 'إيراد', debit: 0, credit: 12455 },
    ],
  },
] as never;

beforeEach(() => { currencyLanguage = 'english'; });
afterEach(cleanup);

/** كل خليّة رقمية في الجدول: رقم مجرّد بلا رمز. */
function expectBareMoneyCells(container: HTMLElement) {
  const cells = [...container.querySelectorAll('td.num')].map((td) => td.textContent!.trim());
  const money = cells.filter((c) => /\d/.test(c));
  expect(money.length).toBeGreaterThan(0);
  for (const c of money) {
    expect(c).not.toMatch(/KWD|د\.ك/);        // الرمز في العنوان لا في الخليّة
    expect(c).toMatch(/^-?[\d,]+\.\d{3}$/);   // ثلاث منازل ثابتة
  }
}

describe('StatementTable — كشف الحساب (N-2)', () => {
  it('العنوان يحمل الرمز مرّة واحدة، والخليّة رقم مجرّد', () => {
    const { container } = render(<StatementTable rows={STATEMENT_ROWS} currentState={STATE} />);

    expect(screen.getByText('مدين (KWD)')).toBeInTheDocument();
    expect(screen.getByText('دائن (KWD)')).toBeInTheDocument();
    expect(screen.getByText('الرصيد (KWD)')).toBeInTheDocument();

    expectBareMoneyCells(container);
    expect(screen.getAllByText('12,455.000').length).toBeGreaterThan(0);
    expect(container.textContent).not.toMatch(/\d\.\d{3}\s*KWD/);   // زال تكرار العملة
  });

  it('**الصفر لا يختفي**: مدين صفري يُقرأ 0.000 لا فراغًا', () => {
    const { container } = render(<StatementTable rows={STATEMENT_ROWS} currentState={STATE} />);
    const zeros = [...container.querySelectorAll('td.num')].filter((td) => td.textContent!.trim() === '0.000');
    expect(zeros.length).toBeGreaterThanOrEqual(2);   // مدين الصفّ الثاني + رصيد ختامي صفري
  });
});

describe('GroupedTable — المجمَّع (N-2)', () => {
  it('العنوان يحمل الرمز، والخلايا مجرّدة بثلاث منازل', () => {
    const { container } = render(<GroupedTable rows={STATEMENT_ROWS} currentState={STATE} />);
    expect(screen.getByText('مدين (KWD)')).toBeInTheDocument();
    expect(screen.getByText('دائن (KWD)')).toBeInTheDocument();
    expectBareMoneyCells(container);
    expect(container.textContent).not.toMatch(/\d\.\d{3}\s*KWD/);
  });
});

describe('JournalBookTable — دفتر اليومية (N-1)', () => {
  it('عناوين مدين/دائن تحمل الرمز، والخلايا بلا رمز', () => {
    const { container } = render(<JournalBookTable rows={JOURNAL_ROWS} currentState={STATE} />);

    expect(screen.getAllByText('مدين (KWD)').length).toBeGreaterThan(0);
    expect(screen.getAllByText('دائن (KWD)').length).toBeGreaterThan(0);

    expectBareMoneyCells(container);
    expect(container.textContent).not.toMatch(/\d\.\d{3}\s*KWD/);
  });

  it('جدول **سطور القيد** الداخلي يتبع المعيار نفسه (رأس مستقلّ)', () => {
    const { container } = render(<JournalBookTable rows={JOURNAL_ROWS} currentState={STATE} />);
    fireEvent.click(screen.getByText('فتح الكل'));   // السطور تُصيَّر عند التوسيع فقط

    const inner = container.querySelector('.journal-lines-table') as HTMLElement | null;
    expect(inner).toBeInTheDocument();

    const heads = [...inner!.querySelectorAll('th')].map((th) => th.textContent!.trim());
    expect(heads).toContain('مدين (KWD)');
    expect(heads).toContain('دائن (KWD)');

    // سطر بمدين صفري: «0.000» لا فراغ.
    const nums = [...inner!.querySelectorAll('td.num')].map((td) => td.textContent!.trim());
    expect(nums).toContain('0.000');
    expect(nums.every((n) => !/KWD|د\.ك/.test(n))).toBe(true);
  });
});

describe('إعداد رمز العملة — العنوان يتبعه، والخلية لا تتغيّر', () => {
  it('عربي ⇒ «مدين (د.ك)» والخلية تبقى 12,455.000', () => {
    currencyLanguage = 'arabic';
    const { container } = render(<StatementTable rows={STATEMENT_ROWS} currentState={STATE} />);
    expect(screen.getByText('مدين (د.ك)')).toBeInTheDocument();
    expect(screen.getAllByText('12,455.000').length).toBeGreaterThan(0);
    expect(container.textContent).not.toMatch(/[٠-٩]/);   // أرقام غربية دائمًا
  });
});
