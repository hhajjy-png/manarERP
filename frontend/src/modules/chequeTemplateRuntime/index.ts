/**
 * Cheque Template Runtime Engine — public API barrel (v1).
 *
 * A UI-independent engine that resolves a stored cheque template + runtime data
 * into a fully-resolved render model. It is the intended single rendering
 * source for future Preview, Printing, and PDF export. It knows nothing about
 * printers, dialogs, or React, and is not wired into any of them in this pack.
 */

export {
  resolveChequeTemplate,
  resolveRuntimeValues,
  resolveFieldText,
  defaultBindingResolver,
  isSemanticKey,
} from './runtimeEngine';

export { MOCK_RUNTIME_DATA } from './mockRuntimeData';

export {
  SEMANTIC_KEYS,
  type SemanticKey,
  type RuntimeData,
  type RuntimeTemplateInput,
  type RenderIssue,
  type RenderIssueCode,
  type RenderIssueSeverity,
  type ResolvedGeometry,
  type ResolvedFont,
  type ResolvedRenderField,
  type ResolvedSurface,
  type ResolvedRenderModel,
} from './runtimeTypes';
