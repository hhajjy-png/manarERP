// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SortableHeader from '../components/SortableHeader';
import DataTable, { Column } from '../components/DataTable';
import type { TableSortController } from '../hooks/useTableSort';

/**
 * Enterprise Data Grid Foundation v1 — ترويسة الفرز الموحّدة وتكاملها مع
 * DataTable، مع اختبار التوافق الخلفي: بلا متحكّم فرز، الجدول كما كان حرفيًا.
 */

beforeEach(() => {
  localStorage.clear();
});

function renderHeader(state: 'asc' | 'desc' | 'none', onToggle = vi.fn()) {
  render(
    <table>
      <thead>
        <tr>
          <SortableHeader label="الاسم" title="الاسم" state={state} onToggle={onToggle} />
        </tr>
      </thead>
    </table>,
  );
  return onToggle;
}

describe('SortableHeader — unified sort indicator', () => {
  it('renders a real focusable button with the unified idle icon and aria-sort=none', () => {
    renderHeader('none');
    const th = screen.getByRole('columnheader');
    expect(th).toHaveAttribute('aria-sort', 'none');
    const btn = screen.getByRole('button', { name: 'الاسم' });
    expect(btn).toHaveTextContent('unfold_more');
  });

  it('ascending state → arrow_upward + aria-sort=ascending + active class', () => {
    renderHeader('asc');
    expect(screen.getByRole('columnheader')).toHaveAttribute('aria-sort', 'ascending');
    expect(screen.getByRole('button')).toHaveTextContent('arrow_upward');
    expect(screen.getByRole('columnheader').className).toContain('sort-th--active');
  });

  it('descending state → arrow_downward + aria-sort=descending', () => {
    renderHeader('desc');
    expect(screen.getByRole('columnheader')).toHaveAttribute('aria-sort', 'descending');
    expect(screen.getByRole('button')).toHaveTextContent('arrow_downward');
  });

  it('click advances the cycle via onToggle (keyboard Enter/Space native to <button>)', () => {
    const onToggle = renderHeader('none');
    fireEvent.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('click does not bubble beyond the header (row-handler isolation)', () => {
    const rowHandler = vi.fn();
    render(
      <table>
        <thead onClick={rowHandler}>
          <tr>
            <SortableHeader label="س" title="س" state="none" onToggle={vi.fn()} />
          </tr>
        </thead>
      </table>,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(rowHandler).not.toHaveBeenCalled();
  });
});

const COLUMNS: Column[] = [
  { key: 'code', label: 'col.code', sortable: true },
  { key: 'name', label: 'col.customer_name' }, // غير قابل للفرز
];
const ROWS = [{ id: 1, code: 'C-1', name: 'منار' }];

function makeController(overrides?: Partial<TableSortController>): TableSortController {
  return {
    sortBy: null,
    sortDir: 'asc',
    getState: () => 'none',
    toggle: vi.fn(),
    reset: vi.fn(),
    ...overrides,
  };
}

describe('DataTable — sort integration + backward compatibility', () => {
  it('BACKWARD COMPAT: without a sort controller, sortable columns render plain headers (no button)', () => {
    const { container } = render(<DataTable columns={COLUMNS} rows={ROWS} />);
    const headers = screen.getAllByRole('columnheader');
    expect(headers.length).toBeGreaterThanOrEqual(2);
    expect(container.querySelector('.sort-th-btn')).toBeNull();
  });

  it('with a controller: sortable column gets the sort button; non-sortable stays plain', () => {
    const controller = makeController();
    const { container } = render(<DataTable columns={COLUMNS} rows={ROWS} sort={controller} />);
    // عمود واحد فقط معلَّم sortable → زر فرز واحد بالضبط، باسمه المُعرَّب («الرقم»)
    const sortButtons = container.querySelectorAll('.sort-th-btn');
    expect(sortButtons).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'الرقم' }));
    expect(controller.toggle).toHaveBeenCalledWith('code');
  });

  it('zebra stays OFF by default (no dt-table--zebra class)', () => {
    const { container } = render(<DataTable columns={COLUMNS} rows={ROWS} />);
    expect(container.querySelector('table')!.className).not.toContain('dt-table--zebra');
    expect(container.querySelector('table')!.className).toContain('dt-table');
  });
});

describe('DataTable — row number standard (#)', () => {
  const NUM_COLUMNS: Column[] = [
    { key: 'rowNo', label: '#', rowNumber: true },
    { key: 'name', label: 'col.customer_name' },
  ];
  const THREE_ROWS = [
    { id: 10, name: 'أ' },
    { id: 11, name: 'ب' },
    { id: 12, name: 'ج' },
  ];

  it('page 1 numbers rows 1..n', () => {
    const meta = { page: 1, pageSize: 15, total: 40, totalPages: 3 };
    const { container } = render(<DataTable columns={NUM_COLUMNS} rows={THREE_ROWS} meta={meta} />);
    const firstCells = [...container.querySelectorAll('tbody tr')].map((tr) => tr.querySelector('td')!.textContent);
    expect(firstCells).toEqual(['1', '2', '3']);
  });

  it('page 2 continues numbering naturally (pageSize 15 → starts at 16)', () => {
    const meta = { page: 2, pageSize: 15, total: 40, totalPages: 3 };
    const { container } = render(<DataTable columns={NUM_COLUMNS} rows={THREE_ROWS} meta={meta} />);
    const firstCells = [...container.querySelectorAll('tbody tr')].map((tr) => tr.querySelector('td')!.textContent);
    expect(firstCells).toEqual(['16', '17', '18']);
  });

  it('row-number column is never sortable (no sort button even with a controller)', () => {
    const { container } = render(
      <DataTable columns={NUM_COLUMNS} rows={THREE_ROWS} sort={makeController()} />,
    );
    expect(container.querySelector('.sort-th-btn')).toBeNull();
  });
});
