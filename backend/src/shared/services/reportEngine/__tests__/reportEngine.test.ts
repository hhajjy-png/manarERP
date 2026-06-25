import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildReportHtml } from '../html.service';
import { buildStyles, resolveTablePadding, resolveLogoWidth, resolveLogoJustify } from '../styles.template';
import { buildBrandingHeader } from '../branding.template';
import { buildReportHeader } from '../header.template';
import { buildTable } from '../table.template';
import { buildWatermark } from '../watermark.template';
import { buildSummaryCards } from '../summary.template';
import { esc, fmtCell } from '../htmlUtils';

// Stub fs so font-read doesn't fail in test environment
vi.mock('fs', () => ({
  default: { readFileSync: vi.fn().mockReturnValue(Buffer.from('fake-font')) },
}));
vi.mock('path', () => ({
  default: { resolve: vi.fn().mockReturnValue('/fake/Cairo-Regular.ttf') },
}));

const BASE_INPUT = {
  title:    'تقرير تجريبي',
  subtitle: 'اختبار المحرك الموحّد',
  columns: [
    { header: 'الاسم',    key: 'name',   width: 20 },
    { header: 'المبلغ',   key: 'amount', width: 16 },
  ],
  rows: [
    { name: 'عميل أول',  amount: 1500.500 },
    { name: 'عميل ثانٍ', amount: 2000.000 },
  ],
  totalsRow: { name: 'الإجمالي', amount: 3500.500 },
};

const SAMPLE_BRANDING = {
  companyNameAr: 'شركة المنار الدولية',
  companyNameEn: 'Al Manar International Co.',
  phone:         '22223333',
  address:       'الكويت',
  primaryColor:  '#1d4e6f',
};

// ─── buildReportHtml ──────────────────────────────────────────────────────────

describe('buildReportHtml', () => {
  beforeEach(() => {
    // reset font cache between tests
    vi.resetModules();
  });

  it('returns non-empty HTML document', () => {
    const html = buildReportHtml(BASE_INPUT);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html.length).toBeGreaterThan(200);
  });

  it('sets RTL direction and Arabic lang', () => {
    const html = buildReportHtml(BASE_INPUT);
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('lang="ar"');
  });

  it('includes report title in <title> and visible heading', () => {
    const html = buildReportHtml(BASE_INPUT);
    expect(html).toContain('<title>تقرير تجريبي</title>');
    expect(html).toContain('تقرير تجريبي');
  });

  it('includes subtitle', () => {
    expect(buildReportHtml(BASE_INPUT)).toContain('اختبار المحرك الموحّد');
  });

  it('includes all column headers', () => {
    const html = buildReportHtml(BASE_INPUT);
    expect(html).toContain('الاسم');
    expect(html).toContain('المبلغ');
  });

  it('includes row data', () => {
    expect(buildReportHtml(BASE_INPUT)).toContain('عميل أول');
  });

  it('includes totals row', () => {
    expect(buildReportHtml(BASE_INPUT)).toContain('الإجمالي');
  });

  it('escapes XSS in title', () => {
    const html = buildReportHtml({ ...BASE_INPUT, title: '<script>alert(1)</script>' });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('is backward-compatible when called without options', () => {
    const html = buildReportHtml(BASE_INPUT);
    expect(html).toBeTruthy();
    // No crash, no branding header (company-header class not expected without branding option)
    expect(html).not.toContain('class="company-header"');
  });

  it('shows company header when branding provided', () => {
    const html = buildReportHtml(BASE_INPUT, { branding: SAMPLE_BRANDING });
    expect(html).toContain('class="company-header"');
    expect(html).toContain('شركة المنار الدولية');
  });

  it('shows watermark text when watermark option set', () => {
    const html = buildReportHtml(BASE_INPUT, { watermark: 'draft' });
    expect(html).toContain('مسودة');
  });

  it('shows signature area when showSignatureArea is true', () => {
    const html = buildReportHtml(BASE_INPUT, { showSignatureArea: true });
    expect(html).toContain('المحاسب');
    expect(html).toContain('المدير العام');
  });

  it('shows notes when provided', () => {
    const html = buildReportHtml(BASE_INPUT, { notes: 'ملاحظة مهمة' });
    expect(html).toContain('ملاحظة مهمة');
  });

  it('includes @font-face for Cairo when font is available', () => {
    const html = buildReportHtml(BASE_INPUT);
    expect(html).toContain("font-family: 'Cairo'");
  });

  it('includes date range when provided in options', () => {
    const html = buildReportHtml(BASE_INPUT, {
      dateRange: { from: '2026-01-01', to: '2026-06-30' },
    });
    expect(html).toContain('2026-01-01');
    expect(html).toContain('2026-06-30');
  });

  it('uses a4-landscape by default (landscape in @page CSS)', () => {
    const html = buildReportHtml(BASE_INPUT);
    expect(html).toContain('landscape');
  });

  it('uses portrait for a4-portrait profile', () => {
    const html = buildReportHtml(BASE_INPUT, { profile: 'a4-portrait' });
    expect(html).toContain('portrait');
  });
});

// ─── buildStyles ─────────────────────────────────────────────────────────────

describe('buildStyles', () => {
  it('contains A4 landscape for default profile', () => {
    const css = buildStyles('a4-landscape');
    expect(css).toContain('A4');
    expect(css).toContain('landscape');
  });

  it('contains portrait for a4-portrait profile', () => {
    expect(buildStyles('a4-portrait')).toContain('portrait');
  });

  it('contains A5 for receipt profile', () => {
    expect(buildStyles('receipt')).toContain('A5');
  });

  it('applies custom primary color from branding', () => {
    const css = buildStyles('a4-landscape', { companyNameAr: 'test', primaryColor: '#ff0000' });
    expect(css).toContain('#ff0000');
  });

  it('uses default color #1d4e6f when no branding', () => {
    expect(buildStyles('a4-landscape')).toContain('#1d4e6f');
  });

  it('includes @page counter for page numbers', () => {
    const css = buildStyles('a4-landscape');
    expect(css).toContain('counter(page)');
  });

  it('embeds fontFace string when provided', () => {
    const css = buildStyles('a4-landscape', undefined, '@font-face { test }');
    expect(css).toContain('@font-face { test }');
  });
});

// ─── buildBrandingHeader ─────────────────────────────────────────────────────

describe('buildBrandingHeader', () => {
  it('includes Arabic company name', () => {
    const html = buildBrandingHeader({ companyNameAr: 'شركة المنار' });
    expect(html).toContain('شركة المنار');
  });

  it('includes English company name when provided', () => {
    const html = buildBrandingHeader({ companyNameAr: 'شركة', companyNameEn: 'Al Manar' });
    expect(html).toContain('Al Manar');
  });

  it('includes phone in contact line', () => {
    const html = buildBrandingHeader({ companyNameAr: 'شركة', phone: '22223333' });
    expect(html).toContain('22223333');
  });

  it('includes address in contact line', () => {
    const html = buildBrandingHeader({ companyNameAr: 'شركة', address: 'الكويت' });
    expect(html).toContain('الكويت');
  });

  it('escapes XSS in company name', () => {
    const html = buildBrandingHeader({ companyNameAr: '<img onerror=alert(1)>' });
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('uses logo placeholder div when no logoBase64', () => {
    const html = buildBrandingHeader({ companyNameAr: 'شركة' });
    expect(html).toContain('company-logo-placeholder');
  });

  it('uses img tag when logoBase64 provided', () => {
    const html = buildBrandingHeader({ companyNameAr: 'شركة', logoBase64: 'abc123' });
    expect(html).toContain('<img');
    expect(html).toContain('abc123');
  });

  it('applies min-height inline style when headerHeight config is provided', () => {
    const html = buildBrandingHeader({ companyNameAr: 'شركة' }, { headerHeight: '70px' });
    expect(html).toContain('min-height');
    expect(html).toContain('70px');
  });

  it('does NOT apply min-height when no config provided (backward compat)', () => {
    const html = buildBrandingHeader({ companyNameAr: 'شركة' });
    expect(html).not.toContain('min-height');
  });

  it('includes branding-logo-wrap wrapper always', () => {
    const html = buildBrandingHeader({ companyNameAr: 'شركة' });
    expect(html).toContain('branding-logo-wrap');
  });
});

// ─── buildReportHeader ────────────────────────────────────────────────────────

describe('buildReportHeader', () => {
  it('includes report title', () => {
    const html = buildReportHeader(BASE_INPUT);
    expect(html).toContain('تقرير تجريبي');
  });

  it('includes subtitle when present', () => {
    const html = buildReportHeader(BASE_INPUT);
    expect(html).toContain('اختبار المحرك الموحّد');
  });

  it('omits subtitle element when not provided', () => {
    const inputNoSub = { ...BASE_INPUT, subtitle: undefined };
    const html = buildReportHeader(inputNoSub);
    expect(html).not.toContain('report-subtitle');
  });

  it('shows date range when provided', () => {
    const html = buildReportHeader(BASE_INPUT, { dateRange: { from: '2026-01-01', to: '2026-06-30' } });
    expect(html).toContain('2026-01-01');
    expect(html).toContain('2026-06-30');
  });

  it('includes generatedBy in the generated line', () => {
    const html = buildReportHeader(BASE_INPUT, { generatedBy: 'admin' });
    expect(html).toContain('admin');
  });
});

// ─── buildTable ───────────────────────────────────────────────────────────────

describe('buildTable', () => {
  const cols = [{ header: 'العمود', key: 'col', width: 20 }];
  const rows = [{ col: 'قيمة' }];

  it('generates table element', () => {
    expect(buildTable(cols, rows)).toContain('<table>');
  });

  it('includes column header', () => {
    expect(buildTable(cols, rows)).toContain('العمود');
  });

  it('includes row data', () => {
    expect(buildTable(cols, rows)).toContain('قيمة');
  });

  it('includes tfoot when totals row provided', () => {
    expect(buildTable(cols, rows, { col: 'إجمالي' })).toContain('<tfoot>');
    expect(buildTable(cols, rows, { col: 'إجمالي' })).toContain('إجمالي');
  });

  it('omits tfoot when no totals row', () => {
    expect(buildTable(cols, rows)).not.toContain('<tfoot>');
  });

  it('applies zebra class on odd rows', () => {
    const twoRows = [{ col: 'أول' }, { col: 'ثانٍ' }];
    expect(buildTable(cols, twoRows)).toContain('class="zebra"');
  });

  it('shows empty state message when rows is empty', () => {
    expect(buildTable(cols, [])).toContain('لا توجد بيانات');
  });

  it('formats numbers with up to 3 decimal places', () => {
    const numCols = [{ header: 'المبلغ', key: 'amount' }];
    const numRows = [{ amount: 1500.500 }];
    const html = buildTable(numCols, numRows);
    expect(html).toContain('1,500.5');
  });
});

// ─── buildWatermark ───────────────────────────────────────────────────────────

describe('buildWatermark', () => {
  it('returns empty string when no type', () => {
    expect(buildWatermark()).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(buildWatermark(undefined)).toBe('');
  });

  it('shows draft label', () => {
    expect(buildWatermark('draft')).toContain('مسودة');
  });

  it('shows copy label', () => {
    expect(buildWatermark('copy')).toContain('نسخة');
  });

  it('shows original label', () => {
    expect(buildWatermark('original')).toContain('أصل');
  });

  it('shows cancelled label', () => {
    expect(buildWatermark('cancelled')).toContain('ملغى');
  });

  it('shows approved label', () => {
    expect(buildWatermark('approved')).toContain('معتمد');
  });

  it('shows rejected label', () => {
    expect(buildWatermark('rejected')).toContain('مرفوض');
  });

  it('shows confidential label', () => {
    expect(buildWatermark('confidential')).toContain('سري');
  });

  it('wraps label in watermark div', () => {
    expect(buildWatermark('draft')).toContain('class="watermark"');
  });
});

// ─── buildSummaryCards ────────────────────────────────────────────────────────

describe('buildSummaryCards', () => {
  it('returns empty string for empty array', () => {
    expect(buildSummaryCards([])).toBe('');
  });

  it('includes card labels and values', () => {
    const html = buildSummaryCards([{ label: 'الإيرادات', value: '5,000.000' }]);
    expect(html).toContain('الإيرادات');
    expect(html).toContain('5,000.000');
  });

  it('applies green color class', () => {
    const html = buildSummaryCards([{ label: 'x', value: 'y', color: 'green' }]);
    expect(html).toContain('summary-card green');
  });

  it('applies default color class when not specified', () => {
    const html = buildSummaryCards([{ label: 'x', value: 'y' }]);
    expect(html).toContain('summary-card default');
  });
});

// ─── htmlUtils ────────────────────────────────────────────────────────────────

describe('esc', () => {
  it('escapes ampersand', () => {
    expect(esc('a & b')).toBe('a &amp; b');
  });

  it('escapes angle brackets', () => {
    expect(esc('<script>')).toBe('&lt;script&gt;');
  });

  it('escapes double quotes', () => {
    expect(esc('"hello"')).toBe('&quot;hello&quot;');
  });

  it('handles null/undefined gracefully', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
  });
});

describe('fmtCell', () => {
  it('returns empty string for null', () => {
    expect(fmtCell(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(fmtCell(undefined)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(fmtCell('')).toBe('');
  });

  it('formats integers with no decimal places', () => {
    expect(fmtCell(1000)).toBe('1,000');
  });

  it('formats decimals up to 3 places', () => {
    expect(fmtCell(1500.5)).toBe('1,500.5');
  });

  it('escapes HTML in string values', () => {
    expect(fmtCell('<b>test</b>')).toBe('&lt;b&gt;test&lt;/b&gt;');
  });
});

// ─── Migration Compatibility ──────────────────────────────────────────────────

describe('Migration compatibility', () => {
  it('existing ReportInput without options works unchanged', () => {
    const html = buildReportHtml({
      title: 'Legacy Report',
      columns: [{ header: 'Name', key: 'n' }],
      rows: [{ n: 'test' }],
    });
    expect(html).toContain('Legacy Report');
    expect(html).toContain('test');
  });

  it('Financial Center-style input (statement) works', () => {
    const html = buildReportHtml({
      title: 'كشف الحساب',
      subtitle: 'الفترة: 2026-01-01 إلى 2026-06-30',
      columns: [
        { header: 'التاريخ', key: 'date' },
        { header: 'مدين',    key: 'debit' },
        { header: 'دائن',    key: 'credit' },
        { header: 'الرصيد',  key: 'balance' },
      ],
      rows: [{ date: '2026-01-15', debit: 1000, credit: 0, balance: 1000 }],
      totalsRow: { date: 'الإجمالي', debit: 1000, credit: 0, balance: 1000 },
    });
    expect(html).toContain('كشف الحساب');
    expect(html).toContain('مدين');
  });

  it('Reports Center migration: branding header added when options provided', () => {
    const html = buildReportHtml(
      { title: 'تقرير العملاء', columns: [{ header: 'الاسم', key: 'name' }], rows: [] },
      { branding: { companyNameAr: 'شركة المنار' }, profile: 'a4-landscape', showPageNumbers: true },
    );
    expect(html).toContain('شركة المنار');
    expect(html).toContain('تقرير العملاء');
  });

  it('all watermark types produce valid HTML', () => {
    const types = ['draft', 'copy', 'original', 'cancelled', 'approved', 'rejected', 'confidential'] as const;
    for (const type of types) {
      const html = buildReportHtml(BASE_INPUT, { watermark: type });
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('class="watermark"');
    }
  });

  it('all print profiles produce valid HTML', () => {
    const profiles = ['a4-landscape', 'a4-portrait', 'statement', 'journal', 'receipt', 'letter'] as const;
    for (const profile of profiles) {
      const html = buildReportHtml(BASE_INPUT, { profile });
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('@page');
    }
  });
});

// ─── Profile Helper Functions ─────────────────────────────────────────────────

describe('resolveTablePadding', () => {
  it('returns compact padding for compact density', () =>
    expect(resolveTablePadding('compact')).toBe('3px 6px'));
  it('returns normal padding for normal density', () =>
    expect(resolveTablePadding('normal')).toBe('6px 10px'));
  it('returns comfortable padding for comfortable density', () =>
    expect(resolveTablePadding('comfortable')).toBe('8px 14px'));
  it('returns normal padding when undefined (default)', () =>
    expect(resolveTablePadding(undefined)).toBe('6px 10px'));
});

describe('resolveLogoWidth', () => {
  it('returns 60px for small size', () => expect(resolveLogoWidth('small')).toBe('60px'));
  it('returns 90px for medium size', () => expect(resolveLogoWidth('medium')).toBe('90px'));
  it('returns 120px for large size', () => expect(resolveLogoWidth('large')).toBe('120px'));
  it('returns 60px when undefined (default)', () => expect(resolveLogoWidth(undefined)).toBe('60px'));
});

describe('resolveLogoJustify', () => {
  it('returns flex-start for start alignment', () =>
    expect(resolveLogoJustify('start')).toBe('flex-start'));
  it('returns center for center alignment', () =>
    expect(resolveLogoJustify('center')).toBe('center'));
  it('returns flex-end for end alignment', () =>
    expect(resolveLogoJustify('end')).toBe('flex-end'));
  it('returns flex-start when undefined (default)', () =>
    expect(resolveLogoJustify(undefined)).toBe('flex-start'));
});

describe('buildStyles — profile density CSS', () => {
  it('statement profile generates comfortable table padding in CSS', () => {
    const css = buildStyles('statement');
    expect(css).toContain('8px 14px');
  });
  it('a4-landscape profile generates compact table padding in CSS', () => {
    const css = buildStyles('a4-landscape');
    expect(css).toContain('3px 6px');
  });
  it('a4-portrait profile generates normal table padding in CSS', () => {
    const css = buildStyles('a4-portrait');
    expect(css).toContain('6px 10px');
  });
});
