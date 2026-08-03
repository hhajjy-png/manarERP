/**
 * Letter Engine — the validation pipeline.
 *
 * A standalone engine. No React import, no DOM access, no knowledge of any screen: it
 * takes a document and returns structured findings. The composer renders those
 * findings; it does not produce them, and a future template reuses this engine rather
 * than reimplementing it.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THREE PROPERTIES THIS FILE EXISTS TO GUARANTEE
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  1. SEVERITY COMES FROM THE CATALOGUE, NEVER FROM THE RULE.
 *     An implementation reports findings and has no say in how serious they are. That
 *     is what makes "reserved-zone overlap is always blocking, with no override"
 *     mechanically true rather than a convention some future rule could quietly break.
 *
 *  2. "NOTHING FOUND" IS NOT "NOTHING CHECKED".
 *     A rule the template selected but nobody implemented is reported in
 *     `unimplementedRuleIds`, and `readyForPrinting` refuses while any remain. An
 *     engine that returned an empty list for an unchecked document would be worse than
 *     one that declines to answer.
 *
 *  3. RE-EVALUATION IS INCREMENTAL.
 *     Every implementation declares the inputs it reads. The runner re-evaluates only
 *     rules whose inputs actually changed and reuses the rest, so typing in the subject
 *     does not re-run the geometry rules.
 */

import {
  type ValidationRuleId,
  type ValidationRuleParams,
  type ValidationRuleSelection,
  type ValidationSeverity,
  getValidationRule,
  isValidationRuleId,
  selectionParamsMatchShape,
  severityRank,
} from '../registry/validationRuleCatalog';
import { type LetterValidationContext, type ValidationInput } from './context';

/** Where a finding is, so the panel can navigate to it and the message can name it. */
export interface ValidationLocation {
  /** Zero-based page index. */
  readonly pageIndex?: number;
  readonly blockId?: string;
  /** Which section — the panel focuses this part of the document when clicked. */
  readonly sectionKind?: string;
  /**
   * Overshoot in millimetres, for geometric findings (INV-1 — never pixels).
   *
   * The reason a message can say "page 2, 6 mm past the band" instead of "content
   * overlaps the safe zone". The first is actionable; the second is not.
   */
  readonly overshootMm?: number;
}

/** One structured finding. Never a bare string. */
export interface ValidationIssue {
  readonly ruleId: ValidationRuleId;
  readonly severity: ValidationSeverity;
  /** Arabic, user-facing: what is wrong. */
  readonly message: string;
  /** Arabic, user-facing: what to do about it. Rules that cannot advise omit it. */
  readonly suggestion?: string;
  readonly location?: ValidationLocation;
}

/** What a rule returns — everything but the severity, which the runner stamps. */
export type ValidationFinding = Omit<ValidationIssue, 'severity'>;

/** A rule implementation. Pure: same context in, same findings out. */
export interface ValidationRuleImplementation {
  readonly ruleId: ValidationRuleId;
  /**
   * Which inputs this rule reads. The runner uses it to skip rules a change cannot
   * possibly affect. An empty list means "only re-run on a full pass".
   */
  readonly dependsOn: readonly ValidationInput[];
  evaluate(context: LetterValidationContext, params: ValidationRuleParams): readonly ValidationFinding[];
}

export interface ValidationRuleRegistry {
  register(implementation: ValidationRuleImplementation): void;
  has(ruleId: ValidationRuleId): boolean;
  get(ruleId: ValidationRuleId): ValidationRuleImplementation | undefined;
  registeredRuleIds(): readonly ValidationRuleId[];
}

export function createValidationRuleRegistry(): ValidationRuleRegistry {
  const implementations = new Map<ValidationRuleId, ValidationRuleImplementation>();

  return {
    register(implementation: ValidationRuleImplementation): void {
      if (!isValidationRuleId(implementation.ruleId)) {
        throw new Error(
          `[LetterEngine] "${String(implementation.ruleId)}" is not a declared validation rule. ` +
            `Add it to the rule catalogue first.`,
        );
      }
      if (implementations.has(implementation.ruleId)) {
        throw new Error(
          `[LetterEngine] Validation rule "${implementation.ruleId}" already has an implementation. ` +
            `Two implementations of one rule would make its behaviour depend on load order.`,
        );
      }
      implementations.set(implementation.ruleId, implementation);
    },

    has: (ruleId) => implementations.has(ruleId),
    get: (ruleId) => implementations.get(ruleId),
    registeredRuleIds: () => [...implementations.keys()],
  };
}

export interface ValidationResult {
  /** Findings, most severe first. */
  readonly issues: readonly ValidationIssue[];
  /** Selected rules with no implementation — reported, never swallowed. */
  readonly unimplementedRuleIds: readonly ValidationRuleId[];
}

/** Sort most-severe first, keeping each severity's findings in discovery order. */
function sortIssues(issues: ValidationIssue[]): ValidationIssue[] {
  return [...issues].sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
}

/** Evaluate one rule and stamp its findings with the catalogue's severity. */
function evaluateRule(
  implementation: ValidationRuleImplementation,
  selection: ValidationRuleSelection,
  context: LetterValidationContext,
): ValidationIssue[] {
  // The single reason a rule cannot decide how serious its own finding is.
  const severity = getValidationRule(selection.ruleId).severity;
  return implementation.evaluate(context, selection.params).map((finding) => ({ ...finding, severity }));
}

function assertSelectionShape(selection: ValidationRuleSelection): void {
  if (selectionParamsMatchShape(selection)) return;
  throw new Error(
    `[LetterEngine] Validation rule "${selection.ruleId}" was selected with parameters that do not ` +
      `match its declared shape. A stray or missing threshold would leave the rule running against ` +
      `a default nobody chose.`,
  );
}

/** Run every selected rule. The straightforward, non-incremental path. */
export function runValidation(
  registry: ValidationRuleRegistry,
  selections: readonly ValidationRuleSelection[],
  context: LetterValidationContext,
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const unimplemented: ValidationRuleId[] = [];

  for (const selection of selections) {
    assertSelectionShape(selection);
    const implementation = registry.get(selection.ruleId);
    if (!implementation) {
      unimplemented.push(selection.ruleId);
      continue;
    }
    issues.push(...evaluateRule(implementation, selection, context));
  }

  return { issues: sortIssues(issues), unimplementedRuleIds: unimplemented };
}

/* ── Incremental runner ─────────────────────────────────────────────────── */

export interface ValidationRunner {
  /**
   * Validate, re-evaluating only the rules affected by `changed`.
   *
   * `'all'` forces a full pass — used for the first run and whenever the caller cannot
   * say precisely what moved.
   */
  run(
    selections: readonly ValidationRuleSelection[],
    context: LetterValidationContext,
    changed: readonly ValidationInput[] | 'all',
  ): ValidationResult;
  /** Drop every cached finding. */
  reset(): void;
  /** How many rules the last run actually evaluated — for tests and diagnostics. */
  lastEvaluatedCount(): number;
}

/**
 * A runner that caches each rule's findings.
 *
 * The cache is keyed by RULE, not by document: a rule whose inputs did not change
 * cannot produce a different answer, so re-running it is pure waste. That is the whole
 * of the incremental strategy, and it is why `dependsOn` is a property of the
 * implementation rather than an advisory hint.
 */
export function createValidationRunner(registry: ValidationRuleRegistry): ValidationRunner {
  let cache = new Map<ValidationRuleId, ValidationIssue[]>();
  let evaluated = 0;

  return {
    run(selections, context, changed) {
      const issues: ValidationIssue[] = [];
      const unimplemented: ValidationRuleId[] = [];
      const changedSet = changed === 'all' ? null : new Set(changed);
      evaluated = 0;

      for (const selection of selections) {
        assertSelectionShape(selection);
        const implementation = registry.get(selection.ruleId);
        if (!implementation) {
          unimplemented.push(selection.ruleId);
          continue;
        }

        const cached = cache.get(selection.ruleId);
        const affected =
          changedSet === null ||
          cached === undefined ||
          implementation.dependsOn.some((input) => changedSet.has(input));

        if (!affected && cached) {
          issues.push(...cached);
          continue;
        }

        const fresh = evaluateRule(implementation, selection, context);
        evaluated += 1;
        cache.set(selection.ruleId, fresh);
        issues.push(...fresh);
      }

      return { issues: sortIssues(issues), unimplementedRuleIds: unimplemented };
    },

    reset() {
      cache = new Map();
    },

    lastEvaluatedCount: () => evaluated,
  };
}

/* ── Reading a result ───────────────────────────────────────────────────── */

export function issuesOfSeverity(result: ValidationResult, severity: ValidationSeverity): ValidationIssue[] {
  return result.issues.filter((issue) => issue.severity === severity);
}

export function getBlockingIssues(result: ValidationResult): ValidationIssue[] {
  return issuesOfSeverity(result, 'blocking');
}

export function getWarningIssues(result: ValidationResult): ValidationIssue[] {
  return issuesOfSeverity(result, 'warning');
}

/**
 * The single predicate a future output path will consult.
 *
 * One function, one answer — never one check per output path. A gate duplicated across
 * print, PDF and export is a gate that will eventually differ between them.
 */
export function hasBlockingIssues(result: ValidationResult): boolean {
  return result.issues.some((issue) => issue.severity === 'blocking');
}

/** A document's readiness at a glance. */
export interface ValidationSummary {
  readonly blocking: number;
  readonly errors: number;
  readonly warnings: number;
  readonly info: number;
  readonly total: number;
  /** No blocking findings AND every selected rule actually ran. */
  readonly readyForPrinting: boolean;
  /** Selected rules with no implementation yet. */
  readonly unimplementedCount: number;
}

/**
 * Summarise a result.
 *
 * `readyForPrinting` requires that every selected rule RAN. "We checked and found
 * nothing" and "we never checked" must never reach paper as the same answer.
 */
export function summarise(result: ValidationResult): ValidationSummary {
  const blocking = issuesOfSeverity(result, 'blocking').length;
  const errors = issuesOfSeverity(result, 'error').length;
  const warnings = issuesOfSeverity(result, 'warning').length;
  const info = issuesOfSeverity(result, 'info').length;

  return {
    blocking,
    errors,
    warnings,
    info,
    total: result.issues.length,
    readyForPrinting: blocking === 0 && result.unimplementedRuleIds.length === 0,
    unimplementedCount: result.unimplementedRuleIds.length,
  };
}

/**
 * Throwing form for a future output path.
 *
 * Nothing calls it yet — printing belongs to a later pack. It lives here so that pack
 * wires up the existing gate rather than inventing a second one.
 */
export function assertNoBlockingIssues(result: ValidationResult): void {
  if (result.unimplementedRuleIds.length > 0) {
    throw new Error(
      `[LetterEngine] Refusing to treat this document as validated: ` +
        `${result.unimplementedRuleIds.length} selected rule(s) have no implementation ` +
        `(${result.unimplementedRuleIds.join(', ')}).`,
    );
  }
  const blocking = getBlockingIssues(result);
  if (blocking.length > 0) {
    throw new Error(
      `[LetterEngine] ${blocking.length} blocking validation issue(s): ` +
        blocking.map((i) => `${i.ruleId} — ${i.message}`).join('; '),
    );
  }
}
