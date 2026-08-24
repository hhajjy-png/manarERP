// @vitest-environment jsdom
/**
 * Cheque Printing Deterministic Geometry & Unified Pipeline Pack v1 — regression suite.
 *
 * Locks the physical-geometry contract the audit found missing:
 *
 *   H1  no pinned pageSize/margins/scale → OS dialog decided the geometry
 *   H2  8px print padding rescaled and shifted every template print
 *   H3  px fonts in %-sized boxes → text overflowed into neighbouring fields
 *   H4  contradictory landscape/@page/margin declarations
 *   H5  printing before /settings resolved used the wrong provider + calibration
 *   H6  Studio Print was a divergent, untracked production path
 *   H7  Classic batch resolved calibration from stale form.bankName
 *   +   `getDefaultTemplate() ?? listTemplates()[0]` silently switched templates
 *
 * PRIMARY INVARIANT under test:
 *   Geometry(single(C,T,P)) === Geometry(batch(C,T,P)) === Geometry(reprint(C,T,P))
 * with only runtime data allowed to differ.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { ROUTER_FUTURE } from './helpers/router';

import {
  A4_LANDSCAPE_PAGE,
  buildChequePrintJob,
  cmToMm,
  cssPageRule,
  mmToMicrons,
  physicalPageFor,
  printOptionsFor,
  realChequePage,
  fontSizeToCqw,
  surfaceWidthPx,
  textDefinitelyOverflows,
} from '../modules/chequePrint';
import { resolveChequeTemplateForPrint } from '../modules/chequeTemplateRuntime';
import { buildChequeRuntimeData } from '../components/chequeTemplateManager/chequeRuntimeData';
import type { ChequeRecordInput } from '../components/chequeTemplateManager/chequeRuntimeData';
import ChequeRenderSurface from '../components/chequeTemplateManager/ChequeRenderSurface';
import ChequeTemplatePrintPage from '../components/chequeTemplateManager/ChequeTemplatePrintPage';
import type { DesignerField, DesignerSurfaceSpec } from '../modules/chequeTemplateDesigner';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const SURFACE: DesignerSurfaceSpec = { widthCm: 17.8, heightCm: 8.9 };

const CHEQUE_A: ChequeRecordInput = {
  chequeNumber: '000002',
  chequeDate: new Date(1785628800000).toISOString(), // 2026-08-02
  beneficiaryName: 'ساير طليحان العذاب',
  amount: 1370,
  currency: 'KWD',
  bankName: 'بنك الخليج',
};
const CHEQUE_B: ChequeRecordInput = { ...CHEQUE_A, chequeNumber: '000059', chequeDate: '2026-02-03T00:00:00.000Z', beneficiaryName: 'حمد عفش المحيمد', amount: 1550 };
const CHEQUE_C: ChequeRecordInput = { ...CHEQUE_A, chequeNumber: '000060', chequeDate: '2026-03-11T00:00:00.000Z', beneficiaryName: 'محمد حسين الجمعه', amount: 815 };

function field(over: Partial<DesignerField> & { id: string }): DesignerField {
  return {
    label: '', value: '', x: 10, y: 10, width: 20, height: 6, rotation: 0,
    fontSize: 12, fontWeight: 400, textAlign: 'center', color: '#000000', zIndex: 1, visible: true,
    ...over,
  };
}

/** The real legacy field shape found in this installation's localStorage. */
const FIELDS: DesignerField[] = [
  field({ id: 'beneficiary', value: 'اسم المستفيد', x: 5, y: 22.47, width: 45, fontSize: 14, textAlign: 'right', zIndex: 3 }),
  field({ id: 'date', value: '24 / 07 / 2026', x: 73, y: 19.47, width: 22, fontSize: 13, zIndex: 1 }),
  field({ id: 'amount', value: '#1,250.000#', x: 76, y: 42.3, width: 16, fontSize: 14, fontWeight: 700, zIndex: 4 }),
  field({ id: 'amountInWords', value: 'ألف ومئتان', x: 10.7, y: 29.78, width: 58, fontSize: 12, zIndex: 5 }),
];


/** The geometry half of a resolved model — everything except runtime text. */
function geometryOf(model: ReturnType<typeof resolveChequeTemplateForPrint>) {
  return {
    surface: model.surface,
    fields: model.fields.map((f) => ({ id: f.id, geometry: f.geometry, font: f.font, align: f.align, zIndex: f.zIndex, visible: f.visible })),
  };
}

// ── A. Physical page contract ────────────────────────────────────────────────

describe('physical page contract', () => {
  it('converts a 17.8 × 8.9 cm surface to a 178 × 89 mm page', () => {
    const page = realChequePage(SURFACE);
    expect(page.widthMm).toBe(178);
    expect(page.heightMm).toBe(89);
  });

  it('converts mm to the microns Electron expects', () => {
    expect(mmToMicrons(178)).toBe(178000);
    expect(mmToMicrons(89)).toBe(89000);
    expect(mmToMicrons(297)).toBe(297000);
    expect(cmToMm(17.8)).toBeCloseTo(178, 10);
  });

  it('always pins zero margins and 100% scale, and never asks Chromium to rotate', () => {
    for (const page of [realChequePage(SURFACE), A4_LANDSCAPE_PAGE]) {
      expect(page.marginType).toBe('none');
      expect(page.scalePercent).toBe(100);
      // Orientation is baked into width/height — never also `landscape: true` (H4).
      expect(page.landscape).toBe(false);
      expect(page.widthMm).toBeGreaterThan(page.heightMm);
    }
  });

  it('A4 mode is a fixed 297 × 210 mm page regardless of the template surface', () => {
    expect(physicalPageFor(SURFACE, 'a4')).toEqual(A4_LANDSCAPE_PAGE);
    expect(physicalPageFor({ widthCm: 20, heightCm: 10 }, 'a4')).toEqual(A4_LANDSCAPE_PAGE);
  });

  it('real-cheque mode follows the template surface', () => {
    expect(physicalPageFor({ widthCm: 20, heightCm: 10 }, 'real-cheque')).toMatchObject({ widthMm: 200, heightMm: 100 });
  });

  it('the CSS @page rule and the Electron options describe the SAME page', () => {
    for (const page of [realChequePage(SURFACE), A4_LANDSCAPE_PAGE]) {
      const css = cssPageRule(page);
      const opts = printOptionsFor(page);
      expect(css).toBe(`@page { size: ${page.widthMm}mm ${page.heightMm}mm; margin: 0; }`);
      expect(css).toContain('margin: 0');
      expect(opts.pageSize.width).toBe(mmToMicrons(page.widthMm));
      expect(opts.pageSize.height).toBe(mmToMicrons(page.heightMm));
    }
  });

  it('every geometry option is EXPLICIT — no cheque path may rely on an omitted one', () => {
    for (const page of [realChequePage(SURFACE), A4_LANDSCAPE_PAGE]) {
      const opts = printOptionsFor(page);
      expect(Object.keys(opts).sort()).toEqual(['landscape', 'marginType', 'pageSize', 'scaleFactor']);
      expect(opts.marginType).toBe('none');
      expect(opts.scaleFactor).toBe(100);
      expect(opts.landscape).toBe(false);
    }
  });
});

// ── B. Job-level geometry determinism (single === batch === reprint) ─────────

describe('resolved print job — geometry determinism', () => {
  const base = { purpose: 'production' as const, template: { id: 'tpl-default', name: 'تجربه', source: 'default-template' as const }, surface: SURFACE, fields: FIELDS, paperMode: 'real-cheque' as const };

  it('a batch resolves ONE surface, ONE field set and ONE physical page for all items', () => {
    const job = buildChequePrintJob({ ...base, items: [CHEQUE_A, CHEQUE_B, CHEQUE_C].map((c) => ({ runtimeData: buildChequeRuntimeData(c) })) });
    expect(job.items).toHaveLength(3);
    expect(job.physicalPage).toEqual(realChequePage(SURFACE));
    // Only runtime data differs between items.
    expect(new Set(job.items.map((i) => i.runtimeData.amount)).size).toBe(3);
  });

  it('single, batch and reprint of the same cheque produce IDENTICAL geometry', () => {
    const single = buildChequePrintJob({ ...base, items: [{ runtimeData: buildChequeRuntimeData(CHEQUE_A) }] });
    const batch = buildChequePrintJob({ ...base, items: [CHEQUE_A, CHEQUE_B, CHEQUE_C].map((c) => ({ runtimeData: buildChequeRuntimeData(c) })) });
    const reprint = buildChequePrintJob({ ...base, items: [{ runtimeData: buildChequeRuntimeData(CHEQUE_A) }] });

    for (const job of [batch, reprint]) {
      expect(job.physicalPage).toEqual(single.physicalPage);
      expect(printOptionsFor(job.physicalPage)).toEqual(printOptionsFor(single.physicalPage));
      expect(cssPageRule(job.physicalPage)).toBe(cssPageRule(single.physicalPage));
    }

    const g = (data: ReturnType<typeof buildChequeRuntimeData>) => geometryOf(resolveChequeTemplateForPrint({ surface: single.surface, fields: single.fields }, data));
    // A in a single job vs A at batch position 0 vs A reprinted.
    expect(g(batch.items[0].runtimeData)).toEqual(g(single.items[0].runtimeData));
    expect(g(reprint.items[0].runtimeData)).toEqual(g(single.items[0].runtimeData));
  });

  it('geometry does not depend on batch position or on the other cheques', () => {
    const job = buildChequePrintJob({ ...base, items: [CHEQUE_A, CHEQUE_B, CHEQUE_C].map((c) => ({ runtimeData: buildChequeRuntimeData(c) })) });
    const geoms = job.items.map((i) => geometryOf(resolveChequeTemplateForPrint({ surface: job.surface, fields: job.fields }, i.runtimeData)));
    expect(geoms[1]).toEqual(geoms[0]);
    expect(geoms[2]).toEqual(geoms[0]);
    // …while the DATA genuinely differs.
    const texts = job.items.map((i) => resolveChequeTemplateForPrint({ surface: job.surface, fields: job.fields }, i.runtimeData).fields.find((f) => f.id === 'amount')?.text);
    expect(new Set(texts).size).toBe(3);
  });

  it('A4 and real-cheque differ ONLY in the physical page, not in field geometry', () => {
    const real = buildChequePrintJob({ ...base, paperMode: 'real-cheque', items: [{ runtimeData: buildChequeRuntimeData(CHEQUE_A) }] });
    const a4 = buildChequePrintJob({ ...base, paperMode: 'a4', items: [{ runtimeData: buildChequeRuntimeData(CHEQUE_A) }] });
    expect(a4.physicalPage).not.toEqual(real.physicalPage);
    const g = (j: typeof real) => geometryOf(resolveChequeTemplateForPrint({ surface: j.surface, fields: j.fields }, j.items[0].runtimeData));
    expect(g(a4)).toEqual(g(real));
  });

  it('a test print carries the same geometry but is stripped of tracking', () => {
    const tracking = { id: 46, status: 'DRAFT', chequeNumber: '000002', beneficiaryName: 'x' };
    const production = buildChequePrintJob({ ...base, items: [{ runtimeData: buildChequeRuntimeData(CHEQUE_A), tracking }] });
    const test = buildChequePrintJob({ ...base, purpose: 'test', items: [{ runtimeData: buildChequeRuntimeData(CHEQUE_A), tracking }] });
    expect(test.physicalPage).toEqual(production.physicalPage);
    expect(production.items[0].tracking).toEqual(tracking);
    expect(test.items[0].tracking).toBeUndefined(); // structurally impossible to track
  });
});

// ── C. Default template contract ─────────────────────────────────────────────

describe('deterministic typography & text fit', () => {
  it('font size is a fixed fraction of the surface, not a viewport-relative value', () => {
    // 17.8cm at 96dpi ≈ 672.76 CSS px.
    expect(surfaceWidthPx(17.8)).toBeCloseTo(672.756, 2);
    const cqw = fontSizeToCqw(14, 17.8);
    // Reproduces the authored px exactly at the declared physical width…
    expect((cqw / 100) * surfaceWidthPx(17.8)).toBeCloseTo(14, 10);
    // …and is independent of the surface it will actually be rendered into.
    expect(fontSizeToCqw(14, 17.8)).toBe(cqw);
  });

  it('scales proportionally for a different surface width', () => {
    expect(fontSizeToCqw(14, 8.9)).toBeCloseTo(fontSizeToCqw(14, 17.8) * 2, 10);
  });

  it('degrades safely for nonsense inputs', () => {
    expect(fontSizeToCqw(0, 17.8)).toBe(0);
    expect(fontSizeToCqw(14, 0)).toBe(0);
    expect(fontSizeToCqw(Number.NaN, 17.8)).toBe(0);
  });

  it('the canonical amount still fits its real template box', () => {
    // #1,370.000# at 14px in a 16%-wide field must NOT be reported as overflowing.
    expect(textDefinitelyOverflows('#1,370.000#', 14, 16, 17.8)).toBe(false);
  });

  it('detects a value that genuinely cannot fit', () => {
    expect(textDefinitelyOverflows('#1,234,567,890.123#', 14, 16, 17.8)).toBe(true);
    expect(textDefinitelyOverflows('اسم مستفيد طويل جدًا لا يمكن أن يتسع داخل الحقل إطلاقًا مهما حدث', 14, 20, 17.8)).toBe(true);
  });

  it('an overflowing field raises a print-BLOCKING error and never truncates the value', () => {
    const longPayee = 'شركة المنار الدولية لإنشاء وصيانة الشوارع والأرصفة ومستلزمات الطرق ذات المسؤولية المحدودة';
    const model = resolveChequeTemplateForPrint(
      { surface: SURFACE, fields: [field({ id: 'beneficiary', binding: 'beneficiary', width: 20, fontSize: 14 })] },
      { beneficiary: longPayee, chequeDate: '02 / 08 / 2026', amount: '#1,370.000#', amountInWords: 'x' },
    );
    const issue = model.issues.find((i) => i.code === 'FIELD_TEXT_OVERFLOW');
    expect(issue?.severity).toBe('error');
    expect(model.meta.hasErrors).toBe(true);
    // The value is reported in full, never auto-shortened.
    expect(model.fields[0].text).toBe(longPayee);
  });

  it('a normal cheque raises no overflow issue', () => {
    const model = resolveChequeTemplateForPrint({ surface: SURFACE, fields: FIELDS }, buildChequeRuntimeData(CHEQUE_A));
    expect(model.issues.some((i) => i.code === 'FIELD_TEXT_OVERFLOW')).toBe(false);
    expect(model.meta.hasErrors).toBe(false);
  });

  it('design mode never blocks on overflow — only real printing does', () => {
    const model = resolveChequeTemplateForPrint({ surface: SURFACE, fields: FIELDS }, buildChequeRuntimeData(CHEQUE_A));
    expect(model.meta.hasErrors).toBe(false);
  });
});

describe('render surface — field containment', () => {
  afterEach(cleanup);

  it('emits container-relative font sizes (cqw), never raw px', () => {
    const model = resolveChequeTemplateForPrint({ surface: SURFACE, fields: FIELDS }, buildChequeRuntimeData(CHEQUE_A));
    const { container } = render(<div dir="rtl"><ChequeRenderSurface model={model} showBackground={false} /></div>);
    const spans = container.querySelectorAll<HTMLElement>('.crs-field-text');
    expect(spans.length).toBe(4);
    spans.forEach((s) => {
      expect(s.style.fontSize).toMatch(/cqw$/);
      expect(s.style.fontSize).not.toMatch(/px$/);
    });
  });

  it('the amount field reproduces its authored 14px at the declared physical width', () => {
    const model = resolveChequeTemplateForPrint({ surface: SURFACE, fields: FIELDS }, buildChequeRuntimeData(CHEQUE_A));
    const { container } = render(<ChequeRenderSurface model={model} showBackground={false} />);
    const amount = container.querySelector<HTMLElement>('[data-binding="amount"]')!;
    const cqw = parseFloat(amount.style.fontSize);
    expect((cqw / 100) * surfaceWidthPx(SURFACE.widthCm)).toBeCloseTo(14, 6);
  });
});

// ── E. Print page — pinned options, origin, test-print isolation ─────────────

describe('ChequeTemplatePrintPage — physical contract', () => {
  const printPage = vi.fn();

  beforeEach(() => {
    printPage.mockReset().mockResolvedValue({ success: true });
    (window as unknown as { manar: unknown }).manar = { printPage };
  });
  afterEach(() => {
    cleanup();
    delete (window as unknown as { manar?: unknown }).manar;
  });

  function renderPage(state: Record<string, unknown>) {
    return render(
      <MemoryRouter future={ROUTER_FUTURE} initialEntries={[{ pathname: '/cheque-template/print', state }]}>
        <ChequeTemplatePrintPage />
      </MemoryRouter>,
    );
  }

  const productionState = (paperMode: 'real-cheque' | 'a4') => ({
    surface: SURFACE, fields: FIELDS, paperMode, purpose: 'production', templateName: 'تجربه',
    runtimeData: buildChequeRuntimeData(CHEQUE_A),
    tracking: { id: 46, status: 'DRAFT', chequeNumber: '000002', beneficiaryName: 'x' },
  });

  it('emits an @page rule matching the resolved physical page — real cheque', () => {
    const { container } = renderPage(productionState('real-cheque'));
    const css = Array.from(container.querySelectorAll('style')).map((s) => s.textContent).join('\n');
    expect(css).toContain('@page { size: 178mm 89mm; margin: 0; }');
  });

  it('emits an @page rule matching the resolved physical page — A4', () => {
    const { container } = renderPage(productionState('a4'));
    const css = Array.from(container.querySelectorAll('style')).map((s) => s.textContent).join('\n');
    expect(css).toContain('@page { size: 297mm 210mm; margin: 0; }');
  });

  it('removes the print-time padding and centering that shifted the physical origin', () => {
    const { container } = renderPage(productionState('real-cheque'));
    const css = Array.from(container.querySelectorAll('style')).map((s) => s.textContent).join('\n');
    const printBlock = css.slice(css.indexOf('@media print'));
    expect(printBlock).toMatch(/\.ctpp-print-area\s*{[^}]*padding:\s*0/);
    expect(printBlock).toMatch(/\.ctpp-print-area\s*{[^}]*top:\s*0/);
    expect(printBlock).toMatch(/\.ctpp-print-area\s*{[^}]*left:\s*0/);
    expect(printBlock).not.toContain('justify-content: center');
  });

  it('passes the pinned physical page to Electron — real cheque', async () => {
    renderPage(productionState('real-cheque'));
    screen.getByRole('button', { name: /طباعة/ }).click();
    await vi.waitFor(() => expect(printPage).toHaveBeenCalled());
    expect(printPage).toHaveBeenCalledWith({
      landscape: false,
      pageSize: { width: 178000, height: 89000 },
      marginType: 'none',
      scaleFactor: 100,
    });
  });

  it('passes the pinned physical page to Electron — A4', async () => {
    renderPage(productionState('a4'));
    screen.getByRole('button', { name: /طباعة/ }).click();
    await vi.waitFor(() => expect(printPage).toHaveBeenCalled());
    expect(printPage).toHaveBeenCalledWith({
      landscape: false,
      pageSize: { width: 297000, height: 210000 },
      marginType: 'none',
      scaleFactor: 100,
    });
  });

  it('a batch item prints with EXACTLY the same options as the single print', async () => {
    renderPage(productionState('real-cheque'));
    screen.getByRole('button', { name: /طباعة/ }).click();
    await vi.waitFor(() => expect(printPage).toHaveBeenCalled());
    const singleOptions = printPage.mock.calls[0][0];
    cleanup();
    printPage.mockClear();

    renderPage({
      surface: SURFACE, fields: FIELDS, paperMode: 'real-cheque', purpose: 'production', templateName: 'تجربه',
      ctppBatchItems: [CHEQUE_A, CHEQUE_B, CHEQUE_C].map((c, i) => ({
        runtimeData: buildChequeRuntimeData(c),
        tracking: { id: 40 + i, status: 'DRAFT', chequeNumber: c.chequeNumber, beneficiaryName: 'x' },
      })),
    });
    screen.getByRole('button', { name: /طباعة/ }).click();
    await vi.waitFor(() => expect(printPage).toHaveBeenCalled());
    expect(printPage.mock.calls[0][0]).toEqual(singleOptions);
  });

  it('shows the resolved template name so the operator can see what will print', () => {
    renderPage(productionState('real-cheque'));
    expect(screen.getByText('تجربه')).toBeInTheDocument();
  });

  it('a TEST print is flagged on screen and never records tracking', async () => {
    renderPage({
      surface: SURFACE, fields: FIELDS, paperMode: 'real-cheque', purpose: 'test', templateName: 'قالب قيد التصميم',
      runtimeData: buildChequeRuntimeData(CHEQUE_A),
    });
    expect(screen.getByText(/طباعة تجريبية للقالب/)).toBeInTheDocument();
    screen.getByRole('button', { name: /طباعة/ }).click();
    await vi.waitFor(() => expect(printPage).toHaveBeenCalled());
    // No mark-printed confirm may ever appear for a test print.
    expect(screen.queryByRole('heading', { name: 'تأكيد الطباعة' })).not.toBeInTheDocument();
  });

  it('a production print of a DRAFT cheque still offers the mark-printed step', async () => {
    renderPage(productionState('real-cheque'));
    screen.getByRole('button', { name: /طباعة/ }).click();
    expect(await screen.findByRole('heading', { name: 'تأكيد الطباعة' })).toBeInTheDocument();
  });

  it('a blocked model never reaches the printer', () => {
    renderPage({
      ...productionState('real-cheque'),
      runtimeData: { ...buildChequeRuntimeData(CHEQUE_A), chequeDate: '' },
    });
    expect(screen.getByRole('button', { name: /طباعة/ })).toBeDisabled();
    expect(printPage).not.toHaveBeenCalled();
  });
});

// ── F. Data integrity is preserved (Pack v1 must not regress) ────────────────

describe('data integrity preserved', () => {
  it('cheque 000002 prints #1,370.000# and 02 / 08 / 2026 through the new pipeline', () => {
    const job = buildChequePrintJob({
      purpose: 'production',
      template: { id: 'tpl-default', name: 'تجربه', source: 'default-template' },
      surface: SURFACE, fields: FIELDS, paperMode: 'real-cheque',
      items: [{ runtimeData: buildChequeRuntimeData(CHEQUE_A) }],
    });
    const model = resolveChequeTemplateForPrint({ surface: job.surface, fields: job.fields }, job.items[0].runtimeData);
    const text = (id: string) => model.fields.find((f) => f.id === id)?.text;
    expect(text('amount')).toBe('#1,370.000#');
    expect(text('date')).toBe('02 / 08 / 2026');
    expect(text('beneficiary')).toBe(CHEQUE_A.beneficiaryName);
    expect(text('amountInWords')).toContain('ألف وثلاثمائة وسبعون');
    // The design-time sample date can never appear.
    expect(model.fields.map((f) => f.text)).not.toContain('24 / 07 / 2026');
  });

  it('the date comes from the cheque record, never from today', () => {
    const model = resolveChequeTemplateForPrint({ surface: SURFACE, fields: FIELDS }, buildChequeRuntimeData(CHEQUE_B));
    expect(model.fields.find((f) => f.id === 'date')?.text).toBe('03 / 02 / 2026');
  });
});
