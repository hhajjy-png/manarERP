/**
 * Letter Engine — the validation rule catalogue.
 *
 * WHAT THIS IS, AND WHAT IT IS NOT
 * ────────────────────────────────
 * This file declares the IDENTITY, SEVERITY and PARAMETER SHAPE of every validation
 * rule the engine will run. It contains NO rule logic whatsoever — the
 * implementations belong to P4 (Pagination & Validation Engine) and registering one
 * here would be future-pack leakage.
 *
 * The split exists because rules are selected and parameterised by TEMPLATE. One
 * document type may warn above five pages and another above twenty; the rule is the
 * same code, the threshold is metadata. That is the §5.2 boundary in practice:
 * metadata selects and parameterises, code expresses behaviour.
 *
 * SEVERITY IS DECLARED HERE AND IS NOT NEGOTIABLE PER TEMPLATE
 * ────────────────────────────────────────────────────────────
 * A template chooses WHETHER a rule runs and with WHAT thresholds. It cannot
 * downgrade a blocking rule to a warning. INV-2 and INV-3 say reserved-zone overlap
 * is "always blocking" with no override — and the way to make "always" true is to
 * put severity out of the template's reach entirely.
 */

/**
 * The four severities.
 *
 * `blocking` — a defect that will refuse print, PDF and export in a later pack. No
 *              override exists, and no template may downgrade one.
 * `error`    — a real defect the user should fix, which does NOT stop the press.
 * `warning`  — advisory. Something worth a second look, never a defect.
 * `info`     — a fact about the document. Never a problem at all.
 *
 * Only `blocking` will prevent printing. The other three exist so the panel can tell a
 * typo apart from a catastrophe, which is the difference between a validation panel a
 * user reads and one they learn to ignore.
 *
 * ── ON `error` ───────────────────────────────────────────────────────────
 * No rule in the shipped set currently carries it. Every approved rule is either a
 * blocking defect (the E-series) or advisory (the W-series), and re-classifying an
 * approved rule to populate a level would be changing a decision to suit a taxonomy.
 * The level is declared because the engine must be able to express it, exactly as the
 * timeline declared `PRINTED` before anything produced one.
 */
export type ValidationSeverity = 'blocking' | 'error' | 'warning' | 'info';

/** Most severe first. The panel's sort order and the summary's precedence. */
export const SEVERITY_ORDER: readonly ValidationSeverity[] = ['blocking', 'error', 'warning', 'info'];

export const SEVERITY_LABELS_AR: Readonly<Record<ValidationSeverity, string>> = {
  blocking: 'خطأ مانع',
  error: 'خطأ',
  warning: 'تنبيه',
  info: 'معلومة',
};

/** Rank for sorting. Lower is more severe. */
export function severityRank(severity: ValidationSeverity): number {
  return SEVERITY_ORDER.indexOf(severity);
}

export type ValidationRuleId =
  // ── blocking ──────────────────────────────────────────────────────────
  | 'E1_subjectRequired'
  | 'E2_contentRequired'
  | 'E3_referenceRequiredForOutput'
  | 'E4_reservedZoneOverlap'
  | 'E5_signatureBlockOrphan'
  | 'E6_unknownFontId'
  | 'E7_barcodePayloadCapacity'
  | 'E8_subjectLineCount'
  | 'E9_referenceIntegrity'
  | 'E10_pageCapExceeded'
  // ── blocking — page geometry (added with the validation engine) ────────
  | 'E11_contentOutsidePage'
  | 'E12_negativePosition'
  | 'E13_impossibleGeometry'
  | 'E14_oversizedParagraph'
  | 'E15_reservedElementPlacement'
  // ── Layout objects (Document Layout Designer v1) ──────────────────────
  | 'E16_objectInReservedZone'
  | 'E17_objectOutsidePage'
  // ── Automation (Professional Document Automation v1) ──────────────────
  | 'E18_unresolvedVariable'
  | 'E19_unknownVariable'
  | 'E20_brokenCondition'
  // ── information ───────────────────────────────────────────────────────
  | 'I1_documentPageCount'
  // ── warnings ──────────────────────────────────────────────────────────
  | 'W1_pageCountAdvisory'
  | 'W2_subjectLengthAdvisory'
  | 'W3_nonOfficialFontUsed'
  | 'W4_signatureAssetMissing'
  | 'W5_typographyDeviation'
  | 'W6_issueDateOutOfRange'
  | 'W7_sparseManualPageBreak'
  | 'W8_lastPageNearlyFull'
  | 'W9_objectOverlapsContent'
  | 'W10_objectOffPage'
  | 'W11_recipientMissing'
  | 'W12_bindingUnresolved';

/**
 * Names of the numeric parameters a rule accepts. A template supplies a value for
 * each; a rule with no parameters declares an empty list.
 *
 * Parameters are numbers only, by design. The moment a rule takes a string or an
 * expression, metadata has started to express behaviour — the failure mode §5.2
 * exists to prevent.
 */
export type ValidationRuleParams = Readonly<Record<string, number>>;

export interface ValidationRuleDescriptor {
  readonly id: ValidationRuleId;
  readonly severity: ValidationSeverity;
  /** What the rule checks. Read by auditors and by whoever implements it in P4. */
  readonly description: string;
  /** Parameter names this rule accepts. A template must supply exactly these. */
  readonly paramNames: readonly string[];
  /**
   * The pack that will implement this rule. Documentation only — no code reads it —
   * but it makes the P0 boundary auditable at a glance.
   */
  readonly implementedIn: 'P4' | 'P6' | 'P7' | 'P8' | 'P9';
}

export const VALIDATION_RULES = {
  /* ── Blocking ──────────────────────────────────────────────────────── */

  E1_subjectRequired: {
    id: 'E1_subjectRequired',
    severity: 'blocking',
    description: 'The subject must be present and not whitespace-only.',
    paramNames: [],
    implementedIn: 'P4',
  },
  E2_contentRequired: {
    id: 'E2_contentRequired',
    severity: 'blocking',
    description: 'The content must be non-empty after whitespace is stripped.',
    paramNames: [],
    implementedIn: 'P4',
  },
  E3_referenceRequiredForOutput: {
    id: 'E3_referenceRequiredForOutput',
    severity: 'blocking',
    description: 'A document still in draft has no reference number and may not be printed, exported or saved as PDF.',
    paramNames: [],
    implementedIn: 'P4',
  },
  E4_reservedZoneOverlap: {
    id: 'E4_reservedZoneOverlap',
    severity: 'blocking',
    description:
      'No rendered element may intersect the reserved header or footer band of the active print ' +
      'profile (INV-2, INV-3). Reported with the offending page index and the overshoot in mm.',
    paramNames: [],
    implementedIn: 'P4',
  },
  E5_signatureBlockOrphan: {
    id: 'E5_signatureBlockOrphan',
    severity: 'blocking',
    description:
      'The signature/barcode block may not sit on a page carrying fewer than `minContentLinesWithSignature` lines of content.',
    paramNames: ['minContentLinesWithSignature'],
    implementedIn: 'P4',
  },
  E6_unknownFontId: {
    id: 'E6_unknownFontId',
    severity: 'blocking',
    description: 'Every block must reference a font id the Font Registry resolves (INV-5).',
    paramNames: [],
    implementedIn: 'P4',
  },
  E7_barcodePayloadCapacity: {
    id: 'E7_barcodePayloadCapacity',
    severity: 'blocking',
    description: 'The barcode payload must fit the code capacity at the configured error-correction level.',
    paramNames: [],
    implementedIn: 'P6',
  },
  E8_subjectLineCount: {
    id: 'E8_subjectLineCount',
    severity: 'blocking',
    description: 'The subject must render within `maxSubjectLines` lines and must contain no line break.',
    paramNames: ['maxSubjectLines'],
    implementedIn: 'P4',
  },
  E9_referenceIntegrity: {
    id: 'E9_referenceIntegrity',
    severity: 'blocking',
    description:
      'A present reference number must match the registered format and exist in the reference register. ' +
      'An integrity check on stored data, not a check on user input.',
    paramNames: [],
    implementedIn: 'P4',
  },
  E10_pageCapExceeded: {
    id: 'E10_pageCapExceeded',
    severity: 'blocking',
    description: 'The document must not exceed `maxPages` pages.',
    paramNames: ['maxPages'],
    implementedIn: 'P4',
  },

  /* ── Blocking — page geometry ──────────────────────────────────────── */

  E11_contentOutsidePage: {
    id: 'E11_contentOutsidePage',
    severity: 'blocking',
    description:
      'Content extends past the physical edge of the sheet. Beyond a reserved-zone overlap: this ' +
      'would not merely land on the letterhead, it would fall off the paper entirely.',
    paramNames: [],
    implementedIn: 'P4',
  },
  E12_negativePosition: {
    id: 'E12_negativePosition',
    severity: 'blocking',
    description:
      'A computed page offset is negative — a side margin, content top or band top above or ' +
      'outside the sheet. Indicates a print profile whose numbers cannot describe a real page.',
    paramNames: [],
    implementedIn: 'P4',
  },
  E13_impossibleGeometry: {
    id: 'E13_impossibleGeometry',
    severity: 'blocking',
    description:
      'The active geometry leaves no usable page: a non-positive content band or width. Nothing ' +
      'can be laid out, so this blocks before any content rule is even considered.',
    paramNames: [],
    implementedIn: 'P4',
  },
  E14_oversizedParagraph: {
    id: 'E14_oversizedParagraph',
    severity: 'blocking',
    description:
      'A single paragraph is taller than the printable area of one page. It is never split and ' +
      'never auto-corrected — the content itself has to be shortened.',
    paramNames: [],
    implementedIn: 'P4',
  },
  E15_reservedElementPlacement: {
    id: 'E15_reservedElementPlacement',
    severity: 'blocking',
    description:
      'The signature and barcode must sit together on the final page, in that order. They ' +
      'authorise the document as a whole; on any earlier page they would authorise a fragment.',
    paramNames: [],
    implementedIn: 'P4',
  },

  /* ── Blocking — layout objects ─────────────────────────────────────────
     THE RULE THE POSITIONED LAYER EXISTS UNDER.

     `insertTextBox` was prohibited because "absolutely-positioned content cannot be
     pagination-validated, so it can silently enter a reserved zone". E16 is the
     answer: a layout object declares its own rectangle, so its geometry is KNOWN
     rather than measured, and an object reaching the pre-printed letterhead refuses
     the print exactly as E4 does for flow content. `silently` was the word that
     mattered, and it no longer applies. */

  E16_objectInReservedZone: {
    id: 'E16_objectInReservedZone',
    severity: 'blocking',
    description:
      'No layout object may intersect the reserved header or footer band of the active print ' +
      'profile (INV-2, INV-3). Judged on the object’s true rotated corners, never on its ' +
      'axis-aligned bounding box, which is larger than the object and would refuse prints for ' +
      'overlaps that do not exist.',
    paramNames: [],
    implementedIn: 'P8',
  },
  E17_objectOutsidePage: {
    id: 'E17_objectOutsidePage',
    severity: 'blocking',
    description:
      'A layout object extends past the physical edge of the sheet. Beyond a reserved-zone ' +
      'overlap: this is content that will not be printed at all.',
    paramNames: [],
    implementedIn: 'P8',
  },

  /* ── Blocking — automation ────────────────────────────────────────────
     E18 is what makes a variables engine safe to ship. Without it the feature turns
     from one that saves typing into a mechanism for posting an official letter that
     reads «المحترم {{Employee}}». */

  E18_unresolvedVariable: {
    id: 'E18_unresolvedVariable',
    severity: 'blocking',
    description:
      'Every variable the document uses must resolve to a value. Judged against the SAME ' +
      'resolved map the renderer painted with, never re-resolved, so the rule cannot pass a ' +
      'letter the page rendered with a hole in it.',
    paramNames: [],
    implementedIn: 'P9',
  },
  E19_unknownVariable: {
    id: 'E19_unknownVariable',
    severity: 'blocking',
    description:
      'A {{token}} naming a variable the catalogue does not declare. Separate from E18 because ' +
      'the fix is different: an unresolved variable needs data, an unknown one needs the text ' +
      'corrected.',
    paramNames: [],
    implementedIn: 'P9',
  },
  E20_brokenCondition: {
    id: 'E20_brokenCondition',
    severity: 'blocking',
    description:
      'A conditional block whose condition cannot be evaluated. Blocking even though nothing ' +
      'looks wrong: a broken condition renders its content, so the letter LOOKS right while ' +
      'the rule the author wrote is silently ignored.',
    paramNames: [],
    implementedIn: 'P9',
  },

  /* ── Information ───────────────────────────────────────────────────── */

  I1_documentPageCount: {
    id: 'I1_documentPageCount',
    severity: 'info',
    description: 'How many sheets the letter currently occupies. A fact about the document, never a defect.',
    paramNames: [],
    implementedIn: 'P4',
  },

  /* ── Warnings ──────────────────────────────────────────────────────── */

  W1_pageCountAdvisory: {
    id: 'W1_pageCountAdvisory',
    severity: 'warning',
    description: 'Advises when the document exceeds `advisoryPageCount` pages.',
    paramNames: ['advisoryPageCount'],
    implementedIn: 'P4',
  },
  W2_subjectLengthAdvisory: {
    id: 'W2_subjectLengthAdvisory',
    severity: 'warning',
    description:
      'Advises when the subject exceeds `advisorySubjectChars` characters — the point at which ' +
      'barcode truncation starts discarding meaning.',
    paramNames: ['advisorySubjectChars'],
    implementedIn: 'P4',
  },
  W3_nonOfficialFontUsed: {
    id: 'W3_nonOfficialFontUsed',
    severity: 'warning',
    description: 'Advises when a block uses a font outside the template’s official pool.',
    paramNames: [],
    implementedIn: 'P4',
  },
  W4_signatureAssetMissing: {
    id: 'W4_signatureAssetMissing',
    severity: 'warning',
    description:
      'Advises when the signature section is enabled with no asset selected. Deliberately NOT ' +
      'blocking: printing for wet-ink signature is a legitimate workflow.',
    paramNames: [],
    implementedIn: 'P6',
  },
  W5_typographyDeviation: {
    id: 'W5_typographyDeviation',
    severity: 'warning',
    description: 'Advises when a block’s size or line height deviates from the template’s preset.',
    paramNames: [],
    implementedIn: 'P4',
  },
  W6_issueDateOutOfRange: {
    id: 'W6_issueDateOutOfRange',
    severity: 'warning',
    description:
      'Advises when the issue date is more than `backdateWarnDays` in the past, or any distance in ' +
      'the future. Backdating is legitimate but should be conscious.',
    paramNames: ['backdateWarnDays'],
    implementedIn: 'P4',
  },
  W7_sparseManualPageBreak: {
    id: 'W7_sparseManualPageBreak',
    severity: 'warning',
    description: 'Advises when a manual page break leaves more than `sparsePageFillPercent` percent of a page empty.',
    paramNames: ['sparsePageFillPercent'],
    implementedIn: 'P4',
  },
  W8_lastPageNearlyFull: {
    id: 'W8_lastPageNearlyFull',
    severity: 'warning',
    description:
      'Advises when the last page exceeds `nearlyFullPercent` percent of its band — a small ' +
      'font-rendering difference between machines could tip it into an E4 violation.',
    paramNames: ['nearlyFullPercent'],
    implementedIn: 'P4',
  },

  /* ── Advisory — layout objects ─────────────────────────────────────── */

  W9_objectOverlapsContent: {
    id: 'W9_objectOverlapsContent',
    severity: 'warning',
    description:
      'Advises when a layout object covers part of the flowing text band. Legitimate — a ' +
      'watermark-style block or a margin note is deliberately over the measure — so advisory ' +
      'rather than blocking. The engine does not decide what an author meant to overlap.',
    paramNames: [],
    implementedIn: 'P8',
  },
  W11_recipientMissing: {
    id: 'W11_recipientMissing',
    severity: 'warning',
    description:
      'Advises when no addressee is named. Advisory because the template declares the recipient ' +
      'section optional — a circular or a general notice is legitimately unaddressed, and ' +
      'blocking would make the engine contradict its own registry.',
    paramNames: [],
    implementedIn: 'P9',
  },
  W12_bindingUnresolved: {
    id: 'W12_bindingUnresolved',
    severity: 'warning',
    description:
      'Advises when a variable binding points at a record that no longer loads. Advisory because ' +
      'E18 already refuses the print for every variable that consequently has no value; this ' +
      'names the CAUSE so the author fixes one binding instead of chasing six variables.',
    paramNames: [],
    implementedIn: 'P9',
  },
  W10_objectOffPage: {
    id: 'W10_objectOffPage',
    severity: 'warning',
    description:
      'Advises when a layout object sits on a page index the document no longer has — the ' +
      'content shortened after the object was placed. The object is not printed and not lost; ' +
      'it returns when the document grows again.',
    paramNames: [],
    implementedIn: 'P8',
  },
} as const satisfies Record<ValidationRuleId, ValidationRuleDescriptor>;

export const VALIDATION_RULE_IDS = Object.keys(VALIDATION_RULES) as ValidationRuleId[];

/** A rule's selection by a template: which rule, with which parameter values. */
export interface ValidationRuleSelection {
  readonly ruleId: ValidationRuleId;
  readonly params: ValidationRuleParams;
}

/* ── Queries ────────────────────────────────────────────────────────────── */

/** A rule known at compile time. */
export function getValidationRule(id: ValidationRuleId): ValidationRuleDescriptor {
  return VALIDATION_RULES[id];
}

/** Is this an id the catalogue declares? Guard for template metadata. */
export function isValidationRuleId(id: string | null | undefined): id is ValidationRuleId {
  if (!id) return false;
  return Object.prototype.hasOwnProperty.call(VALIDATION_RULES, id);
}

/** Every rule of one severity. Severity is a catalogue fact; templates cannot change it. */
export function getRulesBySeverity(severity: ValidationSeverity): ValidationRuleDescriptor[] {
  return VALIDATION_RULE_IDS.map((id) => VALIDATION_RULES[id]).filter((r) => r.severity === severity);
}

/** Every blocking rule — the ones that will refuse output in a later pack. */
export function getBlockingRules(): ValidationRuleDescriptor[] {
  return getRulesBySeverity('blocking');
}

/** Every warning rule. */
export function getWarningRules(): ValidationRuleDescriptor[] {
  return getRulesBySeverity('warning');
}

/**
 * Do a selection's parameters match the rule's declared shape exactly — every
 * declared name supplied, and nothing extra?
 *
 * Exact rather than permissive: a stray parameter is almost always a renamed
 * threshold that is now silently ignored, which would leave a rule running against a
 * default nobody chose.
 */
export function selectionParamsMatchShape(selection: ValidationRuleSelection): boolean {
  const descriptor = VALIDATION_RULES[selection.ruleId];
  const supplied = Object.keys(selection.params);
  if (supplied.length !== descriptor.paramNames.length) return false;
  return descriptor.paramNames.every((name) => Object.prototype.hasOwnProperty.call(selection.params, name));
}
