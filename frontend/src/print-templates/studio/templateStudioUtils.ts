import type {
  TemplateStudioDocumentType,
  TemplateStudioSettings,
  TemplateStudioTemplate,
  TemplateStudioElement,
  TemplateStudioElementType,
  TemplatePageSettings,
  ValidationResult,
  ImportResult,
  LineItemsTableElement,
} from './templateStudioTypes';
import {
  ALLOWED_ELEMENT_TYPES,
  INVOICE_ALLOWED_FIELDS,
  QUOTATION_ALLOWED_FIELDS,
  INVOICE_LINE_ITEM_FIELDS,
  QUOTATION_LINE_ITEM_FIELDS,
} from './templateStudioTypes';

// ─── Constants ────────────────────────────────────────────────────────────────
export const STUDIO_VERSION      = 1 as const;
export const MAX_TEMPLATE_NAME_LEN = 60;
export const MAX_IMAGE_BYTES     = 1_048_576; // 1 MB

export const DEFAULT_PAGE: TemplatePageSettings = {
  size:        'A4',
  orientation: 'portrait',
  marginMm:    10,
};

// ─── ID generation — no external package ─────────────────────────────────────
export function generateElementId(type: TemplateStudioElementType): string {
  return `${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function generateTemplateId(): string {
  return `tpl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Name sanitization ────────────────────────────────────────────────────────
export function sanitizeTemplateName(raw: string): string {
  return raw
    .replace(/[<>"';&]/g, '')
    .trim()
    .slice(0, MAX_TEMPLATE_NAME_LEN)
    || 'قالب جديد';
}

// ─── Allowlist helpers ────────────────────────────────────────────────────────
export function getAllowedFields(docType: TemplateStudioDocumentType): readonly string[] {
  return docType === 'invoice' ? INVOICE_ALLOWED_FIELDS : QUOTATION_ALLOWED_FIELDS;
}

export function isAllowedField(docType: TemplateStudioDocumentType, field: string): boolean {
  return (getAllowedFields(docType) as readonly string[]).includes(field);
}

// ─── Dynamic field resolver ───────────────────────────────────────────────────
// data is a flat map of field-key (without doc-type prefix) → display string
// field format: 'invoice.number' → key is 'number'
export function resolveDynamicField(
  docType:  TemplateStudioDocumentType,
  field:    string,
  data:     Record<string, string>,
): string {
  if (!isAllowedField(docType, field)) return '';
  const key = field.includes('.') ? field.split('.').slice(1).join('.') : field;
  return data[key] ?? '';
}

// ─── Blank template factory ───────────────────────────────────────────────────
export function createBlankTemplate(documentType: TemplateStudioDocumentType): TemplateStudioTemplate {
  const now = new Date().toISOString();
  return {
    id:           generateTemplateId(),
    name:         documentType === 'invoice' ? 'فاتورة جديدة' : 'عرض سعر جديد',
    documentType,
    page:         { ...DEFAULT_PAGE },
    elements:     [],
    createdAt:    now,
    updatedAt:    now,
  };
}

// ─── Clone template ───────────────────────────────────────────────────────────
export function cloneTemplate(template: TemplateStudioTemplate): TemplateStudioTemplate {
  const now = new Date().toISOString();
  return {
    ...template,
    id:        generateTemplateId(),
    name:      sanitizeTemplateName(`${template.name} (نسخة)`),
    elements:  template.elements.map(el => ({ ...el })),
    createdAt: now,
    updatedAt: now,
  };
}

// ─── Element validation ───────────────────────────────────────────────────────
export function validateElement(
  element: TemplateStudioElement,
  docType: TemplateStudioDocumentType,
): ValidationResult {
  const errors: string[] = [];

  if (!element.id || typeof element.id !== 'string') {
    errors.push('معرف العنصر مفقود');
  }
  if (!ALLOWED_ELEMENT_TYPES.has(element.type)) {
    errors.push(`نوع عنصر غير معروف: ${String(element.type)}`);
  }
  if (typeof element.x !== 'number')                  errors.push('x يجب أن يكون رقماً');
  if (typeof element.y !== 'number')                  errors.push('y يجب أن يكون رقماً');
  if (typeof element.w !== 'number' || element.w <= 0) errors.push('w يجب أن يكون رقماً موجباً');
  if (typeof element.h !== 'number' || element.h <= 0) errors.push('h يجب أن يكون رقماً موجباً');

  if (element.type === 'text') {
    if (typeof element.content !== 'string') errors.push('محتوى النص مفقود');
  }

  if (element.type === 'dynamicField' || element.type === 'qr' || element.type === 'barcode') {
    if (element.field && !isAllowedField(docType, element.field)) {
      errors.push(`حقل غير مسموح: ${element.field}`);
    }
  }

  if (element.type === 'image') {
    if (typeof element.src !== 'string') {
      errors.push('مصدر الصورة مفقود');
    } else if (element.src && !element.src.startsWith('data:image/')) {
      errors.push('مصدر الصورة يجب أن يكون data URL');
    } else if (element.src && !isDataUrlWithinLimit(element.src)) {
      errors.push('حجم الصورة يتجاوز 1 ميغابايت');
    }
  }

  if (element.type === 'lineItemsTable') {
    const el = element as LineItemsTableElement;
    const allowedFields: readonly string[] =
      docType === 'invoice' ? INVOICE_LINE_ITEM_FIELDS : QUOTATION_LINE_ITEM_FIELDS;

    if (!Array.isArray(el.columns) || el.columns.length === 0) {
      errors.push('جدول البنود يجب أن يحتوي على عمود واحد على الأقل');
    } else {
      const seenIds = new Set<string>();
      for (const col of el.columns) {
        if (seenIds.has(col.id)) {
          errors.push(`معرف عمود مكرر: ${col.id}`);
        }
        seenIds.add(col.id);

        if (!allowedFields.includes(col.field)) {
          errors.push(`حقل جدول غير مسموح: ${String(col.field)}`);
        }

        if (
          typeof col.label !== 'string' ||
          col.label.includes('<') ||
          col.label.includes('>')
        ) {
          errors.push('تسمية عمود غير آمنة');
        }

        if (!['start', 'center', 'end'].includes(col.align)) {
          errors.push(`محاذاة عمود غير صالحة: ${col.align}`);
        }

        if (typeof col.width !== 'number' || col.width < 0) {
          errors.push('عرض عمود غير صالح');
        }
      }
    }

    if (el.autoHideZeroColumns !== undefined && typeof el.autoHideZeroColumns !== 'boolean') {
      errors.push('autoHideZeroColumns يجب أن يكون قيمة منطقية');
    }
    if (el.rowStriping !== undefined && typeof el.rowStriping !== 'boolean') {
      errors.push('rowStriping يجب أن يكون قيمة منطقية');
    }

    if (el.totals) {
      for (const key of ['showSubtotal', 'showDiscount', 'showTax', 'showGrandTotal'] as const) {
        const v = el.totals[key];
        if (v !== undefined && typeof v !== 'boolean') {
          errors.push(`قيمة إجمالي غير صالحة: ${key}`);
        }
      }
      for (const key of ['labelAlign', 'valueAlign'] as const) {
        const v = el.totals[key];
        if (v !== undefined && !['start', 'center', 'end'].includes(v)) {
          errors.push(`محاذاة إجمالي غير صالحة: ${key}`);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ─── Template validation ──────────────────────────────────────────────────────
export function validateTemplate(template: TemplateStudioTemplate): ValidationResult {
  const errors: string[] = [];

  if (!template.id)   errors.push('معرف القالب مفقود');
  if (!template.name) errors.push('اسم القالب مفقود');
  if (template.name && template.name.length > MAX_TEMPLATE_NAME_LEN) {
    errors.push('اسم القالب طويل جداً');
  }
  if (!['invoice', 'quotation'].includes(template.documentType)) {
    errors.push('نوع المستند غير صحيح');
  }
  if (!Array.isArray(template.elements)) {
    errors.push('عناصر القالب غير صحيحة');
  }
  if (template.page?.size !== 'A4') {
    errors.push('حجم الصفحة يجب أن يكون A4');
  }

  for (const el of (template.elements ?? [])) {
    const { errors: elErrors } = validateElement(el, template.documentType);
    errors.push(...elErrors);
  }

  return { valid: errors.length === 0, errors };
}

// ─── Parse / serialize settings ───────────────────────────────────────────────
export function serializeTemplateStudioSettings(settings: TemplateStudioSettings): string {
  return JSON.stringify(settings);
}

export function parseTemplateStudioSettings(value: string | undefined): TemplateStudioSettings | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      (parsed as Record<string, unknown>).version !== 1 ||
      !Array.isArray((parsed as Record<string, unknown>).templates)
    ) {
      return null;
    }
    return parsed as TemplateStudioSettings;
  } catch {
    return null;
  }
}

// ─── Export / import ──────────────────────────────────────────────────────────
export function exportTemplate(template: TemplateStudioTemplate): string {
  return JSON.stringify({ version: STUDIO_VERSION, template }, null, 2);
}

export function importTemplate(json: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: 'JSON غير صالح' };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, error: 'البنية غير صحيحة' };
  }

  const obj = parsed as Record<string, unknown>;
  if (obj.version !== 1) {
    return { ok: false, error: 'إصدار القالب غير مدعوم' };
  }

  const tpl = obj.template as TemplateStudioTemplate | undefined;
  if (!tpl || typeof tpl !== 'object') {
    return { ok: false, error: 'القالب مفقود في الملف' };
  }

  const result = validateTemplate(tpl);
  if (!result.valid) {
    return { ok: false, error: result.errors.join('; ') };
  }

  const now = new Date().toISOString();
  return {
    ok: true,
    template: { ...tpl, id: generateTemplateId(), updatedAt: now },
  };
}

// ─── Image helpers ────────────────────────────────────────────────────────────
export function estimateDataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.split(',')[1] ?? '';
  return Math.ceil(base64.length * 0.75);
}

export function isDataUrlWithinLimit(dataUrl: string, maxBytes = MAX_IMAGE_BYTES): boolean {
  return estimateDataUrlBytes(dataUrl) <= maxBytes;
}

// ─── Active template lookup ───────────────────────────────────────────────────
export function getActiveTemplate(
  settings:  TemplateStudioSettings | null,
  docType:   TemplateStudioDocumentType,
  activeId:  string | null | undefined,
): TemplateStudioTemplate | null {
  if (!settings || !activeId) return null;
  return (
    settings.templates.find(
      (t) => t.id === activeId && t.documentType === docType,
    ) ?? null
  );
}
