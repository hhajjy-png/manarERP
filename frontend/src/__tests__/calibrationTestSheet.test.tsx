// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { readFileSync } from 'node:fs';
import CalibrationTestSheet, {
  TEST_SHEET_TITLE,
  TEST_SHEET_APP,
  TEST_SHEET_VERSION,
  TEST_SHEET_WARNING,
} from '../components/calibrator/CalibrationTestSheet';
import { cloneDefaultTemplate } from '../utils/chequeTemplate';
import { DEFAULT_GEOMETRY, fieldMm } from '../utils/chequeGeometry';

const FIXED_DATE = new Date(2026, 6, 10, 14, 5); // 10/07/2026 14:05

function renderSheet(props: Partial<React.ComponentProps<typeof CalibrationTestSheet>> = {}) {
  const { container } = render(
    <CalibrationTestSheet
      template={props.template ?? cloneDefaultTemplate()}
      geometry={props.geometry ?? DEFAULT_GEOMETRY}
      showBoxes={props.showBoxes}
      printedAt={props.printedAt ?? FIXED_DATE}
    />,
  );
  return container;
}

describe('CalibrationTestSheet — field markers only', () => {
  afterEach(cleanup);

  it('renders an SVG with explicit physical mm dimensions and a valid viewBox', () => {
    const c = renderSheet();
    const svg = c.querySelector('svg')!;
    expect(svg).toBeInTheDocument();
    expect(svg.getAttribute('viewBox')).toBe(`0 0 ${DEFAULT_GEOMETRY.pageWidthMm} ${DEFAULT_GEOMETRY.pageHeightMm}`);
    expect(svg.getAttribute('width')).toBe(`${DEFAULT_GEOMETRY.pageWidthMm}mm`);
    expect(svg.getAttribute('height')).toBe(`${DEFAULT_GEOMETRY.pageHeightMm}mm`);
  });

  it('draws one registration marker per field, with name and coordinates', () => {
    const c = renderSheet();
    expect(c.querySelectorAll('.chq-test-marker').length).toBe(4);
    expect(c.textContent).toContain('%');
    expect(c.textContent).toContain('مم');
  });

  it('draws the cheque boundary at the configured offset and size', () => {
    const c = renderSheet();
    const outline = c.querySelector('.chq-test-outline rect')!;
    expect(outline.getAttribute('x')).toBe(String(DEFAULT_GEOMETRY.offsetXMm));
    expect(outline.getAttribute('y')).toBe(String(DEFAULT_GEOMETRY.offsetYMm));
    expect(outline.getAttribute('width')).toBe(String(DEFAULT_GEOMETRY.chequeWidthMm));
    expect(outline.getAttribute('height')).toBe(String(DEFAULT_GEOMETRY.chequeHeightMm));
  });

  it('showBoxes toggles the per-field bounding boxes', () => {
    const withBoxes = renderSheet({ showBoxes: true }).querySelectorAll('.chq-test-marker rect').length;
    const without = renderSheet({ showBoxes: false }).querySelectorAll('.chq-test-marker rect').length;
    expect(withBoxes).toBe(4);
    expect(without).toBe(0);
  });

  // ── Footer identification band ──
  it('prints the full footer: title, app, version, timestamp and the not-a-cheque warning', () => {
    const text = renderSheet().textContent ?? '';
    expect(text).toContain(TEST_SHEET_TITLE);
    expect(text).toContain(TEST_SHEET_APP);
    expect(text).toContain(TEST_SHEET_VERSION);
    expect(text).toContain('تاريخ الطباعة:');
    expect(text).toContain(TEST_SHEET_WARNING);
  });

  it('stamps the print date as DD/MM/YYYY HH:mm in Western digits', () => {
    const text = renderSheet().textContent ?? '';
    expect(text).toContain('10/07/2026 14:05');
    // No Arabic-Indic digits anywhere on the sheet.
    expect(text).not.toMatch(/[٠-٩۰-۹]/);
  });

  it('renders the footer as foreground SVG text with no opacity or light grey', () => {
    const footer = renderSheet().querySelector('.chq-test-footer')!;
    const texts = footer.querySelectorAll('text');
    expect(texts.length).toBe(3);
    for (const t of texts) {
      expect(t.getAttribute('fill')).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(t.getAttribute('opacity')).toBeNull();
      expect(t.getAttribute('fill-opacity')).toBeNull();
    }
  });

  it('keeps the footer inside a safe bottom margin and clear of boundary, markers and labels', () => {
    const g = DEFAULT_GEOMETRY;
    const c = renderSheet();
    const footer = c.querySelector('.chq-test-footer')!;

    const rule = Number(footer.querySelector('line')!.getAttribute('y1'));
    const baselines = Array.from(footer.querySelectorAll('text')).map((t) => Number(t.getAttribute('y')));
    const lowest = Math.max(...baselines);

    // Inside the printable area: at least 5 mm of clearance from the paper edge.
    expect(g.pageHeightMm - lowest).toBeGreaterThanOrEqual(5);
    expect(lowest).toBeLessThan(g.pageHeightMm);

    // Below the cheque boundary…
    expect(rule).toBeGreaterThan(g.offsetYMm + g.chequeHeightMm);

    // …and below every field marker's ink (crosshair arm, box, and label baseline).
    const tpl = cloneDefaultTemplate();
    for (const cfg of Object.values(tpl)) {
      const { yMm } = fieldMm(cfg, g);
      const boxBottom = yMm + Math.max(4, cfg.fontSize * 0.3528 * 1.6);
      expect(rule).toBeGreaterThan(Math.max(yMm + 4, boxBottom));
    }
  });

  // ── Rollback guard: the full-page diagnostic grid was removed after repeated
  // physical-printer failures. Nothing here may reintroduce it.
  it('prints NO full-page grid, rulers, origin marker or axis arrows', () => {
    const c = renderSheet();
    const html = c.innerHTML;
    expect(c.querySelectorAll('.chq-diag-major, .chq-diag-minor').length).toBe(0);
    expect(c.querySelector('.chq-diag-ruler')).toBeNull();
    expect(c.querySelector('.chq-diag-origin')).toBeNull();
    expect(c.querySelector('marker')).toBeNull(); // X/Y axis arrowheads
    expect(html).not.toContain('repeating-linear-gradient');
    expect(html).not.toContain('print-color-adjust');
    // A 297×210 mm page at a 10 mm pitch would need ~50 grid lines. This sheet draws
    // exactly 2 crosshair arms per field (8) plus the single footer rule (1).
    expect(c.querySelectorAll('line').length).toBe(9);
    expect(c.querySelectorAll('.chq-test-footer line').length).toBe(1);
  });
});

// ── The footer must never reach real money. ChequePrintOutput is module-private in
// pages/Cheques.tsx, so assert against its source directly (same technique as
// printWorkspace.test.tsx / explorerKitDialogConfirmStacking.test.tsx).
describe('real cheque print path carries no test-sheet footer', () => {
  const source = readFileSync('src/pages/Cheques.tsx', 'utf8');

  /** Body of `function ChequePrintOutput(...) { … }` by brace matching. */
  function chequePrintOutputBody(src: string): string {
    const m = /function\s+ChequePrintOutput\s*\(/.exec(src);
    if (!m) throw new Error('ChequePrintOutput not found');
    const open = src.indexOf('{', m.index + m[0].length);
    let depth = 0;
    for (let i = open; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}' && --depth === 0) return src.slice(open + 1, i);
    }
    throw new Error('unterminated ChequePrintOutput');
  }

  const footerStrings = [TEST_SHEET_TITLE, TEST_SHEET_APP, TEST_SHEET_VERSION, TEST_SHEET_WARNING, 'تاريخ الطباعة'];

  it('ChequePrintOutput contains none of the footer strings', () => {
    const body = chequePrintOutputBody(source);
    for (const s of footerStrings) expect(body).not.toContain(s);
    expect(body).not.toContain('chq-test-footer');
  });

  it('the Cheques page never imports or renders CalibrationTestSheet', () => {
    expect(source).not.toContain('CalibrationTestSheet');
    expect(source).not.toContain('chq-test-footer');
    expect(source).not.toContain('chq-test-sheet');
  });

  it('the footer strings live only in the calibration test sheet', () => {
    const sheet = readFileSync('src/components/calibrator/CalibrationTestSheet.tsx', 'utf8');
    for (const s of footerStrings) expect(sheet).toContain(s);
  });
});
