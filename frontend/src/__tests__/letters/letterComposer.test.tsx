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
import { IMPLEMENTED_COMMANDS } from '../../components/letters/ComposerToolbar';
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

describe('The document is six independent sections', () => {
  it('renders all six, in order, with no single free editor', async () => {
    renderComposer();
    await screen.findByLabelText('تاريخ الخطاب');

    expect(screen.getByLabelText('تاريخ الخطاب')).toBeInTheDocument();
    expect(screen.getByLabelText('الجهة المرسل إليها — الاسم')).toBeInTheDocument();
    expect(screen.getByLabelText('موضوع الخطاب')).toBeInTheDocument();
    expect(paragraphs().length).toBeGreaterThan(0);
    // Asserted structurally rather than by the blocks' prose: P7 replaced the
    // placeholder captions with real signature and barcode rendering, and a test that
    // pinned the old wording was checking the caption, not the section.
    expect(stack().querySelector('.ls-signature')).not.toBeNull();
    expect(stack().querySelector('.ls-barcode')).not.toBeNull();

    // Structure, not one big box: no contenteditable anywhere.
    expect(document.querySelector('[contenteditable]')).toBeNull();
  });

  it('the recipient is structured into three fields, not one free line', async () => {
    renderComposer();
    await screen.findByLabelText('الجهة المرسل إليها — الاسم');
    expect(screen.getByLabelText('الجهة المرسل إليها — الصفة')).toBeInTheDocument();
    expect(screen.getByLabelText('الجهة المرسل إليها — الجهة')).toBeInTheDocument();
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
    await screen.findByLabelText('موضوع الخطاب');

    const sheet = document.querySelector('.lp-sheet') as HTMLElement;
    const page = pageSizeOf(GEOMETRY);
    expect(sheet.style.width).toBe(`${page.widthMm}mm`);
    expect(sheet.style.height).toBe(`${page.heightMm}mm`);
  });

  it('draws both reserved bands at the registry’s offsets', async () => {
    renderComposer();
    await screen.findByLabelText('موضوع الخطاب');

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
    await screen.findByLabelText('موضوع الخطاب');

    const band = document.querySelector('.lp-band') as HTMLElement;
    expect(band.style.top).toBe(`${contentTopForPageMm(GEOMETRY, 0)}mm`);
    expect(band.style.width).toBe(`${GEOMETRY.contentWidthMm}mm`);
    expect(band.style.height).toBe(`${textBandBottomMm(GEOMETRY) - contentTopForPageMm(GEOMETRY, 0)}mm`);
    expect(band.style.insetInlineStart).toBe(`${sideMarginMm(GEOMETRY)}mm`);
  });

  it('renders four millimetre rulers, and can hide them', async () => {
    renderComposer();
    await screen.findByLabelText('موضوع الخطاب');
    expect(document.querySelectorAll('.lp-ruler')).toHaveLength(4);

    fireEvent.click(screen.getByLabelText('المساطر'));
    await waitFor(() => expect(document.querySelectorAll('.lp-ruler')).toHaveLength(0));
  });

  it('the grid is optional and off by default', async () => {
    renderComposer();
    await screen.findByLabelText('موضوع الخطاب');
    expect(document.querySelector('.lp-grid')).toBeNull();

    fireEvent.click(screen.getByLabelText('الشبكة'));
    await waitFor(() => expect(document.querySelector('.lp-grid')).not.toBeNull());
  });

  it('the reserved bands can be hidden — they are a view option, not a rule', async () => {
    renderComposer();
    await screen.findByLabelText('موضوع الخطاب');
    fireEvent.click(screen.getByLabelText('المناطق المحجوزة'));
    await waitFor(() => expect(document.querySelector('.lp-zone')).toBeNull());
  });

  it('ZOOM SCALES THE VIEWPORT AND NEVER THE DOCUMENT', async () => {
    renderComposer();
    await screen.findByLabelText('موضوع الخطاب');

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
    renderComposer();
    const select = (await screen.findByLabelText('التكبير')) as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toEqual(['0.5', '0.75', '1', '1.25', '1.5', 'fitWidth', 'fitPage']);
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
    await screen.findByLabelText('موضوع الخطاب');
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
    renderComposer();
    const input = (await screen.findByLabelText('الانتقال إلى صفحة')) as HTMLInputElement;
    expect(input.value).toBe('1');
    // Scoped to the navigator — each sheet also captions itself "صفحة N من M".
    const navigator = screen.getByRole('group', { name: 'التنقّل بين الصفحات والتكبير' });
    expect(within(navigator).getByText(/من \d+/)).toBeInTheDocument();
  });

  it('bounds the go-to-page control to the document', async () => {
    renderComposer();
    const input = (await screen.findByLabelText('الانتقال إلى صفحة')) as HTMLInputElement;
    expect(input.min).toBe('1');
    expect(Number(input.max)).toBeGreaterThanOrEqual(1);
  });

  it('disables previous on the first page', async () => {
    renderComposer();
    expect(await screen.findByLabelText('الصفحة السابقة')).toBeDisabled();
  });
});

/* ── Live validation ───────────────────────────────────────────────────── */

describe('Validation is live, and never interrupts', () => {
  it('shows a summary without opening anything', async () => {
    renderComposer();
    const panel = await screen.findByRole('region', { name: 'نتائج التحقّق' });
    // A status line, present from the start — not a dialog that had to be dismissed.
    expect(within(panel).getByRole('button', { expanded: false })).toBeInTheDocument();
  });

  it('uses NO modal, alert or dialog for findings', async () => {
    renderComposer();
    await screen.findByRole('region', { name: 'نتائج التحقّق' });
    // The details drawer is the only dialog the composer ever opens, and it is not here.
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('announces status politely rather than stealing focus', async () => {
    renderComposer();
    const panel = await screen.findByRole('region', { name: 'نتائج التحقّق' });
    expect(panel.querySelector('[aria-live="polite"]')).not.toBeNull();
  });

  it('reports a missing subject as a blocking finding once opened', async () => {
    apiMock.get.mockResolvedValue({ data: { data: letterPayload({ subject: '' }) } });
    renderComposer();

    const panel = await screen.findByRole('region', { name: 'نتائج التحقّق' });
    fireEvent.click(within(panel).getByRole('button', { expanded: false }));

    // Findings are keyboard-reachable buttons labelled with severity AND message.
    const finding = await within(panel).findByRole('button', { name: /خطأ مانع: لا يمكن إصدار خطاب بلا موضوع/ });
    expect(finding).toBeInTheDocument();
  });

  it('offers a suggested fix alongside the problem', async () => {
    apiMock.get.mockResolvedValue({ data: { data: letterPayload({ subject: '' }) } });
    renderComposer();
    const panel = await screen.findByRole('region', { name: 'نتائج التحقّق' });
    fireEvent.click(within(panel).getByRole('button', { expanded: false }));
    expect(await within(panel).findByText(/اكتب موضوع الخطاب/)).toBeInTheDocument();
  });

  it('clicking a finding focuses the offending section', async () => {
    apiMock.get.mockResolvedValue({ data: { data: letterPayload({ subject: '' }) } });
    renderComposer();
    const panel = await screen.findByRole('region', { name: 'نتائج التحقّق' });
    fireEvent.click(within(panel).getByRole('button', { expanded: false }));

    const finding = await within(panel).findByRole('button', { name: /لا يمكن إصدار خطاب بلا موضوع/ });
    fireEvent.click(finding);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('موضوع الخطاب')));
  });

  it('no longer reports validation as incomplete — every selected rule now runs', async () => {
    // The inverse of what this asserted before P7. The panel used to disclose that
    // rules had never run; now there are none, so the disclosure must be absent —
    // otherwise it would be lying in the opposite direction.
    renderComposer();
    const panel = await screen.findByRole('region', { name: 'نتائج التحقّق' });
    fireEvent.click(within(panel).getByRole('button', { expanded: false }));
    await within(panel).findByRole('button', { expanded: true });
    expect(within(panel).queryByText(/قاعدة تحقّق تنتظر حزمًا لاحقة/)).toBeNull();
  });

  it('marks the section inline, without disturbing the text', async () => {
    apiMock.get.mockResolvedValue({ data: { data: letterPayload({ subject: '' }) } });
    renderComposer();
    await screen.findByLabelText('موضوع الخطاب');

    // The badge rides on the section LABEL — chrome that already exists — so nothing
    // about the paragraph being written moves or reflows.
    await waitFor(() => expect(document.querySelector('.lp-stack .vp-marker')).not.toBeNull());
    expect(document.querySelector('.ls-paragraph .vp-marker')).toBeNull();
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

  it('the subject uses the heading face at its preset weight', async () => {
    renderComposer();
    const subject = await screen.findByLabelText('موضوع الخطاب');
    const container = subject.closest('.ls-subject') as HTMLElement;
    expect(container.style.fontSize).toBe(`${presets.subject.sizePt}pt`);
    expect(container.style.fontWeight).toBe(String(presets.subject.weight));
    expect(container.style.fontFamily).toContain('Amiri');
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
    // Lists, indent and page break are in the template's approved list. They are not
    // implemented here, so they are absent — a later pack adds a command, not a
    // template entry.
    renderComposer();
    await waitFor(() => expect(paragraphs().length).toBeGreaterThan(0));
    const toolbar = screen.getByRole('toolbar', { name: 'أدوات التنسيق' });

    for (const absent of ['قائمة مرقّمة', 'قائمة نقطية', 'زيادة الإزاحة', 'تقليل الإزاحة', 'فاصل صفحة']) {
      expect(within(toolbar).queryByLabelText(absent)).toBeNull();
    }
    for (const id of ['listNumbered', 'listBulleted', 'indent', 'outdent', 'pageBreak']) {
      expect(IMPLEMENTED_COMMANDS).not.toContain(id);
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

  it('sends the structured recipient and the subject', async () => {
    renderComposer();
    const subject = await screen.findByLabelText('موضوع الخطاب');
    fireEvent.change(subject, { target: { value: 'موضوع محدَّث' } });
    fireEvent.change(screen.getByLabelText('الجهة المرسل إليها — الجهة'), { target: { value: 'وزارة الأشغال' } });

    fireEvent.click(await screen.findByRole('button', { name: 'حفظ' }));
    await waitFor(() => expect(apiMock.patch).toHaveBeenCalled());

    const body = apiMock.patch.mock.calls[0][1];
    expect(body.subject).toBe('موضوع محدَّث');
    expect(body.recipientOrganisation).toBe('وزارة الأشغال');
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

    expect(await screen.findByText(/محتوى الخطاب مُجمَّد منذ التسجيل/)).toBeInTheDocument();
    expect(paragraphs()).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'حفظ' })).toBeNull();
    expect(screen.getByText('للقراءة فقط')).toBeInTheDocument();
  });

  it('is read-only without the update permission, even for a draft', async () => {
    permissions.value = new Set(['letters.read']);
    renderComposer();
    await screen.findByText('للقراءة فقط');
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
    'src/components/letters/PageNavigator.tsx',
    'src/components/letters/useLetterPagination.ts',
    'src/components/letters/LetterSections.tsx',
    'src/components/letters/ComposerToolbar.tsx',
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
