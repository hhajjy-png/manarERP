import { describe, it, expect } from 'vitest';
import { toAgingReportInput } from './aging.export.adapter';
import type { FinancialResponse, ArAgingRow, ApAgingRow } from '../financial.types';

function makeArRow(overrides: Partial<ArAgingRow> = {}): ArAgingRow {
  return {
    id: 'AR-1', customerId: 1, customerCode: 'C001', customerName: 'شركة النماء',
    current: 0, '0_30': 500, '31_60': 0, '61_90': 0, '91_120': 0, over_120: 0,
    total: 500, invoiceCount: 1,
    drillDown: { entityType: 'CUSTOMER', entityId: 1, label: 'شركة النماء', route: '/customers' },
    ...overrides,
  };
}

function makeApRow(overrides: Partial<ApAgingRow> = {}): ApAgingRow {
  return {
    id: 'AP-1', supplierId: 1, supplierCode: 'S001', supplierName: 'مورّد الطرق',
    current: 0, '0_30': 0, '31_60': 200, '61_90': 0, '91_120': 0, over_120: 0,
    total: 200, invoiceCount: 1,
    drillDown: { entityType: 'SUPPLIER', entityId: 1, label: 'مورّد الطرق', route: '/suppliers' },
    ...overrides,
  };
}

function makeArResponse(rows: ArAgingRow[], totalOutstanding = 500): FinancialResponse<ArAgingRow> {
  return {
    reportType: 'ar-aging',
    generatedAt: new Date().toISOString(),
    filters: {},
    summary: { totalOutstanding, criticalOver90: 0, entityCount: rows.length },
    metadata: { asOfDate: '2025-06-01T00:00:00.000Z' },
    rows,
  };
}

function makeApResponse(rows: ApAgingRow[], totalOutstanding = 200): FinancialResponse<ApAgingRow> {
  return {
    reportType: 'ap-aging',
    generatedAt: new Date().toISOString(),
    filters: {},
    summary: { totalOutstanding, criticalOver90: 0, entityCount: rows.length },
    metadata: { asOfDate: '2025-06-01T00:00:00.000Z' },
    rows,
  };
}

describe('toAgingReportInput — AR', () => {
  it('sets AR title', () => {
    const input = toAgingReportInput(makeArResponse([makeArRow()]), 'ar');
    expect(input.title).toBe('أعمار ذمم العملاء (مديونيات)');
  });

  // العنوان الفرعي صيغة **عرض** (DD/MM/YYYY) لا الصيغة القانونية السلكية
  // — Date Display, Export & Import Consistency Pack v1.
  it('includes asOfDate in subtitle, in display format', () => {
    const input = toAgingReportInput(makeArResponse([makeArRow()]), 'ar');
    expect(input.subtitle).toContain('01/06/2025');
    expect(input.subtitle).not.toContain('2025-06-01');
  });

  it('maps customerCode and customerName to code/name', () => {
    const input = toAgingReportInput(makeArResponse([makeArRow()]), 'ar');
    expect(input.rows[0].code).toBe('C001');
    expect(input.rows[0].name).toBe('شركة النماء');
  });

  it('maps bucket amounts correctly', () => {
    const row   = makeArRow({ '0_30': 500, '61_90': 300, total: 800 });
    const input = toAgingReportInput(makeArResponse([row], 800), 'ar');
    expect(input.rows[0]['0_30']).toBe(500);
    expect(input.rows[0]['61_90']).toBe(300);
  });

  it('collapses zero buckets to empty string', () => {
    const input = toAgingReportInput(makeArResponse([makeArRow()]), 'ar');
    expect(input.rows[0].current).toBe('');
    expect(input.rows[0]['31_60']).toBe('');
  });

  it('sets totalsRow.total to totalOutstanding from summary', () => {
    const input = toAgingReportInput(makeArResponse([makeArRow()], 500), 'ar');
    expect(input.totalsRow?.total).toBe(500);
  });

  it('produces 9 columns', () => {
    const input = toAgingReportInput(makeArResponse([makeArRow()]), 'ar');
    expect(input.columns).toHaveLength(9);
  });
});

describe('toAgingReportInput — AP', () => {
  it('sets AP title', () => {
    const input = toAgingReportInput(makeApResponse([makeApRow()]), 'ap');
    expect(input.title).toBe('أعمار ذمم الموردين (دائنية)');
  });

  it('maps supplierCode and supplierName to code/name', () => {
    const input = toAgingReportInput(makeApResponse([makeApRow()]), 'ap');
    expect(input.rows[0].code).toBe('S001');
    expect(input.rows[0].name).toBe('مورّد الطرق');
  });

  it('handles multiple rows', () => {
    const rows  = [makeApRow(), makeApRow({ id: 'AP-2', supplierId: 2, supplierCode: 'S002', supplierName: 'مورّد 2', total: 100 })];
    const input = toAgingReportInput(makeApResponse(rows, 300), 'ap');
    expect(input.rows).toHaveLength(2);
    expect(input.totalsRow?.total).toBe(300);
  });
});
