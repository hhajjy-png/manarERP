import type { DesignerField } from './designerField.types';

/**
 * Pure geometry helpers + the mutation contract every interactive engine
 * (Drag, Resize, Rotation, Keyboard) writes through. Extracted from the
 * Professional module's fieldGeometry.ts, generalised to DesignerField.
 */

/** Shared by every interactive engine so none reimplements it. */
export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(max, min));
}

/** Furthest x/y (percent) a field's own box may reach without leaving the surface. */
export function getMaxOrigin(field: Pick<DesignerField, 'width' | 'height'>): { maxX: number; maxY: number } {
  return { maxX: 100 - field.width, maxY: 100 - field.height };
}

/**
 * The mutation contract every interactive engine writes through.
 * `beginChange` opens one undo step; `updateField` applies a live patch inside
 * that step without pushing more history — see useDesignerHistory.ts.
 */
export interface FieldMutationApi {
  beginChange: () => void;
  updateField: (fieldId: string, patch: Partial<DesignerField>) => void;
}
