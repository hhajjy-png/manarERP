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
import { render, screen, cleanup, waitFor, fireEvent, within } from '@testing-library/react';
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

/** Barcode content settings, appended per-test — absent by default (never configured). */
function withBarcodeSettings(rows: Array<{ key: string; value: string }>) {
  return { settings: [...settingsPayload.settings, ...rows] };
}

// `vi.hoisted` because `vi.mock`'s factory is hoisted above these declarations.
const { apiGet, apiPut } = vi.hoisted(() => ({ apiGet: vi.fn(), apiPut: vi.fn() }));

vi.mock('../api/client', () => ({
  api: { get: apiGet, post: vi.fn(), put: apiPut },
  errorMessage: (e: unknown) => String(e),
}));

beforeEach(() => {
  apiGet.mockReset();
  apiPut.mockReset();
  apiGet.mockResolvedValue({ data: { data: settingsPayload } });
  apiPut.mockResolvedValue({ data: { data: {} } });
});

import { FORM_CARDS } from '../forms/shared/formsRegistry';
import { FORM_BRANDING_DOC_KEYS } from '../print-templates/engine/types';
import {
  BRANDING_LAYOUT_BOUNDS,
  BLANK_A4_LAYOUT_BOUNDS,
  getBrandingLayoutBounds,
  clampBrandingElementLayout,
  brandingElementTransform,
  parseBrandingLayout,
  resolveBrandingElement,
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

/**
 * Administrative Forms Barcode Designer v1 — the barcode is a THIRD element of the SAME
 * branding system, not a system beside it. These pin exactly that: it is opt-in, it is
 * drawn by the same component with the same designer hooks, it is clamped by the same
 * per-document envelope, it is stored in the same record, and it is invisible to every
 * document that does not declare it.
 */
describe('Barcode — a third element of the one branding system', () => {
  async function enableBarcode() {
    const utils = renderPage();
    await waitFor(() => expect(screen.getByLabelText('إظهار الباركود')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('إظهار الباركود'));
    return utils;
  }

  it('is OFF by default — the sheet stays exactly as blank as it was before it existed', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('img[data-bd-type="signature"]')).toBeTruthy());
    expect(container.querySelector('[data-bd-type="barcode"]')).toBeNull();
    // The show/hide switch sits in the SAME group as the other two, not in a panel of its own.
    expect(screen.getByLabelText('إظهار الباركود')).toBeInTheDocument();
  });

  it('draws the QR on the sheet once enabled, anchored in mm like its siblings', async () => {
    const { container } = await enableBarcode();

    const sheet = container.querySelector('.form-page') as HTMLElement;
    const barcode = await waitFor(() => {
      const node = sheet.querySelector('[data-bd-type="barcode"]') as HTMLElement | null;
      expect(node).toBeTruthy();
      return node as HTMLElement;
    });
    // Same coordinate system as the signature and the stamp — mm from the sheet corner.
    expect(barcode.style.position).toBe('absolute');
    expect(barcode.style.left).toMatch(/mm$/);
    expect(barcode.style.top).toMatch(/mm$/);
    await waitFor(() => expect(barcode.querySelector('img[alt="QR Code"]')).toBeTruthy());
  });

  /**
   * REGRESSION — no number is invented, ever.
   *
   * The first cut of this feature seeded the caption with `generateFormNumber`, so every
   * printed sheet carried a clock-derived `FRM-2026-XXXX` that resolved to no record at
   * all. The rule now is the opposite: the caption is the operator's reference or
   * nothing.
   */
  it('prints NO caption and generates NO number when the reference was never set', async () => {
    const { container } = await enableBarcode();
    const barcode = await waitFor(() => {
      const node = container.querySelector('[data-bd-type="barcode"]') as HTMLElement | null;
      expect(node?.querySelector('img[alt="QR Code"]')).toBeTruthy();
      return node as HTMLElement;
    });

    expect(barcode.textContent).toBe('');
    expect(barcode.textContent).not.toMatch(/FRM-/);
    // The whole page, not just the element — no generated number leaks anywhere.
    expect(container.textContent).not.toMatch(/FRM-\d{4}-\d+/);
  });

  it('prints the SAVED reference as the caption, verbatim', async () => {
    apiGet.mockResolvedValue({
      data: { data: withBarcodeSettings([{ key: 'print.barcode.reference', value: 'MN-2026-00125' }]) },
    });
    const { container } = await enableBarcode();

    await waitFor(() => {
      const barcode = container.querySelector('[data-bd-type="barcode"]') as HTMLElement | null;
      expect(barcode?.textContent).toBe('MN-2026-00125');
    });
  });


  it('carries the same designer hooks as the other elements, so it is selectable and draggable', async () => {
    const { container } = await enableBarcode();
    const barcode = await waitFor(() => {
      const node = container.querySelector('[data-bd-type="barcode"]') as HTMLElement | null;
      expect(node).toBeTruthy();
      return node as HTMLElement;
    });
    // `DesignableBrandingImage` locates every element by these two attributes — the
    // barcode answers to them identically, which is what makes it need no own designer.
    expect(barcode.getAttribute('data-designer-type')).toBe('branding');
    expect(barcode.getAttribute('data-designer-id')).toBe('barcode');
  });

  it('reaches every point of the sheet under the EXISTING envelope — no third limit', () => {
    // The barcode's anchor centre is (105, 210)mm, so it needs x ∈ ±105mm and
    // y ∈ [−210, +87]mm. Both are inside the envelope already derived for the other two,
    // which is why `BLANK_A4_LAYOUT_BOUNDS` does not move.
    const b = BLANK_A4_LAYOUT_BOUNDS;
    expect(b.minX).toBeLessThanOrEqual(-mm(105));
    expect(b.maxX).toBeGreaterThanOrEqual(mm(105));
    expect(b.minY).toBeLessThanOrEqual(-mm(210));
    expect(b.maxY).toBeGreaterThanOrEqual(mm(87));
  });

  it('is stored in the same record and is OPTIONAL — a pre-barcode layout still parses', () => {
    const legacy = JSON.stringify({
      invoice: { signature: DEFAULT_ELEMENT_LAYOUT, stamp: DEFAULT_ELEMENT_LAYOUT },
      quotation: { signature: DEFAULT_ELEMENT_LAYOUT, stamp: DEFAULT_ELEMENT_LAYOUT },
      'blank-a4-print': { signature: { ...DEFAULT_ELEMENT_LAYOUT, x: 40 }, stamp: DEFAULT_ELEMENT_LAYOUT },
    });
    const parsed = parseBrandingLayout(legacy);
    // The entry survives whole — a missing barcode must never invalidate a saved design…
    expect(parsed['blank-a4-print']?.signature.x).toBe(40);
    expect(parsed['blank-a4-print']?.barcode).toBeUndefined();
    // …and reads back as the identity layout, i.e. exactly the template's own anchor.
    expect(resolveBrandingElement(parsed['blank-a4-print']!, 'barcode')).toEqual(DEFAULT_ELEMENT_LAYOUT);

    // A designed barcode round-trips through the same parser.
    const withBarcode = JSON.stringify({
      invoice: { signature: DEFAULT_ELEMENT_LAYOUT, stamp: DEFAULT_ELEMENT_LAYOUT },
      quotation: { signature: DEFAULT_ELEMENT_LAYOUT, stamp: DEFAULT_ELEMENT_LAYOUT },
      'blank-a4-print': {
        signature: DEFAULT_ELEMENT_LAYOUT,
        stamp: DEFAULT_ELEMENT_LAYOUT,
        barcode: { ...DEFAULT_ELEMENT_LAYOUT, x: -70, y: 30 },
      },
    });
    expect(parseBrandingLayout(withBarcode)['blank-a4-print']?.barcode).toEqual({
      ...DEFAULT_ELEMENT_LAYOUT, x: -70, y: 30,
    });
  });

  it('reaches print, PDF and preview through the one existing pipeline — no special casing', async () => {
    let exported: string | undefined;
    (window as unknown as { manar: Record<string, unknown> }).manar = {
      exportPdfFromHtml: vi.fn((html: string) => { exported = html; return Promise.resolve(); }),
    };

    const { container } = await enableBarcode();
    await waitFor(() => expect(container.querySelector('[data-bd-type="barcode"] img')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /حفظ PDF/ }));
    await waitFor(() => expect(exported).toBeTruthy());

    // The exported document is composed from the sheet node alone; the barcode is inside
    // it and is NOT `.no-print`, so it travels with the signature and stamp untouched.
    const doc = new DOMParser().parseFromString(exported as string, 'text/html');
    const node = doc.querySelector('[data-bd-type="barcode"]');
    expect(node).toBeTruthy();
    expect(node?.closest('.no-print')).toBeNull();
    expect(node?.querySelector('img')).toBeTruthy();
  });
});

/**
 * Barcode Content Settings v1 — the barcode says what the operator typed, and nothing
 * else. These pin the three rules that make it useful for filing: the reference is the
 * caption, the next one is SUGGESTED (not reserved) from the last saved value, and the
 * whole thing rides the settings endpoint the page already writes to.
 */
describe('Barcode content — operator-authored, saved through the existing settings', () => {
  async function openDialog() {
    const utils = renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: /إعدادات الباركود/ })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /إعدادات الباركود/ }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    return utils;
  }

  const referenceBox = () => screen.getByLabelText('رقم المرجع') as HTMLInputElement;
  const subjectBox = () => screen.getByLabelText('عنوان / موضوع المستند') as HTMLInputElement;
  const detailsBox = () => screen.getByLabelText('بيانات إضافية') as HTMLTextAreaElement;
  /** Scoped to the dialog — the page toolbar also carries a «حفظ PDF» button. */
  const clickSave = () =>
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /حفظ/ }));

  /** The `settings` rows the last PUT carried, as a key → value map. */
  function lastSavedRows(): Record<string, string> {
    const [, body] = apiPut.mock.calls[apiPut.mock.calls.length - 1] as [string, { settings: Array<{ key: string; value: string; group: string }> }];
    return Object.fromEntries(body.settings.map((r) => [r.key, r.value]));
  }

  it('opens with empty fields the first time — nothing is proposed out of thin air', async () => {
    await openDialog();
    expect(referenceBox().value).toBe('');
    expect(subjectBox().value).toBe('');
    expect(detailsBox().value).toBe('');
  });

  it('proposes the NEXT reference from the last saved one, keeping its width', async () => {
    apiGet.mockResolvedValue({
      data: { data: withBarcodeSettings([{ key: 'print.barcode.reference', value: 'MN-2026-00125' }]) },
    });
    await openDialog();
    expect(referenceBox().value).toBe('MN-2026-00126');
  });

  it('offers a non-numeric reference back unchanged instead of guessing at it', async () => {
    apiGet.mockResolvedValue({
      data: { data: withBarcodeSettings([{ key: 'print.barcode.reference', value: 'قرار إداري' }]) },
    });
    await openDialog();
    expect(referenceBox().value).toBe('قرار إداري');
  });

  it('stays fully editable — the operator can replace the proposal outright', async () => {
    apiGet.mockResolvedValue({
      data: { data: withBarcodeSettings([{ key: 'print.barcode.reference', value: 'REF0009' }]) },
    });
    await openDialog();
    expect(referenceBox().value).toBe('REF0010');

    fireEvent.change(referenceBox(), { target: { value: 'كتاب رقم 154/2026' } });
    expect(referenceBox().value).toBe('كتاب رقم 154/2026');
  });

  it('saves the three fields as plain settings rows — no new endpoint, no new record shape', async () => {
    await openDialog();
    fireEvent.change(referenceBox(), { target: { value: '  MN-2026-00130  ' } });
    fireEvent.change(subjectBox(), { target: { value: 'طلب تجديد إقامة' } });
    fireEvent.change(detailsBox(), { target: { value: 'الإدارة المالية\nخاص وسري' } });
    clickSave();

    await waitFor(() => expect(apiPut).toHaveBeenCalled());
    const [url] = apiPut.mock.calls[0] as [string, unknown];
    expect(url).toBe('/settings');
    expect(lastSavedRows()).toEqual({
      // Trimmed on the way in, so what is saved is exactly what prints and exactly what
      // the next suggestion increments.
      'print.barcode.reference': 'MN-2026-00130',
      'print.barcode.subject': 'طلب تجديد إقامة',
      'print.barcode.details': 'الإدارة المالية\nخاص وسري',
      // A real reference advances the memory alongside it.
      'print.barcode.lastReference': 'MN-2026-00130',
    });
  });

  it('shows the saved reference on the sheet immediately, without re-fetching settings', async () => {
    const { container } = await openDialog();
    fireEvent.change(referenceBox(), { target: { value: 'MN-2026-00130' } });
    clickSave();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    const getCalls = apiGet.mock.calls.length;
    fireEvent.click(screen.getByLabelText('إظهار الباركود'));
    await waitFor(() => {
      const barcode = container.querySelector('[data-bd-type="barcode"]') as HTMLElement | null;
      expect(barcode?.textContent).toBe('MN-2026-00130');
    });
    expect(apiGet.mock.calls.length).toBe(getCalls);
  });

  it('carries the authored caption into the exported document — preview/print/PDF agree', async () => {
    apiGet.mockResolvedValue({
      data: { data: withBarcodeSettings([{ key: 'print.barcode.reference', value: 'MN-2026-00125' }]) },
    });
    let exported: string | undefined;
    (window as unknown as { manar: Record<string, unknown> }).manar = {
      exportPdfFromHtml: vi.fn((html: string) => { exported = html; return Promise.resolve(); }),
    };

    const { container } = renderPage();
    await waitFor(() => expect(screen.getByLabelText('إظهار الباركود')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('إظهار الباركود'));
    await waitFor(() =>
      expect((container.querySelector('[data-bd-type="barcode"]') as HTMLElement | null)?.textContent)
        .toBe('MN-2026-00125'),
    );

    fireEvent.click(screen.getByRole('button', { name: /حفظ PDF/ }));
    await waitFor(() => expect(exported).toBeTruthy());

    // The export composes from the live sheet node, so the caption travels as rendered —
    // there is no second formatting path that could disagree with the screen.
    const doc = new DOMParser().parseFromString(exported as string, 'text/html');
    const node = doc.querySelector('[data-bd-type="barcode"]');
    expect(node?.textContent).toBe('MN-2026-00125');
  });

  /**
   * Remembering the last values is what makes a run of similar documents quick: only the
   * reference advances, the two text fields come back exactly as they were.
   */
  it('brings the subject and details back verbatim — remembered, never rewritten', async () => {
    apiGet.mockResolvedValue({
      data: {
        data: withBarcodeSettings([
          { key: 'print.barcode.reference', value: 'MN-2026-00125' },
          { key: 'print.barcode.subject', value: 'طلب تجديد إقامة' },
          { key: 'print.barcode.details', value: 'الإدارة المالية\nخاص وسري' },
        ]),
      },
    });
    await openDialog();

    expect(referenceBox().value).toBe('MN-2026-00126'); // only this one advances
    expect(subjectBox().value).toBe('طلب تجديد إقامة');
    expect(detailsBox().value).toBe('الإدارة المالية\nخاص وسري');
  });

  it('clears the three fields on Reset — this window only', async () => {
    apiGet.mockResolvedValue({
      data: {
        data: withBarcodeSettings([
          { key: 'print.barcode.reference', value: 'MN-2026-00125' },
          { key: 'print.barcode.subject', value: 'طلب تجديد إقامة' },
          { key: 'print.barcode.details', value: 'خاص وسري' },
        ]),
      },
    });
    await openDialog();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /إعادة تعيين/ }));

    expect(referenceBox().value).toBe('');
    expect(subjectBox().value).toBe('');
    expect(detailsBox().value).toBe('');
    // Staged, not committed — nothing is written until Save.
    expect(apiPut).not.toHaveBeenCalled();
  });

  /**
   * REGRESSION — Reset must not restart the numbering.
   *
   * Folding "what prints" and "what to count from" into one stored value would make a
   * cleared reference erase the sequence, and the next document would start from nothing.
   */
  it('keeps the last reference remembered after Reset + Save, and suggests from it next time', async () => {
    apiGet.mockResolvedValue({
      data: { data: withBarcodeSettings([{ key: 'print.barcode.reference', value: 'MN-2026-00125' }]) },
    });
    const { unmount } = await openDialog();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /إعادة تعيين/ }));
    clickSave();
    await waitFor(() => expect(apiPut).toHaveBeenCalled());

    // Saved: an empty printed reference, but the memory advanced to nothing — it stands.
    expect(lastSavedRows()).toEqual({
      'print.barcode.reference': '',
      'print.barcode.subject': '',
      'print.barcode.details': '',
      'print.barcode.lastReference': 'MN-2026-00125',
    });

    // Re-open against that saved state: the proposal continues the sequence.
    unmount();
    apiGet.mockResolvedValue({
      data: {
        data: withBarcodeSettings([
          { key: 'print.barcode.reference', value: '' },
          { key: 'print.barcode.lastReference', value: 'MN-2026-00125' },
        ]),
      },
    });
    await openDialog();
    expect(referenceBox().value).toBe('MN-2026-00126');
  });

  it('reads a pre-Reset record (three keys, no memory key) without losing its sequence', async () => {
    apiGet.mockResolvedValue({
      data: { data: withBarcodeSettings([{ key: 'print.barcode.reference', value: 'REF0009' }]) },
    });
    await openDialog();
    expect(referenceBox().value).toBe('REF0010');
  });

  it('leaves the barcode GEOMETRY alone — content and layout are separate records', async () => {
    await openDialog();
    fireEvent.change(referenceBox(), { target: { value: 'MN-2026-00130' } });
    clickSave();
    await waitFor(() => expect(apiPut).toHaveBeenCalled());

    // The layout record is the designer's to write; a content save must never touch it.
    expect(Object.keys(lastSavedRows())).not.toContain('print.brandingLayout');
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
    // (`0` vs `0px`: jsdom's CSSOM normalises a bare `0` length to `0px` when
    // serialising captured `cssText` — a test-environment quirk, not a real document
    // difference; both are the same zero length in any renderer.)
    expect(html).toMatch(/@page\s*\{[^}]*margin:\s*0(px)?;/);
    expect(html).toMatch(/\.form-page\.blank-a4-sheet\s*\{[^}]*padding:\s*0(px)?\s*!important/);
    // The sheet's own height must survive the clone unchanged — the composed document
    // never rebuilds or overrides it.
    expect(html).toContain('height: 297mm');
  });

  it('strips screen-only chrome (rulers) from the exported document', async () => {
    renderPage();
    await waitFor(() => expect(document.querySelector('.form-page')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /حفظ PDF/ }));
    await waitFor(() => expect(exported).toBeTruthy());

    // Behavioural, not textual: composeStyledFromNode captures stylesheets WHOLESALE
    // (see styleCapture.ts), so the (inert — matches nothing) `.blank-a4-ruler-*` CSS
    // selectors legitimately appear as TEXT in the exported document's <style> block.
    // That is harmless — a rule with no matching element does nothing. The actual
    // invariant is that no ruler ELEMENT exists in the exported DOM, so parse the
    // document and check its real content, not raw string containment.
    const exportedDoc = new DOMParser().parseFromString(exported as string, 'text/html');
    for (const edge of RULER_EDGES) {
      expect(exportedDoc.querySelector(`[data-testid="a4-ruler-${edge}"]`)).toBeNull();
      expect(exportedDoc.body.className).not.toContain(`blank-a4-ruler-${edge}`);
    }
    expect(exportedDoc.body.querySelector('.blank-a4-ruler-top, .blank-a4-ruler-bottom, .blank-a4-ruler-left, .blank-a4-ruler-right')).toBeNull();
    // The exported body is the sheet alone — nothing else. (Plain className check, not
    // jest-dom's toHaveClass: a node parsed into a SEPARATE DOMParser document is not
    // an `instanceof HTMLElement` of THIS window's realm in jsdom.)
    expect(exportedDoc.body.children).toHaveLength(1);
    expect(exportedDoc.body.firstElementChild?.className).toBe('form-page blank-a4-sheet');
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
