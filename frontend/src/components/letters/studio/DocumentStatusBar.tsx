/**
 * Document Studio — the status bar.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  READ-ONLY, EXCEPT FOR ZOOM. IT REPORTS; IT DOES NOT COMMAND.
 * ══════════════════════════════════════════════════════════════════════════
 * Everything here is derived from state the studio already holds, so the bar can never
 * disagree with the paper above it. Zoom is the single exception, and it is here rather
 * than in the toolbar for the same reason every document editor puts it here: it is a
 * property of LOOKING at the document, and it belongs beside the page indicator that is
 * also about looking rather than changing.
 *
 * ── WHY THIS IS THE ONLY PLACE THE COUNTERS LIVE ─────────────────────────
 * Word count, character count and reading time are recomputed whenever the document
 * changes. Putting them in the toolbar would have re-rendered the toolbar on every
 * keystroke; here they re-render a strip of text that carries no interactive state and
 * costs nothing to repaint.
 *
 * The caret readings come from `useDocumentSelection`, which throttles to one update
 * per frame — so dragging a selection across a long paragraph updates this bar at the
 * display's refresh rate rather than at the mouse's report rate.
 */

import { Icon } from '../../explorer/ExplorerKit';
import { type CaretStats, type DocumentStats, LANGUAGE_LABEL_AR, type DocumentLanguage } from '../../../letters/editor/documentStats';
import { type ZoomMode } from './zoom';
import { ZOOM_PRESETS } from './zoom';
import './document-status-bar.css';

/**
 * What the status bar reports about the design selection.
 *
 * Supplied as one optional object rather than as six props: in Compose mode there is
 * no selection at all, and `null` says that once instead of six times.
 */
export interface DesignStatus {
  readonly selectionCount: number;
  /** Name of the single selected object, or `null` for none or several. */
  readonly objectName: string | null;
  /** The selection's bounds, in millimetres. `null` when nothing is selected. */
  readonly xMm: number | null;
  readonly yMm: number | null;
  readonly widthMm: number | null;
  readonly heightMm: number | null;
  readonly snapEnabled: boolean;
  readonly gridVisible: boolean;
}

export interface DocumentStatusBarProps {
  readonly currentPage: number;
  readonly pageCount: number;
  readonly stats: DocumentStats;
  readonly caret: CaretStats;
  readonly language: DocumentLanguage;
  readonly readOnly: boolean;
  readonly zoom: number;
  readonly zoomMode: ZoomMode;
  readonly onZoomPreset: (zoom: number) => void;
  readonly onFitWidth: () => void;
  readonly onFitPage: () => void;
  /** Opens the keyboard-shortcut reference. */
  readonly onShowShortcuts: () => void;
  /** Design-mode readout. `null` in Compose mode. */
  readonly design?: DesignStatus | null;
}

/** Arabic-Indic digits are not used: the ERP displays Western digits throughout. */
function n(value: number): string {
  return value.toLocaleString('en-US');
}

/** One decimal — finer than any printer resolves, and stable enough not to flicker
 *  while a drag is in progress. */
function round(value: number): number {
  return Math.round(value * 10) / 10;
}

export default function DocumentStatusBar({
  currentPage,
  pageCount,
  stats,
  caret,
  language,
  readOnly,
  zoom,
  zoomMode,
  onZoomPreset,
  onFitWidth,
  onFitPage,
  onShowShortcuts,
  design,
}: DocumentStatusBarProps) {
  const hasSelection = caret.selectedCharacters > 0;
  const designing = design != null;

  return (
    <div className="dsb-bar" role="status" aria-live="off" aria-label="شريط الحالة">
      {/* ── Position ────────────────────────────────────────────────────── */}
      <span className="dsb-item" title="الصفحة الحالية من إجمالي الصفحات">
        <Icon name="description" />
        صفحة {n(currentPage + 1)} من {n(pageCount)}
      </span>

      <span className="dsb-item dsb-item--muted" title="موضع المؤشّر داخل الفقرة الحالية">
        سطر {n(caret.line)}، عمود {n(caret.column)}
      </span>

      <span className="dsb-sep" />

      {/* ── Size ────────────────────────────────────────────────────────── */}
      <span className="dsb-item" title="عدد الكلمات في المستند كاملًا، شاملًا الموضوع والجهة">
        <Icon name="match_word" />
        {n(stats.words)} كلمة
      </span>

      <span className="dsb-item dsb-item--muted" title="عدد الأحرف شاملًا المسافات — وبين قوسين بدونها">
        {n(stats.characters)} حرف ({n(stats.charactersNoSpaces)} بلا مسافات)
      </span>

      {/* Reading time is hidden for an empty document rather than shown as "0 دقيقة",
          which reads as a measurement rather than as an absence. */}
      {stats.readingMinutes > 0 && (
        <span className="dsb-item dsb-item--muted" title="زمن القراءة التقديري بمعدّل ١٨٠ كلمة في الدقيقة">
          <Icon name="schedule" />
          ~{n(stats.readingMinutes)} دقيقة قراءة
        </span>
      )}

      {/* The selection readout APPEARS only when something is selected. A permanent
          "0 محدّد" is noise that trains the eye to skip the whole region. */}
      {hasSelection && !designing && (
        <>
          <span className="dsb-sep" />
          <span className="dsb-item dsb-item--selection" title="حجم التحديد الحالي">
            <Icon name="select_all" />
            محدّد: {n(caret.selectedWords)} كلمة · {n(caret.selectedCharacters)} حرف
          </span>
        </>
      )}

      {/* ── Design readout ───────────────────────────────────────────────
          Replaces the text-selection readout rather than joining it: in Design mode
          the caret is not what the author is manipulating, and showing both would
          make the bar report two different "selections" at once. */}
      {designing && design.selectionCount > 0 && (
        <>
          <span className="dsb-sep" />
          <span className="dsb-item dsb-item--selection" title="العنصر المحدّد">
            <Icon name="select_all" />
            {design.objectName ?? `${n(design.selectionCount)} عناصر`}
          </span>
          {design.xMm !== null && design.yMm !== null && (
            <span className="dsb-item dsb-item--muted" title="موضع التحديد من الزاوية العليا للورقة">
              {round(design.xMm)}، {round(design.yMm)} مم
            </span>
          )}
          {design.widthMm !== null && design.heightMm !== null && (
            <span className="dsb-item dsb-item--muted" title="أبعاد التحديد">
              {round(design.widthMm)} × {round(design.heightMm)} مم
            </span>
          )}
        </>
      )}

      <span className="dsb-spacer" />

      {designing && (
        <>
          {/* Snap and grid state, because both silently change what a drag does and an
              author who has forgotten one is left wondering why nothing lines up. */}
          <span
            className={`dsb-item${design.snapEnabled ? '' : ' dsb-item--muted'}`}
            title={design.snapEnabled ? 'المحاذاة الذكية مفعّلة' : 'المحاذاة الذكية متوقّفة'}
          >
            <Icon name="grid_goldenratio" />
            {design.snapEnabled ? 'محاذاة ذكية' : 'بلا محاذاة'}
          </span>
          <span
            className={`dsb-item${design.gridVisible ? '' : ' dsb-item--muted'}`}
            title={design.gridVisible ? 'الشبكة ظاهرة' : 'الشبكة مخفية'}
          >
            <Icon name="grid_4x4" />
            {design.gridVisible ? 'شبكة' : 'بلا شبكة'}
          </span>
          <span className="dsb-sep" />
        </>
      )}

      {/* ── Document facts ──────────────────────────────────────────────── */}
      <span className="dsb-item dsb-item--muted" title="لغة المستند كما تُستنتَج من نصّه">
        <Icon name="language" />
        {LANGUAGE_LABEL_AR[language]}
      </span>

      <span className={`dsb-mode${readOnly ? ' is-readonly' : ''}`} title={readOnly ? 'الخطاب مسجَّل ومحتواه مُجمَّد — للقراءة فقط' : 'وضع التحرير — التغييرات تُحفَظ تلقائيًا'}>
        <Icon name={readOnly ? 'lock' : 'edit'} />
        {readOnly ? 'للقراءة فقط' : 'تحرير'}
      </span>

      <span className="dsb-sep" />

      {/* ── Zoom ────────────────────────────────────────────────────────── */}
      <div className="dsb-zoom">
        <button
          type="button"
          className="dsb-zoom-btn"
          onClick={() => onZoomPreset(zoom - 0.25)}
          disabled={zoom <= 0.25}
          title="تصغير (Ctrl+-)"
          aria-label="تصغير"
        >
          <Icon name="remove" />
        </button>

        <select
          className="dsb-zoom-select"
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
          {/* A manual zoom that is not a rung — reached with Ctrl+wheel — is shown as
              its own entry so the control never displays a value it is not set to. */}
          {zoomMode === 'manual' && !ZOOM_PRESETS.includes(zoom as never) && (
            <option value={String(zoom)}>{Math.round(zoom * 100)}%</option>
          )}
          {ZOOM_PRESETS.map((preset) => (
            <option key={preset} value={String(preset)}>{Math.round(preset * 100)}%</option>
          ))}
          <option value="fitWidth">ملاءمة العرض</option>
          <option value="fitPage">ملاءمة الصفحة</option>
        </select>

        <button
          type="button"
          className="dsb-zoom-btn"
          onClick={() => onZoomPreset(zoom + 0.25)}
          disabled={zoom >= 2}
          title="تكبير (Ctrl++)"
          aria-label="تكبير"
        >
          <Icon name="add" />
        </button>
      </div>

      <button
        type="button"
        className="dsb-zoom-btn"
        onClick={onShowShortcuts}
        title="اختصارات لوحة المفاتيح"
        aria-label="اختصارات لوحة المفاتيح"
      >
        <Icon name="keyboard" />
      </button>
    </div>
  );
}
