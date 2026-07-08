import { describe, it, expect, vi } from 'vitest';
import ExcelJS from 'exceljs';
import { buildExcel, buildExcelWorkbook, type ReportInput } from '../excel.service';
import { KWD_FORMAT, DATE_FORMAT } from '../excelStyle';
import { sendExcel, EXCEL_MIME } from '../../../../core/utils/excelResponse';

async function loadBuffer(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  return wb;
}

const BASE_INPUT: ReportInput = {
  title: 'تقرير تجريبي',
  subtitle: 'اختبار محرك Excel',
  columns: [
    { header: 'الاسم', key: 'name', width: 20 },
    { header: 'المبلغ', key: 'amount', numFmt: KWD_FORMAT },
    { header: 'التاريخ', key: 'date' },
  ],
  rows: [
    { name: 'عميل أول', amount: 1500.5, date: new Date('2026-01-15') },
    { name: 'عميل ثانٍ', amount: 2000.0, date: new Date('2026-02-20') },
    { name: 'عميل ثالث', amount: 500.25, date: new Date('2026-03-10') },
  ],
  totalsRow: { name: 'الإجمالي', amount: 4000.75 },
};

describe('buildExcel — backward compatibility', () => {
  it('produces a single worksheet with RTL and a frozen pane', async () => {
    const buf = await buildExcel(BASE_INPUT);
    const wb = await loadBuffer(buf);
    const ws = wb.worksheets[0];
    expect(ws).toBeTruthy();
    const view = ws.views?.[0] as { rightToLeft?: boolean; state?: string } | undefined;
    expect(view?.rightToLeft).toBe(true);
    expect(view?.state).toBe('frozen');
  });

  it('header row cells have navy fill and Tahoma font', async () => {
    const buf = await buildExcel(BASE_INPUT);
    const wb = await loadBuffer(buf);
    const ws = wb.worksheets[0];
    const headerRowIndex = BASE_INPUT.subtitle ? 3 : 2;
    const headerCell = ws.getRow(headerRowIndex).getCell(1);
    expect(headerCell.font?.name).toBe('Tahoma');
    expect(headerCell.font?.bold).toBe(true);
    const fill = headerCell.fill as ExcelJS.FillPattern;
    expect(fill.fgColor?.argb).toBe('FF1D4E6F');
  });

  it('sets autoFilter spanning the header row by default', async () => {
    const buf = await buildExcel(BASE_INPUT);
    const wb = await loadBuffer(buf);
    const ws = wb.worksheets[0];
    expect(ws.autoFilter).toBeTruthy();
  });

  it('keeps the KWD numFmt (#,##0.000) unchanged on currency columns', async () => {
    const buf = await buildExcel(BASE_INPUT);
    const wb = await loadBuffer(buf);
    const ws = wb.worksheets[0];
    const headerRowIndex = BASE_INPUT.subtitle ? 3 : 2;
    const firstDataRow = ws.getRow(headerRowIndex + 1);
    // column 2 = amount
    expect(firstDataRow.getCell(2).numFmt).toBe('#,##0.000');
  });

  it('a Date value produces a cell with the date numFmt', async () => {
    const buf = await buildExcel(BASE_INPUT);
    const wb = await loadBuffer(buf);
    const ws = wb.worksheets[0];
    const headerRowIndex = BASE_INPUT.subtitle ? 3 : 2;
    const firstDataRow = ws.getRow(headerRowIndex + 1);
    // column 3 = date (real JS Date value, no explicit numFmt on the column)
    expect(firstDataRow.getCell(3).numFmt).toBe(DATE_FORMAT);
  });

  it('applies zebra fill on alternating data rows by default', async () => {
    const buf = await buildExcel(BASE_INPUT);
    const wb = await loadBuffer(buf);
    const ws = wb.worksheets[0];
    const headerRowIndex = BASE_INPUT.subtitle ? 3 : 2;
    const firstDataRow = ws.getRow(headerRowIndex + 1); // index 0 -> no zebra
    const secondDataRow = ws.getRow(headerRowIndex + 2); // index 1 -> zebra
    const firstFill = firstDataRow.getCell(1).fill as ExcelJS.FillPattern | undefined;
    const secondFill = secondDataRow.getCell(1).fill as ExcelJS.FillPattern | undefined;
    expect(secondFill?.fgColor?.argb).toBe('FFF8FAFC');
    expect(firstFill?.fgColor?.argb).not.toBe('FFF8FAFC');
  });

  it('disables zebra when zebra: false is passed', async () => {
    const buf = await buildExcel({ ...BASE_INPUT, zebra: false });
    const wb = await loadBuffer(buf);
    const ws = wb.worksheets[0];
    const headerRowIndex = BASE_INPUT.subtitle ? 3 : 2;
    const secondDataRow = ws.getRow(headerRowIndex + 2);
    const fill = secondDataRow.getCell(1).fill as ExcelJS.FillPattern | undefined;
    expect(fill?.fgColor?.argb).not.toBe('FFF8FAFC');
  });

  it('honors an explicit column width and does not shrink it', async () => {
    const buf = await buildExcel(BASE_INPUT);
    const wb = await loadBuffer(buf);
    const ws = wb.worksheets[0];
    const nameCol = ws.getColumn(1);
    expect(nameCol.width).toBe(20);
  });

  it('keeps the totals row bold with the totals fill and numFmt', async () => {
    const buf = await buildExcel(BASE_INPUT);
    const wb = await loadBuffer(buf);
    const ws = wb.worksheets[0];
    const totalsRowIndex = ws.rowCount; // last row (no metaFooter in BASE_INPUT)
    const totalsRow = ws.getRow(totalsRowIndex);
    expect(totalsRow.getCell(1).font?.bold).toBe(true);
    const fill = totalsRow.getCell(1).fill as ExcelJS.FillPattern;
    expect(fill.fgColor?.argb).toBe('FFF0F3F7');
    expect(totalsRow.getCell(2).numFmt).toBe('#,##0.000');
  });

  it('works unchanged for a legacy caller shape (title, columns, rows only)', async () => {
    const legacy: ReportInput = {
      title: 'Legacy',
      columns: [{ header: 'Name', key: 'n' }],
      rows: [{ n: 'test' }],
    };
    const buf = await buildExcel(legacy);
    const wb = await loadBuffer(buf);
    expect(wb.worksheets).toHaveLength(1);
  });
});

describe('buildExcel — new optional capabilities', () => {
  it('renders metaFooter lines after the totals row in a muted style', async () => {
    const input: ReportInput = {
      ...BASE_INPUT,
      metaFooter: ['تم الإنشاء بواسطة نظام المنار', 'عدد السجلات: 3'],
    };
    const buf = await buildExcel(input);
    const wb = await loadBuffer(buf);
    const ws = wb.worksheets[0];
    const lastRow = ws.getRow(ws.rowCount);
    expect(String(lastRow.getCell(1).value)).toContain('عدد السجلات');
    expect(lastRow.getCell(1).font?.italic).toBe(true);
  });

  it('applies rowStyle fill/font color overrides when provided', async () => {
    const input: ReportInput = {
      ...BASE_INPUT,
      totalsRow: undefined,
      rowStyle: (row) => (row.name === 'عميل أول' ? { fillArgb: 'FFFF0000', fontColorArgb: 'FFFFFFFF' } : undefined),
    };
    const buf = await buildExcel(input);
    const wb = await loadBuffer(buf);
    const ws = wb.worksheets[0];
    const headerRowIndex = BASE_INPUT.subtitle ? 3 : 2;
    const styledRow = ws.getRow(headerRowIndex + 1);
    const fill = styledRow.getCell(1).fill as ExcelJS.FillPattern;
    expect(fill.fgColor?.argb).toBe('FFFF0000');
    expect(styledRow.getCell(1).font?.color?.argb).toBe('FFFFFFFF');
  });

  it('respects a custom sheetName', async () => {
    const buf = await buildExcel({ ...BASE_INPUT, sheetName: 'ملخص' });
    const wb = await loadBuffer(buf);
    expect(wb.worksheets[0].name).toBe('ملخص');
  });

  it('disables autoFilter when autoFilter: false is passed', async () => {
    const buf = await buildExcel({ ...BASE_INPUT, autoFilter: false });
    const wb = await loadBuffer(buf);
    expect(wb.worksheets[0].autoFilter).toBeFalsy();
  });
});

describe('buildExcelWorkbook', () => {
  it('produces one worksheet per ReportInput, each styled', async () => {
    const sheets: ReportInput[] = [
      { title: 'ورقة 1', columns: [{ header: 'A', key: 'a' }], rows: [{ a: 1 }] },
      { title: 'ورقة 2', columns: [{ header: 'B', key: 'b' }], rows: [{ b: 2 }] },
      { title: 'ورقة 3', columns: [{ header: 'C', key: 'c' }], rows: [{ c: 3 }] },
    ];
    const buf = await buildExcelWorkbook(sheets);
    const wb = await loadBuffer(buf);
    expect(wb.worksheets).toHaveLength(3);
    for (const ws of wb.worksheets) {
      const headerCell = ws.getRow(2).getCell(1);
      expect(headerCell.font?.name).toBe('Tahoma');
    }
  });
});

describe('sendExcel', () => {
  it('sets the Content-Type and attachment header with UTF-8 filename encoding', () => {
    const res = { setHeader: vi.fn(), send: vi.fn() } as unknown as {
      setHeader: ReturnType<typeof vi.fn>;
      send: ReturnType<typeof vi.fn>;
    };
    const buf = Buffer.from('fake-xlsx');

    sendExcel(res as never, buf, 'تقرير العملاء.xlsx');

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', EXCEL_MIME);
    const dispositionCall = res.setHeader.mock.calls.find((c) => c[0] === 'Content-Disposition');
    expect(dispositionCall).toBeTruthy();
    expect(dispositionCall?.[1]).toContain('attachment');
    expect(dispositionCall?.[1]).toContain("filename*=UTF-8''");
    expect(res.send).toHaveBeenCalledWith(buf);
  });
});
