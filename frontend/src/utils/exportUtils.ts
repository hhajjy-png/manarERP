import * as XLSX from 'xlsx';
import { api } from '../api/client';

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * يجلب كل الصفوف المطابقة عبر التكرار على نقطة نهاية مُرقَّمة قياسية (page/pageSize)
 * حتى نفاد الصفحات — لتصدير Excel الكامل دون اقتطاع بحدّ الخادم الأقصى لحجم الصفحة
 * (200)، بنفس فلاتر/بحث/فرز الشاشة الحالية تمامًا (تُمرَّر كما هي عبر `params`).
 */
export async function fetchAllRows<T>(
  endpoint: string,
  params: Record<string, unknown> = {},
  pageSize = 200,
): Promise<T[]> {
  const all: T[] = [];
  let page = 1;
  // سقف أمان (500 صفحة × 200 = 100,000 صف) يمنع أي حلقة لا نهائية نظرية.
  const MAX_PAGES = 500;
  while (page <= MAX_PAGES) {
    const res = await api.get(endpoint, { params: { ...params, page, pageSize } });
    const data: T[] = res.data?.data?.data ?? [];
    all.push(...data);
    const meta = res.data?.data?.meta as { page: number; totalPages: number } | undefined;
    if (!meta || page >= meta.totalPages || data.length === 0) break;
    page += 1;
  }
  return all;
}

export interface TableExportColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
  /** خليّة رقمية خام بتنسيق الدينار القياسي (numFmt) — لا نص جاهز، عقد Excel المالي
   *  الموحّد في المشروع (raw number + numFmt، لا سلسلة نصية مُنسَّقة). */
  money?: boolean;
}

const MONEY_NUMFMT = '#,##0.000';

/**
 * Optional totals row appended after the data rows, keyed by column header
 * (Cheques Reporting & Excel Export Pack v1).
 *
 * A label cell carries the caption (e.g. «إجمالي مبالغ الشيكات»); a numeric cell
 * carries a raw number that inherits the column's own money format, so the total
 * stays a real, calculable Excel value rather than pre-rendered text — the same
 * contract the data cells already follow.
 */
export interface TableExportTotals {
  /** Header of the column the caption is written into. */
  labelColumnHeader: string;
  label: string;
  /** Header of the column the summed value is written into. */
  valueColumnHeader: string;
  value: number;
}

function buildExportSheet<T>(
  rows: T[],
  columns: TableExportColumn<T>[],
  totals?: TableExportTotals,
): XLSX.WorkSheet {
  const header = columns.map((c) => c.header);
  const body = rows.map((row) =>
    columns.map((c) => {
      const v = c.value(row);
      return c.money ? Number(v ?? 0) : (v ?? '');
    }),
  );
  const totalsRow = totals
    ? columns.map((c) => {
      if (c.header === totals.labelColumnHeader) return totals.label;
      if (c.header === totals.valueColumnHeader) return totals.value;
      return '';
    })
    : null;
  const ws = XLSX.utils.aoa_to_sheet(totalsRow ? [header, ...body, totalsRow] : [header, ...body]);
  columns.forEach((c, ci) => {
    if (!c.money) return;
    // Data rows plus the totals row when present — the total is a money cell too.
    const lastRow = totalsRow ? rows.length + 1 : rows.length;
    for (let r = 0; r < lastRow; r += 1) {
      const ref = XLSX.utils.encode_cell({ r: r + 1, c: ci });
      const cell = ws[ref];
      if (cell) cell.z = MONEY_NUMFMT;
    }
  });
  return ws;
}

/**
 * يبني ملف Excel مباشرة من صفوف الجدول وتعريف أعمدته نفسه (headerعنوان/ترتيب/قيمة) —
 * لا قائمة أعمدة منفصلة يُحتمل انحرافها عن الجدول المرئي. تمثيل مباشر لِما يراه
 * المستخدم، ثم تنزيل فوري (Blob محليًا — لا طلب خادم).
 */
export function downloadTableExcel<T>(
  rows: T[],
  columns: TableExportColumn<T>[],
  filename: string,
  sheetName = 'Sheet1',
  /** Optional totals row appended after the data. Omitted → byte-identical to before. */
  totals?: TableExportTotals,
): void {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildExportSheet(rows, columns, totals), sheetName);
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  downloadBlob(blob, filename);
}
