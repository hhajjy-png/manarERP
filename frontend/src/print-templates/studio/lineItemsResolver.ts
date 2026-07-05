import type {
  LineItemsColumn,
  NormalizedLineRow,
  TemplateStudioDocumentType,
} from './templateStudioTypes';
import { formatNumber } from '../../lib/format';

// ─── Document-level totals ────────────────────────────────────────────────────
export interface DocumentTotals {
  subtotal:   string;
  discount:   string;
  tax:        string;
  grandTotal: string;
}

// ─── Safe formatter for pre-formatted or raw number strings ──────────────────
// Accepts already-formatted KWD strings (e.g. "1,234.500") or raw numbers.
// Returns '0.000' for missing, empty, NaN, or Infinity values.
function safeFmtStr(val: unknown): string {
  if (val === undefined || val === null || val === '') return '0.000';
  const s = String(val).replace(/,/g, '');
  const n = parseFloat(s);
  if (!isFinite(n)) return '0.000';
  return formatNumber(n);
}

// ─── Document-level totals resolvers ─────────────────────────────────────────
// Invoice: data already has subtotal/discount/tax/grandTotal as formatted strings.
export function resolveInvoiceDocumentTotals(data: Record<string, string>): DocumentTotals {
  return {
    subtotal:   safeFmtStr(data.subtotal),
    discount:   safeFmtStr(data.discount),
    tax:        safeFmtStr(data.tax),
    grandTotal: safeFmtStr(data.grandTotal),
  };
}

// Quotation: data has 'total' but may not have subtotal/discount/tax/grandTotal.
// Uses || (not ??) so that empty-string values also fall back to total.
export function resolveQuotationDocumentTotals(data: Record<string, string>): DocumentTotals {
  return {
    subtotal:   safeFmtStr(data.subtotal   || data.total),
    discount:   safeFmtStr(data.discount),
    tax:        safeFmtStr(data.tax),
    grandTotal: safeFmtStr(data.grandTotal || data.total),
  };
}

// ─── KWD number formatter ─────────────────────────────────────────────────────
function fmtNum(n: unknown): string {
  const num = typeof n === 'number' ? n : parseFloat(String(n ?? ''));
  if (!isFinite(num)) return '0.000';
  return formatNumber(num);
}

function fmtStr(s: unknown): string {
  return typeof s === 'string' ? s : String(s ?? '');
}

function safeInt(n: unknown, fallback: number): number {
  const v = typeof n === 'number' ? n : parseInt(String(n ?? ''), 10);
  return isFinite(v) ? v : fallback;
}

// ─── Invoice resolver ─────────────────────────────────────────────────────────
// Accepts the raw `items` array from InvoicePreview (FullInvoice.items).
// Each item shape: { id, description, quantity, unit, unitPrice, total }
export function resolveInvoiceLineItems(items: unknown): NormalizedLineRow[] {
  if (!Array.isArray(items)) return [];
  return items.map((item, idx) => {
    const obj = (typeof item === 'object' && item !== null)
      ? (item as Record<string, unknown>)
      : {};
    return {
      index:       safeInt(obj.number ?? obj.id, idx + 1),
      description: fmtStr(obj.description ?? obj.descriptionAr ?? ''),
      quantity:    fmtStr(
        typeof obj.quantity === 'number'
          ? obj.quantity.toString()
          : (obj.quantity ?? obj.qty ?? ''),
      ),
      unit:      fmtStr(obj.unit ?? ''),
      unitPrice: fmtNum(obj.unitPrice),
      discount:  undefined,
      total:     fmtNum(obj.total),
    };
  });
}

// ─── Quotation resolver ───────────────────────────────────────────────────────
// Accepts the raw `items` array from Quotation page (QuotationItem[]).
// Each item shape: { id, description, qty, unit, unitPrice }
export function resolveQuotationLineItems(items: unknown): NormalizedLineRow[] {
  if (!Array.isArray(items)) return [];
  return items.map((item, idx) => {
    const obj = (typeof item === 'object' && item !== null)
      ? (item as Record<string, unknown>)
      : {};
    const qty   = parseFloat(String(obj.qty ?? obj.quantity ?? 0)) || 0;
    const price = parseFloat(String(obj.unitPrice ?? 0)) || 0;
    return {
      index:       idx + 1,
      description: fmtStr(obj.description ?? ''),
      quantity:    qty === 0 ? '' : qty.toString(),
      unit:        fmtStr(obj.unit ?? ''),
      unitPrice:   fmtNum(price),
      total:       fmtNum(qty * price),
    };
  });
}

// ─── Width normalization ──────────────────────────────────────────────────────
// Visible column widths are normalized so they sum to 100.
// Hidden columns keep their stored width unchanged.
export function normalizeColumnWidths(columns: LineItemsColumn[]): LineItemsColumn[] {
  const visible = columns.filter((c) => c.visible);
  const totalW  = visible.reduce((s, c) => s + c.width, 0);
  if (totalW === 0 || visible.length === 0) return columns;
  return columns.map((c) =>
    c.visible
      ? { ...c, width: Math.round((c.width / totalW) * 100 * 10) / 10 }
      : c,
  );
}

// ─── Default column factories ─────────────────────────────────────────────────
export function getDefaultInvoiceColumns(): LineItemsColumn[] {
  return [
    { id: 'col-idx',   field: 'index',       label: '#',          width: 6,  align: 'center', visible: true  },
    { id: 'col-desc',  field: 'description', label: 'البيان',     width: 40, align: 'start',  visible: true  },
    { id: 'col-qty',   field: 'quantity',    label: 'الكمية',     width: 10, align: 'center', visible: true  },
    { id: 'col-unit',  field: 'unit',        label: 'الوحدة',     width: 10, align: 'center', visible: true  },
    { id: 'col-price', field: 'unitPrice',   label: 'سعر الوحدة', width: 17, align: 'end',    visible: true  },
    { id: 'col-disc',  field: 'discount',    label: 'الخصم',      width: 0,  align: 'end',    visible: false },
    { id: 'col-total', field: 'total',       label: 'الإجمالي',   width: 17, align: 'end',    visible: true  },
  ];
}

export function getDefaultQuotationColumns(): LineItemsColumn[] {
  return [
    { id: 'col-idx',   field: 'index',       label: '#',          width: 6,  align: 'center', visible: true },
    { id: 'col-desc',  field: 'description', label: 'البيان',     width: 44, align: 'start',  visible: true },
    { id: 'col-qty',   field: 'quantity',    label: 'الكمية',     width: 10, align: 'center', visible: true },
    { id: 'col-unit',  field: 'unit',        label: 'الوحدة',     width: 10, align: 'center', visible: true },
    { id: 'col-price', field: 'unitPrice',   label: 'سعر الوحدة', width: 15, align: 'end',    visible: true },
    { id: 'col-total', field: 'total',       label: 'الإجمالي',   width: 15, align: 'end',    visible: true },
  ];
}

export function getDefaultLineItemsColumns(docType: TemplateStudioDocumentType): LineItemsColumn[] {
  return docType === 'invoice'
    ? getDefaultInvoiceColumns()
    : getDefaultQuotationColumns();
}
