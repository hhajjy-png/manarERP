// Pure DOM helpers for the Global Smart Overflow Tooltip. No React, no state —
// kept separate so the detection logic can be reasoned about (and unit tested)
// independently of the event-delegation provider.

const IGNORED_TAGS = new Set([
  'INPUT', 'TEXTAREA', 'SELECT', 'SVG', 'IMG', 'CANVAS', 'IFRAME', 'VIDEO', 'AUDIO',
]);

// Truncated labels (chips, cells, tabs, titles) are compact by nature. Capping
// the candidate height rules out large scroll-locked containers (open
// drawers/dialogs set `overflow: hidden` on an ancestor) that would otherwise
// false-positive as "truncated" and dump their entire subtree text into a tooltip.
const MAX_CANDIDATE_HEIGHT = 160;
const MAX_ANCESTOR_DEPTH = 5;

function isClipped(overflow: string): boolean {
  return overflow === 'hidden' || overflow === 'clip';
}

function isTruncated(el: HTMLElement): boolean {
  if (el.clientHeight > MAX_CANDIDATE_HEIGHT) return false;
  const style = window.getComputedStyle(el);
  const overflowsX = isClipped(style.overflowX) && el.scrollWidth - el.clientWidth > 1;
  const overflowsY = isClipped(style.overflowY) && el.scrollHeight - el.clientHeight > 1;
  if (!overflowsX && !overflowsY) return false;
  return getTooltipText(el).length > 0;
}

function isDisabled(el: Element): boolean {
  return el.closest('[data-tooltip-disable]') !== null;
}

/**
 * Walks up from the hovered/focused element looking for the nearest ancestor
 * whose rendered content is actually clipped. Bounded depth + bounded height
 * check keep this cheap enough to run on every pointerover/focusin.
 */
export function findOverflowTarget(start: Element | null): HTMLElement | null {
  let el = start as HTMLElement | null;
  let depth = 0;
  while (el && el !== document.body && el !== document.documentElement && depth < MAX_ANCESTOR_DEPTH) {
    if (!IGNORED_TAGS.has(el.tagName) && !isDisabled(el) && isTruncated(el)) {
      return el;
    }
    el = el.parentElement;
    depth += 1;
  }
  return null;
}

/**
 * Full text to display. Priority: explicit data-tooltip-text override, then
 * the element's own title attribute (existing convention across the app,
 * e.g. DataTable's .dt-truncate cells), then rendered text content.
 */
export function getTooltipText(el: HTMLElement): string {
  const explicit = el.getAttribute('data-tooltip-text');
  if (explicit && explicit.trim()) return explicit.trim();

  const nativeTitle = el.getAttribute('title');
  if (nativeTitle && nativeTitle.trim()) return nativeTitle.trim();

  return (el.textContent ?? '').trim();
}

function containsRtlChar(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    const isHebrew = code >= 0x0591 && code <= 0x05f4;
    const isArabic = code >= 0x0600 && code <= 0x06ff;
    const isArabicSupplement = code >= 0x0750 && code <= 0x077f;
    const isArabicPresentationA = code >= 0xfb50 && code <= 0xfdff;
    const isArabicPresentationB = code >= 0xfe70 && code <= 0xfefc;
    if (isHebrew || isArabic || isArabicSupplement || isArabicPresentationA || isArabicPresentationB) {
      return true;
    }
  }
  return false;
}

export function detectDirection(el: HTMLElement, text: string): 'rtl' | 'ltr' {
  if (containsRtlChar(text)) return 'rtl';
  return window.getComputedStyle(el).direction === 'rtl' ? 'rtl' : 'ltr';
}
