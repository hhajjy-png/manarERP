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
} from './templateStudioTypes';
import { resolveDynamicField } from './templateStudioUtils';

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

// ─── Single element shell ─────────────────────────────────────────────────────
function ElementShell({
  el, docType, data,
}: {
  el:      TemplateStudioElement;
  docType: TemplateStudioDocumentType;
  data:    Record<string, string>;
}) {
  if (el.hidden) return null;

  const style: CSSProperties = {
    position:  'absolute',
    left:      el.x * PX_PER_MM,
    top:       el.y * PX_PER_MM,
    width:     el.w * PX_PER_MM,
    height:    el.h * PX_PER_MM,
    transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
    overflow:  'hidden',
    boxSizing: 'border-box',
  };

  let content: React.ReactNode;
  switch (el.type) {
    case 'text':         content = renderTextEl(el);                            break;
    case 'dynamicField': content = renderDynamicFieldEl(el, docType, data);     break;
    case 'qr':           content = renderQrEl(el, docType, data);               break;
    case 'barcode':      content = renderBarcodeEl(el, docType, data);          break;
    case 'image':        content = renderImageEl(el);                           break;
    case 'line':         content = renderLineEl(el);                            break;
    case 'rect':         content = renderRectEl(el);                            break;
    case 'circle':       content = renderCircleEl(el);                          break;
    default:             content = null;
  }

  return <div style={style}>{content}</div>;
}

// ─── Public renderer props ────────────────────────────────────────────────────
export interface TemplateStudioRendererProps {
  template: TemplateStudioTemplate;
  data:     Record<string, string>; // flat map: field-key (no prefix) → display value
  scale?:   number; // CSS scale factor (default 1 = full 794×1123)
  className?: string;
}

export default function TemplateStudioRenderer({
  template,
  data,
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
          />
        ))}
      </div>
    </div>
  );
}
