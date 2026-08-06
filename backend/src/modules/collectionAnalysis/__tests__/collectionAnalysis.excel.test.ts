import { describe, it, expect } from 'vitest';
import {
  buildCollectionAnalysisSheets,
  COLLECTION_SHEET_NAMES,
  type CollectionExportContext,
} from '../collectionAnalysis.excel';
import { CollectionAnalysisEngine } from '../collectionAnalysis.engine';
import type { CollectionDataset } from '../collectionAnalysis.types';

/** سياق تصدير ثابت — الوحدة نقيّة فلا ساعة ولا جلسة داخلها. */
const CTX: CollectionExportContext = { username: 'admin', generatedAt: new Date(2026, 7, 6, 9, 15) };

const d = (iso: string) => new Date(`${iso}T10:00:00`);

function dataset(): CollectionDataset {
  return {
    latestActivity: d('2025-06-01'),
    invoices: [
      {
        id: 1,
        invoiceNumber: 'INV-1',
        issueDate: d('2023-03-01'),
        dueDate: null,
        total: 1000,
        customerId: 1,
        customerName: 'عميل أ',
        contractId: 10,
        contractCode: 'C-10',
        projectShares: [{ projectId: 5, projectName: 'مشروع أ', ratio: 1 }],
        payments: [
          { id: 1, invoiceId: 1, date: d('2023-06-01'), amount: 400, method: 'BANK', reference: null },
          { id: 2, invoiceId: 1, date: d('2024-02-01'), amount: 600, method: 'CASH', reference: null },
        ],
      },
      {
        id: 2,
        invoiceNumber: 'INV-2',
        issueDate: d('2024-05-01'),
        dueDate: null,
        total: 800,
        customerId: 2,
        customerName: 'عميل ب',
        contractId: null,
        contractCode: null,
        projectShares: [{ projectId: 6, projectName: 'مشروع ب', ratio: 1 }],
        payments: [],
      },
    ],
  };
}

const sheets = () =>
  buildCollectionAnalysisSheets(new CollectionAnalysisEngine(dataset()).report(), CTX);

describe('تصدير Excel — تحليل التحصيلات', () => {
  it('ورقة ملخّص أولًا ثم ورقة لكل جدول في الصفحة', () => {
    const names = sheets().map((s) => s.sheetName);
    expect(names[0]).toBe(COLLECTION_SHEET_NAMES.summary);
    expect(names).toEqual([
      COLLECTION_SHEET_NAMES.summary,
      COLLECTION_SHEET_NAMES.byYear,
      COLLECTION_SHEET_NAMES.transfer,
      COLLECTION_SHEET_NAMES.matrix,
      COLLECTION_SHEET_NAMES.outstanding,
      COLLECTION_SHEET_NAMES.customers,
      COLLECTION_SHEET_NAMES.contracts,
      COLLECTION_SHEET_NAMES.projects,
    ]);
  });

  it('«عدد الجداول المصدَّرة» مشتقّ من الطول الفعلي لا مكتوب يدويًا', () => {
    const all = sheets();
    const row = all[0].rows.find((r) => r.item === 'عدد الجداول المصدَّرة');
    expect(row?.value).toBe(String(all.length - 1));
  });

  it('أعمدة المصفوفة ديناميكية: عمود لكل سنة تحصيل ظاهرة', () => {
    const matrix = sheets().find((s) => s.sheetName === COLLECTION_SHEET_NAMES.matrix)!;
    const keys = matrix.columns.map((c) => c.key);
    expect(keys).toContain('y2023');
    expect(keys).toContain('y2024');
    expect(keys).not.toContain('y2025'); // لا تحصيل في 2025 ⇒ لا عمود
    expect(matrix.rows[0].y2023).toBe(400);
    expect(matrix.rows[0].y2024).toBe(600);
  });

  it('صفّ مجاميع المصفوفة يحمل مجاميع الأعمدة والمجموع الكلي', () => {
    const matrix = sheets().find((s) => s.sheetName === COLLECTION_SHEET_NAMES.matrix)!;
    expect(matrix.totalsRow?.y2024).toBe(600);
    expect(matrix.totalsRow?.rowTotal).toBe(1000);
  });

  it('المبالغ تبقى أرقامًا خامًا بصيغة الدينار فتقبل الجمع في Excel', () => {
    const byYear = sheets().find((s) => s.sheetName === COLLECTION_SHEET_NAMES.byYear)!;
    const amountColumn = byYear.columns.find((c) => c.key === 'invoiceValue')!;
    expect(amountColumn.numFmt).toBe('#,##0.000');
    expect(typeof byYear.rows[0].invoiceValue).toBe('number');
  });

  it('النسب الغائبة تُكتب شرطة لا صفرًا مضلِّلًا', () => {
    const byYear = sheets().find((s) => s.sheetName === COLLECTION_SHEET_NAMES.byYear)!;
    const row2024 = byYear.rows.find((r) => r.year === 2024)!;
    // فاتورة 2024 بلا تحصيل ⇒ متوسط أيام غير معرَّف.
    expect(row2024.days).toBe('—');
  });

  it('جداول الأداء الثلاثة تتشارك نفس الأعمدة بترويسة محورها', () => {
    const all = sheets();
    const customers = all.find((s) => s.sheetName === COLLECTION_SHEET_NAMES.customers)!;
    const projects = all.find((s) => s.sheetName === COLLECTION_SHEET_NAMES.projects)!;
    expect(customers.columns.map((c) => c.key)).toEqual(projects.columns.map((c) => c.key));
    expect(customers.columns[0].header).toBe('العميل');
    expect(projects.columns[0].header).toBe('المشروع');
  });
});
