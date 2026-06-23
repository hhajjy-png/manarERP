import { describe, it, expect } from 'vitest';
import { computeSmartGuides, mmToPx, pxToMm } from '../../print-templates/utils/designerUtils';

describe('mmToPx / pxToMm', () => {
  it('converts A4 width correctly', () => {
    expect(Math.round(mmToPx(210))).toBe(794);
    expect(Math.round(pxToMm(794))).toBe(210);
  });
  it('round-trips', () => {
    expect(pxToMm(mmToPx(50))).toBeCloseTo(50);
  });
});

describe('computeSmartGuides', () => {
  it('returns no snap when far from any guide', () => {
    const moving = [{ x: 100, y: 100, w: 50, h: 30 }];
    const static_ = [{ x: 500, y: 500, w: 50, h: 30 }];
    const result = computeSmartGuides(moving, static_, 794, 1123, 6);
    expect(result.dx).toBe(0);
    expect(result.dy).toBe(0);
    expect(result.lines).toHaveLength(0);
  });

  it('snaps left edge to static left edge when within threshold', () => {
    const moving = [{ x: 97, y: 200, w: 50, h: 30 }]; // 3px away from x=100
    const static_ = [{ x: 100, y: 50, w: 80, h: 40 }];
    const result = computeSmartGuides(moving, static_, 794, 1123, 6);
    expect(result.dx).toBe(3); // move +3 to align left at x=100
    expect(result.lines.some((l) => l.axis === 'x' && l.position === 100)).toBe(true);
  });

  it('snaps to canvas center', () => {
    const moving = [{ x: 370, y: 100, w: 50, h: 30 }]; // center at 395, canvas center at 397
    const result = computeSmartGuides(moving, [], 794, 1123, 6);
    // canvas center is 794/2=397. moving center is 370+25=395. diff=2, within threshold
    expect(result.dx).toBe(2);
  });
});
