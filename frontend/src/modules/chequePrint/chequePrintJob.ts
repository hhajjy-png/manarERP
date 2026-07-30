/**
 * Cheque printing — the RESOLVED PRINT JOB (Deterministic Geometry & Unified
 * Pipeline Pack v1).
 *
 * ONE contract that binds together the four things that previously drifted apart:
 *
 *     template resolution + runtime data + paper geometry + Electron print options
 *
 * Single print, batch print and test print all build the SAME `ChequePrintJob`
 * and hand it to the same renderer and the same print call. Nothing downstream
 * re-resolves a template, re-derives a page, or invents print options.
 *
 * This is deliberately a thin, pure model — not a second print engine. The
 * Runtime Engine still resolves the render model; this only decides WHICH
 * template, WHICH data, and WHICH physical page that engine is invoked with.
 */
import type { DesignerField, DesignerSurfaceSpec } from '../chequeTemplateDesigner';
import type { RuntimeData } from '../chequeTemplateRuntime';
import { physicalPageFor, type ChequePaperKind, type PhysicalPageSpec } from './physicalPage';

/**
 * Why a job exists. Production jobs record print tracking; a test print never
 * touches a cheque's printed status, printCount, or print log.
 */
export type ChequePrintPurpose = 'production' | 'test';

/** Identity of the template a job resolved to — carried so it can be reported and asserted. */
export interface ResolvedTemplateRef {
  /** Stored template id, or null for an unsaved in-designer template (test prints only). */
  id: string | null;
  name: string;
  /** How the template was chosen — the audit trail for "which template printed this?". */
  source: 'default-template' | 'designer-open-template';
}

/** The tracking identity a production job carries. Absent for unsaved drafts and test prints. */
export interface ChequeTrackingRef {
  id: number;
  status: string;
  chequeNumber: string;
  beneficiaryName: string;
}

export interface ChequePrintJob {
  purpose: ChequePrintPurpose;
  template: ResolvedTemplateRef;
  surface: DesignerSurfaceSpec;
  fields: DesignerField[];
  paperMode: ChequePaperKind;
  /** The resolved physical page — a pure function of `surface` + `paperMode`. */
  physicalPage: PhysicalPageSpec;
  /** Per-cheque runtime values. The ONLY thing allowed to vary across a batch. */
  items: ChequePrintItem[];
}

export interface ChequePrintItem {
  runtimeData: RuntimeData;
  /** Production only. A test print carries none, so tracking can never fire. */
  tracking?: ChequeTrackingRef;
}

export interface BuildChequePrintJobInput {
  purpose: ChequePrintPurpose;
  template: ResolvedTemplateRef;
  surface: DesignerSurfaceSpec;
  fields: DesignerField[];
  paperMode: ChequePaperKind;
  items: ChequePrintItem[];
}

/**
 * Build the resolved job.
 *
 * The geometry invariant lives here: `surface`, `fields`, `paperMode` and
 * `physicalPage` are resolved ONCE for the whole job and shared by every item,
 * so a batch cannot drift item to item and a batch item is byte-identical in
 * geometry to the same cheque printed singly. Only `runtimeData` varies.
 *
 * Tracking references are stripped from test prints structurally, so a test
 * print cannot mark a cheque printed even if a caller passes tracking by mistake.
 */
export function buildChequePrintJob(input: BuildChequePrintJobInput): ChequePrintJob {
  const items = input.purpose === 'test'
    ? input.items.map(({ runtimeData }) => ({ runtimeData }))
    : input.items;
  return {
    purpose: input.purpose,
    template: input.template,
    surface: input.surface,
    fields: input.fields,
    paperMode: input.paperMode,
    physicalPage: physicalPageFor(input.surface, input.paperMode),
    items,
  };
}
