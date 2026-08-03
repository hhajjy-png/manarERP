/**
 * Letter Engine — the print pipeline.
 *
 *     Prepare  →  Validate  →  Compose  →  Print
 *
 * Four stages, each a separate exported function so each can be tested on its own.
 * The first three are PURE; only `print` touches the platform, and it takes the
 * platform as an argument so even that is testable.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE PIPELINE COMPUTES NOTHING THE DOCUMENT ALREADY KNOWS.
 * ══════════════════════════════════════════════════════════════════════════
 * It does not paginate — it receives the layout. It does not measure — heights were
 * measured once, on screen. It does not validate — it receives the validation result
 * and reads its verdict. Every stage is a decision about whether and how to print, not
 * a recomputation of what to print.
 *
 * ── FAILURES ARE STRUCTURED, NEVER SILENT ────────────────────────────────
 * Every stage returns a discriminated outcome carrying the stage, a machine-readable
 * code, an Arabic message and — for a validation refusal — the blocking findings
 * themselves. Nothing returns a bare boolean, and nothing swallows a fault.
 *
 * ── NOTHING HERE MUTATES THE DOCUMENT ────────────────────────────────────
 * No stage writes to the block model, the sections or any registry. Printing a letter
 * leaves it byte-identical, which is why print can never be the thing that corrupts a
 * draft.
 */

import { type PageGeometry, type PrintProfileId } from '../registry/geometryRegistry';
import { type LayoutVersion } from '../versioning/versions';
import { type PaginationResult } from '../pagination/paginate';
import {
  type ValidationIssue,
  type ValidationResult,
  type ValidationSummary,
  getBlockingIssues,
} from '../validation/framework';
import { type PrintableDocument, buildPrintableDocument } from './printModel';

/** Which stage a failure came from. */
export type PrintStage = 'prepare' | 'validate' | 'compose' | 'print';

/** Machine-readable failure causes. */
export type PrintErrorCode =
  | 'NO_PAGES'
  | 'BLOCKING_ISSUES'
  | 'INCOMPLETE_VALIDATION'
  | 'LAYOUT_MISMATCH'
  | 'PLATFORM_UNAVAILABLE'
  | 'PRINT_CANCELLED'
  | 'PRINT_FAILED';

/** A structured failure. Never a bare string, never a silent `false`. */
export interface PrintError {
  readonly stage: PrintStage;
  readonly code: PrintErrorCode;
  /** Arabic, user-facing. */
  readonly message: string;
  /** Present for a validation refusal — the findings that caused it. */
  readonly blockingIssues?: readonly ValidationIssue[];
  /** The platform's own reason, where it gave one. */
  readonly cause?: string;
}

export type PrintOutcome<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: PrintError };

function fail(stage: PrintStage, code: PrintErrorCode, message: string, extra: Partial<PrintError> = {}): PrintOutcome<never> {
  return { ok: false, error: { stage, code, message, ...extra } };
}

/* ── 1. Prepare ─────────────────────────────────────────────────────────── */

export interface PrepareInput {
  readonly pagination: PaginationResult;
  readonly geometry: PageGeometry;
  readonly profileId: PrintProfileId;
  readonly layoutVersion: LayoutVersion;
}

/**
 * Project the existing layout into printable pages.
 *
 * The layout arrives as an argument precisely so this stage cannot re-derive it. A
 * document with no pages is refused rather than printed blank — an empty sheet leaving
 * the printer looks like a fault the user cannot diagnose.
 */
export function prepare(input: PrepareInput): PrintOutcome<PrintableDocument> {
  if (input.pagination.pageCount === 0 || input.pagination.pages.length === 0) {
    return fail('prepare', 'NO_PAGES', 'لا توجد صفحات للطباعة.');
  }
  return {
    ok: true,
    value: buildPrintableDocument(input.pagination, input.geometry, input.profileId, input.layoutVersion),
  };
}

/* ── 2. Validate ────────────────────────────────────────────────────────── */

/**
 * The gate.
 *
 * Printing proceeds only when the document is ready — no blocking findings AND every
 * selected rule actually ran. There is no override and no automatic repair: the engine
 * does not decide how to fix an official letter, it declines to print one that is
 * wrong.
 *
 * The two refusals are reported separately on purpose. "This letter has an error" and
 * "we could not finish checking this letter" are different situations and deserve
 * different words.
 */
export function validateForPrint(
  summary: ValidationSummary,
  result: ValidationResult,
): PrintOutcome<ValidationSummary> {
  const blocking = getBlockingIssues(result);

  if (blocking.length > 0) {
    return fail(
      'validate',
      'BLOCKING_ISSUES',
      `لا يمكن الطباعة: ${blocking.length} خطأ مانع في المستند.`,
      { blockingIssues: blocking },
    );
  }
  if (summary.unimplementedCount > 0) {
    return fail(
      'validate',
      'INCOMPLETE_VALIDATION',
      `لا يمكن الطباعة: ${summary.unimplementedCount} قاعدة تحقّق لم تُنفَّذ بعد، فلا يمكن اعتبار المستند مكتمل التحقّق.`,
    );
  }
  if (!summary.readyForPrinting) {
    // Defensive: the two branches above should already cover every unready case, and
    // a summary that says otherwise means the two have drifted.
    return fail('validate', 'BLOCKING_ISSUES', 'لا يمكن الطباعة: المستند غير جاهز.');
  }
  return { ok: true, value: summary };
}

/* ── 3. Compose ─────────────────────────────────────────────────────────── */

/** What the print stage is handed. */
export interface ComposedPrintJob {
  readonly document: PrintableDocument;
  /** Document title for the platform's print dialog. */
  readonly title: string;
  /** Sheets to be produced — carried explicitly so a caller can report it. */
  readonly pageCount: number;
}

/**
 * Bind the printable document to a print job.
 *
 * Deliberately thin, and deliberately NOT a renderer. There is no HTML built here, no
 * node cloned and no second document assembled: the pages are already in the DOM,
 * rendered by the one renderer the engine has. Composing means describing the job, not
 * producing the artefact.
 *
 * It re-checks the projection against the layout it came from, so a future change that
 * made the two disagree fails loudly at compose time instead of quietly on paper.
 */
export function compose(
  printable: PrintableDocument,
  pagination: PaginationResult,
  title: string,
): PrintOutcome<ComposedPrintJob> {
  if (printable.pageCount !== pagination.pageCount) {
    return fail(
      'compose',
      'LAYOUT_MISMATCH',
      'تعذّرت الطباعة: تخطيط الطباعة لا يطابق تخطيط الشاشة.',
    );
  }
  return { ok: true, value: { document: printable, title, pageCount: printable.pageCount } };
}

/* ── 4. Print ───────────────────────────────────────────────────────────── */

/** What the platform reports back. Mirrors the app's existing print bridge. */
export interface PlatformPrintResult {
  readonly outcome: 'success' | 'cancelled' | 'error' | 'unknown';
  readonly failureReason?: string;
}

/**
 * The platform that actually prints.
 *
 * Injected rather than imported so the pipeline stays testable and so the engine holds
 * no opinion about whether it is running under Electron or a browser.
 */
export interface PrintPlatform {
  print(job: ComposedPrintJob): Promise<PlatformPrintResult>;
}

/**
 * Hand the job to the platform.
 *
 * A cancellation is reported as its own code: the user changing their mind is not a
 * fault, and telling them "printing failed" when they pressed Cancel is how a program
 * loses their trust.
 */
export async function print(
  job: ComposedPrintJob,
  platform: PrintPlatform | null,
): Promise<PrintOutcome<PlatformPrintResult>> {
  if (!platform) {
    return fail('print', 'PLATFORM_UNAVAILABLE', 'تعذّرت الطباعة: لا توجد خدمة طباعة متاحة.');
  }

  let result: PlatformPrintResult;
  try {
    result = await platform.print(job);
  } catch (error) {
    return fail('print', 'PRINT_FAILED', 'تعذّرت الطباعة بسبب خطأ غير متوقع.', {
      cause: error instanceof Error ? error.message : String(error),
    });
  }

  if (result.outcome === 'cancelled') {
    return fail('print', 'PRINT_CANCELLED', 'أُلغيت الطباعة.');
  }
  if (result.outcome === 'error') {
    return fail('print', 'PRINT_FAILED', 'تعذّرت الطباعة.', { cause: result.failureReason });
  }
  return { ok: true, value: result };
}

/* ── The whole pipeline ─────────────────────────────────────────────────── */

export interface RunPrintInput extends PrepareInput {
  readonly validation: ValidationResult;
  readonly summary: ValidationSummary;
  readonly title: string;
  readonly platform: PrintPlatform | null;
}

export interface PrintSuccess {
  readonly job: ComposedPrintJob;
  readonly platformResult: PlatformPrintResult;
}

/**
 * Run all four stages in order, stopping at the first failure.
 *
 * The order is not arbitrary: PREPARE before VALIDATE so a document with no pages is
 * refused for the honest reason rather than as a validation problem, and VALIDATE
 * before COMPOSE so a document that must not print is never composed at all.
 */
export async function runPrintPipeline(input: RunPrintInput): Promise<PrintOutcome<PrintSuccess>> {
  const prepared = prepare(input);
  if (!prepared.ok) return prepared;

  const validated = validateForPrint(input.summary, input.validation);
  if (!validated.ok) return validated;

  const composed = compose(prepared.value, input.pagination, input.title);
  if (!composed.ok) return composed;

  const printed = await print(composed.value, input.platform);
  if (!printed.ok) return printed;

  return { ok: true, value: { job: composed.value, platformResult: printed.value } };
}
