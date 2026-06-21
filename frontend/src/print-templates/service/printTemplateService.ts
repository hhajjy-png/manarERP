/**
 * Print Template Service — the authoritative lookup API for production pages.
 *
 * Phase 2 production pages should call this service instead of importing raw
 * registry functions directly.  Wrapping the registry here gives one place to
 * add caching, logging, or feature-flag gating in the future without touching
 * every call site.
 */

import type {
  PrintTemplateCategory,
  PrintTemplateDefinition,
} from '../engine/types';
import {
  getPrintTemplates,
  getPrintTemplate,
  getDefaultPrintTemplate,
  getLetterheadVariant,
} from '../engine/registry';
import type { PrintPaperType } from '../storage/printProfileStorage';

// ─── Service functions ────────────────────────────────────────────────────────

/**
 * Returns all registered templates, optionally filtered by category.
 *
 * @example
 * listTemplates()              // all 26 templates
 * listTemplates('invoice')     // 10 invoice templates
 */
export function listTemplates(category?: PrintTemplateCategory): PrintTemplateDefinition[] {
  return getPrintTemplates(category);
}

/**
 * Returns a single template by category and id, or `undefined` if not found.
 *
 * @example
 * findTemplate('invoice', 'invoice-design-2')
 */
export function findTemplate(
  category: PrintTemplateCategory,
  id: string,
): PrintTemplateDefinition | undefined {
  return getPrintTemplate(category, id);
}

/**
 * Returns the default (first original-variant) template for a category.
 * Throws if no template is registered for the category — this is a config error.
 *
 * @example
 * getDefaultTemplate('invoice')  // InvoiceDesign1 definition
 */
export function getDefaultTemplate(category: PrintTemplateCategory): PrintTemplateDefinition {
  return getDefaultPrintTemplate(category);
}

/**
 * Resolves the correct template definition for a saved print profile.
 *
 * - If `templateId` matches a registered template, that template is used.
 * - If `templateId` is unknown (e.g. a deleted design), falls back to the category default.
 * - If `paperType` is `'letterhead'`, resolves to the blank-letterhead variant if one exists;
 *   otherwise returns the original variant (silently — the caller may warn the user).
 *
 * This is the single function Phase 2 pages call to get the component to render:
 *
 * ```ts
 * const template = resolveTemplateForProfile('invoice', profile.templateId, profile.paperType);
 * const Template = template.component;
 * return <Template data={printData} />;
 * ```
 */
export function resolveTemplateForProfile(
  category: PrintTemplateCategory,
  templateId: string,
  paperType: PrintPaperType,
): PrintTemplateDefinition {
  const base =
    getPrintTemplate(category, templateId) ?? getDefaultPrintTemplate(category);

  if (paperType === 'letterhead') {
    return getLetterheadVariant(category, base.id) ?? base;
  }

  return base;
}
