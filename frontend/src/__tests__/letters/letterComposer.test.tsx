// @vitest-environment jsdom
/**
 * Letter Engine — the Official Letter Composer.
 *
 * Three things are protected here:
 *
 *  1. THE PAPER IS REAL. The sheet, the bands and the content band are sized from the
 *     Geometry Registry in millimetres — asserted against the registry rather than
 *     against numbers typed into this file, so a geometry change moves both together.
 *
 *  2. FORMATTING IS PER-PARAGRAPH. The toolbar carries no character-range control and
 *     the document never grows a second span.
 *
 *  3. THE PACK BOUNDARY. No printing, no PDF, no pagination, no barcode or signature
 *     rendering, no safe-zone validation, no registration. A source scan makes that
 *     mechanical.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { readFileSync } from 'node:fs';

const { apiMock } = vi.hoisted(() => ({
  apiMock: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
vi.mock('../../api/client', () => ({
  api: apiMock,
  errorMessage: (e: unknown) => (e instanceof Error ? e.message : 'خطأ'),
}));

const { permissions } = vi.hoisted(() => ({ permissions: { value: new Set<string>() } }));
vi.mock('../../stores/authStore', () => ({
  useAuth: () => ({ hasPermission: (p: string) => permissions.value.has(p) }),
}));

const { toastMock } = vi.hoisted(() => ({
  toastMock: { ok: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock('../../stores/toastStore', () => ({ useToast: () => toastMock }));

import LetterComposer from '../../pages/LetterComposer';
import { IMPLEMENTED_COMMANDS } from '../../components/letters/studio/DocumentToolbar';
import {
  getPageGeometry,
  contentTopForPageMm,
  reservedZonesMm,
  sideMarginMm,
  textBandBottomMm,
  pageSizeOf,
} from '../../letters/registry/geometryRegistry';
import { getTemplate } from '../../letters/registry/templateRegistry';
import { getTypographyPresetSet } from '../../letters/registry/typographyPresets';
import { PROHIBITED_TOOLBAR_COMMANDS } from '../../letters/registry/toolbarCommands';

const GEOMETRY = getPageGeometry('companyLetterhead', 1);

function letterPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: 5,
    templateKey: 'officialLetter',
    status: 'DRAFT',
    isArchived: false,
    reference: null,
    printProfileId: 'companyLetterhead',
    versions: { templateVersion: 1, layoutVersion: 1, barcodeVersion: 1 },
    issueDate: '2026-08-03T00:00:00.000Z',
    subject: 'طلب تمديد مدة العقد',
    recipient: { name: 'وزارة الأشغال', title: null, organisation: null },
    contentJson: '',
    contentModelVersion: 1,
    ...overrides,
  };
}

function renderComposer() {
  return render(
    <MemoryRouter initialEntries={['/forms/official-letter/5']}>
      <Routes>
        <Route path="/forms/official-letter/:id" element={<LetterComposer />} />
      </Routes>
    </MemoryRouter>,
  );
}

/**
 * The composer with the advanced-mode master switch already on.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE DEFAULT EXPERIENCE IS NOW THE SIMPLE ONE (Form Editor UX
 *  Simplification Pack v1). ADVANCED SURFACES MUST BE ASKED FOR.
 * ══════════════════════════════════════════════════════════════════════════
 * Rulers, the grid, the reserved-band overlays, the navigation rail, the mode tabs
 * and the full nineteen-control toolbar are all advanced surfaces. A test that wants
 * one of them says so HERE, which is what keeps "the page opens calm" an assertion
 * this file can also make (see the `Form Editor` block below) rather than something
 * every other test would silently contradict.
 *
 * The switch is seeded through `localStorage` rather than by clicking through the
 * menu because it is `usePersistedState`-backed and read at mount: seeding is one
 * line, deterministic, and does not make thirty unrelated assertions depend on the
 * menu's own markup.
 */
function renderAdvancedComposer() {
  localStorage.setItem('manarERP.letters.composer.advanced', 'true');
  return renderComposer();
}

/** All paragraph textareas, in document order. */
function paragraphs(): HTMLTextAreaElement[] {
  return Array.from(document.querySelectorAll('textarea.ls-paragraph'));
}

/**
 * The visible page stack.
 *
 * Queries are scoped to it because the hidden measurement layer renders a static
 * mirror of every item. That layer is `aria-hidden`, so assistive technology skips it,
 * but Testing Library's text queries do not — and a test that matched the mirror would
 * be asserting against something the user cannot see.
 */
function stack(): HTMLElement {
  return document.querySelector('.lp-stack') as HTMLElement;
}

/** The rendered sheets. */
function pages(): HTMLElement[] {
  return Array.from(document.querySelectorAll('.lp-page-slot'));
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  permissions.value = new Set(['letters.read', 'letters.update', 'letters.create']);
  apiMock.get.mockResolvedValue({ data: { data: letterPayload() } });
  apiMock.patch.mockResolvedValue({ data: { data: {} } });
});

afterEach(cleanup);

/* ── Sections ──────────────────────────────────────────────────────────── */

describe('The document is three independent sections', () => {
  it('renders all three, in order, with no single free editor', async () => {
    // Form Editor UX Rebuild v2 removed date, recipient and subject as fixed
    // sections — the document begins generic, and content is the only section an
    // author writes into directly.
    renderComposer();
    await waitFor(() => expect(paragraphs().length).toBeGreaterThan(0));

    // Asserted structurally rather than by the blocks' prose: P7 replaced the
    // placeholder captions with real signature and barcode rendering, and a test that
    // pinned the old wording was checking the caption, not the section.
    expect(stack().querySelector('.ls-signature')).not.toBeNull();
    expect(stack().querySelector('.ls-barcode')).not.toBeNull();

    // Structure, not one big box: no contenteditable anywhere.
    expect(document.querySelector('[contenteditable]')).toBeNull();
  });

  it('an UNREGISTERED letter reserves the signature and barcode space without filling it', async () => {
    // P7 made these blocks real. On a draft they are still empty — not because the
    // feature is missing, but because a draft has no reference to encode and no
    // signature is selected. The space is reserved so that registering a letter does
    // not reflow the page underneath it.
    renderComposer();
    await waitFor(() => expect(stack()).not.toBeNull());

    expect(within(stack()).getByText(/بلا توقيع/)).toBeInTheDocument();
    expect(within(stack()).getByText(/يُصدَر الرمز والرقم المرجعي عند التسجيل/)).toBeInTheDocument();

    // Nothing encoded, because there is nothing to encode yet.
    expect(document.querySelector('.ls-barcode img')).toBeNull();
    expect(document.querySelector('.ls-signature-image')).toBeNull();

    // …but the space is held, at the registry's dimensions.
    expect(document.querySelector('.ls-barcode-reserved')).not.toBeNull();
  });

  it('the measurement mirror is hidden from assistive technology', async () => {
    renderComposer();
    await waitFor(() => expect(stack()).not.toBeNull());
    const layer = document.querySelector('.lp-measure-layer') as HTMLElement;
    expect(layer).not.toBeNull();
    expect(layer.getAttribute('aria-hidden')).toBe('true');
    // And it carries no focusable control — it mirrors read-only renderings only.
    expect(layer.querySelector('textarea, input, button, select')).toBeNull();
  });
});

/* ── Geometry ──────────────────────────────────────────────────────────── */

describe('The paper is the Geometry Registry, rendered', () => {
  it('sizes the sheet to the registry’s page size in millimetres', async () => {
    renderComposer();
    await waitFor(() => expect(paragraphs().length).toBeGreaterThan(0));

    const sheet = document.querySelector('.lp-sheet') as HTMLElement;
    const page = pageSizeOf(GEOMETRY);
    expect(sheet.style.width).toBe(`${page.widthMm}mm`);
    expect(sheet.style.height).toBe(`${page.heightMm}mm`);
  });

  it('draws both reserved bands at the registry’s offsets', async () => {
    // Advanced: the bands are an overlay ABOUT the paper, suppressed in the simple
    // experience so a blank sheet reads as a blank sheet. The geometry they are drawn
    // from is unchanged, which is what this asserts.
    renderAdvancedComposer();
    await waitFor(() => expect(paragraphs().length).toBeGreaterThan(0));

    const zones = reservedZonesMm(GEOMETRY);
    const header = document.querySelector('.lp-zone--header') as HTMLElement;
    const footer = document.querySelector('.lp-zone--footer') as HTMLElement;

    expect(header.style.top).toBe(`${zones[0].startMm}mm`);
    expect(header.style.height).toBe(`${zones[0].endMm - zones[0].startMm}mm`);
    expect(footer.style.top).toBe(`${zones[1].startMm}mm`);
    expect(footer.style.height).toBe(`${zones[1].endMm - zones[1].startMm}mm`);
  });

  it('places the content band at the registry’s content top, width and side margin', async () => {
    renderComposer();
    await waitFor(() => expect(paragraphs().length).toBeGreaterThan(0));

    const band = document.querySelector('.lp-band') as HTMLElement;
    expect(band.style.top).toBe(`${contentTopForPageMm(GEOMETRY, 0)}mm`);
    expect(band.style.width).toBe(`${GEOMETRY.contentWidthMm}mm`);
    expect(band.style.height).toBe(`${textBandBottomMm(GEOMETRY) - contentTopForPageMm(GEOMETRY, 0)}mm`);
    expect(band.style.insetInlineStart).toBe(`${sideMarginMm(GEOMETRY)}mm`);
  });

  it('renders four millimetre rulers, and can hide them', async () => {
    renderAdvancedComposer();
    await waitFor(() => expect(paragraphs().length).toBeGreaterThan(0));
    expect(document.querySelectorAll('.lp-ruler')).toHaveLength(4);

    fireEvent.click(screen.getByLabelText('المساطر'));
    await waitFor(() => expect(document.querySelectorAll('.lp-ruler')).toHaveLength(0));
  });

  it('the grid is optional and off by default', async () => {
    renderAdvancedComposer();
    await waitFor(() => expect(paragraphs().length).toBeGreaterThan(0));
    expect(document.querySelector('.lp-grid')).toBeNull();

    fireEvent.click(screen.getByLabelText('الشبكة'));
    await waitFor(() => expect(document.querySelector('.lp-grid')).not.toBeNull());
  });

  it('the reserved bands can be hidden — they are a view option, not a rule', async () => {
    renderAdvancedComposer();
    await waitFor(() => expect(paragraphs().length).toBeGreaterThan(0));
    fireEvent.click(screen.getByLabelText('المناطق المحجوزة'));
    await waitFor(() => expect(document.querySelector('.lp-zone')).toBeNull());
  });

  it('ZOOM SCALES THE VIEWPORT AND NEVER THE DOCUMENT', async () => {
    renderComposer();
    await waitFor(() => expect(paragraphs().length).toBeGreaterThan(0));

    const sheet = () => document.querySelector('.lp-sheet') as HTMLElement;
    const band = () => document.querySelector('.lp-band') as HTMLElement;
    const before = { height: sheet().style.height, width: sheet().style.width, bandTop: band().style.top };

    fireEvent.change(screen.getByLabelText('التكبير'), { target: { value: '1.5' } });
    await waitFor(() =>
      expect((document.querySelector('.lp-scale') as HTMLElement).style.transform).toBe('scale(1.5)'),
    );

    // Every document measurement is byte-identical: only the transform changed.
    expect(sheet().style.height).toBe(before.height);
    expect(sheet().style.width).toBe(before.width);
    expect(band().style.top).toBe(before.bandTop);
  });

  it('offers the full zoom ladder plus both fitted modes', async () => {
    // Extended by Document Studio Foundation v1 from five rungs to seven: 25% is what
    // makes a ten-page letter legible as a SHAPE, and 200% is what makes a 14 pt line
    // readable on a high-density display.
    renderComposer();
    const select = (await screen.findByLabelText('التكبير')) as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toEqual(['0.25', '0.5', '0.75', '1', '1.25', '1.5', '2', 'fitWidth', 'fitPage']);
  });
});

/* ── Page flow ─────────────────────────────────────────────────────────── */

describe('The document is a sequence of physical pages', () => {
  it('renders at least one sheet, even for an empty letter', async () => {
    renderComposer();
    await waitFor(() => expect(pages().length).toBeGreaterThanOrEqual(1));
  });

  it('labels every sheet with its position in the document', async () => {
    renderComposer();
    await waitFor(() => expect(pages().length).toBeGreaterThanOrEqual(1));
    expect(within(pages()[0]).getByText(/صفحة 1 من/)).toBeInTheDocument();
  });

  it('NOTHING SCROLLS INSIDE THE PAPER — the band has no scrollbar', async () => {
    // The defining change of this pack: overflow becomes another page, never a
    // scrollbar hiding content inside a sheet.
    renderComposer();
    await waitFor(() => expect(paragraphs().length).toBeGreaterThan(0));
    const band = document.querySelector('.lp-band') as HTMLElement;
    const overflow = getComputedStyle(band).overflow;
    expect(overflow).not.toContain('auto');
    expect(overflow).not.toContain('scroll');
  });

  it('lays out each sheet with ITS OWN page geometry', async () => {
    // A continuation sheet must use continuation values, not the first page's.
    renderComposer();
    await waitFor(() => expect(pages().length).toBeGreaterThanOrEqual(1));
    const firstBand = pages()[0].querySelector('.lp-band') as HTMLElement;
    expect(firstBand.style.top).toBe(`${contentTopForPageMm(GEOMETRY, 0)}mm`);
  });

  it('offers no manual page-break control — flow is automatic only', async () => {
    renderComposer();
    await waitFor(() => expect(paragraphs().length).toBeGreaterThan(0));
    const toolbar = screen.getByRole('toolbar', { name: 'أدوات التنسيق' });
    expect(within(toolbar).queryByLabelText('فاصل صفحة')).toBeNull();
  });
});

describe('Page navigation', () => {
  it('shows the current page and the total', async () => {
    // The quick-jump field lives in the navigation rail, which is an advanced surface;
    // the status-bar readout below is NOT, and is asserted in both modes.
    renderAdvancedComposer();
    // The quick-jump field moved into the navigation rail with Document Studio; the
    // page/total readout now lives in the status bar beside the word count.
    const input = (await screen.findByLabelText('الانتقال إلى صفحة')) as HTMLInputElement;
    expect(input.value).toBe('1');
    const status = screen.getByRole('status', { name: 'شريط الحالة' });
    expect(within(status).getByText(/صفحة 1 من \d+/)).toBeInTheDocument();
  });

  it('bounds the go-to-page control to the document', async () => {
    renderAdvancedComposer();
    const input = (await screen.findByLabelText('الانتقال إلى صفحة')) as HTMLInputElement;
    expect(input.min).toBe('1');
    expect(Number(input.max)).toBeGreaterThanOrEqual(1);
  });

  it('marks the first sheet as current in the mini map', async () => {
    // Replaces the previous "previous is disabled" assertion: the prev/next buttons
    // were retired with `PageNavigator`, and the rail answers the same question —
    // "where am I" — by marking the current thumbnail instead.
    renderAdvancedComposer();
    const first = await screen.findByLabelText('الصفحة 1');
    expect(first).toHaveAttribute('aria-current', 'page');
  });
});

/* ── The simple experience (Form Editor UX Simplification Pack v1) ──────── */

describe('Form Editor — the page opens as a blank sheet, not as a studio', () => {
  it('shows the paper, the essential toolbar and the insert rail — nothing else', async () => {
    // Form Editor UX Rebuild v2 made Insert a PRIMARY surface, open by default —
    // the left column of the mockup's three, not a studio panel to hide.
    renderComposer();
    await waitFor(() => expect(paragraphs().length).toBeGreaterThan(0));

    // The paper is there and typing works — that is the whole first impression.
    expect(stack()).not.toBeNull();
    expect(paragraphs().length).toBeGreaterThan(0);
    expect(document.querySelector('.ins-panel')).not.toBeNull();  // quick insert — default open

    // …and none of the rest of the studio is.
    expect(document.querySelector('.lp-ruler')).toBeNull();
    expect(document.querySelector('.lp-grid')).toBeNull();
    expect(document.querySelector('.lp-zone')).toBeNull();
    expect(document.querySelector('.dnv-rail')).toBeNull();   // navigator / layers
    expect(document.querySelector('.dpp-panel')).toBeNull();  // document properties
    expect(document.querySelector('.obi-panel')).toBeNull();  // object inspector — Design mode only
    expect(screen.queryByRole('tablist', { name: 'وضع التحرير' })).toBeNull();
  });

  it('keeps Save and Print on the strip — they are the whole everyday workflow', async () => {
    renderComposer();
    await waitFor(() => expect(paragraphs().length).toBeGreaterThan(0));

    expect(screen.getByRole('button', { name: 'حفظ' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'طباعة' })).toBeInTheDocument();
    expect(screen.getByLabelText('تصدير')).toBeInTheDocument();
  });

  it('the essential toolbar carries the everyday tools and drops the rest', async () => {
    renderComposer();
    await waitFor(() => expect(paragraphs().length).toBeGreaterThan(0));
    const toolbar = screen.getByRole('toolbar', { name: 'أدوات التنسيق' });

    // Present: what someone writing a document actually reaches for.
    for (const present of ['عريض', 'تسطير', 'تظليل', 'ضبط', 'توسيط', 'قائمة مرقّمة', 'قائمة نقطية', 'إزالة التنسيق', 'تراجع', 'إعادة']) {
      expect(within(toolbar).getByLabelText(present)).toBeInTheDocument();
    }

    // Absent — but only from the DEFAULT view. Every one of these is still permitted
    // by the template and still implemented; the advanced-mode assertion below is what
    // proves nothing was removed.
    for (const hidden of ['رفع', 'خفض', 'زيادة الإزاحة', 'تقليل الإزاحة', 'ناسخ التنسيق', 'لصق كنص عادي', 'التباعد والإزاحة', 'بحث واستبدال']) {
      expect(within(toolbar).queryByLabelText(hidden)).toBeNull();
    }
  });

  it('ADVANCED MODE RESTORES EVERY HIDDEN CONTROL — nothing was removed', async () => {
    renderAdvancedComposer();
    await waitFor(() => expect(paragraphs().length).toBeGreaterThan(0));
    const toolbar = screen.getByRole('toolbar', { name: 'أدوات التنسيق' });

    for (const restored of ['رفع', 'خفض', 'زيادة الإزاحة', 'تقليل الإزاحة', 'ناسخ التنسيق', 'لصق كنص عادي', 'التباعد والإزاحة', 'بحث واستبدال']) {
      expect(within(toolbar).getByLabelText(restored)).toBeInTheDocument();
    }
    // The mode tabs come back with it.
    expect(screen.getByRole('tablist', { name: 'وضع التحرير' })).toBeInTheDocument();
  });

  it('offers ONE door to everything advanced', async () => {
    renderComposer();
    await waitFor(() => expect(paragraphs().length).toBeGreaterThan(0));

    const trigger = screen.getByRole('button', { name: /أدوات متقدّمة/ });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(trigger);
    const menu = await screen.findByRole('menu', { name: 'أدوات متقدّمة' });

    // Every surface still genuinely advanced is reachable from here, by name.
    // Insert left with Form Editor UX Rebuild v2 — it is a primary surface now,
    // reached from its own toggle on the strip rather than from this menu.
    for (const destination of [
      'تصميم التخطيط',
      'لوحة الطبقات',
      'شرط ظهور الفقرة',
      'معاينة قيم المتغيّرات',
      'بحث واستبدال',
      'نتائج التحقّق',
      'خصائص المستند',
      'لوحة التنقّل',
    ]) {
      expect(within(menu).getByRole('menuitem', { name: new RegExp(destination) })).toBeInTheDocument();
    }
    expect(within(menu).getByRole('menuitemcheckbox', { name: /الوضع المتقدّم/ })).toBeInTheDocument();
  });

  it('a destination opens its surface without the master switch', async () => {
    renderComposer();
    await waitFor(() => expect(paragraphs().length).toBeGreaterThan(0));

    fireEvent.click(screen.getByRole('button', { name: /أدوات متقدّمة/ }));
    const menu = await screen.findByRole('menu', { name: 'أدوات متقدّمة' });
    fireEvent.click(within(menu).getByRole('menuitem', { name: /خصائص المستند/ }));

    // The rail opened, the menu closed, and the toolbar stayed essential — progressive
    // disclosure reveals ONE thing, not the whole studio.
    await waitFor(() => expect(document.querySelector('.dpp-panel')).not.toBeNull());
    expect(screen.queryByRole('menu', { name: 'أدوات متقدّمة' })).toBeNull();
    const toolbar = screen.getByRole('toolbar', { name: 'أدوات التنسيق' });
    expect(within(toolbar).queryByLabelText('ناسخ التنسيق')).toBeNull();
  });

  it('entering Design mode reveals the tabs, so there is always a way back', async () => {
    // The one case where a hidden surface MUST appear without the master switch: a
    // designer opened from the menu with no visible exit would be a trap.
    renderComposer();
    await waitFor(() => expect(paragraphs().length).toBeGreaterThan(0));
    expect(screen.queryByRole('tablist', { name: 'وضع التحرير' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /أدوات متقدّمة/ }));
    const menu = await screen.findByRole('menu', { name: 'أدوات متقدّمة' });
    fireEvent.click(within(menu).getByRole('menuitem', { name: /تصميم التخطيط/ }));

    const tabs = await screen.findByRole('tablist', { name: 'وضع التحرير' });
    const back = within(tabs).getByRole('tab', { name: /تحرير النص/ });
    fireEvent.click(back);

    // …and using it returns to the calm surface, tabs included.
    await waitFor(() => expect(screen.queryByRole('tablist', { name: 'وضع التحرير' })).toBeNull());
  });
});

/* ── Live validation ───────────────────────────────────────────────────── */

describe('Validation is quiet — it reports, it no longer refuses', () => {
  /**
   * ══════════════════════════════════════════════════════════════════════════
   *  THE PANEL IS NOW EXCEPTIONAL, NOT AMBIENT (Form Editor UX Rebuild v2).
   * ══════════════════════════════════════════════════════════════════════════
   * A missing subject, an empty body and an unregistered draft used to be blocking
   * findings, so the panel was on screen from the first frame of every document. All
   * three are now the author's business, which leaves a normal document with nothing
   * blocking — and a permanent panel reporting nothing is exactly the surface people
   * learn to ignore.
   *
   * So in the simple experience it appears only when it has something that MUST be
   * acted on. In advanced mode it is always mounted, which is where its own behaviour
   * — politeness, no modal, keyboard-reachable findings — is still asserted.
   */

  it('stays away entirely on an ordinary document', async () => {
    renderComposer();
    await waitFor(() => expect(paragraphs().length).toBeGreaterThan(0));
    // Nothing blocking, nothing to say, nothing on screen.
    expect(screen.queryByRole('region', { name: 'نتائج التحقّق' })).toBeNull();
  });

  it('does not refuse an empty, subject-less draft — Print stays available', async () => {
    // Each of those was a separate blocking rule before the rebuild: E1, E2 and E3.
    apiMock.get.mockResolvedValue({ data: { data: letterPayload({ subject: '', contentJson: '' }) } });
    renderComposer();
    await waitFor(() => expect(paragraphs().length).toBeGreaterThan(0));

    expect(screen.getByRole('button', { name: 'طباعة' })).not.toBeDisabled();
    expect(screen.getByLabelText('تصدير')).not.toBeDisabled();
  });

  it('shows a summary without opening anything, in advanced mode', async () => {
    renderAdvancedComposer();
    const panel = await screen.findByRole('region', { name: 'نتائج التحقّق' });
    // A status line, present from the start — not a dialog that had to be dismissed.
    expect(within(panel).getByRole('button', { expanded: false })).toBeInTheDocument();
  });

  it('uses NO modal, alert or dialog for findings', async () => {
    renderAdvancedComposer();
    await screen.findByRole('region', { name: 'نتائج التحقّق' });
    // The details drawer is the only dialog the composer ever opens, and it is not here.
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('announces status politely rather than stealing focus', async () => {
    renderAdvancedComposer();
    const panel = await screen.findByRole('region', { name: 'نتائج التحقّق' });
    expect(panel.querySelector('[aria-live="polite"]')).not.toBeNull();
  });

  it('an unresolved {{variable}} is no longer validated at all', async () => {
    // Form Editor UX Rebuild v2 DELETED E18/E19/E20 — not downgraded further, deleted.
    // A document containing «{{Employee}}» is now ordinary text as far as validation is
    // concerned: nothing reports it, and nothing about printing it is disabled.
    apiMock.get.mockResolvedValue({
      data: {
        data: letterPayload({
          contentJson: JSON.stringify({
            contentModelVersion: 4,
            blocks: [{
              id: 'b1',
              kind: 'paragraph',
              spans: [{ text: 'السيد {{Employee}}', marks: [] }],
              attributes: { fontId: 'traditionalArabic', sizePt: 16, alignment: 'justify', indentLevel: 0 },
            }],
          }),
        }),
      },
    });
    renderComposer();
    await waitFor(() => expect(paragraphs().length).toBeGreaterThan(0));

    expect(screen.queryByRole('region', { name: 'نتائج التحقّق' })).toBeNull();
    expect(screen.getByRole('button', { name: 'طباعة' })).not.toBeDisabled();
  });

  it('no longer reports validation as incomplete — every selected rule runs', async () => {
    renderAdvancedComposer();
    const panel = await screen.findByRole('region', { name: 'نتائج التحقّق' });
    fireEvent.click(within(panel).getByRole('button', { expanded: false }));
    await within(panel).findByRole('button', { expanded: true });
    expect(within(panel).queryByText(/قاعدة تحقّق تنتظر حزمًا لاحقة/)).toBeNull();
  });
});


/* ── Typography ────────────────────────────────────────────────────────── */

describe('Typography comes from the template presets', () => {
  const presets = getTypographyPresetSet(getTemplate('officialLetter').typographyPresetSetId);

  it('the body is Traditional Arabic at the preset size', async () => {
    renderComposer();
    await waitFor(() => expect(paragraphs().length).toBeGreaterThan(0));
    const style = paragraphs()[0].style;
    expect(style.fontSize).toBe(`${presets.body.sizePt}pt`);
    // The family arrives as a registry-built stack, never a typed name.
    expect(style.fontFamily).toContain('Traditional Arabic');
  });

  it('a heading block is marked distinctly from a plain paragraph', async () => {
    // Form Editor UX Rebuild v2 removed the fixed subject section, which used to be
    // the only surface styled with the heading face. `heading` content blocks are now
    // the sole carrier of that distinction — see the `kindClass` handling in
    // `LetterSections`'s `Paragraph`.
    apiMock.get.mockResolvedValue({
      data: {
        data: letterPayload({
          contentJson: JSON.stringify({
            contentModelVersion: 4,
            blocks: [{
              id: 'h1',
              kind: 'heading',
              spans: [{ text: 'عنوان المستند', marks: [] }],
              attributes: { fontId: 'amiri', sizePt: presets.heading.sizePt, alignment: 'center', indentLevel: 0, headingLevel: 1 },
            }],
          }),
        }),
      },
    });
    renderComposer();
    await waitFor(() => expect(paragraphs().length).toBeGreaterThan(0));
    expect(paragraphs()[0].className).toContain('ls-paragraph--heading');
    expect(paragraphs()[0].style.fontFamily).toContain('Amiri');
  });
});

/* ── Toolbar ───────────────────────────────────────────────────────────── */

describe('The toolbar is the approved minimal set', () => {
  it('shows only the intersection of template allow-list and implemented commands', async () => {
    renderComposer();
    await waitFor(() => expect(paragraphs().length).toBeGreaterThan(0));
    const toolbar = screen.getByRole('toolbar', { name: 'أدوات التنسيق' });

    for (const label of ['عريض', 'تسطير', 'ضبط', 'محاذاة للبداية', 'توسيط', 'إزالة التنسيق', 'تراجع', 'إعادة']) {
      expect(within(toolbar).getByLabelText(label)).toBeInTheDocument();
    }
    expect(within(toolbar).getByLabelText('مقاس الخط')).toBeInTheDocument();
    expect(within(toolbar).getByLabelText('خط الفقرة')).toBeInTheDocument();
  });

  it('omits commands the template permits but this pack has not implemented', async () => {
    // Lists and indent SHIPPED in Document Studio Foundation v1. Page break did not:
    // the engine's flow is still automatic only, and rule W7_sparseManualPageBreak is
    // still deselected for exactly that reason. So the intersection mechanism is still
    // doing its job — it is simply down to one absentee instead of five.
    // The FULL variant, because that is where the template/implementation
    // intersection is visible in its entirety. The essential variant adds a third
    // term to the same intersection and is asserted separately below.
    renderAdvancedComposer();
    await waitFor(() => expect(paragraphs().length).toBeGreaterThan(0));
    const toolbar = screen.getByRole('toolbar', { name: 'أدوات التنسيق' });

    expect(within(toolbar).queryByLabelText('فاصل صفحة')).toBeNull();
    expect(IMPLEMENTED_COMMANDS).not.toContain('pageBreak');

    // …and the four that arrived are genuinely present, so this test cannot pass by
    // the toolbar having quietly stopped rendering anything at all.
    for (const present of ['قائمة مرقّمة', 'قائمة نقطية', 'زيادة الإزاحة', 'تقليل الإزاحة']) {
      expect(within(toolbar).getByLabelText(present)).toBeInTheDocument();
    }
  });

  it('contains no prohibited tool — italic, colour, tables, images', async () => {
    renderComposer();
    await waitFor(() => expect(paragraphs().length).toBeGreaterThan(0));
    for (const prohibited of PROHIBITED_TOOLBAR_COMMANDS) {
      expect(IMPLEMENTED_COMMANDS).not.toContain(prohibited.id as never);
    }
    const toolbar = screen.getByRole('toolbar', { name: 'أدوات التنسيق' });
    expect(within(toolbar).queryByLabelText('مائل')).toBeNull();
    expect(toolbar.querySelector('input[type="color"]')).toBeNull();
  });

  it('formatting is disabled until a paragraph is focused', async () => {
    renderComposer();
    await waitFor(() => expect(paragraphs().length).toBeGreaterThan(0));
    expect(screen.getByLabelText('عريض')).toBeDisabled();

    fireEvent.focus(paragraphs()[0]);
    await waitFor(() => expect(screen.getByLabelText('عريض')).toBeEnabled());
  });
});

/* ── Editing ───────────────────────────────────────────────────────────── */

describe('Editing is paragraph-oriented', () => {
  async function focusFirstParagraph() {
    renderComposer();
    await waitFor(() => expect(paragraphs().length).toBeGreaterThan(0));
    fireEvent.focus(paragraphs()[0]);
    return paragraphs()[0];
  }

  it('types into a paragraph', async () => {
    const p = await focusFirstParagraph();
    fireEvent.change(p, { target: { value: 'السلام عليكم' } });
    await waitFor(() => expect(paragraphs()[0].value).toBe('السلام عليكم'));
  });

  it('Enter creates a new paragraph', async () => {
    const p = await focusFirstParagraph();
    fireEvent.change(p, { target: { value: 'الفقرة الأولى' } });
    fireEvent.keyDown(paragraphs()[0], { key: 'Enter' });
    await waitFor(() => expect(paragraphs()).toHaveLength(2));
  });

  it('Backspace at the start merges into the previous paragraph', async () => {
    const p = await focusFirstParagraph();
    fireEvent.change(p, { target: { value: 'أول' } });
    fireEvent.keyDown(paragraphs()[0], { key: 'Enter' });
    await waitFor(() => expect(paragraphs()).toHaveLength(2));

    fireEvent.change(paragraphs()[1], { target: { value: 'ثانٍ' } });
    paragraphs()[1].setSelectionRange(0, 0);
    fireEvent.keyDown(paragraphs()[1], { key: 'Backspace' });

    await waitFor(() => expect(paragraphs()).toHaveLength(1));
    expect(paragraphs()[0].value).toBe('أولثانٍ');
  });

  it('bold applies to the WHOLE paragraph', async () => {
    const p = await focusFirstParagraph();
    fireEvent.change(p, { target: { value: 'نص كامل' } });
    fireEvent.click(screen.getByLabelText('عريض'));

    await waitFor(() => expect(paragraphs()[0].style.fontWeight).toBe('700'));
    // One control, one weight — there is no way to bold part of it.
    expect(paragraphs()[0].value).toBe('نص كامل');
  });

  it('alignment and size apply to the paragraph', async () => {
    const p = await focusFirstParagraph();
    fireEvent.click(screen.getByLabelText('توسيط'));
    await waitFor(() => expect(paragraphs()[0].style.textAlign).toBe('center'));

    fireEvent.change(screen.getByLabelText('مقاس الخط'), { target: { value: '18' } });
    await waitFor(() => expect(paragraphs()[0].style.fontSize).toBe('18pt'));
    expect(p).toBeDefined();
  });

  it('undo reverses a formatting change', async () => {
    const p = await focusFirstParagraph();
    fireEvent.change(p, { target: { value: 'نص' } });
    fireEvent.click(screen.getByLabelText('عريض'));
    await waitFor(() => expect(paragraphs()[0].style.fontWeight).toBe('700'));

    fireEvent.click(screen.getByLabelText('تراجع'));
    await waitFor(() => expect(paragraphs()[0].style.fontWeight).toBe('400'));
  });
});

/* ── Floating selection toolbar (Document Studio UX Polish Pack v1) ──────── */

describe('Floating selection toolbar', () => {
  async function focusFirstParagraph() {
    renderComposer();
    await waitFor(() => expect(paragraphs().length).toBeGreaterThan(0));
    fireEvent.focus(paragraphs()[0]);
    return paragraphs()[0];
  }

  it('stays absent for a plain caret — only a RANGE opens it', async () => {
    const p = await focusFirstParagraph();
    fireEvent.change(p, { target: { value: 'نص كامل' } });
    p.setSelectionRange(3, 3);
    fireEvent.select(p);
    await waitFor(() => expect(document.querySelector('.fct-bar')).toBeNull());
  });

  it('appears when a range is selected, and reuses the SAME bold command', async () => {
    const p = await focusFirstParagraph();
    fireEvent.change(p, { target: { value: 'نص كامل' } });
    p.setSelectionRange(0, 3);
    fireEvent.select(p);

    const bar = await waitFor(() => {
      const el = document.querySelector('.fct-bar');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });

    // Two "عريض" buttons exist while the floating bar is open — the docked one and this
    // one — so the query is scoped to the floating bar, not `screen`.
    fireEvent.click(within(bar).getByLabelText('عريض'));
    // The SAME command DocumentToolbar's own Bold button calls: it applies to the whole
    // paragraph, never a character range, exactly as the "bold applies to the WHOLE
    // paragraph" case above already proves for the docked button.
    await waitFor(() => expect(paragraphs()[0].style.fontWeight).toBe('700'));
    expect(paragraphs()[0].value).toBe('نص كامل');
  });

  it('closes once the selection collapses back to a caret', async () => {
    const p = await focusFirstParagraph();
    fireEvent.change(p, { target: { value: 'نص كامل' } });
    p.setSelectionRange(0, 3);
    fireEvent.select(p);
    await waitFor(() => expect(document.querySelector('.fct-bar')).not.toBeNull());

    p.setSelectionRange(3, 3);
    fireEvent.select(p);
    await waitFor(() => expect(document.querySelector('.fct-bar')).toBeNull());
  });
});

/* ── Persistence ───────────────────────────────────────────────────────── */

describe('Saving', () => {
  it('sends the block model as JSON, never HTML', async () => {
    renderComposer();
    await waitFor(() => expect(paragraphs().length).toBeGreaterThan(0));
    fireEvent.focus(paragraphs()[0]);
    fireEvent.change(paragraphs()[0], { target: { value: 'محتوى الخطاب' } });

    fireEvent.click(await screen.findByRole('button', { name: 'حفظ' }));
    await waitFor(() => expect(apiMock.patch).toHaveBeenCalled());

    const body = apiMock.patch.mock.calls[0][1];
    expect(body.contentJson).toContain('محتوى الخطاب');
    expect(body.contentJson).not.toMatch(/<[a-z]/i);
    const parsed = JSON.parse(body.contentJson);
    expect(Array.isArray(parsed.blocks)).toBe(true);
    expect(parsed.blocks[0].spans).toHaveLength(1);
  });

  it('still round-trips the subject and recipient kept off the paper as metadata', async () => {
    // Form Editor UX Rebuild v2 stopped rendering these on the sheet, but they stay in
    // the data model — the barcode payload, the registration snapshot and the
    // workspace list's columns/search/sort all still read them (see `LetterWorkspace`).
    // No editor surface writes them yet, so this only proves a save does not drop what
    // was loaded.
    renderComposer();
    await waitFor(() => expect(paragraphs().length).toBeGreaterThan(0));
    // Save is disabled until the document is dirty — an edit to the body is enough to
    // arm it, and is the only editable surface left.
    fireEvent.focus(paragraphs()[0]);
    fireEvent.change(paragraphs()[0], { target: { value: 'محتوى الخطاب' } });

    fireEvent.click(await screen.findByRole('button', { name: 'حفظ' }));
    await waitFor(() => expect(apiMock.patch).toHaveBeenCalled());

    const body = apiMock.patch.mock.calls[0][1];
    expect(body.subject).toBe(letterPayload().subject);
    expect(body.recipientName).toBe(letterPayload().recipient.name);
  });

  it('starts a fresh document when stored content is unreadable', async () => {
    // A draft with corrupt content is still a draft the user can rewrite.
    apiMock.get.mockResolvedValue({ data: { data: letterPayload({ contentJson: '{not json' }) } });
    renderComposer();
    await waitFor(() => expect(paragraphs()).toHaveLength(1));
    expect(paragraphs()[0].value).toBe('');
  });

  it('restores a stored document', async () => {
    const stored = JSON.stringify({
      contentModelVersion: 1,
      blocks: [
        { id: 'x', kind: 'paragraph', spans: [{ text: 'محفوظ', marks: ['bold'] }], attributes: { fontId: 'amiri', sizePt: 18, alignment: 'center', indentLevel: 0 } },
      ],
    });
    apiMock.get.mockResolvedValue({ data: { data: letterPayload({ contentJson: stored }) } });

    renderComposer();
    await waitFor(() => expect(paragraphs()).toHaveLength(1));
    expect(paragraphs()[0].value).toBe('محفوظ');
    expect(paragraphs()[0].style.fontWeight).toBe('700');
    expect(paragraphs()[0].style.textAlign).toBe('center');
  });
});

/* ── Read-only ─────────────────────────────────────────────────────────── */

describe('A registered letter is read-only', () => {
  it('shows why, and offers no editable paragraph', async () => {
    apiMock.get.mockResolvedValue({
      data: { data: letterPayload({ status: 'REGISTERED', reference: 'OL-2026-000001' }) },
    });
    renderComposer();

    expect(await screen.findByText(/محتوى المستند مُجمَّد منذ التسجيل/)).toBeInTheDocument();
    expect(paragraphs()).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'حفظ' })).toBeNull();
    // Said TWICE, deliberately: the header pill answers "what is this letter", the
    // status bar's editing-mode chip answers "what can I do right now". Both are read
    // at different moments, so the assertions are scoped rather than de-duplicated.
    expect(screen.getAllByText('للقراءة فقط')).toHaveLength(2);
    const status = screen.getByRole('status', { name: 'شريط الحالة' });
    expect(within(status).getByText('للقراءة فقط')).toBeInTheDocument();
  });

  it('is read-only without the update permission, even for a draft', async () => {
    permissions.value = new Set(['letters.read']);
    renderComposer();
    const status = await screen.findByRole('status', { name: 'شريط الحالة' });
    expect(within(status).getByText('للقراءة فقط')).toBeInTheDocument();
    expect(paragraphs()).toHaveLength(0);
  });
});

/* ── Failure ───────────────────────────────────────────────────────────── */

describe('Load failure', () => {
  it('surfaces the error and offers a way back', async () => {
    apiMock.get.mockRejectedValue(new Error('تعذّر تحميل الخطاب'));
    renderComposer();
    expect(await screen.findByRole('alert')).toHaveTextContent('تعذّر تحميل الخطاب');
    expect(screen.getByRole('button', { name: /العودة إلى القائمة/ })).toBeInTheDocument();
  });
});

/* ── Pack boundary ─────────────────────────────────────────────────────── */

describe('P3 boundary — nothing from a later pack is present', () => {
  const SOURCES = [
    'src/pages/LetterComposer.tsx',
    'src/components/letters/LetterPaper.tsx',
    'src/components/letters/LetterPageStack.tsx',
    'src/components/letters/useLetterPagination.ts',
    'src/components/letters/LetterSections.tsx',
    // Document Studio replaced `ComposerToolbar` and `PageNavigator` with these; the
    // boundary they are scanned for is unchanged.
    'src/components/letters/studio/DocumentToolbar.tsx',
    'src/components/letters/studio/DocumentStatusBar.tsx',
    'src/components/letters/studio/DocumentNavigator.tsx',
    'src/components/letters/studio/FindReplacePanel.tsx',
    'src/components/letters/studio/zoom.ts',
    'src/letters/editor/blockCommands.ts',
    'src/letters/pagination/paginate.ts',
    'src/letters/pagination/measure.ts',
  ]
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n');
  const code = SOURCES.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('has no printing, PDF or export path', () => {
    for (const forbidden of ['printCurrentView', 'composeStyledFromNode', 'exportPdfFromHtml', 'createPrintJob', 'submitPrintJob', 'window.print', 'downloadBlob']) {
      expect(code, `found "${forbidden}"`).not.toContain(forbidden);
    }
  });

  it('reuses the ERP’s branding and code engines rather than growing its own', () => {
    // P7 turned this boundary inside out: the composer now DOES render a barcode and a
    // signature, and what matters is that it does so through the infrastructure the
    // rest of the ERP already uses. A second encoder or a private asset store would be
    // the real violation.
    expect(code).toContain('useCompanyBranding');
    expect(code).toContain('buildBarcodePayload');

    // No parallel implementation: no encoder here, no upload path, no asset storage.
    for (const forbidden of ['jsbarcode', 'JsBarcode', 'bwip', 'Code128', 'new Image(', 'FileReader']) {
      expect(code, `found "${forbidden}"`).not.toContain(forbidden);
    }
  });

  it('inserts no MANUAL page break — flow is automatic only', () => {
    // Automatic pagination arrived with the geometry pack; a manual break command is a
    // separate, still-deferred feature.
    for (const forbidden of ['insertPageBreak', 'manualPageBreak', "kind: 'pageBreak'"]) {
      expect(code, `found "${forbidden}"`).not.toContain(forbidden);
    }
  });

  it('performs no safe-zone VALIDATION — the bands are drawn, never enforced', () => {
    // Measurement now exists, for pagination. What must remain absent is anything that
    // judges or blocks on the reserved bands.
    for (const forbidden of ['overshoot', 'runValidation', 'hasBlockingIssues', 'E4_reservedZoneOverlap', 'assertNoBlockingIssues']) {
      expect(code, `found "${forbidden}"`).not.toContain(forbidden);
    }
  });

  it('registers through the existing endpoint, with no allocation logic of its own', () => {
    // P7 made registration a composer action. What must remain absent is any attempt
    // to invent a number on the client: the sequence, the format and the register all
    // belong to the server, inside one transaction.
    expect(code).toContain('registerLetter');
    for (const forbidden of ['lastValue', 'sequence +', 'padStart(6', 'allocateReference']) {
      expect(code, `found "${forbidden}"`).not.toContain(forbidden);
    }
  });

  it('produces and parses no HTML', () => {
    for (const forbidden of ['innerHTML', 'dangerouslySetInnerHTML', 'contentEditable', 'DOMParser', 'insertAdjacentHTML']) {
      expect(code, `found "${forbidden}"`).not.toContain(forbidden);
    }
  });

  it('writes no font-family literal — only registry ids', () => {
    expect(code).not.toMatch(/fontFamily\s*:\s*['"`](?!inherit)/);
    for (const family of ['Traditional Arabic', 'Amiri', 'Cairo', 'Tahoma']) {
      expect(code, `found family "${family}"`).not.toContain(`'${family}'`);
    }
  });
});
