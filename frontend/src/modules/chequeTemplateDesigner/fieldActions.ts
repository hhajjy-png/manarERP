import type { DesignerField } from './designerField.types';
import { clampNumber, getMaxOrigin } from './fieldGeometry';

/**
 * Pure array-level operations on the field collection — duplicate, delete,
 * and layer ordering. Extracted from the Professional module's fieldActions.ts.
 *
 * Only business-specific change: the duplicate id prefix uses a generic
 * "field-" rather than the Professional field's `type`, which no longer exists
 * on the generic model.
 */

export function duplicateField(fields: DesignerField[], fieldId: string): { fields: DesignerField[]; newId: string } {
  const original = fields.find((f) => f.id === fieldId);
  if (!original) return { fields, newId: fieldId };

  const newId = `field-${crypto.randomUUID()}`;
  const maxZ = fields.reduce((max, f) => Math.max(max, f.zIndex), 0);
  const { maxX, maxY } = getMaxOrigin(original);
  const copy: DesignerField = {
    ...original,
    id: newId,
    x: clampNumber(original.x + 2, 0, maxX),
    y: clampNumber(original.y + 2, 0, maxY),
    zIndex: maxZ + 1,
  };

  return { fields: [...fields, copy], newId };
}

export function deleteField(fields: DesignerField[], fieldId: string): DesignerField[] {
  return fields.filter((f) => f.id !== fieldId);
}

function swapZIndex(fields: DesignerField[], aId: string, bId: string): DesignerField[] {
  const a = fields.find((f) => f.id === aId);
  const b = fields.find((f) => f.id === bId);
  if (!a || !b) return fields;
  return fields.map((f) => {
    if (f.id === aId) return { ...f, zIndex: b.zIndex };
    if (f.id === bId) return { ...f, zIndex: a.zIndex };
    return f;
  });
}

export function bringForward(fields: DesignerField[], fieldId: string): DesignerField[] {
  const sorted = [...fields].sort((a, b) => a.zIndex - b.zIndex);
  const index = sorted.findIndex((f) => f.id === fieldId);
  if (index === -1 || index === sorted.length - 1) return fields;
  return swapZIndex(fields, fieldId, sorted[index + 1].id);
}

export function sendBackward(fields: DesignerField[], fieldId: string): DesignerField[] {
  const sorted = [...fields].sort((a, b) => a.zIndex - b.zIndex);
  const index = sorted.findIndex((f) => f.id === fieldId);
  if (index <= 0) return fields;
  return swapZIndex(fields, fieldId, sorted[index - 1].id);
}

export function bringToFront(fields: DesignerField[], fieldId: string): DesignerField[] {
  const maxZ = fields.reduce((max, f) => Math.max(max, f.zIndex), 0);
  return fields.map((f) => (f.id === fieldId ? { ...f, zIndex: maxZ + 1 } : f));
}

export function sendToBack(fields: DesignerField[], fieldId: string): DesignerField[] {
  const minZ = fields.reduce((min, f) => Math.min(min, f.zIndex), 0);
  return fields.map((f) => (f.id === fieldId ? { ...f, zIndex: minZ - 1 } : f));
}
