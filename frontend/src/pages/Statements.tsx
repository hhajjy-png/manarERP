import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { statementsApi, type StatementResult, type StatementFilters, type StatementEntry } from '../api/statements';

// ─── Status translations ───────────────────────────────────────────────────────
const STATUS_AR: Record<string, string> = {
  UNPAID: 'غير مسدد',
  PARTIAL: 'مسدد جزئياً',
  PAID: 'مسدد',
  OVERDUE: 'متأخر',
  CANCELLED: 'ملغى',
  PENDING: 'قيد الانتظار',
  APPROVED: 'معتمد',
  REJECTED: 'مرفوض',
  REVERSED: 'مسترجع',
};

const REF_TYPE_AR: Record<string, string> = {
  INVOICE: 'فاتورة',
  PAYMENT: 'دفعة',
  EXPENSE: 'مصروف',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const kwd = (n: number) =>
  n.toLocaleString('ar-KW', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

const dateText = (d: string | Date) => {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return dt.toLocaleDateString('ar-KW', { year: 'numeric', month: '2-digit', day: '2-digit' });
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface EntityOption { id: number; name: string; code: string; }

type TabKey = 'customers' | 'suppliers';

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Statements() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>('customers');
  const [bannerVisible, setBannerVisible] = useState(
    !localStorage.getItem('statements.bannerDismissed')
  );

  return (
    <div style={{ padding: '0 24px 24px', direction: 'rtl' }}>
      {bannerVisible && (
        <div className="migration-banner info-banner" dir="rtl">
          <span>🆕 يتوفر الإصدار الجديد من كشف الحساب داخل المحاسبة المالية</span>
          <button
            type="button"
            className="banner-action-btn"
            onClick={() => navigate('/financial?tab=statement')}
          >
            فتح الإصدار الجديد
          </button>
          <button
            type="button"
            className="banner-dismiss-btn"
            aria-label="إغلاق"
            onClick={() => { localStorage.setItem('statements.bannerDismissed', '1'); setBannerVisible(false); }}
          >
            ✕
          </button>
        </div>
      )}
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '16px 0 20px' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 28, color: '#1d4e6f' }}>
          account_balance_wallet
        </span>
        <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, color: '#1d4e6f' }}>
          مركز كشف الحساب
        </h1>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '2px solid #e5e7eb' }}>
        {(['customers', 'suppliers'] as TabKey[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '8px 20px',
              border: 'none',
              borderBottom: activeTab === tab ? '2px solid #1d4e6f' : '2px solid transparent',
              marginBottom: -2,
              background: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: '0.95rem',
              fontWeight: activeTab === tab ? 700 : 400,
              color: activeTab === tab ? '#1d4e6f' : '#6b7280',
              transition: 'all 0.15s',
            }}
          >
            {tab === 'customers' ? 'كشف حساب العملاء' : 'كشف حساب الموردين'}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'customers' && (
        <StatementTab
          entityType="customers"
          apiUrl="/customers"
          label="العميل"
          fetchStatement={(id, filters) => statementsApi.getCustomerStatement(id, filters)}
          exportStatement={(id, filters, name) => statementsApi.exportCustomer(id, filters, name)}
          onClickInvoice={(id) => navigate(`/invoices/${id}/preview`)}
          onClickExpense={() => { /* future */ }}
        />
      )}
      {activeTab === 'suppliers' && (
        <StatementTab
          entityType="suppliers"
          apiUrl="/suppliers"
          label="المورد"
          fetchStatement={(id, filters) => statementsApi.getSupplierStatement(id, filters)}
          exportStatement={(id, filters, name) => statementsApi.exportSupplier(id, filters, name)}
          onClickInvoice={(id) => navigate(`/invoices/${id}/preview`)}
          onClickExpense={(id) => navigate(`/expenses?highlight=${id}`)}
        />
      )}
    </div>
  );
}

// ─── StatementTab ─────────────────────────────────────────────────────────────
interface StatementTabProps {
  entityType: 'customers' | 'suppliers';
  apiUrl: string;
  label: string;
  fetchStatement: (id: number, filters: StatementFilters) => Promise<StatementResult>;
  exportStatement: (id: number, filters: StatementFilters, name: string) => Promise<void>;
  onClickInvoice: (id: number) => void;
  onClickExpense: (id: number) => void;
}

function StatementTab({
  entityType,
  apiUrl,
  label,
  fetchStatement,
  exportStatement,
  onClickInvoice,
  onClickExpense,
}: StatementTabProps) {
  const [entities, setEntities] = useState<EntityOption[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [search, setSearch] = useState('');
  const [refType, setRefType] = useState('');
  const [result, setResult] = useState<StatementResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const cancelRef = useRef(false);

  // Load entity list
  useEffect(() => {
    api.get(apiUrl, { params: { pageSize: 500, page: 1 } }).then((r) => {
      const list: EntityOption[] = (r.data.data.data ?? []).map((e: { id: number; name: string; code: string }) => ({
        id: e.id,
        name: e.name,
        code: e.code,
      }));
      setEntities(list);
    }).catch(() => {});
  }, [apiUrl]);

  const load = useCallback(async () => {
    if (!selectedId) return;
    cancelRef.current = false;
    setLoading(true);
    setError(null);
    try {
      const filters: StatementFilters = {
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        search: search || undefined,
        referenceType: (refType as StatementFilters['referenceType']) || undefined,
      };
      const data = await fetchStatement(selectedId, filters);
      if (!cancelRef.current) setResult(data);
    } catch {
      if (!cancelRef.current) setError('تعذّر تحميل كشف الحساب');
    } finally {
      if (!cancelRef.current) setLoading(false);
    }
  }, [selectedId, fromDate, toDate, search, refType, fetchStatement]);

  useEffect(() => {
    cancelRef.current = true;
    setResult(null);
  }, [selectedId]);

  async function doExport() {
    if (!selectedId || !result) return;
    setExporting(true);
    setExportError(null);
    try {
      const filters: StatementFilters = {
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        search: search || undefined,
        referenceType: (refType as StatementFilters['referenceType']) || undefined,
      };
      await exportStatement(selectedId, filters, result.entityName);
    } catch {
      setExportError('تعذّر تصدير كشف الحساب، يرجى المحاولة مجدداً');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      {/* Filter Bar */}
      <div
        style={{
          background: '#f8fafc',
          border: '1px solid #e5e7eb',
          borderRadius: 10,
          padding: '16px 20px',
          marginBottom: 20,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          alignItems: 'flex-end',
        }}
      >
        {/* Entity picker */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: '0.78rem', color: '#6b7280', fontWeight: 600 }}>{label}</label>
          <select
            value={selectedId ?? ''}
            onChange={(e) => setSelectedId(e.target.value ? Number(e.target.value) : null)}
            style={{
              padding: '7px 12px', border: '1px solid #d1d5db', borderRadius: 6,
              fontFamily: 'inherit', fontSize: '0.9rem', minWidth: 200, background: '#fff',
            }}
          >
            <option value="">— اختر {label} —</option>
            {entities.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </div>

        {/* Date From */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: '0.78rem', color: '#6b7280', fontWeight: 600 }}>من تاريخ</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            style={{
              padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6,
              fontFamily: 'inherit', fontSize: '0.9rem',
            }}
          />
        </div>

        {/* Date To */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: '0.78rem', color: '#6b7280', fontWeight: 600 }}>إلى تاريخ</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            style={{
              padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6,
              fontFamily: 'inherit', fontSize: '0.9rem',
            }}
          />
        </div>

        {/* Reference Type */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: '0.78rem', color: '#6b7280', fontWeight: 600 }}>النوع</label>
          <select
            value={refType}
            onChange={(e) => setRefType(e.target.value)}
            style={{
              padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6,
              fontFamily: 'inherit', fontSize: '0.9rem', minWidth: 130, background: '#fff',
            }}
          >
            <option value="">الكل</option>
            <option value="INVOICE">فاتورة</option>
            <option value="PAYMENT">دفعة</option>
            {entityType === 'suppliers' && <option value="EXPENSE">مصروف</option>}
          </select>
        </div>

        {/* Search */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: '0.78rem', color: '#6b7280', fontWeight: 600 }}>بحث</label>
          <input
            type="text"
            placeholder="مرجع أو بيان..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
            style={{
              padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6,
              fontFamily: 'inherit', fontSize: '0.9rem', width: 180,
            }}
          />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button
            onClick={load}
            disabled={!selectedId || loading}
            style={{
              padding: '8px 20px', background: '#1d4e6f', color: '#fff',
              border: 'none', borderRadius: 7, cursor: 'pointer',
              fontFamily: 'inherit', fontSize: '0.9rem', fontWeight: 600,
              opacity: !selectedId || loading ? 0.6 : 1,
            }}
          >
            {loading ? 'جارٍ التحميل…' : 'عرض'}
          </button>

          <button
            onClick={doExport}
            disabled={!result || exporting}
            style={{
              padding: '8px 16px', background: '#059669', color: '#fff',
              border: 'none', borderRadius: 7, cursor: 'pointer',
              fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 600,
              opacity: !result || exporting ? 0.6 : 1,
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>download</span>
            {exporting ? 'جارٍ التصدير…' : 'Excel'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8,
          padding: '12px 16px', color: '#b91c1c', marginBottom: 16,
        }}>
          {error}
        </div>
      )}
      {exportError && (
        <div style={{
          background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8,
          padding: '12px 16px', color: '#b91c1c', marginBottom: 16,
        }}>
          {exportError}
        </div>
      )}

      {/* Empty state — no entity selected */}
      {!selectedId && !loading && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#9ca3af' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 48, display: 'block', marginBottom: 12 }}>
            account_balance_wallet
          </span>
          <p style={{ margin: 0, fontSize: '0.95rem' }}>اختر {label} لعرض كشف الحساب</p>
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <>
          {/* Entity header */}
          <div style={{ marginBottom: 16 }}>
            <h2 style={{ margin: '0 0 2px', fontSize: '1.1rem', fontWeight: 700, color: '#1d4e6f' }}>
              {result.entityName}
            </h2>
            <span style={{ fontSize: '0.82rem', color: '#6b7280' }}>{result.entityCode}</span>
            {result.fromDate && (
              <span style={{ fontSize: '0.82rem', color: '#6b7280', marginRight: 12 }}>
                {dateText(result.fromDate)} — {result.toDate ? dateText(result.toDate) : 'الآن'}
              </span>
            )}
          </div>

          {/* Summary Cards */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
            <SummaryCard label="الرصيد الافتتاحي" value={result.summary.openingBalance} color="#6b7280" />
            <SummaryCard label="إجمالي المدين" value={result.summary.totalDebit} color="#16a34a" />
            <SummaryCard label="إجمالي الدائن" value={result.summary.totalCredit} color="#dc2626" />
            <SummaryCard
              label="الرصيد الختامي"
              value={result.summary.closingBalance}
              color={result.summary.closingBalance < 0 ? '#dc2626' : '#1d4e6f'}
              highlight
            />
            <SummaryCard label="عدد الحركات" value={result.summary.transactionCount} color="#6b7280" isCount />
          </div>

          {/* Transaction Table */}
          {result.entries.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af', fontSize: '0.9rem' }}>
              لا توجد حركات في هذه الفترة
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{
                width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem',
                border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden',
              }}>
                <thead>
                  <tr style={{ background: '#1d4e6f', color: '#fff' }}>
                    {['التاريخ', 'المرجع', 'النوع', 'البيان', 'مدين', 'دائن', 'الرصيد', 'الحالة'].map((h) => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.entries.map((entry, i) => (
                    <StatementRow
                      key={entry.id}
                      entry={entry}
                      index={i}
                      onClickInvoice={onClickInvoice}
                      onClickExpense={onClickExpense}
                    />
                  ))}
                </tbody>
                {/* Footer totals */}
                <tfoot>
                  <tr style={{ background: '#f0f3f7', fontWeight: 700 }}>
                    <td colSpan={4} style={{ padding: '10px 12px', textAlign: 'right', color: '#374151' }}>
                      الإجمالي
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#16a34a' }}>
                      {kwd(result.summary.totalDebit)}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#dc2626' }}>
                      {kwd(result.summary.totalCredit)}
                    </td>
                    <td
                      style={{
                        padding: '10px 12px', textAlign: 'right', fontWeight: 700,
                        color: result.summary.closingBalance < 0 ? '#dc2626' : '#1d4e6f',
                      }}
                    >
                      {kwd(result.summary.closingBalance)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Summary Card ─────────────────────────────────────────────────────────────
function SummaryCard({
  label,
  value,
  color,
  highlight = false,
  isCount = false,
}: {
  label: string;
  value: number;
  color: string;
  highlight?: boolean;
  isCount?: boolean;
}) {
  return (
    <div
      style={{
        background: highlight ? '#eff6ff' : '#fff',
        border: `1px solid ${highlight ? '#bfdbfe' : '#e5e7eb'}`,
        borderRadius: 10,
        padding: '14px 18px',
        minWidth: 160,
        flex: '1 1 160px',
      }}
    >
      <div style={{ fontSize: '0.78rem', color: '#6b7280', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: '1.25rem', fontWeight: 700, color }}>
        {isCount ? value.toLocaleString('ar') : kwd(value)}
        {!isCount && <span style={{ fontSize: '0.7rem', color: '#9ca3af', marginRight: 4 }}>د.ك</span>}
      </div>
    </div>
  );
}

// ─── Statement Row ────────────────────────────────────────────────────────────
function StatementRow({
  entry,
  index,
  onClickInvoice,
  onClickExpense,
}: {
  entry: StatementEntry;
  index: number;
  onClickInvoice: (id: number) => void;
  onClickExpense: (id: number) => void;
}) {
  const isEven = index % 2 === 0;

  function handleRefClick() {
    if (entry.referenceType === 'INVOICE') onClickInvoice(entry.referenceId);
    else if (entry.referenceType === 'EXPENSE') onClickExpense(entry.referenceId);
  }

  const isClickable = entry.referenceType === 'INVOICE' || entry.referenceType === 'EXPENSE';

  return (
    <tr
      style={{ background: isEven ? '#fff' : '#f9fafb', transition: 'background 0.1s' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = '#f0f6ff')}
      onMouseLeave={(e) => (e.currentTarget.style.background = isEven ? '#fff' : '#f9fafb')}
    >
      {/* Date */}
      <td style={{ padding: '9px 12px', color: '#374151', whiteSpace: 'nowrap' }}>
        {dateText(entry.date)}
      </td>

      {/* Reference — clickable for invoices */}
      <td style={{ padding: '9px 12px' }}>
        <span
          onClick={isClickable ? handleRefClick : undefined}
          style={{
            color: isClickable ? '#1d4e6f' : '#374151',
            fontWeight: isClickable ? 600 : 400,
            cursor: isClickable ? 'pointer' : 'default',
            textDecoration: isClickable ? 'underline' : 'none',
          }}
        >
          {entry.reference}
        </span>
      </td>

      {/* Type */}
      <td style={{ padding: '9px 12px', color: '#6b7280', fontSize: '0.82rem' }}>
        {REF_TYPE_AR[entry.referenceType] ?? entry.referenceType}
      </td>

      {/* Description */}
      <td style={{ padding: '9px 12px', color: '#4b5563', maxWidth: 280 }}>
        {entry.description}
      </td>

      {/* Debit — green */}
      <td style={{
        padding: '9px 12px', textAlign: 'right',
        color: entry.debit > 0 ? '#16a34a' : '#d1d5db',
        fontWeight: entry.debit > 0 ? 600 : 400,
      }}>
        {entry.debit > 0 ? kwd(entry.debit) : '—'}
      </td>

      {/* Credit — red */}
      <td style={{
        padding: '9px 12px', textAlign: 'right',
        color: entry.credit > 0 ? '#dc2626' : '#d1d5db',
        fontWeight: entry.credit > 0 ? 600 : 400,
      }}>
        {entry.credit > 0 ? kwd(entry.credit) : '—'}
      </td>

      {/* Running Balance */}
      <td style={{
        padding: '9px 12px', textAlign: 'right', fontWeight: 700,
        color: entry.runningBalance < 0 ? '#dc2626' : '#1d4e6f',
      }}>
        {kwd(entry.runningBalance)}
      </td>

      {/* Status */}
      <td style={{ padding: '9px 12px' }}>
        <span style={{
          padding: '3px 8px', borderRadius: 12, fontSize: '0.75rem', fontWeight: 600,
          background: statusBg(entry.status), color: statusColor(entry.status),
        }}>
          {STATUS_AR[entry.status] ?? entry.status}
        </span>
      </td>
    </tr>
  );
}

function statusBg(s: string) {
  if (s === 'PAID' || s === 'APPROVED') return '#dcfce7';
  if (s === 'UNPAID' || s === 'PENDING') return '#fef3c7';
  if (s === 'PARTIAL') return '#dbeafe';
  if (s === 'OVERDUE') return '#fee2e2';
  return '#f3f4f6';
}

function statusColor(s: string) {
  if (s === 'PAID' || s === 'APPROVED') return '#16a34a';
  if (s === 'UNPAID' || s === 'PENDING') return '#b45309';
  if (s === 'PARTIAL') return '#1d4ed8';
  if (s === 'OVERDUE') return '#dc2626';
  return '#6b7280';
}
