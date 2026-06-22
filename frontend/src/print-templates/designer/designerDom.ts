import type { DesignerElement, DesignerElementKind } from './designerTypes';

// Universal data attributes for designer-managed elements:
//   data-designer-type  — DesignerElementKind value
//   data-designer-id    — unique element identifier within the document
//   data-designer-doc   — document type (invoice | quotation | ...)
//   data-designer-label — human-readable Arabic label for status bar display

const VALID_KINDS = new Set<string>(['branding', 'text', 'image', 'shape', 'qr', 'barcode']);

export function getDesignerElementFromTarget(target: HTMLElement): DesignerElement | null {
  const el = target.closest<HTMLElement>('[data-designer-type]');
  if (!el) return null;

  const kind = el.dataset.designerType;
  if (!kind || !VALID_KINDS.has(kind)) return null;

  const id = el.dataset.designerId ?? '';
  const documentType = el.dataset.designerDoc ?? '';
  const label = el.dataset.designerLabel ?? id;

  return { id, kind: kind as DesignerElementKind, documentType, label };
}
