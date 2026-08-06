/**
 * Letter Engine — conditional content (Professional Document Automation v1).
 *
 * PURE. A condition and a resolved variable map in, a boolean out.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A CONDITION IS DATA, NOT CODE. THERE IS NO EXPRESSION LANGUAGE.
 * ══════════════════════════════════════════════════════════════════════════
 * The spec's own words: "No scripting language. Visual editor only." That constraint
 * is honoured structurally rather than by discipline — a condition is a typed record
 * with a variable, an operator and a literal, so there is nothing to parse, nothing to
 * evaluate dynamically and nothing to sandbox. A user cannot write `{{Salary}} * 2`
 * because the model has no place to put it.
 *
 * The alternative — a small expression string with a parser — is how template engines
 * acquire a security review. It also makes "what does this letter depend on?"
 * unanswerable without running the parser, whereas here it is a field lookup.
 *
 * ── NESTING IS A TREE OF GROUPS, NOT PARENTHESES ─────────────────────────
 * "Nested conditions" from the spec are expressed as a `group` node holding children
 * combined by `all` or `any`. That gives the full power of nested AND/OR with no
 * precedence rules to explain and no ambiguity to render — a tree draws itself, an
 * expression needs brackets the author has to reason about.
 *
 * ── A BROKEN CONDITION SHOWS ITS CONTENT ────────────────────────────────
 * Every failure path returns `true`. A condition naming a variable this build no
 * longer declares, or carrying a malformed operator, must NOT silently delete a
 * paragraph from an official letter — content vanishing without explanation is far
 * worse than content appearing that should have been hidden. The validation engine
 * reports the broken condition; the renderer keeps the text.
 */

import { findVariable } from './variableCatalog';
import { type ResolvedVariables } from './variableResolver';

/** What a leaf condition asks. Ten operators, no arithmetic. */
export type ConditionOperator =
  | 'exists'
  | 'notExists'
  | 'equals'
  | 'notEquals'
  | 'contains'
  | 'notContains'
  | 'greaterThan'
  | 'lessThan'
  | 'isEmpty'
  | 'isNotEmpty';

export const CONDITION_OPERATORS: readonly ConditionOperator[] = [
  'exists',
  'notExists',
  'equals',
  'notEquals',
  'contains',
  'notContains',
  'greaterThan',
  'lessThan',
  'isEmpty',
  'isNotEmpty',
];

export const CONDITION_OPERATOR_LABELS_AR: Readonly<Record<ConditionOperator, string>> = {
  exists: 'موجود',
  notExists: 'غير موجود',
  equals: 'يساوي',
  notEquals: 'لا يساوي',
  contains: 'يحتوي على',
  notContains: 'لا يحتوي على',
  greaterThan: 'أكبر من',
  lessThan: 'أصغر من',
  isEmpty: 'فارغ',
  isNotEmpty: 'غير فارغ',
};

/** Operators that take no comparison value — the editor hides the value field. */
export const UNARY_OPERATORS: readonly ConditionOperator[] = [
  'exists',
  'notExists',
  'isEmpty',
  'isNotEmpty',
];

export function isUnaryOperator(operator: ConditionOperator): boolean {
  return UNARY_OPERATORS.includes(operator);
}

/** One test against one variable. */
export interface ConditionLeaf {
  readonly kind: 'leaf';
  /** A catalogued variable name. */
  readonly variable: string;
  readonly operator: ConditionOperator;
  /** The literal compared against. Ignored by the unary operators. */
  readonly value?: string;
}

/** A combination of conditions. `all` is AND, `any` is OR. */
export interface ConditionGroup {
  readonly kind: 'group';
  readonly combine: 'all' | 'any';
  readonly children: readonly Condition[];
}

export type Condition = ConditionLeaf | ConditionGroup;

/**
 * Numeric comparison, when both sides look numeric.
 *
 * `{{Salary}}` resolves to a formatted string — "1,250.000 د.ك" — so a naive
 * `>` would compare text and answer nonsense. Digits, separators and the decimal
 * point are extracted before comparing; anything else fails to parse and the
 * comparison falls back to a string one, which is the honest result for
 * `{{Department}} > "x"`.
 */
function numeric(value: string): number | null {
  // The FIRST number in the string, thousands separators removed.
  //
  // Stripping every non-digit is the obvious implementation and it is wrong: the
  // currency suffix «د.ك» contributes a second decimal point, so «1,250.000 د.ك»
  // becomes "1250.000." and parses as NaN. Matching a number instead reads the figure
  // and ignores whatever the formatter put around it.
  const match = value.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Evaluate one leaf. */
function evaluateLeaf(leaf: ConditionLeaf, resolved: ResolvedVariables): boolean {
  // A condition on a variable this build does not declare shows its content — see the
  // file header for why every failure path is permissive.
  if (!findVariable(leaf.variable)) return true;

  const actual = resolved[leaf.variable] ?? null;
  const has = actual !== null && actual.trim().length > 0;
  const expected = (leaf.value ?? '').trim();

  switch (leaf.operator) {
    case 'exists':
    case 'isNotEmpty':
      return has;
    case 'notExists':
    case 'isEmpty':
      return !has;

    case 'equals':
      return has && actual!.trim() === expected;
    case 'notEquals':
      return !has || actual!.trim() !== expected;

    case 'contains':
      return has && actual!.includes(expected);
    case 'notContains':
      return !has || !actual!.includes(expected);

    case 'greaterThan':
    case 'lessThan': {
      if (!has) return false;
      const left = numeric(actual!);
      const right = numeric(expected);
      if (left === null || right === null) {
        // Not numeric on both sides — fall back to a lexical comparison rather than
        // returning `true`, because "greater than" on text is a defensible answer and
        // silently showing everything is not.
        return leaf.operator === 'greaterThan' ? actual!.trim() > expected : actual!.trim() < expected;
      }
      return leaf.operator === 'greaterThan' ? left > right : left < right;
    }

    default:
      // An operator this build does not know. Permissive, as above.
      return true;
  }
}

/**
 * Evaluate a condition tree.
 *
 * An EMPTY group is `true`: a group the author has created but not yet filled must not
 * hide its content while they are still building it.
 */
export function evaluateCondition(condition: Condition | undefined | null, resolved: ResolvedVariables): boolean {
  if (!condition) return true;

  if (condition.kind === 'group') {
    if (condition.children.length === 0) return true;
    return condition.combine === 'all'
      ? condition.children.every((child) => evaluateCondition(child, resolved))
      : condition.children.some((child) => evaluateCondition(child, resolved));
  }

  return evaluateLeaf(condition, resolved);
}

/** Every variable a condition tree reads — for dependency reporting and validation. */
export function conditionVariables(condition: Condition | undefined | null): string[] {
  if (!condition) return [];
  if (condition.kind === 'leaf') return [condition.variable];
  return [...new Set(condition.children.flatMap(conditionVariables))];
}

/** How many leaves a tree holds. Shown on the block's condition badge. */
export function conditionSize(condition: Condition | undefined | null): number {
  if (!condition) return 0;
  if (condition.kind === 'leaf') return 1;
  return condition.children.reduce((total, child) => total + conditionSize(child), 0);
}

/**
 * A one-line description, for the badge's tooltip and the Layers panel.
 *
 * Built from the catalogue's Arabic labels rather than the raw token names, so an
 * author reads "يظهر إذا: الراتب أكبر من 0" rather than "Salary greaterThan 0".
 */
export function describeCondition(condition: Condition | undefined | null): string {
  if (!condition) return '';

  if (condition.kind === 'group') {
    const joiner = condition.combine === 'all' ? ' و ' : ' أو ';
    const parts = condition.children.map(describeCondition).filter((part) => part.length > 0);
    if (parts.length === 0) return '';
    return parts.length === 1 ? parts[0] : `(${parts.join(joiner)})`;
  }

  const label = findVariable(condition.variable)?.labelAr ?? condition.variable;
  const operator = CONDITION_OPERATOR_LABELS_AR[condition.operator] ?? condition.operator;
  return isUnaryOperator(condition.operator)
    ? `${label} ${operator}`
    : `${label} ${operator} «${condition.value ?? ''}»`;
}

/** A fresh leaf, for the editor's "add condition" button. */
export function createLeaf(variable: string): ConditionLeaf {
  return { kind: 'leaf', variable, operator: 'exists' };
}

/** A fresh group wrapping an existing condition — the editor's "add nesting". */
export function createGroup(combine: 'all' | 'any', children: readonly Condition[] = []): ConditionGroup {
  return { kind: 'group', combine, children };
}

/**
 * Structural validity, for the integrity check.
 *
 * Returns the problems rather than a boolean, for the same reason
 * `validateBlockDocument` does: "invalid" is not actionable and "leaf names variable
 * `Foo`, which the catalogue does not declare" is.
 */
export function validateCondition(condition: Condition | undefined | null, path = 'الشرط'): string[] {
  if (!condition) return [];

  if (condition.kind === 'group') {
    if (condition.combine !== 'all' && condition.combine !== 'any') {
      return [`${path}: طريقة دمج غير معروفة «${String(condition.combine)}».`];
    }
    if (!Array.isArray(condition.children)) return [`${path}: قائمة الشروط الفرعية غير صالحة.`];
    return condition.children.flatMap((child, index) => validateCondition(child, `${path} › ${index + 1}`));
  }

  const problems: string[] = [];
  if (!findVariable(condition.variable)) {
    problems.push(`${path}: المتغيّر «${condition.variable}» غير معروف.`);
  }
  if (!CONDITION_OPERATORS.includes(condition.operator)) {
    problems.push(`${path}: عامل مقارنة غير معروف «${String(condition.operator)}».`);
  }
  if (!isUnaryOperator(condition.operator) && (condition.value ?? '').trim().length === 0) {
    problems.push(`${path}: العامل «${CONDITION_OPERATOR_LABELS_AR[condition.operator] ?? condition.operator}» يحتاج قيمة للمقارنة.`);
  }
  return problems;
}
