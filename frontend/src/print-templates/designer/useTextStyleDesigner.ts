import { useState, useCallback } from 'react';
import { api } from '../../api/client';
import type { PrintDocumentType } from '../engine/types';
import type {
  PrintTextStyleSettings,
  InvoiceTextAreaKey,
  QuotationTextAreaKey,
  TextElementStyle,
  TableHeaderStyle,
  TableBorderStyle,
} from '../engine/textStyleTypes';
import {
  parseTextStyleSettings,
  serializeTextStyleSettings,
  DEFAULT_TEXT_STYLE_SETTINGS,
} from '../utils/textStyleOverrides';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TextAreaKey = InvoiceTextAreaKey | QuotationTextAreaKey;
export type AnyAreaStyle = TextElementStyle | TableHeaderStyle | TableBorderStyle;

export interface TextStyleDesignerHandle {
  /** Current (possibly dirty) text style settings */
  settings: PrintTextStyleSettings;

  /** Which area is currently selected (e.g. "invoice.title"), or null */
  selectedArea: string | null;
  setSelectedArea: (area: string | null) => void;

  /**
   * Update a style property for a specific document area.
   * Merges the patch on top of the existing area style.
   */
  updateArea: (
    docType: PrintDocumentType,
    areaKey: TextAreaKey,
    patch: Partial<AnyAreaStyle>,
  ) => void;

  /** Reset a single area back to {} (template default) */
  resetArea: (docType: PrintDocumentType, areaKey: TextAreaKey) => void;

  /** Reset all areas for a document type back to {} */
  resetDocType: (docType: PrintDocumentType) => void;

  /** Whether the settings differ from what was last saved/loaded */
  isDirty: boolean;

  saving: boolean;
  saveError: string | undefined;
  save: () => Promise<void>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface TextStyleDesignerConfig {
  /** Initial settings loaded from server (undefined → safe defaults) */
  initialSettings: PrintTextStyleSettings | undefined;
  onSaved?: (settings: PrintTextStyleSettings) => void;
}

export function useTextStyleDesigner({
  initialSettings,
  onSaved,
}: TextStyleDesignerConfig): TextStyleDesignerHandle {
  const effective = initialSettings ?? DEFAULT_TEXT_STYLE_SETTINGS;

  const [settings, setSettings] = useState<PrintTextStyleSettings>(() =>
    parseTextStyleSettings(serializeTextStyleSettings(effective)),
  );
  const [savedJson, setSavedJson] = useState(() => serializeTextStyleSettings(effective));
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>(undefined);

  const isDirty = serializeTextStyleSettings(settings) !== savedJson;

  const updateArea = useCallback(
    (docType: PrintDocumentType, areaKey: TextAreaKey, patch: Partial<AnyAreaStyle>) => {
      setSettings((prev) => {
        const docAreas = prev[docType] as Record<string, AnyAreaStyle>;
        const existing = (docAreas[areaKey] ?? {}) as AnyAreaStyle;
        return {
          ...prev,
          [docType]: {
            ...docAreas,
            [areaKey]: { ...existing, ...patch },
          },
        };
      });
    },
    [],
  );

  const resetArea = useCallback((docType: PrintDocumentType, areaKey: TextAreaKey) => {
    setSettings((prev) => {
      const docAreas = { ...(prev[docType] as Record<string, AnyAreaStyle>) };
      delete docAreas[areaKey];
      return { ...prev, [docType]: docAreas };
    });
  }, []);

  const resetDocType = useCallback((docType: PrintDocumentType) => {
    setSettings((prev) => ({ ...prev, [docType]: {} }));
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    setSaveError(undefined);
    try {
      const value = serializeTextStyleSettings(settings);
      await api.put('/settings', {
        settings: [{
          key: 'print.textStyleOverrides',
          value,
          group: 'print',
        }],
      });
      setSavedJson(value);
      onSaved?.(settings);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'فشل الحفظ');
    } finally {
      setSaving(false);
    }
  }, [settings, onSaved]);

  return {
    settings,
    selectedArea,
    setSelectedArea,
    updateArea,
    resetArea,
    resetDocType,
    isDirty,
    saving,
    saveError,
    save,
  };
}
