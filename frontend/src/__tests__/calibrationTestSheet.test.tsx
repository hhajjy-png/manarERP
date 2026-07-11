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
  REF_LABEL_AR,
  REF_LABEL_EN,
  PRINT_SCALE_NOTE_AR,
  PRINT_SCALE_NOTE_EN,
  FEED_EDGE_LABEL_AR,
  FEED_EDGE_LABEL_EN,
} from '../components/calibrator/CalibrationTestSheet';
import {
  buildTicks,
  labelledCentimetres,
  CORNER_CLEAR_MM,
  RULER_LANE_MM,
  RULER_INK,
  TICK_MAJOR_MM,
  TICK_MID_MM,
  TICK_MINOR_MM,
} from '../components/calibrator/CalibrationEdgeRuler';
import { cloneDefaultTemplate, FIELD_KEYS, FIELD_LABELS } from '../utils/chequeTemplate';
import {
  DEFAULT_GEOMETRY,
  fieldMm,
  chequePaperLeftMm,
  chequePaperBoundsMm,
  fieldsOutsideCheque,
  pageCentreMm,
  buildCentreAxes,
  CHEQUE_FEED_RIGHT_OFFSET_MM,
} from '../utils/chequeGeometry';

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

  it('draws the cheque boundary anchored to the RIGHT feed edge, at the configured size', () => {
    const c = renderSheet();
    const outline = c.querySelector('.chq-test-outline rect')!;
    // Anchored from the right paper edge — NOT from offsetXMm, which is the print
    // engine's translate offset and means something else entirely.
    expect(outline.getAttribute('x')).toBe(String(chequePaperLeftMm(DEFAULT_GEOMETRY)));
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

  // ── Rollback guard (retargeted) ──────────────────────────────────────────────
  // The ORIGINAL guard banned "grid, rulers, origin marker and axis arrows" wholesale,
  // because the first attempt at them was drawn with CSS backgrounds
  // (repeating-linear-gradient + print-color-adjust) and repeatedly failed to come out
  // of real printers — browsers and printers drop background ink by default.
  //
  // The failure was the TECHNIQUE, not the feature. This guard therefore keeps every
  // tooth aimed at the technique — no CSS backgrounds, gradients, background-images or
  // print-color-adjust dependency anywhere on the sheet — while allowing the rulers to
  // exist as foreground SVG <line>/<text> ink, which is the only thing that prints
  // reliably here. If anyone reintroduces the background approach, this fails.
  it('never reintroduces the CSS-background ruler/grid technique that failed to print', () => {
    const html = renderSheet().innerHTML;
    expect(html).not.toContain('repeating-linear-gradient');
    expect(html).not.toContain('linear-gradient');
    expect(html).not.toContain('print-color-adjust');
    expect(html).not.toContain('background-image');
    expect(html).not.toContain('backgroundImage');
  });

  it('never reintroduces the old full-page diagnostic grid, origin marker or axis arrows', () => {
    const c = renderSheet();
    expect(c.querySelectorAll('.chq-diag-major, .chq-diag-minor').length).toBe(0);
    expect(c.querySelector('.chq-diag-ruler')).toBeNull();
    expect(c.querySelector('.chq-diag-origin')).toBeNull();
    // <marker> stays banned: the feed-edge arrowhead is a <polygon>, not a marker.
    expect(c.querySelector('marker')).toBeNull();

    // The centre cross is TWO lines and only two. A dense grid rebuilt as "centre
    // axes" would blow this assertion immediately.
    expect(c.querySelectorAll('.chq-centre-cross line').length).toBe(2);

    // And away from the ruler lanes and the centre cross, the only ink is accounted
    // for exactly: 8 crosshair arms + 3 scale-reference strokes + 1 feed arrow shaft
    // + 1 footer rule. No grid may hide here either.
    const other = Array.from(c.querySelectorAll('line')).filter(
      (l) => !l.closest('.chq-ruler') && !l.closest('.chq-centre-cross'),
    );
    expect(other.length).toBe(13);
    expect(c.querySelectorAll('.chq-test-footer line').length).toBe(1);
    expect(c.querySelectorAll('.chq-test-scaleref line').length).toBe(3);
    expect(c.querySelectorAll('.chq-test-feededge line').length).toBe(1);
  });

  it('renders the rulers as foreground SVG ink — real strokes, no opacity, no light grey', () => {
    const c = renderSheet();
    const ticks = c.querySelectorAll('.chq-ruler__tick');
    expect(ticks.length).toBeGreaterThan(0);
    for (const t of Array.from(ticks).slice(0, 40)) {
      expect(t.tagName.toLowerCase()).toBe('line');
      expect(t.getAttribute('stroke')).toBe(RULER_INK);
      expect(t.getAttribute('opacity')).toBeNull();
      expect(t.getAttribute('stroke-opacity')).toBeNull();
      expect(Number(t.getAttribute('stroke-width'))).toBeGreaterThan(0);
    }
    for (const l of Array.from(c.querySelectorAll('.chq-ruler__label')).slice(0, 20)) {
      expect(l.tagName.toLowerCase()).toBe('text');
      expect(l.getAttribute('fill')).toBe(RULER_INK);
    }
  });
});

// ── Four-edge physical ruler ───────────────────────────────────────────────────
describe('CalibrationTestSheet — four-edge centimetre ruler', () => {
  afterEach(cleanup);

  const W = DEFAULT_GEOMETRY.pageWidthMm; // 297
  const H = DEFAULT_GEOMETRY.pageHeightMm; // 210

  /** Tick offsets along a ruler's own axis, in mm, in document order. */
  function tickOffsets(c: HTMLElement, side: 'top' | 'bottom' | 'left' | 'right'): number[] {
    const horizontal = side === 'top' || side === 'bottom';
    return Array.from(c.querySelectorAll(`.chq-ruler--${side} .chq-ruler__tick`)).map((t) =>
      Number(t.getAttribute(horizontal ? 'x1' : 'y1')),
    );
  }

  it('draws exactly four rulers — one per paper edge', () => {
    const c = renderSheet();
    expect(c.querySelectorAll('.chq-ruler').length).toBe(4);
    for (const side of ['top', 'bottom', 'left', 'right'] as const) {
      expect(c.querySelector(`.chq-ruler--${side}`)).not.toBeNull();
      expect(c.querySelectorAll(`.chq-ruler--${side} .chq-ruler__baseline`).length).toBe(1);
    }
  });

  it('each ruler starts at zero and spans the full physical length of its edge', () => {
    const c = renderSheet();
    // Horizontal rulers span the page WIDTH; vertical rulers span the page HEIGHT.
    expect(tickOffsets(c, 'top').at(0)).toBe(0);
    expect(tickOffsets(c, 'top').at(-1)).toBe(W);
    expect(tickOffsets(c, 'bottom').at(0)).toBe(0);
    expect(tickOffsets(c, 'bottom').at(-1)).toBe(W);
    expect(tickOffsets(c, 'left').at(0)).toBe(0);
    expect(tickOffsets(c, 'left').at(-1)).toBe(H);
    expect(tickOffsets(c, 'right').at(0)).toBe(0);
    expect(tickOffsets(c, 'right').at(-1)).toBe(H);
  });

  it('places a tick every 1 mm', () => {
    const c = renderSheet();
    const top = tickOffsets(c, 'top');
    expect(top.length).toBe(W + 1); // 0…297 inclusive
    for (let i = 1; i < top.length; i++) expect(top[i] - top[i - 1]).toBeCloseTo(1, 10);

    const left = tickOffsets(c, 'left');
    expect(left.length).toBe(H + 1); // 0…210 inclusive
    for (let i = 1; i < left.length; i++) expect(left[i] - left[i - 1]).toBeCloseTo(1, 10);
  });

  it('places a stronger 5 mm tick and a strongest 10 mm tick, correctly spaced', () => {
    const c = renderSheet();

    const majors = Array.from(c.querySelectorAll('.chq-ruler--top .chq-ruler__tick--major')).map((t) =>
      Number(t.getAttribute('x1')),
    );
    // Every centimetre from 0 to 290 mm.
    expect(majors.length).toBe(30);
    expect(majors.every((mm) => mm % 10 === 0)).toBe(true);
    for (let i = 1; i < majors.length; i++) expect(majors[i] - majors[i - 1]).toBeCloseTo(10, 10);

    const mids = Array.from(c.querySelectorAll('.chq-ruler--top .chq-ruler__tick--mid')).map((t) =>
      Number(t.getAttribute('x1')),
    );
    expect(mids.every((mm) => mm % 5 === 0 && mm % 10 !== 0)).toBe(true);
    // Consecutive 5 mm marks (major ∪ mid) are exactly 5 mm apart.
    const fives = [...majors, ...mids].sort((a, b) => a - b);
    for (let i = 1; i < fives.length; i++) expect(fives[i] - fives[i - 1]).toBeCloseTo(5, 10);
  });

  it('makes the 10 mm marks visually strongest — longest and heaviest stroke', () => {
    const c = renderSheet();
    const len = (el: Element) => Math.abs(Number(el.getAttribute('y2')) - Number(el.getAttribute('y1')));
    const weight = (el: Element) => Number(el.getAttribute('stroke-width'));
    const major = c.querySelector('.chq-ruler--top .chq-ruler__tick--major')!;
    const mid = c.querySelector('.chq-ruler--top .chq-ruler__tick--mid')!;
    const minor = c.querySelector('.chq-ruler--top .chq-ruler__tick--minor')!;

    expect(len(major)).toBeCloseTo(TICK_MAJOR_MM, 10);
    expect(len(mid)).toBeCloseTo(TICK_MID_MM, 10);
    expect(len(minor)).toBeCloseTo(TICK_MINOR_MM, 10);
    expect(len(major)).toBeGreaterThan(len(mid));
    expect(len(mid)).toBeGreaterThan(len(minor));
    expect(weight(major)).toBeGreaterThan(weight(mid));
    expect(weight(mid)).toBeGreaterThan(weight(minor));
  });

  it('numbers the centimetres in Western digits, at true centimetre positions', () => {
    const c = renderSheet();
    const labels = Array.from(c.querySelectorAll('.chq-ruler--top .chq-ruler__label'));
    expect(labels.length).toBeGreaterThan(0);
    for (const l of labels) {
      const cm = l.textContent ?? '';
      expect(cm).toMatch(/^\d+$/); // Western digits only — no Arabic-Indic
      // The numeral sits exactly on its centimetre mark.
      expect(Number(l.getAttribute('x'))).toBeCloseTo(Number(cm) * 10, 10);
    }
  });

  it('keeps every tick inside the physical page bounds', () => {
    const c = renderSheet();
    for (const t of Array.from(c.querySelectorAll('.chq-ruler__tick'))) {
      for (const a of ['x1', 'x2'] as const) {
        const v = Number(t.getAttribute(a));
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(W);
      }
      for (const a of ['y1', 'y2'] as const) {
        const v = Number(t.getAttribute(a));
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(H);
      }
    }
  });

  it('handles the corners: no label collides, and no zero label is printed twice', () => {
    const c = renderSheet();
    const all = Array.from(c.querySelectorAll('.chq-ruler__label'));
    // Nothing is labelled inside the corner clearance at either end of any ruler…
    for (const side of ['top', 'bottom'] as const) {
      for (const l of Array.from(c.querySelectorAll(`.chq-ruler--${side} .chq-ruler__label`))) {
        const x = Number(l.getAttribute('x'));
        expect(x).toBeGreaterThanOrEqual(CORNER_CLEAR_MM);
        expect(x).toBeLessThanOrEqual(W - CORNER_CLEAR_MM);
      }
    }
    for (const side of ['left', 'right'] as const) {
      for (const l of Array.from(c.querySelectorAll(`.chq-ruler--${side} .chq-ruler__label`))) {
        const y = Number(l.getAttribute('y'));
        expect(y).toBeGreaterThanOrEqual(CORNER_CLEAR_MM);
        expect(y).toBeLessThanOrEqual(H - CORNER_CLEAR_MM);
      }
    }
    // …so "0" is never printed at all, let alone twice (a numeral at 0 mm would sit
    // in the printer's non-printable margin and come out clipped).
    expect(all.filter((l) => l.textContent === '0').length).toBe(0);
  });

  it('aligns opposing rulers: top matches bottom, left matches right', () => {
    const c = renderSheet();
    expect(tickOffsets(c, 'top')).toEqual(tickOffsets(c, 'bottom'));
    expect(tickOffsets(c, 'left')).toEqual(tickOffsets(c, 'right'));
  });

  it('adapts to a different physical page size instead of assuming A4', () => {
    const geometry = { ...DEFAULT_GEOMETRY, pageWidthMm: 210, pageHeightMm: 297 };
    const c = renderSheet({ geometry });
    expect(tickOffsets(c, 'top').at(-1)).toBe(210);
    expect(tickOffsets(c, 'left').at(-1)).toBe(297);
  });

  // ── Physical scale reference ──
  it('prints a scale reference line that measures exactly 100.0 mm', () => {
    const c = renderSheet();
    const ref = c.querySelector('.chq-test-scaleref line')!;
    const length = Number(ref.getAttribute('x2')) - Number(ref.getAttribute('x1'));
    expect(length).toBe(100); // 10.0 cm, in the sheet's true-mm user units
  });

  it('tells the operator to print at 100% with fit-to-page disabled, in both languages', () => {
    const text = renderSheet().textContent ?? '';
    expect(text).toContain(REF_LABEL_AR);
    expect(text).toContain(REF_LABEL_EN);
    expect(text).toContain(PRINT_SCALE_NOTE_AR);
    expect(text).toContain(PRINT_SCALE_NOTE_EN);
    // The label states BOTH units, so the operator can measure with either scale.
    expect(REF_LABEL_AR).toContain('10 cm');
    expect(REF_LABEL_AR).toContain('100 mm');
    expect(REF_LABEL_EN).toContain('10 cm');
    expect(REF_LABEL_EN).toContain('100 mm');
    expect(text).not.toMatch(/[٠-٩۰-۹]/); // Western digits everywhere
  });

  it('caps the reference at exactly 0 mm and 100 mm, with caps stronger than the line', () => {
    const c = renderSheet();
    const line = c.querySelector('.chq-test-scaleref__line')!;
    const caps = Array.from(c.querySelectorAll('.chq-test-scaleref__cap'));
    const x1 = Number(line.getAttribute('x1'));
    expect(caps.length).toBe(2);
    expect(Number(caps[0].getAttribute('x1')) - x1).toBe(0);
    expect(Number(caps[1].getAttribute('x1')) - x1).toBe(100);
    // End caps are the heaviest marks in the block — they are what gets measured.
    expect(Number(caps[0].getAttribute('stroke-width'))).toBeGreaterThan(
      Number(line.getAttribute('stroke-width')),
    );
  });

  it('insets the reference block well clear of the left ruler lane', () => {
    const c = renderSheet();
    const x = Number(c.querySelector('.chq-test-scaleref__line')!.getAttribute('x1'));
    expect(x).toBeGreaterThanOrEqual(RULER_LANE_MM + 8);
    expect(x).toBeLessThanOrEqual(RULER_LANE_MM + 12);
  });

  it('keeps the ruler lanes clear of the footer band', () => {
    const c = renderSheet();
    const footerInk = Array.from(c.querySelectorAll('.chq-test-footer text')).map((t) =>
      Number(t.getAttribute('y')),
    );
    const lowest = Math.max(...footerInk);
    // The footer stops above the bottom ruler lane…
    expect(lowest).toBeLessThan(H - RULER_LANE_MM);
    // …and the footer rule stops short of the left/right ruler lanes.
    const rule = c.querySelector('.chq-test-footer line')!;
    expect(Number(rule.getAttribute('x1'))).toBeGreaterThan(RULER_LANE_MM);
    expect(Number(rule.getAttribute('x2'))).toBeLessThan(W - RULER_LANE_MM);
  });

  it('keeps the scale reference clear of every ruler lane', () => {
    const c = renderSheet();
    const ref = c.querySelector('.chq-test-scaleref line')!;
    expect(Number(ref.getAttribute('x1'))).toBeGreaterThan(RULER_LANE_MM);
    expect(Number(ref.getAttribute('x2'))).toBeLessThan(W - RULER_LANE_MM);
    const y = Number(ref.getAttribute('y1'));
    expect(y).toBeGreaterThan(RULER_LANE_MM);
    expect(y).toBeLessThan(H - RULER_LANE_MM);
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

// ── Feed-edge origin (Part A) ───────────────────────────────────────────────────
describe('CalibrationTestSheet — cheque anchored to the RIGHT feed edge', () => {
  afterEach(cleanup);

  const g = DEFAULT_GEOMETRY;
  const outlineOf = (c: HTMLElement) => c.querySelector('.chq-test-outline rect')!;

  it('anchors the cheque from the right paper edge: pageWidth − chequeWidth − rightOffset', () => {
    const c = renderSheet();
    const x = Number(outlineOf(c).getAttribute('x'));
    expect(x).toBe(g.pageWidthMm - g.chequeWidthMm - CHEQUE_FEED_RIGHT_OFFSET_MM);
    expect(x).toBe(122); // A4 landscape, 175 mm cheque, zero feed offset
  });

  it('places the cheque flush against the right paper edge at zero right offset', () => {
    const c = renderSheet();
    const x = Number(outlineOf(c).getAttribute('x'));
    const right = x + Number(outlineOf(c).getAttribute('width'));
    expect(CHEQUE_FEED_RIGHT_OFFSET_MM).toBe(0);
    expect(right).toBe(g.pageWidthMm); // the cheque's right edge IS the paper's right edge
  });

  it('extends the cheque toward the LEFT, not past the right edge', () => {
    const c = renderSheet();
    const x = Number(outlineOf(c).getAttribute('x'));
    const w = Number(outlineOf(c).getAttribute('width'));
    expect(x).toBeGreaterThan(0);
    expect(x + w).toBeLessThanOrEqual(g.pageWidthMm);
  });

  it('moves the cheque leftward as the right offset increases', () => {
    expect(chequePaperLeftMm(g, 0)).toBe(122);
    expect(chequePaperLeftMm(g, 10)).toBe(112);
    expect(chequePaperLeftMm(g, 25)).toBe(97);
    // Strictly monotonic leftward.
    expect(chequePaperLeftMm(g, 10)).toBeLessThan(chequePaperLeftMm(g, 0));
  });

  it('never uses offsetXMm as the paper anchor — that is the print translate offset', () => {
    const c = renderSheet();
    // offsetXMm is 0; the outline must NOT be at 0.
    expect(g.offsetXMm).toBe(0);
    expect(Number(outlineOf(c).getAttribute('x'))).not.toBe(g.offsetXMm);
    // …and fieldMm() still consumes offsetXMm, unchanged.
    const cfg = { ...cloneDefaultTemplate().beneficiary, left: 0, top: 0 };
    expect(fieldMm(cfg, g).xMm).toBe(g.offsetXMm);
  });

  it('leaves cheque width, height and Y position untouched', () => {
    const c = renderSheet();
    const r = outlineOf(c);
    expect(Number(r.getAttribute('width'))).toBe(g.chequeWidthMm);
    expect(Number(r.getAttribute('height'))).toBe(g.chequeHeightMm);
    expect(Number(r.getAttribute('y'))).toBe(g.offsetYMm);
  });

  it('keeps internal field coordinates unchanged — nothing is mirrored', () => {
    const c = renderSheet();
    const tpl = cloneDefaultTemplate();
    // Every marker still sits exactly where fieldMm() says the ink lands.
    const xs = Array.from(c.querySelectorAll('.chq-test-marker circle')).map((el) =>
      Number(el.getAttribute('cx')),
    );
    const expected = Object.values(tpl).map((cfg) => fieldMm(cfg, g).xMm);
    expect(xs.sort((a, b) => a - b)).toEqual(expected.sort((a, b) => a - b));
  });

  it('uses no mirror transform anywhere — no scaleX(-1), no negative scale', () => {
    const c = renderSheet();
    const html = c.innerHTML;
    expect(html).not.toContain('scaleX');
    expect(html).not.toContain('scale(-');
    expect(html).not.toContain('matrix(-');
    expect(c.querySelector('[transform]')).toBeNull();
  });

  it('adapts the anchor to a different page width', () => {
    const geometry = { ...g, pageWidthMm: 250 };
    const c = renderSheet({ geometry });
    expect(Number(outlineOf(c).getAttribute('x'))).toBe(250 - g.chequeWidthMm);
  });

  // ── Feed-edge indicator ──
  it('marks the feed edge in Arabic and English, with an arrow, clear of the right ruler', () => {
    const c = renderSheet();
    const feed = c.querySelector('.chq-test-feededge')!;
    expect(feed.textContent).toContain(FEED_EDGE_LABEL_AR);
    expect(feed.textContent).toContain(FEED_EDGE_LABEL_EN);
    // Arrowhead is a polygon, never a banned <marker>.
    expect(feed.querySelector('polygon')).not.toBeNull();
    expect(feed.querySelector('marker')).toBeNull();
    // Nothing pokes into the right ruler lane…
    const tip = Math.max(
      ...Array.from(feed.querySelectorAll('line')).map((l) => Number(l.getAttribute('x2'))),
    );
    expect(tip).toBeLessThan(DEFAULT_GEOMETRY.pageWidthMm - RULER_LANE_MM);
    // …and it sits below the cheque, so it cannot overlap a field.
    const y = Number(feed.querySelector('line')!.getAttribute('y1'));
    expect(y).toBeGreaterThan(g.offsetYMm + g.chequeHeightMm);
  });
});

// ── Full-page centre cross (Part B) ─────────────────────────────────────────────
describe('CalibrationTestSheet — exact full-page centre cross', () => {
  afterEach(cleanup);

  const W = DEFAULT_GEOMETRY.pageWidthMm;
  const H = DEFAULT_GEOMETRY.pageHeightMm;
  const v = (c: HTMLElement) => c.querySelector('.chq-centre-cross__v')!;
  const h = (c: HTMLElement) => c.querySelector('.chq-centre-cross__h')!;

  it('puts the vertical axis at exactly half the paper width, edge to edge', () => {
    const c = renderSheet();
    expect(Number(v(c).getAttribute('x1'))).toBe(W / 2);
    expect(Number(v(c).getAttribute('x2'))).toBe(W / 2);
    expect(Number(v(c).getAttribute('y1'))).toBe(0);
    expect(Number(v(c).getAttribute('y2'))).toBe(H);
  });

  it('puts the horizontal axis at exactly half the paper height, edge to edge', () => {
    const c = renderSheet();
    expect(Number(h(c).getAttribute('y1'))).toBe(H / 2);
    expect(Number(h(c).getAttribute('y2'))).toBe(H / 2);
    expect(Number(h(c).getAttribute('x1'))).toBe(0);
    expect(Number(h(c).getAttribute('x2'))).toBe(W);
  });

  it('intersects at the exact physical centre — 148.5 × 105 mm on A4 landscape', () => {
    const c = renderSheet();
    const centre = pageCentreMm(DEFAULT_GEOMETRY);
    expect(centre).toEqual({ xMm: 148.5, yMm: 105 });
    expect(Number(v(c).getAttribute('x1'))).toBe(centre.xMm);
    expect(Number(h(c).getAttribute('y1'))).toBe(centre.yMm);
    // The centre is equidistant from both opposing pairs of edges.
    expect(centre.xMm).toBe(W - centre.xMm);
    expect(centre.yMm).toBe(H - centre.yMm);
    const marker = c.querySelector('.chq-centre-cross__marker')!;
    expect(Number(marker.getAttribute('cx'))).toBe(centre.xMm);
    expect(Number(marker.getAttribute('cy'))).toBe(centre.yMm);
  });

  it('derives the centre from the active geometry, never from a hardcoded A4', () => {
    const geometry = { ...DEFAULT_GEOMETRY, pageWidthMm: 210, pageHeightMm: 297 };
    const c = renderSheet({ geometry });
    expect(Number(v(c).getAttribute('x1'))).toBe(105);
    expect(Number(h(c).getAttribute('y1'))).toBe(148.5);
    expect(buildCentreAxes(geometry).vertical).toEqual({ x1: 105, y1: 0, x2: 105, y2: 297 });
  });

  it('renders BEHIND the rulers so it can never hide a tick or a numeral', () => {
    const c = renderSheet();
    const svg = c.querySelector('svg')!;
    const groups = Array.from(svg.children).map((el) => el.getAttribute('class') ?? el.tagName);
    const cross = groups.findIndex((g) => g === 'chq-centre-cross');
    const rulers = groups.findIndex((g) => g === 'chq-ruler-frame');
    const outline = groups.findIndex((g) => g === 'chq-test-outline');
    expect(cross).toBeGreaterThanOrEqual(0);
    expect(cross).toBeLessThan(rulers); // painted first → underneath
    expect(rulers).toBeLessThan(outline);
  });

  it('is light and visually subordinate — a solid stroke, not a transparent one', () => {
    const c = renderSheet();
    for (const line of [v(c), h(c)]) {
      const w = Number(line.getAttribute('stroke-width'));
      expect(w).toBeGreaterThanOrEqual(0.15);
      expect(w).toBeLessThanOrEqual(0.25);
      expect(line.getAttribute('stroke-dasharray')).toBeNull(); // solid
      expect(line.getAttribute('opacity')).toBeNull(); // printers render opacity badly
      expect(line.getAttribute('stroke-opacity')).toBeNull();
    }
    // Lighter than the ruler ink and the cheque outline it must not compete with.
    const ruler = Number(
      c.querySelector('.chq-ruler__tick--major')!.getAttribute('stroke-width'),
    );
    expect(Number(v(c).getAttribute('stroke-width'))).toBeLessThan(ruler);
  });
});

// ── Calibration consistency guard ───────────────────────────────────────────────
// The right-edge anchor EXPOSED a pre-existing contradiction between DEFAULT_TEMPLATE
// (percentages of the full page) and DEFAULT_GEOMETRY (a 175 mm right-fed cheque); it
// did not create it. The four default fields span ~228 mm, which no 175 mm box can
// contain at any anchor — under the OLD left anchor, date and numeric were already
// outside. This block proves the sheet now says so, deterministically.
describe('CalibrationTestSheet — calibration consistency warning', () => {
  afterEach(cleanup);

  const g = DEFAULT_GEOMETRY;
  const tpl = cloneDefaultTemplate();

  it('reports the cheque paper bounds from the right-edge anchor', () => {
    expect(chequePaperBoundsMm(g)).toEqual({
      leftMm: 122,
      rightMm: 297,
      topMm: 40,
      bottomMm: 120,
    });
  });

  it('the current defaults DO trip the diagnostic', () => {
    expect(fieldsOutsideCheque(tpl, g).length).toBeGreaterThan(0);
  });

  it('identifies exactly the affected fields — beneficiary and tafqeet', () => {
    // beneficiary left 34.5% → x = 102.465 mm; tafqeet left 5.7% → x = 16.929 mm.
    // Both sit left of the cheque's left edge (122 mm). date (234.9) and numeric
    // (244.7) are inside 122…297 and must NOT be flagged.
    expect(fieldsOutsideCheque(tpl, g)).toEqual(['beneficiary', 'tafqeet']);
    // Exact coordinates, so a silent shift in the defaults cannot slip past.
    expect(fieldMm(tpl.beneficiary, g).xMm).toBeCloseTo(102.465, 3);
    expect(fieldMm(tpl.tafqeet, g).xMm).toBeCloseTo(16.929, 3);
    expect(fieldMm(tpl.date, g).xMm).toBeCloseTo(234.927, 3);
    expect(fieldMm(tpl.numeric, g).xMm).toBeCloseTo(244.728, 3);
  });

  it('a mathematically consistent template produces NO finding', () => {
    // Percentages that place every anchor inside the right-fed cheque (122…297 mm)
    // and inside its vertical band (40…120 mm). Nothing in the source is changed —
    // this template exists only in this test.
    const consistent = cloneDefaultTemplate();
    consistent.tafqeet.left = 45; // → 133.65 mm
    consistent.beneficiary.left = 50; // → 148.5 mm
    consistent.date.left = 70; // → 207.9 mm
    consistent.numeric.left = 75; // → 222.75 mm
    expect(fieldsOutsideCheque(consistent, g)).toEqual([]);
  });

  it('flags a field that falls outside VERTICALLY too, not just horizontally', () => {
    const t = cloneDefaultTemplate();
    t.tafqeet.left = 50;
    t.beneficiary.left = 50;
    t.date.left = 70;
    t.numeric.left = 70;
    expect(fieldsOutsideCheque(t, g)).toEqual([]); // baseline: all inside
    t.date.top = 95; // → y = 40 + 0.95 × 115.4 = 149.6 mm, below the cheque (120)
    expect(fieldsOutsideCheque(t, g)).toEqual(['date']);
  });

  it('is computed against the RIGHT-edge anchor, not the old left one', () => {
    // Under the OLD left anchor (0…175) the offending pair would have been
    // date + numeric. The check must follow the right-edge bounds.
    const oldStyleLeftBounds = { leftMm: 0, rightMm: 175 };
    const beneficiaryX = fieldMm(tpl.beneficiary, g).xMm;
    expect(beneficiaryX).toBeGreaterThan(oldStyleLeftBounds.leftMm);
    expect(beneficiaryX).toBeLessThan(oldStyleLeftBounds.rightMm); // was inside before
    expect(fieldsOutsideCheque(tpl, g)).toContain('beneficiary'); // outside now
  });

  it('moves nothing: markers stay exactly where fieldMm() puts them', () => {
    const c = renderSheet();
    const circles = Array.from(c.querySelectorAll('.chq-test-marker circle'));
    const expected = FIELD_KEYS.map((fk) => fieldMm(tpl[fk], g));
    const got = circles.map((el) => ({
      xMm: Number(el.getAttribute('cx')),
      yMm: Number(el.getAttribute('cy')),
    }));
    expect(got).toEqual(expected);
    // The outline was not enlarged to swallow the strays.
    const r = c.querySelector('.chq-test-outline rect')!;
    expect(Number(r.getAttribute('width'))).toBe(g.chequeWidthMm);
    expect(Number(r.getAttribute('x'))).toBe(122);
  });

  // ── The diagnostic is for code and tests. It must NEVER reach the paper. ────────
  // The operator calibrates visually against the real cheque; a warning block would
  // clutter a technical measuring instrument and, worse, read as if the right-edge
  // anchor were defective. Markers outside the default outline do not block the
  // workflow. These tests keep it off the sheet.
  it('prints NO warning block, even though the defaults trip the diagnostic', () => {
    // Precondition: the diagnostic really does fire on this template…
    expect(fieldsOutsideCheque(tpl, g).length).toBeGreaterThan(0);
    // …and the printed sheet says nothing about it.
    const c = renderSheet();
    expect(c.querySelector('.chq-test-calibwarn')).toBeNull();
    expect(c.querySelector('.chq-test-calibwarn__fields')).toBeNull();
  });

  it('prints no warning wording, in either language', () => {
    const text = renderSheet().textContent ?? '';
    expect(text).not.toContain('تنبيه معايرة');
    expect(text).not.toContain('Calibration warning');
    expect(text).not.toContain('الحقول المتأثرة');
    expect(text).not.toContain('outside the current cheque boundary');
  });

  it('prints no warning rule — the non-ruler line budget is unchanged', () => {
    const c = renderSheet();
    const other = Array.from(c.querySelectorAll('line')).filter(
      (l) => !l.closest('.chq-ruler') && !l.closest('.chq-centre-cross'),
    );
    // 8 crosshair arms + 3 scale-reference strokes + 1 feed arrow shaft + 1 footer
    // rule. No warning rule among them.
    expect(other.length).toBe(13);
  });

  it('never wires the diagnostic into the component at all', () => {
    const sheet = readFileSync('src/components/calibrator/CalibrationTestSheet.tsx', 'utf8');
    // Strip comments — the prose above the import block explains WHY the diagnostic is
    // not printed, and is allowed to name it. Only executable code is judged here.
    const code = sheet
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
      .replace(/\/\/.*$/gm, '');
    expect(code).not.toContain('fieldsOutsideCheque');
    expect(code).not.toContain('chq-test-calibwarn');
    expect(code).not.toContain('CALIB_WARNING');
  });
});

// ── The ruler must never reach real money either. ────────────────────────────────
describe('real cheque print path carries no ruler', () => {
  const source = readFileSync('src/pages/Cheques.tsx', 'utf8');

  it('the Cheques page never imports the edge ruler or renders ruler ink', () => {
    expect(source).not.toContain('CalibrationEdgeRuler');
    expect(source).not.toContain('CalibrationRulerFrame');
    expect(source).not.toContain('chq-ruler');
    expect(source).not.toContain('chq-test-scaleref');
    expect(source).not.toContain(REF_LABEL_AR);
    expect(source).not.toContain(PRINT_SCALE_NOTE_EN);
  });

  it('the Cheques page carries no centre cross and no feed-edge indicator', () => {
    expect(source).not.toContain('chq-centre-cross');
    expect(source).not.toContain('chq-test-feededge');
    expect(source).not.toContain(FEED_EDGE_LABEL_AR);
    expect(source).not.toContain(FEED_EDGE_LABEL_EN);
    expect(source).not.toContain('buildCentreAxes');
    expect(source).not.toContain('chequePaperLeftMm');
  });

  it('the Cheques page carries no calibration diagnostic and no warning of any kind', () => {
    expect(source).not.toContain('chq-test-calibwarn');
    expect(source).not.toContain('fieldsOutsideCheque');
    expect(source).not.toContain('chequePaperBoundsMm');
    expect(source).not.toContain('تنبيه معايرة');
    expect(source).not.toContain('Calibration warning');
  });

  it('the real print path still anchors from its own untouched constant', () => {
    // The cheque print engine has its own offset constant and never reads the
    // calibration geometry. The feed-edge fix therefore cannot reach it.
    expect(source).toContain('const CHEQUE_PAGE_OFFSET_X_MM: number = 0;');
    expect(source).toContain('const CHEQUE_PAGE_OFFSET_Y_MM: number = 40;');
  });

  it('the ruler is only ever mounted by the calibration test sheet', () => {
    const sheet = readFileSync('src/components/calibrator/CalibrationTestSheet.tsx', 'utf8');
    expect(sheet).toContain('CalibrationRulerFrame');
  });
});

// ── Tick generation is pure, deterministic, and never hardcoded. ─────────────────
describe('CalibrationEdgeRuler — tick generation', () => {
  it('generates one tick per millimetre from zero, inclusive of both ends', () => {
    const ticks = buildTicks(50);
    expect(ticks.length).toBe(51);
    expect(ticks[0].mm).toBe(0);
    expect(ticks.at(-1)!.mm).toBe(50);
    expect(ticks.map((t) => t.mm)).toEqual([...Array(51).keys()]);
  });

  it('classifies 10 mm marks as major and 5 mm marks as mid', () => {
    const ticks = buildTicks(20);
    expect(ticks.filter((t) => t.major).map((t) => t.mm)).toEqual([0, 10, 20]);
    expect(ticks.find((t) => t.mm === 5)!.len).toBe(TICK_MID_MM);
    expect(ticks.find((t) => t.mm === 10)!.len).toBe(TICK_MAJOR_MM);
    expect(ticks.find((t) => t.mm === 7)!.len).toBe(TICK_MINOR_MM);
  });

  it('labels only the centimetres that clear both corners', () => {
    // A 297 mm run: 0 mm and 10 mm are inside the corner clearance, so labelling
    // starts at 2 cm; the far end stops symmetrically.
    const cms = labelledCentimetres(297);
    expect(cms[0]).toBe(2);
    expect(cms.at(-1)).toBe(27);
    expect(cms.every((cm) => cm * 10 >= CORNER_CLEAR_MM && cm * 10 <= 297 - CORNER_CLEAR_MM)).toBe(true);
  });

  it('exposes a ruler lane wide enough for its own ink', () => {
    // Longest tick reaches RULER_BASE + TICK_MAJOR = 9.6 mm; the label baseline sits
    // at 12.4 mm. The declared lane must contain both.
    expect(RULER_LANE_MM).toBeGreaterThan(12.4);
    expect(RULER_INK).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
