import { useCallback, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import type { DesignerField } from './designerField.types';
import type { FieldMutationApi } from './fieldGeometry';

/**
 * Rotation Engine — rotates the selected field around its own center via a
 * single rotation handle. Pointer Events + native pointer capture only.
 * Extracted from the Professional module's useFieldRotation.
 */

type RotationSession = {
  fieldId: string;
  centerClientX: number;
  centerClientY: number;
  startPointerAngle: number;
  startRotation: number;
};

type UseDesignerRotationOptions = {
  boundaryRef: RefObject<HTMLElement>;
  mutation: FieldMutationApi;
};

export interface DesignerRotationEngine {
  handlePointerDown: (e: ReactPointerEvent<HTMLElement>, field: DesignerField) => void;
  handlePointerMove: (e: ReactPointerEvent<HTMLElement>) => void;
  handlePointerUp: (e: ReactPointerEvent<HTMLElement>) => void;
  handlePointerCancel: (e: ReactPointerEvent<HTMLElement>) => void;
}

function angleOfDegrees(dx: number, dy: number): number {
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

function normalizeDegrees(deg: number): number {
  const wrapped = deg % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

export function useDesignerRotation({ boundaryRef, mutation }: UseDesignerRotationOptions): DesignerRotationEngine {
  const sessionRef = useRef<RotationSession | null>(null);

  const handlePointerDown = useCallback((e: ReactPointerEvent<HTMLElement>, field: DesignerField) => {
    e.stopPropagation();
    const boundary = boundaryRef.current;
    if (!boundary) return;

    const rect = boundary.getBoundingClientRect();
    const centerClientX = rect.left + ((field.x + field.width / 2) / 100) * rect.width;
    const centerClientY = rect.top + ((field.y + field.height / 2) / 100) * rect.height;

    sessionRef.current = {
      fieldId: field.id,
      centerClientX,
      centerClientY,
      startPointerAngle: angleOfDegrees(e.clientX - centerClientX, e.clientY - centerClientY),
      startRotation: field.rotation,
    };
    mutation.beginChange();
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [boundaryRef, mutation]);

  const handlePointerMove = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    const session = sessionRef.current;
    if (!session) return;

    const currentAngle = angleOfDegrees(e.clientX - session.centerClientX, e.clientY - session.centerClientY);
    const delta = currentAngle - session.startPointerAngle;
    mutation.updateField(session.fieldId, { rotation: normalizeDegrees(session.startRotation + delta) });
  }, [mutation]);

  const endSession = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    if (!sessionRef.current) return;
    sessionRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, []);

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp: endSession,
    handlePointerCancel: endSession,
  };
}
