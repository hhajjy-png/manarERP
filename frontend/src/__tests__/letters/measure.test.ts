// @vitest-environment jsdom
/**
 * Letter Engine — physical measurement.
 *
 * The subject here is INV-1: millimetres are the unit, and the pixels-per-millimetre
 * factor is derived at runtime rather than assumed. A wrong factor puts every page
 * break in the wrong place silently, so the fallback behaviour matters as much as the
 * happy path.
 */
import { describe, it, expect } from 'vitest';
import { measureHeightMm, mmToPx, pxPerMm, pxToMm, roundMm } from '../../letters/pagination/measure';

/** An element reporting a given `offsetWidth`/`offsetHeight`, which jsdom leaves at 0. */
function elementWith(size: { width?: number; height?: number }): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'offsetWidth', { value: size.width ?? 0, configurable: true });
  Object.defineProperty(el, 'offsetHeight', { value: size.height ?? 0, configurable: true });
  return el;
}

describe('pxPerMm derives the factor from a real probe', () => {
  it('measures the probe rather than assuming a screen density', () => {
    // A 100 mm probe rendered 500 px wide means 5 px/mm — whatever the spec says.
    expect(pxPerMm(elementWith({ width: 500 }), 100)).toBe(5);
  });

  it('reports the CSS nominal factor when the probe rendered at nominal size', () => {
    const nominal = 96 / 25.4;
    expect(pxPerMm(elementWith({ width: 100 * nominal }), 100)).toBeCloseTo(nominal, 10);
  });

  it('falls back rather than returning zero for an unlaid-out probe', () => {
    // A detached or display:none ancestor reports 0, and a zero factor would make
    // every measured height infinite.
    const fallback = 96 / 25.4;
    expect(pxPerMm(elementWith({ width: 0 }), 100)).toBeCloseTo(fallback, 10);
    expect(pxPerMm(null, 100)).toBeCloseTo(fallback, 10);
  });

  it('falls back for a non-positive probe width', () => {
    const fallback = 96 / 25.4;
    expect(pxPerMm(elementWith({ width: 500 }), 0)).toBeCloseTo(fallback, 10);
    expect(pxPerMm(elementWith({ width: 500 }), -10)).toBeCloseTo(fallback, 10);
  });
});

describe('measureHeightMm', () => {
  it('converts a rendered height into millimetres', () => {
    expect(measureHeightMm(elementWith({ height: 100 }), 5)).toBe(20);
  });

  it('returns zero for a missing element or an unusable factor', () => {
    expect(measureHeightMm(null, 5)).toBe(0);
    expect(measureHeightMm(elementWith({ height: 100 }), 0)).toBe(0);
    expect(measureHeightMm(elementWith({ height: 100 }), -1)).toBe(0);
  });

  it('uses offsetHeight, which no ancestor transform can affect', () => {
    // The structural reason zoom cannot contaminate pagination: layout pixels ignore
    // transforms, unlike getBoundingClientRect.
    const el = elementWith({ height: 200 });
    el.style.transform = 'scale(3)';
    expect(measureHeightMm(el, 10)).toBe(20);
  });
});

describe('Unit conversion round-trips', () => {
  it('mm → px → mm returns the original', () => {
    expect(pxToMm(mmToPx(37.5, 4), 4)).toBeCloseTo(37.5, 10);
  });

  it('pxToMm is safe with a zero factor', () => {
    expect(pxToMm(100, 0)).toBe(0);
  });
});

describe('roundMm stabilises the flow', () => {
  it('rounds to hundredths of a millimetre', () => {
    expect(roundMm(12.3456)).toBe(12.35);
    expect(roundMm(12.344)).toBe(12.34);
  });

  it('collapses sub-micrometre jitter that would re-trigger pagination forever', () => {
    expect(roundMm(20.000001)).toBe(roundMm(20.000002));
  });

  it('keeps a precision a printer could actually reproduce', () => {
    // 0.01 mm is finer than any office printer resolves, so nothing meaningful is lost.
    expect(roundMm(20.01)).not.toBe(roundMm(20.02));
  });
});
