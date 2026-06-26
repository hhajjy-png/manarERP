import { ReactNode, useEffect, useRef, useState } from 'react';
import { useT } from '../lib/i18n';

export interface Column {
  key: string;
  label: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  render?: (row: any) => ReactNode;
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
}

export default function DataTable({ columns, rows, loading, meta, onPage, actions, emptyText, emptyAction, isFiltered, onResetFilters, getRowId, hiddenColumns, onColumnVisibilityChange }: Props) {
  const { t } = useT();
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(
    () => new Set(hiddenColumns ?? []),
  );
  const [showColMenu, setShowColMenu] = useState(false);
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

  const visibleColumns = columns.filter(c => !hiddenCols.has(c.key));
  const colSpan = visibleColumns.length + (actions ? 1 : 0);

  return (
    <div className="card panel" style={{ padding: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '6px 12px 0' }}>
        <div style={{ position: 'relative' }} ref={colMenuRef}>
          <button
            type="button"
            onClick={() => setShowColMenu(v => !v)}
            style={{ fontSize: 12, padding: '3px 10px', background: '#F3F4F6', border: '1px solid #E5E7EB', borderRadius: 4, cursor: 'pointer' }}
          >
            الأعمدة ▾
          </button>
          {showColMenu && (
            <div
              style={{
                position: 'absolute', top: '100%', insetInlineEnd: 0, zIndex: 50,
                background: 'white', border: '1px solid #E5E7EB', borderRadius: 6,
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)', padding: '6px 0', minWidth: 160,
              }}
            >
              {columns.map(c => (
                <label
                  key={c.key}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px', cursor: 'pointer', fontSize: 13 }}
                >
                  <input
                    type="checkbox"
                    checked={!hiddenCols.has(c.key)}
                    onChange={() => toggleCol(c.key)}
                  />
                  {t(c.label)}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="table-responsive" style={{ minHeight: 120 }}>
        <table aria-busy={!!loading}>
          <thead>
            <tr>
              {visibleColumns.map((c) => <th key={c.key} scope="col">{t(c.label)}</th>)}
              {actions && <th scope="col" className="th-actions">{t('col.actions')}</th>}
            </tr>
          </thead>
          <tbody aria-live="polite">
            {loading ? (
              <tr><td colSpan={colSpan}><div className="center-msg"><div className="spinner" />{t('msg.loading')}</div></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={colSpan}>
                <div className="center-msg" style={{ flexDirection: 'column', gap: 12 }}>
                  <span>{isFiltered ? t('msg.empty_filtered') : (emptyText ?? t('msg.empty'))}</span>
                  {isFiltered && onResetFilters ? (
                    <button type="button" className="btn secondary sm" onClick={onResetFilters}>
                      {t('action.reset_filters_inline')}
                    </button>
                  ) : !isFiltered ? emptyAction : null}
                </div>
              </td></tr>
            ) : (
              rows.map((row, i) => {
                const rowId = getRowId ? getRowId(row) : undefined;
                return (
                  <tr key={row.id ?? i} id={rowId}>
                    {visibleColumns.map((c) => <td key={c.key}>{c.render ? c.render(row) : (row[c.key] ?? '—')}</td>)}
                    {actions && <td className="td-actions">{actions(row)}</td>}
                  </tr>
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
  );
}
