import type { ReactElement } from 'react';
import { inkColorMatrix, inkFilterId, NEW_INK_COLOR_IDS, type InkMode, type NewInkColorId } from '../utils/inkFilter';

function isNewInkColorId(mode: InkMode | undefined): mode is NewInkColorId {
  return !!mode && (NEW_INK_COLOR_IDS as readonly string[]).includes(mode);
}

/**
 * The hidden `<svg><filter>` definition an ink-colored image's `filter: url(#id)` resolves
 * against — same technique as `FormHeader.tsx`'s already print-verified logo recolor.
 *
 * Rendered as a SIBLING of the `<img>` it serves, self-contained, so wherever that image is
 * cloned (PDF export, accurate preview — both clone a printable subtree, not the whole
 * document) the filter definition travels with it. A `url(#id)` reference that resolved to
 * nothing after cloning would silently drop the color, so this is not a decoration — it is
 * required for the color to survive export at all.
 *
 * Renders nothing for `original`/`black`/`blue-ink`/`undefined` — those stay on the existing
 * built-in CSS `filter` functions and need no SVG definition.
 */
export default function InkColorFilterDefs({ mode }: { mode: InkMode | undefined }): ReactElement | null {
  if (!isNewInkColorId(mode)) return null;
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <filter id={inkFilterId(mode)} colorInterpolationFilters="sRGB">
        <feColorMatrix type="matrix" values={inkColorMatrix(mode)} />
      </filter>
    </svg>
  );
}
