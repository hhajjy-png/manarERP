// @vitest-environment jsdom
/**
 * Blank A4 Free Print v1 — behaviour + REGRESSION suite.
 *
 * The regression half pins the four defects found in manual review, each at its own
 * root cause rather than at its symptom:
 *
 *  1. Physical print produced two blank pages and lost the signature/stamp — the page's
 *     own `@media print` CSS relaxed the sheet's height (`height: auto`), and since every
 *     child is absolutely positioned the box collapsed to zero; a fixed-px wrapper then
 *     overflowed the printable band. Guarded by: the print CSS must ASSERT 210×297mm and
 *     must never contain a collapsing height, and the stage must not generate a box.
 *  2. PDF gained an empty second page — `@page` had 10mm margins while the sheet is
 *     297mm tall, so the sheet could not fit the 277mm printable band. Guarded by: the
 *     export document must carry `@page { size: A4; margin: 0 }` and zero page padding.
 *  3. Accurate preview drew the images in the header band — `composeStyledFromNode`
 *     captures the LIVE stylesheets, so the same collapsing print rule applied there and
 *     every anchor resolved against a zero-height box. Guarded by the same CSS assertions
 *     as (1), which is the shared cause, plus mm-based anchors.
 *  4. The vertical ruler sat on the wrong edge. Guarded by its anchoring rule.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ROUTER_FUTURE } from './helpers/router';

const settingsPayload = {
  settings: [
    {
      key: 'print.signatures',
      value: JSON.stringify([
        { id: 'sig1', name: 'المدير', title: '', imageUrl: 'data:image/png;base64,AAA', show: true, isDefault: true },
      ]),
    },
    {
      key: 'print.stamps',
      value: JSON.stringify([
        { id: 'stamp1', name: 'الختم الرسمي', title: '', imageUrl: 'data:image/png;base64,BBB', show: true, isDefault: true },
      ]),
    },
  ],
};

vi.mock('../api/client', () => ({
  api: {
    get: vi.fn(() => Promise.resolve({ data: { data: settingsPayload } })),
    post: vi.fn(),
    put: vi.fn(),
  },
  errorMessage: (e: unknown) => String(e),
}));

import { FORM_CARDS } from '../forms/shared/formsRegistry';
import { FORM_BRANDING_DOC_KEYS } from '../print-templates/engine/types';
import {
  BRANDING_LAYOUT_BOUNDS,
  BLANK_A4_LAYOUT_BOUNDS,
  getBrandingLayoutBounds,
  clampBrandingElementLayout,
  brandingElementTransform,
  DEFAULT_ELEMENT_LAYOUT,
} from '../print-templates/utils/brandingLayout';
import BlankA4Print from '../pages/BlankA4Print';

/** CSS px for a physical length — CSS px is 1/96in, so this ratio is fixed. */
const mm = (millimetres: number) => Math.round(millimetres * (96 / 25.4));
const RULER_EDGES = ['top', 'bottom', 'left', 'right'] as const;

function renderPage() {
  return render(
    <MemoryRouter future={ROUTER_FUTURE} initialEntries={['/forms/blank-a4-print']}>
      <Routes>
        <Route path="/forms/blank-a4-print" element={<BlankA4Print />} />
      </Routes>
    </MemoryRouter>,
  );
}

/**
 * All CSS the page mounts, as one string — the live rules that drive physical print
 * AND (via `capturePrintStyles`) the accurate preview.
 *
 * Comments are stripped so the assertions below read DECLARATIONS, not prose: a
 * comment that merely names a forbidden pattern (e.g. one explaining why
 * `height: auto` must never appear) is not itself a rule and must not fail the guard.
 */
function pageCss(): string {
  return Array.from(document.querySelectorAll('style'))
    .map((s) => s.textContent ?? '')
    .filter((css) => css.includes('blank-a4-sheet'))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Forms registry — Blank A4 Free Print card', () => {
  it('is registered as an ops card needing no employee, and owns a branding-layout key', () => {
    const card = FORM_CARDS.find((c) => c.key === 'blank-a4-print');
    expect(card).toBeTruthy();
    expect(card?.route).toBe('blank-a4-print');
    expect(card?.requiresEmployee).toBe(false);
    expect(card?.category).toBe('ops');
    expect(FORM_BRANDING_DOC_KEYS).toContain('blank-a4-print');
  });
});

describe('BlankA4Print — genuinely blank sheet', () => {
  it('renders no title, form-number, QR, or approval-block chrome on the sheet', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('.form-page')).toBeTruthy());

    const page = container.querySelector('.form-page') as HTMLElement;
    expect(page.querySelector('h1')).toBeNull();
    expect(page.querySelector('svg')).toBeNull(); // no QR code drawn on the sheet
    expect(screen.queryByText('اعتماد المدير المباشر')).toBeNull();
    expect(screen.queryByText('التوقيع:')).toBeNull();
    expect(screen.queryByText('الختم الرسمي')).toBeNull();
  });

  it('draws the selected signature and stamp inside the printable sheet', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const page = container.querySelector('.form-page') as HTMLElement;
      expect(page.querySelector('img[data-bd-type="signature"]')).toBeTruthy();
      expect(page.querySelector('img[data-bd-type="stamp"]')).toBeTruthy();
    });
  });
});

describe('REGRESSION — one A4 page geometry, shared by all four paths', () => {
  it('the sheet element is exactly 210×297mm with zero padding, inline so it survives cloning', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('.form-page')).toBeTruthy());

    const sheet = container.querySelector('.form-page') as HTMLElement;
    // Inline (not stylesheet) geometry is what travels into the PDF export document,
    // where the page's own <style> block is NOT carried over.
    expect(sheet.style.width).toBe('210mm');
    expect(sheet.style.height).toBe('297mm');
    expect(sheet.style.position).toBe('relative');
    expect(sheet.style.boxSizing).toBe('border-box');
    expect(sheet.style.overflow).toBe('hidden');
    // Origin must be the true paper corner — any padding would offset every ruler reading.
    expect(sheet.style.padding === '0px' || sheet.style.padding === '0').toBe(true);
  });

  it('print CSS ASSERTS the full sheet box and never relaxes its height (cause of the collapsed box)', async () => {
    renderPage();
    await waitFor(() => expect(pageCss()).not.toBe(''));
    const css = pageCss();

    expect(css).toContain('height: 297mm !important');
    expect(css).toContain('width: 210mm !important');
    // The exact defect: a relaxed height zeroes a box whose children are all
    // absolutely positioned, so both images collapsed to the top of the page.
    expect(css).not.toMatch(/height:\s*auto/);
    expect(css).not.toMatch(/width:\s*100%/);
  });

  it('declares a zero-margin A4 page box, so a 297mm sheet cannot spill onto a 2nd page', async () => {
    renderPage();
    await waitFor(() => expect(pageCss()).not.toBe(''));
    expect(pageCss()).toMatch(/@page\s*\{\s*size:\s*A4;\s*margin:\s*0;\s*\}/);
  });

  it('the ruler stage generates no box at print, so its screen margins cannot add page height', async () => {
    renderPage();
    await waitFor(() => expect(pageCss()).not.toBe(''));
    expect(pageCss()).toMatch(/\.blank-a4-stage\s*\{\s*display:\s*contents\s*!important/);
  });

  it('branding anchors are in millimetres from the sheet corner — one coordinate system', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('img[data-bd-type="signature"]')).toBeTruthy());

    for (const kind of ['signature', 'stamp']) {
      const img = container.querySelector(`img[data-bd-type="${kind}"]`) as HTMLElement;
      expect(img.style.position).toBe('absolute');
      expect(img.style.left).toMatch(/mm$/);
      expect(img.style.top).toMatch(/mm$/);
    }
  });
});

describe('REGRESSION — PDF export document geometry (cause of the empty 2nd page)', () => {
  let exported: string | undefined;

  beforeEach(() => {
    exported = undefined;
    (window as unknown as { manar: Record<string, unknown> }).manar = {
      exportPdfFromHtml: vi.fn((html: string) => {
        exported = html;
        return Promise.resolve();
      }),
    };
  });

  it('exports a zero-margin A4 document whose sheet keeps its full 297mm height', async () => {
    renderPage();
    await waitFor(() => expect(document.querySelector('.form-page')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /حفظ PDF/ }));
    await waitFor(() => expect(exported).toBeTruthy());

    const html = exported as string;
    // Page box = the whole sheet. With the previous 10mm margins the printable band
    // was 277mm and the 297mm sheet necessarily produced a second page.
    expect(html).toMatch(/@page\s*\{[^}]*margin:\s*0;/);
    expect(html).toMatch(/padding:\s*0mm 0mm 0mm 0mm !important/);
    // The sheet's own height must survive the clone — buildFormPdfDocument never sets it.
    expect(html).toContain('height: 297mm');
  });

  it('strips screen-only chrome (rulers) from the exported document', async () => {
    renderPage();
    await waitFor(() => expect(document.querySelector('.form-page')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /حفظ PDF/ }));
    await waitFor(() => expect(exported).toBeTruthy());

    for (const edge of RULER_EDGES) {
      expect(exported as string).not.toContain(`a4-ruler-${edge}`);
    }
    // Nor any ruler numeral, which would be the visible symptom if one leaked.
    expect(exported as string).not.toContain('blank-a4-ruler');
  });
});

describe('REGRESSION — Blank A4 movement envelope (this document ONLY)', () => {
  it('lets either element\'s centre reach any point of the 210×297mm sheet', () => {
    const b = BLANK_A4_LAYOUT_BOUNDS;
    // Derived from the real sheet and the two anchors — signature (68,210),
    // stamp (142,210) in mm — not from picked numbers.
    expect(b.minX).toBe(-mm(142));
    expect(b.maxX).toBe(mm(142));
    expect(b.minY).toBe(-mm(210)); // anchor y 210mm → reaches the sheet's top edge
    expect(b.maxY).toBe(mm(87));   // 297 − 210 → reaches its bottom edge
  });

  it('keeps scale identical to the rest of the system (0.2–4)', () => {
    expect(BLANK_A4_LAYOUT_BOUNDS.minScale).toBe(BRANDING_LAYOUT_BOUNDS.minScale);
    expect(BLANK_A4_LAYOUT_BOUNDS.maxScale).toBe(BRANDING_LAYOUT_BOUNDS.maxScale);
  });

  it('is scoped to blank-a4-print — every other document keeps the central envelope', () => {
    expect(getBrandingLayoutBounds('blank-a4-print')).toBe(BLANK_A4_LAYOUT_BOUNDS);
    for (const key of ['invoice', 'quotation', 'salary-certificate', 'receipt-voucher'] as const) {
      expect(getBrandingLayoutBounds(key)).toBe(BRANDING_LAYOUT_BOUNDS);
    }
    // An unknown/absent key must never widen anything.
    expect(getBrandingLayoutBounds(undefined)).toBe(BRANDING_LAYOUT_BOUNDS);
    expect(BRANDING_LAYOUT_BOUNDS).toEqual({
      minX: -150, maxX: 150, minY: -150, maxY: 150, minScale: 0.2, maxScale: 4,
    });
  });

  it('clamps with the central envelope by default, so existing callers are unchanged', () => {
    // No bounds argument ⇒ exactly the pre-existing behaviour.
    expect(clampBrandingElementLayout({ ...DEFAULT_ELEMENT_LAYOUT, x: 400 }).x).toBe(150);
    // …and the wide envelope only applies when explicitly asked for.
    expect(clampBrandingElementLayout({ ...DEFAULT_ELEMENT_LAYOUT, x: 400 }, BLANK_A4_LAYOUT_BOUNDS).x).toBe(400);
  });

  it('applies the same envelope AT RENDER TIME, so a saved wide position is not pulled back', () => {
    const wide = { ...DEFAULT_ELEMENT_LAYOUT, x: 400, y: -600 };
    // The defect this guards: the transform clamps too, so a render-time clamp with the
    // central envelope would silently relocate a position the designer legitimately saved.
    expect(brandingElementTransform(wide, BLANK_A4_LAYOUT_BOUNDS)).toContain('translate(400px, -600px)');
    expect(brandingElementTransform(wide)).toContain('translate(150px, -150px)');
  });
});

describe('REGRESSION — rulers on all four edges, screen-only', () => {
  it('renders a ruler on every edge, each .no-print and OUTSIDE the printable sheet', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByTestId('a4-ruler-top')).toBeInTheDocument());

    const sheet = container.querySelector('.form-page') as HTMLElement;
    for (const edge of RULER_EDGES) {
      expect(screen.getByTestId(`a4-ruler-${edge}`)).toHaveClass('no-print');
      // Structural guarantee: the export paths clone `.form-page` alone, so a ruler that
      // is not a descendant of it can never reach print/PDF/preview whatever CSS says.
      expect(sheet.querySelector(`[data-testid="a4-ruler-${edge}"]`)).toBeNull();
    }
  });

  it('each ruler spans its true A4 dimension — 210mm horizontally, 297mm vertically', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('a4-ruler-top')).toBeInTheDocument());

    expect(screen.getByTestId('a4-ruler-top')).toHaveStyle({ width: '210mm' });
    expect(screen.getByTestId('a4-ruler-bottom')).toHaveStyle({ width: '210mm' });
    expect(screen.getByTestId('a4-ruler-left')).toHaveStyle({ height: '297mm' });
    expect(screen.getByTestId('a4-ruler-right')).toHaveStyle({ height: '297mm' });
  });

  it('anchors each ruler just outside its own edge, so none overlaps or resizes the sheet', async () => {
    renderPage();
    await waitFor(() => expect(pageCss()).not.toBe(''));
    const css = pageCss();
    expect(css).toMatch(/\.blank-a4-ruler-top\s*\{[^}]*bottom:\s*100%/);
    expect(css).toMatch(/\.blank-a4-ruler-bottom\s*\{[^}]*top:\s*100%/);
    expect(css).toMatch(/\.blank-a4-ruler-left\s*\{[^}]*right:\s*100%/);
    expect(css).toMatch(/\.blank-a4-ruler-right\s*\{[^}]*left:\s*100%/);
    // Space for them is reserved with MARGIN on the stage — padding or a border would
    // change the sheet's own box and break the 210×297mm geometry.
    expect(css).toMatch(/\.blank-a4-stage\s*\{[^}]*margin:/);
    expect(css).not.toMatch(/\.blank-a4-stage\s*\{[^}]*padding:/);
  });

  it('marks every mm, every 5mm and every labelled cm across a full A4 edge', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('a4-ruler-top')).toBeInTheDocument());

    const top = screen.getByTestId('a4-ruler-top');
    // 0…210mm inclusive — one tick per millimetre, no coarser.
    expect(top.querySelectorAll('line')).toHaveLength(211);
    // A labelled numeral at each whole cm except 0 (the origin corner is unlabelled).
    expect(top.querySelectorAll('text')).toHaveLength(21);
    expect(Array.from(top.querySelectorAll('text')).map((n) => n.textContent)).toContain('21');

    const side = screen.getByTestId('a4-ruler-left');
    expect(side.querySelectorAll('line')).toHaveLength(298); // 0…297mm
    expect(side.querySelectorAll('text')).toHaveLength(29);  // 1…29cm
  });
});
