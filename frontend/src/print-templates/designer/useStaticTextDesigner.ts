import { useState, useCallback, useEffect } from 'react';
import { api } from '../../api/client';
import type { StaticTextKey, StaticTextOverrides } from './staticTextTypes';
import { validateStaticText, serializeStaticTextOverrides, parseStaticTextOverrides } from './staticTextUtils';

export interface StaticTextDesignerHandle {
  overrides: StaticTextOverrides;
  editingKey: StaticTextKey | null;
  draftValue: string;
  draftError: string | null;
  saving: boolean;
  saveError: string | undefined;
  startEdit: (key: StaticTextKey, currentValue: string) => void;
  updateDraft: (value: string) => void;
  commitEdit: () => void;
  cancelEdit: () => void;
  save: () => Promise<void>;
  reset: () => void;
}

export interface StaticTextDesignerConfig {
  initialOverrides: StaticTextOverrides | undefined;
  onSaved?: (overrides: StaticTextOverrides) => void;
}

export function useStaticTextDesigner({
  initialOverrides,
  onSaved,
}: StaticTextDesignerConfig): StaticTextDesignerHandle {
  const [overrides, setOverrides] = useState<StaticTextOverrides>(() =>
    initialOverrides ? parseStaticTextOverrides(serializeStaticTextOverrides(initialOverrides)) : {},
  );
  const [savedJson, setSavedJson] = useState(() =>
    serializeStaticTextOverrides(initialOverrides ?? {}),
  );
  const [editingKey, setEditingKey] = useState<StaticTextKey | null>(null);
  const [draftValue, setDraftValue] = useState('');
  const [draftError, setDraftError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>(undefined);
  const [initializedFromServer, setInitializedFromServer] = useState(initialOverrides !== undefined);

  // Sync once when branding data arrives from async API load (initialOverrides starts undefined)
  useEffect(() => {
    if (!initializedFromServer && initialOverrides !== undefined) {
      setOverrides(parseStaticTextOverrides(serializeStaticTextOverrides(initialOverrides)));
      setSavedJson(serializeStaticTextOverrides(initialOverrides));
      setInitializedFromServer(true);
    }
  }, [initialOverrides, initializedFromServer]);

  const startEdit = useCallback((key: StaticTextKey, currentValue: string) => {
    setEditingKey(key);
    setDraftValue(currentValue);
    setDraftError(null);
  }, []);

  const updateDraft = useCallback((value: string) => {
    setDraftValue(value);
    setDraftError(null);
  }, []);

  const commitEdit = useCallback(() => {
    if (!editingKey) return;
    const error = validateStaticText(editingKey, draftValue);
    if (error) { setDraftError(error); return; }
    setOverrides((prev) => ({ ...prev, [editingKey]: draftValue.trim() }));
    setEditingKey(null);
    setDraftValue('');
    setDraftError(null);
  }, [editingKey, draftValue]);

  const cancelEdit = useCallback(() => {
    setEditingKey(null);
    setDraftValue('');
    setDraftError(null);
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    setSaveError(undefined);
    try {
      const value = serializeStaticTextOverrides(overrides);
      await api.put('/settings', {
        settings: [{ key: 'print.staticTextOverrides', value, group: 'print' }],
      });
      setSavedJson(value);
      onSaved?.(overrides);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'فشل الحفظ');
    } finally {
      setSaving(false);
    }
  }, [overrides, onSaved]);

  const reset = useCallback(() => {
    const initial = initialOverrides ? parseStaticTextOverrides(serializeStaticTextOverrides(initialOverrides)) : {};
    setOverrides(initial);
    setEditingKey(null);
    setDraftValue('');
    setDraftError(null);
    setSavedJson(serializeStaticTextOverrides(initialOverrides ?? {}));
  }, [initialOverrides]);

  const isDirty = serializeStaticTextOverrides(overrides) !== savedJson;

  return {
    overrides,
    editingKey,
    draftValue,
    draftError,
    saving,
    saveError: saveError ?? (isDirty ? undefined : undefined),
    startEdit,
    updateDraft,
    commitEdit,
    cancelEdit,
    save,
    reset,
  };
}
