/**
 * Document Automation — Quick Insert.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ONE PANEL, FOUR LIBRARIES, ONE SEARCH BOX.
 * ══════════════════════════════════════════════════════════════════════════
 * The specification asks for a Variables Browser, an Assets panel, a Blocks panel, a
 * Template Library and a Quick Insert panel. Built as five separate surfaces they
 * would share a search box, a favourites mechanism, a recents list and a category
 * filter — four things implemented four times, which is four places for them to
 * disagree about what "favourite" means.
 *
 * So they are ONE panel with four tabs and a search that spans all of them. "Global
 * search across templates, blocks, variables, assets" is then not a separate feature
 * to build; it is what the search box already does when no tab is selected.
 *
 * ── FAVOURITES AND RECENTS ARE THE USER'S ────────────────────────────────
 * They live in localStorage (see `library/favourites`), not in the document and not in
 * the company settings. One person's habits must not become everyone's.
 *
 * ── INSERTION IS ALWAYS THROUGH A PURE COMMAND ───────────────────────────
 * Every action here calls back to the composer, which routes it through the same
 * `blockCommands` a keystroke uses. Nothing in this file writes to a document.
 */

import { useMemo, useState } from 'react';
import { Icon } from '../../explorer/ExplorerKit';
import {
  type VariableDescriptor,
  VARIABLE_CATEGORIES,
  VARIABLE_CATEGORY_ICONS,
  VARIABLE_CATEGORY_LABELS_AR,
  getAllVariables,
  isVariableAvailable,
  searchVariables,
} from '../../../letters/variables/variableCatalog';
import {
  type DesignAssetEntry,
  type DocumentLibrary,
  type LetterTemplateEntry,
  type ReusableBlockEntry,
  searchEntries,
} from '../../../letters/library/libraryTypes';
import {
  type FavouriteKind,
  getFavourites,
  getRecents,
  orderByPreference,
  toggleFavourite,
} from '../../../letters/library/favourites';
import { type BrandingAsset } from '../../../print-templates/branding/brandingAssets';
import { type ResizableRail } from './useResizableRail';
import RailResizeHandle from './RailResizeHandle';
import './insert-panel.css';

export type InsertTab = 'variables' | 'blocks' | 'templates' | 'assets';

const TABS: readonly { readonly id: InsertTab; readonly label: string; readonly icon: string }[] = [
  { id: 'variables', label: 'المتغيّرات', icon: 'data_object' },
  { id: 'blocks', label: 'المقاطع', icon: 'dashboard_customize' },
  { id: 'templates', label: 'القوالب', icon: 'lab_profile' },
  { id: 'assets', label: 'الأصول', icon: 'photo_library' },
];

export interface InsertPanelProps {
  readonly library: DocumentLibrary;
  /** The company's signatures and stamps, from the existing branding registry. */
  readonly signatures: readonly BrandingAsset[];
  readonly stamps: readonly BrandingAsset[];
  readonly readOnly: boolean;
  /** Whether a paragraph is focused — variables insert at the caret. */
  readonly hasCaret: boolean;
  readonly onInsertVariable: (name: string) => void;
  readonly onInsertBlock: (entry: ReusableBlockEntry) => void;
  readonly onApplyTemplate: (entry: LetterTemplateEntry) => void;
  readonly onInsertAsset: (imageUrl: string, alt: string) => void;
  readonly onSaveSelectionAsBlock: () => void;
  readonly onSaveDocumentAsTemplate: () => void;
  readonly onClose: () => void;
  readonly resize: ResizableRail;
}

export default function InsertPanel({
  library,
  signatures,
  stamps,
  readOnly,
  hasCaret,
  onInsertVariable,
  onInsertBlock,
  onApplyTemplate,
  onInsertAsset,
  onSaveSelectionAsBlock,
  onSaveDocumentAsTemplate,
  onClose,
  resize,
}: InsertPanelProps) {
  const [tab, setTab] = useState<InsertTab>('variables');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  /** Bumped on every favourite toggle so the ordering recomputes. localStorage is not
   *  reactive, so something has to tell React it changed. */
  const [favouriteTick, setFavouriteTick] = useState(0);

  const searching = query.trim().length > 0;

  const flip = (kind: FavouriteKind, id: string) => {
    toggleFavourite(kind, id);
    setFavouriteTick((tick) => tick + 1);
  };

  return (
    <aside
      className="ins-panel lc-rail-in"
      aria-label="لوحة الإدراج السريع"
      ref={resize.railRef}
      style={{ '--rail-w': `${resize.width}px` } as React.CSSProperties}
    >
      <RailResizeHandle
        handleRef={resize.handleRef}
        label="تغيير عرض لوحة الإدراج"
        edge="after"
        onPointerDown={resize.startDrag}
        onKeyDown={resize.onHandleKeyDown}
      />
      <div className="ins-head">
        <Icon name="add_circle" />
        <span className="ins-title">إدراج سريع</span>
        <button type="button" className="ins-close" onClick={onClose} aria-label="إغلاق لوحة الإدراج">
          <Icon name="close" />
        </button>
      </div>

      <label className="ins-search">
        <Icon name="search" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          placeholder="بحث في كل المكتبات"
          aria-label="بحث في المتغيّرات والمقاطع والقوالب والأصول"
        />
        {query && (
          <button type="button" onClick={() => setQuery('')} aria-label="مسح البحث">
            <Icon name="close" />
          </button>
        )}
      </label>

      {/* While searching the tabs are hidden and every library is shown at once —
          "global search across templates, blocks, variables, assets" is not a separate
          feature, it is what this box already does. */}
      {!searching && (
        <div className="ins-tabs" role="tablist" aria-label="نوع المحتوى">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={tab === entry.id}
              className={`ins-tab${tab === entry.id ? ' is-on' : ''}`}
              onClick={() => {
                setTab(entry.id);
                setCategory(null);
              }}
            >
              <Icon name={entry.icon} />
              {entry.label}
            </button>
          ))}
        </div>
      )}

      <div className="ins-body">
        {searching ? (
          <SearchResults
            query={query}
            library={library}
            readOnly={readOnly}
            hasCaret={hasCaret}
            onInsertVariable={onInsertVariable}
            onInsertBlock={onInsertBlock}
            onApplyTemplate={onApplyTemplate}
            onInsertAsset={onInsertAsset}
          />
        ) : tab === 'variables' ? (
          <VariablesTab
            category={category}
            onCategory={setCategory}
            readOnly={readOnly}
            hasCaret={hasCaret}
            favouriteTick={favouriteTick}
            onFavourite={(id) => flip('variable', id)}
            onInsert={onInsertVariable}
          />
        ) : tab === 'blocks' ? (
          <BlocksTab
            entries={library.blocks}
            readOnly={readOnly}
            favouriteTick={favouriteTick}
            onFavourite={(id) => flip('block', id)}
            onInsert={onInsertBlock}
            onSaveSelection={onSaveSelectionAsBlock}
          />
        ) : tab === 'templates' ? (
          <TemplatesTab
            entries={library.templates}
            readOnly={readOnly}
            favouriteTick={favouriteTick}
            onFavourite={(id) => flip('template', id)}
            onApply={onApplyTemplate}
            onSaveDocument={onSaveDocumentAsTemplate}
          />
        ) : (
          <AssetsTab
            entries={library.assets}
            signatures={signatures}
            stamps={stamps}
            readOnly={readOnly}
            favouriteTick={favouriteTick}
            onFavourite={flip}
            onInsert={onInsertAsset}
          />
        )}
      </div>
    </aside>
  );
}

/* ── Variables ──────────────────────────────────────────────────────────── */

function VariablesTab({
  category,
  onCategory,
  readOnly,
  hasCaret,
  favouriteTick,
  onFavourite,
  onInsert,
}: {
  category: string | null;
  onCategory: (category: string | null) => void;
  readOnly: boolean;
  hasCaret: boolean;
  favouriteTick: number;
  onFavourite: (id: string) => void;
  onInsert: (name: string) => void;
}) {
  const ordered = useMemo(() => {
    const all = category ? getAllVariables().filter((v) => v.category === category) : getAllVariables();
    return orderByPreference(all, (v) => v.name, getFavourites('variable'), getRecents('variable'));
    // `favouriteTick` is the dependency that matters — localStorage is not reactive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, favouriteTick]);

  return (
    <>
      <div className="ins-chips" role="group" aria-label="تصنيفات المتغيّرات">
        <Chip label="الكل" on={category === null} onClick={() => onCategory(null)} />
        {VARIABLE_CATEGORIES.map((entry) => (
          <Chip
            key={entry}
            label={VARIABLE_CATEGORY_LABELS_AR[entry]}
            icon={VARIABLE_CATEGORY_ICONS[entry]}
            on={category === entry}
            onClick={() => onCategory(entry)}
          />
        ))}
      </div>

      {!hasCaret && !readOnly && (
        <p className="ins-hint">
          <Icon name="info" />
          ضع المؤشّر داخل فقرة أولًا ليُدرَج المتغيّر في مكانه.
        </p>
      )}

      <ul className="ins-list">
        {ordered.map((variable) => (
          <VariableRow
            key={variable.name}
            variable={variable}
            disabled={readOnly || !hasCaret || !isVariableAvailable(variable)}
            favourite={getFavourites('variable').includes(variable.name)}
            onFavourite={() => onFavourite(variable.name)}
            onInsert={() => onInsert(variable.name)}
          />
        ))}
      </ul>
    </>
  );
}

function VariableRow({
  variable,
  disabled,
  favourite,
  onFavourite,
  onInsert,
}: {
  variable: VariableDescriptor;
  disabled: boolean;
  favourite: boolean;
  onFavourite: () => void;
  onInsert: () => void;
}) {
  const unavailable = !isVariableAvailable(variable);

  return (
    <li className={`ins-row${unavailable ? ' is-unavailable' : ''}`}>
      <button
        type="button"
        className="ins-row-main"
        onClick={onInsert}
        onDoubleClick={onInsert}
        disabled={disabled}
        // A variable with no data source explains ITSELF in the tooltip — an author
        // must never be left wondering why a row is greyed.
        title={unavailable ? variable.unavailableReasonAr : variable.descriptionAr}
      >
        <span className="ins-token" dir="ltr">{`{{${variable.name}}}`}</span>
        <span className="ins-row-text">
          <span className="ins-row-label">{variable.labelAr}</span>
          <span className="ins-row-sub">
            {unavailable ? 'غير متاح في هذا النظام' : variable.sampleAr}
          </span>
        </span>
      </button>
      <FavouriteToggle on={favourite} onClick={onFavourite} />
    </li>
  );
}

/* ── Blocks ─────────────────────────────────────────────────────────────── */

function BlocksTab({
  entries,
  readOnly,
  favouriteTick,
  onFavourite,
  onInsert,
  onSaveSelection,
}: {
  entries: readonly ReusableBlockEntry[];
  readOnly: boolean;
  favouriteTick: number;
  onFavourite: (id: string) => void;
  onInsert: (entry: ReusableBlockEntry) => void;
  onSaveSelection: () => void;
}) {
  const ordered = useMemo(
    () => orderByPreference(entries, (e) => e.id, getFavourites('block'), getRecents('block')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, favouriteTick],
  );

  return (
    <>
      <button type="button" className="ins-action" onClick={onSaveSelection} disabled={readOnly}>
        <Icon name="bookmark_add" />
        حفظ الفقرة الحالية كمقطع
      </button>

      {ordered.length === 0 ? (
        <Empty message="لا مقاطع محفوظة بعد. احفظ فقرة تستخدمها كثيرًا لتظهر هنا." />
      ) : (
        <ul className="ins-list">
          {ordered.map((entry) => (
            <li key={entry.id} className="ins-row">
              <button
                type="button"
                className="ins-row-main"
                onClick={() => onInsert(entry)}
                onDoubleClick={() => onInsert(entry)}
                disabled={readOnly}
                title={entry.description || entry.preview}
              >
                <Icon name="dashboard_customize" />
                <span className="ins-row-text">
                  <span className="ins-row-label">{entry.name}</span>
                  <span className="ins-row-sub">{entry.preview || entry.category}</span>
                </span>
              </button>
              <FavouriteToggle
                on={getFavourites('block').includes(entry.id)}
                onClick={() => onFavourite(entry.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/* ── Templates ──────────────────────────────────────────────────────────── */

function TemplatesTab({
  entries,
  readOnly,
  favouriteTick,
  onFavourite,
  onApply,
  onSaveDocument,
}: {
  entries: readonly LetterTemplateEntry[];
  readOnly: boolean;
  favouriteTick: number;
  onFavourite: (id: string) => void;
  onApply: (entry: LetterTemplateEntry) => void;
  onSaveDocument: () => void;
}) {
  const ordered = useMemo(
    () => orderByPreference(entries, (e) => e.id, getFavourites('template'), getRecents('template')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, favouriteTick],
  );

  return (
    <>
      <button type="button" className="ins-action" onClick={onSaveDocument} disabled={readOnly}>
        <Icon name="save_as" />
        حفظ هذا الخطاب كقالب
      </button>

      {ordered.length === 0 ? (
        <Empty message="لا قوالب محفوظة بعد. احفظ خطابًا مكتملًا ليصبح نقطة بداية." />
      ) : (
        <ul className="ins-list">
          {ordered.map((entry) => (
            <li key={entry.id} className="ins-row">
              <button
                type="button"
                className="ins-row-main"
                onClick={() => onApply(entry)}
                disabled={readOnly}
                // Applying a template REPLACES the document, so the tooltip says so —
                // this is the one action in the panel that discards work.
                title={`${entry.description || entry.name} — يستبدل محتوى الخطاب الحالي`}
              >
                <Icon name={entry.icon || 'lab_profile'} />
                <span className="ins-row-text">
                  <span className="ins-row-label">{entry.name}</span>
                  <span className="ins-row-sub">{entry.category || 'بلا تصنيف'}</span>
                </span>
              </button>
              <FavouriteToggle
                on={getFavourites('template').includes(entry.id)}
                onClick={() => onFavourite(entry.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/* ── Assets ─────────────────────────────────────────────────────────────── */

function AssetsTab({
  entries,
  signatures,
  stamps,
  readOnly,
  favouriteTick,
  onFavourite,
  onInsert,
}: {
  entries: readonly DesignAssetEntry[];
  signatures: readonly BrandingAsset[];
  stamps: readonly BrandingAsset[];
  readOnly: boolean;
  favouriteTick: number;
  onFavourite: (kind: FavouriteKind, id: string) => void;
  onInsert: (imageUrl: string, alt: string) => void;
}) {
  /**
   * Signatures and stamps come from the EXISTING branding registry and are stored
   * nowhere by this pack — INV-12 forbids a second signature-management system. What
   * is added here is a browser over them.
   */
  const branding = useMemo(
    () => [
      ...signatures.filter((a) => a.show && a.imageUrl).map((a) => ({ ...a, kind: 'signature' as const })),
      ...stamps.filter((a) => a.show && a.imageUrl).map((a) => ({ ...a, kind: 'stamp' as const })),
    ],
    [signatures, stamps],
  );

  const ordered = useMemo(
    () => orderByPreference(entries, (e) => e.id, getFavourites('asset'), getRecents('asset')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, favouriteTick],
  );

  return (
    <>
      {branding.length > 0 && (
        <>
          <h4 className="ins-group-title">التواقيع والأختام</h4>
          <div className="ins-grid">
            {branding.map((asset) => (
              <button
                key={`${asset.kind}-${asset.id}`}
                type="button"
                className="ins-tile"
                onClick={() => onInsert(asset.imageUrl!, asset.name)}
                disabled={readOnly}
                title={`${asset.name} — ${asset.kind === 'signature' ? 'توقيع' : 'ختم'}`}
              >
                <img src={asset.imageUrl!} alt={asset.name} />
                <span>{asset.name}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <h4 className="ins-group-title">أصول التصميم</h4>
      {ordered.length === 0 ? (
        <Empty message="لا أصول محفوظة بعد." />
      ) : (
        <div className="ins-grid">
          {ordered.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className="ins-tile"
              onClick={() => onInsert(entry.imageUrl, entry.alt || entry.name)}
              onDoubleClick={() => onInsert(entry.imageUrl, entry.alt || entry.name)}
              disabled={readOnly}
              title={entry.description || entry.name}
            >
              <img src={entry.imageUrl} alt={entry.alt || entry.name} />
              <span>{entry.name}</span>
              <FavouriteToggle
                on={getFavourites('asset').includes(entry.id)}
                onClick={() => onFavourite('asset', entry.id)}
              />
            </button>
          ))}
        </div>
      )}
    </>
  );
}

/* ── Global search ──────────────────────────────────────────────────────── */

/**
 * Every library at once.
 *
 * Sections are omitted entirely when they have no hits, so a search for a variable
 * name does not leave three empty headings on screen explaining that templates and
 * assets also exist.
 */
function SearchResults({
  query,
  library,
  readOnly,
  hasCaret,
  onInsertVariable,
  onInsertBlock,
  onApplyTemplate,
  onInsertAsset,
}: {
  query: string;
  library: DocumentLibrary;
  readOnly: boolean;
  hasCaret: boolean;
  onInsertVariable: (name: string) => void;
  onInsertBlock: (entry: ReusableBlockEntry) => void;
  onApplyTemplate: (entry: LetterTemplateEntry) => void;
  onInsertAsset: (imageUrl: string, alt: string) => void;
}) {
  const variables = searchVariables(query);
  const blocks = searchEntries(library.blocks, query);
  const templates = searchEntries(library.templates, query);
  const assets = searchEntries(library.assets, query);

  const total = variables.length + blocks.length + templates.length + assets.length;
  if (total === 0) return <Empty message={`لا نتائج لـ «${query}»`} />;

  return (
    <>
      {variables.length > 0 && (
        <>
          <h4 className="ins-group-title">المتغيّرات</h4>
          <ul className="ins-list">
            {variables.map((variable) => (
              <VariableRow
                key={variable.name}
                variable={variable}
                disabled={readOnly || !hasCaret || !isVariableAvailable(variable)}
                favourite={getFavourites('variable').includes(variable.name)}
                onFavourite={() => toggleFavourite('variable', variable.name)}
                onInsert={() => onInsertVariable(variable.name)}
              />
            ))}
          </ul>
        </>
      )}

      {blocks.length > 0 && (
        <>
          <h4 className="ins-group-title">المقاطع</h4>
          <ul className="ins-list">
            {blocks.map((entry) => (
              <li key={entry.id} className="ins-row">
                <button type="button" className="ins-row-main" onClick={() => onInsertBlock(entry)} disabled={readOnly}>
                  <Icon name="dashboard_customize" />
                  <span className="ins-row-text">
                    <span className="ins-row-label">{entry.name}</span>
                    <span className="ins-row-sub">{entry.preview}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {templates.length > 0 && (
        <>
          <h4 className="ins-group-title">القوالب</h4>
          <ul className="ins-list">
            {templates.map((entry) => (
              <li key={entry.id} className="ins-row">
                <button type="button" className="ins-row-main" onClick={() => onApplyTemplate(entry)} disabled={readOnly}>
                  <Icon name={entry.icon || 'lab_profile'} />
                  <span className="ins-row-text">
                    <span className="ins-row-label">{entry.name}</span>
                    <span className="ins-row-sub">{entry.category || 'بلا تصنيف'}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {assets.length > 0 && (
        <>
          <h4 className="ins-group-title">الأصول</h4>
          <div className="ins-grid">
            {assets.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className="ins-tile"
                onClick={() => onInsertAsset(entry.imageUrl, entry.alt || entry.name)}
                disabled={readOnly}
              >
                <img src={entry.imageUrl} alt={entry.alt || entry.name} />
                <span>{entry.name}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}

/* ── Small parts ────────────────────────────────────────────────────────── */

function Chip({ label, icon, on, onClick }: { label: string; icon?: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`ins-chip${on ? ' is-on' : ''}`} onClick={onClick} aria-pressed={on}>
      {icon && <Icon name={icon} />}
      {label}
    </button>
  );
}

function FavouriteToggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`ins-fav${on ? ' is-on' : ''}`}
      onClick={(e) => {
        // Stopped so a favourite click inside a tile does not also insert the asset.
        e.stopPropagation();
        onClick();
      }}
      aria-pressed={on}
      title={on ? 'إزالة من المفضّلة' : 'إضافة إلى المفضّلة'}
      aria-label="المفضّلة"
    >
      <Icon name={on ? 'star' : 'star_border'} />
    </button>
  );
}

function Empty({ message }: { message: string }) {
  return (
    <p className="ins-empty">
      <Icon name="inbox" />
      {message}
    </p>
  );
}
