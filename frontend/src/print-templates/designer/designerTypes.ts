// ─── Universal designer element abstraction ───────────────────────────────────
//
// Phase 5C foundation: 'image', 'shape', 'qr', 'barcode' are type-only placeholders.
// Only 'branding' and 'text' are implemented today.

export type DesignerElementKind = 'branding' | 'text' | 'image' | 'shape' | 'qr' | 'barcode';

export interface DesignerElement {
  id: string;
  kind: DesignerElementKind;
  documentType: string;
  label: string;
}

export interface DesignerSelection {
  element: DesignerElement;
}

export type DesignerCommand = 'copy' | 'paste' | 'duplicate' | 'lock' | 'hide' | 'rotate';

export type DesignerMode = 'branding' | 'text' | 'idle';

export interface DesignerCapabilities {
  rotation: boolean;
  copy: boolean;
  paste: boolean;
  duplicate: boolean;
  lock: boolean;
  hide: boolean;
}

export const DESIGNER_CAPABILITIES: DesignerCapabilities = {
  rotation: false,
  copy: false,
  paste: false,
  duplicate: false,
  lock: false,
  hide: false,
};

export function isBrandingElement(el: DesignerElement | null | undefined): el is DesignerElement & { kind: 'branding' } {
  return el != null && el.kind === 'branding';
}

export function isTextElement(el: DesignerElement | null | undefined): el is DesignerElement & { kind: 'text' } {
  return el != null && el.kind === 'text';
}
