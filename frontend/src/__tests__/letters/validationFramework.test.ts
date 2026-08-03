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
 */
import { describe, it, expect, vi } from 'vitest';
import {
  type ValidationFinding,
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
import { getTemplate } from '../../letters/registry/templateRegistry';
import { getPageGeometry } from '../../letters/registry/geometryRegistry';
import { paginate } from '../../letters/pagination/paginate';
import { createEmptyBlockDocument } from '../../letters/model/blockTypes';

const GEOMETRY = getPageGeometry('companyLetterhead', 1);

function context(overrides: Partial<LetterValidationContext> = {}): LetterValidationContext {
  return {
    template: getTemplate('officialLetter'),
    geometry: GEOMETRY,
    status: 'DRAFT',
    reference: null,
    issueDate: '2026-08-03',
    subject: 'موضوع',
    recipient: { name: '', title: '', organisation: '' },
    content: createEmptyBlockDocument(),
    pagination: paginate([], GEOMETRY),
    itemHeightsMm: {},
    subjectLineCount: 1,
    signatureAssetId: null,
    stampAssetId: null,
    signatureResolved: false,
    stampResolved: false,
    barcodePayload: '',
    now: new Date('2026-08-03T00:00:00.000Z'),
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

  it('names rules by severity: E blocking, W warning, I information', () => {
    for (const id of VALIDATION_RULE_IDS) {
      const expected = id.startsWith('E') ? 'blocking' : id.startsWith('W') ? 'warning' : 'info';
      expect(VALIDATION_RULES[id].severity, `${id} has the wrong severity`).toBe(expected);
    }
  });

  it('the reserved-zone rule is blocking, with no mechanism to make it otherwise', () => {
    // Severity is a catalogue fact with no per-template override, so this one assertion
    // covers every template that will ever exist.
    expect(getValidationRule('E4_reservedZoneOverlap').severity).toBe('blocking');
  });

  it('groups rules by severity consistently', () => {
    expect(getBlockingRules()).toEqual(getRulesBySeverity('blocking'));
    expect(getWarningRules()).toEqual(getRulesBySeverity('warning'));
    expect(getRulesBySeverity('info').length).toBeGreaterThan(0);
    // `error` is declared so the engine can express it. No approved rule currently
    // carries it, and re-classifying one to populate a level would be changing a
    // decision to suit a taxonomy.
    expect(getRulesBySeverity('error')).toEqual([]);
  });

  it('every rule documents itself and declares unique parameter names', () => {
    for (const id of VALIDATION_RULE_IDS) {
      expect(VALIDATION_RULES[id].description.length).toBeGreaterThan(20);
      expect(new Set(VALIDATION_RULES[id].paramNames).size).toBe(VALIDATION_RULES[id].paramNames.length);
    }
  });

  it('guards unknown, empty and prototype-chain rule ids', () => {
    expect(isValidationRuleId('E1_subjectRequired')).toBe(true);
    expect(isValidationRuleId('E99_nope')).toBe(false);
    expect(isValidationRuleId('')).toBe(false);
    expect(isValidationRuleId(null)).toBe(false);
    expect(isValidationRuleId('constructor')).toBe(false);
  });

  it('parameter-shape matching is exact', () => {
    expect(selectionParamsMatchShape({ ruleId: 'E10_pageCapExceeded', params: { maxPages: 10 } })).toBe(true);
    expect(selectionParamsMatchShape({ ruleId: 'E10_pageCapExceeded', params: {} })).toBe(false);
    expect(selectionParamsMatchShape({ ruleId: 'E10_pageCapExceeded', params: { maxPages: 10, extra: 1 } })).toBe(false);
    expect(selectionParamsMatchShape({ ruleId: 'E1_subjectRequired', params: {} })).toBe(true);
  });
});

/* ── Registry ───────────────────────────────────────────────────────────── */

describe('Rule registry', () => {
  it('registers, finds and lists implementations', () => {
    const registry = createValidationRuleRegistry();
    expect(registry.registeredRuleIds()).toEqual([]);
    registry.register(stubRule('E1_subjectRequired'));
    expect(registry.has('E1_subjectRequired')).toBe(true);
    expect(registry.registeredRuleIds()).toEqual(['E1_subjectRequired']);
  });

  it('refuses an implementation for an uncatalogued rule', () => {
    const registry = createValidationRuleRegistry();
    expect(() => registry.register(stubRule('E99_ghost' as never))).toThrow(/not a declared validation rule/);
  });

  it('refuses a second implementation of the same rule', () => {
    // Two implementations would make behaviour depend on module load order.
    const registry = createValidationRuleRegistry();
    registry.register(stubRule('E1_subjectRequired'));
    expect(() => registry.register(stubRule('E1_subjectRequired'))).toThrow(/already has an implementation/);
  });
});

/* ── Running ────────────────────────────────────────────────────────────── */

describe('runValidation', () => {
  it('stamps severity from the CATALOGUE, not from the rule', () => {
    const registry = createValidationRuleRegistry();
    registry.register(stubRule('E4_reservedZoneOverlap'));
    registry.register(stubRule('W1_pageCountAdvisory'));
    registry.register(stubRule('I1_documentPageCount'));

    const result = runValidation(
      registry,
      [
        { ruleId: 'E4_reservedZoneOverlap', params: {} },
        { ruleId: 'W1_pageCountAdvisory', params: { advisoryPageCount: 5 } },
        { ruleId: 'I1_documentPageCount', params: {} },
      ],
      context(),
    );

    expect(result.issues.find((i) => i.ruleId === 'E4_reservedZoneOverlap')?.severity).toBe('blocking');
    expect(result.issues.find((i) => i.ruleId === 'W1_pageCountAdvisory')?.severity).toBe('warning');
    expect(result.issues.find((i) => i.ruleId === 'I1_documentPageCount')?.severity).toBe('info');
  });

  it('sorts findings most severe first', () => {
    const registry = createValidationRuleRegistry();
    registry.register(stubRule('I1_documentPageCount'));
    registry.register(stubRule('W1_pageCountAdvisory'));
    registry.register(stubRule('E1_subjectRequired'));

    const result = runValidation(
      registry,
      [
        { ruleId: 'I1_documentPageCount', params: {} },
        { ruleId: 'W1_pageCountAdvisory', params: { advisoryPageCount: 5 } },
        { ruleId: 'E1_subjectRequired', params: {} },
      ],
      context(),
    );

    expect(result.issues.map((i) => i.severity)).toEqual(['blocking', 'warning', 'info']);
  });

  it('reports selected rules that have no implementation instead of ignoring them', () => {
    const registry = createValidationRuleRegistry();
    const result = runValidation(registry, [{ ruleId: 'E1_subjectRequired', params: {} }], context());
    expect(result.issues).toEqual([]);
    expect(result.unimplementedRuleIds).toEqual(['E1_subjectRequired']);
  });

  it('throws when a selection’s parameters do not match the rule’s shape', () => {
    const registry = createValidationRuleRegistry();
    registry.register(stubRule('E10_pageCapExceeded'));
    expect(() => runValidation(registry, [{ ruleId: 'E10_pageCapExceeded', params: {} }], context()))
      .toThrow(/do not match its declared shape/);
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
    const issue = runValidation(registry, [{ ruleId: 'E4_reservedZoneOverlap', params: {} }], context()).issues[0];
    expect(issue.suggestion).toBe('اقتراح');
    expect(issue.location).toEqual({ pageIndex: 1, overshootMm: 6, sectionKind: 'content' });
  });
});

/* ── Incremental runner ─────────────────────────────────────────────────── */

describe('The incremental runner re-evaluates only what changed', () => {
  it('declares a closed set of inputs', () => {
    expect([...VALIDATION_INPUTS]).toEqual([
      'subject', 'recipient', 'issueDate', 'content', 'typography', 'pagination', 'geometry', 'status',
    ]);
  });

  function twoRuleRunner() {
    const subjectSpy = vi.fn();
    const geometrySpy = vi.fn();
    const registry = createValidationRuleRegistry();
    registry.register(stubRule('E1_subjectRequired', ['subject'], [], subjectSpy));
    registry.register(stubRule('E13_impossibleGeometry', ['geometry'], [], geometrySpy));
    const selections = [
      { ruleId: 'E1_subjectRequired' as const, params: {} },
      { ruleId: 'E13_impossibleGeometry' as const, params: {} },
    ];
    return { runner: createValidationRunner(registry), selections, subjectSpy, geometrySpy };
  }

  it('evaluates everything on the first pass', () => {
    const { runner, selections, subjectSpy, geometrySpy } = twoRuleRunner();
    runner.run(selections, context(), 'all');
    expect(subjectSpy).toHaveBeenCalledTimes(1);
    expect(geometrySpy).toHaveBeenCalledTimes(1);
    expect(runner.lastEvaluatedCount()).toBe(2);
  });

  it('re-evaluates ONLY the rules whose inputs changed', () => {
    // Typing in the subject must not re-run the geometry rules — the whole point.
    const { runner, selections, subjectSpy, geometrySpy } = twoRuleRunner();
    runner.run(selections, context(), 'all');
    runner.run(selections, context({ subject: 'موضوع جديد' }), ['subject']);

    expect(subjectSpy).toHaveBeenCalledTimes(2);
    expect(geometrySpy).toHaveBeenCalledTimes(1);
    expect(runner.lastEvaluatedCount()).toBe(1);
  });

  it('evaluates nothing when an unrelated input changes', () => {
    const { runner, selections } = twoRuleRunner();
    runner.run(selections, context(), 'all');
    runner.run(selections, context(), ['recipient']);
    expect(runner.lastEvaluatedCount()).toBe(0);
  });

  it('reuses cached findings for the rules it skipped', () => {
    const registry = createValidationRuleRegistry();
    registry.register(stubRule('E1_subjectRequired', ['subject']));
    registry.register(stubRule('E13_impossibleGeometry', ['geometry']));
    const runner = createValidationRunner(registry);
    const selections = [
      { ruleId: 'E1_subjectRequired' as const, params: {} },
      { ruleId: 'E13_impossibleGeometry' as const, params: {} },
    ];

    const first = runner.run(selections, context(), 'all');
    const second = runner.run(selections, context(), ['subject']);
    // Skipping a rule must not lose its findings.
    expect(second.issues).toHaveLength(first.issues.length);
    expect(second.issues.map((i) => i.ruleId).sort()).toEqual(first.issues.map((i) => i.ruleId).sort());
  });

  it('re-evaluates everything after a reset', () => {
    const { runner, selections, geometrySpy } = twoRuleRunner();
    runner.run(selections, context(), 'all');
    runner.reset();
    runner.run(selections, context(), ['subject']);
    expect(geometrySpy).toHaveBeenCalledTimes(2);
  });

  it('evaluates a rule it has never seen, whatever changed', () => {
    const { runner, selections, geometrySpy } = twoRuleRunner();
    runner.run(selections, context(), ['subject']);
    expect(geometrySpy).toHaveBeenCalledTimes(1);
  });
});

/* ── Summary ────────────────────────────────────────────────────────────── */

describe('summarise', () => {
  function resultWith(...ids: ValidationRuleId[]) {
    const registry = createValidationRuleRegistry();
    for (const id of ids) registry.register(stubRule(id));
    return runValidation(
      registry,
      ids.map((id) => ({
        ruleId: id,
        params: Object.fromEntries(getValidationRule(id).paramNames.map((n) => [n, 1])),
      })),
      context(),
    );
  }

  it('counts each severity', () => {
    const summary = summarise(resultWith('E1_subjectRequired', 'W1_pageCountAdvisory', 'I1_documentPageCount'));
    expect(summary).toMatchObject({ blocking: 1, errors: 0, warnings: 1, info: 1, total: 3 });
  });

  it('is ready when nothing blocks and everything ran', () => {
    expect(summarise(resultWith('W1_pageCountAdvisory', 'I1_documentPageCount')).readyForPrinting).toBe(true);
  });

  it('is NOT ready with a blocking finding', () => {
    expect(summarise(resultWith('E1_subjectRequired')).readyForPrinting).toBe(false);
  });

  it('is NOT ready when a selected rule never ran', () => {
    // "We checked and found nothing" and "we never checked" must never be the same
    // answer on the way to paper.
    const registry = createValidationRuleRegistry();
    const result = runValidation(registry, [{ ruleId: 'E1_subjectRequired', params: {} }], context());
    const summary = summarise(result);
    expect(summary.blocking).toBe(0);
    expect(summary.unimplementedCount).toBe(1);
    expect(summary.readyForPrinting).toBe(false);
  });
});

/* ── The output gate ────────────────────────────────────────────────────── */

describe('The gate a future output path will consult', () => {
  function resultWith(...ids: ValidationRuleId[]) {
    const registry = createValidationRuleRegistry();
    for (const id of ids) registry.register(stubRule(id));
    return runValidation(registry, ids.map((id) => ({ ruleId: id, params: {} })), context());
  }

  it('separates severities', () => {
    const result = resultWith('E1_subjectRequired', 'W3_nonOfficialFontUsed', 'I1_documentPageCount');
    expect(getBlockingIssues(result)).toHaveLength(1);
    expect(getWarningIssues(result)).toHaveLength(1);
    expect(issuesOfSeverity(result, 'info')).toHaveLength(1);
  });

  it('warnings and information never block', () => {
    const result = resultWith('W3_nonOfficialFontUsed', 'I1_documentPageCount');
    expect(hasBlockingIssues(result)).toBe(false);
    expect(() => assertNoBlockingIssues(result)).not.toThrow();
  });

  it('a single blocking finding blocks', () => {
    const result = resultWith('E2_contentRequired');
    expect(hasBlockingIssues(result)).toBe(true);
    expect(() => assertNoBlockingIssues(result)).toThrow(/1 blocking validation issue/);
  });

  it('refuses to certify a document whose rules were never run', () => {
    const registry = createValidationRuleRegistry();
    const result = runValidation(registry, [{ ruleId: 'E1_subjectRequired', params: {} }], context());
    expect(() => assertNoBlockingIssues(result)).toThrow(/no implementation/);
  });
});
