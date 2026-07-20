import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { detectDirection, findOverflowTarget, getTooltipText } from './overflowDetection';
import './GlobalOverflowTooltip.css';

const SHOW_DELAY_MS = 300;
const HIDE_DELAY_MS = 60;
const VIEWPORT_MARGIN = 8;
const TARGET_GAP = 8;

interface TooltipContent {
  text: string;
  dir: 'rtl' | 'ltr';
}

interface TooltipPosition {
  top: number;
  left: number;
}

const OFFSCREEN_POSITION: TooltipPosition = { top: -9999, left: -9999 };

/**
 * Mounted once at the app root. Delegates a single pointerover/focusin
 * listener on `document` — no per-element listeners or observers — and shows
 * a portal-rendered tooltip for whichever hovered/focused element is
 * genuinely clipped (`scrollWidth > clientWidth` or the vertical equivalent).
 * Opt out of an element with `data-tooltip-disable`; override its displayed
 * text with `data-tooltip-text`.
 */
export default function GlobalOverflowTooltip() {
  const [content, setContent] = useState<TooltipContent | null>(null);
  const [position, setPosition] = useState<TooltipPosition>(OFFSCREEN_POSITION);
  const activeElRef = useRef<HTMLElement | null>(null);
  const showTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const tooltipIdRef = useRef(`got-tooltip-${Math.random().toString(36).slice(2)}`);

  const clearTimers = useCallback(() => {
    if (showTimerRef.current !== null) {
      window.clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const hide = useCallback(() => {
    clearTimers();
    const el = activeElRef.current;
    if (el) {
      const restoredTitle = el.dataset.tooltipNativeTitle;
      if (restoredTitle !== undefined) {
        el.setAttribute('title', restoredTitle);
        delete el.dataset.tooltipNativeTitle;
      }
      el.removeAttribute('aria-describedby');
    }
    activeElRef.current = null;
    setContent(null);
    setPosition(OFFSCREEN_POSITION);
  }, [clearTimers]);

  const scheduleHide = useCallback((delay: number) => {
    clearTimers();
    hideTimerRef.current = window.setTimeout(hide, delay);
  }, [clearTimers, hide]);

  const show = useCallback((el: HTMLElement, immediate: boolean) => {
    clearTimers();
    const run = () => {
      const text = getTooltipText(el);
      if (!text) return;
      // Suppress the native browser tooltip for this element while ours is
      // active — otherwise both can appear (title is restored on hide()).
      if (el.hasAttribute('title')) {
        el.dataset.tooltipNativeTitle = el.getAttribute('title') ?? '';
        el.removeAttribute('title');
      }
      activeElRef.current = el;
      el.setAttribute('aria-describedby', tooltipIdRef.current);
      setContent({ text, dir: detectDirection(el, text) });
    };
    if (immediate) run();
    else showTimerRef.current = window.setTimeout(run, SHOW_DELAY_MS);
  }, [clearTimers]);

  // Position after the tooltip has rendered (and its real size is known),
  // so it can be clamped inside the viewport and flipped when there isn't
  // room above the target — runs before paint, so there's no visible jump.
  useLayoutEffect(() => {
    const el = activeElRef.current;
    const tooltip = tooltipRef.current;
    if (!content || !el || !tooltip) return;

    const anchor = el.getBoundingClientRect();
    const size = tooltip.getBoundingClientRect();
    const fitsAbove = anchor.top - size.height - TARGET_GAP >= VIEWPORT_MARGIN;
    const top = fitsAbove
      ? anchor.top - size.height - TARGET_GAP
      : Math.min(anchor.bottom + TARGET_GAP, window.innerHeight - size.height - VIEWPORT_MARGIN);
    const rawLeft = anchor.left + anchor.width / 2 - size.width / 2;
    const maxLeft = window.innerWidth - size.width - VIEWPORT_MARGIN;
    const left = Math.min(Math.max(rawLeft, VIEWPORT_MARGIN), Math.max(maxLeft, VIEWPORT_MARGIN));

    setPosition({ top: Math.max(top, VIEWPORT_MARGIN), left });
  }, [content]);

  useEffect(() => {
    const handlePointerOver = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const target = findOverflowTarget(e.target as Element | null);
      if (!target) {
        if (activeElRef.current) scheduleHide(HIDE_DELAY_MS);
        return;
      }
      if (target === activeElRef.current) {
        clearTimers();
        return;
      }
      show(target, false);
    };

    const handlePointerOut = (e: PointerEvent) => {
      if (!activeElRef.current) return;
      const related = e.relatedTarget as Node | null;
      if (related && activeElRef.current.contains(related)) return;
      scheduleHide(HIDE_DELAY_MS);
    };

    const handleFocusIn = (e: FocusEvent) => {
      const target = findOverflowTarget(e.target as Element | null);
      if (target) show(target, true);
    };

    const handleFocusOut = () => scheduleHide(0);
    const handleDismiss = () => { if (activeElRef.current) hide(); };
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') hide(); };

    document.addEventListener('pointerover', handlePointerOver, { passive: true });
    document.addEventListener('pointerout', handlePointerOut, { passive: true });
    document.addEventListener('pointerdown', handleDismiss, { passive: true, capture: true });
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleDismiss, { passive: true, capture: true });
    window.addEventListener('resize', handleDismiss, { passive: true });

    return () => {
      document.removeEventListener('pointerover', handlePointerOver);
      document.removeEventListener('pointerout', handlePointerOut);
      document.removeEventListener('pointerdown', handleDismiss, true);
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleDismiss, true);
      window.removeEventListener('resize', handleDismiss);
      clearTimers();
    };
  }, [show, scheduleHide, hide, clearTimers]);

  if (!content) return null;

  return createPortal(
    <div
      ref={tooltipRef}
      id={tooltipIdRef.current}
      role="tooltip"
      dir={content.dir}
      className="got-tooltip"
      style={{ top: position.top, left: position.left }}
    >
      {content.text}
    </div>,
    document.body,
  );
}
