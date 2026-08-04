// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useState } from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import AnalysisTable, { MoneyCell, type AnalysisColumn } from '../AnalysisTable';

/* ════════════════════════════════════════════════════════════════════════════
   عقد محاذاة الجداول واقتطاعها.

   العيب الأصلي: صنف المحاذاة كان يُكتب بنوعية (0,1,0) بينما الطقم المشترك يعلن
   `.xpl-table th { text-align: start }` بنوعية (0,1,1) — فيهزم الصنف على الرؤوس
   بينما `.xpl-table td` لا يعلن محاذاة فيُطبَّق على الخلايا. النتيجة رأس محاذٍ
   للبداية فوق بيانات محاذية للنهاية.

   الاختبار يغطّي طرفَي السبب:
     • البنية — الرأس والخليّة وصفّ المجاميع يحملون **نفس** صنف المحاذاة.
     • الأنماط — القاعدة في ورقة الصفحة مؤهَّلة بـ`.fac-table th` فتتفوّق نوعيتها.
   ════════════════════════════════════════════════════════════════════════════ */

interface Row { name: string; amount: number; count: number }

const ROWS: Row[] = [
  { name: 'شركة الطريق الأفضل لمقاولات الطرق والأرصفة العامة', amount: 185950, count: 12 },
  { name: 'بلدية الكويت', amount: 75400, count: 3 },
];

const COLUMNS: AnalysisColumn<Row>[] = [
  { key: 'name', label: 'العميل', truncate: true, title: (r) => r.name, render: (r) => r.name },
  { key: 'amount', label: 'الإيرادات', align: 'end', render: (r) => String(r.amount), total: '261,350' },
  { key: 'count', label: 'العدد', align: 'center', render: (r) => String(r.count), total: '15' },
];

/** رمز المحاذاة الوحيد في قائمة أصناف الخليّة. */
function alignToken(el: Element): string | undefined {
  return Array.from(el.classList).find((c) => c.startsWith('fac-al-'));
}

describe('AnalysisTable — header/body alignment contract', () => {
  it('gives every header the same alignment class as its own body cells', () => {
    render(<AnalysisTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.name} showTotals />);

    const headers = Array.from(document.querySelectorAll('thead th'));
    expect(headers).toHaveLength(COLUMNS.length);

    const bodyRows = Array.from(document.querySelectorAll('tbody tr'));
    for (const row of bodyRows) {
      const cells = Array.from(row.querySelectorAll('td'));
      expect(cells).toHaveLength(COLUMNS.length);
      cells.forEach((cell, i) => {
        expect(alignToken(cell)).toBe(alignToken(headers[i]));
      });
    }
  });

  it('applies the same alignment to the totals row', () => {
    render(<AnalysisTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.name} showTotals />);
    const headers = Array.from(document.querySelectorAll('thead th'));
    const totals = Array.from(document.querySelectorAll('tfoot td'));
    totals.forEach((cell, i) => expect(alignToken(cell)).toBe(alignToken(headers[i])));
  });

  it('marks the truncating column on the header and the cell alike', () => {
    render(<AnalysisTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.name} />);
    const header = document.querySelectorAll('thead th')[0];
    const cell = document.querySelectorAll('tbody td')[0];
    expect(header.classList.contains('fac-truncate')).toBe(true);
    expect(cell.classList.contains('fac-truncate')).toBe(true);
  });

  it('never marks a numeric column as truncating — amounts must stay fully visible', () => {
    render(<AnalysisTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.name} />);
    const cells = Array.from(document.querySelectorAll('tbody tr:first-child td'));
    expect(cells[1].classList.contains('fac-truncate')).toBe(false);
    expect(cells[2].classList.contains('fac-truncate')).toBe(false);
    expect(cells[1].textContent).toBe('185950'); // القيمة كاملة، بلا اختصار
  });

  it('exposes the full text as a tooltip on the truncating cell', () => {
    render(<AnalysisTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.name} />);
    expect(screen.getByTitle(ROWS[0].name)).toBeTruthy();
  });

  it('flags the table so non-truncating columns keep their content width', () => {
    render(<AnalysisTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.name} />);
    expect(document.querySelector('table')!.classList.contains('fac-table--truncating')).toBe(true);
  });

  it('omits the truncating flag when no column truncates', () => {
    const plain: AnalysisColumn<Row>[] = [
      { key: 'name', label: 'العميل', render: (r) => r.name },
      { key: 'amount', label: 'الإيرادات', align: 'end', render: (r) => String(r.amount) },
    ];
    render(<AnalysisTable columns={plain} rows={ROWS} rowKey={(r) => r.name} />);
    expect(document.querySelector('table')!.classList.contains('fac-table--truncating')).toBe(false);
  });
});

describe('AnalysisTable — sorting, search and row activation', () => {
  const SORTABLE: AnalysisColumn<Row>[] = [
    { key: 'name', label: 'العميل', truncate: true, sortValue: (r) => r.name, render: (r) => r.name },
    { key: 'amount', label: 'المتبقي', align: 'end', sortValue: (r) => r.amount, render: (r) => String(r.amount) },
    { key: 'count', label: 'العدد', align: 'center', render: (r) => String(r.count) },
  ];

  const names = () =>
    Array.from(document.querySelectorAll('tbody tr td:first-child')).map((c) => c.textContent);

  beforeEach(() => localStorage.clear());

  it('marks only columns that declare a sortValue as sortable', () => {
    render(<AnalysisTable columns={SORTABLE} rows={ROWS} rowKey={(r) => r.name} sortKey="probe" />);
    const headers = Array.from(document.querySelectorAll('thead th'));
    expect(headers[0].querySelector('button')).toBeTruthy();
    expect(headers[1].querySelector('button')).toBeTruthy();
    expect(headers[2].querySelector('button')).toBeNull(); // بلا sortValue
  });

  it('leaves headers static when the table opts out of sorting', () => {
    render(<AnalysisTable columns={SORTABLE} rows={ROWS} rowKey={(r) => r.name} />);
    expect(document.querySelector('thead th button')).toBeNull();
  });

  it('reorders rows by the raw value, not by the rendered node', () => {
    render(<AnalysisTable columns={SORTABLE} rows={ROWS} rowKey={(r) => r.name} sortKey="probe" />);
    expect(names()).toEqual([ROWS[0].name, ROWS[1].name]); // 185950 ثم 75400

    fireEvent.click(document.querySelectorAll('thead th button')[1]); // تصاعدي بالمبلغ
    expect(names()).toEqual([ROWS[1].name, ROWS[0].name]);
  });

  it('keeps the alignment contract on sortable headers too', () => {
    render(<AnalysisTable columns={SORTABLE} rows={ROWS} rowKey={(r) => r.name} sortKey="probe" showTotals />);
    const headers = Array.from(document.querySelectorAll('thead th'));
    const cells = Array.from(document.querySelectorAll('tbody tr:first-child td'));
    cells.forEach((cell, i) => expect(alignToken(cell)).toBe(alignToken(headers[i])));
  });

  it('filters rows by any searchable column', () => {
    function Harness() {
      const [q, setQ] = useState('');
      return (
        <AnalysisTable
          columns={SORTABLE}
          rows={ROWS}
          rowKey={(r) => r.name}
          searchable
          search={q}
          onSearchChange={setQ}
        />
      );
    }
    render(<Harness />);
    expect(names()).toHaveLength(2);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'بلدية' } });
    expect(names()).toEqual(['بلدية الكويت']);
  });

  it('reports no matches instead of an empty table body', () => {
    function Harness() {
      const [q, setQ] = useState('');
      return (
        <AnalysisTable
          columns={SORTABLE}
          rows={ROWS}
          rowKey={(r) => r.name}
          searchable
          search={q}
          onSearchChange={setQ}
        />
      );
    }
    render(<Harness />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'لا يوجد' } });
    expect(document.querySelector('tbody')).toBeNull();
    expect(document.querySelector('.fac-empty')).toBeTruthy();
  });

  it('activates a row by click and by keyboard', () => {
    const onRowClick = vi.fn();
    render(<AnalysisTable columns={SORTABLE} rows={ROWS} rowKey={(r) => r.name} onRowClick={onRowClick} />);

    const rows = document.querySelectorAll('tbody tr');
    expect(rows[0].className).toContain('xpl-row--click');
    expect(rows[0].getAttribute('tabindex')).toBe('0');

    fireEvent.click(rows[0]);
    expect(onRowClick).toHaveBeenCalledWith(ROWS[0]);

    fireEvent.keyDown(rows[1], { key: 'Enter' });
    expect(onRowClick).toHaveBeenLastCalledWith(ROWS[1]);
  });

  it('does not fire the row handler when a drill button inside it is pressed', () => {
    const onRowClick = vi.fn();
    const onDrill = vi.fn();
    const cols: AnalysisColumn<Row>[] = [
      { key: 'name', label: 'العميل', render: (r) => r.name },
      { key: 'amount', label: 'المتبقي', align: 'end', render: (r) => <MoneyCell value={r.amount} onClick={onDrill} /> },
    ];
    render(<AnalysisTable columns={cols} rows={ROWS} rowKey={(r) => r.name} onRowClick={onRowClick} />);

    fireEvent.click(document.querySelector('tbody .fac-drill')!);
    expect(onDrill).toHaveBeenCalledTimes(1);
    expect(onRowClick).not.toHaveBeenCalled();
  });
});

describe('FinancialAnalysisCenter.css — alignment specificity', () => {
  const css = readFileSync(resolve(__dirname, '../../../pages/FinancialAnalysisCenter.css'), 'utf-8');

  it('qualifies every alignment rule with th AND td so the shared kit cannot win', () => {
    for (const align of ['start', 'end', 'center']) {
      expect(css).toContain(`.fac-table th.fac-al-${align}`);
      expect(css).toContain(`.fac-table td.fac-al-${align}`);
    }
  });

  it('does not fall back to the bare low-specificity selectors that caused the offset', () => {
    // `.fac-al-end { … }` وحدها (0,1,0) تخسر أمام `.xpl-table th` (0,1,1).
    expect(css).not.toMatch(/^\.fac-al-(start|end|center)\s*\{/m);
  });

  it('declares no @page rule — that would leak to every other print surface', () => {
    // التعليقات تُزال أولًا: الشرح داخلها يذكر القاعدة بالاسم عمدًا.
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(withoutComments).not.toMatch(/@page\s*[{:]/);
  });
});
