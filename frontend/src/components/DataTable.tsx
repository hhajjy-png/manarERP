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
}

export default function DataTable({ columns, rows, loading, meta, onPage, actions, emptyText }: Props) {
  const { t } = useT();

  return (
    <div className="card panel" style={{ padding: 0 }}>
      <div className="table-responsive">
        <table>
          <thead>
            <tr>
              {columns.map((c) => <th key={c.key}>{t(c.label)}</th>)}
              {actions && <th style={{ minWidth: 80 }}>{t('col.actions')}</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={columns.length + (actions ? 1 : 0)}><div className="center-msg"><div className="spinner" />{t('msg.loading')}</div></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={columns.length + (actions ? 1 : 0)}><div className="center-msg">{emptyText ?? t('msg.empty')}</div></td></tr>
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

      {meta && meta.totalPages > 1 && (
        <div className="pagination">
          <span style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: 13 }}>
            {t('msg.page')} {meta.page} {t('msg.of')} {meta.totalPages} — {t('msg.total')} {meta.total}
          </span>
          <div className="pg-btns">
            <button className="btn secondary sm" disabled={meta.page <= 1} onClick={() => onPage?.(meta.page - 1)}>{t('action.prev')}</button>
            <button className="btn secondary sm" disabled={meta.page >= meta.totalPages} onClick={() => onPage?.(meta.page + 1)}>{t('action.next')}</button>
          </div>
        </div>
      )}
    </div>
  );
}
