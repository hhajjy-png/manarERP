import type { PrintTemplateCategory, PrintTemplateDefinition } from './types';
import { invoiceTemplateDefinitions } from './invoiceTemplates';
import { quotationTemplateDefinitions } from './quotationTemplates';
import { purchaseOrderTemplateDefinitions } from './purchaseOrderTemplates';
import { rfqTemplateDefinitions } from './rfqTemplates';

const ALL_TEMPLATES: PrintTemplateDefinition[] = [
  ...invoiceTemplateDefinitions,
  ...quotationTemplateDefinitions,
  ...purchaseOrderTemplateDefinitions,
  ...rfqTemplateDefinitions,
];

/**
 * Returns all registered templates, optionally filtered by category.
 *
 * @example
 * getPrintTemplates()              // all 26 templates
 * getPrintTemplates('invoice')     // 10 invoice templates
 */
export function getPrintTemplates(category?: PrintTemplateCategory): PrintTemplateDefinition[] {
  if (!category) return ALL_TEMPLATES;
  return ALL_TEMPLATES.filter((t) => t.category === category);
}

/**
 * Returns the template matching the given category and id, or undefined.
 *
 * @example
 * getPrintTemplate('invoice', 'invoice-design-1')
 */
export function getPrintTemplate(
  category: PrintTemplateCategory,
  id: string,
): PrintTemplateDefinition | undefined {
  return ALL_TEMPLATES.find((t) => t.category === category && t.id === id);
}

/**
 * Returns the first original-variant template for the given category.
 * Throws if no template exists for the category (configuration error).
 *
 * @example
 * getDefaultPrintTemplate('invoice')  // InvoiceDesign1
 */
export function getDefaultPrintTemplate(category: PrintTemplateCategory): PrintTemplateDefinition {
  const template = ALL_TEMPLATES.find(
    (t) => t.category === category && t.variant === 'original',
  );
  if (template) return template;

  // Fallback: any template in the category (e.g. only blank-letterhead variants remain)
  const anyInCategory = ALL_TEMPLATES.find((t) => t.category === category);
  if (anyInCategory) {
    console.error(`[PrintEngine] No original-variant template for "${category}" — using first available.`);
    return anyInCategory;
  }

  // Only reachable if the category was never registered — a build-time configuration error.
  throw new Error(`[PrintEngine] No templates registered for category: ${category}`);
}

/**
 * Given an original template id, returns its blank-letterhead counterpart if one exists.
 *
 * Convention: blank id = original id + "-blank"
 *
 * @example
 * getLetterheadVariant('invoice', 'invoice-design-2')
 * // → PrintTemplateDefinition for 'invoice-design-2-blank'
 */
export function getLetterheadVariant(
  category: PrintTemplateCategory,
  originalId: string,
): PrintTemplateDefinition | undefined {
  const blankId = `${originalId}-blank`;
  return ALL_TEMPLATES.find((t) => t.category === category && t.id === blankId);
}
