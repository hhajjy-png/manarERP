import { useCallback, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import type { DesignerField } from './designerField.types';
import type { AlignmentGuide } from './alignmentGuides';
import { snapValue } from './alignmentGuides';
import { MIN_FIELD_SIZE_PERCENT } from './designerEngine.constants';
import { clampNumber } from './fieldGeometry';
import type { FieldMutationApi } from './fieldGeometry';

/**
 * Resize Engine — resizes the selected field from one of its four corner
 * handles, anchored at the opposite corner, clamped to the surface, with the
 * same smart-guide snapping Drag uses. Extracted from the Professional
 * module's useFieldResize.
 *
 * v1 scope (inherited): resize axes are the surface's own (global) axes, not
 * the field's rotated local axes — resizing a rotated field still works, but
 * the handle drags along the surface. Full rotated-resize math is future work.
 */

export type ResizeCorner = 'tl' | 'tr' | 'bl' | 'br';

type ResizeSession = {
  fieldId: string;
  corner: ResizeCorner;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
};

type UseDesignerResizeOptions = {
  boundaryRef: RefObject<HTMLElement>;
  fields: DesignerField[];
  mutation: FieldMutationApi;
  onGuidesChange: (guides: AlignmentGuide[]) => void;
};

export interface DesignerResizeEngine {
  handlePointerDown: (e: ReactPointerEvent<HTMLElement>, field: DesignerField, corner: ResizeCorner) => void;
  handlePointerMove: (e: ReactPointerEvent<HTMLElement>) => void;
  handlePointerUp: (e: ReactPointerEvent<HTMLElement>) => void;
  handlePointerCancel: (e: ReactPointerEvent<HTMLElement>) => void;
}

export function useDesignerResize({ boundaryRef, fields, mutation, onGuidesChange }: UseDesignerResizeOptions): DesignerResizeEngine {
  const sessionRef = useRef<ResizeSession | null>(null);

  const handlePointerDown = useCallback((e: ReactPointerEvent<HTMLElement>, field: DesignerField, corner: ResizeCorner) => {
    e.stopPropagation();
    if (!boundaryRef.current) return;

    sessionRef.current = {
      fieldId: field.id,
      corner,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: field.x,
      startY: field.y,
      startWidth: field.width,
      startHeight: field.height,
    };
    mutation.beginChange();
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [boundaryRef, mutation]);

  const handlePointerMove = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    const session = sessionRef.current;
    const boundary = boundaryRef.current;
    if (!session || !boundary) return;

    const rect = boundary.getBoundingClientRect();
    const deltaX = ((e.clientX - session.startClientX) / rect.width) * 100;
    const deltaY = ((e.clientY - session.startClientY) / rect.height) * 100;

    const others = fields.filter((f) => f.id !== session.fieldId && f.visible);
    const candidatesX = [0, 50, 100, ...others.flatMap((o) => [o.x, o.x + o.width / 2, o.x + o.width])];
    const candidatesY = [0, 50, 100, ...others.flatMap((o) => [o.y, o.y + o.height / 2, o.y + o.height])];

    let x = session.startX;
    let y = session.startY;
    let width = session.startWidth;
    let height = session.startHeight;
    const guides: AlignmentGuide[] = [];

    if (session.corner === 'br' || session.corner === 'tr') {
      const rawRight = clampNumber(session.startX + session.startWidth + deltaX, session.startX + MIN_FIELD_SIZE_PERCENT, 100);
      const { value: right, guide } = snapValue(rawRight, candidatesX);
      width = right - x;
      if (guide !== null) guides.push({ orientation: 'vertical', position: guide });
    }
    if (session.corner === 'bl' || session.corner === 'tl') {
      const rawLeft = clampNumber(session.startX + deltaX, 0, session.startX + session.startWidth - MIN_FIELD_SIZE_PERCENT);
      const { value: left, guide } = snapValue(rawLeft, candidatesX);
      x = left;
      width = session.startX + session.startWidth - left;
      if (guide !== null) guides.push({ orientation: 'vertical', position: guide });
    }
    if (session.corner === 'bl' || session.corner === 'br') {
      const rawBottom = clampNumber(session.startY + session.startHeight + deltaY, session.startY + MIN_FIELD_SIZE_PERCENT, 100);
      const { value: bottom, guide } = snapValue(rawBottom, candidatesY);
      height = bottom - y;
      if (guide !== null) guides.push({ orientation: 'horizontal', position: guide });
    }
    if (session.corner === 'tl' || session.corner === 'tr') {
      const rawTop = clampNumber(session.startY + deltaY, 0, session.startY + session.startHeight - MIN_FIELD_SIZE_PERCENT);
      const { value: top, guide } = snapValue(rawTop, candidatesY);
      y = top;
      height = session.startY + session.startHeight - top;
      if (guide !== null) guides.push({ orientation: 'horizontal', position: guide });
    }

    onGuidesChange(guides);
    mutation.updateField(session.fieldId, { x, y, width, height });
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
