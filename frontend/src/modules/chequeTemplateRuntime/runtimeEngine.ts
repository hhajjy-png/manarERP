/**
 * Cheque Template Runtime Engine — the pipeline (Cheque Template Runtime
 * Engine v1).
 *
 * Transforms a stored cheque template + a runtime data object into a fully
 * resolved, React-independent render model. Pure functions only — no UI, no
 * printer, no dialog, no side effects. This is designed to become the SINGLE
 * rendering source for future Preview, Printing, and PDF export, so no
 * rendering logic is duplicated.
 *
 * Pipeline:
 *   resolveChequeTemplate()
 *     → validate template (shape / empty / surface)
 *     → resolve runtime values (mock placeholder, overridable)
 *     → per field: normalize + validate → resolve bound text → resolve layout
 *     → assemble render model (painting order) → return
 */
import { clampNumber, PHYSICAL_CHEQUE_SURFACE_CM } from '../chequeTemplateDesigner';
import type { DesignerSurfaceSpec, DesignerTextAlign } from '../chequeTemplateDesigner';
import { MOCK_RUNTIME_DATA } from './mockRuntimeData';
import {
  SEMANTIC_KEYS,
  type RenderIssue,
  type ResolvedGeometry,
  type ResolvedRenderField,
  type ResolvedRenderModel,
  type ResolvedSurface,
  type RuntimeData,
  type RuntimeTemplateInput,
  type SemanticKey,
} from './runtimeTypes';

const KNOWN_KEYS = new Set<string>(SEMANTIC_KEYS);
const DEFAULT_FONT_SIZE = 12;
const DEFAULT_FONT_WEIGHT = 400;
const DEFAULT_WIDTH = 10;
const DEFAULT_HEIGHT = 5;

/** A field after defensive normalization — every property is guaranteed valid. */
interface SafeField {
  id: string;
  /** Opaque data-source key preserved for binding resolution (may be absent). */
  binding?: string;
  value: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  fontSize: number;
  fontWeight: number;
  textAlign: DesignerTextAlign;
  color: string;
  zIndex: number;
  visible: boolean;
}

/** Type guard: is a value one of the stable semantic keys? */
export function isSemanticKey(value: unknown): value is SemanticKey {
  return typeof value === 'string' && KNOWN_KEYS.has(value);
}

/**
 * Default binding resolution — the single source of truth for "is this field
 * bound, and to what".
 *
 * Primary source is the field's explicit `binding` (set by the Data Source
 * dropdown): a valid semantic key binds the field; any other stored value
 * (`'none'`, `'custom'`, unknown) means static/layout-only. Only when a field
 * carries NO `binding` at all do we fall back to id-inference (legacy fields
 * whose `id` happens to be a semantic key). A future pack can replace this
 * without touching the rest of the engine.
 */
export function defaultBindingResolver(field: { id: string; binding?: string }): SemanticKey | null {
  if (field.binding !== undefined) {
    return isSemanticKey(field.binding) ? field.binding : null;
  }
  return isSemanticKey(field.id) ? field.id : null;
}

/** Merge provided runtime data over the mock defaults (placeholder for real binding). */
export function resolveRuntimeValues(data?: RuntimeData): RuntimeData {
  return { ...MOCK_RUNTIME_DATA, ...(data ?? {}) };
}

/** Final rendered text: bound runtime value if present & non-empty, else the field's own static value. */
export function resolveFieldText(field: { value: string }, data: RuntimeData, binding: SemanticKey | null): string {
  const bound = binding ? data[binding] : undefined;
  return bound !== undefined && bound !== '' ? bound : field.value;
}

// ── internal helpers ──────────────────────────────────────────────────────────

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function resolveCoord(v: unknown): { value: number; issue: boolean } {
  if (!isFiniteNumber(v)) return { value: 0, issue: true };
  if (v < 0 || v > 100) return { value: clampNumber(v, 0, 100), issue: true };
  return { value: v, issue: false };
}

function resolveSize(v: unknown, fallback: number): { value: number; issue: boolean } {
  if (!isFiniteNumber(v) || v <= 0) return { value: fallback, issue: true };
  if (v > 100) return { value: 100, issue: true };
  return { value: v, issue: false };
}

function resolveRotation(v: unknown): number {
  if (!isFiniteNumber(v)) return 0;
  const wrapped = v % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

function resolveAlign(v: unknown): DesignerTextAlign {
  return v === 'left' || v === 'center' || v === 'right' ? v : 'left';
}

/** Defensively normalize one raw field (which may come from untrusted stored JSON). */
function normalizeField(raw: unknown, index: number): { field: SafeField | null; issues: RenderIssue[] } {
  const issues: RenderIssue[] = [];

  if (!raw || typeof raw !== 'object') {
    return {
      field: null,
      issues: [{ code: 'MISSING_FIELD_PROPS', severity: 'error', fieldId: null, message: `الحقل رقم ${index + 1} غير صالح (ليس كائنًا).` }],
    };
  }

  const r = raw as Record<string, unknown>;
  const id = typeof r.id === 'string' && r.id.trim() ? r.id : '';
  if (!id) {
    return {
      field: null,
      issues: [{ code: 'MISSING_FIELD_PROPS', severity: 'error', fieldId: null, message: `الحقل رقم ${index + 1} بلا معرّف صالح.` }],
    };
  }

  const px = resolveCoord(r.x);
  const py = resolveCoord(r.y);
  if (px.issue || py.issue) {
    issues.push({ code: 'INVALID_POSITION', severity: 'warning', fieldId: id, message: `موضع غير صالح للحقل «${id}» — تم تصحيحه ضمن الحدود.` });
  }

  const sw = resolveSize(r.width, DEFAULT_WIDTH);
  const sh = resolveSize(r.height, DEFAULT_HEIGHT);
  if (sw.issue || sh.issue) {
    issues.push({ code: 'INVALID_SIZE', severity: 'warning', fieldId: id, message: `حجم غير صالح للحقل «${id}» — تم تصحيحه.` });
  }

  const visible = r.visible !== false;
  if (!visible) {
    issues.push({ code: 'INVISIBLE_FIELD', severity: 'info', fieldId: id, message: `الحقل «${id}» مخفي ولن يُرسم.` });
  }

  const field: SafeField = {
    id,
    binding: typeof r.binding === 'string' ? r.binding : undefined,
    value: typeof r.value === 'string' ? r.value : '',
    x: px.value,
    y: py.value,
    width: sw.value,
    height: sh.value,
    rotation: resolveRotation(r.rotation),
    fontSize: isFiniteNumber(r.fontSize) && r.fontSize > 0 ? r.fontSize : DEFAULT_FONT_SIZE,
    fontWeight: isFiniteNumber(r.fontWeight) ? r.fontWeight : DEFAULT_FONT_WEIGHT,
    textAlign: resolveAlign(r.textAlign),
    color: typeof r.color === 'string' && r.color ? r.color : '#000000',
    zIndex: isFiniteNumber(r.zIndex) ? r.zIndex : 0,
    visible,
  };
  return { field, issues };
}

function resolveSurface(spec: unknown, issues: RenderIssue[]): ResolvedSurface {
  const s = spec as Partial<DesignerSurfaceSpec> | null | undefined;
  const valid = !!s && isFiniteNumber(s.widthCm) && s.widthCm > 0 && isFiniteNumber(s.heightCm) && s.heightCm > 0;
  if (!valid) {
    issues.push({ code: 'INVALID_TEMPLATE', severity: 'warning', fieldId: null, message: 'مقاس السطح غير صالح — تم استخدام المقاس الافتراضي.' });
  }
  const surface = valid ? (s as DesignerSurfaceSpec) : PHYSICAL_CHEQUE_SURFACE_CM;
  return {
    widthCm: surface.widthCm,
    heightCm: surface.heightCm,
    widthMm: surface.widthCm * 10,
    heightMm: surface.heightCm * 10,
  };
}

function resolveGeometry(field: SafeField, surface: ResolvedSurface): ResolvedGeometry {
  return {
    xPercent: field.x,
    yPercent: field.y,
    widthPercent: field.width,
    heightPercent: field.height,
    rotationDeg: field.rotation,
    xMm: (field.x / 100) * surface.widthMm,
    yMm: (field.y / 100) * surface.heightMm,
    widthMm: (field.width / 100) * surface.widthMm,
    heightMm: (field.height / 100) * surface.heightMm,
  };
}

function emptyModel(issues: RenderIssue[]): ResolvedRenderModel {
  return {
    surface: resolveSurface(undefined, []),
    fields: [],
    visibleFields: [],
    issues,
    meta: { fieldCount: 0, visibleCount: 0, hasErrors: issues.some((i) => i.severity === 'error') },
  };
}

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Resolve a cheque template + runtime data into a fully-resolved render model.
 *
 * @param template     the stored template layout (surface + fields)
 * @param data         runtime values; defaults to the mock placeholder, and any
 *                     provided keys override the mock
 * @param bindingResolver  maps a field to a semantic key (defaults to id-based)
 */
export function resolveChequeTemplate(
  template: RuntimeTemplateInput | null | undefined,
  data?: RuntimeData,
  bindingResolver: (field: { id: string; binding?: string }) => SemanticKey | null = defaultBindingResolver,
): ResolvedRenderModel {
  // ── Validate template shape ──
  if (!template || typeof template !== 'object' || !Array.isArray(template.fields)) {
    return emptyModel([{ code: 'INVALID_TEMPLATE', severity: 'error', fieldId: null, message: 'القالب غير صالح أو غير موجود.' }]);
  }

  const issues: RenderIssue[] = [];
  const surface = resolveSurface(template.surface, issues);
  const runtime = resolveRuntimeValues(data);

  if (template.fields.length === 0) {
    issues.push({ code: 'EMPTY_TEMPLATE', severity: 'error', fieldId: null, message: 'القالب لا يحتوي على أي حقول.' });
  }

  // ── Resolve each field ──
  const resolved: ResolvedRenderField[] = [];
  template.fields.forEach((raw, index) => {
    const { field, issues: fieldIssues } = normalizeField(raw, index);
    issues.push(...fieldIssues);
    if (!field) return;

    const binding = bindingResolver(field);
    resolved.push({
      id: field.id,
      text: resolveFieldText(field, runtime, binding),
      binding,
      geometry: resolveGeometry(field, surface),
      font: { sizePx: field.fontSize, weight: field.fontWeight },
      align: field.textAlign,
      color: field.color,
      visible: field.visible,
      zIndex: field.zIndex,
    });
  });

  // ── Painting order (ascending zIndex) ──
  resolved.sort((a, b) => a.zIndex - b.zIndex);
  const visibleFields = resolved.filter((f) => f.visible);

  return {
    surface,
    fields: resolved,
    visibleFields,
    issues,
    meta: {
      fieldCount: resolved.length,
      visibleCount: visibleFields.length,
      hasErrors: issues.some((i) => i.severity === 'error'),
    },
  };
}
