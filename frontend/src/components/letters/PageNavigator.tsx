/**
 * Letter Engine — page navigation and zoom controls.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ZOOM SCALES THE VIEWPORT. IT NEVER TOUCHES A DOCUMENT MEASUREMENT.
 * ══════════════════════════════════════════════════════════════════════════
 * Every preset here is a number handed to a `transform: scale()`. Fit Width and Fit
 * Page are computed from the VIEWPORT's size against the page's millimetre size — the
 * page is the constant and the container is the variable, never the other way round.
 */

import { Icon } from '../explorer/ExplorerKit';
import './page-navigator.css';

/** The fixed zoom ladder, plus the two fitted modes. */
export const ZOOM_PRESETS = [0.5, 0.75, 1, 1.25, 1.5] as const;

export type ZoomMode = 'manual' | 'fitWidth' | 'fitPage';

export interface PageNavigatorProps {
  currentPage: number;
  pageCount: number;
  onGoToPage: (pageIndex: number) => void;
  zoom: number;
  zoomMode: ZoomMode;
  onZoomPreset: (zoom: number) => void;
  onFitWidth: () => void;
  onFitPage: () => void;
}

export default function PageNavigator({
  currentPage,
  pageCount,
  onGoToPage,
  zoom,
  zoomMode,
  onZoomPreset,
  onFitWidth,
  onFitPage,
}: PageNavigatorProps) {
  return (
    <div className="pn-bar" role="group" aria-label="التنقّل بين الصفحات والتكبير">
      <div className="pn-pages">
        <button
          type="button"
          className="pn-btn"
          onClick={() => onGoToPage(currentPage - 1)}
          disabled={currentPage <= 0}
          title="الصفحة السابقة"
          aria-label="الصفحة السابقة"
        >
          <Icon name="keyboard_arrow_up" />
        </button>

        <span className="pn-indicator">
          {/* Go-to-page: a number input rather than a dropdown, so it stays usable at
              any page count. Displayed one-based; the model is zero-based. */}
          <input
            type="number"
            className="pn-page-input"
            min={1}
            max={pageCount}
            value={currentPage + 1}
            onChange={(e) => {
              const requested = Number(e.target.value);
              if (!Number.isFinite(requested)) return;
              onGoToPage(Math.min(pageCount, Math.max(1, requested)) - 1);
            }}
            aria-label="الانتقال إلى صفحة"
          />
          <span className="pn-of">من {pageCount}</span>
        </span>

        <button
          type="button"
          className="pn-btn"
          onClick={() => onGoToPage(currentPage + 1)}
          disabled={currentPage >= pageCount - 1}
          title="الصفحة التالية"
          aria-label="الصفحة التالية"
        >
          <Icon name="keyboard_arrow_down" />
        </button>
      </div>

      <span className="pn-sep" />

      <div className="pn-zoom">
        <select
          className="pn-select"
          value={zoomMode === 'manual' ? String(zoom) : zoomMode}
          onChange={(e) => {
            const value = e.target.value;
            if (value === 'fitWidth') onFitWidth();
            else if (value === 'fitPage') onFitPage();
            else onZoomPreset(Number(value));
          }}
          aria-label="التكبير"
          title="التكبير"
        >
          {ZOOM_PRESETS.map((preset) => (
            <option key={preset} value={String(preset)}>{Math.round(preset * 100)}%</option>
          ))}
          <option value="fitWidth">ملاءمة العرض</option>
          <option value="fitPage">ملاءمة الصفحة</option>
        </select>
      </div>
    </div>
  );
}

/**
 * Fit factors.
 *
 * Pure arithmetic over the viewport's pixel size, the page's millimetre size, and the
 * measured pixels-per-millimetre — so "fit" means the page really fills the box rather
 * than a guess based on an assumed screen density.
 *
 * `gutterPx` is the chrome around the sheet (rulers, margins) that must also fit.
 */
export function fitWidthZoom(
  viewportWidthPx: number,
  pageWidthMm: number,
  pxPerMm: number,
  gutterPx: number,
): number {
  const usable = Math.max(0, viewportWidthPx - gutterPx);
  const naturalPx = pageWidthMm * pxPerMm;
  if (naturalPx <= 0) return 1;
  return clampZoom(usable / naturalPx);
}

export function fitPageZoom(
  viewportWidthPx: number,
  viewportHeightPx: number,
  pageWidthMm: number,
  pageHeightMm: number,
  pxPerMm: number,
  gutterPx: number,
): number {
  const byWidth = fitWidthZoom(viewportWidthPx, pageWidthMm, pxPerMm, gutterPx);
  const usableHeight = Math.max(0, viewportHeightPx - gutterPx);
  const naturalHeightPx = pageHeightMm * pxPerMm;
  if (naturalHeightPx <= 0) return byWidth;
  return clampZoom(Math.min(byWidth, usableHeight / naturalHeightPx));
}

/** Keeps a fitted zoom inside the same range the presets span. */
export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom) || zoom <= 0) return 1;
  return Math.min(2, Math.max(0.25, Math.round(zoom * 100) / 100));
}
