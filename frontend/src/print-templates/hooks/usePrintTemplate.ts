import type { PrintTemplateCategory, PrintTemplateDefinition } from '../engine/types';
import { getPrintTemplate, getPrintTemplates, getDefaultPrintTemplate, getLetterheadVariant } from '../engine/registry';
import { usePrintProfile } from './usePrintProfile';
import type { PrintProfile } from './usePrintProfile';

// ─── Return type ──────────────────────────────────────────────────────────────

export interface UsePrintTemplateResult<TData = unknown> {
  /** All registered templates for the category (for building a picker UI) */
  templates: PrintTemplateDefinition[];
  /** The active template based on the current profile */
  activeTemplate: PrintTemplateDefinition;
  /**
   * If profile.paperType is "letterhead" and a blank variant exists,
   * this is the blank-letterhead template.  Otherwise equals activeTemplate.
   */
  resolvedTemplate: PrintTemplateDefinition;
  /** Current persisted profile */
  profile: PrintProfile;
  /** Update the persisted profile */
  setProfile: (p: PrintProfile) => void;
  /**
   * Pass-through of the `data` argument so call sites can write:
   *   const { resolvedTemplate, data } = usePrintTemplate('invoice', invoiceData);
   *   <resolvedTemplate.component data={data} />
   */
  data: TData | undefined;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Combines profile persistence + registry lookup into a single hook for
 * production pages to consume in Phase 2.
 *
 * @param category  - Template category: 'invoice' | 'quotation' | 'purchase-order' | 'rfq'
 * @param data      - Typed print data from the relevant adapter (optional — Phase 2 passes real data)
 *
 * Usage (Phase 2):
 * ```tsx
 * const invoice = await api.get<ApiInvoice>(`/invoices/${id}`);
 * const printData = adaptInvoice(invoice.data.data);
 *
 * const { resolvedTemplate, data, profile, setProfile } =
 *   usePrintTemplate('invoice', printData);
 *
 * const Template = resolvedTemplate.component;
 * return <Template data={data} />;
 * ```
 */
export function usePrintTemplate<TData = unknown>(
  category: PrintTemplateCategory,
  data?: TData,
): UsePrintTemplateResult<TData> {
  const [profile, setProfile] = usePrintProfile(category);
  const templates = getPrintTemplates(category);

  const activeTemplate: PrintTemplateDefinition =
    getPrintTemplate(category, profile.templateId) ??
    (() => {
      try {
        return getDefaultPrintTemplate(category);
      } catch {
        // Last resort: first registered template of any category.
        // Only reachable when the registry is completely empty (build config error).
        const fallback = getPrintTemplates()[0];
        if (fallback) return fallback;
        throw new Error('[PrintEngine] No templates registered — build configuration error');
      }
    })();

  const resolvedTemplate =
    profile.paperType === 'letterhead'
      ? (getLetterheadVariant(category, activeTemplate.id) ?? activeTemplate)
      : activeTemplate;

  return {
    templates,
    activeTemplate,
    resolvedTemplate,
    profile,
    setProfile,
    data,
  };
}
