/**
 * Tuning constants shared by the designer engines (Drag, Resize, Rotation,
 * Keyboard, Alignment). Kept separate from surface.constants.ts, which is
 * strictly the surface's physical dimensions.
 *
 * Extracted verbatim from the Professional module's editorEngine.constants.ts
 * so the generic engines behave identically.
 */

/** Minimum field width/height, as a percentage of the design surface. */
export const MIN_FIELD_SIZE_PERCENT = 3;

/** Arrow-key nudge, as a percentage of the design surface. */
export const KEYBOARD_STEP_SMALL_PERCENT = 0.3;

/** Shift+Arrow nudge, as a percentage of the design surface. */
export const KEYBOARD_STEP_LARGE_PERCENT = 2;

/** Distance (in percent) within which a dragged/resized edge snaps to a guide. */
export const ALIGNMENT_SNAP_THRESHOLD_PERCENT = 1.2;
