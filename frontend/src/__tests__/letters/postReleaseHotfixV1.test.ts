// @vitest-environment jsdom
/**
 * Letter Engine — Post-Release Hotfix v1.
 *
 * Three defects, each with a traceable root cause and a targeted fix. These tests
 * pin the fix so none of the three can silently regress:
 *
 *  1. The workspace toolbar carried a permanently-disabled "Export" placeholder with
 *     no implementation behind it — a dead control, removed rather than hidden.
 *  2. The print binding waited only two animation frames before capturing the page,
 *     which is a layout-paint guarantee, not an image-decode guarantee — the
 *     barcode's `<img>` is populated asynchronously and could still be blank when
 *     the OS print snapshot was taken.
 *  3. The Safe Writing Zone boundary faded to `opacity: 0` the instant the author
 *     focused any paragraph — which is effectively the entire time they are
 *     composing — leaving the one frame that answers "where do I write" invisible
 *     for the whole session.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

describe('Issue 1 — the toolbar carries no dead controls', () => {
  const workspaceSource = readFileSync(
    join(process.cwd(), 'src', 'pages', 'LetterWorkspace.tsx'),
    'utf8',
  );

  it('removed the permanently-disabled Export placeholder', () => {
    // It rendered `disabled` unconditionally, with no onClick and no feature behind
    // it — exactly the "placeholder only" category the audit was asked to remove.
    expect(workspaceSource).not.toContain('التصدير');
    expect(workspaceSource).not.toContain('icon="download"');
  });

  it('every remaining toolbar Button has a real onClick or a documented reason to omit one', () => {
    // A mechanical floor for the audit, not a full re-derivation of it: any future
    // `<Button` added to the toolbar row without an `onClick` on the same tag is
    // flagged for a human to look at, rather than silently shipping another
    // Export-shaped placeholder.
    const toolbarRow = workspaceSource.match(/lw-toolbar-row">([\s\S]*?)<\/div>\s*\n\s*{selected\.size/);
    expect(toolbarRow, 'could not isolate the toolbar row — test needs updating').not.toBeNull();
    const buttons = toolbarRow![1].match(/<Button\b[^>]*\/?>/g) ?? [];
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      expect(button, button).toMatch(/onClick=/);
    }
  });
});

describe('Issue 2 — the barcode has finished decoding before the platform is asked to print', () => {
  // Real component tests for `LetterBarcode`/`useLetterPrint` need a browser to render
  // an actual `<img>` and observe its `.complete` flag change — jsdom does not decode
  // images. `settleImages`/`waitForRenderReady` are tested directly and precisely
  // instead: pure functions, the exact functions the fix introduced, over `<img>`
  // elements this test controls completely.
  let waitForRenderReady: typeof import('../../components/letters/useLetterPrint').waitForRenderReady;
  let settleImages: typeof import('../../components/letters/useLetterPrint').settleImages;

  it('resolves immediately when there is nothing pending', async () => {
    ({ settleImages } = await import('../../components/letters/useLetterPrint'));
    // No `<img>` in the document at all — must not hang waiting for something that
    // does not exist.
    await expect(settleImages()).resolves.toBeUndefined();
  });

  it('waits for an incomplete image — the exact race the barcode hit', async () => {
    ({ settleImages } = await import('../../components/letters/useLetterPrint'));

    const img = document.createElement('img');
    // jsdom images report `complete: true` by default with no `src`; give it one so
    // the browser considers it genuinely pending, matching the barcode's real state
    // in the instant after `<img src>` is set but before the data URL has painted.
    Object.defineProperty(img, 'complete', { value: false, configurable: true });
    document.body.appendChild(img);

    let settled = false;
    const wait = settleImages().then(() => {
      settled = true;
    });

    // Give any (incorrect) synchronous resolution a chance to happen, then assert
    // it has NOT — this is the assertion that would have caught the original bug:
    // a wait that resolved before the image was actually ready.
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);

    img.dispatchEvent(new Event('load'));
    await wait;
    expect(settled).toBe(true);

    document.body.removeChild(img);
  });

  it('also settles on a failed image — a broken barcode must not hang printing forever', async () => {
    ({ settleImages } = await import('../../components/letters/useLetterPrint'));

    const img = document.createElement('img');
    Object.defineProperty(img, 'complete', { value: false, configurable: true });
    document.body.appendChild(img);

    const wait = settleImages();
    img.dispatchEvent(new Event('error'));
    await expect(wait).resolves.toBeUndefined();

    document.body.removeChild(img);
  });

  it('waitForRenderReady does not resolve before a pending image completes', async () => {
    ({ waitForRenderReady } = await import('../../components/letters/useLetterPrint'));

    const img = document.createElement('img');
    Object.defineProperty(img, 'complete', { value: false, configurable: true });
    document.body.appendChild(img);

    let ready = false;
    const wait = waitForRenderReady().then(() => {
      ready = true;
    });

    await Promise.resolve();
    await Promise.resolve();
    // This is the precise failure mode of the pre-fix code: `nextPaint()` alone
    // would have resolved by now, well before the image was ready.
    expect(ready).toBe(false);

    img.dispatchEvent(new Event('load'));
    await wait;
    expect(ready).toBe(true);

    document.body.removeChild(img);
  }, 10000);

  it('is bounded — a stuck image cannot hang printing forever', async () => {
    vi.useFakeTimers();
    try {
      ({ waitForRenderReady } = await import('../../components/letters/useLetterPrint'));

      const img = document.createElement('img');
      Object.defineProperty(img, 'complete', { value: false, configurable: true });
      document.body.appendChild(img);
      // Deliberately never dispatch load/error — this image is stuck forever.

      let ready = false;
      void waitForRenderReady().then(() => {
        ready = true;
      });

      await vi.advanceTimersByTimeAsync(3000);
      expect(ready).toBe(true);

      document.body.removeChild(img);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Issue 3 — the Safe Writing Zone boundary is visible throughout editing', () => {
  const css = readFileSync(
    join(process.cwd(), 'src', 'components', 'letters', 'letter-paper.css'),
    'utf8',
  );

  /** The `.lp-band::after` rule block, isolated from the rest of the file. */
  function bandBoundaryRule(): string {
    const match = css.match(/\.lp-band::after\s*\{([^}]*)\}/);
    expect(match, '.lp-band::after rule not found').not.toBeNull();
    return match![1];
  }

  it('never fades the boundary to zero on focus — the exact bug this hotfix fixes', () => {
    // This is the literal defect: `:focus-within` hiding the one frame that answers
    // "where do I write" for the entire time the author is actually writing.
    expect(css).not.toMatch(/\.lp-band:focus-within::after\s*\{[^}]*opacity:\s*0\b/);
  });

  it('declares a real, non-transparent boundary colour', () => {
    const rule = bandBoundaryRule();
    expect(rule).toMatch(/outline:\s*1px\s+solid\s+var\(--lt-band-boundary\)/);
  });

  it('the boundary token itself is opaque enough to actually be seen', () => {
    const tokens = readFileSync(
      join(process.cwd(), 'src', 'components', 'letters', 'letter-tokens.css'),
      'utf8',
    );
    const match = tokens.match(/--lt-band-boundary:\s*rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/);
    expect(match, '--lt-band-boundary token not found').not.toBeNull();
    const alpha = Number(match![1]);
    // The pre-fix value (0.32, and DASHED, which reads fainter still) was the
    // reported defect. Anything at or below it is not a fix.
    expect(alpha).toBeGreaterThan(0.32);
  });

  it('uses a solid line, not a dashed one — a dashed box reads as a form field', () => {
    const rule = bandBoundaryRule();
    expect(rule).not.toMatch(/dashed/);
  });

  it('still carries no millimetre of its own — geometry stays in the registry (INV-4)', () => {
    // The fix must change paint only. A dimension appearing here would mean the
    // boundary had started asserting its own geometry instead of following
    // `.lp-band`'s existing position.
    const rule = bandBoundaryRule();
    expect(rule).not.toMatch(/\d+(?:\.\d+)?mm/);
  });

  it('remains forced off in print — the boundary must never reach paper', () => {
    const printCss = readFileSync(
      join(process.cwd(), 'src', 'components', 'letters', 'letter-print.css'),
      'utf8',
    );
    expect(printCss).toMatch(/\.lp-band::after\s*\{[^}]*display:\s*none\s*!important/);
  });
});
