/**
 * Letter Engine — the rule set.
 *
 * Assembles every implemented rule into a registry. One place to see what the engine
 * can currently check, and one place a future pack adds to.
 *
 * ── EVERY SELECTED RULE NOW HAS AN IMPLEMENTATION ────────────────────────
 * `E7_barcodePayloadCapacity` and `W4_signatureAssetMissing` arrived with P7, once the
 * payload builder and the branding registry existed for them to read.
 *
 * The two that remained — `E9_referenceIntegrity` and `W7_sparseManualPageBreak` — were
 * DESELECTED from the template rather than implemented, and the reasoning is recorded
 * in `templateRegistry.ts` beside the selection. In short: one requires a server
 * round-trip this engine is architecturally forbidden from making, and the other
 * checks a feature that does not exist. Neither was providing safety; both were
 * permanently withholding `readyForPrinting`.
 *
 * The guarantee is unchanged and still load-bearing: `runValidation` reports every
 * selected rule with no implementation, and `summarise` refuses `readyForPrinting`
 * while any remain — so an unfinished engine can never present itself as a clean bill
 * of health.
 */

import { type ValidationRuleRegistry, createValidationRuleRegistry } from '../framework';
import { BRANDING_RULES } from './brandingRules';
import { DOCUMENT_RULES } from './documentRules';
import {
  contentOutsidePageRule,
  impossibleGeometryRule,
  negativePositionRule,
  reservedZoneOverlapRule,
} from './geometryRules';
import {
  documentPageCountRule,
  lastPageNearlyFullRule,
  oversizedParagraphRule,
  pageCapRule,
  pageCountAdvisoryRule,
  reservedElementPlacementRule,
  signatureOrphanRule,
} from './layoutRules';

/** Every rule this build implements. */
export const IMPLEMENTED_RULES = [
  ...DOCUMENT_RULES,
  // Barcode payload and branding selection — added with P7.
  ...BRANDING_RULES,
  // Safe zones and page boundaries.
  reservedZoneOverlapRule,
  contentOutsidePageRule,
  negativePositionRule,
  impossibleGeometryRule,
  // Layout-derived.
  oversizedParagraphRule,
  signatureOrphanRule,
  reservedElementPlacementRule,
  pageCapRule,
  pageCountAdvisoryRule,
  lastPageNearlyFullRule,
  documentPageCountRule,
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
