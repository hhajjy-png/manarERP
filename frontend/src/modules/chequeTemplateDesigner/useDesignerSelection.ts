import { useCallback, useState } from 'react';

/**
 * Selection Engine — generic, DOM-independent single-selection store keyed by
 * stable field id. Extracted from the Professional module's useFieldSelection.
 *
 * Every other engine keys off the same id: Drag reads `selectedFieldId`,
 * Keyboard reads/writes through `selectField`, the Properties Panel reads
 * `selectedFieldId` — none keep their own selection state.
 */
export interface DesignerSelectionEngine {
  selectedFieldId: string | null;
  isSelected: (id: string) => boolean;
  selectField: (id: string) => void;
  clearSelection: () => void;
}

export function useDesignerSelection(): DesignerSelectionEngine {
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);

  const selectField = useCallback((id: string) => setSelectedFieldId(id), []);
  const clearSelection = useCallback(() => setSelectedFieldId(null), []);
  const isSelected = useCallback((id: string) => id === selectedFieldId, [selectedFieldId]);

  return { selectedFieldId, isSelected, selectField, clearSelection };
}
