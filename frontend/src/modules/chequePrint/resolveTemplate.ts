/**
 * Cheque printing — the DEFAULT TEMPLATE contract (Deterministic Geometry &
 * Unified Pipeline Pack v1).
 *
 * Production cheque printing has exactly ONE template source: the template the
 * user explicitly flagged as default.
 *
 * WHAT THIS REPLACES
 * ──────────────────
 * Every production entry point previously resolved its template as:
 *
 *     getDefaultTemplate() ?? listTemplates()[0]
 *
 * `listTemplates()` sorts by `updatedAt` DESCENDING, so whenever no template was
 * flagged default the fallback silently meant "whichever template was edited most
 * recently". Print cheque A, edit an unrelated template, print cheque B — and B
 * printed with different geometry, with nothing in the UI to indicate it. The
 * fallback is removed outright: no default is an explicit, blocking error, never
 * a guess.
 *
 * Determinism properties this gives production printing:
 *   - re-read from storage at every print, so no React state can go stale;
 *   - unaffected by editing, saving or renaming any OTHER template;
 *   - unaffected by print order, batch position, or navigating away and back;
 *   - persists across restart (the flag lives in the stored template record).
 */
import type { StoredChequeTemplate } from '../../components/chequeTemplateManager/chequeDesignerStore';
import type { ResolvedTemplateRef } from './chequePrintJob';

/** Shown when production printing is attempted with no default template flagged. */
export const DEFAULT_TEMPLATE_MISSING_MESSAGE =
  'لا يوجد قالب شيك افتراضي. عيّن قالبًا افتراضيًا قبل الطباعة.';

export type TemplateResolution =
  | { ok: true; template: StoredChequeTemplate; ref: ResolvedTemplateRef }
  | { ok: false; message: string };

/**
 * Resolve the template for a PRODUCTION cheque print.
 *
 * `getDefault` is injected rather than imported so the resolution is a pure
 * function of what storage returns — which is what makes it directly testable
 * and what lets callers re-read at click time.
 */
export function resolveDefaultPrintTemplate(
  getDefault: () => StoredChequeTemplate | null,
): TemplateResolution {
  const template = getDefault();
  if (!template) return { ok: false, message: DEFAULT_TEMPLATE_MISSING_MESSAGE };
  return {
    ok: true,
    template,
    ref: { id: template.id, name: template.name, source: 'default-template' },
  };
}
