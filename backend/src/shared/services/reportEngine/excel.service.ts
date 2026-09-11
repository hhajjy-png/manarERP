import ExcelJS from 'exceljs';
import {
  KWD_FORMAT,
  DATE_FORMAT,
  INT_FORMAT,
  HEADER_FILL,
  TOTALS_FILL,
  ZEBRA_FILL,
  ROW_GROUP_FILL,
  HEADER_BORDER,
  ROW_BORDER,
  CENTER_ALIGN,
  RIGHT_ALIGN,
  alignFor,
  TITLE_FONT,
  SUBTITLE_FONT,
  HEADER_FONT,
  BODY_FONT,
  TOTALS_FONT,
  META_FONT,
} from './excelStyle';
import { rowGroupLayout } from './rowGroups';

export interface ReportColumn {
  header: string;
  key: string;
  width?: number;
  /** تنسيق رقمي/عملة اختياري. */
  numFmt?: string;
  /** Presentation-only: mark a monetary column so HTML/PDF render the cell as a bare
   *  number ("144,922.400") and put the symbol once in the column header ("المبلغ (KWD)").
   *  **Excel ignores this**: the cell stays a raw number with `numFmt` — the export contract. */
  format?: 'currency';
  /** نوع العمود (اختياري) — يُستخدم فقط لتحديد تنسيق افتراضي عندما لا يوجد numFmt صريح. */
  type?: 'text' | 'number' | 'currency' | 'date';
  /** Presentation-only column alignment; default is right (preserves prior behavior when unset).
   *  Controls BOTH horizontal (`text-align`) and vertical (`vertical-align: middle`) alignment.
   *  HTML/PDF (`table.template.ts`) apply this as an **inline `style` attribute** on the
   *  `<th>`/`<td>`, not a CSS class alone — inline styles deliberately override any
   *  stylesheet alignment rule (e.g. `styles.template.ts`'s `thead th` / `tr.totals td`),
   *  so the column's requested alignment always wins regardless of CSS specificity.
   *  **Excel ignores this styling mechanism**: it maps `align` to its own native
   *  `cell.alignment` (via `alignFor()`), independent of any HTML/CSS. */
  align?: 'left' | 'center' | 'right';
  /** Presentation-only: within each contiguous row group (`ReportInput.rowGroupKey`) this
   *  column shows its value ONCE — a real `rowspan` cell in HTML/PDF and the preview; in
   *  Excel the first row of the block keeps the value and the rest stay blank (merged
   *  cells of unequal size would break the header autofilter's sort). See `rowGroups.ts`. */
  mergeRowGroup?: boolean;
}

/**
 * بطاقة مؤشّر تنفيذي تُعرض أعلى التقرير (HTML/الطباعة/الواجهة) وفي ورقة Excel مستقلة.
 * محتوى بحت: المستدعي يحسب القيمة، والمحرّك يعرضها فقط.
 */
export interface ReportKpi {
  label: string;
  /** رقم (يُنسَّق حسب `format`) أو نص جاهز (اسم شهر/تصنيف). */
  value: string | number;
  format?: 'currency';
  /** سطر ثانوي تحت القيمة — مثل مبلغ الشهر الأعلى إنفاقًا. */
  hint?: string | number;
  hintFormat?: 'currency';
  color?: 'default' | 'green' | 'red' | 'blue';
  /** اسم أيقونة Material Symbols تستخدمه الواجهة. HTML/الطباعة/Excel تتجاهله. */
  icon?: string;
}

/**
 * قسم تحليلي إضافي يُعرض **بعد** الجدول الرئيسي — بنفس عقد الأعمدة/الصفوف.
 * في Excel يصبح كل قسم ورقة عمل مستقلة، فالورقة الرئيسية تبقى كما هي حرفيًا.
 */
export interface ReportSection {
  title: string;
  /** ملاحظة تُعرض تحت العنوان — تُستخدم للإفصاح عن أي حدّ (مثل «أكبر 20»). */
  note?: string;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  totalsRow?: Record<string, unknown>;
  /** اسم ورقة Excel — يسقط إلى `title` عند غيابه. */
  sheetName?: string;
}

export interface ReportInput {
  title: string;
  subtitle?: string;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  /** صف مجاميع اختياري. */
  totalsRow?: Record<string, unknown>;
  /** بطاقات مؤشرات تنفيذية اختيارية — إضافية بحتة، لا تمسّ الجدول الرئيسي. */
  kpis?: ReportKpi[];
  /** أقسام تحليلية اختيارية تُعرض بعد الجدول الرئيسي. */
  sections?: ReportSection[];
  /** تفعيل تظليل الصفوف بالتناوب (افتراضي: مفعّل). */
  zebra?: boolean;
  /** تفعيل الفلترة التلقائية على صف الرأس (افتراضي: مفعّل). */
  autoFilter?: boolean;
  /** اسم ورقة العمل (اختياري). */
  sheetName?: string;
  /** أسطر تذييل إضافية (بيانات وصفية) تُعرض بعد المجاميع بنمط خافت. */
  metaFooter?: string[];
  /** تنسيق مشروط اختياري لكل صف بيانات — يُستخدم لاحقًا لتلوين حالات الرواتب/البنوك. */
  rowStyle?: (row: Record<string, unknown>, index: number) => { fillArgb?: string; fontColorArgb?: string } | undefined;
  /**
   * حقل معرّف مجموعة الصفوف (عرضٌ بحت، لا يُعرض كعمود). كل كتلة **متجاورة** من صفّين
   * فأكثر بنفس المعرّف تُلوَّن لونًا موحّدًا، وتُدمج فيها أعمدة `mergeRowGroup` — انظر
   * `rowGroups.ts`.
   */
  rowGroupKey?: string;
}

const DEFAULT_SHEET_NAME = 'التقرير';
const MAX_SHEET_NAME_LEN = 31;
const INVALID_SHEET_CHARS = /[\\/*?:[\]]/g;

function safeSheetName(name: string, fallbackIndex: number): string {
  const cleaned = (name || '').replace(INVALID_SHEET_CHARS, ' ').trim();
  const base = cleaned.length > 0 ? cleaned : `Sheet${fallbackIndex + 1}`;
  return base.slice(0, MAX_SHEET_NAME_LEN);
}

/**
 * ExcelJS يرفض اسمَي ورقة متطابقين برمي استثناء — أي أن عنوانَي قسم متشابهين كانا
 * سيُسقطان **التصدير كله**. نُلحق لاحقة رقمية بدل ذلك: ورقة باسم مختلف قليلًا
 * أفضل بما لا يُقاس من ملف لا يُنتَج.
 */
function uniqueSheetName(name: string, used: Set<string>): string {
  if (!used.has(name)) { used.add(name); return name; }
  for (let i = 2; ; i++) {
    const suffix = ` (${i})`;
    const candidate = `${name.slice(0, MAX_SHEET_NAME_LEN - suffix.length)}${suffix}`;
    if (!used.has(candidate)) { used.add(candidate); return candidate; }
  }
}

function applyWorkbookProperties(wb: ExcelJS.Workbook, title: string, subtitle?: string): void {
  try {
    wb.creator = 'manarERP';
    wb.company = 'manarERP';
    wb.title = title;
    wb.subject = subtitle || 'تقرير';
    wb.category = subtitle || 'تقرير';
    wb.created = new Date();
  } catch {
    // خصائص الوصف اختيارية بحتة — لا يجب أن يفشل التصدير بسببها أبدًا.
  }
}

function sheetOptions(input: ReportInput): Partial<ExcelJS.AddWorksheetOptions> {
  return {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: input.subtitle ? 3 : 2 }],
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: { left: 0.4, right: 0.4, top: 0.55, bottom: 0.55, header: 0.2, footer: 0.2 },
    },
  };
}

/** يحسب عرضًا معقولاً للعمود من رأسه وعيّنة من محتوى الخلايا — يُستخدم فقط عند غياب width صريح. */
function computeAutoWidth(col: ReportColumn, rows: Record<string, unknown>[]): number {
  let max = col.header.length;
  const sampleSize = Math.min(rows.length, 50);
  for (let i = 0; i < sampleSize; i++) {
    const v = rows[i]?.[col.key];
    if (v === null || v === undefined || v === '') continue;
    const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
    if (s.length > max) max = s.length;
  }
  return Math.min(60, Math.max(10, max + 4));
}

function resolveNumFmt(col: ReportColumn, value: unknown): string | undefined {
  let numFmt = col.numFmt;
  if (!numFmt) {
    if (col.type === 'currency') numFmt = KWD_FORMAT;
    else if (col.type === 'number') numFmt = INT_FORMAT;
    else if (col.type === 'date') numFmt = DATE_FORMAT;
  }
  // قيمة Date حقيقية تحتاج تنسيق تاريخ دائمًا كي تُعرض بشكل صحيح في Excel.
  if (value instanceof Date) numFmt = DATE_FORMAT;
  return numFmt;
}

/**
 * يرسم محتوى تقرير واحد (ReportInput) على ورقة عمل جاهزة.
 * يشترك فيه كل من buildExcel (ورقة واحدة) و buildExcelWorkbook (أوراق متعددة).
 */
function renderSheet(ws: ExcelJS.Worksheet, input: ReportInput): void {
  const colCount = input.columns.length;
  const zebraEnabled = input.zebra ?? true;
  const autoFilterEnabled = input.autoFilter ?? true;

  // العنوان
  ws.mergeCells(1, 1, 1, colCount);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = input.title;
  titleCell.font = TITLE_FONT;
  titleCell.alignment = CENTER_ALIGN;
  ws.getRow(1).height = 26;

  let headerRowIndex = 2;
  if (input.subtitle) {
    ws.mergeCells(2, 1, 2, colCount);
    const sub = ws.getCell(2, 1);
    sub.value = input.subtitle;
    sub.font = SUBTITLE_FONT;
    sub.alignment = CENTER_ALIGN;
    headerRowIndex = 3;
  }

  // الأعمدة والعرض (يحترم width الصريح، وإلا يحسب عرضًا تلقائيًا)
  ws.columns = input.columns.map((c) => ({
    key: c.key,
    width: c.width ?? computeAutoWidth(c, input.rows),
  }));

  // رؤوس الأعمدة
  const headerRow = ws.getRow(headerRowIndex);
  input.columns.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.header;
    cell.font = HEADER_FONT;
    cell.fill = HEADER_FILL;
    cell.alignment = CENTER_ALIGN;
    cell.border = HEADER_BORDER;
  });
  headerRow.height = 22;

  // فلترة تلقائية على صف الرأس
  if (autoFilterEnabled && colCount > 0) {
    ws.autoFilter = {
      from: { row: headerRowIndex, column: 1 },
      to: { row: headerRowIndex, column: colCount },
    };
  }

  // الصفوف
  const groups = input.rowGroupKey ? rowGroupLayout(input.rows, input.rowGroupKey) : undefined;
  input.rows.forEach((row, rowIdx) => {
    const group = groups?.[rowIdx];
    // عمود `mergeRowGroup`: القيمة في أول صفّ من الكتلة وحده، والباقي فارغ.
    const hiddenByGroup = (c: ReportColumn) => !!c.mergeRowGroup && group?.span === 0;
    const r = ws.addRow(input.columns.map((c) => (hiddenByGroup(c) ? '' : row[c.key] ?? '')));
    const isZebra = zebraEnabled && rowIdx % 2 === 1;
    const custom = input.rowStyle?.(row, rowIdx);
    input.columns.forEach((c, i) => {
      const cell = r.getCell(i + 1);
      const value = hiddenByGroup(c) ? '' : row[c.key];
      const numFmt = resolveNumFmt(c, value);
      if (numFmt) cell.numFmt = numFmt;

      const align = alignFor(c.align);
      const fontColorArgb = custom?.fontColorArgb;
      cell.font = fontColorArgb ? { ...BODY_FONT, color: { argb: fontColorArgb } } : BODY_FONT;
      cell.alignment = align;
      cell.border = ROW_BORDER;

      if (custom?.fillArgb) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: custom.fillArgb } };
      } else if (group?.grouped) {
        cell.fill = ROW_GROUP_FILL;
      } else if (isZebra) {
        cell.fill = ZEBRA_FILL;
      }
    });
  });

  // صف المجاميع
  if (input.totalsRow) {
    const r = ws.addRow(input.columns.map((c) => input.totalsRow![c.key] ?? ''));
    r.font = TOTALS_FONT;
    r.eachCell((cell, colNumber) => {
      cell.fill = TOTALS_FILL;
      const col = input.columns[colNumber - 1];
      if (col?.numFmt) cell.numFmt = col.numFmt;
    });
  }

  // تذييل بيانات وصفية اختياري
  if (input.metaFooter && input.metaFooter.length > 0) {
    input.metaFooter.forEach((line) => {
      const rowIndex = ws.rowCount + 1;
      ws.mergeCells(rowIndex, 1, rowIndex, colCount);
      const cell = ws.getCell(rowIndex, 1);
      cell.value = line;
      cell.font = META_FONT;
      cell.alignment = RIGHT_ALIGN;
    });
  }

  // إعدادات الطباعة: تكرار صف الرأس في كل صفحة مطبوعة
  ws.pageSetup.printTitlesRow = `${headerRowIndex}:${headerRowIndex}`;
}

const KPI_SHEET_NAME = 'المؤشرات التنفيذية';

/**
 * ورقة المؤشرات التنفيذية — عرضٌ عمودي بسيط (مؤشر / قيمة / تفصيل).
 *
 * لا تمرّ عبر `renderSheet` لأن تنسيق كل خليّة قيمة يختلف حسب المؤشر نفسه
 * (مبلغ بالدينار، عدّاد صحيح، أو نص كاسم شهر) — لا حسب عمودها.
 */
function renderKpiSheet(ws: ExcelJS.Worksheet, title: string, kpis: ReportKpi[]): void {
  ws.columns = [{ key: 'label', width: 32 }, { key: 'value', width: 24 }, { key: 'hint', width: 20 }];

  ws.mergeCells(1, 1, 1, 3);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = TITLE_FONT;
  titleCell.alignment = CENTER_ALIGN;
  ws.getRow(1).height = 26;

  const headerRow = ws.getRow(2);
  ['المؤشر', 'القيمة', 'تفصيل'].forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = HEADER_FONT;
    cell.fill = HEADER_FILL;
    cell.alignment = CENTER_ALIGN;
    cell.border = HEADER_BORDER;
  });
  headerRow.height = 22;

  kpis.forEach((kpi, i) => {
    const r = ws.addRow([kpi.label, kpi.value, kpi.hint ?? '']);
    r.eachCell((cell, colNumber) => {
      cell.font = BODY_FONT;
      cell.border = ROW_BORDER;
      cell.alignment = colNumber === 1 ? RIGHT_ALIGN : CENTER_ALIGN;
      if (i % 2 === 1) cell.fill = ZEBRA_FILL;
    });
    // التنسيق النقدي يُطبَّق على الخليّة الرقمية وحدها — Excel يتجاهله على النص.
    if (kpi.format === 'currency') r.getCell(2).numFmt = KWD_FORMAT;
    if (kpi.hintFormat === 'currency') r.getCell(3).numFmt = KWD_FORMAT;
  });
}

/**
 * توليد ملف Excel احترافي بدعم RTL عربي كامل.
 *
 * الورقة الأولى هي التقرير كما كان دائمًا — بلا أي تغيير. عند وجود مؤشرات أو أقسام
 * تحليلية تُضاف **بعدها** أوراق مستقلة، فلا يتزحزح صفّ واحد في الورقة الرئيسية.
 */
export async function buildExcel(input: ReportInput): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  applyWorkbookProperties(wb, input.title, input.subtitle);

  const used = new Set<string>();
  const ws = wb.addWorksheet(
    uniqueSheetName(safeSheetName(input.sheetName ?? DEFAULT_SHEET_NAME, 0), used),
    sheetOptions(input),
  );
  renderSheet(ws, input);

  let sheetIndex = 1;
  if (input.kpis && input.kpis.length > 0) {
    const kpiWs = wb.addWorksheet(
      uniqueSheetName(safeSheetName(KPI_SHEET_NAME, sheetIndex++), used),
      sheetOptions(input),
    );
    renderKpiSheet(kpiWs, `${input.title} — ${KPI_SHEET_NAME}`, input.kpis);
  }
  for (const section of input.sections ?? []) {
    const sectionInput: ReportInput = {
      title: section.title,
      subtitle: section.note,
      columns: section.columns,
      rows: section.rows,
      totalsRow: section.totalsRow,
    };
    const sectionWs = wb.addWorksheet(
      uniqueSheetName(safeSheetName(section.sheetName ?? section.title, sheetIndex++), used),
      sheetOptions(sectionInput),
    );
    renderSheet(sectionWs, sectionInput);
  }

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * توليد ملف Excel متعدد الأوراق — كل ReportInput يصبح ورقة عمل مستقلة بنفس نظام التصميم.
 */
export async function buildExcelWorkbook(sheets: ReportInput[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const first = sheets[0];
  applyWorkbookProperties(wb, first?.title ?? 'تقرير', first?.subtitle);

  sheets.forEach((input, i) => {
    const ws = wb.addWorksheet(safeSheetName(input.sheetName ?? `Sheet${i + 1}`, i), sheetOptions(input));
    renderSheet(ws, input);
  });

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
