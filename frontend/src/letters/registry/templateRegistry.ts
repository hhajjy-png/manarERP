/**
 * Letter Engine — the Document Template Registry (INV-10).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A TEMPLATE IS DATA, NOT CODE. It is the complete definition of a document
 *  type, and the engine reads everything it needs from it.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * THE BOUNDARY BETWEEN METADATA AND CODE — the rule this registry lives or dies by
 * ─────────────────────────────────────────────────────────────────────────────────
 * Metadata SELECTS and PARAMETERISES. It never expresses behaviour.
 *
 *   · Metadata: which sections, in what order, with which typography roles; which
 *     validation rules with which thresholds; which barcode version; which print
 *     profile; which toolbar commands.
 *   · Code: how a paragraph splits across a page boundary; how a code is encoded; how
 *     a selection becomes bold; how a bounding rectangle becomes millimetres.
 *
 * A template can never introduce a new KIND of behaviour — only a new configuration
 * of existing behaviours. A genuinely new section type is a new registered component
 * PLUS a metadata entry. Holding that line is what stops this file becoming a
 * programming language expressed in JSON, which is the standard failure mode of this
 * pattern.
 *
 * VERSION 1 SHIPS EXACTLY ONE ENABLED TEMPLATE (INV-10)
 * ────────────────────────────────────────────────────
 * Official Letter. Circular, Administrative Decision, Authorization, Notice and
 * Government Correspondence are supported ARCHITECTURALLY ONLY — no template, no
 * component, no pack. What they do have is a RESERVED REFERENCE PREFIX (below), so
 * that no future type can take a prefix that documentation, training material, or an
 * operator's memory already associates with something else. A reserved prefix is not
 * a template and cannot be rendered.
 */

import {
  type SectionSpec,
  type SectionKind,
  SECTION_KINDS,
} from '../model/sectionTypes';
import { type ToolbarCommandId } from './toolbarCommands';
import { type ValidationRuleSelection } from './validationRuleCatalog';
import { type TypographyPresetSetId } from './typographyPresets';
import { type PrintProfileId } from './geometryRegistry';
import {
  type BarcodeVersion,
  type LayoutVersion,
  type TemplateVersion,
  BARCODE_VERSION_LATEST,
  LAYOUT_VERSION_LATEST,
  TEMPLATE_VERSION_LATEST,
} from '../versioning/versions';

/**
 * Which signature slots a document type has, and whether they start visible.
 *
 * SLOT DECLARATION ONLY — no asset, no image, no picker. INV-12 forbids a second
 * signature-management system, so the engine names slots and the EXISTING company
 * branding system supplies what fills them. P6 performs that binding; P0 must not,
 * and does not import a single branding symbol.
 */
export interface SignatureSlotDefaults {
  readonly hasSignature: boolean;
  readonly hasStamp: boolean;
  readonly signatureShownByDefault: boolean;
  readonly stampShownByDefault: boolean;
}

/** A document type, completely. */
export interface DocumentTemplate {
  /* ── Identity ───────────────────────────────────────────────────────── */
  readonly key: string;
  readonly displayNameAr: string;
  readonly displayNameEn: string;
  readonly icon: string;
  /**
   * Prefix of every reference number this type issues, e.g. `OL` → `OL-2026-000123`.
   * Permanent from the first issued number; unique across templates AND reservations.
   */
  readonly referencePrefix: string;
  /**
   * `false` hides the template without deleting it, so documents already issued under
   * it keep resolving. INV-10 permits exactly one `true` in v1.
   */
  readonly enabled: boolean;

  /* ── Versioning ─────────────────────────────────────────────────────── */
  readonly templateVersion: TemplateVersion;
  readonly defaultLayoutVersion: LayoutVersion;
  readonly defaultBarcodeVersion: BarcodeVersion;

  /* ── Structure ──────────────────────────────────────────────────────── */
  /** Sections in render order. The order here IS the order on the page. */
  readonly sections: readonly SectionSpec[];

  /* ── Editing ────────────────────────────────────────────────────────── */
  /**
   * The complete set of commands this document type permits. The toolbar has no
   * built-in default set and renders from this list alone.
   *
   * This is the type's approved SPECIFICATION, not a statement about what is
   * currently executable. P7 intersects it with commands that have registered
   * implementations, so its first phase can ship before list and indent commands exist.
   */
  readonly toolbarCommands: readonly ToolbarCommandId[];

  /* ── Presentation ───────────────────────────────────────────────────── */
  readonly typographyPresetSetId: TypographyPresetSetId;

  /* ── Physical page ──────────────────────────────────────────────────── */
  readonly defaultPrintProfileId: PrintProfileId;
  readonly allowedPrintProfileIds: readonly PrintProfileId[];

  /* ── Rules ──────────────────────────────────────────────────────────── */
  /**
   * Which validation rules run, and with what thresholds.
   *
   * A template chooses WHETHER a rule runs and with WHAT parameters. It cannot change
   * a rule's severity — that is a catalogue fact, which is how INV-2/INV-3's "always
   * blocking, no override" stays true.
   */
  readonly validationRules: readonly ValidationRuleSelection[];

  /* ── Lifecycle ──────────────────────────────────────────────────────── */
  /**
   * Whether an approval gate sits between draft and registration.
   *
   * A per-type setting rather than a hard lifecycle state: an approval step is
   * correct for organisations that need it and pure friction for those that do not.
   * Official Letter is `false`.
   */
  readonly requiresApproval: boolean;
  /** Hard ceiling on pages. Also supplied to rule E10 as its `maxPages` parameter. */
  readonly pageCap: number;

  /* ── Signature slots ────────────────────────────────────────────────── */
  readonly signatureSlots: SignatureSlotDefaults;
}

/* ── Section specs for Official Letter ──────────────────────────────────── */

const OFFICIAL_LETTER_SECTIONS: readonly SectionSpec[] = [
  { kind: 'date', required: true, editable: true, pageScope: 'firstPage', typographyRole: 'date' },
  { kind: 'recipient', required: false, editable: true, pageScope: 'firstPage', typographyRole: 'recipient' },
  { kind: 'subject', required: true, editable: true, pageScope: 'firstPage', typographyRole: 'subject' },
  { kind: 'content', required: true, editable: true, pageScope: 'flow', typographyRole: 'body' },
  // Neither of the last two is editable: both are composed by the engine — the
  // signature from the existing branding system, the barcode from the registration
  // snapshot — and are never inserted into the editor by hand.
  { kind: 'signature', required: false, editable: false, pageScope: 'lastPage', typographyRole: 'body' },
  { kind: 'barcode', required: true, editable: false, pageScope: 'lastPage', typographyRole: 'footer' },
];

/* ── The registry ───────────────────────────────────────────────────────── */

export const TEMPLATES = {
  officialLetter: {
    key: 'officialLetter',
    displayNameAr: 'خطاب رسمي',
    displayNameEn: 'Official Letter',
    icon: '✉️',
    referencePrefix: 'OL',
    enabled: true,

    templateVersion: TEMPLATE_VERSION_LATEST,
    defaultLayoutVersion: LAYOUT_VERSION_LATEST,
    defaultBarcodeVersion: BARCODE_VERSION_LATEST,

    sections: OFFICIAL_LETTER_SECTIONS,

    toolbarCommands: [
      'bold',
      'underline',
      'alignJustify',
      'alignStart',
      'alignCenter',
      'fontFamily',
      'fontSize',
      'listNumbered',
      'listBulleted',
      'indent',
      'outdent',
      'pageBreak',
      'undo',
      'redo',
      'clearFormatting',
    ],

    typographyPresetSetId: 'officialArabic',

    defaultPrintProfileId: 'companyLetterhead',
    allowedPrintProfileIds: ['companyLetterhead'],

    validationRules: [
      { ruleId: 'E1_subjectRequired', params: {} },
      { ruleId: 'E2_contentRequired', params: {} },
      { ruleId: 'E3_referenceRequiredForOutput', params: {} },
      { ruleId: 'E4_reservedZoneOverlap', params: {} },
      { ruleId: 'E5_signatureBlockOrphan', params: { minContentLinesWithSignature: 2 } },
      { ruleId: 'E6_unknownFontId', params: {} },
      { ruleId: 'E7_barcodePayloadCapacity', params: {} },
      { ruleId: 'E8_subjectLineCount', params: { maxSubjectLines: 2 } },
      // E9_referenceIntegrity is NOT selected. It verifies an issued reference against
      // the official register, which lives on the server — and this validation engine
      // is local by design (no backend, no API, no database). Selecting a rule the
      // engine is architecturally forbidden from evaluating does not add safety; it
      // permanently withholds `readyForPrinting` and blocks every print.
      //
      // The guarantee itself is not lost, and is in fact stronger where it sits: the
      // register enforces integrity with two UNIQUE database constraints at the moment
      // of allocation, inside the registration transaction. A client-side re-check
      // could only ever be an opinion about data it does not own.
      { ruleId: 'E10_pageCapExceeded', params: { maxPages: 10 } },
      // Page-geometry rules. Parameterless: their thresholds are the registry's own
      // dimensions, not a number a template gets to choose.
      { ruleId: 'E11_contentOutsidePage', params: {} },
      { ruleId: 'E12_negativePosition', params: {} },
      { ruleId: 'E13_impossibleGeometry', params: {} },
      { ruleId: 'E14_oversizedParagraph', params: {} },
      { ruleId: 'E15_reservedElementPlacement', params: {} },
      { ruleId: 'I1_documentPageCount', params: {} },
      { ruleId: 'W1_pageCountAdvisory', params: { advisoryPageCount: 5 } },
      { ruleId: 'W2_subjectLengthAdvisory', params: { advisorySubjectChars: 120 } },
      { ruleId: 'W3_nonOfficialFontUsed', params: {} },
      { ruleId: 'W4_signatureAssetMissing', params: {} },
      { ruleId: 'W5_typographyDeviation', params: {} },
      { ruleId: 'W6_issueDateOutOfRange', params: { backdateWarnDays: 30 } },
      // W7_sparseManualPageBreak is NOT selected. It warns about a page left sparse by
      // a MANUAL page break — and manual page breaks do not exist in this engine; flow
      // is automatic only. The rule can never fire, so it withholds `readyForPrinting`
      // for ever in exchange for nothing. It returns the day the feature does.
      { ruleId: 'W8_lastPageNearlyFull', params: { nearlyFullPercent: 90 } },
    ],

    requiresApproval: false,
    pageCap: 10,

    signatureSlots: {
      hasSignature: true,
      hasStamp: true,
      // Both optional and both off by default: printing for wet-ink signature is a
      // legitimate workflow, so the engine must not assume an image is wanted.
      signatureShownByDefault: false,
      stampShownByDefault: false,
    },
  },
} as const satisfies Record<string, DocumentTemplate>;

/** Key of a declared template. One member in v1. */
export type TemplateKey = keyof typeof TEMPLATES;

export const TEMPLATE_KEYS = Object.keys(TEMPLATES) as TemplateKey[];

/**
 * Reference prefixes held for future document types (INV-10 — architectural support
 * without implementation).
 *
 * A reservation is NOT a template: it has no sections, no typography and no rules, and
 * nothing can be created under it. It exists so that when Circular is eventually built
 * it can take `CIR` and nothing else will have claimed it — and, more importantly, so
 * that a prefix collision is caught at build time by the uniqueness test rather than
 * discovered after two document types have issued overlapping reference numbers.
 */
export const RESERVED_REFERENCE_PREFIXES: readonly { readonly prefix: string; readonly forType: string }[] = [
  { prefix: 'CIR', forType: 'Circular — تعميم' },
  { prefix: 'AD', forType: 'Administrative Decision — قرار إداري' },
  { prefix: 'AUTH', forType: 'Authorization — تفويض' },
  { prefix: 'NOT', forType: 'Notice — إشعار' },
  { prefix: 'GOV', forType: 'Government Correspondence — مخاطبة حكومية' },
];

/* ── Queries ────────────────────────────────────────────────────────────── */

/** A template known at compile time. Never returns `undefined`. */
export function getTemplate(key: TemplateKey): DocumentTemplate {
  return TEMPLATES[key];
}

/**
 * Lookup by an UNTRUSTED key — from a stored document that may reference a template
 * this build no longer declares. Own-property check rather than direct indexing, so a
 * stored `"constructor"` cannot reach the prototype chain and return a function that
 * passes an `undefined` check before failing on first property access.
 */
export function findTemplate(key: string | null | undefined): DocumentTemplate | undefined {
  if (!key) return undefined;
  if (!Object.prototype.hasOwnProperty.call(TEMPLATES, key)) return undefined;
  return (TEMPLATES as Record<string, DocumentTemplate>)[key];
}

export function isTemplateKey(key: string | null | undefined): key is TemplateKey {
  return findTemplate(key) !== undefined;
}

/** Every declared template, including disabled ones — for audit, not for display. */
export function getAllTemplates(): DocumentTemplate[] {
  return TEMPLATE_KEYS.map((key) => TEMPLATES[key]);
}

/** Templates a user may create documents from. Exactly one in v1 (INV-10). */
export function getEnabledTemplates(): DocumentTemplate[] {
  return getAllTemplates().filter((t) => t.enabled);
}

/** Is this prefix held for a future document type (and therefore unavailable)? */
export function isReservedReferencePrefix(prefix: string): boolean {
  return RESERVED_REFERENCE_PREFIXES.some((r) => r.prefix === prefix);
}

/** The section spec for a kind, if this template declares it. */
export function getTemplateSection(
  template: DocumentTemplate,
  kind: SectionKind,
): SectionSpec | undefined {
  return template.sections.find((s) => s.kind === kind);
}

/** Section kinds this template declares, in render order. */
export function getTemplateSectionKinds(template: DocumentTemplate): SectionKind[] {
  return template.sections.map((s) => s.kind);
}

/** Section kinds a template could declare but does not. */
export function getUnusedSectionKinds(template: DocumentTemplate): SectionKind[] {
  const declared = new Set<string>(getTemplateSectionKinds(template));
  return SECTION_KINDS.filter((kind) => !declared.has(kind));
}

/** Does this template permit this toolbar command? */
export function templateAllowsCommand(
  template: DocumentTemplate,
  commandId: ToolbarCommandId,
): boolean {
  return template.toolbarCommands.includes(commandId);
}
