// @vitest-environment jsdom
/**
 * Phase E — الطباعة والتقارير المرئية.
 *
 * العقد:
 *   1. `ReportPrint` صار على المعيار: الرمز في العنوان، والخليّة رقم مجرّد.
 *   2. القيمة **المستقلة** داخل نموذج مطبوع تبقى «رقم + رمز» — ومعزولة اتجاهيًا.
 *   3. تواريخ النماذج المطبوعة DD/MM/YYYY (كانت «31 يناير 2026» و«January 31, 2026»).
 *   4. تاريخ الشيك المطبوع DD/MM/YYYY بنفس عدد المحارف (لا انزياح هندسي).
 *   5. Excel يبقى رقميًا — لا يمسّه شيء من هذا.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { formatReportCell, formatMoneyCell } from '../lib/format';
import { fcMoneyHeader } from '../components/financial/financialLabels';
import { money, moneyEn, fmtDate, fmtDateEn } from '../forms/shared/formStyles';
import { formatDisplayDate, formatDateRange } from '../lib/date';

let currencyLanguage: 'english' | 'arabic' = 'english';
vi.mock('../stores/settingsStore', () => ({
  currentCurrencyLanguage: () => currencyLanguage,
  useSettings: (sel: (s: Record<string, unknown>) => unknown) => sel({ currencyLanguage }),
}));
beforeEach(() => { currencyLanguage = 'english'; });

const LRI = '⁦';
const PDI = '⁩';

describe('ReportPrint — الخليّة والعنوان', () => {
  it('العنوان يحمل الرمز مرّة واحدة', () => {
    expect(fcMoneyHeader('المبلغ')).toBe('المبلغ (KWD)');
  });

  it('الخليّة رقم مجرّد — لا KWD داخلها', () => {
    const cell = formatReportCell(12455, { format: 'currency' }, { symbol: 'header' });
    expect(cell).toBe('12,455.000');
    expect(cell).not.toContain('KWD');
  });

  it('الصفر والسالب وغير المنطبق في خليّة مطبوعة', () => {
    expect(formatMoneyCell(0)).toBe('0.000');
    expect(formatMoneyCell(-1250)).toBe('-1,250.000');
    expect(formatMoneyCell(null)).toBe('—');
  });

  it('صف الإجماليات يتبع المعيار نفسه', () => {
    expect(formatReportCell(65490, { format: 'currency' }, { symbol: 'header' })).toBe('65,490.000');
  });

  it('الأعمدة غير المالية لا تتغيّر', () => {
    expect(formatReportCell('نصّ', {}, { symbol: 'header' })).toBe('نصّ');
    expect(formatReportCell(1500.5, {}, { symbol: 'header' })).toBe('1,500.5');
  });

  it('الشاشة والطباعة تعرضان **نفس الرقم** — الفرق في موضع الرمز فقط', () => {
    const screen = formatReportCell(12455, { format: 'currency' }, { symbol: 'header' });
    const inline = formatReportCell(12455, { format: 'currency' });
    expect(inline).toBe(`${screen} KWD`);
  });

  it('لا أرقام عربية شرقية حتى مع الرمز العربي', () => {
    const cell = formatReportCell(12455, { format: 'currency' }, { language: 'arabic' });
    expect(cell).toBe('12,455.000 د.ك');
    expect(cell).not.toMatch(/[٠-٩]/);
  });
});

describe('النماذج المطبوعة — قيمة مستقلة (لا عمود يحمل العملة)', () => {
  it('الرقم ثم الرمز، معزولين اتجاهيًا فلا ينقلبان في صفحة عربية', () => {
    const m = money(12455);
    expect(m.startsWith(LRI)).toBe(true);
    expect(m.endsWith(PDI)).toBe(true);
    expect(m.slice(1, -1)).toBe('12,455.000 د.ك');
  });

  it('النسخة الإنجليزية كذلك', () => {
    expect(moneyEn(12455).slice(1, -1)).toBe('12,455.000 KWD');
  });

  it('محارف العزل غير مرئية ولا تغيّر النصّ المقروء', () => {
    expect(money(1).replace(/[⁦⁩]/g, '')).toBe('1.000 د.ك');
  });
});

describe('تواريخ النماذج المطبوعة', () => {
  it('DD/MM/YYYY — لا «31 يناير 2026» ولا «January 31, 2026»', () => {
    expect(fmtDate('2026-01-31')).toBe('31/01/2026');
    expect(fmtDateEn('2026-01-31')).toBe('31/01/2026');
    expect(fmtDate('2026-01-31')).not.toMatch(/يناير|January/);
  });

  it('تاريخ فقط لا ينزاح يومًا (string-safe)', () => {
    expect(formatDisplayDate('2026-12-31')).toBe('31/12/2026');
    expect(formatDisplayDate('2026-01-01')).toBe('01/01/2026');
  });

  it('القيمة الفارغة تبقى «—»', () => {
    expect(fmtDate(null)).toBe('—');
    expect(fmtDateEn(undefined)).toBe('—');
  });

  it('نطاق الفترة في رأس التقرير', () => {
    expect(formatDateRange('2026-01-01', '2026-01-31')).toBe('من 01/01/2026 إلى 31/01/2026');
  });
});

describe('تاريخ الشيك المطبوع — لا انزياح هندسي', () => {
  it('DD/MM/YYYY بنفس عدد محارف ISO (10) فلا يتغيّر عرض النصّ', () => {
    const printed = formatDisplayDate('2026-01-31');
    expect(printed).toBe('31/01/2026');
    expect(printed).toHaveLength('2026-01-31'.length);
    expect(printed).not.toContain('-');
  });
});
