/**
 * The bounding rect (viewport coordinates) of the text currently selected inside a
 * `<textarea>` — or the caret's position, when the selection is collapsed.
 *
 * A `<textarea>` exposes no native equivalent of `Range.getBoundingClientRect()` (that
 * only exists for contentEditable/text-node selections). This measures it with a hidden
 * mirror: an offscreen `<div>` cloned with the textarea's own box and font metrics,
 * holding the same text up to two marker spans at the selection's start and end. Each
 * marker's position inside the mirror — combined with the textarea's own position and
 * current scroll offset, since mirror and textarea share identical metrics by
 * construction — gives the real on-screen point.
 */

const MIRRORED_PROPERTIES = [
  'boxSizing',
  'width',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderTopStyle',
  'borderRightStyle',
  'borderBottomStyle',
  'borderLeftStyle',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'lineHeight',
  'letterSpacing',
  'textAlign',
  'textTransform',
  'wordSpacing',
  'direction',
  'tabSize',
] as const;

export interface TextRect {
  readonly top: number;
  readonly left: number;
  readonly bottom: number;
  readonly right: number;
  readonly width: number;
  readonly height: number;
}

function buildMirror(el: HTMLTextAreaElement): HTMLDivElement {
  const computed = window.getComputedStyle(el);
  const mirror = document.createElement('div');
  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.top = '0';
  mirror.style.left = '-9999px';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.wordWrap = 'break-word';
  mirror.style.overflowWrap = 'break-word';
  for (const prop of MIRRORED_PROPERTIES) {
    mirror.style[prop] = computed[prop];
  }
  return mirror;
}

export function textareaSelectionRect(el: HTMLTextAreaElement): TextRect {
  const value = el.value;
  const start = Math.min(el.selectionStart ?? 0, el.selectionEnd ?? 0);
  const end = Math.max(el.selectionStart ?? 0, el.selectionEnd ?? 0);

  const mirror = buildMirror(el);
  mirror.appendChild(document.createTextNode(value.slice(0, start)));
  const startMarker = document.createElement('span');
  startMarker.textContent = '​';
  mirror.appendChild(startMarker);
  // A zero-width joiner keeps a collapsed selection's end marker measurable — an empty
  // text node between two adjacent spans collapses to nothing in some layout engines.
  mirror.appendChild(document.createTextNode(value.slice(start, end) || '​'));
  const endMarker = document.createElement('span');
  endMarker.textContent = '​';
  mirror.appendChild(endMarker);
  mirror.appendChild(document.createTextNode(value.slice(end)));

  document.body.appendChild(mirror);
  const elRect = el.getBoundingClientRect();
  const mirrorRect = mirror.getBoundingClientRect();
  const startRect = startMarker.getBoundingClientRect();
  const endRect = endMarker.getBoundingClientRect();
  document.body.removeChild(mirror);

  const offsetX = elRect.left - mirrorRect.left - el.scrollLeft;
  const offsetY = elRect.top - mirrorRect.top - el.scrollTop;

  const top = Math.min(startRect.top, endRect.top) + offsetY;
  const bottom = Math.max(startRect.bottom, endRect.bottom) + offsetY;
  const left = Math.min(startRect.left, endRect.left) + offsetX;
  const right = Math.max(startRect.right, endRect.right) + offsetX;

  // Clamped to the textarea's own visible box: a selection scrolled out of view INSIDE
  // the textarea (a long paragraph, selection above the visible fold) must report a
  // rect the caller can still anchor something to, not one hanging off-screen above it.
  const clampedTop = Math.max(top, elRect.top);
  const clampedBottom = Math.min(Math.max(bottom, clampedTop), elRect.bottom);

  return {
    top: clampedTop,
    left,
    bottom: clampedBottom,
    right,
    width: Math.max(0, right - left),
    height: Math.max(0, clampedBottom - clampedTop),
  };
}
