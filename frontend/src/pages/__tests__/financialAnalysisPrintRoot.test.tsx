// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FinancialPeriodProvider } from '../../context/FinancialPeriodContext';

/* ════════════════════════════════════════════════════════════════════════════
   جذر الطباعة — حدّ بنيوي لا صنف CSS.

   الاستبعاد من PDF لم يعد مرهونًا بـ`no-print`: شريط الفلاتر وأزرار التصدير
   ودرج التفصيل تعيش **خارج** `.fac-report`، وهي العقدة الوحيدة التي تُركَّب إلى
   مستند PDF. الأقسام السبعة كلها بداخلها، بترتيب الصفحة.
   ════════════════════════════════════════════════════════════════════════════ */

const getMock = vi.fn();
vi.mock('../../api/client', () => ({ api: { get: (...args: unknown[]) => getMock(...args) } }));

import FinancialAnalysisCenter from '../FinancialAnalysisCenter';

const REPORT = {
  period: { from: '2026-01-01', to: '2026-12-31', days: 365, previousFrom: '2025-01-01', previousTo: '2025-12-31' },
  profitability: {
    kpis: { revenue: 3000, expenses: 900, profit: 2100, profitMargin: 70 },
    rows: [
      { key: 'revenue', amount: 3000, percentOfRevenue: 100, changePercent: 50, status: 'excellent' },
      { key: 'expenses', amount: 900, percentOfRevenue: 30, changePercent: -10, status: 'excellent' },
      { key: 'profit', amount: 2100, percentOfRevenue: 70, changePercent: 110, status: 'excellent' },
    ],
  },
  revenue: {
    kpis: { totalRevenue: 3000, invoiceCount: 3, averageInvoice: 1000, topMonth: '2026-01', topMonthRevenue: 1500 },
    rows: [{ month: '2026-01', revenue: 1500, invoiceCount: 2, averageInvoice: 750 }],
  },
  expenses: {
    kpis: { totalExpenses: 900, expenseCount: 3, averageExpense: 300, topCategory: 'FUEL', topCategoryAmount: 700 },
    rows: [{ category: 'FUEL', amount: 700, percent: 77.8, count: 2 }],
  },
  collections: {
    kpis: { collected: 1200, outstanding: 1800, collectionRate: 40, averageCollection: 600 },
    rows: [{ customerId: 1, customerName: 'عميل أ', invoiced: 2500, collected: 1200, outstanding: 1300, collectionRate: 48 }],
  },
  receivables: {
    asOf: '2026-12-31',
    kpis: { totalOutstanding: 1300, debtorCount: 1, averagePerDebtor: 1300, averageAgeDays: 40, oldestAgeDays: 40, highRiskOutstanding: 0 },
    rows: [{
      customerId: 1, customerName: 'عميل أ', invoiced: 2500, collected: 1200, outstanding: 1300,
      collectionRate: 48, lastPaymentDate: '2026-02-12', oldestOpenInvoiceDate: '2026-01-10',
      oldestOpenInvoiceNumber: 'INV-1', debtAgeDays: 40, status: 'good',
    }],
  },
  monthlyPerformance: {
    rows: [{ month: '2026-01', revenue: 1500, expenses: 600, profit: 900, collections: 800, profitMargin: 60 }],
    totals: { revenue: 3000, expenses: 900, profit: 2100, collections: 1200, profitMargin: 70 },
  },
  topLists: {
    topCustomers: [{ customerId: 1, customerName: 'عميل أ', revenue: 2500 }],
    topExpenseCategories: [{ category: 'FUEL', amount: 700 }],
    topProfitMonths: [{ month: '2026-01', profit: 900 }],
  },
  indicators: { rows: [{ key: 'expenseRatio', value: 30, format: 'percent', status: 'excellent' }] },
  monthAxisTruncated: false,
};

async function settle(rounds = 10) {
  await act(async () => {
    for (let i = 0; i < rounds; i++) await new Promise((r) => setTimeout(r, 0));
  });
}

async function renderPage() {
  render(
    <MemoryRouter>
      <FinancialPeriodProvider>
        <FinancialAnalysisCenter />
      </FinancialPeriodProvider>
    </MemoryRouter>,
  );
  await settle();
}

describe('FinancialAnalysisCenter — print root boundary', () => {
  beforeEach(() => {
    getMock.mockReset();
    getMock.mockImplementation(async () => ({ data: { data: structuredClone(REPORT) } }));
    sessionStorage.clear();
  });

  it('exposes exactly one print root', async () => {
    await renderPage();
    expect(document.querySelectorAll('[data-print-report]')).toHaveLength(1);
  });

  it('keeps the filter bar OUTSIDE the print root', async () => {
    await renderPage();
    const root = document.querySelector('[data-print-report]')!;
    const filter = document.querySelector('.fac-filter')!;
    expect(filter).toBeTruthy();
    expect(root.contains(filter)).toBe(false);
  });

  it('keeps the export buttons OUTSIDE the print root', async () => {
    await renderPage();
    const root = document.querySelector('[data-print-report]')!;
    const exportBar = document.querySelector('.fac-export')!;
    expect(exportBar).toBeTruthy();
    expect(root.contains(exportBar)).toBe(false);
  });

  it('contains all eight declared print sections, in page order', async () => {
    await renderPage();
    const root = document.querySelector('[data-print-report]')!;
    const sections = Array.from(root.querySelectorAll('[data-print-section]'));
    expect(sections.map((s) => s.getAttribute('data-print-section'))).toEqual(
      ['1', '2', '3', '4', '5', '6', '7', '8'],
    );
  });

  it('contains every KPI card inside the print root', async () => {
    await renderPage();
    const root = document.querySelector('[data-print-report]')!;
    const all = document.querySelectorAll('.xpl-metric');
    expect(all.length).toBeGreaterThan(0);
    for (const card of all) expect(root.contains(card)).toBe(true);
  });

  it('contains every table inside the print root', async () => {
    await renderPage();
    const root = document.querySelector('[data-print-report]')!;
    const tables = document.querySelectorAll('table.fac-table');
    expect(tables.length).toBeGreaterThan(0);
    for (const table of tables) expect(root.contains(table)).toBe(true);
  });

  it('carries a print-only document header with period and generation date', async () => {
    await renderPage();
    const head = document.querySelector('[data-print-report] .fac-report-head')!;
    expect(head).toBeTruthy();
    expect(head.textContent).toContain('2026-01-01');
    expect(head.textContent).toContain('2026-12-31');
  });
});

describe('FinancialAnalysisCenter — PDF geometry wiring', () => {
  const src = readFileSync(resolve(__dirname, '../FinancialAnalysisCenter.tsx'), 'utf-8');

  it('requests the landscape page spec', () => {
    expect(src).toContain("getPageSpec('a4-landscape')");
    expect(src).not.toContain("getPageSpec('a4-portrait')");
  });

  it('forces the spec so the global @page cannot silently override it', () => {
    expect(src).toContain('forcePageSpec: true');
  });
});

describe('FinancialAnalysisCenter.css — print rules stay scoped', () => {
  const css = readFileSync(resolve(__dirname, '../FinancialAnalysisCenter.css'), 'utf-8');

  it('declares no @page rule of its own', () => {
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(withoutComments).not.toMatch(/@page\s*[{:]/);
  });

  it('repeats table headers and footers across page breaks', () => {
    expect(css).toContain('display: table-header-group');
    expect(css).toContain('display: table-footer-group');
  });

  it('protects declared print sections from being split', () => {
    expect(css).toContain('[data-print-section]');
    expect(css).toContain('break-inside: avoid');
  });
});
