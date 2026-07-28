// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { readFileSync } from 'node:fs';
import { MemoryRouter } from 'react-router-dom';
import { ROUTER_FUTURE } from './helpers/router';
import { PrintWorkspace } from '../components/print-workspace';
import FormLayout from '../forms/shared/FormLayout';
import { PRINT_PROFILES } from '../forms/shared/printProfiles';

/** Extract the body of the `@media print { … }` at-rule by brace matching.
 *  Matches the actual at-rule (`@media print {`), not the words "@media print"
 *  that also appear in the file's header comment. */
function mediaPrintBlock(css: string): string {
  const m = /@media\s+print\s*\{/.exec(css);
  if (!m) throw new Error('@media print block not found');
  const open = m.index + m[0].length - 1; // index of the opening brace
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error('unbalanced @media print block');
}

afterEach(() => {
  cleanup();
  // Reset the Electron bridge stub between tests.
  delete (window as unknown as { manar?: unknown }).manar;
});

describe('PrintWorkspace shell', () => {
  it('renders the wrapped document content unchanged', () => {
    render(
      <PrintWorkspace toolbar={<button>Print</button>}>
        <div className="form-page">DOCUMENT BODY</div>
      </PrintWorkspace>,
    );
    expect(screen.getByText('DOCUMENT BODY')).toBeInTheDocument();
    expect(document.querySelector('.form-page')).toHaveTextContent('DOCUMENT BODY');
  });

  it('renders the supplied toolbar controls', () => {
    render(
      <PrintWorkspace toolbar={<button>طباعة</button>}>
        <div>body</div>
      </PrintWorkspace>,
    );
    expect(screen.getByRole('button', { name: 'طباعة' })).toBeInTheDocument();
  });

  it('marks all shell chrome with pw-chrome so it is hidden in print', () => {
    const { container } = render(
      <PrintWorkspace
        toolbar={<button>Print</button>}
        sidebar={<div>settings</div>}
        documentName="Doc"
        paperSize="A4"
      >
        <div className="form-page">body</div>
      </PrintWorkspace>,
    );
    for (const sel of ['.pw-toolbar', '.pw-statusbar', '.pw-sidebar', '.pw-preview-toolbar', '.pw-footer']) {
      const el = container.querySelector(sel);
      expect(el, `${sel} should exist`).not.toBeNull();
      expect(el!.classList.contains('pw-chrome'), `${sel} should be pw-chrome`).toBe(true);
    }
    // The document itself must NOT be chrome — it must print.
    expect(container.querySelector('.form-page')!.classList.contains('pw-chrome')).toBe(false);
  });

  it('opens in "Fit to Page" mode', () => {
    render(
      <PrintWorkspace toolbar={<span />}>
        <div className="form-page">body</div>
      </PrintWorkspace>,
    );
    // Initial view is "Fit to Page". jsdom has no real layout (0×0 container), so the
    // computed pixel scale isn't meaningful here — assert the fit mode itself, which
    // drives the actual on-screen scale once a real container is measured.
    expect(screen.getByRole('button', { name: 'ملاءمة الصفحة' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('zoom buttons change only the preview transform, not the document, and clear fit mode', () => {
    render(
      <PrintWorkspace toolbar={<span />}>
        <div className="form-page">body</div>
      </PrintWorkspace>,
    );
    const scaler = screen.getByTestId('pw-scaler');

    fireEvent.click(screen.getByRole('button', { name: 'تكبير' }));
    expect(scaler.style.transform).toBe('scale(1.1)');
    // An explicit zoom action leaves "Fit to Page" mode.
    expect(screen.getByRole('button', { name: 'ملاءمة الصفحة' })).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'تصغير' }));
    fireEvent.click(screen.getByRole('button', { name: 'تصغير' }));
    expect(scaler.style.transform).toBe('scale(0.9)');

    // Reset (100%) restores scale.
    fireEvent.click(screen.getByRole('button', { name: 'إعادة التكبير إلى 100%' }));
    expect(scaler.style.transform).toBe('scale(1)');

    // Zoom never leaks onto the document body itself.
    expect(document.querySelector('.form-page')!.getAttribute('style') ?? '').not.toContain('scale');
  });

  it('Ctrl + wheel zooms the preview only', () => {
    const { container } = render(
      <PrintWorkspace toolbar={<span />}>
        <div className="form-page">body</div>
      </PrintWorkspace>,
    );
    const scaler = screen.getByTestId('pw-scaler');
    const canvas = container.querySelector('.pw-canvas')!;
    fireEvent.wheel(canvas, { ctrlKey: true, deltaY: -100 });
    expect(scaler.style.transform).toBe('scale(1.1)');
    // A plain wheel (no Ctrl) must NOT change zoom.
    fireEvent.wheel(canvas, { ctrlKey: false, deltaY: -100 });
    expect(scaler.style.transform).toBe('scale(1.1)');
  });

  it('collapses and restores the settings sidebar', () => {
    render(
      <PrintWorkspace toolbar={<span />} sidebar={<div>SETTINGS BODY</div>}>
        <div className="form-page">body</div>
      </PrintWorkspace>,
    );
    expect(screen.getByText('SETTINGS BODY')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'إخفاء إعدادات الطباعة' }));
    expect(screen.queryByText('SETTINGS BODY')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'إظهار إعدادات الطباعة' }));
    expect(screen.getByText('SETTINGS BODY')).toBeInTheDocument();
  });

  it('More menu can toggle the settings sidebar', () => {
    render(
      <PrintWorkspace toolbar={<span />} sidebar={<div>SETTINGS BODY</div>}>
        <div className="form-page">body</div>
      </PrintWorkspace>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'خيارات عرض إضافية' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'إظهار/إخفاء لوحة الإعدادات' }));
    expect(screen.queryByText('SETTINGS BODY')).not.toBeInTheDocument();
  });
});

describe('PrintWorkspace print CSS isolates the document (no dark frame)', () => {
  // vitest runs with cwd = frontend/
  const css = readFileSync('src/components/print-workspace/PrintWorkspace.css', 'utf8');
  const printBlock = mediaPrintBlock(css);

  it('strips every paintable surface off the workspace wrappers in print', () => {
    // Electron printToPDF does not reliably collapse `display: contents`, so a
    // surviving wrapper box must still paint nothing — otherwise the dark theme
    // --bg / --surface-2 frames the page. Guard the fallback declarations.
    expect(printBlock).toMatch(/background:\s*transparent\s*!important/);
    expect(printBlock).toMatch(/box-shadow:\s*none\s*!important/);
    expect(printBlock).toMatch(/border:\s*0\s*!important/);
    expect(printBlock).toMatch(/padding:\s*0\s*!important/);
  });

  it('keeps display: contents so the wrappers ideally collapse out of layout', () => {
    expect(printBlock).toMatch(/display:\s*contents\s*!important/);
  });

  it('hides all workspace chrome in print', () => {
    expect(printBlock).toMatch(/\.pw-chrome\s*\{[^}]*display:\s*none\s*!important/);
  });

  it('forces a white page base so no dark surface can frame the document', () => {
    expect(printBlock).toMatch(/background:\s*#fff\s*!important/);
  });
});

describe('FormLayout inside the workspace', () => {
  function renderForm() {
    return render(
      <MemoryRouter future={ROUTER_FUTURE}>
        <FormLayout
          ready={false}
          formNumber="FORM-001"
          title="شهادة راتب"
          profile="plain-a4"
          qrData={{ formType: 't', formNumber: 'FORM-001', entityName: 'x', entityId: 1 }}
        >
          {/* Screen-only "print fields" override panel — hidden by @media print,
              must be stripped from the exported PDF just like the physical print. */}
          <div className="no-print">
            <div>حقول الطباعة فقط — لن تُحفظ</div>
            <input type="date" title="تاريخ" />
            <select title="نوع"><option>أ</option></select>
            <button type="button">↺ مسح حقول الطباعة</button>
          </div>
          <div>BODY CONTENT HERE</div>
        </FormLayout>
      </MemoryRouter>,
    );
  }

  it('still renders the document title and body', () => {
    renderForm();
    expect(screen.getByText('BODY CONTENT HERE')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'شهادة راتب' })).toBeInTheDocument();
    expect(document.querySelector('.print-workspace')).not.toBeNull();
    expect(document.querySelector('.form-page')).not.toBeNull();
  });

  it('Save PDF exports ONLY the .form-page as a standalone document via exportPdfFromHtml', async () => {
    const exportPdfFromHtml = vi.fn().mockResolvedValue({ success: true });
    const exportPdf = vi.fn().mockResolvedValue({ success: true });
    (window as unknown as {
      manar: { exportPdfFromHtml: typeof exportPdfFromHtml; exportPdf: typeof exportPdf };
    }).manar = { exportPdfFromHtml, exportPdf };

    renderForm();
    fireEvent.click(screen.getByRole('button', { name: /حفظ PDF/ }));

    // doExportPdf dynamic-imports the document builder, so the call resolves async.
    await waitFor(() => expect(exportPdfFromHtml).toHaveBeenCalledTimes(1));

    const [html, name] = exportPdfFromHtml.mock.calls[0] as [string, string];
    expect(name).toBe('FORM-001');
    // A self-contained A4 document carrying the printable page…
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('@page');
    expect(html).toContain('class="form-page"');
    expect(html).toContain('BODY CONTENT HERE');
    // …real document content (the ApprovalSection) survives the cleaning…
    expect(html).toContain('اعتماد المدير المباشر');
    // …and NOT the live PrintWorkspace shell (the black-frame source).
    expect(html).not.toContain('print-workspace');
    expect(html).not.toContain('pw-canvas');
    // Forms must no longer use the live-window bridge that captured the dark frame.
    expect(exportPdf).not.toHaveBeenCalled();
  });

  it('Save PDF strips screen-only .no-print override controls from the exported PDF', async () => {
    const exportPdfFromHtml = vi.fn().mockResolvedValue({ success: true });
    (window as unknown as {
      manar: { exportPdfFromHtml: typeof exportPdfFromHtml };
    }).manar = { exportPdfFromHtml };

    renderForm();
    fireEvent.click(screen.getByRole('button', { name: /حفظ PDF/ }));
    await waitFor(() => expect(exportPdfFromHtml).toHaveBeenCalledTimes(1));

    const [html] = exportPdfFromHtml.mock.calls[0] as [string];
    // The whole "print fields only" panel and its controls must be gone.
    expect(html).not.toContain('no-print');
    expect(html).not.toContain('حقول الطباعة فقط');
    expect(html).not.toContain('مسح حقول الطباعة');
    expect(html).not.toContain('<input');
    expect(html).not.toContain('<select');
    // But the real document content must remain.
    expect(html).toContain('BODY CONTENT HERE');
    expect(html).toContain('اعتماد المدير المباشر');
  });
});

// ── "Ready Paper" Phase 2 — official logo header, centrally derived from the
// profile's `logoHeader` flag (no `profile === 'ready-paper'` check anywhere) ──
describe('FormLayout — per-profile logo header (ready-paper Phase 2)', () => {
  function renderWithProfile(profile: 'plain-a4' | 'letterhead' | 'ready-paper') {
    return render(
      <MemoryRouter future={ROUTER_FUTURE}>
        <FormLayout
          ready={false}
          formNumber="FORM-001"
          title="عنوان"
          profile={profile}
          qrData={{ formType: 't', formNumber: 'FORM-001', entityName: 'x', entityId: 1 }}
        >
          <div>BODY CONTENT HERE</div>
        </FormLayout>
      </MemoryRouter>,
    );
  }

  it('letterhead: header stays fully hidden, no logo image — unchanged from before this pack', () => {
    const { container } = renderWithProfile('letterhead');
    expect(container.querySelector('img')).toBeNull();
    const headerWrapper = container.querySelector('div[style*="border-bottom"]');
    expect(headerWrapper).not.toBeNull();
    expect(headerWrapper).toHaveStyle({ display: 'none' });
  });

  it('ready-paper: renders the official logo header (visible, not hidden)', () => {
    const { container } = renderWithProfile('ready-paper');
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    // Same single flattened image asset used by the Payment Voucher's logo header
    // (logo mark + Arabic + English name as one unit) — no HTML text rebuild.
    expect(img!.getAttribute('src')).toMatch(/logohead/);
    const headerWrapper = img!.parentElement!.parentElement!;
    expect(headerWrapper.getAttribute('style')).toContain('border-bottom');
    expect(headerWrapper).not.toHaveStyle({ display: 'none' });
  });

  it('plain-a4: unaffected — plain-text header, no logo, no hidden header', () => {
    const { container } = renderWithProfile('plain-a4');
    expect(container.querySelector('img')).toBeNull();
    const headerWrapper = container.querySelector('div[style*="border-bottom"]');
    expect(headerWrapper).not.toHaveStyle({ display: 'none' });
    expect(container.textContent).toContain('شركة المنار الدولية');
  });

  it('ready-paper and letterhead produce the SAME effective page geometry — ready-paper just moves the identical values from the @page margin to `.form-page` padding (page-level model)', () => {
    const printBlockOf = (container: HTMLElement) =>
      mediaPrintBlock(container.querySelector('style')!.textContent!);
    const geometryOf = (block: string) => ({
      pageMargin: /@page\s*\{[^}]*margin:\s*([^;]+);/.exec(block)?.[1],
      formPagePadding: /\.form-page\s*\{[^}]*?padding:\s*([^;]+?)\s*!important;/.exec(block)?.[1],
    });

    const letterhead = geometryOf(printBlockOf(renderWithProfile('letterhead').container));
    const readyPaper = geometryOf(printBlockOf(renderWithProfile('ready-paper').container));

    // Content box: letterhead insets via the page margin, ready-paper via padding.
    expect(letterhead).toEqual({ pageMargin: '40mm 10mm 20mm 10mm', formPagePadding: '0' });
    expect(readyPaper).toEqual({ pageMargin: '0', formPagePadding: '40mm 10mm 20mm 10mm' });

    // Same numbers either way — the source of truth is untouched.
    expect(PRINT_PROFILES['ready-paper'].margins).toEqual(PRINT_PROFILES['letterhead'].margins);
  });
});

// ── "Ready Paper" Phase 3 — the Phase 2 logo pushed content down (a real header
// box in normal flow). Fix: render it as an out-of-flow overlay pinned to the
// page's own top edge, contributing zero height to the content that follows. ──
describe('FormLayout — ready-paper logo renders as an out-of-flow overlay (Phase 3 fix)', () => {
  function renderWithProfile(profile: 'plain-a4' | 'letterhead' | 'ready-paper' | 'payment-voucher', extraProps = {}) {
    return render(
      <MemoryRouter future={ROUTER_FUTURE}>
        <FormLayout
          ready={false}
          formNumber="FORM-001"
          title="عنوان"
          profile={profile}
          qrData={{ formType: 't', formNumber: 'FORM-001', entityName: 'x', entityId: 1 }}
          {...extraProps}
        >
          <div>BODY CONTENT HERE</div>
        </FormLayout>
      </MemoryRouter>,
    );
  }

  it('.form-page is a positioning context (position: relative) for every profile — a no-op unless a child opts into absolute positioning', () => {
    for (const profile of ['plain-a4', 'letterhead', 'ready-paper'] as const) {
      const { container, unmount } = renderWithProfile(profile);
      expect((container.querySelector('.form-page') as HTMLElement).style.position).toBe('relative');
      unmount();
    }
  });

  it('ready-paper: the logo header is an absolute overlay anchored at top:0 — NEVER a negative offset, which would place it outside `.form-page` and get it clipped by every surface that renders that node alone (composeStyledFromNode, formPdfDocument, paged print)', () => {
    const { container } = renderWithProfile('ready-paper');
    const img = container.querySelector('img')!;
    const headerWrapper = img.parentElement!.parentElement as HTMLElement;
    expect(headerWrapper.style.position).toBe('absolute');
    // Page-level model: `.form-page` is the whole A4 sheet, so the offset is
    // measured from the SHEET edge. A small POSITIVE value buys tolerance at the
    // crop boundary (which lands exactly on the artwork's first inked row).
    const topMm = parseFloat(headerWrapper.style.top);
    expect(headerWrapper.style.top).toMatch(/mm$/);
    expect(topMm).toBeGreaterThan(0);
    expect(topMm).toBeLessThan(parseFloat(PRINT_PROFILES['ready-paper'].margins.top)); // never into the content
    // Inset horizontally by the profile's own side margins so the header stays
    // exactly as wide as the content column (artwork is not scaled up by the
    // extra 20mm of sheet width).
    expect(headerWrapper.style.left).toBe(PRINT_PROFILES['ready-paper'].margins.left);
    expect(headerWrapper.style.right).toBe(PRINT_PROFILES['ready-paper'].margins.right);
    // Regression guard for the clipping defect: no negative offset, ever.
    expect(headerWrapper.style.top.startsWith('-')).toBe(false);
    expect(headerWrapper.style.top).not.toContain('calc');
  });

  it('ready-paper: the overlay drops the in-flow divider rule and its padding (it would otherwise draw a line across the top of the content column)', () => {
    const { container } = renderWithProfile('ready-paper');
    const header = (container.querySelector('img') as HTMLElement).parentElement!.parentElement as HTMLElement;
    // jsdom serializes the `border-bottom: none` shorthand back as 'medium';
    // the longhand style is the meaningful assertion (verified in a real browser
    // as computed `border-bottom-width: 0px`).
    expect(header.style.borderBottomStyle).toBe('none');
    expect(header.style.paddingBottom).toBe('0px');
  });

  it('ready-paper: a PRINT-ONLY rule pushes the letterhead clear of the printer\'s non-printable band and scales it UNIFORMLY (never separate x/y)', () => {
    const { container } = renderWithProfile('ready-paper');
    const printBlock = mediaPrintBlock(container.querySelector('style')!.textContent!);
    const rule = /\[data-page-logo-header\]\s*\{([^}]*)\}/.exec(printBlock)?.[1];
    expect(rule).toBeTruthy();
    // Pushed down to a safe band, well clear of a 3–5mm hardware edge…
    const top = parseFloat(/top:\s*([\d.]+)mm/.exec(rule!)![1]);
    expect(top).toBeGreaterThanOrEqual(3);
    expect(top).toBeLessThan(parseFloat(PRINT_PROFILES['ready-paper'].margins.top));
    // …and scaled by a SINGLE uniform factor, so the aspect ratio cannot change.
    expect(rule).toMatch(/transform:\s*scale\(0?\.\d+\)/);
    expect(rule).not.toMatch(/scale\([^)]*,/); // no scale(x, y)
    expect(rule).not.toMatch(/scaleX|scaleY/);
    expect(rule).toContain('transform-origin: top center');
    // It must stay inside @media print so the approved preview is untouched.
    const fullStyle = container.querySelector('style')!.textContent!;
    const beforePrint = fullStyle.slice(0, fullStyle.indexOf('@media print'));
    expect(beforePrint).not.toContain('data-page-logo-header');
  });

  it('no other profile emits the print-only letterhead compensation', () => {
    for (const profile of ['letterhead', 'plain-a4'] as const) {
      const { container, unmount } = renderWithProfile(profile);
      expect(container.querySelector('style')!.textContent).not.toContain('data-page-logo-header');
      unmount();
    }
  });

  it('the in-flow logo header (Payment Voucher) KEEPS its divider rule and padding', () => {
    const { container } = render(
      <MemoryRouter future={ROUTER_FUTURE}>
        <FormLayout
          ready={false} formNumber="PV-1" title="سند صرف" profile="payment-voucher" useLogoHeader
          qrData={{ formType: 't', formNumber: 'PV-1', entityName: 'x' }}
        >
          <div>BODY</div>
        </FormLayout>
      </MemoryRouter>,
    );
    const header = (container.querySelector('img') as HTMLElement).parentElement!.parentElement as HTMLElement;
    expect(header.style.borderBottom).toContain('3px solid');
    expect(header.style.paddingBottom).toBe('10px');
    expect(header.style.position).not.toBe('absolute');
  });

  it('letterhead: header stays in-flow (only display:none) — the overlay mechanism is not applied to it', () => {
    const { container } = renderWithProfile('letterhead');
    const headerWrapper = container.querySelector('div[style*="border-bottom"]') as HTMLElement;
    expect(headerWrapper.style.position).not.toBe('absolute');
  });

  it('plain-a4: header stays in-flow, fully unaffected', () => {
    const { container } = renderWithProfile('plain-a4');
    const headerWrapper = container.querySelector('div[style*="border-bottom"]') as HTMLElement;
    expect(headerWrapper.style.position).not.toBe('absolute');
  });

  it('Payment Voucher (page-level useLogoHeader, NOT the profile-level flag) keeps its in-flow header design untouched', () => {
    const { container } = renderWithProfile('payment-voucher', { useLogoHeader: true });
    const img = container.querySelector('img')!;
    expect(img).not.toBeNull();
    const headerWrapper = img.parentElement!.parentElement as HTMLElement;
    expect(headerWrapper.style.position).not.toBe('absolute');
  });

  it('ready-paper: the body content immediately following the header is NOT pushed down by the header\'s own box — it is the header\'s very next DOM sibling with no spacer in between', () => {
    const { container } = renderWithProfile('ready-paper');
    const headerWrapper = container.querySelector('div[style*="border-bottom"]') as HTMLElement;
    // The form-number/title block is the header's next sibling — no compensating
    // spacer/margin was inserted between them to "make room" for the logo.
    const nextSibling = headerWrapper.nextElementSibling as HTMLElement;
    expect(nextSibling).not.toBeNull();
    expect(nextSibling.textContent).toContain('عنوان');
  });
});

// ── "Ready Paper" Phase 4 — the Phase 3 overlay used `top: calc(-1 * 40mm)` to
// reach the physical sheet edge. That places the header OUTSIDE `.form-page`'s
// own box, and EVERY surface that renders the document renders `.form-page`
// ALONE: `composeStyledFromNode` (legacy + accurate preview dialogs) and
// `formPdfDocument` both clone just that node into a bare `<body>`, and paged
// print does not paint above the page area. Measured on the REAL running app
// (Playwright against localhost:5173, Salary Certificate + ready-paper): inside
// the preview dialog's composed document the header sat at `top: -150.2px`
// against a `255.4px` image — 58.8% of the logo clipped. A screen-only spacer
// placed BEFORE `.form-page` could never fix it, because the spacer is not part
// of the cloned node (measured: `printRoot.previousElementSibling === null`).
// Fix: anchor the overlay at `top: 0`, inside the page box, so it renders
// identically on every surface. That workaround has been removed entirely. ──
describe('FormLayout — the removed screen-only spacer workaround stays removed', () => {
  function renderWithProfile(profile: 'plain-a4' | 'letterhead' | 'ready-paper') {
    return render(
      <MemoryRouter future={ROUTER_FUTURE}>
        <FormLayout
          ready={false}
          formNumber="FORM-001"
          title="عنوان"
          profile={profile}
          qrData={{ formType: 't', formNumber: 'FORM-001', entityName: 'x', entityId: 1 }}
        >
          <div>BODY CONTENT HERE</div>
        </FormLayout>
      </MemoryRouter>,
    );
  }

  it('no `.no-print` spacer is rendered before `.form-page` for any profile — the dead workaround is gone', () => {
    for (const profile of ['ready-paper', 'letterhead', 'plain-a4'] as const) {
      const { container, unmount } = renderWithProfile(profile);
      const formPage = container.querySelector('.form-page') as HTMLElement;
      expect(formPage.previousElementSibling?.classList.contains('no-print')).toBe(false);
      unmount();
    }
  });

  // Phase 5 — CSS-only crop of the PNG's transparent vertical padding. The source
  // file (930×268) carries opaque artwork on rows 59..221 only; rows 0..58 and
  // 222..267 are empty. The crop pulls those two bands outside the existing
  // `overflow: hidden` wrapper with negative margins, so the box collapses to the
  // artwork's own height WITHOUT touching the <img>'s width/height — the rendered
  // artwork scale is unchanged and the PNG is never modified. ready-paper only.
  it('ready-paper: the logo is cropped by negative margins in the exact 59 : 46 transparent-row ratio, and its width/height are left untouched', () => {
    const { container } = renderWithProfile('ready-paper');
    const img = container.querySelector('img') as HTMLImageElement;
    const top = parseFloat(img.style.marginTop);
    const bottom = parseFloat(img.style.marginBottom);
    expect(top).toBeLessThan(0);
    expect(bottom).toBeLessThan(0);
    // Crop bands must be proportional to the measured transparent row counts.
    expect(Math.abs(top) / Math.abs(bottom)).toBeCloseTo(59 / 46, 4);
    // The artwork itself is NOT resized — width stays the established value and
    // the height stays intrinsic.
    expect(img.style.width).toBe(`${(930 / 830) * 100}%`);
    expect(img.style.height).toBe('auto');
    // Cross-axis pinned so flexbox cannot shrink the image to the shortened line.
    expect((img.parentElement as HTMLElement).style.alignItems).toBe('flex-start');
    expect((img.parentElement as HTMLElement).style.overflow).toBe('hidden');
  });

  it('non-overlay logo headers (Payment Voucher via useLogoHeader) are NOT cropped — no negative margins, no cross-axis pin', () => {
    const { container } = render(
      <MemoryRouter future={ROUTER_FUTURE}>
        <FormLayout
          ready={false} formNumber="PV-1" title="سند صرف" profile="payment-voucher" useLogoHeader
          qrData={{ formType: 't', formNumber: 'PV-1', entityName: 'x' }}
        >
          <div>BODY</div>
        </FormLayout>
      </MemoryRouter>,
    );
    const img = container.querySelector('img') as HTMLImageElement;
    expect(img.style.marginTop).toBe('');
    expect(img.style.marginBottom).toBe('');
    expect((img.parentElement as HTMLElement).style.alignItems).toBe('');
  });

  it('the ready-paper margin VALUES are still exactly 40mm 10mm 20mm 10mm — the page-level model relocates them, it never edits them', () => {
    expect(PRINT_PROFILES['ready-paper'].margins).toEqual({
      top: '40mm', right: '10mm', bottom: '20mm', left: '10mm',
    });
    const { container } = renderWithProfile('ready-paper');
    const printBlock = mediaPrintBlock(container.querySelector('style')!.textContent!);
    // Applied as `.form-page` padding (with a zero @page margin) so the element
    // spans the physical sheet and the letterhead can occupy the top band.
    expect(/@page\s*\{[^}]*margin:\s*0;/.test(printBlock)).toBe(true);
    expect(printBlock).toMatch(/\.form-page\s*\{[^}]*?padding:\s*40mm 10mm 20mm 10mm\s*!important;/);
  });

  it('every other profile keeps the original page-margin model untouched (@page carries the margins, .form-page padding stays 0)', () => {
    for (const profile of ['letterhead', 'plain-a4'] as const) {
      const { container, unmount } = renderWithProfile(profile);
      const printBlock = mediaPrintBlock(container.querySelector('style')!.textContent!);
      const m = PRINT_PROFILES[profile].margins;
      expect(printBlock).toContain(`@page { size: A4; margin: ${m.top} ${m.right} ${m.bottom} ${m.left}; }`);
      expect(printBlock).toMatch(/\.form-page\s*\{[^}]*?padding:\s*0\s*!important;/);
      unmount();
    }
  });
});
