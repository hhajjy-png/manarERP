import { useCallback, useState } from 'react';
import type { DesignerField } from './designerField.types';

/**
 * History Engine — the editor's single undo/redo store. Extracted from the
 * Professional module's useEditorHistory, generalised to DesignerField.
 *
 * Every engine (Drag, Resize, Rotation, Keyboard, and the Properties Panel's
 * edits, duplicate/delete, layer ordering) writes through this one hook, so
 * there is exactly one `fields` state and one history stack in the whole
 * designer — nothing duplicates it.
 *
 * Continuous gestures call `beginChange()` once at gesture start, then
 * `updateField(...)` repeatedly — one undo step per gesture, not per
 * pointermove. Discrete edits call `commit(...)` once instead.
 */
export interface DesignerHistory {
  fields: DesignerField[];
  /** Opens one undo step: snapshots the current fields before a gesture or an edit. */
  beginChange: () => void;
  /** Applies a live patch to one field without pushing history — call after `beginChange`. */
  updateField: (fieldId: string, patch: Partial<DesignerField>) => void;
  /** Snapshots the current fields, then applies a whole-collection update, in one undo step. */
  commit: (updater: (prev: DesignerField[]) => DesignerField[]) => void;
  /** Replaces the fields wholesale and clears both history stacks — for loading a different template, not an edit. */
  reset: (nextFields: DesignerField[]) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useDesignerHistory(initialFields: DesignerField[]): DesignerHistory {
  const [fields, setFields] = useState<DesignerField[]>(initialFields);
  const [past, setPast] = useState<DesignerField[][]>([]);
  const [future, setFuture] = useState<DesignerField[][]>([]);

  const beginChange = useCallback(() => {
    setPast((p) => [...p, fields]);
    setFuture([]);
  }, [fields]);

  const updateField = useCallback((fieldId: string, patch: Partial<DesignerField>) => {
    setFields((prev) => prev.map((f) => (f.id === fieldId ? { ...f, ...patch } : f)));
  }, []);

  const commit = useCallback((updater: (prev: DesignerField[]) => DesignerField[]) => {
    setPast((p) => [...p, fields]);
    setFuture([]);
    setFields(updater);
  }, [fields]);

  const undo = useCallback(() => {
    setPast((p) => {
      if (p.length === 0) return p;
      const previous = p[p.length - 1];
      setFuture((f) => [fields, ...f]);
      setFields(previous);
      return p.slice(0, -1);
    });
  }, [fields]);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[0];
      setPast((p) => [...p, fields]);
      setFields(next);
      return f.slice(1);
    });
  }, [fields]);

  const reset = useCallback((nextFields: DesignerField[]) => {
    setPast([]);
    setFuture([]);
    setFields(nextFields);
  }, []);

  return { fields, beginChange, updateField, commit, reset, undo, redo, canUndo: past.length > 0, canRedo: future.length > 0 };
}
