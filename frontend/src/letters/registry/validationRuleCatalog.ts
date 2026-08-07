/**
 * Letter Engine — the validation rule catalogue.
 *
 * WHAT THIS IS, AND WHAT IT IS NOT
 * ────────────────────────────────
 * This file declares the IDENTITY, SEVERITY and PARAMETER SHAPE of every validation
 * rule the engine will run. It contains NO rule logic whatsoever — the
 * implementations live in `letters/validation/rules/`.
 *
 * The split exists because rules are selected and parameterised by TEMPLATE. That is
 * the §5.2 boundary in practice: metadata selects and parameterises, code expresses
 * behaviour.
 *
 * SEVERITY IS DECLARED HERE AND IS NOT NEGOTIABLE PER TEMPLATE
 * ────────────────────────────────────────────────────────────
 * A template chooses WHETHER a rule runs. It cannot downgrade a blocking rule to a
 * warning. INV-2 and INV-3 say reserved-zone overlap is "always blocking" with no
 * override — and the way to make "always" true is to put severity out of the
 * template's reach entirely.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  FORM EDITOR UX REBUILD v2 — THREE RULES, DOWN FROM TWENTY-FIVE.
 * ══════════════════════════════════════════════════════════════════════════
 * The catalogue used to declare twenty-five rules: content requirements, page-geometry
 * guards, layout-object placement, automation checks and advisories. Every one of them
 * except three was DELETED — not deselected, not downgraded. The product decision is
 * that the editor assists rather than refuses, and an author is trusted to judge a
 * missing subject, a long document or an unresolved variable without the engine
 * intervening at all.
 *
 * What survives protects the one thing an author cannot see coming: content landing on
 * ink already printed on the paper, and a print profile whose numbers describe no real
 * page.
 *
 *   · `E4_reservedZoneOverlap`   — flow content vs. the reserved header/footer band.
 *   · `E16_objectInReservedZone` — a positioned object vs. the same bands.
 *   · `E13_impossibleGeometry`   — a stability guard: with no usable band, pagination
 *                                  has nothing meaningful to place content into.
 *
 * All three are `blocking`, all three are parameterless, and — per the rule above —
 * none can be softened by a template. There is currently exactly one template
 * (`officialLetter`, INV-10) and it selects all three.
 */

/**
 * The four severities a finding may carry.
 *
 * `blocking` — refuses print, PDF and export. No override, no per-template downgrade.
 * `error`    — a real defect that does NOT stop the press. Declared for completeness;
 *              no rule in the current catalogue carries it.
 * `warning`  — advisory. Declared for completeness; no rule in the current catalogue
 *              carries it, since the rebuild removed every rule that used to.
 * `info`     — a fact about the document. Declared for completeness, for the same
 *              reason.
 *
 * The type keeps all four rather than shrinking to `blocking` alone: severity is a
 * property of a finding a FUTURE rule may need, and a type that only had one member
 * would make `ValidationIssue.severity` a constant rather than a real field — which
 * would in turn make the panel's severity-driven rendering (icon, colour, label)
 * unable to express anything it does not already show.
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
  | 'E4_reservedZoneOverlap'
  | 'E13_impossibleGeometry'
  | 'E16_objectInReservedZone';

/**
 * Names of the numeric parameters a rule accepts. A template supplies a value for
 * each; a rule with no parameters declares an empty list.
 *
 * All three surviving rules are parameterless — their thresholds are the Geometry
 * Registry's own dimensions, not a number a template gets to choose.
 */
export type ValidationRuleParams = Readonly<Record<string, number>>;

export interface ValidationRuleDescriptor {
  readonly id: ValidationRuleId;
  readonly severity: ValidationSeverity;
  /** What the rule checks. Read by auditors and by whoever implements it. */
  readonly description: string;
  /** Parameter names this rule accepts. A template must supply exactly these. */
  readonly paramNames: readonly string[];
}

export const VALIDATION_RULES = {
  E4_reservedZoneOverlap: {
    id: 'E4_reservedZoneOverlap',
    severity: 'blocking',
    description:
      'No rendered element may intersect the reserved header or footer band of the active print ' +
      'profile (INV-2, INV-3). Reported with the offending page index and the overshoot in mm.',
    paramNames: [],
  },
  E13_impossibleGeometry: {
    id: 'E13_impossibleGeometry',
    severity: 'blocking',
    description:
      'The active geometry leaves no usable page: a non-positive content band or width. Nothing ' +
      'can be laid out, so this blocks before any other rule is even meaningful.',
    paramNames: [],
  },
  E16_objectInReservedZone: {
    id: 'E16_objectInReservedZone',
    severity: 'blocking',
    description:
      'No layout object may intersect the reserved header or footer band of the active print ' +
      'profile (INV-2, INV-3). Judged on the object’s true rotated corners, never on its ' +
      'axis-aligned bounding box, which is larger than the object and would refuse prints for ' +
      'overlaps that do not exist.',
    paramNames: [],
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

/** Every blocking rule — the ones that refuse output. */
export function getBlockingRules(): ValidationRuleDescriptor[] {
  return getRulesBySeverity('blocking');
}

/** Every warning rule. Empty in the current catalogue — kept for API symmetry. */
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
