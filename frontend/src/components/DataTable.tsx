import { ReactNode, useEffect, useRef, useState } from 'react';
import { useT } from '../lib/i18n';

export interface Column {
  key: string;
  label: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  render?: (row: any) => ReactNode;
  /** Truncate long text with ellipsis and show full value as native tooltip */
  truncate?: boolean;
  /** Allow cell text to wrap across multiple lines */
  multiline?: boolean;
  /** Fixed column width (CSS value, e.g. '120px' or '10%') */
  width?: string;
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface Props {
  columns: Column[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: any[];
  loading?: boolean;
  meta?: PageMeta | null;
  onPage?: (page: number) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actions?: (row: any) => ReactNode;
  emptyText?: string;
  emptyAction?: ReactNode;
  isFiltered?: boolean;
  onResetFilters?: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getRowId?: (row: any) => string;
  hiddenColumns?: string[];
  onColumnVisibilityChange?: (hidden: string[]) => void;
  /** Render extra content below an expanded row */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  expandRow?: (row: any) => ReactNode;
  /** Called when a data row is clicked (not the expand toggle) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onRowClick?: (row: any) => void;
}

const SKELETON_ROWS = 5;

function SkeletonRows({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
        <tr key={i} aria-hidden="true" className="skeleton-row">
          {Array.from({ length: cols }).map((__, j) => (
            <td key={j}>
              <div
                className="skeleton-cell"
                style={{ width: j === 0 ? '60%' : j % 3 === 0 ? '40%' : '75%' }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export default function DataTable({
  columns,
  rows,
  loading,
  meta,
  onPage,
  actions,
  emptyText,
  emptyAction,
  isFiltered,
  onResetFilters,
  getRowId,
  hiddenColumns,
  onColumnVisibilityChange,
  expandRow,
  onRowClick,
}: Props) {
  const { t } = useT();
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(
    () => new Set(hiddenColumns ?? []),
  );
  const [showColMenu, setShowColMenu] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const colMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showColMenu) return;
    function handleOutsideClick(e: MouseEvent) {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) {
        setShowColMenu(false);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showColMenu]);

  function toggleCol(key: string) {
    setHiddenCols(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      onColumnVisibilityChange?.([...next]);
      return next;
    });
  }

  function resetCols() {
    setHiddenCols(new Set());
    onColumnVisibilityChange?.([]);
    setShowColMenu(false);
  }

  function toggleExpand(rowKey: string) {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(rowKey)) next.delete(rowKey); else next.add(rowKey);
      return next;
    });
  }

  const visibleColumns = columns.filter(c => !hiddenCols.has(c.key));
  const hasExpand = !!expandRow;
  const colSpan = visibleColumns.length + (actions ? 1 : 0) + (hasExpand ? 1 : 0);

  return (
    <>
      <style>{`
        .skeleton-cell {
          height: 14px;
          border-radius: 4px;
          background: linear-gradient(90deg, var(--surface-2) 25%, var(--border) 50%, var(--surface-2) 75%);
          background-size: 200% 100%;
          animation: shimmer 1.4s ease-in-out infinite;
        }
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        .dt-expand-btn {
          background: none;
          border: none;
          cursor: pointer;
          padding: 2px 6px;
          color: var(--text-muted);
          font-size: 12px;
          border-radius: 4px;
          transition: background 0.15s, color 0.15s;
          line-height: 1;
        }
        .dt-expand-btn:hover { background: var(--surface-2); color: var(--text); }
        .dt-expand-btn[aria-expanded="true"] { color: var(--primary); }
        .dt-expand-row td { background: var(--surface-2); padding: 12px 16px; }
        .dt-clickable-row { cursor: pointer; }
        .dt-clickable-row:hover td { background: var(--surface-2) !important; }
        .dt-truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 200px; display: block; }
        .dt-multiline { white-space: normal; word-break: break-word; }
      `}</style>
      <div className="card panel" style={{ padding: 0 }}>
        {/* Column visibility toolbar */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '6px 12px 0', gap: 6 }}>
          <div style={{ position: 'relative' }} ref={colMenuRef}>
            <button
              type="button"
              onClick={() => setShowColMenu(v => !v)}
              title={t('action.columns')}
              style={{ fontSize: 12, padding: '3px 10px', background: hiddenCols.size > 0 ? 'var(--primary)' : '#F3F4F6', color: hiddenCols.size > 0 ? '#fff' : 'inherit', border: '1px solid #E5E7EB', borderRadius: 4, cursor: 'pointer' }}
            >
              {t('action.columns')} {hiddenCols.size > 0 ? `(${columns.length - hiddenCols.size}/${columns.length})` : '▾'}
            </button>
            {showColMenu && (
              <div
                style={{
                  position: 'absolute', top: '100%', insetInlineEnd: 0, zIndex: 50,
                  background: 'white', border: '1px solid #E5E7EB', borderRadius: 6,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)', padding: '6px 0', minWidth: 180,
                }}
              >
                {columns.map(c => (
                  <label
                    key={c.key}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px', cursor: 'pointer', fontSize: 13 }}
                  >
                    <input
                      type="checkbox"
                      checked={!hiddenCols.has(c.key)}
                      onChange={() => toggleCol(c.key)}
                    />
                    {t(c.label)}
                  </label>
                ))}
                {hiddenCols.size > 0 && (
                  <div style={{ borderTop: '1px solid #E5E7EB', padding: '6px 12px 2px' }}>
                    <button
                      type="button"
                      onClick={resetCols}
                      style={{ fontSize: 12, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    >
                      ↺ {t('action.reset_columns')}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="table-responsive" style={{ minHeight: 120 }}>
          <table aria-busy={loading ? true : false}>
            <thead>
              <tr>
                {hasExpand && <th scope="col" aria-label={t('action.expand')} style={{ width: 32 }} />}
                {visibleColumns.map((c) => (
                  <th key={c.key} scope="col" style={c.width ? { width: c.width } : undefined}>
                    {t(c.label)}
                  </th>
                ))}
                {actions && <th scope="col" className="th-actions">{t('col.actions')}</th>}
              </tr>
            </thead>
            <tbody aria-live="polite">
              {loading ? (
                <SkeletonRows cols={colSpan} />
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={colSpan}>
                    <div style={{ textAlign: 'center', padding: '44px 16px' }}>
                      <div style={{ fontSize: 36, marginBottom: 10, opacity: 0.45 }}>
                        {isFiltered ? '🔍' : '📋'}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                        {isFiltered ? t('msg.no_results') : (emptyText || t('msg.empty'))}
                      </div>
                      {isFiltered && onResetFilters && (
                        <button
                          type="button"
                          onClick={onResetFilters}
                          style={{ marginTop: 6, fontSize: 13, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                        >
                          {t('action.reset_filters')}
                        </button>
                      )}
                      {!isFiltered && emptyAction && (
                        <div style={{ marginTop: 12 }}>{emptyAction}</div>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((row, i) => {
                  const rowKey = getRowId ? getRowId(row) : String(row.id ?? i);
                  const isExpanded = expandedRows.has(rowKey);
                  return (
                    <>
                      <tr
                        key={rowKey}
                        id={getRowId ? rowKey : undefined}
                        className={onRowClick ? 'dt-clickable-row' : undefined}
                        onClick={onRowClick ? () => onRowClick(row) : undefined}
                      >
                        {hasExpand && (
                          <td onClick={(e) => { e.stopPropagation(); toggleExpand(rowKey); }} style={{ padding: '0 4px', textAlign: 'center' }}>
                            <button
                              type="button"
                              className="dt-expand-btn"
                              aria-expanded={isExpanded}
                              title={isExpanded ? t('action.collapse') : t('action.expand')}
                            >
                              {isExpanded ? '▾' : '▸'}
                            </button>
                          </td>
                        )}
                        {visibleColumns.map((c) => {
                          const rawVal = row[c.key];
                          const rendered = c.render ? c.render(row) : (rawVal ?? '—');
                          if (c.truncate && !c.render) {
                            const text = String(rawVal ?? '');
                            return (
                              <td key={c.key}>
                                <span className="dt-truncate" title={text}>{text || '—'}</span>
                              </td>
                            );
                          }
                          if (c.multiline && !c.render) {
                            return <td key={c.key} className="dt-multiline">{rendered}</td>;
                          }
                          return <td key={c.key}>{rendered}</td>;
                        })}
                        {actions && <td className="td-actions">{actions(row)}</td>}
                      </tr>
                      {hasExpand && isExpanded && (
                        <tr key={`${rowKey}-expand`} className="dt-expand-row">
                          <td colSpan={colSpan}>{expandRow!(row)}</td>
                        </tr>
                      )}
                    </>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {meta && meta.total > 0 && (
          <div className="pagination">
            <span style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: 13 }}>
              {meta.totalPages > 1
                ? <>{t('msg.showing_range', { from: String((meta.page - 1) * meta.pageSize + 1), to: String(Math.min(meta.page * meta.pageSize, meta.total)), total: String(meta.total) })} — {t('msg.page')} {meta.page} {t('msg.of')} {meta.totalPages}</>
                : <>{t('msg.total')} {meta.total}</>
              }
            </span>
            {meta.totalPages > 1 && (
              <div className="pg-btns">
                <button type="button" className="btn secondary sm" disabled={meta.page <= 1} onClick={() => onPage?.(meta.page - 1)}>{t('action.prev')}</button>
                <button type="button" className="btn secondary sm" disabled={meta.page >= meta.totalPages} onClick={() => onPage?.(meta.page + 1)}>{t('action.next')}</button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
