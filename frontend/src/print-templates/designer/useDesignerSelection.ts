import { useState, useCallback } from 'react';
import type { DesignerElement } from './designerTypes';
import { isBrandingElement, isTextElement } from './designerTypes';

export interface DesignerSelectionHandle {
  selectedElement: DesignerElement | null;
  selectElement: (el: DesignerElement) => void;
  clearSelection: () => void;
  isSelected: (id: string) => boolean;
  getPrimarySelection: () => DesignerElement | null;
  isBrandingSelection: () => boolean;
  isTextSelection: () => boolean;
}

export function useDesignerSelection(): DesignerSelectionHandle {
  const [selectedElement, setSelectedElement] = useState<DesignerElement | null>(null);

  const selectElement = useCallback((el: DesignerElement) => setSelectedElement(el), []);
  const clearSelection = useCallback(() => setSelectedElement(null), []);
  const isSelected = useCallback((id: string) => selectedElement?.id === id, [selectedElement]);
  const getPrimarySelection = useCallback(() => selectedElement, [selectedElement]);
  const isBrandingSelection = useCallback(() => isBrandingElement(selectedElement), [selectedElement]);
  const isTextSelection = useCallback(() => isTextElement(selectedElement), [selectedElement]);

  return {
    selectedElement,
    selectElement,
    clearSelection,
    isSelected,
    getPrimarySelection,
    isBrandingSelection,
    isTextSelection,
  };
}
