/**
 * Cheque Template Designer — public API barrel.
 *
 * Dual Cheque Printing Modes Foundation v1. A generic, business-logic-free
 * WYSIWYG editor extracted from the Professional Cheque Printing module's
 * reusable engines. It is not wired into any route, tab, page, printing,
 * calibration, persistence, or settings — it is a standalone building block
 * for the future "Cheque Template" printing mode inside Official Cheque
 * Management.
 *
 * Nothing in the app imports this module yet.
 */

export { default as ChequeTemplateDesigner } from './ChequeTemplateDesigner';
export type { ChequeTemplateDesignerProps } from './ChequeTemplateDesigner';

// Model
export type { DesignerField, DesignerFieldSlot, DesignerTextAlign } from './designerField.types';

// Surface
export type { DesignerSurfaceSpec } from './surface.constants';
export { PHYSICAL_CHEQUE_SURFACE_CM, surfaceAspectRatio } from './surface.constants';

// Tuning constants
export {
  MIN_FIELD_SIZE_PERCENT,
  KEYBOARD_STEP_SMALL_PERCENT,
  KEYBOARD_STEP_LARGE_PERCENT,
  ALIGNMENT_SNAP_THRESHOLD_PERCENT,
} from './designerEngine.constants';

// Presentational pieces (for hosts that want to compose their own layout)
export { default as DesignerSurface } from './DesignerSurface';
export { default as DesignerFieldLayer } from './DesignerFieldLayer';
export { default as AlignmentGuidesOverlay } from './AlignmentGuidesOverlay';
export { default as PropertiesPanel, DEFAULT_PROPERTIES_PANEL_LABELS } from './PropertiesPanel';
export type { PropertiesPanelLabels } from './PropertiesPanel';

// Engines (hooks)
export { useDesignerSelection } from './useDesignerSelection';
export type { DesignerSelectionEngine } from './useDesignerSelection';
export { useDesignerHistory } from './useDesignerHistory';
export type { DesignerHistory } from './useDesignerHistory';
export { useDesignerDrag } from './useDesignerDrag';
export type { DesignerDragEngine } from './useDesignerDrag';
export { useDesignerResize } from './useDesignerResize';
export type { DesignerResizeEngine, ResizeCorner } from './useDesignerResize';
export { useDesignerRotation } from './useDesignerRotation';
export type { DesignerRotationEngine } from './useDesignerRotation';
export { useDesignerKeyboard } from './useDesignerKeyboard';

// Pure logic
export type { FieldMutationApi } from './fieldGeometry';
export { clampNumber, getMaxOrigin } from './fieldGeometry';
export type { AlignmentGuide } from './alignmentGuides';
export { snapValue, computeDragSnap } from './alignmentGuides';
export {
  duplicateField,
  deleteField,
  bringForward,
  sendBackward,
  bringToFront,
  sendToBack,
} from './fieldActions';
