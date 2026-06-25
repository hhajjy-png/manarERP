import type {
  TemplateStudioDocumentType,
  TemplateStudioElement,
} from '../templateStudioTypes';

// ─── Constants (spec Appendix B) ─────────────────────────────────────────────
export const DOCX_MAX_FILE_BYTES          = 10 * 1024 * 1024; // 10 MB input cap
export const DOCX_MAX_ELEMENTS            = 200;               // element count cap
export const DOCX_MAX_IMAGES             = 10;                // images per import
export const DOCX_MAX_TEMPLATE_JSON_BYTES = 5  * 1024 * 1024; // 5 MB hard block
export const DOCX_WARN_JSON_BYTES         = 2  * 1024 * 1024; // 2 MB soft warning
export const DOCX_ELEMENT_GAP_MM          = 1.5;              // vertical gap between elements
export const DOCX_MAX_Y_MM               = 285;               // Y clamp threshold (mm)
export const DOCX_PREVIEW_SCALE          = 0.45;
export const DOCX_PARSE_TIMEOUT_MS       = 15_000;            // 15 s parse timeout

// ─── Warning types ────────────────────────────────────────────────────────────
export type DocxWarningType =
  | 'image_too_large'
  | 'image_svg_excluded'
  | 'image_count_limit'
  | 'unsupported_feature_italic'
  | 'unsupported_feature_underline'
  | 'unsupported_feature_strikethrough'
  | 'unsupported_shape'
  | 'unsupported_chart'
  | 'unsupported_smartart'
  | 'merged_cell'
  | 'nested_table'
  | 'margin_flattened'
  | 'font_family_ignored'
  | 'partial_bold'
  | 'ltr_element_in_rtl_template'
  | 'page_break_skipped'
  | 'multipage_truncated'
  | 'dynamic_field_unknown'
  | 'element_count_capped'
  | 'element_y_clamped'
  | 'color_token_approximated'
  | 'column_unmatched'
  | 'template_json_large';

export interface DocxWarning {
  type:           DocxWarningType;
  messageAr:      string;
  elementIndex?:  number; // index in elements[] if relevant
}

// ─── Import options (wizard → parser) ────────────────────────────────────────
export interface DocxImportOptions {
  documentType:  TemplateStudioDocumentType;
  templateName?: string; // pre-filled; user can override in Step 4
}

// ─── Parser output ────────────────────────────────────────────────────────────
export interface DocxParseResult {
  elements:       TemplateStudioElement[];
  warnings:       DocxWarning[];
  pageMarginMm:   number;       // from w:pgMar or DEFAULT_PAGE.marginMm (10)
  docWidthMm:     number;       // from w:pgSz; default 210 (A4)
  docHeightMm:    number;       // from w:pgSz; default 297 (A4)
  headerImageIds: Set<string>;  // relationship IDs flagged as potential logos
}

// ─── Wizard internal state ────────────────────────────────────────────────────
export type WizardStep = 1 | 2 | 3 | 4;

export interface WizardInternalState {
  step:         WizardStep;
  file:         File | null;
  documentType: TemplateStudioDocumentType | null;
  parseResult:  DocxParseResult | null;
  templateName: string;
  errorMessage: string | null;
  isParsing:    boolean;
}
