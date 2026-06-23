import type { LayoutElementOverride, DocumentLayoutOverrides, AllLayoutOverrides } from './layoutOverrideTypes';
import type { PrintDocumentType } from '../engine/types';

export const DEFAULT_LAYOUT_ELEMENT: LayoutElementOverride = {
  x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1,
  zIndex: 1, opacity: 1, hidden: false, locked: false,
};

export const DEFAULT_ALL_LAYOUTS: AllLayoutOverrides = {
  invoice: {},
  quotation: {},
};

export function clampLayoutElement(el: LayoutElementOverride): LayoutElementOverride {
  return {
    ...el,
    x: Math.max(-400, Math.min(400, el.x)),
    y: Math.max(-600, Math.min(600, el.y)),
    rotation: Math.max(-180, Math.min(180, el.rotation)),
    scaleX: Math.max(0.1, Math.min(5, el.scaleX)),
    scaleY: Math.max(0.1, Math.min(5, el.scaleY)),
    zIndex: Math.max(1, Math.min(20, Math.round(el.zIndex))),
    opacity: Math.max(0.1, Math.min(1, el.opacity)),
  };
}

export function getLayoutElement(
  overrides: DocumentLayoutOverrides,
  id: string,
): LayoutElementOverride {
  return overrides[id] ?? { ...DEFAULT_LAYOUT_ELEMENT };
}

// Generate CSS transform string for an override
export function layoutElementToCSS(id: string, el: LayoutElementOverride): string {
  const transform = `translate(${el.x}px, ${el.y}px) rotate(${el.rotation}deg) scaleX(${el.scaleX}) scaleY(${el.scaleY})`;
  const display = el.hidden ? 'display: none !important;' : '';
  return `[data-designer-id="${id}"] {
  transform: ${transform} !important;
  transform-origin: top left !important;
  opacity: ${el.opacity} !important;
  position: relative !important;
  z-index: ${el.zIndex} !important;
  ${display}
}`;
}

// Build full <style> content for all overrides
export function buildLayoutStyleSheet(overrides: DocumentLayoutOverrides): string {
  const rules: string[] = [];
  for (const [id, el] of Object.entries(overrides)) {
    if (!el) continue;
    // Only emit CSS if something non-default
    const isDefault = el.x === 0 && el.y === 0 && el.rotation === 0 &&
      el.scaleX === 1 && el.scaleY === 1 && el.zIndex === 1 &&
      el.opacity === 1 && !el.hidden;
    if (!isDefault) {
      rules.push(layoutElementToCSS(id, el));
    }
  }
  return rules.join('\n');
}

export function serializeAllLayouts(layouts: AllLayoutOverrides): string {
  return JSON.stringify(layouts);
}

export function parseAllLayouts(value: string | null | undefined): AllLayoutOverrides {
  if (!value) return { invoice: {}, quotation: {} };
  try {
    const parsed = JSON.parse(value) as AllLayoutOverrides;
    return {
      invoice: parsed.invoice ?? {},
      quotation: parsed.quotation ?? {},
    };
  } catch {
    return { invoice: {}, quotation: {} };
  }
}

export function patchDocumentLayout(
  all: AllLayoutOverrides,
  docType: PrintDocumentType,
  id: string,
  patch: Partial<LayoutElementOverride>,
): AllLayoutOverrides {
  const existing = all[docType][id] ?? { ...DEFAULT_LAYOUT_ELEMENT };
  return {
    ...all,
    [docType]: {
      ...all[docType],
      [id]: clampLayoutElement({ ...existing, ...patch }),
    },
  };
}
