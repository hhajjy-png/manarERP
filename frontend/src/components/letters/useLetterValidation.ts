/**
 * Letter Engine — live validation.
 *
 * The React binding for the validation engine. It builds a context from composer state
 * and asks the engine; it contains no rule, no threshold and no judgement of its own —
 * all of that lives in `letters/validation`, so a future template reuses the engine
 * rather than this hook.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  TWO THINGS KEEP LIVE VALIDATION CHEAP
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  1. IT TRACKS WHAT CHANGED. Each input carries a signature; the hook diffs them and
 *     tells the runner exactly which inputs moved. The runner then re-evaluates only
 *     the rules that read them — typing in the subject does not re-run the geometry
 *     rules, and moving the caret re-runs nothing at all.
 *
 *  2. IT IS DEBOUNCED. Validation runs on a short idle rather than per keystroke, so a
 *     burst of typing produces one pass instead of thirty. The debounce is short
 *     enough that the panel still feels live.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  type ValidationResult,
  type ValidationRunner,
  type ValidationSummary,
  createValidationRunner,
  summarise,
} from '../../letters/validation/framework';
import { type LetterValidationContext, type ValidationInput } from '../../letters/validation/context';
import { createLetterValidationRegistry } from '../../letters/validation/rules';

/** Long enough to coalesce a burst of typing, short enough to still feel live. */
const DEBOUNCE_MS = 250;

const EMPTY_RESULT: ValidationResult = { issues: [], unimplementedRuleIds: [] };

export interface UseLetterValidationResult {
  result: ValidationResult;
  summary: ValidationSummary;
  /** How many rules the last pass evaluated — surfaced for diagnostics and tests. */
  lastEvaluatedCount: number;
}

/**
 * Signatures for every input, so a change can be attributed to a specific one.
 *
 * Cheap by construction: each is a short string derived from state the composer
 * already holds, never a deep comparison of the document.
 */
function signaturesOf(context: LetterValidationContext): Record<ValidationInput, string> {
  return {
    subject: context.subject + `|${context.subjectLineCount}`,
    recipient: `${context.recipient.name}|${context.recipient.title}|${context.recipient.organisation}`,
    issueDate: context.issueDate,
    content: JSON.stringify(context.content),
    // Typography lives inside the block attributes, so it moves when they do — but it
    // is tracked separately so a pure text edit does not re-run the font rules.
    typography: context.content.blocks.map((b) => `${b.attributes.fontId}:${b.attributes.sizePt}`).join(','),
    pagination: `${context.pagination.pageCount}|${context.pagination.pages.map((p) => `${p.itemIds.length}:${p.usedMm}`).join(';')}|${context.pagination.overflowingItemIds.join(',')}`,
    geometry: JSON.stringify(context.geometry),
    status: `${context.status}|${context.reference ?? ''}`,
  };
}

export function useLetterValidation(
  context: LetterValidationContext | null,
): UseLetterValidationResult {
  // One registry and one runner for the composer's lifetime: the runner's cache is
  // what makes re-validation incremental, and rebuilding it would discard that.
  const runnerRef = useRef<ValidationRunner | null>(null);
  if (runnerRef.current === null) {
    runnerRef.current = createValidationRunner(createLetterValidationRegistry());
  }

  const previousSignatures = useRef<Record<ValidationInput, string> | null>(null);
  const [result, setResult] = useState<ValidationResult>(EMPTY_RESULT);
  const [lastEvaluatedCount, setLastEvaluatedCount] = useState(0);

  const signatures = useMemo(() => (context ? signaturesOf(context) : null), [context]);

  useEffect(() => {
    if (!context || !signatures) return;
    const runner = runnerRef.current;
    if (!runner) return;

    const timer = setTimeout(() => {
      const previous = previousSignatures.current;
      const changed: ValidationInput[] = previous
        ? (Object.keys(signatures) as ValidationInput[]).filter((key) => signatures[key] !== previous[key])
        : [];

      // First pass, or nothing identifiable moved: run everything rather than guess.
      const scope = previous === null ? 'all' : changed;
      if (previous !== null && changed.length === 0) return;

      previousSignatures.current = signatures;
      setResult(runner.run(context.template.validationRules, context, scope));
      setLastEvaluatedCount(runner.lastEvaluatedCount());
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [context, signatures]);

  const summary = useMemo(() => summarise(result), [result]);

  return { result, summary, lastEvaluatedCount };
}
