import {
  Fragment, useState, useEffect, useCallback, useRef, useMemo,
} from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts';
import { useAuth } from '../stores/authStore';
import { errorMessage } from '../api/client';
import PrivateAmount from '../components/PrivateAmount';
import {
  getWorkspace,
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
} from '../api/bankStatementImport';
import './BankReconciliation.css';

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_TITLE    = 'مستكشف كشف الحساب البنكي';
const PAGE_SUBTITLE = 'استعراض وتحليل العمليات البنكية المستوردة مع إحصائيات ومرشحات متقدمة';

const BANK_NAMES: Record<string, string> = {
  NBK:         'بنك الكويت الوطني',
  KFH:         'بيت التمويل الكويتي',
  GULF_BANK:   'بنك الخليج',
  BOUBYAN:     'بنك بوبيان',
  WARBA:       'بنك وربة',
  AHLI_UNITED: 'البنك الأهلي المتحد',
  UNKNOWN:     'بنك غير معروف',
};

const CAT_LABELS: Record<string, string> = {
  BANK_TRANSFER:   'تحويل بنكي',
  CHEQUE_PAYMENT:  'شيك',
  CASH_WITHDRAWAL: 'سحب نقدي',
  TRANSFER_FEE:    'عمولة تحويل',
  MONTHLY_FEE:     'رسوم شهرية',
  INTEREST:        'فوائد / فوائد',
  CHARGE:          'رسوم بنكية',
  ATM_FEE:         'رسوم ATM',
  CHEQUEBOOK_FEE:  'رسوم دفتر شيكات',
  OTHER_FEE:       'رسوم أخرى',
};

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

const WARNING_LABELS: Record<string, string> = {
  BALANCE_BREAK:          'رصيد غير متسلسل',
  MISSING_DATE:           'تاريخ غير صالح',
  MISSING_DESCRIPTION:    'وصف ناقص',
  MISSING_AMOUNT:         'مبلغ صفر',
  LARGE_AMOUNT:           'مبلغ كبير غير معتاد',
  FUTURE_DATE:            'تاريخ مستقبلي',
  VERY_OLD_DATE:          'تاريخ قديم جداً',
  SUSPICIOUS_DESCRIPTION: 'وصف مشبوه',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtAmount(v: number): string {
  return v.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('ar-KW');
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
        {p.name}: {typeof p.value === 'number' ? p.value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 3 }) : p.value}
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
  title, message, confirmLabel = 'تأكيد', onConfirm, onCancel, loading = false,
}: {
  title:         string;
  message:       string;
  confirmLabel?: string;
  onConfirm:     () => void;
  onCancel:      () => void;
  loading?:      boolean;
}) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal"
        dir="rtl"
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
              إلغاء
            </button>
            <button
              className="btn"
              onClick={onConfirm}
              disabled={loading}
              style={{ background: 'var(--red)', color: '#fff' }}
            >
              {loading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : confirmLabel}
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
      showToast(`تم حذف ${deleteIds.length === 1 ? 'الكشف' : `${deleteIds.length} كشوف`} بنجاح`);
      setDeleteIds(null);
      setSelectedIds(new Set());
      fetchImports();
    } catch (e) {
      showToast(errorMessage(e) || 'فشل الحذف', 'error');
    } finally {
      setDeleting(false);
    }
  }, [deleteIds, showToast, fetchImports]);

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
      <div className="recon-ws" dir="rtl">
        <div className="page-head">
          <div><h2>{PAGE_TITLE}</h2><p>{PAGE_SUBTITLE}</p></div>
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
      <div className="recon-ws" dir="rtl">
        <div className="page-head">
          <div><h2>{PAGE_TITLE}</h2><p>{PAGE_SUBTITLE}</p></div>
          <button type="button" className="btn secondary" onClick={() => navigate('/bank-statement-import')}>
            + استيراد جديد
          </button>
        </div>
        <div className="recon-empty" style={{ paddingTop: 80 }}>
          <div className="recon-empty-icon">🏦</div>
          <p className="recon-empty-title">لا توجد كشوف بنكية مستوردة</p>
          <p className="recon-empty-sub">استورد كشف حساب بنكي أولاً لتتمكن من استعراضه وتحليله هنا</p>
          <div style={{ marginTop: 20 }}>
            <button type="button" className="btn" onClick={() => navigate('/bank-statement-import')}>
              استيراد كشف حساب
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
    <div className="recon-ws" dir="rtl">
      <div className="page-head">
        <div>
          <h2>{PAGE_TITLE}</h2>
          <p>{PAGE_SUBTITLE}</p>
        </div>
        <button type="button" className="btn secondary" onClick={() => navigate('/bank-statement-import')}>
          + استيراد جديد
        </button>
      </div>

      {/* Multi-select action bar */}
      {selectedIds.size > 0 && (
        <div className="recon-bulk-bar" style={{ marginBottom: 14 }}>
          <span className="recon-bulk-count">{selectionStats.count} كشف محدد</span>
          <div className="recon-bulk-divider" />
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
            {selectionStats.rows.toLocaleString()} عملية
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
              🔍 عرض
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              className="btn sm"
              style={{ background: 'var(--red)', color: '#fff', marginInlineStart: 'auto' }}
              onClick={() => setDeleteIds([...selectedIds])}
            >
              🗑 حذف المحددة
            </button>
          )}
          <button
            type="button"
            className="btn sm secondary"
            onClick={() => setSelectedIds(new Set())}
          >
            إلغاء
          </button>
        </div>
      )}

      <div className="recon-import-selector">
        {/* Select-all header */}
        {canDelete && (
          <div className="recon-import-select-header">
            <input
              type="checkbox"
              aria-label="تحديد كل الكشوف"
              checked={selectedIds.size === imports.length && imports.length > 0}
              ref={(el) => {
                if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < imports.length;
              }}
              onChange={toggleAll}
              style={{ cursor: 'pointer', width: 16, height: 16 }}
            />
            <span>
              {selectedIds.size === imports.length && imports.length > 0 ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
            </span>
            <span style={{ marginInlineStart: 'auto', fontWeight: 600 }}>{imports.length} كشف</span>
          </div>
        )}

        <div className="recon-import-grid">
          {imports.map((imp) => {
            const isChecked  = selectedIds.has(imp.id);
            const bankLabel  = BANK_NAMES[imp.bankName] ?? imp.bankName;
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
                      aria-label={`تحديد: ${bankLabel}`}
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
                      <span className="recon-import-dur-chip">{duration} يوم</span>
                    )}
                  </div>
                </div>

                <div className="recon-import-right">
                  <p className="recon-import-stat">
                    <strong>{imp.totalRows.toLocaleString()}</strong> عملية
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
                    title="حذف هذا الكشف"
                    aria-label="حذف"
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
          title={deleteIds.length === 1 ? 'حذف الكشف البنكي' : `حذف ${deleteIds.length} كشوف بنكية`}
          message={
            deleteIds.length === 1
              ? 'هل أنت متأكد من حذف هذا الكشف البنكي؟ سيتم حذف جميع المعاملات المرتبطة به. هذا الإجراء لا يمكن التراجع عنه.'
              : `هل أنت متأكد من حذف ${deleteIds.length} كشوف بنكية؟ سيتم حذف جميع المعاملات المرتبطة بها. هذا الإجراء لا يمكن التراجع عنه.`
          }
          confirmLabel="حذف"
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
        <p className="recon-warnings-title">تنبيهات جودة البيانات — انقر على تنبيه للتصفية</p>
        <div className="recon-warnings-list">
          {warnings.map(([code, count]) => (
            <button
              key={code}
              type="button"
              className={`recon-warning-tag${activeWarningCode === code ? ' recon-warning-tag-active' : ''}`}
              onClick={() => onFilterWarning(activeWarningCode === code ? null : code)}
              title={activeWarningCode === code ? 'إلغاء فلتر التنبيه' : `تصفية: ${WARNING_LABELS[code] ?? code}`}
            >
              {WARNING_LABELS[code] ?? code}
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
        <span className="recon-summary-label">عدد العمليات</span>
        <span className="recon-summary-value">{transactions.length.toLocaleString()}</span>
      </div>
      {stats.first && (
        <>
          <div className="recon-summary-divider" />
          <div className="recon-summary-stat">
            <span className="recon-summary-label">أول تاريخ</span>
            <span className="recon-summary-value">{fmtDate(stats.first)}</span>
          </div>
          <div className="recon-summary-stat">
            <span className="recon-summary-label">آخر تاريخ</span>
            <span className="recon-summary-value">{fmtDate(stats.last)}</span>
          </div>
          {stats.dayCount > 0 && (
            <div className="recon-summary-stat">
              <span className="recon-summary-label">عدد الأيام</span>
              <span className="recon-summary-value">{stats.dayCount.toLocaleString()}</span>
            </div>
          )}
        </>
      )}
      <div className="recon-summary-divider" />
      <div className="recon-summary-stat">
        <span className="recon-summary-label">المدين</span>
        <span className="recon-summary-value" style={{ color: 'var(--red)' }}>
          <PrivateAmount value={stats.debit} currency="" />
        </span>
      </div>
      <div className="recon-summary-stat">
        <span className="recon-summary-label">الدائن</span>
        <span className="recon-summary-value" style={{ color: 'var(--green)' }}>
          <PrivateAmount value={stats.credit} currency="" />
        </span>
      </div>
      {activeFilterCount > 0 && (
        <>
          <div className="recon-summary-divider" style={{ marginInlineStart: 'auto' }} />
          <div className="recon-summary-stat">
            <span className="recon-summary-label">فلاتر نشطة</span>
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
    <div className="recon-details-side" dir="rtl">
      <div className="recon-details-head">
        <h3>تفاصيل المعاملة</h3>
        <button className="recon-close-btn" onClick={onClose} aria-label="إغلاق">×</button>
      </div>

      {/* Transaction data */}
      <div className="recon-details-section">
        <p className="recon-details-sec-title">بيانات المعاملة</p>
        <div className="recon-detail-row">
          <span className="recon-detail-lbl">التاريخ</span>
          <span className="recon-detail-val">{fmtDate(tx.statementDate)}</span>
        </div>
        {tx.postingDate && tx.postingDate !== tx.statementDate && (
          <div className="recon-detail-row">
            <span className="recon-detail-lbl">تاريخ الترحيل</span>
            <span className="recon-detail-val">{fmtDate(tx.postingDate)}</span>
          </div>
        )}
        <div className="recon-detail-row">
          <span className="recon-detail-lbl">الوصف</span>
          <span className="recon-detail-val recon-detail-desc">{tx.description}</span>
        </div>
        {tx.reference && (
          <div className="recon-detail-row">
            <span className="recon-detail-lbl">المرجع</span>
            <span className="recon-detail-val">{tx.reference}</span>
          </div>
        )}
        {tx.chequeNumber && (
          <div className="recon-detail-row">
            <span className="recon-detail-lbl">رقم الشيك</span>
            <span className="recon-detail-val">{tx.chequeNumber}</span>
          </div>
        )}
        {tx.transactionId && (
          <div className="recon-detail-row">
            <span className="recon-detail-lbl">رقم العملية</span>
            <span className="recon-detail-val" style={{ fontSize: 11.5 }}>{tx.transactionId}</span>
          </div>
        )}
      </div>

      {/* Financial values */}
      <div className="recon-details-section">
        <p className="recon-details-sec-title">القيم المالية</p>
        {tx.debit > 0 && (
          <div className="recon-detail-row">
            <span className="recon-detail-lbl">مدين</span>
            <span className="recon-detail-val" style={{ color: 'var(--red)', fontFamily: 'monospace' }}>
              <PrivateAmount value={tx.debit} />
            </span>
          </div>
        )}
        {tx.credit > 0 && (
          <div className="recon-detail-row">
            <span className="recon-detail-lbl">دائن</span>
            <span className="recon-detail-val" style={{ color: 'var(--green)', fontFamily: 'monospace' }}>
              <PrivateAmount value={tx.credit} />
            </span>
          </div>
        )}
        {tx.balance != null && (
          <div className="recon-detail-row">
            <span className="recon-detail-lbl">الرصيد</span>
            <span className="recon-detail-val" style={{ fontFamily: 'monospace' }}>
              <PrivateAmount value={tx.balance} />
            </span>
          </div>
        )}
        <div className="recon-detail-row">
          <span className="recon-detail-lbl">العملة</span>
          <span className="recon-detail-val">{tx.currency || '—'}</span>
        </div>
      </div>

      {/* Classification */}
      <div className="recon-details-section">
        <p className="recon-details-sec-title">التصنيف والمصدر</p>
        <div className="recon-detail-row">
          <span className="recon-detail-lbl">النوع</span>
          <span>
            {tx.bankFeeType ? (
              <span className={`recon-cat ${tx.bankFeeType}`}>
                {CAT_ICONS[tx.bankFeeType] ?? '⚪'} {CAT_LABELS[tx.bankFeeType] ?? tx.bankFeeType}
              </span>
            ) : (
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>⚪ غير مصنف</span>
            )}
          </span>
        </div>
        <div className="recon-detail-row">
          <span className="recon-detail-lbl">البنك</span>
          <span className="recon-detail-val">{BANK_NAMES[tx.bankName] ?? tx.bankName}</span>
        </div>
        {tx.isDuplicate && (
          <div className="recon-detail-row">
            <span className="recon-detail-lbl">ملاحظة</span>
            <span className="recon-cat CHARGE">⊙ صف مكرر</span>
          </div>
        )}
      </div>

      {/* Data quality warnings */}
      {tx.warnings.length > 0 && (
        <div className="recon-details-section">
          <p className="recon-details-sec-title">تنبيهات جودة البيانات</p>
          <div className="recon-warnings-list">
            {tx.warnings.map((w, i) => (
              <span key={i} className="recon-warning-tag">⚠ {WARNING_LABELS[w] ?? w}</span>
            ))}
          </div>
        </div>
      )}

      {/* Raw data */}
      {showRaw && (
        <div className="recon-details-section">
          <p className="recon-details-sec-title">البيانات الخام</p>
          <div className="recon-raw-data"><code>{rawData}</code></div>
        </div>
      )}

      {/* Actions */}
      <div className="recon-details-actions">
        <button
          className="btn sm secondary"
          onClick={() => onCopy(tx.description, 'الوصف')}
        >
          📋 نسخ الوصف
        </button>
        {tx.reference && (
          <button
            className="btn sm secondary"
            onClick={() => onCopy(tx.reference!, 'المرجع')}
          >
            📋 نسخ المرجع
          </button>
        )}
        {tx.chequeNumber && (
          <button
            className="btn sm secondary"
            onClick={() => onCopy(tx.chequeNumber!, 'رقم الشيك')}
          >
            📋 نسخ رقم الشيك
          </button>
        )}
        <button
          className="btn sm ghost"
          onClick={() => setShowRaw((v) => !v)}
        >
          {'{}'} {showRaw ? 'إخفاء البيانات الخام' : 'عرض البيانات الخام'}
        </button>
      </div>
    </div>
  );
}

// ── ExplorerCharts ────────────────────────────────────────────────────────────

function ExplorerCharts({ workspace }: { workspace: ReconciliationWorkspace }) {
  const categoryData = useMemo(() => {
    const counts: Record<string, { name: string; value: number; fill: string }> = {};
    workspace.transactions.forEach((tx) => {
      const key   = tx.bankFeeType ?? 'UNCLASSIFIED';
      const label = CAT_LABELS[key] ?? 'غير مصنف';
      const fill  = CAT_COLORS[key] ?? '#94a3b8';
      if (!counts[key]) counts[key] = { name: label, value: 0, fill };
      counts[key].value++;
    });
    return Object.values(counts).sort((a, b) => b.value - a.value);
  }, [workspace]);

  const monthlyData = useMemo(() => {
    const months: Record<string, { month: string; مدين: number; دائن: number }> = {};
    workspace.transactions.forEach((tx) => {
      if (!tx.statementDate) return;
      const d = new Date(tx.statementDate);
      if (isNaN(d.getTime())) return;
      const key   = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('ar-KW', { year: 'numeric', month: 'short' });
      if (!months[key]) months[key] = { month: label, مدين: 0, دائن: 0 };
      months[key].مدين  += tx.debit;
      months[key].دائن  += tx.credit;
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
          <p className="recon-chart-title">توزيع أنواع المعاملات</p>
          <div className="recon-chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
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
          <p className="recon-chart-title">المدين والدائن الشهري (الصفحة الحالية)</p>
          <div className="recon-chart-wrap">
            {monthlyData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
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
                  <Bar dataKey="مدين"  fill="#ef4444" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="دائن"  fill="#10b981" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="recon-empty" style={{ padding: '24px 0' }}>
                <p className="recon-empty-sub">لا تتوفر بيانات تاريخ لعرض المخطط</p>
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

  // ── Toast ─────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'error' } | null>(null);
  const toastTimer        = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Export dropdown ────────────────────────────────────────────────────────
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef                       = useRef<HTMLDivElement>(null);

  // ── Delete current import ──────────────────────────────────────────────────
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [deleting, setDeleting]           = useState(false);

  const showToast = useCallback((msg: string, type: 'ok' | 'error' = 'ok') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, type });
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  // ── Copy helper ─────────────────────────────────────────────────────────────
  const copyText = useCallback((text: string, label: string) => {
    navigator.clipboard.writeText(text)
      .then(() => showToast(`تم نسخ ${label}`))
      .catch(() => showToast('تعذّر النسخ', 'error'));
  }, [showToast]);

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
      showToast('تم حذف الكشف البنكي بنجاح');
      setDeleteConfirm(null);
      setSelectedImportId(null);
      setImportMeta(null);
      setWorkspace(null);
    } catch (e) {
      showToast(errorMessage(e) || 'فشل حذف الكشف', 'error');
    } finally {
      setDeleting(false);
    }
  }, [deleteConfirm, showToast]);

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

  useEffect(() => {
    if (selectedImportId) loadWorkspace(selectedImportId, filter);
  }, [selectedImportId, filter, loadWorkspace]);

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
      <div className="recon-ws" dir="rtl">
        <div className="recon-empty">
          <div className="recon-empty-icon">🔒</div>
          <p className="recon-empty-title">لا توجد صلاحية</p>
          <p className="recon-empty-sub">ليس لديك صلاحية لعرض هذه الصفحة</p>
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
  const bankLabel = workspace ? (BANK_NAMES[workspace.bankName] ?? workspace.bankName) : '—';

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="recon-ws" dir="rtl">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="recon-ws-header">
        <div className="recon-ws-header-meta">
          <h1>{PAGE_TITLE}</h1>
          <p>{PAGE_SUBTITLE}</p>
          {workspace && (
            <div className="recon-ws-header-chips">
              <span className="recon-header-tag blue">🏦 {bankLabel}</span>
              <span className="recon-header-tag gray">📄 {workspace.fileName}</span>
              <span className="recon-header-tag gray">📊 {workspace.totalRows.toLocaleString()} عملية</span>
            </div>
          )}
        </div>
        <div className="recon-ws-header-actions">
          {/* Search */}
          <div style={{ position: 'relative' }}>
            <input
              type="search"
              placeholder="بحث في الوصف، المرجع، الشيك…"
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
            + استيراد جديد
          </button>
          <button
            type="button"
            className="btn secondary sm"
            onClick={() => { setSelectedImportId(null); setImportMeta(null); setWorkspace(null); }}
          >
            تغيير الكشف
          </button>
          {canExport && selectedImportId && (
            <div style={{ position: 'relative' }} ref={exportMenuRef}>
              <button
                type="button"
                className="btn sm"
                onClick={() => setExportMenuOpen((v) => !v)}
              >
                📤 تصدير ▾
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
                        showToast('تم تصدير ملف Excel بنجاح');
                      } catch { showToast('فشل تصدير Excel', 'error'); }
                    }}
                  >
                    📊 Excel (XLSX)
                  </button>
                  <button
                    type="button"
                    className="recon-export-item"
                    onClick={async () => {
                      setExportMenuOpen(false);
                      try {
                        await downloadExport(selectedImportId, 'pdf');
                        showToast('تم تصدير ملف PDF بنجاح');
                      } catch { showToast('فشل تصدير PDF', 'error'); }
                    }}
                  >
                    📄 PDF
                  </button>
                  <button
                    type="button"
                    className="recon-export-item"
                    onClick={() => {
                      setExportMenuOpen(false);
                      exportToCsv(displayedTransactions, `bank-statement-${selectedImportId}.csv`);
                      showToast('تم تصدير ملف CSV بنجاح');
                    }}
                  >
                    📋 CSV (البيانات المعروضة)
                  </button>
                  <div className="recon-export-divider" />
                  <button
                    type="button"
                    className="recon-export-item"
                    onClick={() => { setExportMenuOpen(false); window.print(); }}
                  >
                    🖨 طباعة
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
              title="حذف هذا الكشف البنكي"
            >
              🗑 حذف
            </button>
          )}
        </div>
      </div>

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

      {/* ── KPI Grid (analytical) ──────────────────────────────────────────── */}
      {workspace && (
        <div className="recon-kpi-grid">

          {/* Total operations */}
          <div className="recon-kpi">
            <div className="recon-kpi-icon" style={{ background: 'var(--blue-light)' }}>📊</div>
            <div className="recon-kpi-body">
              <p className="recon-kpi-label">إجمالي العمليات</p>
              <p className="recon-kpi-value" style={{ color: 'var(--blue)' }}>
                {workspace.totalRows.toLocaleString()}
              </p>
              <p className="recon-kpi-sub">كل عمليات الكشف</p>
            </div>
          </div>

          {/* Total debit */}
          <div className="recon-kpi">
            <div className="recon-kpi-icon" style={{ background: 'var(--red-light)' }}>↓</div>
            <div className="recon-kpi-body">
              <p className="recon-kpi-label">إجمالي المدين</p>
              <p className="recon-kpi-value" style={{ color: 'var(--red)', fontSize: 17 }}>
                <PrivateAmount value={wsDebit} currency="" />
              </p>
              <p className="recon-kpi-sub">{importMeta ? 'كامل الكشف' : 'الصفحة الحالية'}</p>
            </div>
          </div>

          {/* Total credit */}
          <div className="recon-kpi">
            <div className="recon-kpi-icon" style={{ background: 'var(--green-light)' }}>↑</div>
            <div className="recon-kpi-body">
              <p className="recon-kpi-label">إجمالي الدائن</p>
              <p className="recon-kpi-value" style={{ color: 'var(--green)', fontSize: 17 }}>
                <PrivateAmount value={wsCredit} currency="" />
              </p>
              <p className="recon-kpi-sub">{importMeta ? 'كامل الكشف' : 'الصفحة الحالية'}</p>
            </div>
          </div>

          {/* Cheques */}
          <button
            className={`recon-kpi clickable ${activeChip === 'cat:CHEQUE_PAYMENT' ? 'kpi-active' : ''}`}
            onClick={() => setQuickFilter({}, { bankFeeType: activeChip === 'cat:CHEQUE_PAYMENT' ? null : 'CHEQUE_PAYMENT' })}
          >
            <div className="recon-kpi-icon" style={{ background: '#dbeafe' }}>🔵</div>
            <div className="recon-kpi-body">
              <p className="recon-kpi-label">شيكات</p>
              <p className="recon-kpi-value" style={{ color: '#1d4ed8' }}>
                {analyticalStats.cheques.toLocaleString()}
              </p>
              <p className="recon-kpi-sub">الصفحة الحالية</p>
            </div>
          </button>

          {/* Transfers */}
          <button
            className={`recon-kpi clickable ${activeChip === 'cat:BANK_TRANSFER' ? 'kpi-active' : ''}`}
            onClick={() => setQuickFilter({}, { bankFeeType: activeChip === 'cat:BANK_TRANSFER' ? null : 'BANK_TRANSFER' })}
          >
            <div className="recon-kpi-icon" style={{ background: '#d1fae5' }}>🟢</div>
            <div className="recon-kpi-body">
              <p className="recon-kpi-label">تحويلات</p>
              <p className="recon-kpi-value" style={{ color: '#065f46' }}>
                {analyticalStats.transfers.toLocaleString()}
              </p>
              <p className="recon-kpi-sub">الصفحة الحالية</p>
            </div>
          </button>

          {/* Bank fees */}
          <button
            className={`recon-kpi clickable ${activeChip === 'bankfee' ? 'kpi-active' : ''}`}
            onClick={() => setQuickFilter({ isBankFee: activeChip === 'bankfee' ? undefined : true })}
          >
            <div className="recon-kpi-icon" style={{ background: '#ede9fe' }}>🟣</div>
            <div className="recon-kpi-body">
              <p className="recon-kpi-label">رسوم البنك</p>
              <p className="recon-kpi-value" style={{ color: '#5b21b6' }}>
                {analyticalStats.bankFees.toLocaleString()}
              </p>
              <p className="recon-kpi-sub">الصفحة الحالية</p>
            </div>
          </button>

          {/* Max debit — replaces "أكبر معاملة" */}
          <div className="recon-kpi">
            <div className="recon-kpi-icon" style={{ background: 'var(--red-light)' }}>⬇</div>
            <div className="recon-kpi-body">
              <p className="recon-kpi-label">أعلى سحب</p>
              <p className="recon-kpi-value" style={{ color: 'var(--red)', fontSize: 17 }}>
                <PrivateAmount value={analyticalStats.maxDebit} currency="" />
              </p>
              <p className="recon-kpi-sub">أكبر عملية مدين</p>
            </div>
          </div>

          {/* Max credit */}
          <div className="recon-kpi">
            <div className="recon-kpi-icon" style={{ background: 'var(--green-light)' }}>⬆</div>
            <div className="recon-kpi-body">
              <p className="recon-kpi-label">أعلى إيداع</p>
              <p className="recon-kpi-value" style={{ color: 'var(--green)', fontSize: 17 }}>
                <PrivateAmount value={analyticalStats.maxCredit} currency="" />
              </p>
              <p className="recon-kpi-sub">أكبر عملية دائن</p>
            </div>
          </div>

          {/* Average value */}
          <div className="recon-kpi">
            <div className="recon-kpi-icon" style={{ background: 'var(--surface-2)' }}>≈</div>
            <div className="recon-kpi-body">
              <p className="recon-kpi-label">متوسط المبلغ</p>
              <p className="recon-kpi-value" style={{ fontSize: 17 }}>
                <PrivateAmount value={analyticalStats.avg} currency="" />
              </p>
              <p className="recon-kpi-sub">الصفحة الحالية</p>
            </div>
          </div>

          {/* Package Z: First operation */}
          {importMeta?.fromDate && (
            <div className="recon-kpi">
              <div className="recon-kpi-icon" style={{ background: 'var(--surface-2)' }}>📅</div>
              <div className="recon-kpi-body">
                <p className="recon-kpi-label">أول عملية</p>
                <p className="recon-kpi-value" style={{ fontSize: 14 }}>
                  {fmtDate(importMeta.fromDate)}
                </p>
                <p className="recon-kpi-sub">بداية الكشف</p>
              </div>
            </div>
          )}

          {/* Package Z: Last operation */}
          {importMeta?.toDate && (
            <div className="recon-kpi">
              <div className="recon-kpi-icon" style={{ background: 'var(--surface-2)' }}>📅</div>
              <div className="recon-kpi-body">
                <p className="recon-kpi-label">آخر عملية</p>
                <p className="recon-kpi-value" style={{ fontSize: 14 }}>
                  {fmtDate(importMeta.toDate)}
                </p>
                <p className="recon-kpi-sub">نهاية الكشف</p>
              </div>
            </div>
          )}

          {/* Package Z: Statement duration */}
          {statementDuration != null && (
            <div className="recon-kpi">
              <div className="recon-kpi-icon" style={{ background: 'var(--surface-2)' }}>📆</div>
              <div className="recon-kpi-body">
                <p className="recon-kpi-label">مدة الكشف</p>
                <p className="recon-kpi-value">
                  {statementDuration.toLocaleString()}
                </p>
                <p className="recon-kpi-sub">يوم</p>
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
        <div className="recon-chips" role="group" aria-label="تصفية سريعة">
          <button
            className={`recon-chip ${activeChip === 'ALL' ? 'chip-active' : ''}`}
            onClick={() => setQuickFilter({})}
          >
            الكل <span className="recon-chip-badge">{workspace.totalRows}</span>
          </button>
          <button
            className={`recon-chip ${activeChip === 'debit' ? 'chip-active' : ''}`}
            onClick={() => setQuickFilter({}, { direction: activeChip === 'debit' ? null : 'debit' })}
          >
            ↓ مدين فقط
          </button>
          <button
            className={`recon-chip ${activeChip === 'credit' ? 'chip-active' : ''}`}
            onClick={() => setQuickFilter({}, { direction: activeChip === 'credit' ? null : 'credit' })}
          >
            ↑ دائن فقط
          </button>
          <button
            className={`recon-chip ${activeChip === 'cat:CHEQUE_PAYMENT' ? 'chip-active' : ''}`}
            onClick={() => setQuickFilter({}, { bankFeeType: activeChip === 'cat:CHEQUE_PAYMENT' ? null : 'CHEQUE_PAYMENT' })}
          >
            🔵 شيكات
            <span className="recon-chip-badge">{analyticalStats.cheques}</span>
          </button>
          <button
            className={`recon-chip ${activeChip === 'cat:BANK_TRANSFER' ? 'chip-active' : ''}`}
            onClick={() => setQuickFilter({}, { bankFeeType: activeChip === 'cat:BANK_TRANSFER' ? null : 'BANK_TRANSFER' })}
          >
            🟢 تحويلات
            <span className="recon-chip-badge">{analyticalStats.transfers}</span>
          </button>
          <button
            className={`recon-chip ${activeChip === 'cat:CASH_WITHDRAWAL' ? 'chip-active' : ''}`}
            onClick={() => setQuickFilter({}, { bankFeeType: activeChip === 'cat:CASH_WITHDRAWAL' ? null : 'CASH_WITHDRAWAL' })}
          >
            🟡 سحب نقدي
            <span className="recon-chip-badge">{analyticalStats.withdrawals}</span>
          </button>
          <button
            className={`recon-chip ${activeChip === 'bankfee' ? 'chip-active' : ''}`}
            onClick={() => setQuickFilter({ isBankFee: activeChip === 'bankfee' ? undefined : true })}
          >
            🟣 رسوم بنك
            <span className="recon-chip-badge">{analyticalStats.bankFees}</span>
          </button>
          <button
            className={`recon-chip ${activeChip === 'duplicate' ? 'chip-active' : ''}`}
            onClick={() => setQuickFilter({ isDuplicate: activeChip === 'duplicate' ? undefined : true })}
          >
            ⊙ مكررات
            {workspace.duplicates > 0 && <span className="recon-chip-badge">{workspace.duplicates}</span>}
          </button>
          <button
            className={`recon-chip ${activeChip === 'warnings' ? 'chip-active' : ''}`}
            onClick={() => setQuickFilter({}, { hasWarnings: activeChip !== 'warnings' })}
          >
            ⚠ تنبيهات
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
          فلاتر متقدمة
          {activeFilterCount > 0 && (
            <span className="recon-header-tag blue" style={{ padding: '2px 8px', fontSize: 11 }}>
              {activeFilterCount} نشط
            </span>
          )}
        </button>

        {filterOpen && (
          <div className="recon-filter-body">

            <div className="recon-filter-section">
              <p className="recon-filter-section-title">بحث نصي</p>
              <div className="recon-filter-row">
                <div className="recon-filter-field" style={{ maxWidth: 400 }}>
                  <label>بحث في الوصف أو المرجع أو رقم الشيك</label>
                  <input
                    type="text"
                    placeholder="اكتب للبحث…"
                    value={filterDraft.search ?? ''}
                    onChange={(e) => setFilterDraft((d) => ({ ...d, search: e.target.value || undefined }))}
                  />
                </div>
              </div>
            </div>

            <div className="recon-filter-section">
              <p className="recon-filter-section-title">نطاق التاريخ</p>
              <div className="recon-filter-row">
                <div className="recon-filter-field">
                  <label>من تاريخ</label>
                  <input
                    type="date"
                    value={filterDraft.fromDate ?? ''}
                    onChange={(e) => setFilterDraft((d) => ({ ...d, fromDate: e.target.value || undefined }))}
                  />
                </div>
                <div className="recon-filter-field">
                  <label>إلى تاريخ</label>
                  <input
                    type="date"
                    value={filterDraft.toDate ?? ''}
                    onChange={(e) => setFilterDraft((d) => ({ ...d, toDate: e.target.value || undefined }))}
                  />
                </div>
              </div>
            </div>

            <div className="recon-filter-section">
              <p className="recon-filter-section-title">نطاق المبلغ (د.ك)</p>
              <div className="recon-filter-row">
                <div className="recon-filter-field">
                  <label>من مبلغ</label>
                  <input
                    type="number" min="0" step="0.001" placeholder="0.000"
                    value={filterDraft.minAmount ?? ''}
                    onChange={(e) => setFilterDraft((d) => ({ ...d, minAmount: e.target.value ? parseFloat(e.target.value) : undefined }))}
                  />
                </div>
                <div className="recon-filter-field">
                  <label>إلى مبلغ</label>
                  <input
                    type="number" min="0" step="0.001" placeholder="بلا حد"
                    value={filterDraft.maxAmount ?? ''}
                    onChange={(e) => setFilterDraft((d) => ({ ...d, maxAmount: e.target.value ? parseFloat(e.target.value) : undefined }))}
                  />
                </div>
              </div>
            </div>

            <div className="recon-filter-section">
              <p className="recon-filter-section-title">نوع المعاملة والاتجاه</p>
              <div className="recon-filter-row">
                <div className="recon-filter-field">
                  <label>التصنيف</label>
                  <select
                    value={cfDraft.bankFeeType ?? ''}
                    onChange={(e) => setCfDraft((d) => ({ ...d, bankFeeType: (e.target.value as BankFeeType) || null }))}
                  >
                    <option value="">كل الأنواع</option>
                    {Object.entries(CAT_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{CAT_ICONS[k]} {v}</option>
                    ))}
                  </select>
                </div>
                <div className="recon-filter-field">
                  <label>الاتجاه</label>
                  <select
                    value={cfDraft.direction ?? ''}
                    onChange={(e) => setCfDraft((d) => ({ ...d, direction: (e.target.value as 'debit' | 'credit') || null }))}
                  >
                    <option value="">مدين ودائن</option>
                    <option value="debit">↓ مدين فقط</option>
                    <option value="credit">↑ دائن فقط</option>
                  </select>
                </div>
                <div className="recon-filter-field">
                  <label>العملة</label>
                  <input
                    type="text" placeholder="KWD، USD…"
                    value={cfDraft.currency}
                    onChange={(e) => setCfDraft((d) => ({ ...d, currency: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            <div className="recon-filter-section">
              <p className="recon-filter-section-title">جودة البيانات</p>
              <div className="recon-filter-row">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
                  <input
                    type="checkbox"
                    checked={cfDraft.hasWarnings}
                    onChange={(e) => setCfDraft((d) => ({ ...d, hasWarnings: e.target.checked }))}
                  />
                  عمليات بها تنبيهات جودة فقط
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
                  <input
                    type="checkbox"
                    checked={!!filterDraft.isDuplicate}
                    onChange={(e) => setFilterDraft((d) => ({ ...d, isDuplicate: e.target.checked || undefined }))}
                  />
                  صفوف مكررة فقط
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
                  <input
                    type="checkbox"
                    checked={!!filterDraft.isBankFee}
                    onChange={(e) => setFilterDraft((d) => ({ ...d, isBankFee: e.target.checked || undefined }))}
                  />
                  رسوم بنكية فقط
                </label>
              </div>
            </div>

            <div className="recon-filter-actions">
              <button className="btn secondary btn sm" onClick={resetFilter}>إعادة تعيين الكل</button>
              <button className="btn btn sm" onClick={applyFilter}>تطبيق الفلاتر</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Selection action bar ────────────────────────────────────────────── */}
      {selected.size > 0 && (
        <div className="recon-bulk-bar">
          <span className="recon-bulk-count">تم اختيار {selected.size} عملية</span>
          <div className="recon-bulk-divider" />
          <button
            className="btn sm secondary"
            onClick={() => {
              const descs = displayedTransactions
                .filter((t) => selected.has(t.id))
                .map((t) => t.description)
                .join('\n');
              copyText(descs, `${selected.size} وصف`);
            }}
          >
            📋 نسخ الأوصاف
          </button>
          <div className="recon-bulk-divider" />
          <button
            className="btn sm secondary"
            onClick={() => setSelected(new Set())}
            style={{ marginInlineStart: 'auto' }}
          >
            إلغاء الاختيار
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
                  {activeChip === 'ALL' ? 'لا توجد معاملات في هذا الكشف' : 'لا توجد نتائج للفلتر الحالي'}
                </p>
                <p className="recon-empty-sub">
                  {activeChip === 'ALL'
                    ? 'الكشف البنكي لا يحتوي على بيانات'
                    : 'جرّب تعديل الفلاتر أو مسحها للعرض الكامل'}
                </p>
                {activeChip !== 'ALL' && (
                  <div style={{ marginTop: 16 }}>
                    <button className="btn secondary btn sm" onClick={resetFilter}>
                      مسح الفلاتر
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <table aria-label="عمليات الكشف البنكي">
                <thead>
                  <tr>
                    <th style={{ width: 40, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={selected.size === displayedTransactions.length && displayedTransactions.length > 0}
                        onChange={toggleSelectAll}
                        aria-label="تحديد الكل"
                      />
                    </th>
                    <th>النوع</th>
                    <th>التاريخ</th>
                    <th style={{ minWidth: 200 }}>الوصف</th>
                    <th>المرجع</th>
                    <th style={{ textAlign: 'end' }}>مدين (د.ك)</th>
                    <th style={{ textAlign: 'end' }}>دائن (د.ك)</th>
                    <th style={{ textAlign: 'end' }}>الرصيد</th>
                    <th>العملة</th>
                    <th style={{ width: 36 }}>⚠</th>
                    <th className="th-actions">إجراء</th>
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
                              aria-label={`تحديد: ${tx.description}`}
                            />
                          </td>

                          {/* Category */}
                          <td>
                            {tx.bankFeeType ? (
                              <span className={`recon-cat ${tx.bankFeeType}`}>
                                {CAT_ICONS[tx.bankFeeType] ?? '⚪'} {CAT_LABELS[tx.bankFeeType] ?? tx.bankFeeType}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontSize: 11.5 }}>⚪ غير مصنف</span>
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
                                  aria-label={isDescExpanded ? 'طي الوصف' : 'توسيع الوصف'}
                                  title={isDescExpanded ? 'طي' : 'توسيع'}
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
                          <td style={{ textAlign: 'center', fontSize: 14 }} title={hasWarnings ? tx.warnings.map((w) => WARNING_LABELS[w] ?? w).join('، ') : undefined}>
                            {hasWarnings ? '⚠' : ''}
                          </td>

                          {/* Actions */}
                          <td className="td-actions" onClick={(e) => e.stopPropagation()}>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button
                                className="btn sm ghost"
                                style={{ padding: '4px 8px', fontSize: 11 }}
                                onClick={() => copyText(tx.description, 'الوصف')}
                                title="نسخ الوصف"
                              >
                                📋
                              </button>
                              <button
                                className="btn sm ghost"
                                style={{ padding: '4px 8px', fontSize: 11 }}
                                onClick={() => setSelectedTx(isActive ? null : tx)}
                                title="عرض التفاصيل"
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
                عرض {((filter.page ?? 1) - 1) * (filter.pageSize ?? 50) + 1}–
                {Math.min((filter.page ?? 1) * (filter.pageSize ?? 50), workspace.total)} من {workspace.total.toLocaleString()} عملية
              </span>
              <div className="pg-btns">
                <button
                  className="btn sm secondary"
                  disabled={(filter.page ?? 1) <= 1}
                  onClick={() => setFilter((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}
                >
                  السابق
                </button>
                <button
                  className="btn sm secondary"
                  disabled={(filter.page ?? 1) * (filter.pageSize ?? 50) >= workspace.total}
                  onClick={() => setFilter((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
                >
                  التالي
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
            <h3 style={{ fontSize: 15, fontWeight: 800 }}>التحليل البصري</h3>
            <button
              className="btn sm secondary"
              onClick={() => setShowCharts((v) => !v)}
            >
              {showCharts ? 'إخفاء الرسوم البيانية' : 'عرض الرسوم البيانية'}
            </button>
          </div>
          {showCharts && <ExplorerCharts workspace={workspace} />}
        </>
      )}

      {/* ── Delete current import confirmation (Package AD) ─────────────────── */}
      {deleteConfirm && (
        <ConfirmModal
          title="حذف الكشف البنكي"
          message="هل أنت متأكد من حذف هذا الكشف البنكي؟ سيتم حذف جميع المعاملات المرتبطة به. هذا الإجراء لا يمكن التراجع عنه."
          confirmLabel="حذف"
          onConfirm={handleDeleteCurrentImport}
          onCancel={() => setDeleteConfirm(null)}
          loading={deleting}
        />
      )}

      {/* ── Toast ──────────────────────────────────────────────────────────────── */}
      {toast && (
        <div className={`recon-toast ${toast.type}`} role="alert">
          {toast.type === 'ok' ? '✓' : '⚠'} {toast.msg}
        </div>
      )}
    </div>
  );
}
