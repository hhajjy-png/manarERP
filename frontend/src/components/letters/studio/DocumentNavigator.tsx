/**
 * Document Studio — the navigation panel.
 *
 * Three ways of finding a place in the document, in one dockable rail: a MINI MAP of
 * the sheets, an OUTLINE derived from the document's own structure, and a QUICK JUMP
 * to a page by number.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE MINI MAP DRAWS THE LAYOUT. IT DOES NOT RENDER THE DOCUMENT.
 * ══════════════════════════════════════════════════════════════════════════
 * Each thumbnail is a proportional box with a band for each item the paginator placed
 * on that sheet, sized by that item's MEASURED height. No text is rendered, no
 * component is re-mounted at 6% scale, and no second measurement pass exists.
 *
 * That is a deliberate refusal of the obvious implementation. A real thumbnail means
 * mounting the whole page tree again per sheet — every textarea, every font, every
 * barcode — which on a ten-page letter is a tenfold increase in DOM for a panel nobody
 * reads word by word. What an author actually uses a mini map for is SHAPE: which page
 * is dense, where the signature block landed, which sheet is nearly empty. Bands
 * answer all three, at the cost of a few divs.
 *
 * ── THE OUTLINE IS DERIVED, NOT STORED ───────────────────────────────────
 * Built by `documentOutline.buildDocumentOutline` from the template's sections plus the
 * document's heading blocks. See that module for why a heading is a block KIND rather
 * than a font size, and why an outline inferred from typography would be wrong.
 */

import { Icon } from '../../explorer/ExplorerKit';
import { type OutlineEntry } from '../../../letters/editor/documentOutline';
import { type PaginationResult } from '../../../letters/pagination/paginate';
import { type PageGeometry, pageSizeOf } from '../../../letters/registry/geometryRegistry';
import './document-navigator.css';

/** Which panel the rail is showing. */
export type NavigatorTab = 'pages' | 'outline';

export interface DocumentNavigatorProps {
  readonly tab: NavigatorTab;
  readonly onTabChange: (tab: NavigatorTab) => void;
  readonly currentPage: number;
  readonly pageCount: number;
  readonly pagination: PaginationResult;
  readonly geometry: PageGeometry;
  readonly itemHeightsMm: Readonly<Record<string, number>>;
  readonly outline: readonly OutlineEntry[];
  readonly onGoToPage: (pageIndex: number) => void;
  readonly onGoToOutlineEntry: (entry: OutlineEntry) => void;
  readonly onClose: () => void;
}

/** Thumbnail width in pixels. The height follows from the page's real aspect ratio. */
const THUMB_WIDTH_PX = 108;

export default function DocumentNavigator({
  tab,
  onTabChange,
  currentPage,
  pageCount,
  pagination,
  geometry,
  itemHeightsMm,
  outline,
  onGoToPage,
  onGoToOutlineEntry,
  onClose,
}: DocumentNavigatorProps) {
  const page = pageSizeOf(geometry);
  const thumbHeight = Math.round(THUMB_WIDTH_PX * (page.heightMm / page.widthMm));

  return (
    <aside className="dnv-rail" aria-label="لوحة التنقّل">
      <div className="dnv-head">
        <div className="dnv-tabs" role="tablist" aria-label="طرق التنقّل">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'pages'}
            className={`dnv-tab${tab === 'pages' ? ' is-on' : ''}`}
            onClick={() => onTabChange('pages')}
          >
            <Icon name="auto_stories" />
            الصفحات
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'outline'}
            className={`dnv-tab${tab === 'outline' ? ' is-on' : ''}`}
            onClick={() => onTabChange('outline')}
          >
            <Icon name="format_list_bulleted" />
            المخطّط
          </button>
        </div>
        <button type="button" className="dnv-close" onClick={onClose} title="إخفاء لوحة التنقّل" aria-label="إخفاء لوحة التنقّل">
          <Icon name="close" />
        </button>
      </div>

      {/* ── Quick jump ────────────────────────────────────────────────────
          A number field rather than a dropdown, so it stays usable at any page count.
          Displayed one-based; the model is zero-based. */}
      <label className="dnv-jump">
        <span>الانتقال إلى</span>
        <input
          type="number"
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
        <span className="dnv-jump-of">/ {pageCount}</span>
      </label>

      <div className="dnv-body">
        {tab === 'pages' ? (
          <ul className="dnv-thumbs" role="tabpanel" aria-label="مصغّرات الصفحات">
            {Array.from({ length: pageCount }, (_, pageIndex) => (
              <li key={pageIndex}>
                <button
                  type="button"
                  className={`dnv-thumb${pageIndex === currentPage ? ' is-current' : ''}`}
                  onClick={() => onGoToPage(pageIndex)}
                  aria-current={pageIndex === currentPage ? 'page' : undefined}
                  aria-label={`الصفحة ${pageIndex + 1}`}
                  title={`الصفحة ${pageIndex + 1}`}
                >
                  <span
                    className="dnv-sheet"
                    style={{ width: `${THUMB_WIDTH_PX}px`, height: `${thumbHeight}px` }}
                    aria-hidden="true"
                  >
                    {(pagination.pages[pageIndex]?.itemIds ?? []).map((itemId) => (
                      <span
                        key={itemId}
                        className={`dnv-band dnv-band--${bandKind(itemId)}`}
                        // Height as a PERCENTAGE of the sheet, from the same measured
                        // millimetres the layout used — so a dense page looks dense.
                        style={{ height: `${percentOfPage(itemHeightsMm[itemId] ?? 0, page.heightMm)}%` }}
                      />
                    ))}
                  </span>
                  <span className="dnv-thumb-label">{pageIndex + 1}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="dnv-outline" role="tabpanel" aria-label="مخطّط المستند">
            {outline.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  className={`dnv-entry dnv-entry--d${entry.depth}${entry.empty ? ' is-empty' : ''}`}
                  onClick={() => onGoToOutlineEntry(entry)}
                  title={entry.preview ?? entry.label}
                >
                  <Icon name={entry.kind === 'heading' ? 'subdirectory_arrow_left' : 'label'} />
                  <span className="dnv-entry-text">
                    <span className="dnv-entry-label">{entry.label}</span>
                    {entry.preview && <span className="dnv-entry-preview">{entry.preview}</span>}
                  </span>
                  {entry.pageIndex !== null && (
                    <span className="dnv-entry-page">{entry.pageIndex + 1}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

/**
 * Which visual band an item gets.
 *
 * The three fixed head sections, the two fixed foot sections, and everything else —
 * which is content. Derived from the item id because that is what the paginator's page
 * lists hold, and adding a parallel kind map would be a second thing to keep in sync.
 */
function bandKind(itemId: string): string {
  switch (itemId) {
    case 'date':
    case 'recipient':
    case 'subject':
      return 'head';
    case 'signature':
      return 'signature';
    case 'barcode':
      return 'barcode';
    default:
      return 'content';
  }
}

/**
 * An item's share of a sheet, as a percentage.
 *
 * Floored at 1.5% so a one-line paragraph is still visible as a band rather than
 * collapsing to nothing — the map's job is to show that something is there.
 */
function percentOfPage(heightMm: number, pageHeightMm: number): number {
  if (pageHeightMm <= 0) return 0;
  return Math.max(1.5, Math.min(100, (heightMm / pageHeightMm) * 100));
}
