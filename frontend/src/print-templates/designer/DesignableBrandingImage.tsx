import { useEffect, useRef, type CSSProperties } from 'react';
import type { BrandingElementLayout } from '../engine/types';
import {
  BRANDING_LAYOUT_BOUNDS,
  ROTATION_MAX,
  ROTATION_MIN,
  brandingElementTransform,
} from '../utils/brandingLayout';
import type { BrandingDesignerHandle, ElementType } from '../hooks/useBrandingDesigner';
import { getInkFilterStyle, resolveInkMode } from '../utils/inkFilter';
import InkColorFilterDefs from './InkColorFilterDefs';

/**
 * A signature/stamp image that carries its saved layout and, in design mode, can be
 * dragged and resized in place.
 *
 * Written once and reused by every surface that draws a branding image inside a document
 * it does not own the geometry of — today the shared approval slot on ten administrative
 * forms. It deliberately does NOT own placement: the caller passes whatever `baseStyle`
 * already positions the image, and this component only COMPOSES the layout's transform
 * onto it. So with an identity layout (a form that was never designed) the rendered
 * style is `…baseStyle + translate(0px, 0px) scale(1)` — visually and geometrically the
 * same element as before design mode existed.
 *
 * Three invariants worth stating out loud:
 *  · Size is a single uniform `scale`, never a width/height pair, so the image's aspect
 *    ratio cannot change no matter how the handle is dragged.
 *  · Pointer deltas are divided by the scale the document is ACTUALLY rendered at,
 *    measured from the DOM at gesture start — `PrintWorkspace` owns the forms' zoom, so
 *    a hard-coded assumption would make the element drift away from the cursor.
 *  · BOTH handles are siblings of the image, never children of it, so neither inherits
 *    the image's `rotate()`/`scale()`. That is not cosmetic: `measureRenderScale` reads a
 *    handle's bounding rect, and a rotated ancestor would inflate that rect to the box's
 *    axis-aligned bounding box — the measured "render scale" would come back wrong and
 *    both drag and resize would drift on every rotated element.
 */
interface Props {
  src: string;
  kind: ElementType;
  layout: BrandingElementLayout;
  /** Everything that positions and sizes the image outside design mode. */
  baseStyle: CSSProperties;
  /** Absent (or inactive) ⇒ a plain image with its saved layout applied. */
  designer?: BrandingDesignerHandle;
  /** `translateX(-50%)`-style centring the caller already relies on, kept ahead of the
   *  layout transform so the element stays centred on its anchor while it moves. */
  transformPrefix?: string;
}

const OUTLINE_COLOR: Record<ElementType, string> = {
  signature: '#3b82f6',
  stamp: '#10b981',
};

/**
 * The factor the document is currently rendered at.
 *
 * Measured from the resize handle rather than the image: the handle carries no transform
 * of its own, so `renderedWidth / layoutWidth` is purely what the ancestors scale by.
 * Reading the image instead would fold in the element's own `scale` and mis-report.
 */
function measureRenderScale(handle: HTMLElement | null): number {
  if (!handle) return 1;
  const rect = handle.getBoundingClientRect();
  const natural = handle.offsetWidth;
  if (!natural || !rect.width) return 1;
  return rect.width / natural;
}

export default function DesignableBrandingImage({
  src,
  kind,
  layout,
  baseStyle,
  designer,
  transformPrefix,
}: Props) {
  const active = designer?.isActive ?? false;
  const isSelected = active && designer?.selected === kind;
  /**
   * The envelope this element is clamped to AT RENDER TIME. It must be the same one the
   * designer edited with, or a saved position outside the central range would be silently
   * pulled back on display — the designer is the single source for it, keyed by document.
   * No designer (a form not opted into design mode) ⇒ the central envelope, exactly as before.
   */
  const activeBounds = designer?.bounds ?? BRANDING_LAYOUT_BOUNDS;
  /**
   * Ink Color System v2 — THIS element's own color (independent of its sibling
   * signature/stamp), falling back to the legacy global default when never customized.
   * `layout.inkMode` is per-element and part of `print.brandingLayout`, so it shares
   * Save/Reset/Undo/Redo with position and size — there is no separate color store.
   */
  const resolvedInk = resolveInkMode(layout.inkMode);
  const handleRef = useRef<HTMLSpanElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const gestureRef = useRef<'drag' | 'resize' | 'rotate' | null>(null);

  // Pointer move/up live on the window so a fast gesture that leaves the small image
  // still tracks, and always ends — a pointerup outside the element would otherwise
  // leave the designer stuck mid-drag.
  useEffect(() => {
    if (!designer || !active) return;

    function handleMove(e: PointerEvent) {
      if (gestureRef.current === 'drag') designer!.continueDrag(e.clientX, e.clientY);
      else if (gestureRef.current === 'resize') designer!.continueResize(e.clientX, e.clientY);
      // Shift is read LIVE on every move rather than snapshotted at grab time, so the
      // operator can drop into 15° steps part-way through a free rotation and back out
      // again — the way every other design tool behaves.
      else if (gestureRef.current === 'rotate') designer!.continueRotate(e.clientX, e.clientY, e.shiftKey);
    }
    function handleUp() {
      if (gestureRef.current === 'drag') designer!.endDrag();
      else if (gestureRef.current === 'resize') designer!.endResize();
      else if (gestureRef.current === 'rotate') designer!.endRotate();
      gestureRef.current = null;
    }

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  }, [designer, active]);

  const imageStyle: CSSProperties = {
    ...baseStyle,
    transform: [transformPrefix, brandingElementTransform(layout, activeBounds)]
      .filter(Boolean)
      .join(' '),
    transformOrigin: 'center',
    opacity: layout.opacity,
    zIndex: layout.zIndex,
    ...getInkFilterStyle(resolvedInk),
    ...(active
      ? {
          cursor: 'move',
          outline: `1px ${isSelected ? 'solid' : 'dashed'} ${OUTLINE_COLOR[kind]}`,
          outlineOffset: 2,
        }
      : {}),
  };

  const img = (
    <img
      ref={imgRef}
      src={src}
      alt=""
      data-bd-type={kind}
      data-designer-type="branding"
      data-designer-id={kind}
      draggable={false}
      style={imageStyle}
      onPointerDown={
        active && designer
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              gestureRef.current = 'drag';
              designer.startDrag(kind, e.clientX, e.clientY, measureRenderScale(handleRef.current));
            }
          : undefined
      }
    />
  );

  if (!active || !designer) {
    // A React Fragment — unlike a `display:contents` span — inserts NO DOM node at
    // all, so `img.parentElement` still resolves to whatever container the caller
    // (e.g. `ApprovalSection`'s signature ruling) rendered around this component,
    // exactly as it did before Ink Color System v2 added the filter-defs sibling.
    return (
      <>
        <InkColorFilterDefs mode={resolvedInk} />
        {img}
      </>
    );
  }

  return (
    /* `display: contents` keeps the wrapper out of the layout entirely — the handle
       positions against whatever positioned ancestor the caller already had (the
       signature's ruling, the stamp's anchor), so adding design mode moves nothing. */
    <span style={{ display: 'contents' }}>
      <InkColorFilterDefs mode={resolvedInk} />
      {img}
      <span
        ref={handleRef}
        role="slider"
        tabIndex={-1}
        aria-label={kind === 'signature' ? 'تغيير حجم التوقيع' : 'تغيير حجم الختم'}
        aria-valuenow={Math.round(layout.scale * 100)}
        aria-valuemin={Math.round(activeBounds.minScale * 100)}
        aria-valuemax={Math.round(activeBounds.maxScale * 100)}
        title="اسحب لتغيير الحجم — النسبة محفوظة"
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          gestureRef.current = 'resize';
          designer.startResize(kind, e.clientX, e.clientY, measureRenderScale(handleRef.current));
        }}
        style={{
          position: 'absolute',
          insetInlineEnd: -6,
          bottom: -6,
          width: 11,
          height: 11,
          borderRadius: 2,
          background: '#fff',
          border: `2px solid ${OUTLINE_COLOR[kind]}`,
          cursor: 'nwse-resize',
          zIndex: 30,
        }}
      />
      <span
        role="slider"
        tabIndex={-1}
        aria-label={kind === 'signature' ? 'تدوير التوقيع' : 'تدوير الختم'}
        aria-valuenow={Math.round(layout.rotation ?? 0)}
        aria-valuemin={ROTATION_MIN}
        aria-valuemax={ROTATION_MAX}
        title="اسحب للتدوير — Shift للتدوير بخطوات 15° · نقر مزدوج للعودة إلى 0°"
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          /**
           * The pivot is the IMAGE's own rect centre, measured fresh at grab time. Under
           * `transform-origin: center` the centre is the one point rotation leaves fixed,
           * so the centre of the (axis-aligned) rect is the true pivot at ANY existing
           * angle — which is what keeps a second rotation as accurate as the first.
           */
          const rect = imgRef.current?.getBoundingClientRect();
          if (!rect) return;
          gestureRef.current = 'rotate';
          designer.startRotate(
            kind,
            rect.left + rect.width / 2,
            rect.top + rect.height / 2,
            e.clientX,
            e.clientY,
          );
        }}
        onDoubleClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          designer.resetRotation(kind);
        }}
        style={{
          position: 'absolute',
          insetInlineEnd: -6,
          top: -22,
          width: 11,
          height: 11,
          borderRadius: '50%',
          background: '#fff',
          border: `2px solid ${OUTLINE_COLOR[kind]}`,
          cursor: 'crosshair',
          zIndex: 30,
        }}
      />
    </span>
  );
}
