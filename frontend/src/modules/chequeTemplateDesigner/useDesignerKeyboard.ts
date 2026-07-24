import { useEffect } from 'react';
import type { DesignerField } from './designerField.types';
import { KEYBOARD_STEP_LARGE_PERCENT, KEYBOARD_STEP_SMALL_PERCENT } from './designerEngine.constants';
import { clampNumber, getMaxOrigin } from './fieldGeometry';
import type { FieldMutationApi } from './fieldGeometry';

/**
 * Keyboard Engine — arrow keys nudge the selected field; Shift+Arrow nudges
 * further. Skips fields when focus is inside an editable control so typing
 * there doesn't also move the field. Each keypress is its own undo step.
 * Extracted from the Professional module's useFieldKeyboard.
 */

type UseDesignerKeyboardOptions = {
  selectedField: DesignerField | null;
  mutation: FieldMutationApi;
};

const ARROW_DELTAS: Record<string, { dx: number; dy: number }> = {
  ArrowUp: { dx: 0, dy: -1 },
  ArrowDown: { dx: 0, dy: 1 },
  ArrowLeft: { dx: -1, dy: 0 },
  ArrowRight: { dx: 1, dy: 0 },
};

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

export function useDesignerKeyboard({ selectedField, mutation }: UseDesignerKeyboardOptions): void {
  useEffect(() => {
    if (!selectedField) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (isEditableTarget(e.target)) return;
      const delta = ARROW_DELTAS[e.key];
      if (!delta || !selectedField) return;

      e.preventDefault();
      const step = e.shiftKey ? KEYBOARD_STEP_LARGE_PERCENT : KEYBOARD_STEP_SMALL_PERCENT;
      const { maxX, maxY } = getMaxOrigin(selectedField);

      mutation.beginChange();
      mutation.updateField(selectedField.id, {
        x: clampNumber(selectedField.x + delta.dx * step, 0, maxX),
        y: clampNumber(selectedField.y + delta.dy * step, 0, maxY),
      });
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedField, mutation]);
}
