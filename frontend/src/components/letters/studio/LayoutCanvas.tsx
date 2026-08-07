/**
 * Document Layout Designer — the interaction layer.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THIS IS CHROME. NONE OF IT PRINTS.
 * ══════════════════════════════════════════════════════════════════════════
 * Selection frames, resize handles, the rotation handle, smart guides, the marquee,
 * the reserved-zone warning tint and the guide rules all live here — and the whole
 * component is `.no-print`. The INK is `LayoutObjectView`, a separate layer beneath.
 * Splitting them this way is what makes "does this print?" answerable by looking at
 * which file a thing is in rather than by reading a stylesheet.
 *
 * ── HIT TESTING IS DONE IN MILLIMETRES, NOT BY THE DOM ───────────────────
 * The canvas is one transparent surface with no per-object elements, and a click is
 * resolved by `hitTest` against the objects' true rotated shapes. Letting the DOM
 * decide — a click target per object — would be wrong for exactly the case that
 * matters: a rotated element's CSS box is its unrotated rectangle turned by the
 * compositor, and the browser hit-tests the *painted* shape only for some property
 * combinations. Resolving it ourselves is exact, and it is the same arithmetic the
 * blocking reserved-zone rule uses, so what you can click and what the validator
 * judges are the same shape by construction.
 *
 * ── THE PREVIEW IS RENDERED, THE DOCUMENT IS NOT TOUCHED ─────────────────
 * While a gesture runs, the selection frame is drawn at its proposed position and the
 * objects beneath are still at their stored one. One command runs on pointer up. See
 * `useLayoutInteraction` for why.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { Icon } from '../../explorer/ExplorerKit';
import {
  type DocumentLayout,
  type LayoutObject,
} from '../../../letters/model/layoutTypes';
import {
  type RectMm,
  hitTest,
  marqueeSelect,
  objectBounds,
  rectBottom,
  rectRight,
  selectionBounds,
} from '../../../letters/layout/layoutGeometry';
import {
  effectiveHidden,
  effectiveLocked,
  expandSelectionToGroups,
  findObject,
} from '../../../letters/layout/layoutCommands';
import { type SnapSettings, type PageSnapContext, snapTargets } from '../../../letters/layout/snapping';
import {
  type ResizeHandle,
  RESIZE_HANDLES,
  useLayoutInteraction,
} from './useLayoutInteraction';
import { type LayoutSelection } from './useLayoutSelection';
import './layout-canvas.css';

export interface LayoutCanvasProps {
  readonly layout: DocumentLayout;
  readonly pageIndex: number;
  readonly selection: LayoutSelection;
  readonly page: PageSnapContext;
  readonly snap: SnapSettings;
  /** Pixels per millimetre as rendered, including zoom. */
  readonly pxPerMm: number;
  /** Reserved bands, so the canvas can tint an object that has entered one. */
  readonly reservedBands: readonly { readonly startMm: number; readonly endMm: number }[];
  readonly showGuides: boolean;
  readonly readOnly: boolean;
  readonly onMove: (dxMm: number, dyMm: number) => void;
  readonly onResize: (objectId: string, rect: RectMm) => void;
  readonly onRotate: (degrees: number) => void;
  readonly onGuideMove: (guideId: string, positionMm: number) => void;
}

export default function LayoutCanvas({
  layout,
  pageIndex,
  selection,
  page,
  snap,
  pxPerMm,
  reservedBands,
  showGuides,
  readOnly,
  onMove,
  onResize,
  onRotate,
  onGuideMove,
}: LayoutCanvasProps) {
  const surface = useRef<HTMLDivElement | null>(null);
  /** The object directly under the pointer, right now — not the selection, and not the
   *  whole-canvas ambient hover `.lc-canvas:hover` already gives every outline (Document
   *  Studio UX Polish Pack v1). Idle-only: computing it mid-gesture would be wasted
   *  work, since the frame the gesture itself draws already answers "what am I doing". */
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  /** Objects on this page that can be interacted with. */
  const visible = useMemo(
    () => layout.objects.filter((object) => object.pageIndex === pageIndex && !effectiveHidden(layout, object)),
    [layout, pageIndex],
  );

  const selectedOnPage = useMemo(
    () => visible.filter((object) => selection.has(object.id)),
    [visible, selection],
  );

  const bounds = useMemo(() => selectionBounds(selectedOnPage), [selectedOnPage]);

  const targets = useMemo(
    () => snapTargets(layout.objects, selection.ids, pageIndex),
    [layout.objects, selection.ids, pageIndex],
  );

  const interaction = useLayoutInteraction(
    surface,
    { pxPerMm, page, snap, targets, guides: layout.guides },
    {
      onMove,
      onResize: (rect) => {
        // Resize applies to the single primary object: resizing a multi-selection
        // would have to decide whether to scale each object or stretch the group, and
        // those are different features. The toolbar's "same width" covers the
        // multi-object case deliberately.
        if (selection.primaryId) onResize(selection.primaryId, rect);
      },
      onRotate,
      onMarquee: (rect, additive) => {
        const hits = marqueeSelect(layout.objects, rect, pageIndex).map((object) => object.id);
        const expanded = expandSelectionToGroups(layout, hits);
        if (additive) selection.add(expanded);
        else selection.select(expanded);
      },
    },
  );

  /**
   * A press on the surface.
   *
   * Resolves what was hit, updates the selection, then starts either a move (something
   * was hit) or a marquee (nothing was). Doing both from one handler is what makes the
   * two feel like one continuous gesture rather than two modes.
   */
  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (readOnly || event.button !== 0) return;

      const box = event.currentTarget.getBoundingClientRect();
      const point = {
        xMm: (event.clientX - box.left) / pxPerMm,
        yMm: (event.clientY - box.top) / pxPerMm,
      };

      const hit = hitTest(layout.objects, point, pageIndex);
      const additive = event.shiftKey || event.ctrlKey || event.metaKey;

      if (!hit) {
        // Empty space: a plain press clears, an additive press keeps what is selected.
        if (!additive) selection.clear();
        interaction.beginMarquee(event);
        return;
      }

      const group = expandSelectionToGroups(layout, [hit.id]);

      if (additive) {
        // Toggling a whole group needs the group's members, not just the clicked one.
        if (selection.has(hit.id)) group.forEach((id) => selection.toggle(id));
        else selection.add(group);
        return;
      }

      // Dragging an object that is already part of the selection moves the WHOLE
      // selection — re-selecting it alone would silently drop the other objects the
      // author had just lined up.
      const next = selection.has(hit.id) ? selection.ids : group;
      if (!selection.has(hit.id)) selection.select(group);

      const dragBounds = selectionBounds(
        next
          .map((id) => findObject(layout, id))
          .filter((object): object is LayoutObject => object !== undefined && object.pageIndex === pageIndex),
      );
      if (dragBounds) interaction.beginMove(event, dragBounds);
    },
    [readOnly, pxPerMm, layout, pageIndex, selection, interaction],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (readOnly || interaction.interacting) return;
      const box = event.currentTarget.getBoundingClientRect();
      const point = {
        xMm: (event.clientX - box.left) / pxPerMm,
        yMm: (event.clientY - box.top) / pxPerMm,
      };
      const hit = hitTest(layout.objects, point, pageIndex);
      setHoveredId((current) => (current === (hit?.id ?? null) ? current : hit?.id ?? null));
    },
    [readOnly, interaction.interacting, pxPerMm, layout, pageIndex],
  );

  /** The frame drawn while a gesture previews. */
  const previewBounds: RectMm | null = useMemo(() => {
    if (!bounds) return null;
    const gesture = interaction.gesture;
    if (gesture?.kind === 'move') {
      return { ...bounds, xMm: bounds.xMm + gesture.dxMm, yMm: bounds.yMm + gesture.dyMm };
    }
    if (gesture?.kind === 'resize') return gesture.rect;
    return bounds;
  }, [bounds, interaction.gesture]);

  const singleSelected = selectedOnPage.length === 1 ? selectedOnPage[0] : null;
  const anyLocked = selectedOnPage.some((object) => effectiveLocked(layout, object));

  return (
    <div
      className={`no-print lc-canvas${interaction.interacting ? ' is-interacting' : ''}${readOnly ? ' is-readonly' : ''}`}
      ref={surface}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerLeave={() => setHoveredId(null)}
      // A design surface is not a control. It carries no role and no tab stop: every
      // object is reachable through the Layers panel, which IS a list of controls and
      // is where keyboard users select. A canvas that grabbed focus would trap them.
      aria-hidden="true"
    >
      {/* ── Reserved-zone warning ──────────────────────────────────────────
          An object that has entered a band is tinted HERE rather than in the ink
          layer, so the warning cannot print. The blocking rule reports it properly;
          this is the immediate feedback that stops the author reaching the panel at
          all. */}
      {visible
        .filter((object) =>
          reservedBands.some((band) => {
            const objectBox = objectBounds(object);
            return objectBox.yMm < band.endMm && rectBottom(objectBox) > band.startMm;
          }),
        )
        .map((object) => (
          <span
            key={`warn-${object.id}`}
            className="lc-zone-warning"
            style={boxStyle(objectBounds(object))}
          />
        ))}

      {/* ── Hover and locked affordances ─────────────────────────────────── */}
      {visible.map((object) => (
        <span
          key={`outline-${object.id}`}
          className={`lc-outline${selection.has(object.id) ? ' is-selected' : ''}${effectiveLocked(layout, object) ? ' is-locked' : ''}${hoveredId === object.id && !selection.has(object.id) ? ' is-hovered' : ''}`}
          style={{
            ...boxStyle({
              xMm: object.frame.xMm,
              yMm: object.frame.yMm,
              widthMm: object.frame.widthMm,
              heightMm: object.frame.heightMm,
            }),
            transform: object.rotationDeg === 0 ? undefined : `rotate(${object.rotationDeg}deg)`,
            transformOrigin: 'center center',
          }}
        />
      ))}

      {/* ── Guides ──────────────────────────────────────────────────────── */}
      {showGuides &&
        layout.guides.map((guide) => (
          <span
            key={guide.id}
            className={`lc-guide lc-guide--${guide.axis}${guide.locked ? ' is-locked' : ''}`}
            style={
              guide.axis === 'vertical'
                ? { insetInlineStart: `${guide.positionMm}mm`, top: 0, bottom: 0 }
                : { top: `${guide.positionMm}mm`, insetInline: 0 }
            }
            onPointerDown={(event) => {
              if (guide.locked || readOnly) return;
              event.stopPropagation();
              const box = surface.current?.getBoundingClientRect();
              if (!box) return;
              const move = (moveEvent: PointerEvent) => {
                onGuideMove(
                  guide.id,
                  guide.axis === 'vertical'
                    ? (moveEvent.clientX - box.left) / pxPerMm
                    : (moveEvent.clientY - box.top) / pxPerMm,
                );
              };
              const up = () => {
                window.removeEventListener('pointermove', move);
                window.removeEventListener('pointerup', up);
              };
              window.addEventListener('pointermove', move);
              window.addEventListener('pointerup', up);
            }}
          />
        ))}

      {/* ── Smart guides ────────────────────────────────────────────────── */}
      {interaction.smartGuides.map((guide, index) => (
        <span
          key={`smart-${index}`}
          className={`lc-smart lc-smart--${guide.axis} lc-smart--${guide.source}`}
          style={
            guide.axis === 'vertical'
              ? { insetInlineStart: `${guide.positionMm}mm`, top: `${guide.fromMm}mm`, height: `${guide.toMm - guide.fromMm}mm` }
              : { top: `${guide.positionMm}mm`, insetInlineStart: `${guide.fromMm}mm`, width: `${guide.toMm - guide.fromMm}mm` }
          }
        />
      ))}

      {/* ── Marquee ─────────────────────────────────────────────────────── */}
      {interaction.gesture?.kind === 'marquee' && (
        <span className="lc-marquee" style={boxStyle(interaction.gesture.rect)} />
      )}

      {/* ── Selection frame and handles ─────────────────────────────────── */}
      {previewBounds && !readOnly && (
        <div
          className={`lc-selection${anyLocked ? ' is-locked' : ''}`}
          style={boxStyle(previewBounds)}
          onPointerDown={(event) => {
            // Presses on the frame itself move the selection — including presses in
            // the gap between two objects' bounds, which is what makes a
            // multi-selection feel like one thing.
            if (anyLocked || readOnly) return;
            event.stopPropagation();
            if (bounds) interaction.beginMove(event, bounds);
          }}
        >
          {anyLocked ? (
            <span className="lc-lock-badge"><Icon name="lock" /></span>
          ) : (
            <>
              {/* Resize handles only for a SINGLE object — see the resize callback for
                  why a multi-selection resize is a different feature. */}
              {singleSelected &&
                RESIZE_HANDLES.map((handle) => (
                  <span
                    key={handle}
                    className={`lc-handle lc-handle--${handle}`}
                    onPointerDown={(event) =>
                      interaction.beginResize(event, handle as ResizeHandle, objectBounds(singleSelected))
                    }
                  />
                ))}

              {singleSelected && (
                <span
                  className="lc-rotate"
                  onPointerDown={(event) =>
                    interaction.beginRotate(event, objectBounds(singleSelected), singleSelected.rotationDeg)
                  }
                >
                  <Icon name="rotate_right" />
                </span>
              )}

              {/* The live readout: size while resizing, angle while rotating,
                  position while moving. Beside the pointer rather than in the status
                  bar, because during a drag the eye is on the object. */}
              {interaction.gesture && (
                <span className="lc-readout">
                  {interaction.gesture.kind === 'rotate'
                    ? `${Math.round(interaction.gesture.degrees)}°`
                    : interaction.gesture.kind === 'resize'
                      ? `${round(interaction.gesture.rect.widthMm)} × ${round(interaction.gesture.rect.heightMm)} مم`
                      : `${round(previewBounds.xMm)}, ${round(previewBounds.yMm)} مم`}
                </span>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** A rectangle as inline millimetre styles. The one place the two are converted. */
function boxStyle(rect: RectMm): React.CSSProperties {
  return {
    insetInlineStart: `${rect.xMm}mm`,
    top: `${rect.yMm}mm`,
    width: `${rect.widthMm}mm`,
    height: `${rect.heightMm}mm`,
  };
}

/** One decimal — finer than any printer resolves, and stable enough not to flicker. */
function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Re-exported so the composer can reuse the same right-edge maths for its rulers. */
export { rectRight };
