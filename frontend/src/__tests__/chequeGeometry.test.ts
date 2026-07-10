import { describe, it, expect } from 'vitest';
import {
  DEFAULT_GEOMETRY,
  overlayHeightMm,
  mmPerLeftPct,
  mmPerTopPct,
  fieldMm,
  mmToPercentCorrection,
  applyCorrection,
  computeConfidence,
  clamp,
  LEFT_MAX,
  TOP_MAX,
} from '../utils/chequeGeometry';
import { cloneDefaultTemplate } from '../utils/chequeTemplate';

describe('chequeGeometry — geometry math', () => {
  const g = { ...DEFAULT_GEOMETRY, pageWidthMm: 277 }; // as if 10 mm margins each side

  it('overlay height = pageWidth × 272/700', () => {
    expect(overlayHeightMm(g)).toBeCloseTo((277 * 272) / 700, 4); // ≈ 107.63
  });

  it('X and Y have DIFFERENT mm-per-percent factors', () => {
    expect(mmPerLeftPct(g)).toBeCloseTo(2.77, 4);
    expect(mmPerTopPct(g)).toBeCloseTo(overlayHeightMm(g) / 100, 4);
    expect(mmPerLeftPct(g)).not.toBeCloseTo(mmPerTopPct(g), 2);
  });

  it('fieldMm includes the page offset', () => {
    const cfg = { ...cloneDefaultTemplate().beneficiary, left: 0, top: 0 };
    const pos = fieldMm(cfg, g);
    expect(pos.xMm).toBeCloseTo(g.offsetXMm, 4);
    expect(pos.yMm).toBeCloseTo(g.offsetYMm, 4);
  });
});

describe('chequeGeometry — mm → % correction', () => {
  const g = { ...DEFAULT_GEOMETRY, pageWidthMm: 277 };
  const cfg = { ...cloneDefaultTemplate().beneficiary, left: 34.5, top: 29.8 };

  it('printed too far right/down → negative deltas that move it back', () => {
    const r = mmToPercentCorrection(cfg, 5, 3, g);
    expect(r.dLeftPct).toBeCloseTo(-(5 / 277) * 100, 3); // ≈ -1.81
    expect(r.dTopPct).toBeCloseTo(-(3 / overlayHeightMm(g)) * 100, 3); // ≈ -2.79
    expect(r.newLeft).toBeLessThan(cfg.left);
    expect(r.newTop).toBeLessThan(cfg.top);
    expect(r.clamped).toBe(false);
  });

  it('printed too far left/up (negative input) → positive correction', () => {
    const r = mmToPercentCorrection(cfg, -5, -3, g);
    expect(r.newLeft).toBeGreaterThan(cfg.left);
    expect(r.newTop).toBeGreaterThan(cfg.top);
  });

  it('clamps out-of-range results and flags clamped', () => {
    const near = { ...cfg, left: LEFT_MAX - 0.2, top: TOP_MAX - 0.2 };
    const r = mmToPercentCorrection(near, -500, -500, g); // huge negative → pushes past max
    expect(r.newLeft).toBe(LEFT_MAX);
    expect(r.newTop).toBe(TOP_MAX);
    expect(r.clamped).toBe(true);
  });

  it('applyCorrection changes only left/top of the target field, immutably', () => {
    const tpl = cloneDefaultTemplate();
    const r = mmToPercentCorrection(tpl.beneficiary, 5, 3, g);
    const next = applyCorrection(tpl, 'beneficiary', r);
    expect(next).not.toBe(tpl);
    expect(next.beneficiary.left).toBe(r.newLeft);
    expect(next.beneficiary.top).toBe(r.newTop);
    // other fields untouched
    expect(next.date).toEqual(tpl.date);
    // typography untouched
    expect(next.beneficiary.fontSize).toBe(tpl.beneficiary.fontSize);
  });
});

describe('chequeGeometry — confidence', () => {
  const base = { previewed: true, maxRemainingMm: 0, clamped: false, savedAsVersion: false };

  it('nothing measured yet → "needs adjustment" (no claim either way)', () => {
    expect(computeConfidence({ ...base, previewed: false }).level).toBe('adjust');
  });
  it('measured 0 mm → excellent (a real measurement, not an empty form)', () => {
    expect(computeConfidence(base).level).toBe('excellent');
  });
  it('≤0.5 mm → excellent', () => {
    expect(computeConfidence({ ...base, maxRemainingMm: 0.4 }).level).toBe('excellent');
  });
  it('≤2 mm → good', () => {
    expect(computeConfidence({ ...base, maxRemainingMm: 1.5 }).level).toBe('good');
  });
  it('>2 mm → needs adjustment', () => {
    expect(computeConfidence({ ...base, maxRemainingMm: 4 }).level).toBe('adjust');
  });
  it('a clamped correction is never better than "needs adjustment", however small', () => {
    expect(computeConfidence({ ...base, maxRemainingMm: 0.1, clamped: true }).level).toBe('adjust');
  });
  it('saving as a version is surfaced in the hint without inflating the level', () => {
    const saved = computeConfidence({ ...base, maxRemainingMm: 4, savedAsVersion: true });
    expect(saved.level).toBe('adjust');
    expect(saved.hint).toContain('نسخة جديدة');
  });

  // ── Rollback guard: confidence must not depend on a printed grid/ruler again.
  it('claims no printer-scale accuracy — no scale-verification input exists', () => {
    expect(Object.keys(base)).not.toContain('scaleVerified');
    for (const level of [base, { ...base, maxRemainingMm: 4 }]) {
      expect(computeConfidence(level).hint).not.toMatch(/شبكة|مقياس الطباعة|100 مم/);
    }
  });
});

describe('chequeGeometry — clamp', () => {
  it('bounds values', () => {
    expect(clamp(-5, 0, 90)).toBe(0);
    expect(clamp(95, 0, 90)).toBe(90);
    expect(clamp(45, 0, 90)).toBe(45);
  });
});
