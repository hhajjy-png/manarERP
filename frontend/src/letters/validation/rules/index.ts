/**
 * Letter Engine — the rule set.
 *
 * Assembles every implemented rule into a registry. One place to see what the engine
 * can currently check, and one place a future pack adds to.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  FORM EDITOR UX REBUILD v2 — THREE RULES, DOWN FROM TWENTY-FIVE.
 * ══════════════════════════════════════════════════════════════════════════
 * The editor now assists rather than refuses. Every rule that protected an editorial
 * convention — a missing subject, an empty body, an unresolved variable, a page count,
 * a stray font — was deleted rather than deselected: the product decision is that none
 * of them should exist any more, not merely that this template declines to run them.
 * Their implementation files, their catalogue entries and their ids are gone.
 *
 * What remains protects the one thing an author cannot see going wrong: content
 * landing on ink already printed on the paper, and a print profile whose numbers
 * cannot describe a real page.
 *
 *   · `E4_reservedZoneOverlap`   — flow content vs. the reserved bands.
 *   · `E16_objectInReservedZone` — a positioned object vs. the reserved bands.
 *   · `E13_impossibleGeometry`   — a stability guard, not a document rule.
 */

import { type ValidationRuleRegistry, createValidationRuleRegistry } from '../framework';
import { impossibleGeometryRule, reservedZoneOverlapRule } from './geometryRules';
import { objectInReservedZoneRule } from './layoutObjectRules';

/** Every rule this build implements. */
export const IMPLEMENTED_RULES = [
  reservedZoneOverlapRule,
  impossibleGeometryRule,
  objectInReservedZoneRule,
] as const;

/**
 * Build a registry with every implemented rule.
 *
 * A fresh registry per call rather than a shared singleton: a module-level registry
 * would carry state between tests and between documents, and registering twice throws
 * by design.
 */
export function createLetterValidationRegistry(): ValidationRuleRegistry {
  const registry = createValidationRuleRegistry();
  for (const rule of IMPLEMENTED_RULES) registry.register(rule);
  return registry;
}
