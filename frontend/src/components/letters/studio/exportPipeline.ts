/**
 * Letter Engine — Smart Export (Professional Document Automation v1).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  NO NEW ENGINE. THREE DESTINATIONS, ALL THROUGH MACHINERY THAT ALREADY EXISTS.
 * ══════════════════════════════════════════════════════════════════════════
 * The specification is explicit — "Reuse existing export engines… No new print
 * engine" — and the print pipeline's own header is stricter still: composing "means
 * describing the job, not producing the artefact."
 *
 * So this file adds no renderer and no formatter. It adds a GATE and a router:
 *
 *   · PRINT → `runPrintPipeline`, untouched. The physical press.
 *   · PDF   → `composeStyledFromNode` (the app's existing style-capturing composer,
 *             already used by every printable form) handed to `pdf:exportHtml`, the
 *             Electron IPC that renders through Chromium's own printToPDF.
 *   · HTML  → the SAME composed string, written to a file. There is no second
 *             composition: the HTML export and the PDF export are byte-identical
 *             inputs, which is the only way the two can be guaranteed to agree.
 *
 * ── WORD IS NOT OFFERED, AND THAT IS A FINDING RATHER THAN AN OMISSION ───
 * The spec says "Export Word (using the existing architecture only if supported)".
 * It is not supported. `vendor-docx` is bundled for the REPORTS module, which builds
 * documents from tabular data through the `docx` library's own object model — there is
 * no path from a rendered page to a .docx, and writing one would be a second renderer
 * with a second idea of what an official letter looks like. `EXPORT_FORMATS` below
 * records that decision as data rather than leaving the absence to be rediscovered.
 *
 * ── WHY THIS IS A BINDING, NOT PART OF THE ENGINE ────────────────────────
 * It lives beside `useLetterPrint` in `components/letters/studio/` rather than in
 * `letters/printing/`, and the engine's own boundary test is what says so: `src/
 * letters/` may not touch the DOM, may not import the app's printing module, and may
 * not reach outside itself. This file does all three — it clones a live node, calls
 * the shared composer, and creates a Blob.
 *
 * That is the same division `useLetterPrint` already embodies: the PIPELINE is pure
 * and lives in the engine, the PLATFORM binding is impure and lives here. Putting an
 * exporter in the engine would have made the engine depend on a browser.
 *
 * ── EVERY DESTINATION PASSES THE SAME GATE ───────────────────────────────
 * `validateForPrint` already refuses a document with blocking findings. Export uses
 * the identical check, so a letter that cannot be printed cannot be turned into a PDF
 * either — an export path that bypassed validation would be a way to publish a
 * document the engine had refused.
 */

import { composeStyledFromNode } from '../../../printing/composeDocument';
import { type PageGeometry } from '../../../letters/registry/geometryRegistry';
import {
  type PrintError,
  type PrintOutcome,
  validateForPrint,
} from '../../../letters/printing/printPipeline';
import { PAGE_SPECS } from '../../../printing/pageSpec';
import {
  type ValidationResult,
  type ValidationSummary,
} from '../../../letters/validation/framework';

/** Where an export can go. */
export type ExportFormat = 'print' | 'pdf' | 'html';

export interface ExportFormatDescriptor {
  readonly id: ExportFormat | 'docx';
  readonly labelAr: string;
  readonly icon: string;
  /** `false` means the button is shown disabled with `unavailableReasonAr` on it. */
  readonly available: boolean;
  readonly unavailableReasonAr?: string;
}

/**
 * The four destinations the specification names, three of them real.
 *
 * `docx` is listed and disabled rather than omitted, for the same reason `{{Manager}}`
 * is: an author who has been told the feature exists should find out WHY it is greyed
 * rather than wonder whether they have missed a menu.
 */
export const EXPORT_FORMATS: readonly ExportFormatDescriptor[] = [
  { id: 'print', labelAr: 'طباعة', icon: 'print', available: true },
  { id: 'pdf', labelAr: 'تصدير PDF', icon: 'picture_as_pdf', available: true },
  { id: 'html', labelAr: 'تصدير HTML', icon: 'code', available: true },
  {
    id: 'docx',
    labelAr: 'تصدير Word',
    icon: 'description',
    available: false,
    unavailableReasonAr:
      'غير مدعوم بالمعمارية الحالية. مكتبة docx في النظام تبني مستندات من بيانات جدولية ' +
      '(وحدة التقارير)، ولا يوجد مسار من صفحة مرسومة إلى ملف Word — وكتابته يعني محرّك ' +
      'إخراج ثانٍ برأي مختلف في شكل الخطاب الرسمي.',
  },
];

/** Selectors stripped from the clone. Every one of them is chrome, never ink. */
const EXPORT_STRIP_SELECTORS: readonly string[] = [
  '.no-print',
  '.lc-bars',
  '.lc-modes',
  '.lp-measure-layer',
  '.lp-ruler',
  '.lp-grid',
  '.lp-zone',
  '.lp-page-caption',
  '.ls-section-label',
  '.lc-canvas',
  '.dnv-rail',
  '.dsb-bar',
  '.ins-panel',
  '.dpp-panel',
  '.obi-panel',
  '.rev-panel',
  '.lo-placeholder',
];

export interface ExportInput {
  readonly format: ExportFormat;
  /** The live page stack. Cloned by the composer; never mutated. */
  readonly node: HTMLElement;
  readonly geometry: PageGeometry;
  readonly title: string;
  /** Filename without extension. */
  readonly filename: string;
  readonly validation: ValidationResult;
  readonly summary: ValidationSummary;
}

export interface ExportSuccess {
  readonly format: ExportFormat;
  /** Where it went, when the platform said. */
  readonly path?: string;
}

function fail(code: PrintError['code'], message: string, cause?: string): PrintOutcome<never> {
  return { ok: false, error: { stage: 'compose', code, message, cause } };
}

/**
 * Compose the letter as a standalone HTML document.
 *
 * `composeStyledFromNode` is the app's existing composer: it clones the node, captures
 * every stylesheet rule that applies, inlines them, and refuses loudly if it cannot
 * read the styles rather than producing a half-formatted page. That refusal is the
 * reason this is worth reusing instead of serialising `outerHTML` — an export missing
 * its CSS looks like a broken letter, not like a failed export.
 */
function compose(input: ExportInput): string {
  return composeStyledFromNode({
    node: input.node,
    /**
     * A4 with ZERO margins.
     *
     * The shared `a4-portrait` spec carries 12 mm, which is right for a report and
     * wrong here: the letter's sheet is already a real 210 × 297 mm box sized from the
     * Geometry Registry, and a page margin on top of it would shorten the page box
     * below the sheet — every page would spill a strip onto a following blank one and
     * every reserved-zone offset would be out by 12 mm. This is the same `margin: 0`
     * decision `letter-print.css` makes and records at length.
     *
     * The spec is derived from the shared one rather than added to the registry: a new
     * global entry would be a shared change made for one page's benefit.
     */
    pageSpec: {
      ...PAGE_SPECS['a4-portrait'],
      margins: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
    },
    title: input.title,
    lang: 'ar',
    stripSelectors: [...EXPORT_STRIP_SELECTORS],
    forcePageSpec: true,
  });
}

/**
 * Export.
 *
 * The validation gate runs FIRST and identically for every format — see the header for
 * why an export path that skipped it would be a way to publish a document the engine
 * had refused.
 */
export async function runExport(input: ExportInput): Promise<PrintOutcome<ExportSuccess>> {
  const gate = validateForPrint(input.summary, input.validation);
  if (!gate.ok) return gate;

  if (input.format === 'print') {
    // Handled by the caller through `useLetterPrint`, which owns print mode and the
    // render-readiness wait. Routing it through here as well would be a second print
    // path — the exact thing the pipeline forbids.
    return fail('PLATFORM_UNAVAILABLE', 'الطباعة تُنفَّذ عبر مسار الطباعة القائم.');
  }

  let html: string;
  try {
    html = compose(input);
  } catch (error) {
    // `composeStyledFromNode` throws when it cannot read the stylesheets. Passing the
    // reason through rather than replacing it: "could not read the document styles" is
    // actionable, "export failed" is not.
    return fail('PRINT_FAILED', error instanceof Error ? error.message : 'تعذّر تجهيز المستند للتصدير.');
  }

  if (input.format === 'html') {
    return downloadHtml(html, `${input.filename}.html`);
  }

  const bridge = window.manar?.exportPdfFromHtml;
  if (!bridge) {
    return fail('PLATFORM_UNAVAILABLE', 'تصدير PDF غير متاح خارج تطبيق سطح المكتب.');
  }

  try {
    const result = await bridge(html, `${input.filename}.pdf`);
    if (result.canceled) return fail('PRINT_CANCELLED', 'أُلغي التصدير.');
    if (!result.success) return fail('PRINT_FAILED', result.error ?? 'تعذّر تصدير PDF.');
    return { ok: true, value: { format: 'pdf', path: result.path } };
  } catch (error) {
    return fail('PRINT_FAILED', 'تعذّر تصدير PDF.', error instanceof Error ? error.message : String(error));
  }
}

/**
 * Write the composed HTML to a file.
 *
 * A Blob and an object URL — the browser's own download path, which needs no IPC and
 * therefore works in a browser as well as in Electron. The URL is revoked on the next
 * frame rather than immediately: revoking synchronously races the download in some
 * Chromium builds and produces an empty file.
 */
function downloadHtml(html: string, filename: string): PrintOutcome<ExportSuccess> {
  try {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    requestAnimationFrame(() => URL.revokeObjectURL(url));
    return { ok: true, value: { format: 'html' } };
  } catch (error) {
    return fail('PRINT_FAILED', 'تعذّر حفظ ملف HTML.', error instanceof Error ? error.message : String(error));
  }
}

/**
 * A filename for a letter.
 *
 * The reference when there is one, because that is what the document is called in the
 * register and what anyone searching a folder will look for. A draft has no reference,
 * so it falls back to its subject — trimmed of the characters Windows refuses.
 */
export function exportFilename(reference: string | null, subject: string): string {
  if (reference) return reference;
  const safe = subject.trim().replace(/[\\/:*?"<>|]/g, '').slice(0, 60);
  return safe.length > 0 ? safe : 'letter-draft';
}
