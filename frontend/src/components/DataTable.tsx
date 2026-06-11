import { ReactNode } from 'react';
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
}

export default function DataTable({ columns, rows, loading, meta, onPage, actions, emptyText, emptyAction, isFiltered, onResetFilters }: Props) {
  const { t } = useT();
  const colSpan = columns.length + (actions ? 1 : 0);

  return (
    <div className="card panel" style={{ padding: 0 }}>
      <div className="table-responsive" style={{ minHeight: 120 }}>
        <table>
          <thead>
            <tr>
              {columns.map((c) => <th key={c.key}>{t(c.label)}</th>)}
              {actions && <th style={{ minWidth: 80 }}>{t('col.actions')}</th>}
            </tr>
          </thead>
          <tbody>
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
              rows.map((row, i) => (
                <tr key={row.id ?? i}>
                  {columns.map((c) => <td key={c.key}>{c.render ? c.render(row) : (row[c.key] ?? '—')}</td>)}
                  {actions && <td style={{ textAlign: 'left', whiteSpace: 'nowrap' }}>{actions(row)}</td>}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {meta && meta.total > 0 && (
        <div className="pagination">
          <span style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: 13 }}>
            {meta.totalPages > 1
              ? <>{t('msg.page')} {meta.page} {t('msg.of')} {meta.totalPages} — {t('msg.total')} {meta.total}</>
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
