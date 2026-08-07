/**
 * Letter Engine — the validation pipeline.
 *
 * The engine, not the rules: severity handling, the incremental runner, the summary,
 * and the catalogue's integrity. Rule behaviour is tested in `validationRules.test.ts`.
 *
 * Three properties are under test throughout:
 *
 *  1. SEVERITY COMES FROM THE CATALOGUE. A rule reports findings and has no say in how
 *     serious they are — which is what makes "always blocking, no override" true
 *     rather than conventional.
 *
 *  2. "NOTHING FOUND" IS NOT "NOTHING CHECKED". An unimplemented rule is reported, and
 *     readiness refuses while any remain.
 *
 *  3. RE-EVALUATION IS INCREMENTAL. The runner skips rules a change cannot affect —
 *     asserted by counting how many actually ran.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  FORM EDITOR UX REBUILD v2 — THE CATALOGUE IS NOW THREE RULES, ALL BLOCKING.
 * ══════════════════════════════════════════════════════════════════════════
 * `summarise` and the gate functions (`getBlockingIssues`, `hasBlockingIssues`,
 * `assertNoBlockingIssues`, …) operate on a `ValidationResult` VALUE — they never
 * re-derive severity from the catalogue. Their tests below build that value directly,
 * pairing a real rule id with whatever severity the assertion needs, exactly as
 * `printPipeline.test.ts` does for the same reason: the plumbing's job is to sort,
 * count and gate by whatever severity a finding already carries, and that job is
 * unchanged by how many severities the shipped catalogue currently uses.
 *
 * Tests that exercise `runValidation` itself — where severity genuinely is stamped
 * FROM the catalogue — use the three real ids and can only demonstrate `blocking`,
 * since that is the only severity the catalogue declares a rule for today.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  type ValidationFinding,
  type ValidationIssue,
  type ValidationResult,
  type ValidationRuleImplementation,
  assertNoBlockingIssues,
  createValidationRuleRegistry,
  createValidationRunner,
  getBlockingIssues,
  getWarningIssues,
  hasBlockingIssues,
  issuesOfSeverity,
  runValidation,
  summarise,
} from '../../letters/validation/framework';
import { type LetterValidationContext, VALIDATION_INPUTS } from '../../letters/validation/context';
import {
  SEVERITY_LABELS_AR,
  SEVERITY_ORDER,
  VALIDATION_RULES,
  VALIDATION_RULE_IDS,
  getBlockingRules,
  getRulesBySeverity,
  getValidationRule,
  getWarningRules,
  isValidationRuleId,
  selectionParamsMatchShape,
  severityRank,
  type ValidationRuleId,
} from '../../letters/registry/validationRuleCatalog';
import { getPageGeometry } from '../../letters/registry/geometryRegistry';
import { paginate } from '../../letters/pagination/paginate';
import { createEmptyBlockDocument } from '../../letters/model/blockTypes';

const GEOMETRY = getPageGeometry('companyLetterhead', 1);

function context(overrides: Partial<LetterValidationContext> = {}): LetterValidationContext {
  return {
    geometry: GEOMETRY,
    content: createEmptyBlockDocument(),
    pagination: paginate([], GEOMETRY),
    ...overrides,
  };
}

/** A stub reporting one finding, with declared dependencies. */
function stubRule(
  ruleId: ValidationRuleId,
  dependsOn: ValidationRuleImplementation['dependsOn'] = [],
  findings: ValidationFinding[] = [{ ruleId, message: 'stub' }],
  spy?: () => void,
): ValidationRuleImplementation {
  return {
    ruleId,
    dependsOn,
    evaluate: () => {
      spy?.();
      return findings;
    },
  };
}

/**
 * A `ValidationResult` built DIRECTLY — no registry, no rule execution.
 *
 * For the summary and gate tests, which operate on the shape rather than on how it was
 * produced. `severity` is independent of `ruleId` at the type level (a real rule and
 * its catalogue severity happen to agree; a hand-built fixture does not have to), which
 * is what lets these tests still exercise every severity even though the shipped
 * catalogue currently declares only `blocking` rules.
 */
function resultOf(...issues: ValidationIssue[]): ValidationResult {
  return { issues, unimplementedRuleIds: [] };
}

function issue(ruleId: ValidationRuleId, severity: ValidationIssue['severity']): ValidationIssue {
  return { ruleId, severity, message: 'رسالة اختبار' };
}

/* ── Catalogue ──────────────────────────────────────────────────────────── */

describe('The rule catalogue', () => {
  it('declares four severities, most severe first', () => {
    expect([...SEVERITY_ORDER]).toEqual(['blocking', 'error', 'warning', 'info']);
    expect(severityRank('blocking')).toBeLessThan(severityRank('error'));
    expect(severityRank('error')).toBeLessThan(severityRank('warning'));
    expect(severityRank('warning')).toBeLessThan(severityRank('info'));
  });

  it('labels every severity in Arabic', () => {
    for (const severity of SEVERITY_ORDER) {
      expect(SEVERITY_LABELS_AR[severity].length).toBeGreaterThan(0);
    }
  });

  it('the record key equals each rule’s own id', () => {
    for (const id of VALIDATION_RULE_IDS) expect(VALIDATION_RULES[id].id).toBe(id);
  });

  it('declares exactly the three rules the rebuild kept, all of them blocking', () => {
    // Form Editor UX Rebuild v2. Nothing else survived deletion — not deselection, not
    // downgrading. See `validationRuleCatalog.ts` for the reasoning.
    expect([...VALIDATION_RULE_IDS].sort()).toEqual(
      ['E4_reservedZoneOverlap', 'E13_impossibleGeometry', 'E16_objectInReservedZone'].sort(),
    );
    for (const id of VALIDATION_RULE_IDS) {
      expect(VALIDATION_RULES[id].severity, `${id} has the wrong severity`).toBe('blocking');
    }
  });

  it('the reserved-zone rule is blocking, with no mechanism to make it otherwise', () => {
    // Severity is a catalogue fact with no per-template override, so this one assertion
    // covers every template that will ever exist.
    expect(getValidationRule('E4_reservedZoneOverlap').severity).toBe('blocking');
  });

  it('groups rules by severity consistently', () => {
    expect(getBlockingRules()).toEqual(getRulesBySeverity('blocking'));
    expect(getBlockingRules().length).toBe(3);
    // No warning, error or info rule is declared today — the rebuild deleted every one.
    // The three severities remain expressible (see the type's own header) but currently
    // empty, which is exactly what these assert.
    expect(getWarningRules()).toEqual([]);
    expect(getRulesBySeverity('info')).toEqual([]);
    expect(getRulesBySeverity('error')).toEqual([]);
  });

  it('every rule documents itself and declares unique, empty parameter lists', () => {
    // All three surviving rules are parameterless — their thresholds are the Geometry
    // Registry's own dimensions, not a number a template gets to choose.
    for (const id of VALIDATION_RULE_IDS) {
      expect(VALIDATION_RULES[id].description.length).toBeGreaterThan(20);
      expect(VALIDATION_RULES[id].paramNames).toEqual([]);
    }
  });

  it('guards unknown, empty, deleted and prototype-chain rule ids', () => {
    expect(isValidationRuleId('E4_reservedZoneOverlap')).toBe(true);
    // A rule the rebuild deleted is now exactly as unknown as one that never existed.
    expect(isValidationRuleId('E1_subjectRequired')).toBe(false);
    expect(isValidationRuleId('E99_nope')).toBe(false);
    expect(isValidationRuleId('')).toBe(false);
    expect(isValidationRuleId(null)).toBe(false);
    expect(isValidationRuleId('constructor')).toBe(false);
  });

  it('parameter-shape matching is exact — a parameterless rule accepts no stray param', () => {
    expect(selectionParamsMatchShape({ ruleId: 'E4_reservedZoneOverlap', params: {} })).toBe(true);
    expect(
      selectionParamsMatchShape({ ruleId: 'E4_reservedZoneOverlap', params: { extra: 1 } as never }),
    ).toBe(false);
  });
});

/* ── Registry ───────────────────────────────────────────────────────────── */

describe('Rule registry', () => {
  it('registers, finds and lists implementations', () => {
    const registry = createValidationRuleRegistry();
    expect(registry.registeredRuleIds()).toEqual([]);
    registry.register(stubRule('E4_reservedZoneOverlap'));
    expect(registry.has('E4_reservedZoneOverlap')).toBe(true);
    expect(registry.registeredRuleIds()).toEqual(['E4_reservedZoneOverlap']);
  });

  it('refuses an implementation for an uncatalogued rule', () => {
    const registry = createValidationRuleRegistry();
    expect(() => registry.register(stubRule('E99_ghost' as never))).toThrow(/not a declared validation rule/);
  });

  it('refuses a second implementation of the same rule', () => {
    // Two implementations would make behaviour depend on module load order.
    const registry = createValidationRuleRegistry();
    registry.register(stubRule('E4_reservedZoneOverlap'));
    expect(() => registry.register(stubRule('E4_reservedZoneOverlap'))).toThrow(/already has an implementation/);
  });
});

/* ── Running ────────────────────────────────────────────────────────────── */

describe('runValidation', () => {
  it('stamps severity from the CATALOGUE, not from the rule', () => {
    // A finding never carries its own severity to begin with (`ValidationFinding` omits
    // it) — the runner always looks it up. With every rule blocking today, this proves
    // the lookup happens rather than that it could disagree; `resultOf`/`issue` above
    // cover the case where severities genuinely differ.
    const registry = createValidationRuleRegistry();
    registry.register(stubRule('E4_reservedZoneOverlap'));

    const result = runValidation(registry, [{ ruleId: 'E4_reservedZoneOverlap', params: {} }], context());
    expect(result.issues[0].severity).toBe('blocking');
  });

  it('preserves discovery order among findings of equal severity', () => {
    // With a single-severity catalogue, "sort most severe first" has nothing left to
    // reorder — what remains to prove is that the sort is STABLE: three blocking rules
    // report in selection order, not in some incidental object-iteration order.
    const registry = createValidationRuleRegistry();
    registry.register(stubRule('E16_objectInReservedZone'));
    registry.register(stubRule('E4_reservedZoneOverlap'));
    registry.register(stubRule('E13_impossibleGeometry'));

    const result = runValidation(
      registry,
      [
        { ruleId: 'E16_objectInReservedZone', params: {} },
        { ruleId: 'E4_reservedZoneOverlap', params: {} },
        { ruleId: 'E13_impossibleGeometry', params: {} },
      ],
      context(),
    );

    expect(result.issues.map((i) => i.ruleId)).toEqual([
      'E16_objectInReservedZone',
      'E4_reservedZoneOverlap',
      'E13_impossibleGeometry',
    ]);
  });

  it('reports selected rules that have no implementation instead of ignoring them', () => {
    const registry = createValidationRuleRegistry();
    const result = runValidation(registry, [{ ruleId: 'E4_reservedZoneOverlap', params: {} }], context());
    expect(result.issues).toEqual([]);
    expect(result.unimplementedRuleIds).toEqual(['E4_reservedZoneOverlap']);
  });

  it('throws when a selection’s parameters do not match the rule’s shape', () => {
    const registry = createValidationRuleRegistry();
    registry.register(stubRule('E4_reservedZoneOverlap'));
    expect(() =>
      runValidation(registry, [{ ruleId: 'E4_reservedZoneOverlap', params: { extra: 1 } as never }], context()),
    ).toThrow(/do not match its declared shape/);
  });

  it('carries a structured location and a suggested fix through unchanged', () => {
    // Findings are structured records, never bare strings.
    const registry = createValidationRuleRegistry();
    registry.register(
      stubRule('E4_reservedZoneOverlap', [], [
        {
          ruleId: 'E4_reservedZoneOverlap',
          message: 'رسالة',
          suggestion: 'اقتراح',
          location: { pageIndex: 1, overshootMm: 6, sectionKind: 'content' },
        },
      ]),
    );
    const found = runValidation(registry, [{ ruleId: 'E4_reservedZoneOverlap', params: {} }], context()).issues[0];
    expect(found.suggestion).toBe('اقتراح');
    expect(found.location).toEqual({ pageIndex: 1, overshootMm: 6, sectionKind: 'content' });
  });
});

/* ── Incremental runner ─────────────────────────────────────────────────── */

describe('The incremental runner re-evaluates only what changed', () => {
  it('declares a closed set of inputs', () => {
    // Shrunk with the context itself (Form Editor UX Rebuild v2) — the three surviving
    // rules read only geometry, content and the paginator's own layout.
    expect([...VALIDATION_INPUTS]).toEqual(['content', 'pagination', 'geometry']);
  });

  /**
   * Two stub rules with DIFFERENT declared dependencies, borrowing two of the three
   * real ids for registration purposes. The registry only checks that an id is
   * catalogued; it does not check that a stub's declared `dependsOn` matches what the
   * real implementation would read.
   */
  function twoRuleRunner() {
    const contentSpy = vi.fn();
    const geometrySpy = vi.fn();
    const registry = createValidationRuleRegistry();
    registry.register(stubRule('E16_objectInReservedZone', ['content'], [], contentSpy));
    registry.register(stubRule('E13_impossibleGeometry', ['geometry'], [], geometrySpy));
    const selections = [
      { ruleId: 'E16_objectInReservedZone' as const, params: {} },
      { ruleId: 'E13_impossibleGeometry' as const, params: {} },
    ];
    return { runner: createValidationRunner(registry), selections, contentSpy, geometrySpy };
  }

  it('evaluates everything on the first pass', () => {
    const { runner, selections, contentSpy, geometrySpy } = twoRuleRunner();
    runner.run(selections, context(), 'all');
    expect(contentSpy).toHaveBeenCalledTimes(1);
    expect(geometrySpy).toHaveBeenCalledTimes(1);
    expect(runner.lastEvaluatedCount()).toBe(2);
  });

  it('re-evaluates ONLY the rules whose inputs changed', () => {
    // A content edit must not re-run the geometry rule — the whole point. The runner
    // decides purely from the `changed` list the caller passes; it does not diff the
    // context itself, so the second call's context need not literally differ.
    const { runner, selections, contentSpy, geometrySpy } = twoRuleRunner();
    runner.run(selections, context(), 'all');
    runner.run(selections, context(), ['content']);

    expect(contentSpy).toHaveBeenCalledTimes(2);
    expect(geometrySpy).toHaveBeenCalledTimes(1);
    expect(runner.lastEvaluatedCount()).toBe(1);
  });

  it('evaluates nothing when an unrelated input changes', () => {
    const { runner, selections } = twoRuleRunner();
    runner.run(selections, context(), 'all');
    runner.run(selections, context(), ['pagination']);
    expect(runner.lastEvaluatedCount()).toBe(0);
  });

  it('reuses cached findings for the rules it skipped', () => {
    const registry = createValidationRuleRegistry();
    registry.register(stubRule('E16_objectInReservedZone', ['content']));
    registry.register(stubRule('E13_impossibleGeometry', ['geometry']));
    const runner = createValidationRunner(registry);
    const selections = [
      { ruleId: 'E16_objectInReservedZone' as const, params: {} },
      { ruleId: 'E13_impossibleGeometry' as const, params: {} },
    ];

    const first = runner.run(selections, context(), 'all');
    const second = runner.run(selections, context(), ['content']);
    // Skipping a rule must not lose its findings.
    expect(second.issues).toHaveLength(first.issues.length);
    expect(second.issues.map((i) => i.ruleId).sort()).toEqual(first.issues.map((i) => i.ruleId).sort());
  });

  it('re-evaluates everything after a reset', () => {
    const { runner, selections, geometrySpy } = twoRuleRunner();
    runner.run(selections, context(), 'all');
    runner.reset();
    runner.run(selections, context(), ['content']);
    expect(geometrySpy).toHaveBeenCalledTimes(2);
  });

  it('evaluates a rule it has never seen, whatever changed', () => {
    const { runner, selections, geometrySpy } = twoRuleRunner();
    runner.run(selections, context(), ['content']);
    expect(geometrySpy).toHaveBeenCalledTimes(1);
  });
});

/* ── Summary ────────────────────────────────────────────────────────────── */

describe('summarise', () => {
  it('counts each severity', () => {
    const summary = summarise(
      resultOf(
        issue('E4_reservedZoneOverlap', 'blocking'),
        issue('E13_impossibleGeometry', 'warning'),
        issue('E16_objectInReservedZone', 'info'),
      ),
    );
    expect(summary).toMatchObject({ blocking: 1, errors: 0, warnings: 1, info: 1, total: 3 });
  });

  it('is ready when nothing blocks and everything ran', () => {
    expect(
      summarise(resultOf(issue('E13_impossibleGeometry', 'warning'), issue('E16_objectInReservedZone', 'info')))
        .readyForPrinting,
    ).toBe(true);
  });

  it('is NOT ready with a blocking finding', () => {
    expect(summarise(resultOf(issue('E4_reservedZoneOverlap', 'blocking'))).readyForPrinting).toBe(false);
  });

  it('is NOT ready when a selected rule never ran', () => {
    // "We checked and found nothing" and "we never checked" must never be the same
    // answer on the way to paper.
    const registry = createValidationRuleRegistry();
    const result = runValidation(registry, [{ ruleId: 'E4_reservedZoneOverlap', params: {} }], context());
    const summary = summarise(result);
    expect(summary.blocking).toBe(0);
    expect(summary.unimplementedCount).toBe(1);
    expect(summary.readyForPrinting).toBe(false);
  });
});

/* ── The output gate ────────────────────────────────────────────────────── */

describe('The gate a future output path will consult', () => {
  it('separates severities', () => {
    const result = resultOf(
      issue('E4_reservedZoneOverlap', 'blocking'),
      issue('E13_impossibleGeometry', 'warning'),
      issue('E16_objectInReservedZone', 'info'),
    );
    expect(getBlockingIssues(result)).toHaveLength(1);
    expect(getWarningIssues(result)).toHaveLength(1);
    expect(issuesOfSeverity(result, 'info')).toHaveLength(1);
  });

  it('warnings and information never block', () => {
    const result = resultOf(issue('E13_impossibleGeometry', 'warning'), issue('E16_objectInReservedZone', 'info'));
    expect(hasBlockingIssues(result)).toBe(false);
    expect(() => assertNoBlockingIssues(result)).not.toThrow();
  });

  it('a single blocking finding blocks', () => {
    const result = resultOf(issue('E4_reservedZoneOverlap', 'blocking'));
    expect(hasBlockingIssues(result)).toBe(true);
    expect(() => assertNoBlockingIssues(result)).toThrow(/1 blocking validation issue/);
  });

  it('refuses to certify a document whose rules were never run', () => {
    const registry = createValidationRuleRegistry();
    const result = runValidation(registry, [{ ruleId: 'E4_reservedZoneOverlap', params: {} }], context());
    expect(() => assertNoBlockingIssues(result)).toThrow(/no implementation/);
  });
});
