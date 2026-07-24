import { useCallback, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import type { DesignerField } from './designerField.types';
import { computeDragSnap } from './alignmentGuides';
import type { AlignmentGuide } from './alignmentGuides';
import { clampNumber, getMaxOrigin } from './fieldGeometry';
import type { FieldMutationApi } from './fieldGeometry';

/**
 * Drag Engine — moves the selected field within the surface boundary, with
 * smart-guide snapping. Pointer Events + native pointer capture only, no
 * library. Extracted from the Professional module's useFieldDrag.
 *
 * The surface's own bounding box (read through `boundaryRef`) is the sole
 * coordinate reference and drag boundary. This hook holds no field data of
 * its own: it reads a field's starting x/y at pointer-down and writes the
 * next x/y through the shared `mutation` API.
 */

type DragSession = {
  fieldId: string;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  width: number;
  height: number;
  maxX: number;
  maxY: number;
};

type UseDesignerDragOptions = {
  /** The element whose bounding box is the drag boundary — the surface itself. */
  boundaryRef: RefObject<HTMLElement>;
  fields: DesignerField[];
  isSelected: (id: string) => boolean;
  mutation: FieldMutationApi;
  onGuidesChange: (guides: AlignmentGuide[]) => void;
};

export interface DesignerDragEngine {
  handlePointerDown: (e: ReactPointerEvent<HTMLElement>, field: DesignerField) => void;
  handlePointerMove: (e: ReactPointerEvent<HTMLElement>) => void;
  handlePointerUp: (e: ReactPointerEvent<HTMLElement>) => void;
  handlePointerCancel: (e: ReactPointerEvent<HTMLElement>) => void;
}

export function useDesignerDrag({ boundaryRef, fields, isSelected, mutation, onGuidesChange }: UseDesignerDragOptions): DesignerDragEngine {
  const sessionRef = useRef<DragSession | null>(null);

  const handlePointerDown = useCallback((e: ReactPointerEvent<HTMLElement>, field: DesignerField) => {
    if (!isSelected(field.id)) return;
    if (!boundaryRef.current) return;

    const { maxX, maxY } = getMaxOrigin(field);
    sessionRef.current = {
      fieldId: field.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: field.x,
      startY: field.y,
      width: field.width,
      height: field.height,
      maxX,
      maxY,
    };
    mutation.beginChange();
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [boundaryRef, isSelected, mutation]);

  const handlePointerMove = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    const session = sessionRef.current;
    const boundary = boundaryRef.current;
    if (!session || !boundary) return;

    const rect = boundary.getBoundingClientRect();
    const deltaX = ((e.clientX - session.startClientX) / rect.width) * 100;
    const deltaY = ((e.clientY - session.startClientY) / rect.height) * 100;

    const rawX = clampNumber(session.startX + deltaX, 0, session.maxX);
    const rawY = clampNumber(session.startY + deltaY, 0, session.maxY);

    const others = fields
      .filter((f) => f.id !== session.fieldId && f.visible)
      .map((f) => ({ x: f.x, y: f.y, width: f.width, height: f.height }));

    const snapped = computeDragSnap({ x: rawX, y: rawY, width: session.width, height: session.height }, others);
    const x = clampNumber(snapped.x, 0, session.maxX);
    const y = clampNumber(snapped.y, 0, session.maxY);

    onGuidesChange(snapped.guides);
    mutation.updateField(session.fieldId, { x, y });
  }, [boundaryRef, fields, mutation, onGuidesChange]);

  const endSession = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    if (!sessionRef.current) return;
    sessionRef.current = null;
    onGuidesChange([]);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, [onGuidesChange]);

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp: endSession,
    handlePointerCancel: endSession,
  };
}
