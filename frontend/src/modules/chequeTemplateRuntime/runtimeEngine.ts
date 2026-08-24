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
import { maxLinesFor, textDefinitelyOverflows } from '../chequePrint/textFit';
import { MOCK_RUNTIME_DATA } from './mockRuntimeData';
import {
  REQUIRED_PRINT_KEYS,
  SEMANTIC_KEYS,
  type RenderIssue,
  type ResolvedGeometry,
  type ResolvedRenderField,
  type ResolvedRenderModel,
  type ResolvedRenderSlot,
  type ResolvedSurface,
  type RuntimeData,
  type RuntimeTemplateInput,
  type SemanticKey,
} from './runtimeTypes';

const KNOWN_KEYS = new Set<string>(SEMANTIC_KEYS);
const REQUIRED_KEYS = new Set<string>(REQUIRED_PRINT_KEYS);
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
  /** Opt-in wrapping. Absent/non-true on every historical field ⇒ single line. */
  multiline: boolean;
  /** Internal sub-cells. Empty on every ordinary field. */
  slots: SafeSlot[];
}

interface SafeSlot {
  key: string;
  xPercent: number;
  widthPercent: number;
}

/**
 * Defensively normalize a field's slot list.
 *
 * A slot is accepted only when it is fully specified and geometrically sane;
 * anything else is dropped, which degrades a slotted field to a plain one rather
 * than drawing a cell at an unknown place. Offsets are percentages of the parent
 * box, so they are clamped to [0, 100] exactly as field coordinates are.
 */
function normalizeSlots(raw: unknown): SafeSlot[] {
  if (!Array.isArray(raw)) return [];
  const slots: SafeSlot[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const s = item as Record<string, unknown>;
    if (typeof s.key !== 'string' || !s.key) continue;
    if (!isFiniteNumber(s.xPercent) || !isFiniteNumber(s.widthPercent) || s.widthPercent <= 0) continue;
    slots.push({
      key: s.key,
      xPercent: clampNumber(s.xPercent, 0, 100),
      widthPercent: clampNumber(s.widthPercent, 0, 100),
    });
  }
  return slots;
}

/** Type guard: is a value one of the stable semantic keys? */
export function isSemanticKey(value: unknown): value is SemanticKey {
  return typeof value === 'string' && KNOWN_KEYS.has(value);
}

/**
 * Legacy field-id → semantic-key aliases, used ONLY when a stored field carries
 * no explicit `binding`.
 *
 * Templates saved before the Data Binding pack shipped have no `binding` property
 * at all, so they rely on id-inference below. Three of the four standard field
 * ids happen to BE semantic keys (`beneficiary`, `amount`, `amountInWords`) and so
 * kept working; the date field's id is `'date'` while its canonical key is
 * `'chequeDate'`, so inference returned null and every such template silently
 * printed its design-time sample date instead of the real cheque date.
 *
 * This map closes that namespace gap for existing templates without rewriting
 * stored data. It is a bounded legacy concern: `normalizeFieldBindings` below
 * upgrades templates to explicit bindings as they are loaded and re-saved.
 */
export const LEGACY_FIELD_ID_ALIASES: Readonly<Record<string, SemanticKey>> = {
  date: 'chequeDate',
};

/**
 * Default binding resolution — the single source of truth for "is this field
 * bound, and to what".
 *
 * Primary source is the field's explicit `binding` (set by the Data Source
 * dropdown): a valid semantic key binds the field; any other stored value
 * (`'none'`, `'custom'`, unknown) means static/layout-only — an explicit binding
 * is ALWAYS authoritative and is never second-guessed by the legacy aliases.
 * Only when a field carries NO `binding` at all do we fall back to id-inference:
 * first the id itself when it is a semantic key, then the legacy alias map.
 */
export function defaultBindingResolver(field: { id: string; binding?: string }): SemanticKey | null {
  if (field.binding !== undefined) {
    return isSemanticKey(field.binding) ? field.binding : null;
  }
  if (isSemanticKey(field.id)) return field.id;
  return LEGACY_FIELD_ID_ALIASES[field.id] ?? null;
}

/**
 * Upgrade legacy stored fields to an EXPLICIT `binding`, in memory.
 *
 * Fields that already declare a `binding` (including the deliberate `'none'` /
 * `'custom'` static markers) are returned untouched — user intent wins. A field
 * with no `binding` gets the one `defaultBindingResolver` infers for it, so the
 * corrected shape is what the designer edits and what the next ordinary save
 * persists. Nothing is written here: this is a pure function, and no template is
 * ever deleted or recreated.
 */
export function normalizeFieldBindings<T extends { id: string; binding?: string }>(fields: T[]): T[] {
  return fields.map((field) => {
    if (field.binding !== undefined) return field;
    const inferred = defaultBindingResolver(field);
    return inferred ? { ...field, binding: inferred } : field;
  });
}

/**
 * DESIGN-MODE runtime values: provided data merged over the mock placeholders, so
 * a bound field shows something meaningful while the layout is being edited.
 *
 * NEVER call this on a real cheque print path — the mock is the reason a print
 * could once show `شركة الخليج للمقاولات` / `3500.000 KD`. `resolveChequeTemplateForPrint`
 * deliberately does not use it.
 */
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
    multiline: r.multiline === true,
    slots: normalizeSlots(r.slots),
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

/**
 * Per-field text resolution, with the print-mode integrity guard.
 *
 * Design mode keeps the historical behaviour exactly: bound value if present,
 * else the field's own static value, never an issue.
 *
 * Print mode treats a bound-but-unresolved field as a defect rather than an
 * opportunity to substitute placeholder text — see `resolveChequeTemplateForPrint`.
 */
function resolveText(
  field: SafeField,
  runtime: RuntimeData,
  binding: SemanticKey | null,
  mode: ResolveMode,
): { text: string; issue?: RenderIssue } {
  const bound = binding ? runtime[binding] : undefined;
  const hasValue = bound !== undefined && bound !== '';

  if (hasValue) return { text: bound };

  // Not bound at all: genuine static template text (a label, or an explicit
  // 'none'/'custom' field). Always legitimate, in either mode.
  if (!binding) return { text: field.value };

  if (mode === 'design') return { text: field.value };

  // Print mode, bound, no real value.
  if (REQUIRED_KEYS.has(binding)) {
    return {
      text: '',
      issue: {
        code: 'UNRESOLVED_DATA_BINDING',
        severity: 'error',
        fieldId: field.id,
        message: `الحقل «${field.id}» مرتبط ببيانات الشيك (${binding}) لكن لا توجد قيمة حقيقية له — الطباعة موقوفة حتى لا تُطبع قيمة تجريبية على شيك حقيقي.`,
      },
    };
  }
  return {
    text: field.value,
    issue: {
      code: 'UNRESOLVED_DATA_BINDING',
      severity: 'info',
      fieldId: field.id,
      message: `الحقل «${field.id}» مرتبط بـ (${binding}) بلا قيمة — يُطبع نصه الثابت.`,
    },
  };
}

/**
 * Resolve a slotted field's sub-cells.
 *
 * Each slot resolves against the SAME runtime data and the SAME required-key
 * rule a bound field does: in print mode a slot whose key is a required cheque
 * value and has no real data raises a blocking error, so an empty day can never
 * be printed onto a cheque. Slot text is never substituted from the field's
 * static value — a date cell has no meaningful placeholder.
 */
function resolveSlots(
  field: SafeField,
  runtime: RuntimeData,
  surface: ResolvedSurface,
  mode: ResolveMode,
  issues: RenderIssue[],
): ResolvedRenderSlot[] {
  return field.slots.map((slot) => {
    const binding = isSemanticKey(slot.key) ? slot.key : null;
    const value = binding ? runtime[binding] : undefined;
    const text = value ?? '';

    if (mode === 'print' && field.visible) {
      if (!text && binding && REQUIRED_KEYS.has(binding)) {
        issues.push({
          code: 'UNRESOLVED_DATA_BINDING',
          severity: 'error',
          fieldId: field.id,
          message: `الحقل «${field.id}» يحتوي خانة (${slot.key}) بلا قيمة حقيقية — الطباعة موقوفة حتى لا يُطبع تاريخ ناقص على شيك حقيقي.`,
        });
      }
      // Each cell is measured against ITS OWN width, not the whole box: a date
      // cell that cannot hold its digits is the defect worth reporting.
      const slotWidthPercent = (field.width * slot.widthPercent) / 100;
      if (text && textDefinitelyOverflows(text, field.fontSize, slotWidthPercent, surface.widthCm)) {
        issues.push({
          code: 'FIELD_TEXT_OVERFLOW',
          severity: 'error',
          fieldId: field.id,
          message: `القيمة في خانة «${slot.key}» داخل الحقل «${field.id}» أوسع من الخانة ولا يمكن طباعتها كاملة — وسّع الحقل أو صغّر الخط.`,
        });
      }
    }

    return { key: slot.key, text, binding, xPercent: slot.xPercent, widthPercent: slot.widthPercent };
  });
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

/** How a field's text is resolved. See `resolveChequeTemplate` vs `resolveChequeTemplateForPrint`. */
type ResolveMode = 'design' | 'print';

/**
 * Resolve a cheque template + runtime data into a fully-resolved render model.
 *
 * DESIGN MODE. Runtime values are the mock placeholders overridden by whatever
 * `data` supplies, and an unresolved bound field falls back to its own static
 * value — both are wanted while a layout is being edited. This is NOT safe for
 * printing a real cheque; use `resolveChequeTemplateForPrint` for that.
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
  return resolveModel(template, data, bindingResolver, 'design');
}

/**
 * Resolve a template for PRINTING A REAL CHEQUE — the hardened entry point.
 *
 * Differs from design mode in exactly two ways, both of them safety properties:
 *
 *   1. `MOCK_RUNTIME_DATA` is structurally unreachable. Only the caller's real
 *      `data` is consulted, so no mock beneficiary, date, or amount can ever be
 *      composed into a printable model — not even for a key the caller forgot.
 *   2. An unresolved binding is REPORTED, never papered over. A field bound to a
 *      `REQUIRED_PRINT_KEYS` key that has no real value resolves to empty text and
 *      raises an `error`, which sets `meta.hasErrors` and so blocks the print
 *      button. A field bound to a supporting key keeps its static value and
 *      raises `info`. Unbound (`'none'` / `'custom'` / non-semantic) fields are
 *      genuine static template text and are left completely alone.
 *
 * Absent `data` entirely is itself an error: a real print always has runtime data.
 */
export function resolveChequeTemplateForPrint(
  template: RuntimeTemplateInput | null | undefined,
  data: RuntimeData | null | undefined,
  bindingResolver: (field: { id: string; binding?: string }) => SemanticKey | null = defaultBindingResolver,
): ResolvedRenderModel {
  if (!data || typeof data !== 'object') {
    return emptyModel([{
      code: 'UNRESOLVED_DATA_BINDING',
      severity: 'error',
      fieldId: null,
      message: 'لا توجد بيانات شيك حقيقية للطباعة. أعد فتح الطباعة من صفحة الشيكات.',
    }]);
  }
  return resolveModel(template, data, bindingResolver, 'print');
}

function resolveModel(
  template: RuntimeTemplateInput | null | undefined,
  data: RuntimeData | undefined | null,
  bindingResolver: (field: { id: string; binding?: string }) => SemanticKey | null,
  mode: ResolveMode,
): ResolvedRenderModel {
  // ── Validate template shape ──
  if (!template || typeof template !== 'object' || !Array.isArray(template.fields)) {
    return emptyModel([{ code: 'INVALID_TEMPLATE', severity: 'error', fieldId: null, message: 'القالب غير صالح أو غير موجود.' }]);
  }

  const issues: RenderIssue[] = [];
  const surface = resolveSurface(template.surface, issues);
  // Print mode consults ONLY the caller's real data — the mock never participates.
  const runtime: RuntimeData = mode === 'print' ? { ...(data ?? {}) } : resolveRuntimeValues(data ?? undefined);

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
    const slots = resolveSlots(field, runtime, surface, mode, issues);
    // A slotted field renders its slots, never its own text — so its own text is
    // not measured for overflow either; each slot is measured against its cell.
    const { text, issue } = resolveText(field, runtime, binding, mode);
    if (issue && slots.length === 0) issues.push(issue);
    // A single-line field has exactly one line of usable run length; a field that
    // opted into wrapping has as many as its own HEIGHT holds. Either way the box
    // is the limit — wrapping widens what fits, it never disables the check.
    const maxLines = field.multiline ? maxLinesFor(field.height, surface.heightCm, field.fontSize) : 1;
    // Print mode only: a value that cannot fit its own box would be clipped by the
    // renderer. Clipping protects the neighbouring fields, but an amount or payee
    // must never be silently cropped on a real cheque — so report and block.
    if (mode === 'print' && field.visible && slots.length === 0 && textDefinitelyOverflows(text, field.fontSize, field.width, surface.widthCm, maxLines)) {
      issues.push({
        code: 'FIELD_TEXT_OVERFLOW',
        severity: 'error',
        fieldId: field.id,
        message: `القيمة في الحقل «${field.id}» أطول من عرض الحقل ولا يمكن طباعتها كاملة — وسّع الحقل أو صغّر الخط في القالب. الطباعة موقوفة حتى لا تُطبع قيمة ناقصة.`,
      });
    }
    resolved.push({
      id: field.id,
      text,
      binding,
      geometry: resolveGeometry(field, surface),
      font: { sizePx: field.fontSize, weight: field.fontWeight },
      align: field.textAlign,
      color: field.color,
      visible: field.visible,
      zIndex: field.zIndex,
      multiline: field.multiline,
      maxLines,
      slots,
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
