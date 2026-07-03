// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { readFileSync } from 'node:fs';
import { MemoryRouter } from 'react-router-dom';
import { PrintWorkspace } from '../components/print-workspace';
import FormLayout from '../forms/shared/FormLayout';

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

  it('zoom buttons change only the preview transform, not the document', () => {
    render(
      <PrintWorkspace toolbar={<span />}>
        <div className="form-page">body</div>
      </PrintWorkspace>,
    );
    const scaler = screen.getByTestId('pw-scaler');
    // Default preview zoom is a fixed 75%.
    expect(scaler).toHaveStyle({ transform: 'scale(0.75)' });

    fireEvent.click(screen.getByRole('button', { name: 'تكبير' }));
    expect(scaler.style.transform).toBe('scale(0.85)');

    fireEvent.click(screen.getByRole('button', { name: 'تصغير' }));
    fireEvent.click(screen.getByRole('button', { name: 'تصغير' }));
    expect(scaler.style.transform).toBe('scale(0.65)');

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
    expect(scaler.style.transform).toBe('scale(0.85)');
    // A plain wheel (no Ctrl) must NOT change zoom.
    fireEvent.wheel(canvas, { ctrlKey: false, deltaY: -100 });
    expect(scaler.style.transform).toBe('scale(0.85)');
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
      <MemoryRouter>
        <FormLayout
          ready={false}
          formNumber="FORM-001"
          title="شهادة راتب"
          profile="plain-a4"
          qrData={{ formType: 't', formNumber: 'FORM-001', employeeId: 1, employeeName: 'x', issueDate: '2026-01-01' }}
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
