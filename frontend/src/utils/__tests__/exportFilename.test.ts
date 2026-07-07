import { describe, it, expect } from 'vitest';
import {
  generateExportFileName,
  sanitizeFilenameSegment,
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
});
