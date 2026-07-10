import { describe, it, expect } from 'vitest';
import {
  generateExportFileName,
  sanitizeFilenameSegment,
  resourceReportName,
  ReportName,
} from '../exportFilename';

describe('sanitizeFilenameSegment', () => {
  it('removes Windows/POSIX illegal characters', () => {
    expect(sanitizeFilenameSegment('a\\b/c:d*e?f"g<h>i|j')).toBe('abcdefghij');
  });
  it('replaces whitespace runs with a single underscore', () => {
    expect(sanitizeFilenameSegment('my  file   name')).toBe('my_file_name');
  });
  it('collapses repeated underscores', () => {
    expect(sanitizeFilenameSegment('a__b___c')).toBe('a_b_c');
  });
  it('trims leading/trailing underscore, dash and dot', () => {
    expect(sanitizeFilenameSegment('_-.name.-_')).toBe('name');
  });
  it('preserves Arabic characters verbatim', () => {
    expect(sanitizeFilenameSegment('شركة المنار')).toBe('شركة_المنار');
  });
  it('returns empty string for null/undefined', () => {
    expect(sanitizeFilenameSegment(null)).toBe('');
    expect(sanitizeFilenameSegment(undefined)).toBe('');
  });
});

describe('generateExportFileName', () => {
  const date = '2026-07-07';

  it('assembles the full standard format', () => {
    expect(
      generateExportFileName({
        reportName: ReportName.Invoice,
        identifier: 'INV-10254',
        date,
        extension: 'pdf',
      }),
    ).toBe('manarERP_Invoice_INV-10254_2026-07-07.pdf');
  });

  // ── Financial Period Awareness في اسم الملف ──────────────────────────────────
  it('flow report: يُدرِج نطاق from/to قبل تاريخ الإنشاء', () => {
    expect(
      generateExportFileName({
        reportName: 'Profit-and-Loss',
        date,
        period: { from: '2024-01-01', to: '2024-12-31' },
        extension: 'xlsx',
      }),
    ).toBe('manarERP_Profit-and-Loss_2024-01-01_2024-12-31_2026-07-07.xlsx');
  });

  it('point-in-time report: يُدرِج As-Of', () => {
    expect(
      generateExportFileName({
        reportName: 'Trial-Balance',
        date,
        period: { asOf: '2024-12-31' },
        extension: 'xlsx',
      }),
    ).toBe('manarERP_Trial-Balance_As-Of_2024-12-31_2026-07-07.xlsx');
  });

  it('all periods: يُدرِج All-Periods صراحةً', () => {
    expect(
      generateExportFileName({ reportName: 'Invoices-Report', date, period: { allPeriods: true }, extension: 'xlsx' }),
    ).toBe('manarERP_Invoices-Report_All-Periods_2026-07-07.xlsx');
  });

  it('بلا فترة: السلوك القديم دون تغيير (توافق رجعي)', () => {
    expect(
      generateExportFileName({ reportName: ReportName.Invoice, identifier: 'INV-1', date, extension: 'pdf' }),
    ).toBe('manarERP_Invoice_INV-1_2026-07-07.pdf');
  });

  it('تاريخ الإنشاء يبقى مقطعًا منفصلًا عن فترة التقرير', () => {
    const name = generateExportFileName({
      reportName: 'Customer-Statement',
      date: '2026-07-07',
      period: { from: '2024-01-01', to: '2024-12-31' },
      extension: 'pdf',
    });
    // الفترة (2024) والإنشاء (2026) كلاهما حاضر ومنفصل.
    expect(name).toContain('2024-01-01_2024-12-31');
    expect(name).toContain('2026-07-07');
  });

  it('omits the identifier segment when absent', () => {
    expect(
      generateExportFileName({
        reportName: ReportName.TrialBalance,
        date,
        extension: 'xlsx',
      }),
    ).toBe('manarERP_TrialBalance_2026-07-07.xlsx');
  });

  it('omits the identifier segment when empty/whitespace', () => {
    expect(
      generateExportFileName({
        reportName: ReportName.TrialBalance,
        identifier: '   ',
        date,
        extension: 'xlsx',
      }),
    ).toBe('manarERP_TrialBalance_2026-07-07.xlsx');
  });

  it('keeps an Arabic identifier without translating', () => {
    expect(
      generateExportFileName({
        reportName: ReportName.CustomerStatement,
        identifier: 'مؤسسة الخليج',
        date,
        extension: 'xlsx',
      }),
    ).toBe('manarERP_CustomerStatement_مؤسسة_الخليج_2026-07-07.xlsx');
  });

  it('strips a stray leading dot on the extension and lowercases it', () => {
    expect(
      generateExportFileName({
        reportName: ReportName.Report,
        identifier: 'payroll',
        date,
        extension: '.PDF',
      }),
    ).toBe('manarERP_Report_payroll_2026-07-07.pdf');
  });

  it('accepts a numeric identifier', () => {
    expect(
      generateExportFileName({
        reportName: ReportName.GeneralLedger,
        identifier: 110100,
        date,
        extension: 'pdf',
      }),
    ).toBe('manarERP_GeneralLedger_110100_2026-07-07.pdf');
  });

  it('defaults to today (YYYY-MM-DD) when no date is given', () => {
    const name = generateExportFileName({
      reportName: ReportName.PayrollReport,
      extension: 'pdf',
    });
    expect(name).toMatch(/^manarERP_PayrollReport_\d{4}-\d{2}-\d{2}\.pdf$/);
  });

  it('sanitizes illegal characters inside the identifier', () => {
    expect(
      generateExportFileName({
        reportName: ReportName.CustomerStatement,
        identifier: 'CUST/001:A',
        date,
        extension: 'xlsx',
      }),
    ).toBe('manarERP_CustomerStatement_CUST001A_2026-07-07.xlsx');
  });

  it('builds the Expenses report filename', () => {
    expect(
      generateExportFileName({
        reportName: ReportName.Expenses,
        date,
        extension: 'xlsx',
      }),
    ).toBe('manarERP_Expenses_2026-07-07.xlsx');
  });

  it('builds the PayrollReport filename with a period identifier', () => {
    expect(
      generateExportFileName({
        reportName: ReportName.PayrollReport,
        identifier: '2026-07',
        date,
        extension: 'xlsx',
      }),
    ).toBe('manarERP_PayrollReport_2026-07_2026-07-07.xlsx');
  });
});

describe('resourceReportName', () => {
  const date = '2026-07-07';

  it('maps known data-module keys to their canonical PascalCase ReportName', () => {
    expect(resourceReportName('customers')).toBe(ReportName.Customers);
    expect(resourceReportName('suppliers')).toBe(ReportName.Suppliers);
    expect(resourceReportName('equipment')).toBe(ReportName.Equipment);
    expect(resourceReportName('employees')).toBe(ReportName.Employees);
    expect(resourceReportName('contracts')).toBe(ReportName.Contracts);
    expect(resourceReportName('expenses')).toBe(ReportName.Expenses);
    expect(resourceReportName('users')).toBe(ReportName.Users);
  });

  it('falls back to PascalCase for an unmapped (future) module key', () => {
    expect(resourceReportName('bank-accounts')).toBe('BankAccounts');
    expect(resourceReportName('purchase_orders')).toBe('PurchaseOrders');
  });

  it('produces a canonical CRUD export filename end-to-end', () => {
    expect(
      generateExportFileName({
        reportName: resourceReportName('customers'),
        date,
        extension: 'xlsx',
      }),
    ).toBe('manarERP_Customers_2026-07-07.xlsx');
  });
});
