// @vitest-environment jsdom
/**
 * قالب شيك الخليج — Gulf Bank Cheque A4 Landscape Print Profile v1.
 *
 * The profile states a physical claim: a 180 × 90 mm cheque, printed on a real
 * A4 landscape sheet, flush with the sheet's right edge and vertically centred,
 * with four values (date, payee, numeric amount, tafqeet) and nothing else.
 * Every assertion below pins one part of that claim, plus the two properties
 * that make it safe to iterate on:
 *
 *   • the AUTHORED coordinates stay cheque-local millimetres — an A4 coordinate
 *     is always derived, never stored, so calibration can move the cheque area
 *     without disturbing a single field;
 *   • preview and print share one profile, one model and one placement — the
 *     only difference is the cheque photo, which is structurally absent from the
 *     printed subtree.
 *
 * It also pins what must NOT change in the SHARED cheque-print architecture that
 * survives the template cleanup: the A4 sheet's default placement for callers
 * that supply none, and single-line field behaviour everywhere else.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { ROUTER_FUTURE } from './helpers/router';

import {
  A4_LANDSCAPE_PAGE,
  GULF_A4_CALIBRATION,
  GULF_A4_TEMPLATE_NAME,
  GULF_CHEQUE_BASE_X_MM,
  GULF_CHEQUE_BASE_Y_MM,
  GULF_CHEQUE_HEIGHT_MM,
  GULF_CHEQUE_SURFACE_CM,
  GULF_CHEQUE_WIDTH_MM,
  GULF_LOCAL_FIELDS,
  cssPageRule,
  gulfChequeAreaMm,
  gulfChequeFields,
  gulfFieldFinalMm,
  physicalPageFor,
  printOptionsFor,
} from '../modules/chequePrint';
import { resolveChequeTemplateForPrint } from '../modules/chequeTemplateRuntime';
import { buildChequeRuntimeData } from '../components/chequeTemplateManager/chequeRuntimeData';
import type { ChequeRecordInput } from '../components/chequeTemplateManager/chequeRuntimeData';
import ChequeTemplatePrintPage from '../components/chequeTemplateManager/ChequeTemplatePrintPage';
import { DEFAULT_A4_PLACEMENT } from '../components/chequeTemplateManager/ChequeA4Sheet';
import { amountToWordsKWD } from '../lib/tafqeet';

const CHEQUE: ChequeRecordInput = {
  chequeNumber: '000123',
  chequeDate: '2026-08-02T00:00:00.000Z',
  beneficiaryName: 'ساير طليحان العذاب',
  amount: 1250.75,
  currency: 'KWD',
  bankName: 'بنك الخليج',
};

const RUNTIME = buildChequeRuntimeData(CHEQUE);

function gulfModel() {
  return resolveChequeTemplateForPrint(
    { surface: GULF_CHEQUE_SURFACE_CM, fields: gulfChequeFields() },
    RUNTIME,
  );
}

// ── A. The A4 page ───────────────────────────────────────────────────────────

describe('A4 page geometry', () => {
  it('prints on a real A4 landscape page — 297 × 210 mm', () => {
    const page = physicalPageFor(GULF_CHEQUE_SURFACE_CM, 'a4');
    expect(page).toEqual(A4_LANDSCAPE_PAGE);
    expect(page.widthMm).toBe(297);
    expect(page.heightMm).toBe(210);
  });

  it('is landscape by DIMENSION, never by asking Chromium to rotate', () => {
    const page = physicalPageFor(GULF_CHEQUE_SURFACE_CM, 'a4');
    expect(page.widthMm).toBeGreaterThan(page.heightMm);
    expect(page.landscape).toBe(false);
    expect(page.marginType).toBe('none');
    expect(page.scalePercent).toBe(100);
  });

  it('never declares the cheque itself as the paper size', () => {
    const css = cssPageRule(physicalPageFor(GULF_CHEQUE_SURFACE_CM, 'a4'));
    expect(css).toBe('@page { size: 297mm 210mm; margin: 0; }');
    expect(css).not.toContain('180mm 90mm');
    expect(printOptionsFor(physicalPageFor(GULF_CHEQUE_SURFACE_CM, 'a4')).pageSize).toEqual({
      width: 297000,
      height: 210000,
    });
  });
});

// ── B. The cheque area on the sheet ──────────────────────────────────────────

describe('cheque area geometry', () => {
  it('is the measured 180 × 90 mm cheque', () => {
    expect(GULF_CHEQUE_WIDTH_MM).toBe(180);
    expect(GULF_CHEQUE_HEIGHT_MM).toBe(90);
    expect(GULF_CHEQUE_SURFACE_CM).toEqual({ widthCm: 18, heightCm: 9 });
  });

  it('sits at x = 117 mm, y = 60 mm before calibration', () => {
    expect(GULF_CHEQUE_BASE_X_MM).toBe(117);
    expect(GULF_CHEQUE_BASE_Y_MM).toBe(60);
    expect(gulfChequeAreaMm()).toEqual({ xMm: 117, yMm: 60, widthMm: 180, heightMm: 90 });
  });

  it('puts the cheque RIGHT edge exactly on the A4 right edge', () => {
    const area = gulfChequeAreaMm();
    expect(area.xMm + area.widthMm).toBe(A4_LANDSCAPE_PAGE.widthMm);
    expect(area.xMm + area.widthMm).toBe(297);
  });

  it('centres the cheque vertically — (210 − 90) / 2 = 60', () => {
    const area = gulfChequeAreaMm();
    expect(area.yMm).toBe((A4_LANDSCAPE_PAGE.heightMm - GULF_CHEQUE_HEIGHT_MM) / 2);
    expect(A4_LANDSCAPE_PAGE.heightMm - (area.yMm + area.heightMm)).toBe(area.yMm);
  });

  it('ships uncalibrated — the offsets are 0 until a real print says otherwise', () => {
    expect(GULF_A4_CALIBRATION).toEqual({ offsetXMm: 0, offsetYMm: 0 });
  });
});

// ── C. Calibration moves the AREA, never a field ─────────────────────────────

describe('calibration', () => {
  const CAL = { offsetXMm: -1.5, offsetYMm: 0.8 };

  it('applies the global offsets to the whole cheque area', () => {
    expect(gulfChequeAreaMm(CAL)).toEqual({ xMm: 115.5, yMm: 60.8, widthMm: 180, heightMm: 90 });
  });

  it('leaves every authored field coordinate untouched', () => {
    const before = gulfChequeFields();
    gulfChequeAreaMm(CAL);
    expect(gulfChequeFields()).toEqual(before);
    // The authored table itself is the source of truth and never mutates.
    expect(GULF_LOCAL_FIELDS.find((f) => f.id === 'beneficiary')).toMatchObject({ xMm: 8, yMm: 23.5 });
    expect(GULF_LOCAL_FIELDS.find((f) => f.id === 'chequeDate')).toMatchObject({ xMm: 135, yMm: 23, widthMm: 28 });
    expect(GULF_LOCAL_FIELDS.find((f) => f.id === 'amount')).toMatchObject({ xMm: 132, yMm: 40 });
    expect(GULF_LOCAL_FIELDS.find((f) => f.id === 'amountInWords')).toMatchObject({ xMm: 10, yMm: 33 });
  });

  it('shifts every field on paper by exactly the offset — nothing else moves', () => {
    for (const f of GULF_LOCAL_FIELDS) {
      const base = gulfFieldFinalMm(f);
      const calibrated = gulfFieldFinalMm(f, CAL);
      expect(calibrated.xMm - base.xMm).toBeCloseTo(CAL.offsetXMm, 10);
      expect(calibrated.yMm - base.yMm).toBeCloseTo(CAL.offsetYMm, 10);
    }
  });
});

// ── D. Two coordinate levels; A4 positions are DERIVED, never stored ─────────

describe('coordinate system', () => {
  it('authors every field in cheque-local millimetres, not A4 millimetres', () => {
    for (const f of GULF_LOCAL_FIELDS) {
      expect(f.xMm).toBeGreaterThanOrEqual(0);
      expect(f.xMm + f.widthMm).toBeLessThanOrEqual(GULF_CHEQUE_WIDTH_MM);
      expect(f.yMm).toBeGreaterThanOrEqual(0);
      expect(f.yMm + f.heightMm).toBeLessThanOrEqual(GULF_CHEQUE_HEIGHT_MM);
      // A field that had an A4 coordinate baked into it would already equal its
      // own final position. Every one of them differs by exactly the area origin.
      const final = gulfFieldFinalMm(f);
      expect(final.xMm - f.xMm).toBe(GULF_CHEQUE_BASE_X_MM);
      expect(final.yMm - f.yMm).toBe(GULF_CHEQUE_BASE_Y_MM);
    }
  });

  it('computes final coordinates as chequeArea + localField + calibration', () => {
    const beneficiary = GULF_LOCAL_FIELDS.find((f) => f.id === 'beneficiary')!;
    // The worked example from the specification: 117 + 8 = 125, 60 + 23.5 = 83.5.
    expect(gulfFieldFinalMm(beneficiary)).toEqual({ xMm: 125, yMm: 83.5 });
    for (const f of GULF_LOCAL_FIELDS) {
      const area = gulfChequeAreaMm();
      expect(gulfFieldFinalMm(f)).toEqual({ xMm: area.xMm + f.xMm, yMm: area.yMm + f.yMm });
    }
  });

  it('expresses field layout as percentages OF THE CHEQUE, not of the page', () => {
    const fields = gulfChequeFields();
    const beneficiary = fields.find((f) => f.id === 'beneficiary')!;
    expect(beneficiary.x).toBeCloseTo((8 / 180) * 100, 10);
    expect(beneficiary.y).toBeCloseTo((23.5 / 90) * 100, 10);
    expect(beneficiary.width).toBeCloseTo((108 / 180) * 100, 10);
    // Percent of the PAGE would put the same field at 125/297 ≈ 42.1%.
    expect(beneficiary.x).not.toBeCloseTo((125 / 297) * 100, 1);
  });

  it('resolves each field back to its authored millimetres through the engine', () => {
    const model = gulfModel();
    for (const f of GULF_LOCAL_FIELDS) {
      const resolved = model.fields.find((r) => r.id === f.id)!;
      expect(resolved.geometry.xMm).toBeCloseTo(f.xMm, 6);
      expect(resolved.geometry.yMm).toBeCloseTo(f.yMm, 6);
      expect(resolved.geometry.widthMm).toBeCloseTo(f.widthMm, 6);
      expect(resolved.geometry.heightMm).toBeCloseTo(f.heightMm, 6);
    }
  });
});

// ── E. What the app prints — and what it must never print ────────────────────

describe('printed content', () => {
  it('prints exactly four things: date, payee, numeric amount and tafqeet', () => {
    // FOUR fields, one per printed value — the date is ONE object whose day,
    // month and year are internal cells, not fields of their own.
    const bindings = gulfChequeFields().map((f) => f.binding).sort();
    expect(bindings).toEqual(['amount', 'amountInWords', 'beneficiary', 'chequeDate'].sort());
  });

  it('never prints the cheque number, bank, company or currency marks', () => {
    const model = gulfModel();
    const bindings = model.fields.map((f) => f.binding);
    for (const excluded of ['chequeNumber', 'bankName', 'companyName', 'branchName']) {
      expect(bindings).not.toContain(excluded);
    }
    const printed = model.visibleFields.map((f) => f.text).join(' ');
    expect(printed).not.toContain('000123');
    expect(printed).not.toContain('KD');
    expect(printed).not.toContain('د.ك');
    expect(printed).not.toContain('بنك الخليج');
  });

  it('splits the date into day / month / year so the printed “/” is not doubled', () => {
    const model = gulfModel();
    // The three digit groups are the date block's internal cells.
    const date = model.fields.find((f) => f.id === 'chequeDate')!;
    expect(date.slots.map((s) => s.text)).toEqual(['02', '08', '2026']);
    // A slotted field renders its cells, never its own `02 / 08 / 2026` string.
    const printed = model.visibleFields.flatMap((f) => (f.slots.length ? f.slots.map((s) => s.text) : [f.text]));
    expect(printed.join(' ')).not.toContain('/');
  });

  it('uses the existing cheque money formatter — KWD, 3 decimals', () => {
    const model = gulfModel();
    expect(model.fields.find((f) => f.id === 'amount')!.text).toBe('#1,250.750#');
  });

  it('uses the existing tafqeet engine, not a new one', () => {
    const model = gulfModel();
    expect(model.fields.find((f) => f.id === 'amountInWords')!.text).toBe(amountToWordsKWD(1250.75, 'ar'));
  });

  it('lets the 16 mm tafqeet band take a second line without blocking the print', () => {
    const model = resolveChequeTemplateForPrint(
      { surface: GULF_CHEQUE_SURFACE_CM, fields: gulfChequeFields() },
      buildChequeRuntimeData({ ...CHEQUE, amount: 987654.321 }),
    );
    const tafqeet = model.fields.find((f) => f.id === 'amountInWords')!;
    expect(tafqeet.multiline).toBe(true);
    expect(tafqeet.maxLines).toBeGreaterThanOrEqual(2);
    expect(model.meta.hasErrors).toBe(false);
  });

  it('still blocks the print when a required value cannot be resolved', () => {
    const model = resolveChequeTemplateForPrint(
      { surface: GULF_CHEQUE_SURFACE_CM, fields: gulfChequeFields() },
      { ...RUNTIME, chequeDay: '' },
    );
    expect(model.meta.hasErrors).toBe(true);
    expect(model.issues.some((i) => i.code === 'UNRESOLVED_DATA_BINDING' && i.fieldId === 'chequeDate')).toBe(true);
  });
});

// ── F. Preview and print — one profile, one placement, one model ─────────────

describe('preview vs. physical print', () => {
  afterEach(cleanup);

  const printPage = vi.fn();
  beforeEach(() => {
    printPage.mockReset().mockResolvedValue({ success: true });
    (window as unknown as { manar: unknown }).manar = { printPage };
  });
  afterEach(() => {
    delete (window as unknown as { manar?: unknown }).manar;
  });

  function renderGulfPrintPage() {
    return render(
      <MemoryRouter
        future={ROUTER_FUTURE}
        initialEntries={[{
          pathname: '/cheque-template/print',
          state: {
            surface: GULF_CHEQUE_SURFACE_CM,
            fields: gulfChequeFields(),
            paperMode: 'a4',
            placement: gulfChequeAreaMm(),
            showPreviewBackground: true,
            purpose: 'production',
            templateName: GULF_A4_TEMPLATE_NAME,
            runtimeData: RUNTIME,
            tracking: { id: 7, status: 'DRAFT', chequeNumber: '000123', beneficiaryName: 'ساير طليحان العذاب' },
          },
        }]}
      >
        <ChequeTemplatePrintPage />
      </MemoryRouter>,
    );
  }

  function slotStyle(root: Element) {
    const slot = root.querySelector('.cha4-cheque-slot') as HTMLElement;
    return { left: slot.style.left, top: slot.style.top, width: slot.style.width, height: slot.style.height };
  }

  it('places the cheque slot at 117/297 and 60/210 of the sheet', () => {
    const { container } = renderGulfPrintPage();
    const printArea = container.querySelector('.ctpp-print-area')!;
    expect(slotStyle(printArea)).toEqual({
      left: `${(117 / 297) * 100}%`,
      top: `${(60 / 210) * 100}%`,
      width: `${(180 / 297) * 100}%`,
      height: `${(90 / 210) * 100}%`,
    });
  });

  it('gives the preview and the printed sheet the SAME placement', () => {
    const { container } = renderGulfPrintPage();
    const preview = container.querySelector('.ctpp-preview-area')!;
    const printArea = container.querySelector('.ctpp-print-area')!;
    expect(preview).toBeTruthy();
    expect(slotStyle(preview)).toEqual(slotStyle(printArea));
  });

  it('gives the preview and the printed sheet the SAME field coordinates', () => {
    const { container } = renderGulfPrintPage();
    const positions = (root: Element) =>
      Array.from(root.querySelectorAll('.crs-field')).map((el) => {
        const s = (el as HTMLElement).style;
        return { left: s.left, top: s.top, width: s.width, height: s.height };
      });
    const preview = positions(container.querySelector('.ctpp-preview-area')!);
    const printed = positions(container.querySelector('.ctpp-print-area')!);
    expect(printed.length).toBe(GULF_LOCAL_FIELDS.length);
    expect(preview).toEqual(printed);
  });

  it('shows the cheque photo in the preview ONLY — the printed subtree has no image at all', () => {
    const { container } = renderGulfPrintPage();
    expect(container.querySelectorAll('.ctpp-preview-area .crs-bg').length).toBe(1);
    expect(container.querySelectorAll('.ctpp-print-area .crs-bg').length).toBe(0);
    expect(container.querySelectorAll('.ctpp-print-area img').length).toBe(0);
  });

  it('prints the A4 page Electron was told about, not the cheque size', async () => {
    const { container } = renderGulfPrintPage();
    const css = Array.from(container.querySelectorAll('style')).map((s) => s.textContent).join('\n');
    expect(css).toContain('@page { size: 297mm 210mm; margin: 0; }');
    (container.querySelector('.ctpp-chrome .btn:not(.secondary)') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(printPage).toHaveBeenCalled());
    expect(printPage).toHaveBeenCalledWith({
      landscape: false,
      pageSize: { width: 297000, height: 210000 },
      marginType: 'none',
      scaleFactor: 100,
    });
  });
});

// ── G. Nothing that already worked may change ────────────────────────────────

describe('the shared cheque-print architecture is intact', () => {
  it('keeps the A4 sheet default placement for a caller that supplies none', () => {
    expect(DEFAULT_A4_PLACEMENT).toEqual({ xMm: 114, yMm: 60.5, widthMm: 178, heightMm: 89 });
  });

  it('keeps every non-Gulf field single-line', () => {
    const model = resolveChequeTemplateForPrint(
      {
        surface: { widthCm: 17.8, heightCm: 8.9 },
        fields: [{
          id: 'beneficiary', label: '', value: '', x: 5, y: 22, width: 45, height: 6, rotation: 0,
          fontSize: 14, fontWeight: 400, textAlign: 'right', color: '#000000', zIndex: 1, visible: true,
        }],
      },
      { beneficiary: 'مستفيد' },
    );
    const field = model.fields[0];
    expect(field.multiline).toBe(false);
    expect(field.maxLines).toBe(1);
  });
});
