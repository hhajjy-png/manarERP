/**
 * Letter Engine — P6 print engine tests.
 *
 * Each of the four stages is exercised on its own, which is the whole point of them
 * being four functions rather than one procedure. The full pipeline is then tested for
 * ORDER — that it stops at the first failure, and stops at the RIGHT one.
 *
 * No DOM, no rendering, no timers: the print path is pure up to the platform boundary,
 * and the platform arrives as an argument.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  type PageGeometry,
  contentTopForPageMm,
  getPageGeometry,
  pageSizeOf,
  reservedTopForPageMm,
  textBandBottomMm,
  usableBandMm,
} from '../../letters/registry/geometryRegistry';
import { LAYOUT_VERSION_LATEST } from '../../letters/versioning/versions';
import { type PaginationResult } from '../../letters/pagination/paginate';
import { type ValidationIssue, type ValidationResult, summarise } from '../../letters/validation/framework';
import { buildPrintableDocument, matchesPagination } from '../../letters/printing/printModel';
import {
  type PlatformPrintResult,
  type PrintPlatform,
  compose,
  prepare,
  print,
  runPrintPipeline,
  validateForPrint,
} from '../../letters/printing/printPipeline';

const PROFILE = 'companyLetterhead' as const;
const GEOMETRY: PageGeometry = getPageGeometry(PROFILE, LAYOUT_VERSION_LATEST);
const TITLE = 'خطاب رسمي';

/* ── Fixtures ───────────────────────────────────────────────────────────────
   Every millimetre comes from the registry rather than from a literal: a test that
   hardcodes a dimension becomes a second source of truth for geometry, which is
   precisely what the engine forbids. */

function pagination(pageCount: number): PaginationResult {
  const pages = Array.from({ length: pageCount }, (_, pageIndex) => ({
    pageIndex,
    itemIds: [`item-${pageIndex}-a`, `item-${pageIndex}-b`],
    usedMm: 20,
    availableMm: usableBandMm(GEOMETRY, pageIndex),
  }));
  return { pages, pageCount, overflowingItemIds: [] };
}

const EMPTY_PAGINATION: PaginationResult = { pages: [], pageCount: 0, overflowingItemIds: [] };

const CLEAN: ValidationResult = { issues: [], unimplementedRuleIds: [] };

function issue(severity: ValidationIssue['severity'], ruleId: ValidationIssue['ruleId']): ValidationIssue {
  return { ruleId, severity, message: 'رسالة اختبار' };
}

function platform(outcome: PlatformPrintResult): PrintPlatform {
  return { print: vi.fn(async () => outcome) };
}

const OK_PLATFORM = (): PrintPlatform => platform({ outcome: 'success' });

/* ══ printModel — the projection ══════════════════════════════════════════ */

describe('printModel — projection of the existing layout', () => {
  it('carries every item through in the paginator’s own order', () => {
    const source = pagination(3);
    const printable = buildPrintableDocument(source, GEOMETRY, PROFILE, LAYOUT_VERSION_LATEST);

    expect(printable.pageCount).toBe(3);
    expect(printable.pages.map((p) => p.itemIds)).toEqual(source.pages.map((p) => p.itemIds));
    expect(matchesPagination(printable, source)).toBe(true);
  });

  it('gives a continuation page its OWN header band, not the first page’s', () => {
    const printable = buildPrintableDocument(pagination(2), GEOMETRY, PROFILE, LAYOUT_VERSION_LATEST);
    const [first, second] = printable.pages;

    expect(first.isFirstPage).toBe(true);
    expect(second.isFirstPage).toBe(false);
    expect(first.header.heightMm).toBe(reservedTopForPageMm(GEOMETRY, 0));
    expect(second.header.heightMm).toBe(reservedTopForPageMm(GEOMETRY, 1));
    expect(first.contentTopMm).toBe(contentTopForPageMm(GEOMETRY, 0));
    expect(second.contentTopMm).toBe(contentTopForPageMm(GEOMETRY, 1));
  });

  it('reads every dimension from the registry — it invents none', () => {
    const sheet = pageSizeOf(GEOMETRY);
    const [page] = buildPrintableDocument(pagination(1), GEOMETRY, PROFILE, LAYOUT_VERSION_LATEST).pages;

    expect(page.pageWidthMm).toBe(sheet.widthMm);
    expect(page.pageHeightMm).toBe(sheet.heightMm);
    expect(page.contentBottomMm).toBe(textBandBottomMm(GEOMETRY));
    expect(page.contentWidthMm).toBe(GEOMETRY.contentWidthMm);
    expect(page.footer.endMm).toBe(sheet.heightMm);
    expect(page.footer.heightMm).toBe(GEOMETRY.reservedBottomMm);
    // The footer starts where the content band has already ended.
    expect(page.footer.startMm).toBeGreaterThanOrEqual(page.contentBottomMm);
  });

  it('is pure — the same layout in produces an identical projection', () => {
    const source = pagination(2);
    const a = buildPrintableDocument(source, GEOMETRY, PROFILE, LAYOUT_VERSION_LATEST);
    const b = buildPrintableDocument(source, GEOMETRY, PROFILE, LAYOUT_VERSION_LATEST);
    expect(a).toEqual(b);
  });

  it('detects a projection that no longer matches its layout', () => {
    const printable = buildPrintableDocument(pagination(2), GEOMETRY, PROFILE, LAYOUT_VERSION_LATEST);
    expect(matchesPagination(printable, pagination(3))).toBe(false);
  });
});

/* ══ Stage 1 — Prepare ════════════════════════════════════════════════════ */

describe('prepare', () => {
  it('projects the layout it is given', () => {
    const outcome = prepare({
      pagination: pagination(2),
      geometry: GEOMETRY,
      profileId: PROFILE,
      layoutVersion: LAYOUT_VERSION_LATEST,
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.pageCount).toBe(2);
    expect(outcome.value.profileId).toBe(PROFILE);
    expect(outcome.value.layoutVersion).toBe(LAYOUT_VERSION_LATEST);
  });

  it('refuses a document with no pages rather than emitting a blank sheet', () => {
    const outcome = prepare({
      pagination: EMPTY_PAGINATION,
      geometry: GEOMETRY,
      profileId: PROFILE,
      layoutVersion: LAYOUT_VERSION_LATEST,
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.stage).toBe('prepare');
    expect(outcome.error.code).toBe('NO_PAGES');
    expect(outcome.error.message.length).toBeGreaterThan(0);
  });
});

/* ══ Stage 2 — Validate: the gate ═════════════════════════════════════════ */

describe('validateForPrint — the gate', () => {
  it('passes a document with no findings and nothing left unchecked', () => {
    const outcome = validateForPrint(summarise(CLEAN), CLEAN);
    expect(outcome.ok).toBe(true);
  });

  it('refuses when a blocking error exists, and returns the findings themselves', () => {
    const result: ValidationResult = {
      issues: [issue('blocking', 'E4_reservedZoneOverlap'), issue('warning', 'E13_impossibleGeometry')],
      unimplementedRuleIds: [],
    };
    const outcome = validateForPrint(summarise(result), result);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.stage).toBe('validate');
    expect(outcome.error.code).toBe('BLOCKING_ISSUES');
    // The refusal carries the reason, so the caller never has to re-run validation
    // to find out what was wrong.
    expect(outcome.error.blockingIssues).toHaveLength(1);
    expect(outcome.error.blockingIssues?.[0].ruleId).toBe('E4_reservedZoneOverlap');
  });

  it('lets warnings and information through — only blocking errors stop printing', () => {
    const result: ValidationResult = {
      issues: [issue('warning', 'E13_impossibleGeometry'), issue('info', 'E16_objectInReservedZone')],
      unimplementedRuleIds: [],
    };
    const outcome = validateForPrint(summarise(result), result);
    expect(outcome.ok).toBe(true);
  });

  it('refuses an INCOMPLETE check separately from a failed one', () => {
    const result: ValidationResult = { issues: [], unimplementedRuleIds: ['E16_objectInReservedZone'] };
    const outcome = validateForPrint(summarise(result), result);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    // "Nothing found" and "never checked" must not reach paper as the same answer.
    expect(outcome.error.code).toBe('INCOMPLETE_VALIDATION');
    expect(outcome.error.blockingIssues).toBeUndefined();
  });

  it('reports a blocking error ahead of an incomplete check when both are present', () => {
    const result: ValidationResult = {
      issues: [issue('blocking', 'E4_reservedZoneOverlap')],
      unimplementedRuleIds: ['E16_objectInReservedZone'],
    };
    const outcome = validateForPrint(summarise(result), result);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe('BLOCKING_ISSUES');
  });

  it('refuses a summary that claims unready for a reason the result does not show', () => {
    // Defensive branch: a drifted summary must fail closed, never print.
    const outcome = validateForPrint(
      { ...summarise(CLEAN), readyForPrinting: false },
      CLEAN,
    );
    expect(outcome.ok).toBe(false);
  });
});

/* ══ Stage 3 — Compose ════════════════════════════════════════════════════ */

describe('compose', () => {
  it('describes the job without building a second document', () => {
    const source = pagination(3);
    const printable = buildPrintableDocument(source, GEOMETRY, PROFILE, LAYOUT_VERSION_LATEST);
    const outcome = compose(printable, source, TITLE);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.title).toBe(TITLE);
    expect(outcome.value.pageCount).toBe(3);
    // The job POINTS AT the projection; it does not copy or re-render it.
    expect(outcome.value.document).toBe(printable);
  });

  it('fails loudly when the projection and the screen layout disagree', () => {
    const printable = buildPrintableDocument(pagination(2), GEOMETRY, PROFILE, LAYOUT_VERSION_LATEST);
    const outcome = compose(printable, pagination(4), TITLE);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.stage).toBe('compose');
    expect(outcome.error.code).toBe('LAYOUT_MISMATCH');
  });
});

/* ══ Stage 4 — Print ══════════════════════════════════════════════════════ */

describe('print', () => {
  const source = pagination(1);
  const job = {
    document: buildPrintableDocument(source, GEOMETRY, PROFILE, LAYOUT_VERSION_LATEST),
    title: TITLE,
    pageCount: 1,
  };

  it('hands the job to the platform and reports success', async () => {
    const target = OK_PLATFORM();
    const outcome = await print(job, target);

    expect(outcome.ok).toBe(true);
    expect(target.print).toHaveBeenCalledWith(job);
  });

  it('reports a cancellation as its own code, not as a failure', async () => {
    const outcome = await print(job, platform({ outcome: 'cancelled' }));

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    // Telling a user "printing failed" when they pressed Cancel is how a program
    // loses their trust.
    expect(outcome.error.code).toBe('PRINT_CANCELLED');
  });

  it('carries the platform’s own reason through on failure', async () => {
    const outcome = await print(job, platform({ outcome: 'error', failureReason: 'no printers' }));

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe('PRINT_FAILED');
    expect(outcome.error.cause).toBe('no printers');
  });

  it('converts a thrown platform error into a structured failure', async () => {
    const throwing: PrintPlatform = {
      print: vi.fn(async () => {
        throw new Error('bridge unavailable');
      }),
    };
    const outcome = await print(job, throwing);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe('PRINT_FAILED');
    expect(outcome.error.cause).toBe('bridge unavailable');
  });

  it('refuses when there is no print service at all', async () => {
    const outcome = await print(job, null);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe('PLATFORM_UNAVAILABLE');
  });
});

/* ══ The whole pipeline — order matters ═══════════════════════════════════ */

describe('runPrintPipeline', () => {
  function input(overrides: Partial<Parameters<typeof runPrintPipeline>[0]> = {}) {
    const source = overrides.pagination ?? pagination(2);
    return {
      pagination: source,
      geometry: GEOMETRY,
      profileId: PROFILE,
      layoutVersion: LAYOUT_VERSION_LATEST,
      validation: CLEAN,
      summary: summarise(CLEAN),
      title: TITLE,
      platform: OK_PLATFORM(),
      ...overrides,
    };
  }

  it('runs all four stages and returns the job that was printed', async () => {
    const outcome = await runPrintPipeline(input());

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.job.pageCount).toBe(2);
    expect(outcome.value.platformResult.outcome).toBe('success');
  });

  it('never reaches the platform when the document has a blocking error', async () => {
    const validation: ValidationResult = {
      issues: [issue('blocking', 'E4_reservedZoneOverlap')],
      unimplementedRuleIds: [],
    };
    const target = OK_PLATFORM();
    const outcome = await runPrintPipeline(
      input({ validation, summary: summarise(validation), platform: target }),
    );

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe('BLOCKING_ISSUES');
    // The refusal is the point: nothing was sent to a printer.
    expect(target.print).not.toHaveBeenCalled();
  });

  it('reports an empty document as NO_PAGES, not as a validation problem', async () => {
    // prepare runs before validate precisely so this refusal is honest.
    const outcome = await runPrintPipeline(input({ pagination: EMPTY_PAGINATION }));

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.stage).toBe('prepare');
    expect(outcome.error.code).toBe('NO_PAGES');
  });

  it('leaves the layout it was given completely untouched', async () => {
    const source = pagination(2);
    const before = JSON.stringify(source);
    await runPrintPipeline(input({ pagination: source }));
    // No mutation during print — printing a letter leaves it byte-identical.
    expect(JSON.stringify(source)).toBe(before);
  });

  it('paginates and measures nothing — it consumes the layout as given', async () => {
    // A layout whose page 0 carries an implausible `usedMm` is still reproduced
    // exactly: the pipeline has no opinion about where content goes.
    const odd: PaginationResult = {
      pageCount: 1,
      overflowingItemIds: ['item-0-a'],
      pages: [{ pageIndex: 0, itemIds: ['item-0-a'], usedMm: 999, availableMm: usableBandMm(GEOMETRY, 0) }],
    };
    const outcome = await runPrintPipeline(input({ pagination: odd }));

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.job.document.pages[0].usedMm).toBe(999);
    expect(outcome.value.job.document.pages[0].itemIds).toEqual(['item-0-a']);
  });
});

/* ══ The print stylesheet ═════════════════════════════════════════════════
   It makes two claims about itself in its own header. Both are checkable. */

describe('letter-print.css', () => {
  const COMPONENTS = join(process.cwd(), 'src', 'components', 'letters');
  const css = readFileSync(join(COMPONENTS, 'letter-print.css'), 'utf8');
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');

  it('restates no dimension — geometry reaches paper only via the registry', () => {
    // A millimetre here would mean print and screen had started describing two
    // different pages. `size: A4` is a page-box declaration, not a dimension.
    expect(withoutComments).not.toMatch(/\d+(?:\.\d+)?\s*(?:mm|cm|in)\b/);
    expect(withoutComments).not.toMatch(/\b(?:210|297)\b/);
  });

  it('hides only chrome that actually exists — the deny-list cannot rot silently', () => {
    // Every class the stylesheet hides must be a class something renders. A stale
    // selector is a rule that stopped protecting anything without anyone noticing.
    const hidden = withoutComments
      .match(/^\s*\.([a-z][a-z0-9-]*)[ ,]/gim)
      ?.map((line) => line.trim().replace(/^\./, '').replace(/[ ,]$/, '')) ?? [];
    expect(hidden.length).toBeGreaterThan(10);

    const sources = ['LetterPaper.tsx', 'LetterPageStack.tsx', 'LetterSections.tsx', 'ValidationPanel.tsx']
      .map((f) => readFileSync(join(COMPONENTS, f), 'utf8'))
      .concat(
        // Document Studio chrome. Every one of these renders interface rather than
        // ink, so every one of them must be in the deny-list — and this scan is what
        // proves the deny-list still names something real.
        [
          'DocumentToolbar.tsx', 'DocumentStatusBar.tsx', 'DocumentNavigator.tsx',
          'FindReplacePanel.tsx', 'ShortcutsDialog.tsx',
          // Document Layout Designer v1. `LayoutObjectView` is included even though
          // its `.lo-object` rule is NOT a deny-list entry — the stylesheet also
          // suppresses `.lo-placeholder`, which that component renders.
          'LayoutToolbar.tsx', 'LayoutCanvas.tsx', 'ObjectInspector.tsx', 'LayoutObjectView.tsx',
          // Professional Document Automation v1.
          'InsertPanel.tsx', 'DocumentPropertiesPanel.tsx', 'ConditionEditor.tsx',
          // Form Editor UX Simplification Pack v1. The menu is portaled to
          // `document.body`, so it is the one piece of chrome the export pipeline's
          // subtree strip can never reach — the deny-list is its only protection, and
          // this scan is what keeps that entry honest.
          'AdvancedToolsMenu.tsx',
        ].map((f) => readFileSync(join(COMPONENTS, 'studio', f), 'utf8')),
        ['LetterComposer.tsx', 'LetterComposer.css'].map((f) =>
          readFileSync(join(process.cwd(), 'src', 'pages', f), 'utf8'),
        ),
        readFileSync(join(process.cwd(), 'src', 'components', 'explorer', 'ExplorerKit.tsx'), 'utf8'),
      )
      .join('\n');

    const stale = [...new Set(hidden)].filter((cls) => !sources.includes(cls));
    expect(stale, `Print stylesheet targets class(es) nothing renders: ${stale.join(', ')}`).toEqual([]);
  });
});

/* ══ Print fidelity — the defences nothing else can observe ═══════════════
   Each of these guards a decision whose failure mode is INVISIBLE on screen and shows
   up only on paper. That is exactly why they need a mechanical check: no amount of
   looking at the composer would reveal any of them. */

describe('print fidelity defences', () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');
  const COMPONENTS = join(process.cwd(), 'src', 'components', 'letters');
  const printCss = strip(readFileSync(join(COMPONENTS, 'letter-print.css'), 'utf8'));
  const paperCss = strip(readFileSync(join(COMPONENTS, 'letter-paper.css'), 'utf8'));
  const themeCss = strip(readFileSync(join(process.cwd(), 'src', 'app', 'theme.css'), 'utf8'));

  /** A rule block for `selector`, or `null`. */
  function ruleFor(css: string, selector: string): string | null {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? null;
  }

  it('wins the @page contest by cascade, not by stylesheet load order', () => {
    // theme.css is global and declares its own @page for the ordinary screens, while
    // this file rides a lazily-loaded route chunk — so an unnamed rule alone would be
    // a coin toss. Losing it shortens the page box: a blank strip after every sheet
    // and every reserved-zone offset out by the margin, with the screen still correct.
    expect(themeCss, 'the conflicting global @page this defence exists for').toMatch(
      /@page\s*\{[^}]*margin/,
    );

    const named = printCss.match(/@page\s+([A-Za-z][\w-]*)\s*\{[^}]*margin:\s*0/);
    expect(named, 'letter-print.css must declare a NAMED @page with a zero margin').not.toBeNull();

    // …and the sheets must actually be bound to it, or the name protects nothing.
    const slot = ruleFor(printCss, '.lp-page-slot');
    expect(slot).toContain(`page: ${named![1]}`);
  });

  it('neutralises every ancestor box between the body and the sheet', () => {
    // Each ancestor is a chance to add height or to block fragmentation. A flex or
    // scroll container in this chain can silently cost a page, or every page but one.
    const ancestors = ['.lc-page', '.lc-paper-area', '.lp-viewport', '.lp-scale', '.lp-stack', '.lp-stage'];
    const missing = ancestors.filter((sel) => ruleFor(printCss, sel) === null);
    expect(missing, `Ancestor(s) of the sheet with no print rule: ${missing.join(', ')}`).toEqual([]);
  });

  it('cancels the zoom transform — a transformed subtree cannot fragment across pages', () => {
    // The zoom arrives as an inline `transform: scale()`, so only `!important` beats
    // it. Left standing, the whole multi-page stack would print on a single sheet.
    expect(ruleFor(printCss, '.lp-scale')).toMatch(/transform:\s*none\s*!important/);
  });

  it('opens the scroll container that would otherwise truncate the stack', () => {
    // `.lp-viewport` scrolls on screen; Chromium does not fragment a scroll container,
    // so print must see `visible` or everything past page one is simply lost.
    expect(ruleFor(paperCss, '.lp-viewport')).toMatch(/overflow:\s*auto/);
    expect(ruleFor(printCss, '.lp-viewport')).toMatch(/overflow:\s*visible\s*!important/);
  });

  it('never relaxes the content band’s clip — print clips exactly as the screen does', () => {
    // The band clips so content cannot paint across the reserved footer, which is the
    // letterhead's own ink. Relaxing it for print would invert the guarantee precisely
    // where it matters: clipped on screen, printed over the reserved zone on paper.
    expect(ruleFor(paperCss, '.lp-band')).toMatch(/overflow:\s*hidden/);
    const printed = ruleFor(printCss, '.lp-band');
    expect(printed === null || !/overflow:\s*visible/.test(printed)).toBe(true);
  });
});

