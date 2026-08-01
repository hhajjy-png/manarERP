/**
 * Expense Analysis Report Enhancement Pack v1 — محرّك التقارير.
 *
 * يثبت أن المؤشرات والأقسام التحليلية تصل فعلًا إلى مخرجَي التصدير (HTML/الطباعة
 * وExcel)، وأن التقارير التي لا ترسلها تخرج **بلا أي تغيير** عمّا كانت عليه.
 */
import { describe, it, expect, vi } from 'vitest';
import ExcelJS from 'exceljs';
import { buildReportHtml } from '../html.service';
import { buildExcel, ReportInput } from '../excel.service';

vi.mock('fs', () => ({
  default: { readFileSync: vi.fn().mockReturnValue(Buffer.from('fake-font')) },
}));
vi.mock('path', () => ({
  default: { resolve: vi.fn().mockReturnValue('/fake/Cairo-Regular.ttf') },
}));

const PLAIN: ReportInput = {
  title: 'تقرير بلا تحليل',
  columns: [{ header: 'الاسم', key: 'name' }, { header: 'المبلغ', key: 'amount', format: 'currency', numFmt: '#,##0.000' }],
  rows: [{ name: 'أول', amount: 100 }],
  totalsRow: { name: 'الإجمالي', amount: 100 },
};

const ENRICHED: ReportInput = {
  ...PLAIN,
  title: 'تقرير المصروفات',
  kpis: [
    { label: 'إجمالي المصروفات', value: 1234.5, format: 'currency', color: 'blue' },
    { label: 'أعلى شهر إنفاقًا', value: 'مارس 2025', hint: 900, hintFormat: 'currency', color: 'red' },
    { label: 'عدد التصنيفات', value: 3 },
  ],
  sections: [
    {
      title: 'مصفوفة المصروفات: التصنيفات × الأشهر',
      sheetName: 'مصفوفة التصنيفات والأشهر',
      columns: [
        { header: 'التصنيف', key: 'category' },
        { header: 'يناير', key: 'm_2025-01', format: 'currency', numFmt: '#,##0.000' },
        { header: 'الإجمالي', key: 'total', format: 'currency', numFmt: '#,##0.000' },
      ],
      rows: [{ category: 'وقود', 'm_2025-01': 1234.5, total: 1234.5 }],
      totalsRow: { category: 'الإجمالي', 'm_2025-01': 1234.5, total: 1234.5 },
    },
    {
      title: 'أكبر المصروفات (أعلى 20)',
      note: 'يعرض هذا القسم أكبر 20 حركة من أصل 40 — وهو عيّنة لا إجمالي.',
      sheetName: 'أكبر المصروفات',
      columns: [{ header: 'الوصف', key: 'description' }],
      rows: [{ description: 'وقود شاحنات' }],
    },
  ],
};

describe('HTML/PDF — المؤشرات والأقسام التحليلية', () => {
  const html = buildReportHtml(ENRICHED, { profile: 'a4-landscape' });

  // أسماء الأصناف وحدها تظهر أيضًا داخل ورقة الأنماط في الرأس — لذلك تُطابَق
  // الوسوم كاملة كي تختبر الاختبارات المحتوى المرسوم لا تعريف النمط.
  const KPI_MARKUP = '<div class="summary-cards">';
  const SECTION_MARKUP = '<section class="report-analysis">';
  const TABLE_MARKUP = '<thead><tr>';

  it('يعرض بطاقات المؤشرات بالرمز داخلها (لا عنوان عمود يحمله)', () => {
    expect(html).toContain(KPI_MARKUP);
    expect(html).toContain('إجمالي المصروفات');
    expect(html).toContain('1,234.500 KWD');
    expect(html).toContain('مارس 2025');
    expect(html).toContain('card-hint');
    expect(html).toContain('900.000 KWD');
  });

  it('يعرض عنوان كل قسم وملاحظته وجدوله', () => {
    expect(html).toContain('report-analysis-title');
    expect(html).toContain('مصفوفة المصروفات: التصنيفات × الأشهر');
    expect(html).toContain('أكبر المصروفات (أعلى 20)');
    expect(html).toContain('report-analysis-note');
    expect(html).toContain('عيّنة لا إجمالي');
  });

  it('يضع الأقسام بعد الجدول الرئيسي والمؤشرات قبله', () => {
    const kpiAt = html.indexOf(KPI_MARKUP);
    const tableAt = html.indexOf(TABLE_MARKUP);
    const sectionAt = html.indexOf(SECTION_MARKUP);
    expect(kpiAt).toBeGreaterThan(-1);
    expect(kpiAt).toBeLessThan(tableAt);
    expect(tableAt).toBeLessThan(sectionAt);
  });

  it('خلايا الأقسام تحمل نفس تنسيق الأعمدة المالية (الرمز في الرأس)', () => {
    expect(html).toContain('الإجمالي (KWD)');
    expect(html).toContain('يناير (KWD)');
  });

  it('التقرير بلا مؤشرات/أقسام يخرج بلا أي منهما', () => {
    const plainHtml = buildReportHtml(PLAIN, { profile: 'a4-landscape' });
    expect(plainHtml).not.toContain(KPI_MARKUP);
    expect(plainHtml).not.toContain(SECTION_MARKUP);
  });
});

describe('Excel — أوراق المؤشرات والأقسام', () => {
  it('يضيف ورقة لكل مؤشرات وقسم، والورقة الأولى تبقى التقرير نفسه', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await buildExcel(ENRICHED) as unknown as ArrayBuffer);

    const names = wb.worksheets.map((w) => w.name);
    expect(names[0]).toBe('التقرير');
    expect(names).toContain('المؤشرات التنفيذية');
    expect(names).toContain('مصفوفة التصنيفات والأشهر');
    expect(names).toContain('أكبر المصروفات');
    expect(names).toHaveLength(4);
  });

  it('ورقة المؤشرات تحمل القيم بتنسيق الدينار للأرقام وحدها', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await buildExcel(ENRICHED) as unknown as ArrayBuffer);
    const ws = wb.getWorksheet('المؤشرات التنفيذية')!;

    expect(ws.getCell('A2').value).toBe('المؤشر');
    expect(ws.getCell('A3').value).toBe('إجمالي المصروفات');
    expect(ws.getCell('B3').value).toBe(1234.5);      // رقم خام — عقد Excel
    expect(ws.getCell('B3').numFmt).toBe('#,##0.000');
    expect(ws.getCell('B4').value).toBe('مارس 2025'); // نص، لا يُفرض عليه تنسيق رقمي
    expect(ws.getCell('C4').value).toBe(900);
    expect(ws.getCell('B5').value).toBe(3);
    expect(ws.getCell('B5').numFmt).toBeUndefined();  // عدّاد بلا تنسيق نقدي
  });

  it('ورقة القسم تحمل صفوفه ومجاميعه كأرقام خام', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await buildExcel(ENRICHED) as unknown as ArrayBuffer);
    const ws = wb.getWorksheet('مصفوفة التصنيفات والأشهر')!;

    expect(ws.getCell('A1').value).toBe('مصفوفة المصروفات: التصنيفات × الأشهر');
    expect(ws.getCell('A2').value).toBe('التصنيف');   // صف الرأس — بلا subtitle فهو الصف الثاني
    expect(ws.getCell('A3').value).toBe('وقود');
    expect(ws.getCell('C3').value).toBe(1234.5);
    expect(ws.getCell('C4').value).toBe(1234.5);      // صف المجاميع
  });

  it('التقرير بلا مؤشرات/أقسام يبقى ورقة واحدة', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await buildExcel(PLAIN) as unknown as ArrayBuffer);
    expect(wb.worksheets).toHaveLength(1);
  });
});
