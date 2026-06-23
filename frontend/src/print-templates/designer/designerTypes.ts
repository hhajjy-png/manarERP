export type DesignerElementKind = 'branding' | 'text' | 'layout' | 'image' | 'shape' | 'qr' | 'barcode';

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

export type DesignerMode = 'branding' | 'text' | 'layout' | 'idle';

export interface DesignerCapabilities {
  rotation: boolean;
  copy: boolean;
  paste: boolean;
  duplicate: boolean;
  lock: boolean;
  hide: boolean;
}

export const DESIGNER_CAPABILITIES: DesignerCapabilities = {
  rotation: true,
  copy: true,
  paste: true,
  duplicate: true,
  lock: true,
  hide: true,
};

export function isBrandingElement(el: DesignerElement | null | undefined): el is DesignerElement & { kind: 'branding' } {
  return el != null && el.kind === 'branding';
}

export function isTextElement(el: DesignerElement | null | undefined): el is DesignerElement & { kind: 'text' } {
  return el != null && el.kind === 'text';
}

export function isLayoutElement(el: DesignerElement | null | undefined): el is DesignerElement & { kind: 'layout' } {
  return el != null && el.kind === 'layout';
}
