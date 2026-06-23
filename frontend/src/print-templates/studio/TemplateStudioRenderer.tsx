import { useEffect, useState, CSSProperties } from 'react';
import QRCode from 'qrcode';
import type {
  TemplateStudioTemplate,
  TemplateStudioElement,
  TemplateStudioDocumentType,
  StudioTextStyle,
  StudioColorToken,
  TextElement,
  DynamicFieldElement,
  QrElement,
  BarcodeElement,
  ImageElement,
  LineElement,
  RectElement,
  CircleElement,
  LineItemsTableElement,
  LineItemsColumn,
  NormalizedLineRow,
  AllowedLineItemField,
  TableHeaderStyle,
  TableRowStyle,
  TableBorderStyle,
} from './templateStudioTypes';
import { resolveDynamicField } from './templateStudioUtils';
import {
  resolveInvoiceDocumentTotals,
  resolveQuotationDocumentTotals,
} from './lineItemsResolver';

// ─── A4 canvas dimensions (matches PX_PER_MM = 794/210 from designerUtils) ────
const A4_W_PX  = 794;
const A4_H_PX  = 1123;
const PX_PER_MM = A4_W_PX / 210;

// ─── Token → CSS maps (no arbitrary values accepted) ─────────────────────────
const FONT_SIZE_MAP: Record<NonNullable<StudioTextStyle['fontSize']>, string> = {
  small:  '9pt',
  normal: '11pt',
  large:  '14pt',
  xlarge: '18pt',
};

const FONT_WEIGHT_MAP: Record<NonNullable<StudioTextStyle['fontWeight']>, string> = {
  regular: '400',
  medium:  '600',
  bold:    '800',
};

const TEXT_COLOR_MAP: Record<NonNullable<StudioTextStyle['color']>, string> = {
  default: '#1f2937',
  brand:   '#1d4e6f',
  dark:    '#0f172a',
  blue:    '#1d4ed8',
  black:   '#000000',
  gray:    '#6b7280',
};

const COLOR_TOKEN_MAP: Record<StudioColorToken, string> = {
  transparent: 'transparent',
  white:       '#ffffff',
  light:       '#f3f4f6',
  gray:        '#9ca3af',
  brand:       '#1d4e6f',
  dark:        '#1f2937',
  black:       '#000000',
};

function textStyleToCSS(style: StudioTextStyle): CSSProperties {
  return {
    fontSize:   style.fontSize   ? FONT_SIZE_MAP[style.fontSize]   : '11pt',
    fontWeight: style.fontWeight ? FONT_WEIGHT_MAP[style.fontWeight] : '400',
    color:      style.color      ? TEXT_COLOR_MAP[style.color]      : TEXT_COLOR_MAP.default,
    textAlign:  style.align === 'center' ? 'center'
               : style.align === 'end'   ? 'right'
               : 'right', // RTL default
    fontFamily: 'Cairo, sans-serif',
    lineHeight: 1.4,
    wordBreak:  'break-word',
  };
}

// ─── QR element — uses existing qrcode package ────────────────────────────────
function QrRenderer({ value, w, h }: { value: string; w: number; h: number }) {
  const [dataUrl, setDataUrl] = useState<string>('');

  useEffect(() => {
    if (!value) return;
    const size = Math.round(Math.min(w, h) * PX_PER_MM);
    QRCode.toDataURL(value || 'placeholder', {
      width:        size,
      margin:       1,
      errorCorrectionLevel: 'M',
    }).then(setDataUrl).catch(() => setDataUrl(''));
  }, [value, w, h]);

  if (!dataUrl) {
    return (
      <div style={{
        width: '100%', height: '100%', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: '#f3f4f6', border: '1px dashed #9ca3af',
        fontSize: 8, color: '#6b7280', fontFamily: 'Cairo, sans-serif',
      }}>
        QR
      </div>
    );
  }

  return (
    <img
      src={dataUrl}
      alt="QR Code"
      style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
    />
  );
}

// ─── Barcode placeholder — CSS bars ──────────────────────────────────────────
function BarcodePlaceholder({ value }: { value: string }) {
  const bars = Array.from({ length: 30 }, (_, i) => ({
    w: (i % 3 === 0 ? 3 : i % 2 === 0 ? 2 : 1),
    dark: i % 3 !== 1,
  }));

  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', background: '#fff',
    }}>
      <div style={{ display: 'flex', alignItems: 'stretch', height: '70%', gap: 1 }}>
        {bars.map((bar, i) => (
          <div
            key={i}
            style={{
              width:      bar.w,
              background: bar.dark ? '#1f2937' : '#ffffff',
              flex:       'none',
            }}
          />
        ))}
      </div>
      {value && (
        <div style={{
          fontSize: 7, marginTop: 2, color: '#1f2937',
          fontFamily: 'monospace', letterSpacing: 1,
        }}>
          {value.slice(0, 20)}
        </div>
      )}
    </div>
  );
}

// ─── Per-element renderers ────────────────────────────────────────────────────
function renderTextEl(el: TextElement): React.ReactNode {
  return (
    <div style={{ width: '100%', height: '100%', overflow: 'hidden', ...textStyleToCSS(el.style) }}>
      {el.content}
    </div>
  );
}

function renderDynamicFieldEl(
  el:     DynamicFieldElement,
  docType: TemplateStudioDocumentType,
  data:   Record<string, string>,
): React.ReactNode {
  const value = resolveDynamicField(docType, el.field, data);
  return (
    <div style={{ width: '100%', height: '100%', overflow: 'hidden', ...textStyleToCSS(el.style ?? {}) }}>
      {value || <span style={{ color: '#9ca3af', fontStyle: 'italic', fontSize: 9 }}>{el.field}</span>}
    </div>
  );
}

function renderQrEl(el: QrElement, docType: TemplateStudioDocumentType, data: Record<string, string>): React.ReactNode {
  const value = el.field ? resolveDynamicField(docType, el.field, data) : el.label;
  return <QrRenderer value={value || el.label} w={el.w} h={el.h} />;
}

function renderBarcodeEl(el: BarcodeElement, docType: TemplateStudioDocumentType, data: Record<string, string>): React.ReactNode {
  const value = el.field ? resolveDynamicField(docType, el.field, data) : '';
  return <BarcodePlaceholder value={value} />;
}

function renderImageEl(el: ImageElement): React.ReactNode {
  if (!el.src || !el.src.startsWith('data:image/')) {
    return (
      <div style={{
        width: '100%', height: '100%', background: '#f3f4f6',
        border: '1px dashed #9ca3af', display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontSize: 8, color: '#6b7280',
      }}>
        صورة
      </div>
    );
  }
  return (
    <img
      src={el.src}
      alt={el.alt || ''}
      style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
    />
  );
}

function renderLineEl(el: LineElement): React.ReactNode {
  const color = COLOR_TOKEN_MAP[el.color] ?? '#1f2937';
  const thick  = Math.max(el.thickness, 0.3) * PX_PER_MM;
  if (el.orientation === 'horizontal') {
    return (
      <div style={{
        width: '100%', height: '100%', display: 'flex', alignItems: 'center',
      }}>
        <div style={{ width: '100%', height: thick, background: color }} />
      </div>
    );
  }
  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', justifyContent: 'center',
    }}>
      <div style={{ width: thick, height: '100%', background: color }} />
    </div>
  );
}

function renderRectEl(el: RectElement): React.ReactNode {
  return (
    <div style={{
      width:        '100%',
      height:       '100%',
      background:   COLOR_TOKEN_MAP[el.fillColor]   ?? 'transparent',
      border:       `1px solid ${COLOR_TOKEN_MAP[el.borderColor] ?? 'transparent'}`,
      borderRadius: el.borderRadius * PX_PER_MM,
      boxSizing:    'border-box',
    }} />
  );
}

function renderCircleEl(el: CircleElement): React.ReactNode {
  return (
    <div style={{
      width:      '100%',
      height:     '100%',
      background: COLOR_TOKEN_MAP[el.fillColor]   ?? 'transparent',
      border:     `1px solid ${COLOR_TOKEN_MAP[el.borderColor] ?? 'transparent'}`,
      borderRadius: '50%',
      boxSizing:  'border-box',
    }} />
  );
}

// ─── Line items table renderer ────────────────────────────────────────────────
// Required fields may never be auto-hidden even when all values are zero.
const REQUIRED_LINE_ITEM_FIELDS: ReadonlySet<AllowedLineItemField> = new Set(['description', 'total']);

function getCellValue(row: NormalizedLineRow, field: AllowedLineItemField): string {
  switch (field) {
    case 'index':       return String(row.index);
    case 'description': return row.description;
    case 'quantity':    return row.quantity;
    case 'unit':        return row.unit;
    case 'unitPrice':   return row.unitPrice;
    case 'discount':    return row.discount ?? '';
    case 'total':       return row.total;
  }
}

function tableCellAlign(align: 'start' | 'center' | 'end'): 'right' | 'center' | 'left' {
  if (align === 'center') return 'center';
  if (align === 'end')    return 'left';   // end = left in RTL
  return 'right';                           // start = right in RTL
}

function isAllZeroOrEmpty(rows: NormalizedLineRow[], field: AllowedLineItemField): boolean {
  if (rows.length === 0) return false;
  return rows.every((row) => {
    const v = getCellValue(row, field);
    return v === '' || v === '0' || v === '0.000';
  });
}

function renderLineItemsTableEl(
  el:        LineItemsTableElement,
  lineItems: NormalizedLineRow[],
  docType:   TemplateStudioDocumentType,
  data:      Record<string, string>,
): React.ReactNode {
  // Resolve document-level totals from pre-formatted data map.
  const docTotals = docType === 'invoice'
    ? resolveInvoiceDocumentTotals(data)
    : resolveQuotationDocumentTotals(data);

  // Determine visible columns, optionally auto-hiding all-zero non-required ones.
  let visibleCols = el.columns.filter((c) => c.visible);
  if (el.autoHideZeroColumns) {
    visibleCols = visibleCols.filter((c) =>
      REQUIRED_LINE_ITEM_FIELDS.has(c.field) || !isAllZeroOrEmpty(lineItems, c.field),
    );
  }

  const borderVal  = `1px solid ${COLOR_TOKEN_MAP[el.borderStyle.color] ?? COLOR_TOKEN_MAP.gray}`;
  const hdrBg      = COLOR_TOKEN_MAP[el.headerStyle.background] ?? COLOR_TOKEN_MAP.brand;
  const hdrColor   = TEXT_COLOR_MAP[el.headerStyle.color]       ?? '#ffffff';
  const hdrSize    = FONT_SIZE_MAP[el.headerStyle.fontSize]     ?? '11pt';
  const hdrWeight  = FONT_WEIGHT_MAP[el.headerStyle.fontWeight] ?? '700';
  const rowColor   = TEXT_COLOR_MAP[el.rowStyle.color]          ?? TEXT_COLOR_MAP.default;
  const rowSize    = FONT_SIZE_MAP[el.rowStyle.fontSize]        ?? '11pt';
  const stripeBg   = COLOR_TOKEN_MAP.light;  // #f3f4f6 for odd rows

  // Footer totals from document-level resolver (not computed from line items).
  const totalsRows: { label: string; value: string }[] = [];
  if (el.totals?.showSubtotal)   totalsRows.push({ label: 'الإجمالي قبل الخصم', value: docTotals.subtotal   });
  if (el.totals?.showDiscount)   totalsRows.push({ label: 'الخصم',               value: docTotals.discount   });
  if (el.totals?.showTax)        totalsRows.push({ label: 'الضريبة',              value: docTotals.tax        });
  if (el.totals?.showGrandTotal) totalsRows.push({ label: 'الإجمالي النهائي',     value: docTotals.grandTotal });

  const lblAlign = tableCellAlign(el.totals?.labelAlign ?? 'end');
  const valAlign = tableCellAlign(el.totals?.valueAlign ?? 'end');

  return (
    <div style={{ width: '100%', overflow: 'visible', fontFamily: 'Cairo, sans-serif', direction: 'rtl' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: rowSize, color: rowColor }}>
        <colgroup>
          {visibleCols.map((col) => (
            <col key={col.id} style={{ width: `${col.width}%` }} />
          ))}
        </colgroup>
        {/* display:table-header-group makes the header repeat on print page breaks */}
        <thead style={{ display: 'table-header-group' }}>
          <tr style={{ pageBreakInside: 'avoid' }}>
            {visibleCols.map((col) => (
              <th key={col.id} style={{
                background: hdrBg, color: hdrColor, fontSize: hdrSize, fontWeight: hdrWeight,
                border: borderVal, padding: '4px 6px', textAlign: tableCellAlign(col.align),
                fontFamily: 'Cairo, sans-serif',
                WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact',
              }}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleCols.length === 0 || lineItems.length === 0 ? (
            <tr style={{ pageBreakInside: 'avoid' }}>
              <td colSpan={Math.max(visibleCols.length, 1)} style={{
                border: borderVal, padding: '6px', textAlign: 'center',
                color: '#9ca3af', fontSize: rowSize, fontFamily: 'Cairo, sans-serif',
              }}>
                لا توجد بنود
              </td>
            </tr>
          ) : (
            lineItems.map((row, idx) => {
              const isStripe = el.rowStriping && idx % 2 === 1;
              return (
                <tr key={row.index} style={{ pageBreakInside: 'avoid', background: isStripe ? stripeBg : undefined,
                  WebkitPrintColorAdjust: isStripe ? 'exact' : undefined,
                  printColorAdjust:       isStripe ? 'exact' : undefined,
                }}>
                  {visibleCols.map((col) => (
                    <td key={col.id} style={{
                      border: borderVal, padding: '3px 6px',
                      textAlign: tableCellAlign(col.align), fontSize: rowSize,
                      fontFamily: 'Cairo, sans-serif', wordBreak: 'break-word',
                    }}>
                      {getCellValue(row, col.field)}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
        {/* display:table-footer-group keeps footer at page bottom on print */}
        {totalsRows.length > 0 && (
          <tfoot style={{ display: 'table-footer-group' }}>
            {totalsRows.map((t) => (
              <tr key={t.label} style={{ pageBreakInside: 'avoid' }}>
                <td colSpan={visibleCols.length - 1} style={{
                  border: borderVal, padding: '3px 6px',
                  textAlign: lblAlign, fontWeight: 700, fontSize: rowSize,
                  fontFamily: 'Cairo, sans-serif',
                }}>
                  {t.label}
                </td>
                <td style={{
                  border: borderVal, padding: '3px 6px',
                  textAlign: valAlign, fontWeight: 700, fontSize: rowSize,
                  fontFamily: 'Cairo, sans-serif',
                }}>
                  {t.value}
                </td>
              </tr>
            ))}
          </tfoot>
        )}
      </table>
    </div>
  );
}

// ─── Single element shell ─────────────────────────────────────────────────────
function ElementShell({
  el, docType, data, lineItems,
}: {
  el:        TemplateStudioElement;
  docType:   TemplateStudioDocumentType;
  data:      Record<string, string>;
  lineItems: NormalizedLineRow[];
}) {
  if (el.hidden) return null;

  const isTable  = el.type === 'lineItemsTable';
  const style: CSSProperties = {
    position:  'absolute',
    left:      el.x * PX_PER_MM,
    top:       el.y * PX_PER_MM,
    width:     el.w * PX_PER_MM,
    height:    el.h * PX_PER_MM,
    transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
    overflow:  isTable ? 'visible' : 'hidden',
    boxSizing: 'border-box',
  };

  let content: React.ReactNode;
  switch (el.type) {
    case 'text':           content = renderTextEl(el);                            break;
    case 'dynamicField':   content = renderDynamicFieldEl(el, docType, data);     break;
    case 'qr':             content = renderQrEl(el, docType, data);               break;
    case 'barcode':        content = renderBarcodeEl(el, docType, data);          break;
    case 'image':          content = renderImageEl(el);                           break;
    case 'line':           content = renderLineEl(el);                            break;
    case 'rect':           content = renderRectEl(el);                            break;
    case 'circle':         content = renderCircleEl(el);                          break;
    case 'lineItemsTable': content = renderLineItemsTableEl(el, lineItems, docType, data); break;
    default:               content = null;
  }

  return <div style={style}>{content}</div>;
}

// ─── Public renderer props ────────────────────────────────────────────────────
export interface TemplateStudioRendererProps {
  template:   TemplateStudioTemplate;
  data:       Record<string, string>; // flat map: field-key (no prefix) → display value
  lineItems?: NormalizedLineRow[];    // optional; required only for lineItemsTable elements
  scale?:     number;                 // CSS scale factor (default 1 = full 794×1123)
  className?: string;
}

export default function TemplateStudioRenderer({
  template,
  data,
  lineItems = [],
  scale = 1,
  className,
}: TemplateStudioRendererProps) {
  const marginPx = (template.page.marginMm ?? 10) * PX_PER_MM;

  const canvasStyle: CSSProperties = {
    position:        'relative',
    width:           A4_W_PX,
    height:          A4_H_PX,
    background:      '#ffffff',
    overflow:        'hidden',
    boxSizing:       'border-box',
    padding:         marginPx,
    fontFamily:      'Cairo, sans-serif',
    direction:       'rtl',
    transformOrigin: 'top left',
    transform:       scale !== 1 ? `scale(${scale})` : undefined,
  };

  return (
    <div
      className={className}
      style={{
        width:  scale !== 1 ? A4_W_PX * scale : A4_W_PX,
        height: scale !== 1 ? A4_H_PX * scale : A4_H_PX,
      }}
    >
      <div style={canvasStyle}>
        {template.elements.map((el) => (
          <ElementShell
            key={el.id}
            el={el}
            docType={template.documentType}
            data={data}
            lineItems={lineItems}
          />
        ))}
      </div>
    </div>
  );
}
