import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../stores/authStore';
import { errorMessage } from '../api/client';
import {
  getWorkspace,
  updateStatus,
  bulkUpdateStatus,
  getPostingSuggestions,
  getExportUrl,
  listImports,
  type ReconciliationTransaction,
  type ReconciliationWorkspace,
  type ReconcileStatus,
  type PostingSuggestion,
  type ImportListItem,
  type WorkspaceFilter,
} from '../api/bankStatementImport';

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<ReconcileStatus, string> = {
  UNMATCHED: 'غير مطابق',
  MATCHED:   'مطابق',
  IGNORED:   'متجاهل',
  DUPLICATE: 'مكرر',
  REVIEW:    'مراجعة',
};

const STATUS_COLORS: Record<ReconcileStatus, string> = {
  UNMATCHED: 'bg-gray-100 text-gray-700',
  MATCHED:   'bg-green-100 text-green-700',
  IGNORED:   'bg-slate-100 text-slate-500',
  DUPLICATE: 'bg-orange-100 text-orange-700',
  REVIEW:    'bg-yellow-100 text-yellow-700',
};

const BANK_NAMES: Record<string, string> = {
  NBK:         'بنك الكويت الوطني',
  KFH:         'بيت التمويل الكويتي',
  GULF_BANK:   'بنك الخليج',
  BOUBYAN:     'بنك بوبيان',
  WARBA:       'بنك وربة',
  AHLI_UNITED: 'البنك الأهلي المتحد',
  UNKNOWN:     'بنك غير معروف',
};

const MATCH_TYPE_AR: Record<string, string> = {
  invoice: 'فاتورة',
  payment: 'دفعة',
  expense: 'مصروف',
  journal: 'يومية',
  cheque:  'شيك',
  payroll: 'رواتب',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtAmount(v: number) {
  return v.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('ar-KW');
}

// ── Import selector (when no importId in URL) ─────────────────────────────────

function ImportSelector({ onSelect }: { onSelect: (id: number) => void }) {
  const [imports, setImports] = useState<ImportListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    listImports(1, 50)
      .then((r) => setImports(r.items))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-center text-gray-400">جارٍ التحميل…</div>;

  if (imports.length === 0) {
    return (
      <div className="p-8 text-center" dir="rtl">
        <p className="text-gray-500 mb-4">لا توجد كشوف بنكية مستوردة حتى الآن.</p>
        <button
          onClick={() => navigate('/bank-statement-import')}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          استيراد كشف حساب
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6" dir="rtl">
      <h2 className="text-xl font-bold mb-4">اختر كشف الحساب للمطابقة</h2>
      <div className="space-y-2">
        {imports.map((imp) => (
          <button
            key={imp.id}
            onClick={() => onSelect(imp.id)}
            className="w-full text-right p-4 bg-white border border-gray-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-colors"
          >
            <div className="flex justify-between items-start">
              <div>
                <p className="font-semibold">{BANK_NAMES[imp.bankName] ?? imp.bankName}</p>
                <p className="text-sm text-gray-500">{imp.fileName}</p>
              </div>
              <div className="text-left">
                <p className="text-sm text-gray-600">{fmtDate(imp.importedAt.substring(0, 10))}</p>
                <p className="text-sm text-gray-500">{imp.totalRows.toLocaleString()} صف</p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Posting suggestions panel ─────────────────────────────────────────────────

function PostingSuggestionsPanel({
  importId,
  tx,
  onClose,
  onStatusChanged,
}: {
  importId:        number;
  tx:              ReconciliationTransaction;
  onClose:         () => void;
  onStatusChanged: () => void;
}) {
  const [suggestions, setSuggestions] = useState<PostingSuggestion[]>([]);
  const [loading, setLoading]         = useState(true);
  const [applying, setApplying]       = useState(false);
  const [error, setError]             = useState<string | null>(null);

  useEffect(() => {
    getPostingSuggestions(importId, tx.id)
      .then(setSuggestions)
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }, [importId, tx.id]);

  const apply = useCallback(async (s: PostingSuggestion) => {
    if (s.type === 'IGNORE') {
      setApplying(true);
      try {
        await updateStatus(importId, tx.id, { status: 'IGNORED' });
        onStatusChanged();
        onClose();
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setApplying(false);
      }
    } else {
      // For now, mark as MATCHED with the linked record details
      setApplying(true);
      try {
        await updateStatus(importId, tx.id, {
          status:          'MATCHED',
          matchedType:     s.linkedType,
          matchedId:       s.linkedId,
          matchedRef:      s.linkedRef,
          matchConfidence: s.confidence,
        });
        onStatusChanged();
        onClose();
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setApplying(false);
      }
    }
  }, [importId, tx.id, onClose, onStatusChanged]);

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 m-4"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-lg font-bold">اقتراحات الترحيل</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        <div className="mb-4 p-3 bg-gray-50 rounded-lg text-sm">
          <p className="font-medium">{tx.description}</p>
          <p className="text-gray-500 mt-1">
            {tx.debit > 0 ? `مدين: ${fmtAmount(tx.debit)} د.ك` : `دائن: ${fmtAmount(tx.credit)} د.ك`}
            {' · '}{fmtDate(tx.statementDate)}
          </p>
        </div>

        {error && <div className="mb-3 p-3 bg-red-50 text-red-700 rounded text-sm">{error}</div>}

        {loading ? (
          <div className="text-center py-4 text-gray-400">جارٍ التحميل…</div>
        ) : (
          <div className="space-y-2">
            {suggestions.map((s, i) => (
              <button
                key={i}
                disabled={applying}
                onClick={() => apply(s)}
                className="w-full text-right p-3 border border-gray-200 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors disabled:opacity-50"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium text-sm">{s.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{s.description}</p>
                  </div>
                  {s.confidence > 0 && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                      {s.confidence}%
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main workspace ────────────────────────────────────────────────────────────

export default function BankReconciliation() {
  const { importId: importIdParam } = useParams<{ importId?: string }>();
  const { hasPermission }  = useAuth();
  const navigate           = useNavigate();

  const [selectedImportId, setSelectedImportId] = useState<number | null>(
    importIdParam ? parseInt(importIdParam, 10) : null,
  );
  const [workspace, setWorkspace]     = useState<ReconciliationWorkspace | null>(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);

  // Filters
  const [filter, setFilter]           = useState<WorkspaceFilter>({ page: 1, pageSize: 50 });
  const [search, setSearch]           = useState('');
  const searchTimer                   = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Selection for bulk actions
  const [selected, setSelected]       = useState<Set<number>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  // Suggestions panel
  const [suggTx, setSuggTx]           = useState<ReconciliationTransaction | null>(null);

  // ── Load workspace ──────────────────────────────────────────────────────────

  const loadWorkspace = useCallback(async (importId: number, f: WorkspaceFilter) => {
    setLoading(true);
    setError(null);
    try {
      const ws = await getWorkspace(importId, f);
      setWorkspace(ws);
      setSelected(new Set());
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

  // ── Bulk action ─────────────────────────────────────────────────────────────

  const doBulkUpdate = useCallback(async (status: ReconcileStatus) => {
    if (!selectedImportId || selected.size === 0) return;
    setBulkLoading(true);
    try {
      const res = await bulkUpdateStatus(selectedImportId, [...selected], status);
      await loadWorkspace(selectedImportId, filter);
      alert(`تم تحديث ${res.updated} معاملة`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBulkLoading(false);
    }
  }, [selectedImportId, selected, filter, loadWorkspace]);

  // ── Single status update ────────────────────────────────────────────────────

  const doSingleUpdate = useCallback(async (txId: number, status: ReconcileStatus) => {
    if (!selectedImportId) return;
    try {
      await updateStatus(selectedImportId, txId, { status });
      await loadWorkspace(selectedImportId, filter);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [selectedImportId, filter, loadWorkspace]);

  // ── Guard ───────────────────────────────────────────────────────────────────

  if (!hasPermission('bankStatementImport.read')) {
    return <div className="p-8 text-center text-gray-500" dir="rtl">ليس لديك صلاحية لعرض هذه الصفحة.</div>;
  }

  // ── Import selector ─────────────────────────────────────────────────────────

  if (!selectedImportId) {
    return <ImportSelector onSelect={setSelectedImportId} />;
  }

  // ── Main workspace UI ───────────────────────────────────────────────────────

  return (
    <div className="max-w-7xl mx-auto p-4" dir="rtl">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">مساحة المطابقة البنكية</h1>
          {workspace && (
            <p className="text-gray-500 text-sm mt-1">
              {BANK_NAMES[workspace.bankName] ?? workspace.bankName} — {workspace.fileName}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate('/bank-statement-import')}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
          >
            استيراد جديد
          </button>
          <button
            onClick={() => setSelectedImportId(null)}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
          >
            تغيير الكشف
          </button>
          {hasPermission('bankStatementImport.export') && selectedImportId && (
            <>
              <a
                href={getExportUrl(selectedImportId, 'excel')}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
              >
                تصدير Excel
              </a>
              <a
                href={getExportUrl(selectedImportId, 'pdf')}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700"
              >
                تصدير PDF
              </a>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      {/* Status summary cards */}
      {workspace && (
        <div className="grid grid-cols-5 gap-3 mb-6">
          {([
            { label: 'غير مطابق', count: workspace.unmatched,  status: 'UNMATCHED',  color: 'gray'   },
            { label: 'مطابق',     count: workspace.matched,    status: 'MATCHED',    color: 'green'  },
            { label: 'مراجعة',   count: workspace.review,     status: 'REVIEW',     color: 'yellow' },
            { label: 'مكرر',      count: workspace.duplicates, status: 'DUPLICATE',  color: 'orange' },
            { label: 'متجاهل',   count: workspace.ignored,    status: 'IGNORED',    color: 'slate'  },
          ] as { label: string; count: number; status: ReconcileStatus; color: string }[]).map(({ label, count, status, color }) => (
            <button
              key={status}
              onClick={() => setFilter((f) => ({ ...f, status: f.status === status ? undefined : status, page: 1 }))}
              className={`p-4 rounded-xl border-2 text-right transition-colors
                ${filter.status === status ? `border-${color}-400 bg-${color}-50` : 'border-gray-200 bg-white hover:border-gray-300'}`}
            >
              <p className="text-sm text-gray-500">{label}</p>
              <p className={`text-2xl font-bold text-${color}-700 mt-1`}>{count.toLocaleString()}</p>
            </button>
          ))}
        </div>
      )}

      {/* Filters bar */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="بحث في الوصف أو المرجع…"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 min-w-48"
        />
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={filter.isBankFee === true}
            onChange={(e) => setFilter((f) => ({ ...f, isBankFee: e.target.checked ? true : undefined, page: 1 }))}
          />
          رسوم بنكية فقط
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={filter.isDuplicate === true}
            onChange={(e) => setFilter((f) => ({ ...f, isDuplicate: e.target.checked ? true : undefined, page: 1 }))}
          />
          مكررات فقط
        </label>
        {(filter.status || filter.isBankFee || filter.isDuplicate || filter.search) && (
          <button
            onClick={() => { setFilter({ page: 1, pageSize: 50 }); setSearch(''); }}
            className="text-sm text-blue-600 hover:underline"
          >
            مسح الفلاتر
          </button>
        )}
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && hasPermission('bankStatementImport.reconcile') && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 flex items-center gap-3">
          <span className="text-sm text-blue-700 font-medium">تم اختيار {selected.size} معاملة</span>
          <button onClick={() => doBulkUpdate('MATCHED')}  disabled={bulkLoading} className="px-3 py-1 bg-green-600 text-white rounded text-sm disabled:opacity-50">قبول مطابقة</button>
          <button onClick={() => doBulkUpdate('IGNORED')}  disabled={bulkLoading} className="px-3 py-1 bg-gray-500  text-white rounded text-sm disabled:opacity-50">تجاهل</button>
          <button onClick={() => doBulkUpdate('REVIEW')}   disabled={bulkLoading} className="px-3 py-1 bg-yellow-500 text-white rounded text-sm disabled:opacity-50">للمراجعة</button>
          <button onClick={() => setSelected(new Set())} className="text-sm text-gray-500 hover:text-gray-700 mr-auto">إلغاء</button>
        </div>
      )}

      {/* Transaction table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">جارٍ التحميل…</div>
        ) : !workspace || workspace.transactions.length === 0 ? (
          <div className="p-8 text-center text-gray-400">لا توجد معاملات تطابق الفلتر الحالي</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-3">
                    <input type="checkbox" checked={selected.size === workspace.transactions.length} onChange={toggleSelectAll} />
                  </th>
                  <th className="px-3 py-3 text-right font-medium text-gray-600">التاريخ</th>
                  <th className="px-3 py-3 text-right font-medium text-gray-600">الوصف</th>
                  <th className="px-3 py-3 text-right font-medium text-gray-600">مدين (د.ك)</th>
                  <th className="px-3 py-3 text-right font-medium text-gray-600">دائن (د.ك)</th>
                  <th className="px-3 py-3 text-right font-medium text-gray-600">الحالة</th>
                  <th className="px-3 py-3 text-right font-medium text-gray-600">المطابق</th>
                  {hasPermission('bankStatementImport.reconcile') && (
                    <th className="px-3 py-3 text-right font-medium text-gray-600">إجراء</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {workspace.transactions.map((tx) => (
                  <tr
                    key={tx.id}
                    className={`hover:bg-gray-50 transition-colors ${selected.has(tx.id) ? 'bg-blue-50' : ''} ${tx.isBankFee ? 'bg-purple-50/40' : ''}`}
                  >
                    <td className="px-3 py-3">
                      <input type="checkbox" checked={selected.has(tx.id)} onChange={() => toggleSelect(tx.id)} />
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-gray-600">{fmtDate(tx.statementDate)}</td>
                    <td className="px-3 py-3">
                      <div className="max-w-xs">
                        <p className="truncate" title={tx.description}>{tx.description}</p>
                        {tx.reference && <p className="text-xs text-gray-400 truncate">{tx.reference}</p>}
                        {tx.isBankFee && <span className="text-xs text-purple-600">{tx.bankFeeType ?? 'رسوم بنكية'}</span>}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-red-600 font-mono">{tx.debit > 0 ? fmtAmount(tx.debit) : ''}</td>
                    <td className="px-3 py-3 text-green-600 font-mono">{tx.credit > 0 ? fmtAmount(tx.credit) : ''}</td>
                    <td className="px-3 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[tx.reconcileStatus]}`}>
                        {STATUS_LABELS[tx.reconcileStatus]}
                      </span>
                      {tx.isDuplicate && (
                        <span className="mr-1 px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-xs">مكرر</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {tx.matchedType ? (
                        <div>
                          <p className="text-blue-700 font-medium">{MATCH_TYPE_AR[tx.matchedType] ?? tx.matchedType}</p>
                          <p className="text-gray-400">{tx.matchedRef}</p>
                          <p className="text-gray-400">{tx.matchConfidence}% ثقة</p>
                        </div>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    {hasPermission('bankStatementImport.reconcile') && (
                      <td className="px-3 py-3">
                        <div className="flex gap-1 flex-wrap">
                          {tx.reconcileStatus !== 'MATCHED' && (
                            <button
                              onClick={() => doSingleUpdate(tx.id, 'MATCHED')}
                              className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs hover:bg-green-200"
                            >
                              قبول
                            </button>
                          )}
                          {tx.reconcileStatus !== 'IGNORED' && (
                            <button
                              onClick={() => doSingleUpdate(tx.id, 'IGNORED')}
                              className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs hover:bg-gray-200"
                            >
                              تجاهل
                            </button>
                          )}
                          <button
                            onClick={() => setSuggTx(tx)}
                            className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200"
                          >
                            اقتراحات
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {workspace && workspace.total > (filter.pageSize ?? 50) && (
        <div className="flex justify-between items-center mt-4 text-sm text-gray-500">
          <span>
            عرض {((filter.page ?? 1) - 1) * (filter.pageSize ?? 50) + 1} –{' '}
            {Math.min((filter.page ?? 1) * (filter.pageSize ?? 50), workspace.total)} من {workspace.total.toLocaleString()} معاملة
          </span>
          <div className="flex gap-2">
            <button
              disabled={(filter.page ?? 1) <= 1}
              onClick={() => setFilter((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}
              className="px-3 py-1 border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-50"
            >
              السابق
            </button>
            <button
              disabled={(filter.page ?? 1) * (filter.pageSize ?? 50) >= workspace.total}
              onClick={() => setFilter((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
              className="px-3 py-1 border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-50"
            >
              التالي
            </button>
          </div>
        </div>
      )}

      {/* Posting suggestions panel */}
      {suggTx && selectedImportId && (
        <PostingSuggestionsPanel
          importId={selectedImportId}
          tx={suggTx}
          onClose={() => setSuggTx(null)}
          onStatusChanged={() => selectedImportId && loadWorkspace(selectedImportId, filter)}
        />
      )}
    </div>
  );
}
