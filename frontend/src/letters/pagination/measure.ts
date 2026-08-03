/**
 * Letter Engine — physical measurement.
 *
 * Converts what the browser rendered into millimetres, which is the only unit the
 * paginator and the Geometry Registry speak (INV-1).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE FACTOR IS DERIVED AT RUNTIME, NEVER ASSUMED.
 * ══════════════════════════════════════════════════════════════════════════
 * The obvious shortcut is `96 / 25.4` — the CSS specification's nominal pixels per
 * millimetre. It is wrong often enough to matter: browser zoom, OS display scaling and
 * a transformed ancestor all change what a rendered `mm` actually measures. A
 * pagination decision made on a wrong factor puts the page break in the wrong place,
 * silently.
 *
 * So the caller renders a probe of a KNOWN millimetre width and this module measures
 * it. The factor is whatever the browser actually did.
 *
 * ── NO DOM IS CONSTRUCTED HERE ───────────────────────────────────────────
 * Every function takes an element the caller already rendered. That keeps this module
 * inside the engine's boundary — the foundation may read the DOM, but it does not
 * build one — and it keeps React the only thing creating nodes.
 *
 * ── MEASUREMENTS ARE TAKEN UNSCALED ──────────────────────────────────────
 * `getBoundingClientRect` reports post-transform pixels, so a probe inside a zoomed
 * container would yield a factor that already includes the zoom, and the two would
 * cancel — but only if every measurement shared exactly the same ancestor transform.
 * Rather than rely on that, the caller renders the measurement layer OUTSIDE the zoom
 * wrapper. `offsetHeight`/`offsetWidth` are used below because they are layout pixels
 * and ignore transforms entirely, which makes the guarantee structural.
 */

/** CSS's nominal pixels per millimetre. Used ONLY as a last-resort fallback. */
const NOMINAL_PX_PER_MM = 96 / 25.4;

/**
 * Pixels per millimetre, measured from a probe of known width.
 *
 * @param probe        an element whose CSS width is exactly `probeWidthMm`
 * @param probeWidthMm the width the probe was given, in millimetres
 *
 * Falls back to the nominal factor when the probe has no layout — a detached or
 * `display: none` ancestor reports zero, and a zero factor would make every height
 * infinite.
 */
export function pxPerMm(probe: HTMLElement | null, probeWidthMm: number): number {
  if (!probe || probeWidthMm <= 0) return NOMINAL_PX_PER_MM;
  const width = probe.offsetWidth;
  if (!width || !Number.isFinite(width)) return NOMINAL_PX_PER_MM;
  return width / probeWidthMm;
}

/**
 * An element's rendered height in millimetres.
 *
 * `offsetHeight` rather than `getBoundingClientRect().height`: the former is layout
 * pixels and ignores any ancestor `transform`, so a measurement cannot be
 * contaminated by a zoom applied somewhere above it.
 */
export function measureHeightMm(element: HTMLElement | null, factor: number): number {
  if (!element || factor <= 0) return 0;
  return element.offsetHeight / factor;
}

/**
 * Millimetres per typographic point.
 *
 * A unit conversion, not a page dimension: a point is defined as 1/72 inch, and an
 * inch as 25.4 mm. Font sizes arrive in points from the typography presets while every
 * geometric comparison happens in millimetres, so one of the two has to convert.
 */
const MM_PER_POINT = 25.4 / 72;

/** Convert a typographic point size to millimetres. */
export function pointsToMm(points: number): number {
  return points * MM_PER_POINT;
}

/** Convert millimetres to layout pixels — for sizing something the browser must draw. */
export function mmToPx(millimetres: number, factor: number): number {
  return millimetres * factor;
}

/** Convert layout pixels to millimetres. */
export function pxToMm(pixels: number, factor: number): number {
  return factor > 0 ? pixels / factor : 0;
}

/**
 * Round a millimetre measurement to a stable precision.
 *
 * Sub-micrometre jitter in a measured height is meaningless on paper but is enough to
 * make two consecutive measurements differ, which would re-trigger pagination forever.
 * Rounding to hundredths of a millimetre keeps the flow stable without losing anything
 * a printer could reproduce.
 */
export function roundMm(millimetres: number): number {
  return Math.round(millimetres * 100) / 100;
}
