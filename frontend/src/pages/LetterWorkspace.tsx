/**
 * Letter Engine — the Workspace.
 *
 * The landing surface of the whole engine and its ONLY entry point: reached from
 * Administrative Forms → «خطاب رسمي», never from the sidebar and never by opening a
 * blank editor. Creating a draft lands the user back here with the new row selected,
 * because a list is a place you can orient yourself and an empty editor is not.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THERE IS NO EDITOR IN THIS PACK.
 * ══════════════════════════════════════════════════════════════════════════
 * "Open" reveals a read-only details panel. No content is rendered, no block model is
 * loaded, nothing is editable. The editor, printing, preview, PDF, the barcode and the
 * signature all belong to later packs, and this file must not acquire any of them.
 *
 * ── EVERY QUERY IS SERVER-SIDE ───────────────────────────────────────────
 * Search, filters, sort, and paging are all sent to the backend; not one row is
 * filtered or sorted in the browser. That is not a performance preference — a client
 * that filters what it downloaded shows a total that describes the download rather
 * than the archive, and the pager silently lies as soon as the data outgrows one page.
 *
 * ── ACTIONS MIRROR THE LIFECYCLE, THE SERVER ENFORCES IT ─────────────────
 * Row actions are hidden when the lifecycle forbids them (see `lettersApi`'s capability
 * helpers) and hidden again when the user lacks the permission. The server refuses
 * anything illegal regardless; hiding is a courtesy, never the control.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { useAuth } from '../stores/authStore';
import { useT } from '../lib/i18n';
import { useToast } from '../stores/toastStore';
import { usePersistedState } from '../hooks/usePersistedState';
import { formatDate, formatDateTime } from '../lib/date';
import ConfirmModal from '../components/ConfirmModal';
import DateInput from '../components/DateInput';
import {
  Button,
  Dialog,
  Drawer,
  DrawerField,
  DrawerSection,
  EmptyState,
  ErrorBanner,
  ExecutiveHeader,
  FilterChip,
  Icon,
  Pagination,
  SearchBox,
  SectionCard,
  SkeletonRows,
  StatusChip,
} from '../components/explorer/ExplorerKit';
import '../components/explorer/explorer-kit.css';
import './LetterWorkspace.css';
import {
  LETTER_STATUSES,
  LETTER_STATUS_LABEL_AR,
  LETTER_STATUS_TONE,
  type LetterListItem,
  type LetterListQuery,
  type LetterStatus,
  type PageMetaDto,
  archiveLetter,
  bulkArchive,
  bulkUnarchive,
  canArchive,
  canCancel,
  canDeleteDraft,
  canUnarchive,
  cancelLetter,
  createDraft,
  deleteDraft,
  listLetters,
  unarchiveLetter,
} from '../api/lettersApi';

/* ── Columns ───────────────────────────────────────────────────────────────
   Declared as data so visibility and sortability are properties of a column rather
   than of eleven hand-written `<th>` elements. `sortKey` names a backend column; a
   column without one cannot be sorted, which is how the UI stays in step with the
   server's closed sort list. */

interface ColumnDef {
  key: string;
  labelAr: string;
  sortKey?: string;
  /** Columns the user cannot hide — without these a row is unidentifiable. */
  locked?: boolean;
  className?: string;
}

const COLUMNS: readonly ColumnDef[] = [
  { key: 'status', labelAr: 'الحالة', sortKey: 'status', locked: true },
  { key: 'reference', labelAr: 'الرقم المرجعي', sortKey: 'reference', locked: true, className: 'lw-col-ref' },
  { key: 'subject', labelAr: 'الموضوع', sortKey: 'subject', locked: true },
  { key: 'recipient', labelAr: 'الجهة المرسل إليها' },
  { key: 'issueDate', labelAr: 'تاريخ الخطاب', sortKey: 'issueDate' },
  { key: 'registeredAt', labelAr: 'تاريخ التسجيل', sortKey: 'registeredAt' },
  { key: 'registeredBy', labelAr: 'سجّله', sortKey: 'registeredByName' },
  { key: 'createdAt', labelAr: 'تاريخ الإنشاء', sortKey: 'createdAt' },
  { key: 'createdBy', labelAr: 'أنشأه', sortKey: 'createdByName' },
  { key: 'updatedAt', labelAr: 'آخر تعديل', sortKey: 'updatedAt' },
];

const DEFAULT_HIDDEN: readonly string[] = ['createdAt', 'updatedAt'];

const PAGE_SIZES = [20, 50, 100] as const;

type Density = 'comfortable' | 'compact';

/** The filter state, persisted whole — "remember my filters" is exactly this object. */
interface WorkspaceFilters {
  search: string;
  statuses: LetterStatus[];
  /** `undefined` ⇒ show both. */
  isArchived: boolean | undefined;
  registrationState: 'registered' | 'unregistered' | undefined;
  issueDateFrom: string;
  issueDateTo: string;
  createdBy: string;
  registeredBy: string;
}

const EMPTY_FILTERS: WorkspaceFilters = {
  search: '',
  statuses: [],
  isArchived: false,
  registrationState: undefined,
  issueDateFrom: '',
  issueDateTo: '',
  createdBy: '',
  registeredBy: '',
};

/** Is anything narrowing the list beyond the default view? */
function activeFilterCount(f: WorkspaceFilters): number {
  let n = 0;
  if (f.search.trim()) n += 1;
  if (f.statuses.length > 0) n += 1;
  // The default view hides the archive, so "show archived / show all" counts as a filter.
  if (f.isArchived !== false) n += 1;
  if (f.registrationState) n += 1;
  if (f.issueDateFrom || f.issueDateTo) n += 1;
  if (f.createdBy.trim()) n += 1;
  if (f.registeredBy.trim()) n += 1;
  return n;
}

function recipientOf(row: LetterListItem): string {
  return [row.recipient.name, row.recipient.organisation].filter(Boolean).join(' — ') || '—';
}

export default function LetterWorkspace() {
  const { t } = useT();
  const navigate = useNavigate();
  const toast = useToast();
  const { hasPermission } = useAuth();

  const canCreate = hasPermission('letters.create');
  const canArchivePerm = hasPermission('letters.archive');
  const canCancelPerm = hasPermission('letters.cancel');
  const canDeletePerm = hasPermission('letters.delete');

  /* ── Persisted view state ────────────────────────────────────────────────
     Filters, page size, density and column visibility survive a reload. The PAGE
     number deliberately does not: returning to page 7 of a list whose contents have
     moved on is disorienting, and the first page is always meaningful. */
  const [filters, setFilters] = usePersistedState<WorkspaceFilters>('manarERP.letters.filters', EMPTY_FILTERS);
  const [pageSize, setPageSize] = usePersistedState<number>('manarERP.letters.pageSize', 20);
  const [density, setDensity] = usePersistedState<Density>('manarERP.letters.density', 'comfortable');
  const [hiddenColumns, setHiddenColumns] = usePersistedState<string[]>('manarERP.letters.hiddenColumns', [...DEFAULT_HIDDEN]);
  const [sortBy, setSortBy] = usePersistedState<string | null>('manarERP.letters.sortBy', null);
  const [sortDir, setSortDir] = usePersistedState<'asc' | 'desc'>('manarERP.letters.sortDir', 'desc');

  const [page, setPage] = useState(1);

  /* ── Server state ────────────────────────────────────────────────────── */
  const [rows, setRows] = useState<LetterListItem[]>([]);
  const [meta, setMeta] = useState<PageMetaDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /* ── UI state ────────────────────────────────────────────────────────── */
  const [showFilters, setShowFilters] = useState(false);
  const [showColumns, setShowColumns] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [detailsRow, setDetailsRow] = useState<LetterListItem | null>(null);
  const [cancelTarget, setCancelTarget] = useState<LetterListItem | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<LetterListItem | null>(null);

  /** Debounced copy of the search box, so typing does not fire a request per keystroke. */
  const [searchDraft, setSearchDraft] = useState(filters.search);
  useEffect(() => {
    const id = setTimeout(() => {
      setFilters((f) => (f.search === searchDraft ? f : { ...f, search: searchDraft }));
      setPage(1);
    }, 350);
    return () => clearTimeout(id);
  }, [searchDraft, setFilters]);

  const query: LetterListQuery = useMemo(
    () => ({
      search: filters.search,
      statuses: filters.statuses,
      isArchived: filters.isArchived,
      registrationState: filters.registrationState,
      issueDateFrom: filters.issueDateFrom || undefined,
      issueDateTo: filters.issueDateTo || undefined,
      createdBy: filters.createdBy,
      registeredBy: filters.registeredBy,
      sortBy: sortBy ?? undefined,
      sortDir,
      page,
      pageSize,
    }),
    [filters, sortBy, sortDir, page, pageSize],
  );

  /**
   * Guards against a slow response overwriting a newer one.
   *
   * Typing in the search box fires overlapping requests; without this the older,
   * broader result can land last and replace the narrower one the user is looking at.
   */
  const requestSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      const data = await listLetters(query);
      if (seq !== requestSeq.current) return;
      setRows(data.items);
      setMeta(data.meta);
      // Selection is cleared on every reload: an id selected on the previous result set
      // may not be on this one, and acting on invisible rows is a surprise.
      setSelected(new Set());
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setError(errorMessage(err));
      setRows([]);
      setMeta(null);
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  /* ── Actions ─────────────────────────────────────────────────────────── */

  /** Run a mutation, then reload. Every action funnels through here so the list is
   *  never left showing a state the server no longer holds. */
  const run = useCallback(
    async (action: () => Promise<void>, successMessage: string) => {
      setBusy(true);
      try {
        await action();
        toast.ok(successMessage);
        await load();
      } catch (err) {
        toast.error(errorMessage(err));
      } finally {
        setBusy(false);
      }
    },
    [load, toast],
  );

  async function handleNewDraft() {
    setBusy(true);
    try {
      const created = await createDraft();
      toast.ok('تم إنشاء مسودة جديدة');
      // Straight into the composer. The user asked for a new letter, not for a list
      // with one more row on it — and they still arrived through the list, so the
      // "never open a blank editor directly" rule holds.
      navigate(`/forms/official-letter/${created.id}`);
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(false);
    }
  }

  async function handleBulk(intent: 'archive' | 'unarchive') {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBusy(true);
    try {
      const result = intent === 'archive' ? await bulkArchive(ids) : await bulkUnarchive(ids);
      // Partial success is the server's contract, so the message reports both halves
      // rather than claiming a clean sweep.
      if (result.failed.length === 0) {
        toast.ok(`تمت العملية على ${result.succeeded.length} خطاب`);
      } else {
        toast.warn(`نجحت على ${result.succeeded.length} وتعذّرت على ${result.failed.length}: ${result.failed[0].reason ?? ''}`);
      }
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function toggleSort(columnKey: string) {
    const column = COLUMNS.find((c) => c.key === columnKey);
    if (!column?.sortKey) return;
    if (sortBy !== column.sortKey) {
      setSortBy(column.sortKey);
      setSortDir('asc');
    } else if (sortDir === 'asc') {
      setSortDir('desc');
    } else {
      setSortBy(null);
      setSortDir('desc');
    }
    setPage(1);
  }

  function patchFilters(patch: Partial<WorkspaceFilters>) {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  }

  function resetFilters() {
    setFilters(EMPTY_FILTERS);
    setSearchDraft('');
    setPage(1);
  }

  const visibleColumns = COLUMNS.filter((c) => c.locked || !hiddenColumns.includes(c.key));
  const filterCount = activeFilterCount(filters);
  const allOnPageSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  function toggleSelectAll() {
    setSelected(allOnPageSelected ? new Set() : new Set(rows.map((r) => r.id)));
  }

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /* ── Cells ───────────────────────────────────────────────────────────── */

  function renderCell(column: ColumnDef, row: LetterListItem) {
    switch (column.key) {
      case 'status':
        return (
          <span className="lw-status-cell">
            <StatusChip tone={LETTER_STATUS_TONE[row.status]}>{LETTER_STATUS_LABEL_AR[row.status]}</StatusChip>
            {row.isArchived && (
              // The flag is shown BESIDE the status, never merged into it — they are
              // two independent facts and the UI must not imply otherwise.
              <span className="lw-archived-badge" title="مؤرشف">
                <Icon name="inventory_2" />
              </span>
            )}
          </span>
        );
      case 'reference':
        return row.reference
          ? <span className="lw-ref">{row.reference}</span>
          : <span className="lw-muted">— غير مُخصَّص</span>;
      case 'subject':
        return row.subject?.trim() ? row.subject : <span className="lw-muted">(بلا موضوع)</span>;
      case 'recipient':
        return recipientOf(row);
      case 'issueDate':
        return formatDate(row.issueDate);
      case 'registeredAt':
        return row.registeredAt ? formatDate(row.registeredAt) : <span className="lw-muted">—</span>;
      case 'registeredBy':
        return row.registeredBy.name ?? <span className="lw-muted">—</span>;
      case 'createdAt':
        return formatDate(row.createdAt);
      case 'createdBy':
        return row.createdBy.name ?? <span className="lw-muted">—</span>;
      case 'updatedAt':
        return formatDateTime(row.updatedAt);
      default:
        return null;
    }
  }

  /* ── Render ──────────────────────────────────────────────────────────── */

  return (
    <div className="lw-page" dir="rtl">
      <ExecutiveHeader
        icon="mail"
        title={t('page.officialLetter.title')}
        subtitle="إنشاء الخطابات الرسمية وتتبّعها وأرشفتها"
        onBack={() => navigate('/forms')}
        aside={
          meta ? (
            <div className="lw-count">
              <strong>{meta.total}</strong>
              <span>خطاب</span>
            </div>
          ) : undefined
        }
      />

      {/* Sticky toolbar — stays reachable while a long list scrolls. */}
      <div className="lw-toolbar">
        <div className="lw-toolbar-row">
          {canCreate && (
            <Button variant="primary" icon="add" onClick={handleNewDraft} busy={busy}>
              خطاب جديد
            </Button>
          )}
          <Button icon="refresh" onClick={() => void load()} busy={loading} iconOnly title="تحديث" aria-label="تحديث" />

          <div className="lw-search">
            <SearchBox
              value={searchDraft}
              onChange={setSearchDraft}
              placeholder="ابحث برقم المرجع أو الموضوع أو الجهة…"
              ariaLabel="بحث في الخطابات"
            />
          </div>

          <FilterChip active={showFilters} onClick={() => setShowFilters((v) => !v)} icon="filter_list" count={filterCount || undefined}>
            الفلاتر
          </FilterChip>

          {/* Archive toggle: three states, because "both" is a legitimate view and a
              two-state switch cannot express it. */}
          <FilterChip
            active={filters.isArchived !== false}
            onClick={() =>
              patchFilters({
                isArchived: filters.isArchived === false ? true : filters.isArchived === true ? undefined : false,
              })
            }
            icon="inventory_2"
          >
            {filters.isArchived === false ? 'غير المؤرشف' : filters.isArchived === true ? 'المؤرشف فقط' : 'الكل'}
          </FilterChip>

          <span className="lw-toolbar-spacer" />

          <Button
            icon={density === 'compact' ? 'density_small' : 'density_medium'}
            onClick={() => setDensity(density === 'compact' ? 'comfortable' : 'compact')}
            iconOnly
            title="كثافة العرض"
            aria-label="كثافة العرض"
          />
          <Button icon="view_column" onClick={() => setShowColumns(true)} iconOnly title="الأعمدة" aria-label="الأعمدة" />
        </div>

        {selected.size > 0 && (
          <div className="lw-selection-bar" role="region" aria-label="إجراءات التحديد">
            <span className="lw-selection-count">
              <Icon name="check_circle" />
              {selected.size} محدَّد
            </span>
            {canArchivePerm && (
              <>
                <Button small icon="inventory_2" onClick={() => void handleBulk('archive')} busy={busy}>
                  أرشفة
                </Button>
                <Button small icon="unarchive" onClick={() => void handleBulk('unarchive')} busy={busy}>
                  إلغاء الأرشفة
                </Button>
              </>
            )}
            <Button small variant="ghost" onClick={() => setSelected(new Set())}>
              إلغاء التحديد
            </Button>
          </div>
        )}
      </div>

      {showFilters && (
        <SectionCard title="تصفية" icon="filter_list" actions={<Button small variant="ghost" onClick={resetFilters}>مسح الكل</Button>}>
          <div className="lw-filters">
            <div className="lw-filter-group">
              <span className="lw-filter-label">الحالة</span>
              <div className="lw-chip-row">
                {LETTER_STATUSES.map((status) => (
                  <FilterChip
                    key={status}
                    active={filters.statuses.includes(status)}
                    onClick={() =>
                      patchFilters({
                        statuses: filters.statuses.includes(status)
                          ? filters.statuses.filter((s) => s !== status)
                          : [...filters.statuses, status],
                      })
                    }
                  >
                    {LETTER_STATUS_LABEL_AR[status]}
                  </FilterChip>
                ))}
              </div>
            </div>

            <div className="lw-filter-group">
              <span className="lw-filter-label">حالة التسجيل</span>
              <div className="lw-chip-row">
                <FilterChip
                  active={filters.registrationState === 'registered'}
                  onClick={() => patchFilters({ registrationState: filters.registrationState === 'registered' ? undefined : 'registered' })}
                >
                  يحمل رقمًا مرجعيًا
                </FilterChip>
                <FilterChip
                  active={filters.registrationState === 'unregistered'}
                  onClick={() => patchFilters({ registrationState: filters.registrationState === 'unregistered' ? undefined : 'unregistered' })}
                >
                  بلا رقم مرجعي
                </FilterChip>
              </div>
            </div>

            <div className="lw-filter-group">
              <span className="lw-filter-label">تاريخ الخطاب</span>
              <div className="lw-date-range">
                <DateInput value={filters.issueDateFrom} onChange={(v) => patchFilters({ issueDateFrom: v })} ariaLabel="من تاريخ" />
                <span className="lw-muted">إلى</span>
                <DateInput value={filters.issueDateTo} onChange={(v) => patchFilters({ issueDateTo: v })} ariaLabel="إلى تاريخ" />
              </div>
            </div>

            <div className="lw-filter-group">
              <span className="lw-filter-label">أنشأه</span>
              <input
                className="lw-input"
                value={filters.createdBy}
                onChange={(e) => patchFilters({ createdBy: e.target.value })}
                placeholder="اسم المستخدم"
                aria-label="أنشأه"
              />
            </div>

            <div className="lw-filter-group">
              <span className="lw-filter-label">سجّله</span>
              <input
                className="lw-input"
                value={filters.registeredBy}
                onChange={(e) => patchFilters({ registeredBy: e.target.value })}
                placeholder="اسم المستخدم"
                aria-label="سجّله"
              />
            </div>
          </div>
        </SectionCard>
      )}

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <SectionCard padded={false}>
        {/* The skeleton appears on the FIRST load only. On every later refetch the
            existing rows stay on screen, dimmed — replacing the table on each keystroke
            would blank the list mid-search, drop the user's scroll position, and steal
            focus from the input they are still typing into. */}
        {loading && !meta ? (
          <div className="lw-skeleton-wrap">
            <SkeletonRows rows={6} withAvatar={false} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={filterCount > 0 ? 'search_off' : 'mail'}
            title={filterCount > 0 ? 'لا نتائج مطابقة' : 'لا خطابات بعد'}
            message={
              filterCount > 0
                ? 'جرّب توسيع البحث أو مسح الفلاتر.'
                : 'ابدأ بإنشاء مسودة — لن يُخصَّص رقم مرجعي إلا عند التسجيل.'
            }
            action={
              filterCount > 0 ? (
                <Button icon="filter_alt_off" onClick={resetFilters}>مسح الفلاتر</Button>
              ) : canCreate ? (
                <Button variant="primary" icon="add" onClick={handleNewDraft}>خطاب جديد</Button>
              ) : undefined
            }
          />
        ) : (
          <div className={`lw-table-wrap${loading ? ' is-refreshing' : ''}`} aria-busy={loading}>
            <table className={`lw-table${density === 'compact' ? ' lw-table--compact' : ''}`}>
              <thead>
                <tr>
                  <th className="lw-col-check" scope="col">
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      onChange={toggleSelectAll}
                      aria-label="تحديد كل الصفحة"
                    />
                  </th>
                  {visibleColumns.map((column) => (
                    <th key={column.key} scope="col" className={column.className}>
                      {column.sortKey ? (
                        <button type="button" className="lw-sort-btn" onClick={() => toggleSort(column.key)}>
                          {column.labelAr}
                          <Icon
                            name={
                              sortBy !== column.sortKey
                                ? 'unfold_more'
                                : sortDir === 'asc'
                                  ? 'arrow_upward'
                                  : 'arrow_downward'
                            }
                          />
                        </button>
                      ) : (
                        column.labelAr
                      )}
                    </th>
                  ))}
                  <th className="lw-col-actions" scope="col">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className={`${selected.has(row.id) ? 'is-selected' : ''}${row.isArchived ? ' is-archived' : ''}`}
                  >
                    <td className="lw-col-check">
                      <input
                        type="checkbox"
                        checked={selected.has(row.id)}
                        onChange={() => toggleSelect(row.id)}
                        aria-label={`تحديد ${row.reference ?? (row.subject || String(row.id))}`}
                      />
                    </td>
                    {visibleColumns.map((column) => (
                      <td key={column.key} className={column.className}>
                        {renderCell(column, row)}
                      </td>
                    ))}
                    <td className="lw-col-actions">
                      <div className="lw-row-actions">
                        {/* "Open" now has a real destination: the composer. The
                            read-only audit panel moved to its own action rather than
                            competing for the same verb. */}
                        <Button
                          small
                          icon="edit_document"
                          iconOnly
                          title="فتح"
                          aria-label="فتح"
                          onClick={() => navigate(`/forms/official-letter/${row.id}`)}
                        />
                        <Button small icon="info" onClick={() => setDetailsRow(row)} iconOnly title="التفاصيل" aria-label="التفاصيل" />
                        {canArchivePerm && canArchive(row) && (
                          <Button
                            small
                            icon="inventory_2"
                            iconOnly
                            title="أرشفة"
                            aria-label="أرشفة"
                            busy={busy}
                            onClick={() => void run(() => archiveLetter(row.id), 'تمت الأرشفة')}
                          />
                        )}
                        {canArchivePerm && canUnarchive(row) && (
                          <Button
                            small
                            icon="unarchive"
                            iconOnly
                            title="إلغاء الأرشفة"
                            aria-label="إلغاء الأرشفة"
                            busy={busy}
                            onClick={() => void run(() => unarchiveLetter(row.id), 'تم إخراجه من الأرشيف')}
                          />
                        )}
                        {canCancelPerm && canCancel(row) && (
                          <Button
                            small
                            variant="danger"
                            icon="block"
                            iconOnly
                            title="إلغاء"
                            aria-label="إلغاء"
                            onClick={() => {
                              setCancelReason('');
                              setCancelTarget(row);
                            }}
                          />
                        )}
                        {canDeletePerm && canDeleteDraft(row) && (
                          <Button
                            small
                            variant="danger"
                            icon="delete"
                            iconOnly
                            title="حذف المسودة"
                            aria-label="حذف المسودة"
                            onClick={() => setDeleteTarget(row)}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="lw-pager">
          <div className="lw-page-size">
            <span className="lw-muted">لكل صفحة</span>
            {PAGE_SIZES.map((size) => (
              <button
                key={size}
                type="button"
                className={`lw-size-btn${pageSize === size ? ' active' : ''}`}
                onClick={() => {
                  setPageSize(size);
                  setPage(1);
                }}
              >
                {size}
              </button>
            ))}
          </div>
          <Pagination meta={meta} onPage={setPage} disabled={loading} />
        </div>
      </SectionCard>

      {/* Read-only details. NOT an editor — no content, no blocks, nothing editable. */}
      {detailsRow && (
        <Drawer title={detailsRow.reference ?? 'مسودة بلا رقم'} onClose={() => setDetailsRow(null)}>
          <DrawerSection title="الحالة">
            <DrawerField label="الحالة" value={LETTER_STATUS_LABEL_AR[detailsRow.status]} />
            <DrawerField label="الأرشفة" value={detailsRow.isArchived ? 'مؤرشف' : 'غير مؤرشف'} />
            <DrawerField label="الرقم المرجعي" value={detailsRow.reference ?? '— غير مُخصَّص'} mono ltr />
          </DrawerSection>
          <DrawerSection title="المستند">
            <DrawerField label="الموضوع" value={detailsRow.subject || '(بلا موضوع)'} />
            <DrawerField label="الجهة" value={recipientOf(detailsRow)} />
            <DrawerField label="تاريخ الخطاب" value={formatDate(detailsRow.issueDate)} />
          </DrawerSection>
          <DrawerSection title="التدقيق">
            <DrawerField label="أنشأه" value={detailsRow.createdBy.name ?? '—'} />
            <DrawerField label="تاريخ الإنشاء" value={formatDateTime(detailsRow.createdAt)} />
            <DrawerField label="سجّله" value={detailsRow.registeredBy.name ?? '—'} />
            <DrawerField label="تاريخ التسجيل" value={detailsRow.registeredAt ? formatDateTime(detailsRow.registeredAt) : '—'} />
            <DrawerField label="آخر تعديل" value={formatDateTime(detailsRow.updatedAt)} />
            {detailsRow.cancelReason && <DrawerField label="سبب الإلغاء" value={detailsRow.cancelReason} />}
          </DrawerSection>
          <p className="lw-drawer-note">
            <Icon name="info" />
            تحرير المحتوى والطباعة يصلان في حزمة لاحقة.
          </p>
        </Drawer>
      )}

      {showColumns && (
        <Dialog title="الأعمدة الظاهرة" onClose={() => setShowColumns(false)}>
          <div className="lw-columns-list">
            {COLUMNS.map((column) => (
              <label key={column.key} className={`lw-column-row${column.locked ? ' is-locked' : ''}`}>
                <input
                  type="checkbox"
                  checked={column.locked || !hiddenColumns.includes(column.key)}
                  disabled={column.locked}
                  onChange={() =>
                    setHiddenColumns((prev) =>
                      prev.includes(column.key) ? prev.filter((k) => k !== column.key) : [...prev, column.key],
                    )
                  }
                />
                <span>{column.labelAr}</span>
                {column.locked && <span className="lw-muted">(ثابت)</span>}
              </label>
            ))}
          </div>
        </Dialog>
      )}

      {cancelTarget && (
        <Dialog title="إلغاء الخطاب" onClose={() => setCancelTarget(null)}>
          <p className="lw-dialog-text">
            سيبقى الرقم المرجعي <strong>{cancelTarget.reference}</strong> محجوزًا نهائيًا ولن يُعاد استخدامه.
          </p>
          <label className="lw-field">
            <span>سبب الإلغاء (إلزامي)</span>
            <textarea
              className="lw-input lw-textarea"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              aria-label="سبب الإلغاء"
            />
          </label>
          <div className="lw-dialog-actions">
            <Button variant="ghost" onClick={() => setCancelTarget(null)}>تراجع</Button>
            <Button
              variant="danger"
              icon="block"
              busy={busy}
              disabled={!cancelReason.trim()}
              onClick={() => {
                const target = cancelTarget;
                setCancelTarget(null);
                void run(() => cancelLetter(target.id, cancelReason.trim()), 'تم إلغاء الخطاب');
              }}
            >
              تأكيد الإلغاء
            </Button>
          </div>
        </Dialog>
      )}

      {deleteTarget && (
        <ConfirmModal
          title="حذف المسودة"
          message="سيُحذف هذا الخطاب نهائيًا. الحذف متاح للمسودات فقط لأنها لا تحمل رقمًا مرجعيًا."
          confirmLabel="حذف"
          variant="danger"
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => {
            const target = deleteTarget;
            setDeleteTarget(null);
            void run(() => deleteDraft(target.id), 'تم حذف المسودة');
          }}
        />
      )}
    </div>
  );
}
