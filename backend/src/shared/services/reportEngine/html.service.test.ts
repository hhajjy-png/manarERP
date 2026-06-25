import { describe, it, expect } from 'vitest';
import { buildReportHtml } from './html.service';
import type { ReportInput } from './excel.service';

const SAMPLE: ReportInput = {
  title:    'كشف حساب — شركة المنار',
  subtitle: 'من 2026-01-01 إلى 2026-06-30',
  columns: [
    { header: 'التاريخ',  key: 'date',   width: 14 },
    { header: 'البيان',   key: 'desc',   width: 30 },
    { header: 'مدين',     key: 'debit',  width: 14 },
    { header: 'دائن',     key: 'credit', width: 14 },
    { header: 'الرصيد',   key: 'bal',    width: 14 },
  ],
  rows: [
    { date: '2026-01-15', desc: 'فاتورة نقل',   debit: 1500.500, credit: '',        bal: 1500.500 },
    { date: '2026-02-01', desc: 'دفعة مقبوضة', debit: '',       credit: 1000.000,  bal: 500.500  },
  ],
  totalsRow: { date: '', desc: 'الإجمالي', debit: 1500.500, credit: 1000.000, bal: 500.500 },
};

describe('buildReportHtml', () => {
  it('returns a non-empty string', () => {
    const html = buildReportHtml(SAMPLE);
    expect(typeof html).toBe('string');
    expect(html.length).toBeGreaterThan(200);
  });

  it('contains the report title in Arabic', () => {
    const html = buildReportHtml(SAMPLE);
    expect(html).toContain('كشف حساب');
    expect(html).toContain('شركة المنار');
  });

  it('contains the subtitle', () => {
    const html = buildReportHtml(SAMPLE);
    expect(html).toContain('من 2026-01-01');
  });

  it('has RTL direction on html element', () => {
    const html = buildReportHtml(SAMPLE);
    expect(html).toMatch(/dir=["']rtl["']/);
  });

  it('contains all column headers', () => {
    const html = buildReportHtml(SAMPLE);
    expect(html).toContain('التاريخ');
    expect(html).toContain('البيان');
    expect(html).toContain('مدين');
    expect(html).toContain('دائن');
    expect(html).toContain('الرصيد');
  });

  it('contains row data', () => {
    const html = buildReportHtml(SAMPLE);
    expect(html).toContain('فاتورة نقل');
    expect(html).toContain('دفعة مقبوضة');
  });

  it('contains the totals row', () => {
    const html = buildReportHtml(SAMPLE);
    expect(html).toContain('الإجمالي');
  });

  it('has A4 landscape page size in CSS', () => {
    const html = buildReportHtml(SAMPLE);
    expect(html).toMatch(/size:\s*A4\s+landscape/);
  });

  it('has @font-face with Cairo', () => {
    const html = buildReportHtml(SAMPLE);
    expect(html).toContain('@font-face');
    expect(html).toContain('Cairo');
  });

  it('escapes HTML special characters in cell values', () => {
    const dangerous: ReportInput = {
      title:   'Test',
      columns: [{ header: 'Val', key: 'v', width: 10 }],
      rows:    [{ v: '<script>alert(1)</script>' }],
    };
    const html = buildReportHtml(dangerous);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
