import { useEffect, useRef, type CSSProperties } from 'react';
import type { BrandingElementLayout } from '../engine/types';
import { BRANDING_LAYOUT_BOUNDS, brandingElementTransform } from '../utils/brandingLayout';
import type { BrandingDesignerHandle, ElementType } from '../hooks/useBrandingDesigner';
import { getInkFilterStyle } from '../utils/inkFilter';

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
 * Two invariants worth stating out loud:
 *  · Size is a single uniform `scale`, never a width/height pair, so the image's aspect
 *    ratio cannot change no matter how the handle is dragged.
 *  · Pointer deltas are divided by the scale the document is ACTUALLY rendered at,
 *    measured from the DOM at gesture start — `PrintWorkspace` owns the forms' zoom, so
 *    a hard-coded assumption would make the element drift away from the cursor.
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
  const handleRef = useRef<HTMLSpanElement>(null);
  const gestureRef = useRef<'drag' | 'resize' | null>(null);

  // Pointer move/up live on the window so a fast gesture that leaves the small image
  // still tracks, and always ends — a pointerup outside the element would otherwise
  // leave the designer stuck mid-drag.
  useEffect(() => {
    if (!designer || !active) return;

    function handleMove(e: PointerEvent) {
      if (gestureRef.current === 'drag') designer!.continueDrag(e.clientX, e.clientY);
      else if (gestureRef.current === 'resize') designer!.continueResize(e.clientX, e.clientY);
    }
    function handleUp() {
      if (gestureRef.current === 'drag') designer!.endDrag();
      else if (gestureRef.current === 'resize') designer!.endResize();
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
    transform: [transformPrefix, brandingElementTransform(layout)]
      .filter(Boolean)
      .join(' '),
    transformOrigin: 'center',
    opacity: layout.opacity,
    zIndex: layout.zIndex,
    ...getInkFilterStyle(designer?.inkMode),
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

  if (!active || !designer) return img;

  return (
    /* `display: contents` keeps the wrapper out of the layout entirely — the handle
       positions against whatever positioned ancestor the caller already had (the
       signature's ruling, the stamp's anchor), so adding design mode moves nothing. */
    <span style={{ display: 'contents' }}>
      {img}
      <span
        ref={handleRef}
        role="slider"
        tabIndex={-1}
        aria-label={kind === 'signature' ? 'تغيير حجم التوقيع' : 'تغيير حجم الختم'}
        aria-valuenow={Math.round(layout.scale * 100)}
        aria-valuemin={Math.round(BRANDING_LAYOUT_BOUNDS.minScale * 100)}
        aria-valuemax={Math.round(BRANDING_LAYOUT_BOUNDS.maxScale * 100)}
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
    </span>
  );
}
