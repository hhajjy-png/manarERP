/**
 * Electron print geometry options — contract tests (Cheque Printing
 * Deterministic Geometry & Unified Pipeline Pack v1).
 *
 * Locks two things:
 *   1. a cheque print job's explicit physical page reaches `webContents.print`
 *      intact — this is what stops the OS dialog from deciding the geometry;
 *   2. every pre-existing caller (invoices, reports, the calibration test sheet)
 *      that passes nothing or only `landscape` produces byte-identical options to
 *      before the pack.
 */
import { describe, it, expect } from 'vitest';
import { buildPrintOptions, MIN_PAGE_MICRONS } from '../printPageOptions';

describe('buildPrintOptions — backward compatibility', () => {
  it('emits nothing when no options are supplied', () => {
    expect(buildPrintOptions()).toEqual({});
    expect(buildPrintOptions(undefined)).toEqual({});
  });

  it('emits only landscape for the legacy landscape-only caller', () => {
    expect(buildPrintOptions({ landscape: true })).toEqual({ landscape: true });
  });

  it('never invents a pageSize, margin or scale that the caller did not ask for', () => {
    const resolved = buildPrintOptions({ landscape: false });
    expect(resolved.pageSize).toBeUndefined();
    expect(resolved.margins).toBeUndefined();
    expect(resolved.scaleFactor).toBeUndefined();
  });
});

describe('buildPrintOptions — deterministic physical page', () => {
  it('forwards a real-cheque page (178 × 89 mm) verbatim, in microns', () => {
    expect(buildPrintOptions({
      landscape: false,
      pageSize: { width: 178000, height: 89000 },
      marginType: 'none',
      scaleFactor: 100,
    })).toEqual({
      landscape: false,
      pageSize: { width: 178000, height: 89000 },
      margins: { marginType: 'none' },
      scaleFactor: 100,
    });
  });

  it('forwards an A4-landscape page (297 × 210 mm) verbatim', () => {
    const resolved = buildPrintOptions({
      landscape: false,
      pageSize: { width: 297000, height: 210000 },
      marginType: 'none',
      scaleFactor: 100,
    });
    expect(resolved.pageSize).toEqual({ width: 297000, height: 210000 });
    expect(resolved.margins).toEqual({ marginType: 'none' });
    expect(resolved.scaleFactor).toBe(100);
    // Orientation is baked into the dimensions; never also rotated by Chromium.
    expect(resolved.landscape).toBe(false);
  });

  it('accepts a named page size', () => {
    expect(buildPrintOptions({ pageSize: 'A4' }).pageSize).toBe('A4');
  });

  it('rounds fractional microns to integers', () => {
    expect(buildPrintOptions({ pageSize: { width: 178000.4, height: 88999.6 } }).pageSize)
      .toEqual({ width: 178000, height: 89000 });
  });
});

describe('buildPrintOptions — invalid input is dropped, never forwarded', () => {
  it('drops a page below Chromium\'s platform minimum', () => {
    expect(buildPrintOptions({ pageSize: { width: MIN_PAGE_MICRONS - 1, height: 89000 } }).pageSize).toBeUndefined();
  });

  it('drops non-finite or non-positive dimensions', () => {
    for (const bad of [
      { width: Number.NaN, height: 89000 },
      { width: 178000, height: 0 },
      { width: -178000, height: 89000 },
      { width: Number.POSITIVE_INFINITY, height: 89000 },
    ]) {
      expect(buildPrintOptions({ pageSize: bad }).pageSize, JSON.stringify(bad)).toBeUndefined();
    }
  });

  it('drops an unknown margin type and a non-positive scale', () => {
    expect(buildPrintOptions({ marginType: 'weird' as never }).margins).toBeUndefined();
    expect(buildPrintOptions({ scaleFactor: 0 }).scaleFactor).toBeUndefined();
    expect(buildPrintOptions({ scaleFactor: Number.NaN }).scaleFactor).toBeUndefined();
  });

  it('survives a malformed payload without throwing', () => {
    expect(() => buildPrintOptions(null as never)).not.toThrow();
    expect(buildPrintOptions('nonsense' as never)).toEqual({});
  });
});
