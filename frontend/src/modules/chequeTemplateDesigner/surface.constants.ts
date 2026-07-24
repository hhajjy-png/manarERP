/**
 * Design surface specification for the generic Cheque Template Designer.
 *
 * The surface size is NOT hardcoded here (unlike the Professional module's
 * fixed 17.8 × 8.9 cm). The designer takes its surface spec from props, so a
 * host can target any physical medium. `PHYSICAL_CHEQUE_SURFACE_CM` is an
 * example spec only — the physical cheque surface the future "Cheque Template"
 * mode is expected to use — provided for convenience, never assumed.
 */

export interface DesignerSurfaceSpec {
  /** Physical surface width, in centimetres. */
  widthCm: number;
  /** Physical surface height, in centimetres. */
  heightCm: number;
}

/** Example spec: the physical cheque surface (≈178 × 89 mm). Not assumed by the designer. */
export const PHYSICAL_CHEQUE_SURFACE_CM: DesignerSurfaceSpec = { widthCm: 17.8, heightCm: 8.9 };

/** CSS `aspect-ratio` string derived from a surface spec (e.g. "17.8 / 8.9"). */
export function surfaceAspectRatio(spec: DesignerSurfaceSpec): string {
  return `${spec.widthCm} / ${spec.heightCm}`;
}
