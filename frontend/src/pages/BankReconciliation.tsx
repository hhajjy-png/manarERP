import {
  Fragment, useState, useEffect, useCallback, useRef, useMemo,
} from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { printCurrentView } from '../utils/print';
import DateInput from '../components/DateInput';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts';
import { CHART_INITIAL_DIMENSION } from '../lib/rechartsDefaults';
import { useAuth } from '../stores/authStore';
import { useToastStore } from '../stores/toastStore';
import { errorMessage } from '../api/client';
import PrivateAmount from '../components/PrivateAmount';
import { formatCurrency, formatNumber } from '../lib/format';
import { formatDate, todayDateOnly, formatMonthLabel } from '../lib/date';
import { generateExportFileName, ReportName } from '../utils/exportFilename';
import {
  getWorkspace,
  getTimeline,
  listImports,
  deleteImport,
  bulkDeleteImports,
  downloadExport,
  exportToCsv,
  type ReconciliationTransaction,
  type ReconciliationWorkspace,
  type ImportListItem,
  type WorkspaceFilter,
  type BankFeeType,
  type TimelineTransaction,
  type TimelineResult,
} from '../api/bankStatementImport';
import './BankReconciliation.css';
import { MoneyText } from '../config/modules';
import { fcMoneyHeader } from '../components/financial/financialLabels';
import { useT } from '../lib/i18n';

// ── Constants ─────────────────────────────────────────────────────────────────
// NOTE: Arabic literals below are i18n fallbacks (byte-for-byte identical to
// DICT.ar), consumed via labelFor()/keyFor() helpers that accept `t` from the
// calling component — see the wiring pattern in pages/Maintenance.tsx.

const PAGE_TITLE_KEY    = 'bank.recon.page_title';
const PAGE_TITLE_AR     = 'الحساب البنكي';
const PAGE_SUBTITLE_KEY = 'bank.recon.page_subtitle';
const PAGE_SUBTITLE_AR  = 'السجل الزمني الكامل لعمليات حسابك البنكي مع فلاتر وإحصائيات متقدمة';

const BANK_NAMES: Record<string, { key: string; label: string }> = {
  NBK:         { key: 'bank.name.nbk',         label: 'بنك الكويت الوطني' },
  KFH:         { key: 'bank.name.kfh',         label: 'بيت التمويل الكويتي' },
  GULF_BANK:   { key: 'bank.name.gulf',        label: 'بنك الخليج' },
  BOUBYAN:     { key: 'bank.name.boubyan',     label: 'بنك بوبيان' },
  WARBA:       { key: 'bank.name.warba',       label: 'بنك وربة' },
  AHLI_UNITED: { key: 'bank.name.ahli_united', label: 'البنك الأهلي المتحد' },
  UNKNOWN:     { key: 'bank.name.unknown',     label: 'بنك غير معروف' },
};

function bankLabelFor(code: string, t: (key: string) => string): string {
  const entry = BANK_NAMES[code];
  return entry ? t(entry.key) : code;
}

const CAT_LABELS: Record<string, { key: string; label: string }> = {
  BANK_TRANSFER:   { key: 'opt.sal.payment.bank_transfer', label: 'تحويل بنكي' },
  CHEQUE_PAYMENT:  { key: 'opt.payment.cheque',             label: 'شيك' },
  CASH_WITHDRAWAL: { key: 'bank.cat.cash_withdrawal',       label: 'سحب نقدي' },
  TRANSFER_FEE:    { key: 'bank.cat.transfer_commission',   label: 'عمولة تحويل' },
  MONTHLY_FEE:     { key: 'bank.cat.monthly_fee',           label: 'رسوم شهرية' },
  INTEREST:        { key: 'bank.cat.interest_fee',          label: 'فوائد / فوائد' },
  CHARGE:          { key: 'bank.cat.bank_charge',           label: 'رسوم بنكية' },
  ATM_FEE:         { key: 'bank.cat.atm_fee',                label: 'رسوم ATM' },
  CHEQUEBOOK_FEE:  { key: 'bank.cat.chequebook_fee',        label: 'رسوم دفتر شيكات' },
  OTHER_FEE:       { key: 'bank.cat.other_fee',             label: 'رسوم أخرى' },
};

function catLabelFor(code: string, t: (key: string) => string): string {
  const entry = CAT_LABELS[code];
  return entry ? t(entry.key) : code;
}

const CAT_ICONS: Record<string, string> = {
  BANK_TRANSFER:   '🟢',
  CHEQUE_PAYMENT:  '🔵',
  CASH_WITHDRAWAL: '🟡',
  TRANSFER_FEE:    '🟣',
  MONTHLY_FEE:     '🟣',
  INTEREST:        '🩵',
  CHARGE:          '🔴',
  ATM_FEE:         '🟠',
  CHEQUEBOOK_FEE:  '⚪',
  OTHER_FEE:       '⚪',
};

const CAT_COLORS: Record<string, string> = {
  BANK_TRANSFER:   '#10b981',
  CHEQUE_PAYMENT:  '#3b82f6',
  CASH_WITHDRAWAL: '#f59e0b',
  TRANSFER_FEE:    '#7c3aed',
  MONTHLY_FEE:     '#7c3aed',
  INTEREST:        '#0e7490',
  CHARGE:          '#ef4444',
  ATM_FEE:         '#f97316',
  CHEQUEBOOK_FEE:  '#94a3b8',
  OTHER_FEE:       '#94a3b8',
};

const WARNING_LABELS: Record<string, { key: string; label: string }> = {
  BALANCE_BREAK:          { key: 'bank.warning.balance_break',          label: 'رصيد غير متسلسل' },
  MISSING_DATE:           { key: 'bank.warning.invalid_date',           label: 'تاريخ غير صالح' },
  MISSING_DESCRIPTION:    { key: 'bank.warning.missing_description',    label: 'وصف ناقص' },
  MISSING_AMOUNT:         { key: 'bank.warning.zero_amount',            label: 'مبلغ صفر' },
  LARGE_AMOUNT:           { key: 'bank.warning.large_amount',           label: 'مبلغ كبير غير معتاد' },
  FUTURE_DATE:            { key: 'bank.warning.future_date',            label: 'تاريخ مستقبلي' },
  VERY_OLD_DATE:          { key: 'bank.warning.old_date',                label: 'تاريخ قديم جداً' },
  SUSPICIOUS_DESCRIPTION: { key: 'bank.warning.suspicious_description', label: 'وصف مشبوه' },
};

function warningLabelFor(code: string, t: (key: string) => string): string {
  const entry = WARNING_LABELS[code];
  return entry ? t(entry.key) : code;
}

const STATUS_LABELS: Record<string, { key: string; label: string }> = {
  UNMATCHED: { key: 'bank.status.unmatched', label: 'غير مطابق' },
  MATCHED:   { key: 'bank.status.matched',   label: 'مطابق' },
  IGNORED:   { key: 'bank.status.ignored',   label: 'مستبعد' },
  DUPLICATE: { key: 'import.status.duplicate', label: 'مكرر' },
  REVIEW:    { key: 'bank.status.review',    label: 'قيد المراجعة' },
};

function statusLabelFor(code: string, t: (key: string) => string): string {
  const entry = STATUS_LABELS[code];
  return entry ? t(entry.key) : code;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtAmount(v: number): string {
  return formatNumber(v);
}

function fmtDate(iso: string | null | undefined): string {
  return formatDate(iso);
}

function exportTimelineCsv(
  transactions: TimelineTransaction[],
  bankName:    string,
  accountKey:  string,
  fromDate:    string | null,
  toDate:      string | null,
  t:           (key: string) => string,
): void {
  const headers = [
    t('col.date'), t('col.description'), t('col.acc.reference'), t('col.acc.debit'), t('col.acc.credit'),
    t('bank.col.balance'), t('col.type'), t('bank.col.batch'), t('col.backup.file'), t('col.status'),
  ];
  const rows = transactions.map((t2) => [
    t2.statementDate ?? '',
    `"${t2.description.replace(/"/g, '""')}"`,
    t2.reference ?? '',
    t2.debit  > 0 ? t2.debit.toFixed(3)  : '',
    t2.credit > 0 ? t2.credit.toFixed(3) : '',
    t2.balance != null ? t2.balance.toFixed(3) : '',
    t2.bankFeeType ? catLabelFor(t2.bankFeeType, t) : '',
    `"${t2.importBatchLabel.replace(/"/g, '""')}"`,
    `"${t2.fileName.replace(/"/g, '""')}"`,
    statusLabelFor(t2.reconcileStatus, t),
  ]);
  const csv      = '﻿' + [headers, ...rows].map((r) => r.join(',')).join('\r\n');
  const blob     = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const bankSlug = bankName.toLowerCase().replace(/_/g, '-');
  const today    = todayDateOnly();
  const from     = fromDate?.substring(0, 10) ?? today;
  const to       = toDate?.substring(0, 10)   ?? today;
  const a        = document.createElement('a');
  a.href         = URL.createObjectURL(blob);
  a.download     = generateExportFileName({ reportName: ReportName.BankAccountTimeline, identifier: bankSlug, extension: 'csv' });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

// ── Recharts tooltip ──────────────────────────────────────────────────────────

interface ChartEntry { name?: string; value?: number; fill?: string; }

function ChartTooltip({ active, payload }: { active?: boolean; payload?: readonly unknown[] }) {
  if (!active || !payload?.length) return null;
  const p = (payload as readonly ChartEntry[])[0];
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '8px 13px',
      fontFamily: '"IBM Plex Sans Arabic","Cairo","Tajawal",Arial,sans-serif',
      direction: 'rtl', boxShadow: 'var(--shadow)',
    }}>
      <p style={{ color: p.fill ?? 'var(--text)', fontSize: 12, fontWeight: 700 }}>
        {p.name}: {typeof p.value === 'number' ? <MoneyText value={p.value} /> : p.value}
      </p>
    </div>
  );
}

// ── Client-side filter state ──────────────────────────────────────────────────

interface ClientFilter {
  bankFeeType:  BankFeeType | null;
  direction:    'debit' | 'credit' | null;
  hasWarnings:  boolean;
  currency:     string;
  warningCode:  string | null;
}

const DEFAULT_CLIENT: ClientFilter = {
  bankFeeType: null, direction: null, hasWarnings: false, currency: '', warningCode: null,
};

// ── ConfirmModal ──────────────────────────────────────────────────────────────

function ConfirmModal({
  title, message, confirmLabel, onConfirm, onCancel, loading = false,
}: {
  title:         string;
  message:       string;
  confirmLabel?: string;
  onConfirm:     () => void;
  onCancel:      () => void;
  loading?:      boolean;
}) {
  const { t } = useT();
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 420 }}
      >
        <div className="modal-head">
          <h3 className="modal-title">{title}</h3>
          <button className="recon-close-btn" onClick={onCancel}>×</button>
        </div>
        <div style={{ padding: '18px 22px' }}>
          <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.6, marginBottom: 20 }}>
            {message}
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn secondary" onClick={onCancel} disabled={loading}>
              {t('action.cancel')}
            </button>
            <button
              className="btn"
              onClick={onConfirm}
              disabled={loading}
              style={{ background: 'var(--red)', color: '#fff' }}
            >
              {loading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : (confirmLabel ?? t('bank.recon.confirm'))}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── smartTruncate ─────────────────────────────────────────────────────────────

function smartTruncate(s: string, max: number): string {
  if (s.length <= max) return s;
  const ext = s.lastIndexOf('.');
  if (ext > 0 && s.length - ext <= 6) {
    const tail = s.slice(ext);
    const body = s.slice(0, ext);
    if (body.length > max - 1 - tail.length) {
      return body.slice(0, max - 1 - tail.length) + '…' + tail;
    }
  }
  return s.slice(0, max - 1) + '…';
}

// ── ImportSelector ────────────────────────────────────────────────────────────

function ImportSelector({
  onSelect,
  canDelete,
  showToast,
}: {
  onSelect:  (id: number, meta: ImportListItem) => void;
  canDelete: boolean;
  showToast: (msg: string, type?: 'ok' | 'error') => void;
}) {
  const { t } = useT();
  const [imports, setImports]         = useState<ImportListItem[]>([]);
  const [loading, setLoading]         = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [deleteIds, setDeleteIds]     = useState<number[] | null>(null);
  const [deleting, setDeleting]       = useState(false);
  const navigate = useNavigate();

  const fetchImports = useCallback(() => {
    setLoading(true);
    listImports(1, 100)
      .then((r) => setImports(r.items))
      .catch(() => setImports([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchImports(); }, [fetchImports]);

  const toggleCheck = useCallback((id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) =>
      prev.size === imports.length ? new Set() : new Set(imports.map((i) => i.id)),
    );
  }, [imports]);

  const handleDeleteConfirmed = useCallback(async () => {
    if (!deleteIds) return;
    setDeleting(true);
    try {
      if (deleteIds.length === 1) {
        await deleteImport(deleteIds[0]);
      } else {
        await bulkDeleteImports(deleteIds);
      }
      showToast(deleteIds.length === 1 ? t('bank.recon.delete_batch_success_one') : t('bank.recon.delete_batch_success_many', { count: deleteIds.length }));
      setDeleteIds(null);
      setSelectedIds(new Set());
      fetchImports();
    } catch (e) {
      showToast(errorMessage(e) || t('bank.recon.delete_failed'), 'error');
    } finally {
      setDeleting(false);
    }
  }, [deleteIds, showToast, fetchImports, t]);

  const selectionStats = useMemo(() => {
    const sel = imports.filter((i) => selectedIds.has(i.id));
    return {
      count:   sel.length,
      rows:    sel.reduce((s, i) => s + i.totalRows,    0),
      debits:  sel.reduce((s, i) => s + i.totalDebits,  0),
      credits: sel.reduce((s, i) => s + i.totalCredits, 0),
    };
  }, [imports, selectedIds]);

  // ── Skeleton loading ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="recon-ws">
        <div className="page-head">
          <div><h2>{t(PAGE_TITLE_KEY)}</h2><p>{t(PAGE_SUBTITLE_KEY)}</p></div>
        </div>
        <div className="recon-import-selector">
          <div className="recon-import-grid">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="recon-import-card recon-import-card-skel">
                <div className="recon-skel" style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0 }} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="recon-skel" style={{ width: '40%', height: 14 }} />
                  <div className="recon-skel" style={{ width: '65%', height: 12 }} />
                  <div className="recon-skel" style={{ width: '50%', height: 12 }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                  <div className="recon-skel" style={{ width: 60, height: 12 }} />
                  <div className="recon-skel" style={{ width: 80, height: 12 }} />
                  <div className="recon-skel" style={{ width: 80, height: 12 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (imports.length === 0) {
    return (
      <div className="recon-ws">
        <div className="page-head">
          <div><h2>{t(PAGE_TITLE_KEY)}</h2><p>{t(PAGE_SUBTITLE_KEY)}</p></div>
          <button type="button" className="btn secondary" onClick={() => navigate('/bank-statement-import')}>
            + {t('bank.recon.add_statement')}
          </button>
        </div>
        <div className="recon-empty" style={{ paddingTop: 80 }}>
          <div className="recon-empty-icon">🏦</div>
          <p className="recon-empty-title">{t('bank.recon.empty_title')}</p>
          <p className="recon-empty-sub">{t('bank.recon.empty_sub')}</p>
          <div style={{ marginTop: 20 }}>
            <button type="button" className="btn" onClick={() => navigate('/bank-statement-import')}>
              {t('bank.recon.add_statement')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const singleSelected = selectedIds.size === 1
    ? imports.find((i) => i.id === [...selectedIds][0])
    : null;

  return (
    <div className="recon-ws">
      <div className="page-head">
        <div>
          <h2>{t(PAGE_TITLE_KEY)}</h2>
          <p>{t(PAGE_SUBTITLE_KEY)}</p>
        </div>
        <button type="button" className="btn secondary" onClick={() => navigate('/bank-statement-import')}>
          + {t('bank.recon.add_statement')}
        </button>
      </div>

      {/* Multi-select action bar */}
      {selectedIds.size > 0 && (
        <div className="recon-bulk-bar" style={{ marginBottom: 14 }}>
          <span className="recon-bulk-count">{t('bank.recon.batches_selected', { count: selectionStats.count })}</span>
          <div className="recon-bulk-divider" />
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
            {t('bank.recon.transactions_count', { count: selectionStats.rows.toLocaleString() })}
            {'  ·  '}
            ↓ {fmtAmount(selectionStats.debits)}
            {'  ·  '}
            ↑ {fmtAmount(selectionStats.credits)}
          </span>
          {singleSelected && (
            <button
              type="button"
              className="btn sm"
              onClick={() => onSelect(singleSelected.id, singleSelected)}
            >
              🔍 {t('btn.inv.view')}
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              className="btn sm"
              style={{ background: 'var(--red)', color: '#fff', marginInlineStart: 'auto' }}
              onClick={() => setDeleteIds([...selectedIds])}
            >
              🗑 {t('bank.recon.delete_selected')}
            </button>
          )}
          <button
            type="button"
            className="btn sm secondary"
            onClick={() => setSelectedIds(new Set())}
          >
            {t('action.cancel')}
          </button>
        </div>
      )}

      <div className="recon-import-selector">
        {/* Select-all header */}
        {canDelete && (
          <div className="recon-import-select-header">
            <input
              type="checkbox"
              aria-label={t('bank.recon.select_all_batches')}
              checked={selectedIds.size === imports.length && imports.length > 0}
              ref={(el) => {
                if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < imports.length;
              }}
              onChange={toggleAll}
              style={{ cursor: 'pointer', width: 16, height: 16 }}
            />
            <span>
              {selectedIds.size === imports.length && imports.length > 0 ? t('bank.recon.deselect_all') : t('bank.recon.select_all')}
            </span>
            <span style={{ marginInlineStart: 'auto', fontWeight: 600 }}>{t('bank.recon.batch_count', { count: imports.length })}</span>
          </div>
        )}

        <div className="recon-import-grid">
          {imports.map((imp) => {
            const isChecked  = selectedIds.has(imp.id);
            const bankLabel  = bankLabelFor(imp.bankName, t);
            const fileName   = smartTruncate(imp.fileName, 34);
            const duration   = imp.fromDate && imp.toDate
              ? Math.ceil((new Date(imp.toDate).getTime() - new Date(imp.fromDate).getTime()) / 86_400_000) + 1
              : null;

            return (
              <div
                key={imp.id}
                className={`recon-import-card${isChecked ? ' recon-import-card-checked' : ''}`}
                onClick={() => onSelect(imp.id, imp)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') onSelect(imp.id, imp); }}
              >
                {canDelete && (
                  <div className="recon-import-check" onClick={(e) => toggleCheck(imp.id, e)}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => { /* controlled via parent onClick */ }}
                      aria-label={t('bank.recon.select_label', { label: bankLabel })}
                    />
                  </div>
                )}

                <div
                  className="recon-import-icon"
                  style={{ background: isChecked ? 'var(--accent-light)' : 'var(--blue-light)' }}
                >
                  🏦
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="recon-import-name">{bankLabel}</p>
                  <p className="recon-import-meta" title={imp.fileName}>{fileName}</p>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 5 }}>
                    <span className="recon-import-date-chip">
                      {imp.fromDate
                        ? `${fmtDate(imp.fromDate)} → ${fmtDate(imp.toDate)}`
                        : fmtDate(imp.importedAt.substring(0, 10))}
                    </span>
                    {duration != null && duration > 0 && (
                      <span className="recon-import-dur-chip">{t('bank.recon.day_count', { count: duration })}</span>
                    )}
                  </div>
                </div>

                <div className="recon-import-right">
                  <p className="recon-import-stat">
                    <strong>{imp.totalRows.toLocaleString()}</strong> {t('bank.recon.transaction_unit')}
                  </p>
                  <p className="recon-import-stat" style={{ color: 'var(--red)' }}>
                    ↓ {fmtAmount(imp.totalDebits)}
                  </p>
                  <p className="recon-import-stat" style={{ color: 'var(--green)' }}>
                    ↑ {fmtAmount(imp.totalCredits)}
                  </p>
                </div>

                {canDelete && (
                  <button
                    type="button"
                    className="recon-import-delete-btn"
                    onClick={(e) => { e.stopPropagation(); setDeleteIds([imp.id]); }}
                    title={t('bank.recon.delete_import_batch')}
                    aria-label={t('action.delete')}
                  >
                    🗑
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {deleteIds && (
        <ConfirmModal
          title={deleteIds.length === 1 ? t('bank.recon.delete_import_batch') : t('bank.recon.delete_import_batches', { count: deleteIds.length })}
          message={
            deleteIds.length === 1
              ? t('bank.recon.delete_import_batch_msg_one')
              : t('bank.recon.delete_import_batches_msg', { count: deleteIds.length })
          }
          confirmLabel={t('action.delete')}
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setDeleteIds(null)}
          loading={deleting}
        />
      )}
    </div>
  );
}

// ── DataQualityWarnings ───────────────────────────────────────────────────────

function DataQualityWarnings({
  transactions,
  activeWarningCode,
  onFilterWarning,
}: {
  transactions:      ReconciliationTransaction[];
  activeWarningCode: string | null;
  onFilterWarning:   (code: string | null) => void;
}) {
  const { t } = useT();
  const warnings = useMemo(() => {
    const counts: Record<string, number> = {};
    transactions.forEach((tx) =>
      tx.warnings.forEach((w) => { counts[w] = (counts[w] ?? 0) + 1; }),
    );
    return Object.entries(counts).sort(([, a], [, b]) => b - a);
  }, [transactions]);

  if (warnings.length === 0) return null;

  return (
    <div className="recon-warnings-panel">
      <span className="recon-warnings-icon">⚠</span>
      <div className="recon-warnings-body">
        <p className="recon-warnings-title">{t('bank.recon.dq_warnings_title')}</p>
        <div className="recon-warnings-list">
          {warnings.map(([code, count]) => (
            <button
              key={code}
              type="button"
              className={`recon-warning-tag${activeWarningCode === code ? ' recon-warning-tag-active' : ''}`}
              onClick={() => onFilterWarning(activeWarningCode === code ? null : code)}
              title={activeWarningCode === code ? t('bank.recon.clear_warning_filter') : t('bank.recon.filter_by', { label: warningLabelFor(code, t) })}
            >
              {warningLabelFor(code, t)}
              {count > 1 && <strong style={{ marginInlineStart: 3 }}>×{count}</strong>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── SummaryBar ────────────────────────────────────────────────────────────────

function SummaryBar({
  transactions, activeFilterCount,
}: {
  transactions: ReconciliationTransaction[];
  activeFilterCount: number;
}) {
  const { t } = useT();
  const stats = useMemo(() => {
    let first = '', last = '', debit = 0, credit = 0;
    transactions.forEach((tx) => {
      if (tx.statementDate) {
        if (!first || tx.statementDate < first) first = tx.statementDate;
        if (!last  || tx.statementDate > last)  last  = tx.statementDate;
      }
      debit  += tx.debit;
      credit += tx.credit;
    });
    const dayCount = first && last
      ? Math.ceil((new Date(last).getTime() - new Date(first).getTime()) / 86_400_000) + 1
      : 0;
    return { first, last, debit, credit, dayCount };
  }, [transactions]);

  if (transactions.length === 0) return null;

  return (
    <div className="recon-summary-bar">
      <div className="recon-summary-stat">
        <span className="recon-summary-label">{t('bank.recon.transaction_count')}</span>
        <span className="recon-summary-value">{transactions.length.toLocaleString()}</span>
      </div>
      {stats.first && (
        <>
          <div className="recon-summary-divider" />
          <div className="recon-summary-stat">
            <span className="recon-summary-label">{t('bank.recon.first_date')}</span>
            <span className="recon-summary-value">{fmtDate(stats.first)}</span>
          </div>
          <div className="recon-summary-stat">
            <span className="recon-summary-label">{t('bank.recon.last_date')}</span>
            <span className="recon-summary-value">{fmtDate(stats.last)}</span>
          </div>
          {stats.dayCount > 0 && (
            <div className="recon-summary-stat">
              <span className="recon-summary-label">{t('bank.recon.day_count_label')}</span>
              <span className="recon-summary-value">{stats.dayCount.toLocaleString()}</span>
            </div>
          )}
        </>
      )}
      <div className="recon-summary-divider" />
      <div className="recon-summary-stat">
        <span className="recon-summary-label">{t('bank.recon.debit_label')}</span>
        <span className="recon-summary-value" style={{ color: 'var(--red)' }}>
          <PrivateAmount value={stats.debit} currency="" />
        </span>
      </div>
      <div className="recon-summary-stat">
        <span className="recon-summary-label">{t('bank.recon.credit_label')}</span>
        <span className="recon-summary-value" style={{ color: 'var(--green)' }}>
          <PrivateAmount value={stats.credit} currency="" />
        </span>
      </div>
      {activeFilterCount > 0 && (
        <>
          <div className="recon-summary-divider" style={{ marginInlineStart: 'auto' }} />
          <div className="recon-summary-stat">
            <span className="recon-summary-label">{t('bank.recon.active_filters')}</span>
            <span className="recon-summary-value" style={{ color: 'var(--accent)' }}>{activeFilterCount}</span>
          </div>
        </>
      )}
    </div>
  );
}

// ── TransactionDetailsPanel ───────────────────────────────────────────────────

function TransactionDetailsPanel({
  tx, onClose, onCopy,
}: {
  tx:     ReconciliationTransaction;
  onClose: () => void;
  onCopy: (text: string, label: string) => void;
}) {
  const { t } = useT();
  const [showRaw, setShowRaw] = useState(false);

  const rawData = useMemo(() => JSON.stringify({
    id:            tx.id,
    transactionId: tx.transactionId,
    statementDate: tx.statementDate,
    postingDate:   tx.postingDate,
    description:   tx.description,
    reference:     tx.reference,
    debit:         tx.debit,
    credit:        tx.credit,
    balance:       tx.balance,
    currency:      tx.currency,
    bankName:      tx.bankName,
    chequeNumber:  tx.chequeNumber,
    bankFeeType:   tx.bankFeeType,
    isBankFee:     tx.isBankFee,
    isDuplicate:   tx.isDuplicate,
    warnings:      tx.warnings,
  }, null, 2), [tx]);

  return (
    <div className="recon-details-side">
      <div className="recon-details-head">
        <h3>{t('bank.recon.transaction_details')}</h3>
        <button className="recon-close-btn" onClick={onClose} aria-label={t('action.close')}>×</button>
      </div>

      {/* Transaction data */}
      <div className="recon-details-section">
        <p className="recon-details-sec-title">{t('bank.recon.transaction_data')}</p>
        <div className="recon-detail-row">
          <span className="recon-detail-lbl">{t('col.date')}</span>
          <span className="recon-detail-val">{fmtDate(tx.statementDate)}</span>
        </div>
        {tx.postingDate && tx.postingDate !== tx.statementDate && (
          <div className="recon-detail-row">
            <span className="recon-detail-lbl">{t('bank.recon.posting_date')}</span>
            <span className="recon-detail-val">{fmtDate(tx.postingDate)}</span>
          </div>
        )}
        <div className="recon-detail-row">
          <span className="recon-detail-lbl">{t('col.description')}</span>
          <span className="recon-detail-val recon-detail-desc">{tx.description}</span>
        </div>
        {tx.reference && (
          <div className="recon-detail-row">
            <span className="recon-detail-lbl">{t('col.acc.reference')}</span>
            <span className="recon-detail-val">{tx.reference}</span>
          </div>
        )}
        {tx.chequeNumber && (
          <div className="recon-detail-row">
            <span className="recon-detail-lbl">{t('col.cheque.number')}</span>
            <span className="recon-detail-val">{tx.chequeNumber}</span>
          </div>
        )}
        {tx.transactionId && (
          <div className="recon-detail-row">
            <span className="recon-detail-lbl">{t('bank.recon.transaction_no')}</span>
            <span className="recon-detail-val" style={{ fontSize: 11.5 }}>{tx.transactionId}</span>
          </div>
        )}
      </div>

      {/* Financial values */}
      <div className="recon-details-section">
        <p className="recon-details-sec-title">{t('bank.recon.financial_values')}</p>
        {tx.debit > 0 && (
          <div className="recon-detail-row">
            <span className="recon-detail-lbl">{t('col.acc.debit')}</span>
            <span className="recon-detail-val" style={{ color: 'var(--red)', fontFamily: 'monospace' }}>
              <PrivateAmount value={tx.debit} />
            </span>
          </div>
        )}
        {tx.credit > 0 && (
          <div className="recon-detail-row">
            <span className="recon-detail-lbl">{t('col.acc.credit')}</span>
            <span className="recon-detail-val" style={{ color: 'var(--green)', fontFamily: 'monospace' }}>
              <PrivateAmount value={tx.credit} />
            </span>
          </div>
        )}
        {tx.balance != null && (
          <div className="recon-detail-row">
            <span className="recon-detail-lbl">{t('bank.col.balance')}</span>
            <span className="recon-detail-val" style={{ fontFamily: 'monospace' }}>
              <PrivateAmount value={tx.balance} />
            </span>
          </div>
        )}
        <div className="recon-detail-row">
          <span className="recon-detail-lbl">{t('col.cheque.currency')}</span>
          <span className="recon-detail-val">{tx.currency || '—'}</span>
        </div>
      </div>

      {/* Classification */}
      <div className="recon-details-section">
        <p className="recon-details-sec-title">{t('bank.recon.classification_source')}</p>
        <div className="recon-detail-row">
          <span className="recon-detail-lbl">{t('col.type')}</span>
          <span>
            {tx.bankFeeType ? (
              <span className={`recon-cat ${tx.bankFeeType}`}>
                {CAT_ICONS[tx.bankFeeType] ?? '⚪'} {catLabelFor(tx.bankFeeType, t)}
              </span>
            ) : (
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>⚪ {t('bank.recon.unclassified')}</span>
            )}
          </span>
        </div>
        <div className="recon-detail-row">
          <span className="recon-detail-lbl">{t('col.cheque.bank')}</span>
          <span className="recon-detail-val">{bankLabelFor(tx.bankName, t)}</span>
        </div>
        {tx.isDuplicate && (
          <div className="recon-detail-row">
            <span className="recon-detail-lbl">{t('field.notes')}</span>
            <span className="recon-cat CHARGE">⊙ {t('bank.recon.duplicate_row')}</span>
          </div>
        )}
      </div>

      {/* Data quality warnings */}
      {tx.warnings.length > 0 && (
        <div className="recon-details-section">
          <p className="recon-details-sec-title">{t('bank.recon.dq_warnings_title_short')}</p>
          <div className="recon-warnings-list">
            {tx.warnings.map((w, i) => (
              <span key={i} className="recon-warning-tag">⚠ {warningLabelFor(w, t)}</span>
            ))}
          </div>
        </div>
      )}

      {/* Raw data */}
      {showRaw && (
        <div className="recon-details-section">
          <p className="recon-details-sec-title">{t('bank.recon.raw_data')}</p>
          <div className="recon-raw-data"><code>{rawData}</code></div>
        </div>
      )}

      {/* Actions */}
      <div className="recon-details-actions">
        <button
          className="btn sm secondary"
          onClick={() => onCopy(tx.description, t('col.description'))}
        >
          📋 {t('bank.recon.copy_description')}
        </button>
        {tx.reference && (
          <button
            className="btn sm secondary"
            onClick={() => onCopy(tx.reference!, t('col.acc.reference'))}
          >
            📋 {t('bank.recon.copy_reference')}
          </button>
        )}
        {tx.chequeNumber && (
          <button
            className="btn sm secondary"
            onClick={() => onCopy(tx.chequeNumber!, t('col.cheque.number'))}
          >
            📋 {t('bank.recon.copy_cheque_number')}
          </button>
        )}
        <button
          className="btn sm ghost"
          onClick={() => setShowRaw((v) => !v)}
        >
          {'{}'} {showRaw ? t('bank.recon.hide_raw_data') : t('bank.recon.show_raw_data')}
        </button>
      </div>
    </div>
  );
}

// ── ExplorerCharts ────────────────────────────────────────────────────────────

function ExplorerCharts({ workspace }: { workspace: ReconciliationWorkspace }) {
  const { t } = useT();
  const categoryData = useMemo(() => {
    const counts: Record<string, { name: string; value: number; fill: string }> = {};
    workspace.transactions.forEach((tx) => {
      const key   = tx.bankFeeType ?? 'UNCLASSIFIED';
      const label = key === 'UNCLASSIFIED' ? t('bank.recon.unclassified') : catLabelFor(key, t);
      const fill  = CAT_COLORS[key] ?? '#94a3b8';
      if (!counts[key]) counts[key] = { name: label, value: 0, fill };
      counts[key].value++;
    });
    return Object.values(counts).sort((a, b) => b.value - a.value);
  }, [workspace, t]);

  const monthlyData = useMemo(() => {
    // NOTE: object keys are English identifiers (not display text) so Recharts'
    // dataKey stays locale-independent; the visible legend/axis text comes from
    // the `name` prop on each <Bar> below.
    const months: Record<string, { month: string; debit: number; credit: number }> = {};
    workspace.transactions.forEach((tx) => {
      if (!tx.statementDate) return;
      const d = new Date(tx.statementDate);
      if (isNaN(d.getTime())) return;
      const key   = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = formatMonthLabel(key);   // 'يناير 2026' — أرقام غربية (ar-KW كان يُخرج ٢٠٢٦)
      if (!months[key]) months[key] = { month: label, debit: 0, credit: 0 };
      months[key].debit  += tx.debit;
      months[key].credit += tx.credit;
    });
    return Object.entries(months)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v);
  }, [workspace]);

  return (
    <div className="recon-charts-section">
      <div className="recon-charts-grid">
        {/* Category distribution donut */}
        <div className="card recon-chart-card">
          <p className="recon-chart-title">{t('bank.recon.category_distribution')}</p>
          <div className="recon-chart-wrap">
            <ResponsiveContainer width="100%" height="100%" initialDimension={CHART_INITIAL_DIMENSION}>
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%" cy="46%"
                  innerRadius={55} outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {categoryData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} stroke="transparent" />
                  ))}
                </Pie>
                <Tooltip content={(props) => <ChartTooltip {...props} />} />
                <Legend
                  formatter={(value: string) => (
                    <span style={{
                      fontSize: 11,
                      fontFamily: '"IBM Plex Sans Arabic","Cairo","Tajawal",Arial,sans-serif',
                      fontWeight: 700,
                      color: 'var(--text-muted)',
                    }}>{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Monthly debit vs credit */}
        <div className="card recon-chart-card">
          <p className="recon-chart-title">{t('bank.recon.monthly_debit_credit')}</p>
          <div className="recon-chart-wrap">
            {monthlyData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%" initialDimension={CHART_INITIAL_DIMENSION}>
                <BarChart
                  data={monthlyData}
                  margin={{ top: 4, right: 4, left: -16, bottom: 40 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 10, fontFamily: '"IBM Plex Sans Arabic","Cairo","Tajawal",Arial,sans-serif', fill: 'var(--text-muted)' }}
                    angle={-30}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fontFamily: '"IBM Plex Sans Arabic","Cairo","Tajawal",Arial,sans-serif', fill: 'var(--text-muted)' }}
                    allowDecimals={false}
                  />
                  <Tooltip content={(props) => <ChartTooltip {...props} />} />
                  <Legend
                    formatter={(v: string) => (
                      <span style={{ fontSize: 11, fontFamily: '"IBM Plex Sans Arabic","Cairo","Tajawal",Arial,sans-serif', fontWeight: 700, color: 'var(--text-muted)' }}>{v}</span>
                    )}
                  />
                  <Bar dataKey="debit"  name={t('col.acc.debit')}  fill="#ef4444" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="credit" name={t('col.acc.credit')} fill="#10b981" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="recon-empty" style={{ padding: '24px 0' }}>
                <p className="recon-empty-sub">{t('bank.recon.no_chart_date_data')}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── SkeletonRows ──────────────────────────────────────────────────────────────

function SkeletonRows() {
  const widths = ['30%', '10%', '45%', '14%', '13%', '14%', '10%'];
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="recon-skeleton-row">
          {widths.map((w, j) => <div key={j} className="recon-skel" style={{ width: w }} />)}
        </div>
      ))}
    </>
  );
}

// ── Main: BankStatementExplorer ───────────────────────────────────────────────

export default function BankReconciliation() {
  const { t } = useT();
  const { importId: importIdParam } = useParams<{ importId?: string }>();
  const { hasPermission } = useAuth();
  const navigate           = useNavigate();

  const [selectedImportId, setSelectedImportId] = useState<number | null>(
    importIdParam ? parseInt(importIdParam, 10) : null,
  );
  const [importMeta, setImportMeta]   = useState<ImportListItem | null>(null);
  const [workspace, setWorkspace]     = useState<ReconciliationWorkspace | null>(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);

  // ── Server-side filter ──────────────────────────────────────────────────────
  const [filter, setFilter]           = useState<WorkspaceFilter>({ page: 1, pageSize: 50 });
  const [search, setSearch]           = useState('');
  const searchTimer                   = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Client-side filters ─────────────────────────────────────────────────────
  const [cf, setCf]                   = useState<ClientFilter>(DEFAULT_CLIENT);

  // ── Selection (for copy) ────────────────────────────────────────────────────
  const [selected, setSelected]       = useState<Set<number>>(new Set());

  // ── Detail panel ────────────────────────────────────────────────────────────
  const [selectedTx, setSelectedTx]   = useState<ReconciliationTransaction | null>(null);

  // ── Expanded descriptions ───────────────────────────────────────────────────
  const [expandedDescs, setExpandedDescs] = useState<Set<number>>(new Set());

  // ── Filter panel ────────────────────────────────────────────────────────────
  const [filterOpen, setFilterOpen]   = useState(false);
  const [filterDraft, setFilterDraft] = useState<WorkspaceFilter>({});
  const [cfDraft, setCfDraft]         = useState<ClientFilter>(DEFAULT_CLIENT);

  // ── Charts toggle ─────────────────────────────────────────────────────────
  const [showCharts, setShowCharts]   = useState(true);

  // ── Export dropdown ────────────────────────────────────────────────────────
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef                       = useRef<HTMLDivElement>(null);

  // ── Delete current import ──────────────────────────────────────────────────
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [deleting, setDeleting]           = useState(false);

  // ── Timeline mode ───────────────────────────────────────────────────────────
  const [viewMode, setViewMode]               = useState<'timeline' | 'batch'>('batch');
  const [timeline, setTimeline]               = useState<TimelineResult | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError]     = useState<string | null>(null);
  const [tlFromDate, setTlFromDate]           = useState('2024-01-01');
  const [tlToDate, setTlToDate]               = useState(todayDateOnly());
  const [tlSearch, setTlSearch]               = useState('');
  const [tlPage, setTlPage]                   = useState(1);
  const tlSearchTimer                         = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasAutoSwitched                       = useRef(false);

  // Shared toast mechanism (stores/toastStore.ts + Toast.tsx, mounted once in
  // Layout.tsx) instead of a page-local single-slot toast — `add` is a stable
  // zustand action reference, so `showToast` keeps the same identity across
  // renders exactly as the previous local implementation did.
  const addToast = useToastStore((s) => s.add);
  const showToast = useCallback((msg: string, type: 'ok' | 'error' = 'ok') => {
    addToast(msg, type);
  }, [addToast]);

  // ── Timeline loader ──────────────────────────────────────────────────────────
  const loadTimeline = useCallback(async (
    accountKey: string,
    page:     number,
    fromDate: string,
    toDate:   string,
    search:   string,
  ) => {
    setTimelineLoading(true);
    setTimelineError(null);
    try {
      const tl = await getTimeline(accountKey, page, 50, { fromDate, toDate, search: search || undefined });
      setTimeline(tl);
    } catch (e) {
      setTimelineError(errorMessage(e));
    } finally {
      setTimelineLoading(false);
    }
  }, []);

  // ── Copy helper ──────────────────────────────────────────────────────────────
  const copyText = useCallback((text: string, label: string) => {
    navigator.clipboard.writeText(text)
      .then(() => showToast(t('bank.recon.copied', { label })))
      .catch(() => showToast(t('bank.recon.copy_failed'), 'error'));
  }, [showToast, t]);

  // ── Export menu: close on outside click ───────────────────────────────────
  useEffect(() => {
    if (!exportMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [exportMenuOpen]);

  // ── Warning code filter ────────────────────────────────────────────────────
  const handleFilterWarning = useCallback((code: string | null) => {
    setCf((prev) => ({ ...prev, warningCode: code }));
    setSelectedTx(null);
  }, []);

  // ── Delete current import ──────────────────────────────────────────────────
  const handleDeleteCurrentImport = useCallback(async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      await deleteImport(deleteConfirm);
      showToast(t('bank.recon.delete_import_batch_success'));
      setDeleteConfirm(null);
      setSelectedImportId(null);
      setImportMeta(null);
      setWorkspace(null);
      setTimeline(null);
      setViewMode('batch');
      hasAutoSwitched.current = false;
    } catch (e) {
      showToast(errorMessage(e) || t('bank.recon.delete_import_batch_failed'), 'error');
    } finally {
      setDeleting(false);
    }
  }, [deleteConfirm, showToast, t]);

  // ── Load workspace ──────────────────────────────────────────────────────────
  const loadWorkspace = useCallback(async (importId: number, f: WorkspaceFilter) => {
    setLoading(true);
    setError(null);
    try {
      const ws = await getWorkspace(importId, f);
      setWorkspace(ws);
      setSelected(new Set());
      setExpandedDescs(new Set());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-switch to timeline mode on first workspace load when accountKey is available
  useEffect(() => {
    if (!selectedImportId) return;
    loadWorkspace(selectedImportId, filter).then(() => {
      // intentionally empty — auto-switch handled via workspace state below
    });
  }, [selectedImportId, filter, loadWorkspace]);

  useEffect(() => {
    if (!workspace?.accountKey || hasAutoSwitched.current) return;
    hasAutoSwitched.current = true;
    setViewMode('timeline');
    setTlPage(1);
    loadTimeline(workspace.accountKey, 1, tlFromDate, tlToDate, tlSearch);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace?.accountKey]);

  // ── Search debounce ─────────────────────────────────────────────────────────
  const handleSearchChange = useCallback((val: string) => {
    setSearch(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setFilter((f) => ({ ...f, search: val || undefined, page: 1 }));
    }, 350);
  }, []);

  // ── Selection ───────────────────────────────────────────────────────────────
  const toggleSelect = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (!workspace) return;
    const allIds = workspace.transactions.map((t) => t.id);
    setSelected((prev) =>
      prev.size === allIds.length ? new Set() : new Set(allIds),
    );
  }, [workspace]);

  // ── Quick chip filter ───────────────────────────────────────────────────────
  const setQuickFilter = useCallback((
    serverUpdates: Partial<WorkspaceFilter>,
    clientUpdates: Partial<ClientFilter> = {},
  ) => {
    setFilter({ page: 1, pageSize: 50, ...serverUpdates });
    setCf({ ...DEFAULT_CLIENT, ...clientUpdates });
    setSearch('');
    setSelectedTx(null);
    setExpandedDescs(new Set());
  }, []);

  // ── Filter panel ────────────────────────────────────────────────────────────
  const openFilterPanel = useCallback(() => {
    setFilterDraft(filter);
    setCfDraft(cf);
    setFilterOpen(true);
  }, [filter, cf]);

  const applyFilter = useCallback(() => {
    setFilter({ ...filterDraft, page: 1 });
    setCf(cfDraft);
    setFilterOpen(false);
    setSelectedTx(null);
  }, [filterDraft, cfDraft]);

  const resetFilter = useCallback(() => {
    setFilter({ page: 1, pageSize: 50 });
    setFilterDraft({});
    setCf(DEFAULT_CLIENT);
    setCfDraft(DEFAULT_CLIENT);
    setSearch('');
    setFilterOpen(false);
    setSelectedTx(null);
  }, []);

  // ── Expand description ──────────────────────────────────────────────────────
  const toggleExpandDesc = useCallback((id: number) => {
    setExpandedDescs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // ── Derived ────────────────────────────────────────────────────────────────
  const displayedTransactions = useMemo(() => {
    if (!workspace) return [];
    let txs = workspace.transactions;
    if (cf.bankFeeType)            txs = txs.filter((t) => t.bankFeeType === cf.bankFeeType);
    if (cf.direction === 'debit')  txs = txs.filter((t) => t.debit  > 0);
    if (cf.direction === 'credit') txs = txs.filter((t) => t.credit > 0);
    if (cf.warningCode)            txs = txs.filter((t) => t.warnings.includes(cf.warningCode!));
    else if (cf.hasWarnings)       txs = txs.filter((t) => t.warnings.length > 0);
    if (cf.currency)               txs = txs.filter((t) => t.currency?.toUpperCase() === cf.currency.toUpperCase());
    return txs;
  }, [workspace, cf]);

  const analyticalStats = useMemo(() => {
    let cheques = 0, transfers = 0, withdrawals = 0, bankFees = 0, unclassified = 0;
    let maxDebit = 0, maxCredit = 0, totalAmt = 0, count = 0;
    displayedTransactions.forEach((tx) => {
      if (tx.bankFeeType === 'CHEQUE_PAYMENT')  cheques++;
      if (tx.bankFeeType === 'BANK_TRANSFER')   transfers++;
      if (tx.bankFeeType === 'CASH_WITHDRAWAL') withdrawals++;
      if (tx.isBankFee)    bankFees++;
      if (!tx.bankFeeType) unclassified++;
      if (tx.debit  > maxDebit)  maxDebit  = tx.debit;
      if (tx.credit > maxCredit) maxCredit = tx.credit;
      const amt = Math.max(tx.debit, tx.credit);
      if (amt > 0) { totalAmt += amt; count++; }
    });
    return { cheques, transfers, withdrawals, bankFees, unclassified, maxDebit, maxCredit, avg: count > 0 ? totalAmt / count : 0 };
  }, [displayedTransactions]);

  const pageTotals = useMemo(() =>
    displayedTransactions.reduce(
      (acc, tx) => ({ debit: acc.debit + tx.debit, credit: acc.credit + tx.credit }),
      { debit: 0, credit: 0 },
    ), [displayedTransactions]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filter.fromDate)          n++;
    if (filter.toDate)            n++;
    if (filter.minAmount != null) n++;
    if (filter.maxAmount != null) n++;
    if (filter.search)            n++;
    if (filter.isBankFee)         n++;
    if (filter.isDuplicate)       n++;
    if (cf.bankFeeType)           n++;
    if (cf.direction)             n++;
    if (cf.hasWarnings)           n++;
    if (cf.warningCode)           n++;
    if (cf.currency)              n++;
    return n;
  }, [filter, cf]);

  const statementDuration = useMemo(() => {
    if (!importMeta?.fromDate || !importMeta?.toDate) return null;
    const from = new Date(importMeta.fromDate);
    const to   = new Date(importMeta.toDate);
    return Math.ceil((to.getTime() - from.getTime()) / 86_400_000) + 1;
  }, [importMeta]);

  const activeChip = useMemo(() => {
    if (cf.hasWarnings)            return 'warnings';
    if (cf.direction === 'debit')  return 'debit';
    if (cf.direction === 'credit') return 'credit';
    if (cf.bankFeeType)            return `cat:${cf.bankFeeType}`;
    if (filter.isBankFee)          return 'bankfee';
    if (filter.isDuplicate)        return 'duplicate';
    return 'ALL';
  }, [filter, cf]);

  const canExport = hasPermission('bankStatementImport.export');
  const canDelete = hasPermission('bankStatementImport.delete');

  // ── Guard ───────────────────────────────────────────────────────────────────
  if (!hasPermission('bankStatementImport.read')) {
    return (
      <div className="recon-ws">
        <div className="recon-empty">
          <div className="recon-empty-icon">🔒</div>
          <p className="recon-empty-title">{t('bank.recon.no_permission_title')}</p>
          <p className="recon-empty-sub">{t('bank.recon.no_permission_sub')}</p>
        </div>
      </div>
    );
  }

  if (!selectedImportId) {
    return (
      <ImportSelector
        onSelect={(id, meta) => {
          setSelectedImportId(id);
          setImportMeta(meta);
        }}
        canDelete={canDelete}
        showToast={showToast}
      />
    );
  }

  // ── Workspace-level totals (from importMeta or pageTotals fallback) ─────────
  const wsDebit  = importMeta?.totalDebits  ?? pageTotals.debit;
  const wsCredit = importMeta?.totalCredits ?? pageTotals.credit;
  const bankLabel = workspace ? bankLabelFor(workspace.bankName, t) : '—';

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="recon-ws">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="recon-ws-header">
        <div className="recon-ws-header-meta">
          <h1>{t(PAGE_TITLE_KEY)}</h1>
          <p>{t(PAGE_SUBTITLE_KEY)}</p>
          {workspace && (
            <div className="recon-ws-header-chips">
              <span className="recon-header-tag blue">🏦 {bankLabel}</span>
              {viewMode === 'timeline' ? (
                <>
                  {workspace.accountKey && (
                    <span className="recon-header-tag gray" title={t('bank.recon.account_id')}>{workspace.accountKey}</span>
                  )}
                  {timeline && (
                    <span className="recon-header-tag gray">📊 {t('bank.recon.transactions_count', { count: timeline.totalCount.toLocaleString() })}</span>
                  )}
                </>
              ) : (
                <>
                  <span className="recon-header-tag gray">📄 {workspace.fileName}</span>
                  <span className="recon-header-tag gray">📊 {t('bank.recon.transactions_in_batch', { count: workspace.totalRows.toLocaleString() })}</span>
                </>
              )}
            </div>
          )}
        </div>
        <div className="recon-ws-header-actions">
          {/* Search */}
          <div style={{ position: 'relative' }}>
            <input
              type="search"
              placeholder={t('bank.recon.search_placeholder')}
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              style={{
                padding: '8px 14px',
                border: '1px solid var(--border)',
                borderRadius: 10,
                fontFamily: 'inherit',
                fontSize: 13,
                background: 'var(--bg)',
                color: 'var(--text)',
                outline: 'none',
                minWidth: 220,
              }}
            />
          </div>
          <button
            type="button"
            className="btn secondary sm"
            onClick={() => navigate('/bank-statement-import')}
          >
            + {t('bank.recon.add_statement')}
          </button>
          <button
            type="button"
            className="btn secondary sm"
            onClick={() => {
              setSelectedImportId(null);
              setImportMeta(null);
              setWorkspace(null);
              setTimeline(null);
              setViewMode('batch');
              hasAutoSwitched.current = false;
            }}
          >
            ← {t('bank.recon.accounts')}
          </button>
          {canExport && selectedImportId && (
            <div style={{ position: 'relative' }} ref={exportMenuRef}>
              <button
                type="button"
                className="btn sm"
                onClick={() => setExportMenuOpen((v) => !v)}
              >
                📤 {t('audit.action.EXPORT')} ▾
              </button>
              {exportMenuOpen && (
                <div className="recon-export-menu">
                  <button
                    type="button"
                    className="recon-export-item"
                    onClick={async () => {
                      setExportMenuOpen(false);
                      try {
                        await downloadExport(selectedImportId, 'excel');
                        showToast(t('bank.recon.export_excel_success'));
                      } catch { showToast(t('bank.recon.export_excel_failed'), 'error'); }
                    }}
                  >
                    <span style={{ color: '#217346' }}>📊 Excel (XLSX)</span>
                  </button>
                  <button
                    type="button"
                    className="recon-export-item"
                    onClick={async () => {
                      setExportMenuOpen(false);
                      try {
                        await downloadExport(selectedImportId, 'pdf');
                        showToast(t('bank.recon.export_pdf_success'));
                      } catch { showToast(t('bank.recon.export_pdf_failed'), 'error'); }
                    }}
                  >
                    📄 PDF
                  </button>
                  <button
                    type="button"
                    className="recon-export-item"
                    onClick={() => {
                      setExportMenuOpen(false);
                      exportToCsv(displayedTransactions, generateExportFileName({ reportName: ReportName.BankStatement, identifier: selectedImportId, extension: 'csv' }));
                      showToast(t('bank.recon.export_csv_success'));
                    }}
                  >
                    📋 {t('bank.recon.csv_displayed_data')}
                  </button>
                  <div className="recon-export-divider" />
                  <button
                    type="button"
                    className="recon-export-item"
                    onClick={() => { setExportMenuOpen(false); printCurrentView(); }}
                  >
                    🖨 {t('audit.action.PRINT')}
                  </button>
                </div>
              )}
            </div>
          )}
          {canDelete && selectedImportId && (
            <button
              type="button"
              className="btn sm secondary"
              style={{ color: 'var(--red)', borderColor: 'var(--red)' }}
              onClick={() => setDeleteConfirm(selectedImportId)}
              title={t('bank.recon.delete_import_batch')}
            >
              🗑 {t('action.delete')}
            </button>
          )}
        </div>
      </div>

      {/* ── View mode toggle ─────────────────────────────────────────────────── */}
      {workspace?.accountKey && (
        <div className="recon-view-toggle">
          <button
            type="button"
            className={`recon-chip recon-chip-primary${viewMode === 'timeline' ? ' chip-active' : ''}`}
            onClick={() => {
              if (viewMode !== 'timeline') {
                setViewMode('timeline');
                loadTimeline(workspace.accountKey!, tlPage, tlFromDate, tlToDate, tlSearch);
              }
            }}
          >
            📅 {t('bank.recon.unified_timeline')}
          </button>
          <button
            type="button"
            className={`recon-chip${viewMode === 'batch' ? ' chip-active' : ''}`}
            onClick={() => setViewMode('batch')}
          >
            📄 {t('bank.recon.current_import_batch')}
          </button>
          {viewMode === 'timeline' && timeline && (
            <span className="recon-view-toggle-hint">
              {t('bank.recon.timeline_hint')}
              {timeline.importCount > 0 && ` (${t('bank.recon.batch_count', { count: timeline.importCount })} · ${t('bank.recon.transactions_count', { count: timeline.totalCount.toLocaleString() })})`}
            </span>
          )}
          {viewMode === 'batch' && (
            <span className="recon-view-toggle-hint">
              {t('bank.recon.batch_view_hint')}
            </span>
          )}
        </div>
      )}

      {/* ── Error banner ───────────────────────────────────────────────────── */}
      {error && (
        <div className="recon-error-banner">
          ⚠ {error}
          <button
            style={{ marginInlineStart: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 16 }}
            onClick={() => setError(null)}
          >×</button>
        </div>
      )}

      {/* ── Timeline mode ────────────────────────────────────────────────────── */}
      {viewMode === 'timeline' && workspace?.accountKey && (
        <div>
          {/* Timeline KPI cards */}
          {timeline && (
            <div className="recon-kpi-grid">
              <div className="recon-kpi">
                <div className="recon-kpi-icon" style={{ background: 'var(--blue-light)' }}>📊</div>
                <div className="recon-kpi-body">
                  <p className="recon-kpi-label">{t('bank.recon.total_transactions')}</p>
                  <p className="recon-kpi-value" style={{ color: 'var(--blue)' }}>
                    {timeline.totalCount.toLocaleString()}
                  </p>
                  <p className="recon-kpi-sub">{t('bank.recon.all_statements')}</p>
                </div>
              </div>
              <div className="recon-kpi">
                <div className="recon-kpi-icon" style={{ background: 'var(--surface-2)' }}>📅</div>
                <div className="recon-kpi-body">
                  <p className="recon-kpi-label">{t('bank.recon.first_transaction')}</p>
                  <p className="recon-kpi-value" style={{ fontSize: 14 }}>
                    {fmtDate(timeline.fromDate)}
                  </p>
                  <p className="recon-kpi-sub">{t('bank.recon.timeline_start')}</p>
                </div>
              </div>
              <div className="recon-kpi">
                <div className="recon-kpi-icon" style={{ background: 'var(--surface-2)' }}>📅</div>
                <div className="recon-kpi-body">
                  <p className="recon-kpi-label">{t('bank.recon.last_transaction')}</p>
                  <p className="recon-kpi-value" style={{ fontSize: 14 }}>
                    {fmtDate(timeline.toDate)}
                  </p>
                  <p className="recon-kpi-sub">{t('bank.recon.timeline_end')}</p>
                </div>
              </div>
              <div className="recon-kpi">
                <div className="recon-kpi-icon" style={{ background: '#ede9fe' }}>📦</div>
                <div className="recon-kpi-body">
                  <p className="recon-kpi-label">{t('bank.recon.import_batches')}</p>
                  <p className="recon-kpi-value" style={{ color: '#5b21b6' }}>
                    {timeline.importCount.toLocaleString()}
                  </p>
                  <p className="recon-kpi-sub">{t('bank.recon.linked_statement')}</p>
                </div>
              </div>
              <div className="recon-kpi">
                <div className="recon-kpi-icon" style={{ background: 'var(--red-light)' }}>↓</div>
                <div className="recon-kpi-body">
                  <p className="recon-kpi-label">{t('bank.recon.total_debit')}</p>
                  <p className="recon-kpi-value" style={{ color: 'var(--red)', fontSize: 17 }}>
                    <PrivateAmount
                      value={timeline.transactions.reduce((s, t) => s + t.debit, 0)}
                      currency=""
                    />
                  </p>
                  <p className="recon-kpi-sub">{t('bank.recon.current_page')}</p>
                </div>
              </div>
              <div className="recon-kpi">
                <div className="recon-kpi-icon" style={{ background: 'var(--green-light)' }}>↑</div>
                <div className="recon-kpi-body">
                  <p className="recon-kpi-label">{t('bank.recon.total_credit')}</p>
                  <p className="recon-kpi-value" style={{ color: 'var(--green)', fontSize: 17 }}>
                    <PrivateAmount
                      value={timeline.transactions.reduce((s, t) => s + t.credit, 0)}
                      currency=""
                    />
                  </p>
                  <p className="recon-kpi-sub">{t('bank.recon.current_page')}</p>
                </div>
              </div>
            </div>
          )}

          {/* Timeline filter bar */}
          <div className="recon-tl-filter-bar">
            <div className="recon-tl-filter-group">
              <label>{t('bank.recon.from_short')}</label>
              <DateInput
                value={tlFromDate}
                onChange={setTlFromDate}
              />
            </div>
            <div className="recon-tl-filter-group">
              <label>{t('bank.recon.to_short')}</label>
              <DateInput
                value={tlToDate}
                onChange={setTlToDate}
              />
            </div>
            <div className="recon-tl-filter-group">
              <input
                type="text"
                placeholder={t('bank.recon.search_desc_ref')}
                value={tlSearch}
                onChange={(e) => {
                  const val = e.target.value;
                  setTlSearch(val);
                  if (tlSearchTimer.current) clearTimeout(tlSearchTimer.current);
                  tlSearchTimer.current = setTimeout(() => {
                    setTlPage(1);
                    loadTimeline(workspace.accountKey!, 1, tlFromDate, tlToDate, val);
                  }, 400);
                }}
              />
            </div>
            <button
              className="btn sm secondary"
              onClick={() => {
                setTlPage(1);
                loadTimeline(workspace.accountKey!, 1, tlFromDate, tlToDate, tlSearch);
              }}
            >
              {t('bank.recon.apply')}
            </button>
            {timeline && timeline.transactions.length > 0 && (
              <button
                className="btn sm secondary"
                onClick={() => exportTimelineCsv(timeline.transactions, workspace.bankName, workspace.accountKey!, timeline.fromDate, timeline.toDate, t)}
              >
                ⬇ CSV
              </button>
            )}
          </div>

          {/* Loading / error */}
          {timelineLoading && (
            <div className="recon-empty" style={{ padding: '24px 0' }}>
              <p className="recon-empty-sub">{t('bank.recon.loading_timeline')}</p>
            </div>
          )}
          {timelineError && (
            <div className="recon-error-banner">⚠ {timelineError}</div>
          )}

          {/* Timeline table */}
          {!timelineLoading && timeline && (
            <div className="recon-table-section">
              <div className="recon-table-wrap">
                {timeline.transactions.length === 0 ? (
                  <div className="recon-empty">
                    <div className="recon-empty-icon">🔍</div>
                    <p className="recon-empty-title">{t('bank.recon.no_transactions')}</p>
                    <p className="recon-empty-sub">{t('bank.recon.try_adjust_date_search')}</p>
                  </div>
                ) : (
                  <table aria-label={t('bank.recon.unified_timeline')}>
                    <thead>
                      <tr>
                        <th>{t('col.date')}</th>
                        <th style={{ minWidth: 200 }}>{t('col.description')}</th>
                        <th>{t('col.acc.reference')}</th>
                        <th style={{ textAlign: 'end' }}>{fcMoneyHeader(t('col.acc.debit'))}</th>
                        <th style={{ textAlign: 'end' }}>{fcMoneyHeader(t('col.acc.credit'))}</th>
                        <th style={{ textAlign: 'end' }}>{fcMoneyHeader(t('bank.col.balance'))}</th>
                        <th>{t('bank.col.batch')}</th>
                        <th>{t('col.status')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {timeline.transactions.map((tx) => {
                        let rowClass = '';
                        if (tx.bankFeeType === 'BANK_TRANSFER')   rowClass = 'tx-row-transfer';
                        else if (tx.bankFeeType === 'CHEQUE_PAYMENT')  rowClass = 'tx-row-cheque';
                        else if (tx.bankFeeType === 'CASH_WITHDRAWAL') rowClass = 'tx-row-withdrawal';
                        else if (tx.isBankFee)                         rowClass = 'tx-row-fee';
                        if (tx.isDuplicate)                            rowClass = 'tx-row-duplicate';
                        return (
                          <tr key={tx.id} className={rowClass}>
                            <td>{fmtDate(tx.statementDate)}</td>
                            <td>{tx.description}</td>
                            <td>{tx.reference ?? '—'}</td>
                            <td style={{ textAlign: 'end' }}>
                              {tx.debit > 0
                                ? <PrivateAmount value={tx.debit} currency="" />
                                : '—'}
                            </td>
                            <td style={{ textAlign: 'end' }}>
                              {tx.credit > 0
                                ? <PrivateAmount value={tx.credit} currency="" />
                                : '—'}
                            </td>
                            <td style={{ textAlign: 'end' }}>
                              {tx.balance != null
                                ? <PrivateAmount value={tx.balance} currency="" />
                                : '—'}
                            </td>
                            <td title={tx.fileName} style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                              {tx.importBatchLabel}
                            </td>
                            <td>
                              <span className={`recon-tl-status ${tx.reconcileStatus.toLowerCase()}`}>
                                {statusLabelFor(tx.reconcileStatus, t)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Pagination */}
              {timeline.totalCount > 50 && (
                <div className="pagination" style={{ marginTop: 0, background: 'var(--surface)', borderRadius: '0 0 var(--radius) var(--radius)', border: '1px solid var(--border)', borderTop: 'none' }}>
                  <span style={{ fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 600 }}>
                    {t('bank.recon.pagination_range', {
                      from: (tlPage - 1) * 50 + 1,
                      to: Math.min(tlPage * 50, timeline.totalCount),
                      total: timeline.totalCount.toLocaleString(),
                    })}
                  </span>
                  <div className="pg-btns">
                    <button
                      className="btn sm secondary"
                      disabled={tlPage <= 1}
                      onClick={() => {
                        const p = tlPage - 1;
                        setTlPage(p);
                        loadTimeline(workspace.accountKey!, p, tlFromDate, tlToDate, tlSearch);
                      }}
                    >
                      {t('bank.recon.previous')}
                    </button>
                    <button
                      className="btn sm secondary"
                      disabled={tlPage * 50 >= timeline.totalCount}
                      onClick={() => {
                        const p = tlPage + 1;
                        setTlPage(p);
                        loadTimeline(workspace.accountKey!, p, tlFromDate, tlToDate, tlSearch);
                      }}
                    >
                      {t('bank.recon.next')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Batch mode ────────────────────────────────────────────────────────── */}
      {viewMode === 'batch' && (
        <>

      {/* ── KPI Grid (analytical) ──────────────────────────────────────────── */}
      {workspace && (
        <div className="recon-kpi-grid">

          {/* Total operations */}
          <div className="recon-kpi">
            <div className="recon-kpi-icon" style={{ background: 'var(--blue-light)' }}>📊</div>
            <div className="recon-kpi-body">
              <p className="recon-kpi-label">{t('bank.recon.total_transactions')}</p>
              <p className="recon-kpi-value" style={{ color: 'var(--blue)' }}>
                {workspace.totalRows.toLocaleString()}
              </p>
              <p className="recon-kpi-sub">{t('bank.recon.all_statement_transactions')}</p>
            </div>
          </div>

          {/* Total debit */}
          <div className="recon-kpi">
            <div className="recon-kpi-icon" style={{ background: 'var(--red-light)' }}>↓</div>
            <div className="recon-kpi-body">
              <p className="recon-kpi-label">{t('bank.recon.total_debit')}</p>
              <p className="recon-kpi-value" style={{ color: 'var(--red)', fontSize: 17 }}>
                <PrivateAmount value={wsDebit} currency="" />
              </p>
              <p className="recon-kpi-sub">{importMeta ? t('bank.recon.entire_statement') : t('bank.recon.current_page')}</p>
            </div>
          </div>

          {/* Total credit */}
          <div className="recon-kpi">
            <div className="recon-kpi-icon" style={{ background: 'var(--green-light)' }}>↑</div>
            <div className="recon-kpi-body">
              <p className="recon-kpi-label">{t('bank.recon.total_credit')}</p>
              <p className="recon-kpi-value" style={{ color: 'var(--green)', fontSize: 17 }}>
                <PrivateAmount value={wsCredit} currency="" />
              </p>
              <p className="recon-kpi-sub">{importMeta ? t('bank.recon.entire_statement') : t('bank.recon.current_page')}</p>
            </div>
          </div>

          {/* Cheques */}
          <button
            className={`recon-kpi clickable ${activeChip === 'cat:CHEQUE_PAYMENT' ? 'kpi-active' : ''}`}
            onClick={() => setQuickFilter({}, { bankFeeType: activeChip === 'cat:CHEQUE_PAYMENT' ? null : 'CHEQUE_PAYMENT' })}
          >
            <div className="recon-kpi-icon" style={{ background: '#dbeafe' }}>🔵</div>
            <div className="recon-kpi-body">
              <p className="recon-kpi-label">{t('bank.recon.cheques')}</p>
              <p className="recon-kpi-value" style={{ color: '#1d4ed8' }}>
                {analyticalStats.cheques.toLocaleString()}
              </p>
              <p className="recon-kpi-sub">{t('bank.recon.current_page')}</p>
            </div>
          </button>

          {/* Transfers */}
          <button
            className={`recon-kpi clickable ${activeChip === 'cat:BANK_TRANSFER' ? 'kpi-active' : ''}`}
            onClick={() => setQuickFilter({}, { bankFeeType: activeChip === 'cat:BANK_TRANSFER' ? null : 'BANK_TRANSFER' })}
          >
            <div className="recon-kpi-icon" style={{ background: '#d1fae5' }}>🟢</div>
            <div className="recon-kpi-body">
              <p className="recon-kpi-label">{t('bank.recon.transfers')}</p>
              <p className="recon-kpi-value" style={{ color: '#065f46' }}>
                {analyticalStats.transfers.toLocaleString()}
              </p>
              <p className="recon-kpi-sub">{t('bank.recon.current_page')}</p>
            </div>
          </button>

          {/* Bank fees */}
          <button
            className={`recon-kpi clickable ${activeChip === 'bankfee' ? 'kpi-active' : ''}`}
            onClick={() => setQuickFilter({ isBankFee: activeChip === 'bankfee' ? undefined : true })}
          >
            <div className="recon-kpi-icon" style={{ background: '#ede9fe' }}>🟣</div>
            <div className="recon-kpi-body">
              <p className="recon-kpi-label">{t('bank.recon.bank_fees')}</p>
              <p className="recon-kpi-value" style={{ color: '#5b21b6' }}>
                {analyticalStats.bankFees.toLocaleString()}
              </p>
              <p className="recon-kpi-sub">{t('bank.recon.current_page')}</p>
            </div>
          </button>

          {/* Max debit — replaces "أكبر معاملة" */}
          <div className="recon-kpi">
            <div className="recon-kpi-icon" style={{ background: 'var(--red-light)' }}>⬇</div>
            <div className="recon-kpi-body">
              <p className="recon-kpi-label">{t('bank.recon.max_withdrawal')}</p>
              <p className="recon-kpi-value" style={{ color: 'var(--red)', fontSize: 17 }}>
                <PrivateAmount value={analyticalStats.maxDebit} currency="" />
              </p>
              <p className="recon-kpi-sub">{t('bank.recon.max_debit_transaction')}</p>
            </div>
          </div>

          {/* Max credit */}
          <div className="recon-kpi">
            <div className="recon-kpi-icon" style={{ background: 'var(--green-light)' }}>⬆</div>
            <div className="recon-kpi-body">
              <p className="recon-kpi-label">{t('bank.recon.max_deposit')}</p>
              <p className="recon-kpi-value" style={{ color: 'var(--green)', fontSize: 17 }}>
                <PrivateAmount value={analyticalStats.maxCredit} currency="" />
              </p>
              <p className="recon-kpi-sub">{t('bank.recon.max_credit_transaction')}</p>
            </div>
          </div>

          {/* Average value */}
          <div className="recon-kpi">
            <div className="recon-kpi-icon" style={{ background: 'var(--surface-2)' }}>≈</div>
            <div className="recon-kpi-body">
              <p className="recon-kpi-label">{t('bank.recon.average_amount')}</p>
              <p className="recon-kpi-value" style={{ fontSize: 17 }}>
                <PrivateAmount value={analyticalStats.avg} currency="" />
              </p>
              <p className="recon-kpi-sub">{t('bank.recon.current_page')}</p>
            </div>
          </div>

          {/* Package Z: First operation */}
          {importMeta?.fromDate && (
            <div className="recon-kpi">
              <div className="recon-kpi-icon" style={{ background: 'var(--surface-2)' }}>📅</div>
              <div className="recon-kpi-body">
                <p className="recon-kpi-label">{t('bank.recon.first_transaction')}</p>
                <p className="recon-kpi-value" style={{ fontSize: 14 }}>
                  {fmtDate(importMeta.fromDate)}
                </p>
                <p className="recon-kpi-sub">{t('bank.recon.statement_start')}</p>
              </div>
            </div>
          )}

          {/* Package Z: Last operation */}
          {importMeta?.toDate && (
            <div className="recon-kpi">
              <div className="recon-kpi-icon" style={{ background: 'var(--surface-2)' }}>📅</div>
              <div className="recon-kpi-body">
                <p className="recon-kpi-label">{t('bank.recon.last_transaction')}</p>
                <p className="recon-kpi-value" style={{ fontSize: 14 }}>
                  {fmtDate(importMeta.toDate)}
                </p>
                <p className="recon-kpi-sub">{t('bank.recon.statement_end')}</p>
              </div>
            </div>
          )}

          {/* Package Z: Statement duration */}
          {statementDuration != null && (
            <div className="recon-kpi">
              <div className="recon-kpi-icon" style={{ background: 'var(--surface-2)' }}>📆</div>
              <div className="recon-kpi-body">
                <p className="recon-kpi-label">{t('bank.recon.statement_duration')}</p>
                <p className="recon-kpi-value">
                  {statementDuration.toLocaleString()}
                </p>
                <p className="recon-kpi-sub">{t('bank.recon.day_unit')}</p>
              </div>
            </div>
          )}

        </div>
      )}

      {/* ── Data quality warnings (AB: clickable tags) ─────────────────────── */}
      {workspace && (
        <DataQualityWarnings
          transactions={workspace.transactions}
          activeWarningCode={cf.warningCode}
          onFilterWarning={handleFilterWarning}
        />
      )}

      {/* ── Quick filter chips ──────────────────────────────────────────────── */}
      {workspace && (
        <div className="recon-chips" role="group" aria-label={t('bank.recon.quick_filter')}>
          <button
            className={`recon-chip ${activeChip === 'ALL' ? 'chip-active' : ''}`}
            onClick={() => setQuickFilter({})}
          >
            {t('bank.recon.all')} <span className="recon-chip-badge">{workspace.totalRows}</span>
          </button>
          <button
            className={`recon-chip ${activeChip === 'debit' ? 'chip-active' : ''}`}
            onClick={() => setQuickFilter({}, { direction: activeChip === 'debit' ? null : 'debit' })}
          >
            ↓ {t('bank.recon.debit_only')}
          </button>
          <button
            className={`recon-chip ${activeChip === 'credit' ? 'chip-active' : ''}`}
            onClick={() => setQuickFilter({}, { direction: activeChip === 'credit' ? null : 'credit' })}
          >
            ↑ {t('bank.recon.credit_only')}
          </button>
          <button
            className={`recon-chip ${activeChip === 'cat:CHEQUE_PAYMENT' ? 'chip-active' : ''}`}
            onClick={() => setQuickFilter({}, { bankFeeType: activeChip === 'cat:CHEQUE_PAYMENT' ? null : 'CHEQUE_PAYMENT' })}
          >
            🔵 {t('bank.recon.cheques')}
            <span className="recon-chip-badge">{analyticalStats.cheques}</span>
          </button>
          <button
            className={`recon-chip ${activeChip === 'cat:BANK_TRANSFER' ? 'chip-active' : ''}`}
            onClick={() => setQuickFilter({}, { bankFeeType: activeChip === 'cat:BANK_TRANSFER' ? null : 'BANK_TRANSFER' })}
          >
            🟢 {t('bank.recon.transfers')}
            <span className="recon-chip-badge">{analyticalStats.transfers}</span>
          </button>
          <button
            className={`recon-chip ${activeChip === 'cat:CASH_WITHDRAWAL' ? 'chip-active' : ''}`}
            onClick={() => setQuickFilter({}, { bankFeeType: activeChip === 'cat:CASH_WITHDRAWAL' ? null : 'CASH_WITHDRAWAL' })}
          >
            🟡 {t('bank.cat.cash_withdrawal')}
            <span className="recon-chip-badge">{analyticalStats.withdrawals}</span>
          </button>
          <button
            className={`recon-chip ${activeChip === 'bankfee' ? 'chip-active' : ''}`}
            onClick={() => setQuickFilter({ isBankFee: activeChip === 'bankfee' ? undefined : true })}
          >
            🟣 {t('bank.recon.bank_fee_chip')}
            <span className="recon-chip-badge">{analyticalStats.bankFees}</span>
          </button>
          <button
            className={`recon-chip ${activeChip === 'duplicate' ? 'chip-active' : ''}`}
            onClick={() => setQuickFilter({ isDuplicate: activeChip === 'duplicate' ? undefined : true })}
          >
            ⊙ {t('bank.recon.duplicates_chip')}
            {workspace.duplicates > 0 && <span className="recon-chip-badge">{workspace.duplicates}</span>}
          </button>
          <button
            className={`recon-chip ${activeChip === 'warnings' ? 'chip-active' : ''}`}
            onClick={() => setQuickFilter({}, { hasWarnings: activeChip !== 'warnings' })}
          >
            ⚠ {t('bank.recon.warnings_chip')}
          </button>
        </div>
      )}

      {/* ── Advanced filter panel ───────────────────────────────────────────── */}
      <div>
        <button
          className="recon-filter-toggle"
          onClick={() => filterOpen ? setFilterOpen(false) : openFilterPanel()}
        >
          <span>{filterOpen ? '▲' : '▼'}</span>
          {t('bank.recon.advanced_filters')}
          {activeFilterCount > 0 && (
            <span className="recon-header-tag blue" style={{ padding: '2px 8px', fontSize: 11 }}>
              {t('bank.recon.active_count', { count: activeFilterCount })}
            </span>
          )}
        </button>

        {filterOpen && (
          <div className="recon-filter-body">

            <div className="recon-filter-section">
              <p className="recon-filter-section-title">{t('bank.recon.text_search')}</p>
              <div className="recon-filter-row">
                <div className="recon-filter-field" style={{ maxWidth: 400 }}>
                  <label>{t('bank.recon.search_desc_ref_cheque')}</label>
                  <input
                    type="text"
                    placeholder={t('bank.recon.type_to_search')}
                    value={filterDraft.search ?? ''}
                    onChange={(e) => setFilterDraft((d) => ({ ...d, search: e.target.value || undefined }))}
                  />
                </div>
              </div>
            </div>

            <div className="recon-filter-section">
              <p className="recon-filter-section-title">{t('bank.recon.date_range')}</p>
              <div className="recon-filter-row">
                <div className="recon-filter-field">
                  <label>{t('bank.recon.from_date')}</label>
                  <DateInput
                    value={filterDraft.fromDate ?? ''}
                    onChange={(v) => setFilterDraft((d) => ({ ...d, fromDate: v || undefined }))}
                  />
                </div>
                <div className="recon-filter-field">
                  <label>{t('bank.recon.to_date')}</label>
                  <DateInput
                    value={filterDraft.toDate ?? ''}
                    onChange={(v) => setFilterDraft((d) => ({ ...d, toDate: v || undefined }))}
                  />
                </div>
              </div>
            </div>

            <div className="recon-filter-section">
              <p className="recon-filter-section-title">{t('bank.recon.amount_range')}</p>
              <div className="recon-filter-row">
                <div className="recon-filter-field">
                  <label>{t('bank.recon.amount_from')}</label>
                  <input
                    type="number" min="0" step="0.001" placeholder="0.000"
                    value={filterDraft.minAmount ?? ''}
                    onChange={(e) => setFilterDraft((d) => ({ ...d, minAmount: e.target.value ? parseFloat(e.target.value) : undefined }))}
                  />
                </div>
                <div className="recon-filter-field">
                  <label>{t('bank.recon.amount_to')}</label>
                  <input
                    type="number" min="0" step="0.001" placeholder={t('bank.recon.no_limit')}
                    value={filterDraft.maxAmount ?? ''}
                    onChange={(e) => setFilterDraft((d) => ({ ...d, maxAmount: e.target.value ? parseFloat(e.target.value) : undefined }))}
                  />
                </div>
              </div>
            </div>

            <div className="recon-filter-section">
              <p className="recon-filter-section-title">{t('bank.recon.type_and_direction')}</p>
              <div className="recon-filter-row">
                <div className="recon-filter-field">
                  <label>{t('bank.recon.classification')}</label>
                  <select
                    value={cfDraft.bankFeeType ?? ''}
                    onChange={(e) => setCfDraft((d) => ({ ...d, bankFeeType: (e.target.value as BankFeeType) || null }))}
                  >
                    <option value="">{t('bank.recon.all_types')}</option>
                    {Object.keys(CAT_LABELS).map((k) => (
                      <option key={k} value={k}>{CAT_ICONS[k]} {catLabelFor(k, t)}</option>
                    ))}
                  </select>
                </div>
                <div className="recon-filter-field">
                  <label>{t('bank.recon.direction')}</label>
                  <select
                    value={cfDraft.direction ?? ''}
                    onChange={(e) => setCfDraft((d) => ({ ...d, direction: (e.target.value as 'debit' | 'credit') || null }))}
                  >
                    <option value="">{t('bank.recon.debit_and_credit')}</option>
                    <option value="debit">↓ {t('bank.recon.debit_only')}</option>
                    <option value="credit">↑ {t('bank.recon.credit_only')}</option>
                  </select>
                </div>
                <div className="recon-filter-field">
                  <label>{t('col.cheque.currency')}</label>
                  <input
                    type="text" placeholder={t('bank.recon.currency_placeholder')}
                    value={cfDraft.currency}
                    onChange={(e) => setCfDraft((d) => ({ ...d, currency: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            <div className="recon-filter-section">
              <p className="recon-filter-section-title">{t('bank.recon.data_quality')}</p>
              <div className="recon-filter-row">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
                  <input
                    type="checkbox"
                    checked={cfDraft.hasWarnings}
                    onChange={(e) => setCfDraft((d) => ({ ...d, hasWarnings: e.target.checked }))}
                  />
                  {t('bank.recon.warnings_only')}
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
                  <input
                    type="checkbox"
                    checked={!!filterDraft.isDuplicate}
                    onChange={(e) => setFilterDraft((d) => ({ ...d, isDuplicate: e.target.checked || undefined }))}
                  />
                  {t('bank.recon.duplicates_only')}
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
                  <input
                    type="checkbox"
                    checked={!!filterDraft.isBankFee}
                    onChange={(e) => setFilterDraft((d) => ({ ...d, isBankFee: e.target.checked || undefined }))}
                  />
                  {t('bank.recon.bank_charges_only')}
                </label>
              </div>
            </div>

            <div className="recon-filter-actions">
              <button className="btn secondary btn sm" onClick={resetFilter}>{t('bank.recon.reset_all')}</button>
              <button className="btn btn sm" onClick={applyFilter}>{t('bank.recon.apply_filters')}</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Selection action bar ────────────────────────────────────────────── */}
      {selected.size > 0 && (
        <div className="recon-bulk-bar">
          <span className="recon-bulk-count">{t('bank.recon.selected_count', { count: selected.size })}</span>
          <div className="recon-bulk-divider" />
          <button
            className="btn sm secondary"
            onClick={() => {
              const descs = displayedTransactions
                .filter((tx) => selected.has(tx.id))
                .map((tx) => tx.description)
                .join('\n');
              copyText(descs, t('bank.recon.description_count', { count: selected.size }));
            }}
          >
            📋 {t('bank.recon.copy_descriptions')}
          </button>
          <div className="recon-bulk-divider" />
          <button
            className="btn sm secondary"
            onClick={() => setSelected(new Set())}
            style={{ marginInlineStart: 'auto' }}
          >
            {t('bank.recon.clear_selection')}
          </button>
        </div>
      )}

      {/* ── Summary bar ────────────────────────────────────────────────────── */}
      {workspace && (
        <SummaryBar
          transactions={displayedTransactions}
          activeFilterCount={activeFilterCount}
        />
      )}

      {/* ── Table + details panel ────────────────────────────────────────────── */}
      <div className="recon-main-layout">
        <div className="recon-table-section">
          <div className="recon-table-wrap">

            {loading ? (
              <SkeletonRows />
            ) : !workspace || displayedTransactions.length === 0 ? (
              <div className="recon-empty">
                <div className="recon-empty-icon">
                  {activeChip === 'ALL' ? '📋' : '🔍'}
                </div>
                <p className="recon-empty-title">
                  {activeChip === 'ALL' ? t('bank.recon.no_transactions_in_statement') : t('bank.recon.no_filter_results')}
                </p>
                <p className="recon-empty-sub">
                  {activeChip === 'ALL'
                    ? t('bank.recon.statement_no_data')
                    : t('bank.recon.try_adjust_or_clear_filters')}
                </p>
                {activeChip !== 'ALL' && (
                  <div style={{ marginTop: 16 }}>
                    <button className="btn secondary btn sm" onClick={resetFilter}>
                      {t('bank.recon.clear_filters')}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <table aria-label={t('bank.recon.statement_transactions')}>
                <thead>
                  <tr>
                    <th style={{ width: 40, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={selected.size === displayedTransactions.length && displayedTransactions.length > 0}
                        onChange={toggleSelectAll}
                        aria-label={t('bank.recon.select_all')}
                      />
                    </th>
                    <th>{t('col.type')}</th>
                    <th>{t('col.date')}</th>
                    <th style={{ minWidth: 200 }}>{t('col.description')}</th>
                    <th>{t('col.acc.reference')}</th>
                    <th style={{ textAlign: 'end' }}>{fcMoneyHeader(t('col.acc.debit'))}</th>
                    <th style={{ textAlign: 'end' }}>{fcMoneyHeader(t('col.acc.credit'))}</th>
                    <th style={{ textAlign: 'end' }}>{t('bank.col.balance')}</th>
                    <th>{t('col.cheque.currency')}</th>
                    <th style={{ width: 36 }}>⚠</th>
                    <th className="th-actions">{t('bank.recon.action_col')}</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedTransactions.map((tx) => {
                    const isActive       = selectedTx?.id === tx.id;
                    const isSelected     = selected.has(tx.id);
                    const isDescExpanded = expandedDescs.has(tx.id);
                    const hasWarnings    = tx.warnings.length > 0;

                    let rowClass = '';
                    if (isActive)        rowClass = 'tx-row-active';
                    else if (isSelected) rowClass = 'tx-row-selected';
                    else if (tx.bankFeeType === 'BANK_TRANSFER')   rowClass = 'tx-row-transfer';
                    else if (tx.bankFeeType === 'CHEQUE_PAYMENT')  rowClass = 'tx-row-cheque';
                    else if (tx.bankFeeType === 'CASH_WITHDRAWAL') rowClass = 'tx-row-withdrawal';
                    else if (tx.isBankFee)                         rowClass = 'tx-row-fee';

                    return (
                      <Fragment key={tx.id}>
                        <tr
                          className={rowClass}
                          onClick={() => setSelectedTx(isActive ? null : tx)}
                          role="row"
                          aria-selected={isActive}
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') setSelectedTx(isActive ? null : tx);
                          }}
                        >
                          {/* Checkbox */}
                          <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelect(tx.id)}
                              aria-label={t('bank.recon.select_label', { label: tx.description })}
                            />
                          </td>

                          {/* Category */}
                          <td>
                            {tx.bankFeeType ? (
                              <span className={`recon-cat ${tx.bankFeeType}`}>
                                {CAT_ICONS[tx.bankFeeType] ?? '⚪'} {catLabelFor(tx.bankFeeType, t)}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontSize: 11.5 }}>⚪ {t('bank.recon.unclassified')}</span>
                            )}
                            {tx.isDuplicate && (
                              <span className="recon-cat CHARGE" style={{ marginInlineStart: 4, fontSize: 10.5 }}>⊙</span>
                            )}
                          </td>

                          {/* Date */}
                          <td style={{ whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: 12.5 }}>
                            {fmtDate(tx.statementDate)}
                          </td>

                          {/* Description — expandable */}
                          <td onClick={(e) => e.stopPropagation()}>
                            <div className="recon-desc-cell">
                              <span
                                className={`recon-desc-text${isDescExpanded ? ' expanded' : ''}`}
                                title={!isDescExpanded ? tx.description : undefined}
                                onClick={() => setSelectedTx(isActive ? null : tx)}
                                style={{ cursor: 'pointer' }}
                              >
                                {tx.description}
                              </span>
                              {tx.description.length > 38 && (
                                <button
                                  className="recon-expand-btn"
                                  onClick={(e) => { e.stopPropagation(); toggleExpandDesc(tx.id); }}
                                  aria-label={isDescExpanded ? t('bank.recon.collapse_description') : t('bank.recon.expand_description')}
                                  title={isDescExpanded ? t('bank.recon.collapse') : t('bank.recon.expand')}
                                >
                                  {isDescExpanded ? '▲' : '▼'}
                                </button>
                              )}
                            </div>
                          </td>

                          {/* Reference */}
                          <td style={{ color: 'var(--text-muted)', fontSize: 12, maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {tx.reference ?? '—'}
                          </td>

                          {/* Debit */}
                          <td style={{ textAlign: 'end', fontFamily: 'monospace', fontWeight: 700 }}>
                            {tx.debit > 0 ? (
                              <PrivateAmount value={tx.debit} currency="" style={{ color: 'var(--red)' }} />
                            ) : null}
                          </td>

                          {/* Credit */}
                          <td style={{ textAlign: 'end', fontFamily: 'monospace', fontWeight: 700 }}>
                            {tx.credit > 0 ? (
                              <PrivateAmount value={tx.credit} currency="" style={{ color: 'var(--green)' }} />
                            ) : null}
                          </td>

                          {/* Balance */}
                          <td style={{ textAlign: 'end', fontFamily: 'monospace', fontSize: 12.5, color: 'var(--text-muted)' }}>
                            {tx.balance != null
                              ? <PrivateAmount value={tx.balance} currency="" />
                              : '—'}
                          </td>

                          {/* Currency */}
                          <td style={{ fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 700 }}>
                            {tx.currency || '—'}
                          </td>

                          {/* Warnings indicator */}
                          <td style={{ textAlign: 'center', fontSize: 14 }} title={hasWarnings ? tx.warnings.map((w) => warningLabelFor(w, t)).join('، ') : undefined}>
                            {hasWarnings ? '⚠' : ''}
                          </td>

                          {/* Actions */}
                          <td className="td-actions" onClick={(e) => e.stopPropagation()}>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button
                                className="btn sm ghost"
                                style={{ padding: '4px 8px', fontSize: 11 }}
                                onClick={() => copyText(tx.description, t('col.description'))}
                                title={t('bank.recon.copy_description')}
                              >
                                📋
                              </button>
                              <button
                                className="btn sm ghost"
                                style={{ padding: '4px 8px', fontSize: 11 }}
                                onClick={() => setSelectedTx(isActive ? null : tx)}
                                title={t('bank.recon.view_details')}
                              >
                                🔍
                              </button>
                            </div>
                          </td>
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          {workspace && workspace.total > (filter.pageSize ?? 50) && (
            <div className="pagination" style={{ marginTop: 0, background: 'var(--surface)', borderRadius: '0 0 var(--radius) var(--radius)', border: '1px solid var(--border)', borderTop: 'none' }}>
              <span style={{ fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 600 }}>
                {t('bank.recon.pagination_range', {
                  from: ((filter.page ?? 1) - 1) * (filter.pageSize ?? 50) + 1,
                  to: Math.min((filter.page ?? 1) * (filter.pageSize ?? 50), workspace.total),
                  total: workspace.total.toLocaleString(),
                })}
              </span>
              <div className="pg-btns">
                <button
                  className="btn sm secondary"
                  disabled={(filter.page ?? 1) <= 1}
                  onClick={() => setFilter((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}
                >
                  {t('bank.recon.previous')}
                </button>
                <button
                  className="btn sm secondary"
                  disabled={(filter.page ?? 1) * (filter.pageSize ?? 50) >= workspace.total}
                  onClick={() => setFilter((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
                >
                  {t('bank.recon.next')}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Details side panel ──────────────────────────────────────────────── */}
        {selectedTx && (
          <TransactionDetailsPanel
            tx={selectedTx}
            onClose={() => setSelectedTx(null)}
            onCopy={copyText}
          />
        )}
      </div>

      {/* ── Charts ─────────────────────────────────────────────────────────────── */}
      {workspace && workspace.totalRows > 0 && (
        <>
          <div className="recon-charts-head" style={{ marginTop: 24 }}>
            <h3 style={{ fontSize: 15, fontWeight: 800 }}>{t('bank.recon.visual_analysis')}</h3>
            <button
              className="btn sm secondary"
              onClick={() => setShowCharts((v) => !v)}
            >
              {showCharts ? t('bank.recon.hide_charts') : t('bank.recon.show_charts')}
            </button>
          </div>
          {showCharts && <ExplorerCharts workspace={workspace} />}
        </>
      )}

        </>
      )} {/* end batch mode */}

      {/* ── Delete current import confirmation (Package AD) ─────────────────── */}
      {deleteConfirm && (
        <ConfirmModal
          title={t('bank.recon.delete_import_batch')}
          message={t('bank.recon.delete_import_batch_msg_one')}
          confirmLabel={t('action.delete')}
          onConfirm={handleDeleteCurrentImport}
          onCancel={() => setDeleteConfirm(null)}
          loading={deleting}
        />
      )}

      {/* Toast rendering is now handled globally by the shared Toast component
          (mounted once in Layout.tsx) — no page-local toast markup needed. */}
    </div>
  );
}
