// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { PrintWorkspace } from '../components/print-workspace';
import FormLayout from '../forms/shared/FormLayout';

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

  it('Save PDF reuses the existing window.manar.exportPdf bridge', () => {
    const exportPdf = vi.fn().mockResolvedValue({ success: true });
    (window as unknown as { manar: { exportPdf: typeof exportPdf } }).manar = { exportPdf };
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: /حفظ PDF/ }));
    expect(exportPdf).toHaveBeenCalledWith('FORM-001');
  });
});
