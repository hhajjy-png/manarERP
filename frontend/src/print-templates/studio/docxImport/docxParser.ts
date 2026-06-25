import mammoth from 'mammoth';
import JSZip from 'jszip';
import type {
  TemplateStudioElement,
  TemplateStudioTemplate,
  TemplateStudioDocumentType,
  TextElement,
  DynamicFieldElement,
  ImageElement,
  LineElement,
  RectElement,
  LineItemsTableElement,
  LineItemsColumn,
  StudioFontSize,
  StudioFontWeight,
} from '../templateStudioTypes';
import {
  generateElementId,
  isAllowedField,
  DEFAULT_PAGE,
  isDataUrlWithinLimit,
  MAX_IMAGE_BYTES,
  validateTemplate,
  sanitizeTemplateName,
} from '../templateStudioUtils';
import {
  mapFontSizePt,
  parseFontSizePt,
  mapAlignment,
  parseTextAlign,
  mapTextColor,
  parseColorHex,
  normalizeArabic,
  KEYWORD_SETS,
  DEFAULT_COLUMN_WIDTHS,
} from './docxMappings';
import type { DocxImportOptions, DocxParseResult, DocxWarning } from './docxTypes';
import {
  DOCX_MAX_ELEMENTS,
  DOCX_MAX_IMAGES,
  DOCX_MAX_TEMPLATE_JSON_BYTES,
  DOCX_WARN_JSON_BYTES,
  DOCX_ELEMENT_GAP_MM,
  DOCX_MAX_Y_MM,
} from './docxTypes';

// ─── Private template ID ──────────────────────────────────────────────────────
function generateTemplateId(): string {
  return `tpl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Security: strip dangerous tags before DOMParser ─────────────────────────
function sanitizeHtml(html: string): string {
  return html.replace(
    /<(script|style|iframe|object|embed|link)(\s[^>]*)?>[\s\S]*?<\/\1>/gi,
    '',
  );
}

// ─── Dynamic field regex ──────────────────────────────────────────────────────
const DYNAMIC_FIELD_RE = /^\{\{([\w.]+)\}\}$/;

export function tryDynamicField(
  text: string,
  docType: TemplateStudioDocumentType,
): string | null {
  const m = DYNAMIC_FIELD_RE.exec(text.trim());
  if (!m) return null;
  return isAllowedField(docType, m[1]) ? m[1] : null;
}

// ─── Font size: majority vote across child spans ──────────────────────────────
function extractFontSize(el: Element): StudioFontSize {
  const counts = new Map<number, number>();
  const ownPt = parseFontSizePt((el as HTMLElement).getAttribute('style') ?? '');
  if (ownPt !== null) counts.set(ownPt, 1);
  for (const span of el.querySelectorAll('[style]')) {
    const pt = parseFontSizePt((span as HTMLElement).getAttribute('style') ?? '');
    if (pt !== null) counts.set(pt, (counts.get(pt) ?? 0) + 1);
  }
  if (counts.size === 0) return 'normal';
  return mapFontSizePt(
    [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0],
  );
}

// ─── Estimated text height in mm ─────────────────────────────────────────────
const FONT_H_MM: Record<StudioFontSize, number> = {
  small: 5, normal: 6, large: 8, xlarge: 10,
};

function estimateH(content: string, fontSize: StudioFontSize, widthMm: number): number {
  const charsPerLine = Math.max(1, Math.floor(widthMm / 3.2));
  const lines = Math.max(1, Math.ceil(content.length / charsPerLine));
  return FONT_H_MM[fontSize] * lines + 2;
}

// ─── HTML → elements (exported for unit tests — no mammoth/JSZip) ─────────────
export function docxHtmlToElements(
  html: string,
  docType: TemplateStudioDocumentType,
  headerImageIds: Set<string>,
  pageMarginMm: number,
  docWidthMm: number,
  docHeightMm: number,
): { elements: TemplateStudioElement[]; warnings: DocxWarning[] } {
  const doc       = new DOMParser().parseFromString(html, 'text/html');
  const elements: TemplateStudioElement[] = [];
  const warnings: DocxWarning[]           = [];

  const scaleX   = 210 / docWidthMm;
  const scaleY   = 297 / docHeightMm;
  const leftMm   = pageMarginMm;
  const contentW = 210 - pageMarginMm * 2;

  let cursorY           = pageMarginMm;
  let italicWarned      = false;
  let underlineWarned   = false;
  let partialBoldWarned = false;
  let imageCount        = 0;

  function warn(type: DocxWarning['type'], messageAr: string, idx?: number): void {
    warnings.push({ type, messageAr, ...(idx !== undefined && { elementIndex: idx }) });
  }

  function getY(h: number): number {
    const raw = cursorY * scaleY;
    if (raw + h > DOCX_MAX_Y_MM) {
      warn('element_y_clamped', 'تم تقليص عنصر ليبقى داخل حدود الصفحة');
      return DOCX_MAX_Y_MM - h;
    }
    return raw;
  }

  function advance(h: number): void {
    cursorY += h / scaleY + DOCX_ELEMENT_GAP_MM;
  }

  function processText(node: Element): void {
    if (node.querySelector('br[data-page-break="true"]') && !(node.textContent ?? '').trim()) {
      warn('page_break_skipped', 'فاصل صفحة — تم تجاهله');
      return;
    }

    const text = (node.textContent ?? '').trim();
    if (!text) return;

    const tag    = node.tagName.toLowerCase();
    const hm     = /^h([1-6])$/.exec(tag);
    const hLevel = hm ? parseInt(hm[1]) : 0;
    const isH    = hLevel > 0;

    const H_SIZE: Record<number, StudioFontSize>   = { 1:'xlarge', 2:'xlarge', 3:'large', 4:'large', 5:'normal', 6:'normal' };
    const H_WGHT: Record<number, StudioFontWeight> = { 1:'bold',   2:'bold',   3:'medium', 4:'bold',  5:'bold',   6:'regular' };

    const fontSize: StudioFontSize     = isH ? H_SIZE[hLevel]  : extractFontSize(node);
    let fontWeight: StudioFontWeight   = isH ? H_WGHT[hLevel] : 'regular';

    if (!isH) {
      const hasStrong = !!node.querySelector('strong');
      if (hasStrong) {
        fontWeight = 'bold';
        const strongLen = Array.from(node.querySelectorAll('strong'))
          .reduce((n, s) => n + (s.textContent?.length ?? 0), 0);
        if (strongLen < text.length * 0.9 && !partialBoldWarned) {
          warn('partial_bold', 'بعض الأجزاء غامقة — تم تطبيق الغمق على النص كاملاً');
          partialBoldWarned = true;
        }
      }
    }

    if (!italicWarned && node.querySelector('em')) {
      warn('unsupported_feature_italic', 'النص المائل غير مدعوم — تم تجاهل الخاصية');
      italicWarned = true;
    }
    if (!underlineWarned && node.querySelector('u')) {
      warn('unsupported_feature_underline', 'الخط تحت النص غير مدعوم — تم تجاهل الخاصية');
      underlineWarned = true;
    }

    const inlineStyle = (node as HTMLElement).getAttribute('style') ?? '';
    const align       = mapAlignment(parseTextAlign(inlineStyle));
    const colorHex    = parseColorHex(inlineStyle)
                     ?? parseColorHex((node.querySelector('[style]') as HTMLElement | null)
                         ?.getAttribute('style') ?? '');
    const color = mapTextColor(colorHex);
    const label = isH ? 'عنوان مستورد' : 'نص مستورد';
    const h     = estimateH(text, fontSize, contentW * scaleX);

    const dynField = tryDynamicField(text, docType);
    if (dynField) {
      const el: DynamicFieldElement = {
        id: generateElementId('dynamicField'), label: 'حقل ديناميكي',
        type: 'dynamicField', field: dynField,
        x: leftMm * scaleX, y: getY(h), w: contentW * scaleX, h, rotation: 0,
        style: { fontSize, fontWeight, align, color },
      };
      elements.push(el);
      advance(h);
      return;
    }

    if (DYNAMIC_FIELD_RE.test(text)) {
      warn('dynamic_field_unknown', `حقل غير معروف: ${text}`, elements.length);
    }

    const el: TextElement = {
      id: generateElementId('text'), label,
      type: 'text', content: text,
      x: leftMm * scaleX, y: getY(h), w: contentW * scaleX, h, rotation: 0,
      style: { fontSize, fontWeight, align, color },
    };
    elements.push(el);
    advance(h);
  }

  function processImg(img: Element): void {
    if (imageCount >= DOCX_MAX_IMAGES) {
      warn('image_count_limit', 'تم الوصول إلى الحد الأقصى للصور المستخرجة');
      return;
    }
    const src = (img as HTMLImageElement).src || img.getAttribute('src') || '';
    if (!src.startsWith('data:image/')) return;

    const mimeM = /^data:(image\/[^;]+);/.exec(src);
    const mime  = mimeM ? mimeM[1] : '';
    if (mime === 'image/svg+xml') {
      warn('image_svg_excluded', 'صورة SVG — تم تجاهلها لأسباب أمنية');
      return;
    }
    if (!['image/png','image/jpeg','image/gif','image/webp'].includes(mime)) {
      warn('image_svg_excluded', `نوع صورة غير مدعوم: ${mime}`);
      return;
    }
    if (!isDataUrlWithinLimit(src, MAX_IMAGE_BYTES)) {
      warn('image_too_large', 'صورة تتجاوز 1 ميغابايت — تم تجاهلها');
      return;
    }

    const w = 40; const h = 30;
    const isLogo = headerImageIds.has(img.getAttribute('data-rel-id') ?? '');
    const el: ImageElement = {
      id: generateElementId('image'),
      label: isLogo ? 'شعار محتمل' : 'صورة مستوردة',
      type: 'image', src,
      alt: img.getAttribute('alt') ?? 'صورة مستوردة',
      x: leftMm * scaleX, y: getY(h), w: w * scaleX, h: h * scaleY, rotation: 0,
    };
    imageCount++;
    elements.push(el);
    advance(h);
  }

  function processTable(table: Element): void {
    const rows = table.querySelectorAll('tr');
    if (!rows.length) return;

    const headerCells = rows[0].querySelectorAll('th, td');
    const headers     = Array.from(headerCells).map(c => (c.textContent ?? '').trim());

    if (headers.length >= 3) {
      const matched: Array<{ field: (typeof KEYWORD_SETS)[number]['field']; header: string; idx: number }> = [];
      for (let i = 0; i < headers.length; i++) {
        const normH = normalizeArabic(headers[i]);
        for (const { field, keywords } of KEYWORD_SETS) {
          if (keywords.some(k => normalizeArabic(k) === normH)) {
            matched.push({ field, header: headers[i], idx: i });
            break;
          }
        }
      }

      if (matched.length >= 3) {
        const matchedIdxSet = new Set(matched.map(m => m.idx));
        for (let i = 0; i < headers.length; i++) {
          if (!matchedIdxSet.has(i) && headers[i]) {
            warn('column_unmatched', `عمود غير معروف: "${headers[i]}" — تم تجاهله`);
          }
        }

        const rawTotal = matched.reduce((s, m) => s + (DEFAULT_COLUMN_WIDTHS[m.field] ?? 14), 0);
        const columns: LineItemsColumn[] = matched.map(m => ({
          id:      `col-${m.field}`,
          field:   m.field,
          label:   m.header,
          width:   Math.round(((DEFAULT_COLUMN_WIDTHS[m.field] ?? 14) / rawTotal) * 100),
          align:   'start' as const,
          visible: true,
        }));

        const h = 60;
        const el: LineItemsTableElement = {
          id: generateElementId('lineItemsTable'), label: 'جدول البنود',
          type: 'lineItemsTable', columns,
          headerStyle: { background: 'brand', color: 'default', fontSize: 'normal', fontWeight: 'bold' },
          rowStyle:    { fontSize: 'normal', color: 'default' },
          borderStyle: { color: 'light' },
          rowStriping: true, autoHideZeroColumns: false,
          totals: { showSubtotal: true, showGrandTotal: true },
          x: leftMm * scaleX, y: getY(h), w: contentW * scaleX, h, rotation: 0,
        };
        elements.push(el);
        advance(h);
        return;
      }
    }

    // Static table fallback
    const tableH = rows.length * 8;
    const colW   = contentW / Math.max(1, headers.length);
    const border: RectElement = {
      id: generateElementId('rect'), label: 'إطار جدول',
      type: 'rect', fillColor: 'transparent', borderColor: 'dark', borderRadius: 0,
      x: leftMm * scaleX, y: getY(tableH), w: contentW * scaleX, h: tableH, rotation: 0,
    };
    elements.push(border);

    for (let r = 0; r < rows.length; r++) {
      const cells = rows[r].querySelectorAll('th, td');
      for (let c = 0; c < cells.length; c++) {
        const cell   = cells[c];
        const isHead = cell.tagName.toLowerCase() === 'th';
        const cText  = (cell.textContent ?? '').trim();
        if (!cText) continue;

        if (isHead) {
          const hRect: RectElement = {
            id: generateElementId('rect'), label: 'إطار جدول',
            type: 'rect', fillColor: 'brand', borderColor: 'transparent', borderRadius: 0,
            x: (leftMm + c * colW) * scaleX, y: getY(6), w: colW * scaleX, h: 6, rotation: 0,
          };
          elements.push(hRect);
        }

        if (cell.hasAttribute('colspan') || cell.hasAttribute('rowspan')) {
          warn('merged_cell', 'خلية مدمجة في الجدول — تم تسطيحها');
        }

        const cEl: TextElement = {
          id: generateElementId('text'), label: 'نص مستورد',
          type: 'text', content: cText,
          x: (leftMm + c * colW) * scaleX,
          y: (cursorY + r * 8) * scaleY,
          w: colW * scaleX, h: 6, rotation: 0,
          style: { fontSize: 'normal', fontWeight: isHead ? 'bold' : 'regular', align: 'start', color: isHead ? 'black' : 'default' },
        };
        elements.push(cEl);
      }
    }
    cursorY += tableH + DOCX_ELEMENT_GAP_MM;
  }

  // ── Main walk ─────────────────────────────────────────────────────────────────
  for (const node of Array.from(doc.body.children)) {
    if (elements.length >= DOCX_MAX_ELEMENTS) {
      warn('element_count_capped', `تم الاكتفاء بـ ${DOCX_MAX_ELEMENTS} عنصراً`);
      break;
    }

    const tag = node.tagName.toLowerCase();

    if (tag === 'br' && (node as HTMLElement).getAttribute('data-page-break') === 'true') {
      warn('page_break_skipped', 'فاصل صفحة — تم تجاهله');
    } else if (tag === 'hr') {
      const h = 0.5;
      const hr: LineElement = {
        id: generateElementId('line'), label: 'خط فاصل',
        type: 'line', orientation: 'horizontal', color: 'dark', thickness: 0.5,
        x: leftMm * scaleX, y: getY(h), w: contentW * scaleX, h, rotation: 0,
      };
      elements.push(hr);
      advance(h);
    } else if (tag === 'p' || /^h[1-6]$/.test(tag)) {
      const imgs = node.querySelectorAll('img');
      if (imgs.length > 0 && !(node.textContent ?? '').trim()) {
        imgs.forEach(img => processImg(img));
      } else {
        processText(node);
      }
    } else if (tag === 'table') {
      processTable(node);
    }
  }

  return { elements, warnings };
}

// ─── Secondary JSZip pass: page margins + logo detection ─────────────────────
async function extractPageInfo(buffer: ArrayBuffer): Promise<{
  pageMarginMm:   number;
  docWidthMm:     number;
  docHeightMm:    number;
  headerImageIds: Set<string>;
}> {
  const result = {
    pageMarginMm:   DEFAULT_PAGE.marginMm,
    docWidthMm:     210,
    docHeightMm:    297,
    headerImageIds: new Set<string>(),
  };
  try {
    const zip    = await JSZip.loadAsync(buffer);
    const docXml = await zip.file('word/document.xml')?.async('string');
    if (docXml) {
      const pgMar = /<w:pgMar[^>]*w:top="(\d+)"[^>]*w:right="(\d+)"[^>]*w:bottom="(\d+)"[^>]*w:left="(\d+)"/
        .exec(docXml);
      if (pgMar) {
        const toMm = (t: string) => parseInt(t) * 25.4 / 1440;
        const ms   = [pgMar[1], pgMar[2], pgMar[3], pgMar[4]].map(toMm);
        result.pageMarginMm = Math.round(Math.min(...ms));
      }
      const pgSz = /<w:pgSz[^>]*w:w="(\d+)"[^>]*w:h="(\d+)"/.exec(docXml);
      if (pgSz) {
        result.docWidthMm  = Math.round(parseInt(pgSz[1]) * 25.4 / 1440);
        result.docHeightMm = Math.round(parseInt(pgSz[2]) * 25.4 / 1440);
      }
    }
    const relsXml = await zip.file('word/_rels/document.xml.rels')?.async('string');
    if (relsXml) {
      for (const match of relsXml.matchAll(/Id="([^"]+)"[^>]+Target="(header\d*\.xml)"/g)) {
        const headerPath = match[2];
        const headerXml = await zip.file(`word/${headerPath}`)?.async('string');
        if (headerXml) {
          for (const imgMatch of headerXml.matchAll(/r:embed="([^"]+)"/g)) {
            result.headerImageIds.add(imgMatch[1]);
          }
        }
      }
    }
  } catch {
    // Non-fatal — return defaults
  }
  return result;
}

// ─── Main parse function ──────────────────────────────────────────────────────
export async function parseDocx(
  buffer: ArrayBuffer,
  opts: DocxImportOptions,
): Promise<DocxParseResult> {
  const { pageMarginMm, docWidthMm, docHeightMm, headerImageIds } =
    await extractPageInfo(buffer);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mammothOpts: any = {
    styleMap: [
      "p[style-name='Heading 1'] => h1:fresh",
      "p[style-name='Heading 2'] => h2:fresh",
      "p[style-name='Heading 3'] => h3:fresh",
      "p[style-name='Heading 4'] => h4:fresh",
      "p[style-name='Heading 5'] => h5:fresh",
      "p[style-name='Heading 6'] => h6:fresh",
      "p[style-name='Horizontal Line'] => hr",
      "r[style-name='Horizontal Line'] => hr",
      "b => strong",
      "i => em",
      "u => u",
      "strike => s",
      "br[type='page'] => br[data-page-break='true']",
    ],
    includeDefaultStyleMap: true,
    convertImage: mammoth.images.imgElement(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (image: any) => {
        const allowed = ['image/png','image/jpeg','image/gif','image/webp'];
        if (!allowed.includes(image.contentType)) return { src: '' };
        const b64 = await image.read('base64');
        return { src: `data:${image.contentType};base64,${b64}` };
      },
    ),
  };

  let mammothHtml: string;
  let mammothMessages: Array<{ type: string; message: string }>;
  try {
    const r = await mammoth.convertToHtml({ arrayBuffer: buffer }, mammothOpts);
    mammothHtml     = r.value;
    mammothMessages = r.messages;
  } catch (err) {
    throw new Error(
      `فشل تحليل المستند: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const safeHtml = sanitizeHtml(mammothHtml);
  const { elements, warnings } = docxHtmlToElements(
    safeHtml, opts.documentType, headerImageIds, pageMarginMm, docWidthMm, docHeightMm,
  );

  for (const msg of mammothMessages) {
    if (msg.type === 'warning') {
      warnings.push({ type: 'unsupported_shape', messageAr: `تحذير: ${msg.message}` });
    }
  }

  if (elements.length === 0) {
    throw new Error('المستند فارغ. لا توجد عناصر قابلة للاستيراد');
  }

  const jsonBytes = new Blob([JSON.stringify(elements)]).size;
  if (jsonBytes > DOCX_MAX_TEMPLATE_JSON_BYTES) {
    throw new Error('حجم القالب المُنشأ كبير جداً. يُرجى تقليل عدد الصور أو أحجامها');
  }
  if (jsonBytes > DOCX_WARN_JSON_BYTES) {
    warnings.push({ type: 'template_json_large', messageAr: 'حجم القالب كبير (> 2 ميغابايت) — قد يؤثر على الأداء' });
  }

  return { elements, warnings, pageMarginMm, docWidthMm, docHeightMm, headerImageIds };
}

// ─── Build template from parse result ────────────────────────────────────────
export function buildImportedTemplate(
  result:       DocxParseResult,
  opts:         DocxImportOptions,
  templateName: string,
): TemplateStudioTemplate {
  const name = sanitizeTemplateName(templateName || opts.templateName || 'قالب مستورد');
  const now  = new Date().toISOString();
  const tpl: TemplateStudioTemplate = {
    id:           generateTemplateId(),
    name,
    documentType: opts.documentType,
    page:         { size: 'A4', orientation: 'portrait', marginMm: result.pageMarginMm },
    elements:     result.elements,
    createdAt:    now,
    updatedAt:    now,
  };

  const validation = validateTemplate(tpl);
  if (!validation.valid) {
    throw new Error(`خطأ داخلي في بناء القالب: ${validation.errors.join('; ')}`);
  }
  return tpl;
}
