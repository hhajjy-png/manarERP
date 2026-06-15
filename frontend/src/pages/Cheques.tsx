import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../stores/authStore';
import { useT } from '../lib/i18n';
import { tafqeetKWD } from '../lib/tafqeet';
import { formatDate } from '../lib/date';
import DataTable, { PageMeta } from '../components/DataTable';
import StatCard from '../components/StatCard';
import gulfBankImg from '../assets/GulfBank_Personal_KW.jpg';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Cheque {
  id: number;
  chequeNumber: string;
  chequeDate: string;
  beneficiaryName: string;
  amount: number;
  currency: string;
  description: string | null;
  bankName: string;
  status: string;
  printedAt: string | null;
  cancelledAt: string | null;
  notes: string | null;
  createdAt: string;
}

interface ChequeStats {
  total: number;
  draft: number;
  printed: number;
  cancelled: number;
}

interface FormState {
  chequeNumber: string;
  chequeDate: string;
  beneficiaryName: string;
  amount: string;
  currency: string;
  description: string;
  bankName: string;
  notes: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function defaultForm(): FormState {
  const today = new Date().toISOString().slice(0, 10);
  return {
    chequeNumber: '',
    chequeDate: today,
    beneficiaryName: '',
    amount: '',
    currency: 'KWD',
    description: '',
    bankName: 'بنك الخليج',
    notes: '',
  };
}

const KUWAITI_BANKS = [
  'بنك الكويت الوطني',
  'بيت التمويل الكويتي',
  'بنك الخليج',
  'البنك التجاري الكويتي',
  'بنك برقان',
  'بنك بوبيان',
  'بنك وربة',
  'البنك الأهلي الكويتي',
  'البنك الأهلي المتحد',
  'بنك الكويت الدولي',
] as const;

function statusPill(status: string, t: (k: string) => string) {
  const clsMap: Record<string, string> = { DRAFT: 'amber', PRINTED: 'green', CANCELLED: 'red' };
  const keyMap: Record<string, string> = {
    DRAFT: 'cheque.status.draft',
    PRINTED: 'cheque.status.printed',
    CANCELLED: 'cheque.status.cancelled',
  };
  return <span className={`pill ${clsMap[status] ?? 'gray'}`}>{t(keyMap[status] ?? status)}</span>;
}

function fmtDate(v: string | null | undefined): string {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '—' : d.toISOString().slice(0, 10);
}

function fmtAmount(v: number | string, currency = 'KWD'): string {
  const n = Number(v ?? 0);
  return (
    n.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) +
    ' ' +
    currency
  );
}

// ── ChequePrintOutput ─────────────────────────────────────────────────────────

const CHEQUE_CALIBRATION_MODE = false;

// Page-level print position on A4 landscape (mm). Gulf Bank cheque feeds at centre of page.
const CHEQUE_PAGE_OFFSET_X_MM: number = 0;
const CHEQUE_PAGE_OFFSET_Y_MM: number = 40;

const CAL: React.CSSProperties = CHEQUE_CALIBRATION_MODE
  ? { border: '1px solid red', background: 'rgba(255,0,0,0.08)' }
  : {};

function CalTag({ name, top, left, width }: { name: string; top: string; left: string; width: string }) {
  if (!CHEQUE_CALIBRATION_MODE) return null;
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        fontSize: '5.5pt',
        fontFamily: 'monospace, monospace',
        color: 'red',
        background: 'rgba(255,255,255,0.9)',
        padding: '1px 3px',
        lineHeight: 1.3,
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
        zIndex: 10,
      }}
    >
      {name}
      <br />
      t:{top} l:{left} w:{width}
    </div>
  );
}

interface PreviewData {
  chequeNumber: string;
  chequeDate: string;
  beneficiaryName: string;
  amount: string | number;
  currency: string;
  description: string | null;
  bankName: string;
}

function ChequePrintOutput({ data }: { data: PreviewData }) {
  const raw = Number(data.amount ?? 0);
  const amount = isNaN(raw) ? 0 : raw;
  const d = new Date(data.chequeDate);
  const chequeDate =
    !data.chequeDate || isNaN(d.getTime())
      ? ''
      : `${String(d.getDate()).padStart(2, '0')} / ${String(d.getMonth() + 1).padStart(2, '0')} / ${d.getFullYear()}`;

  return (
    // Outer container: fixed clipping frame — no transform, layout footprint is stable
    <div
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '700 / 272',
        fontFamily: "'Cairo', 'Tajawal', Arial, sans-serif",
        overflow: 'hidden',
      }}
    >
      <div style={{ position: 'absolute', inset: 0 }}>
        {/* Background image — hidden during printing so real cheque paper shows */}
        <img
          src={gulfBankImg}
          className="cheque-bg-img"
          alt=""
          aria-hidden="true"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill' }}
        />

        {/* Beneficiary name */}
        <div
          style={{
            position: 'absolute',
            top: '29.8%',
            left: '34.5%',
            width: '38%',
            fontSize: '11pt',
            fontWeight: 600,
            color: '#000',
            lineHeight: 1.55,
            ...CAL,
          }}
        >
          <CalTag name="BENEFICIARY" top="29.8%" left="34.5%" width="38%" />
          {data.beneficiaryName}
        </div>

        {/* Date: DD / MM / YYYY */}
        <div
          style={{
            position: 'absolute',
            top: '24.3%',
            left: '79.1%',
            width: '23%',
            fontSize: '10pt',
            fontWeight: 600,
            color: '#000',
            textAlign: 'center',
            letterSpacing: 0.5,
            ...CAL,
          }}
        >
          <CalTag name="DATE" top="24.3%" left="79.1%" width="23%" />
          {chequeDate}
        </div>

        {/* Amount in Arabic words (tafqeet) */}
        <div
          style={{
            position: 'absolute',
            top: '39.1%',
            left: '5.7%',
            width: '72%',
            fontSize: '10pt',
            fontWeight: 600,
            color: '#000',
            direction: 'rtl',
            lineHeight: 1.55,
            ...CAL,
          }}
        >
          <CalTag name="TAFQEET" top="39.1%" left="5.7%" width="72%" />
          {amount > 0 ? tafqeetKWD(amount) : ''}
        </div>

        {/* Numeric amount without currency label */}
        <div
          style={{
            position: 'absolute',
            top: '45.8%',
            left: '82.4%',
            width: '18%',
            fontSize: '11pt',
            fontWeight: 700,
            color: '#000',
            textAlign: 'center',
            fontFamily: 'monospace',
            letterSpacing: 0.5,
            ...CAL,
          }}
        >
          <CalTag name="NUMERIC" top="45.8%" left="82.4%" width="18%" />
          {amount > 0
            ? `#${amount.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}#`
            : ''}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Cheques() {
  const { hasPermission } = useAuth();
  const { t } = useT();

  const [cheques, setCheques] = useState<Cheque[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [stats, setStats] = useState<ChequeStats>({ total: 0, draft: 0, printed: 0, cancelled: 0 });
  const [form, setForm] = useState<FormState>(defaultForm());
  const [editId, setEditId] = useState<number | null>(null);
  const [printTarget, setPrintTarget] = useState<Cheque | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [historySearch, setHistorySearch] = useState('');
  const [historyStatus, setHistoryStatus] = useState('');
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState('');
  const [showPrintConfirm, setShowPrintConfirm] = useState(false);
  const canCreate = hasPermission('cheques.create');
  const canUpdate = hasPermission('cheques.update');
  const canPrint = hasPermission('cheques.print');
  const canCancel = hasPermission('cheques.cancel');

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadData = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const [listRes, statsRes] = await Promise.all([
        api.get('/cheques', {
          params: {
            page: p,
            pageSize: 20,
            search: historySearch || undefined,
            status: historyStatus || undefined,
          },
        }),
        api.get('/cheques/stats'),
      ]);
      setCheques(listRes.data.data.data ?? []);
      setMeta(listRes.data.data.meta ?? null);
      setStats(statsRes.data.data ?? { total: 0, draft: 0, printed: 0, cancelled: 0 });
    } catch (e) {
      setFormError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [historySearch, historyStatus]);

  useEffect(() => {
    loadData(1);
  }, [loadData]);

  useEffect(() => {
    if (!success) return;
    const id = setTimeout(() => setSuccess(''), 3500);
    return () => clearTimeout(id);
  }, [success]);

  // ── Form handlers ─────────────────────────────────────────────────────────

  function field(name: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [name]: value }));
  }

  function resetForm() {
    setForm(defaultForm());
    setEditId(null);
    setPrintTarget(null);
    setFormError('');
    setSuccess('');
  }

  function loadChequeIntoForm(cheque: Cheque) {
    setForm({
      chequeNumber: cheque.chequeNumber,
      chequeDate: fmtDate(cheque.chequeDate),
      beneficiaryName: cheque.beneficiaryName,
      amount: String(cheque.amount),
      currency: cheque.currency,
      description: cheque.description ?? '',
      bankName: cheque.bankName,
      notes: cheque.notes ?? '',
    });
    setEditId(cheque.id);
    setPrintTarget(cheque);
    setFormError('');
    setSuccess('');
  }

  function validateForm(): string {
    if (!form.chequeNumber.trim()) return t('error.cheque.number_required');
    if (!form.chequeDate) return t('error.cheque.date_required');
    if (!form.beneficiaryName.trim()) return t('error.cheque.beneficiary_required');
    if (!form.amount || Number(form.amount) <= 0) return t('error.cheque.amount_required');
    if (!form.bankName.trim()) return t('error.cheque.bank_required');
    if (!form.currency.trim()) return t('error.cheque.currency_required');
    return '';
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    const err = validateForm();
    if (err) {
      setFormError(err);
      return;
    }
    setFormError('');
    setSaving(true);
    try {
      const payload = {
        chequeNumber: form.chequeNumber.trim(),
        chequeDate: form.chequeDate,
        beneficiaryName: form.beneficiaryName.trim(),
        amount: Number(form.amount),
        currency: form.currency.trim(),
        description: form.description.trim() || null,
        bankName: form.bankName.trim(),
        notes: form.notes.trim() || null,
      };

      let saved: Cheque;
      if (editId) {
        const res = await api.put(`/cheques/${editId}`, payload);
        saved = res.data.data;
        setSuccess(t('msg.cheque.updated'));
      } else {
        const res = await api.post('/cheques', payload);
        saved = res.data.data;
        setSuccess(t('msg.cheque.saved'));
      }
      setEditId(saved.id);
      setPrintTarget(saved);
      await loadData(page);
    } catch (e) {
      setFormError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  // ── Print ─────────────────────────────────────────────────────────────────

  function handlePrint() {
    if (!printTarget) {
      setFormError(t('error.cheque.save_first'));
      return;
    }
    window.print();
    setShowPrintConfirm(true);
  }

  async function handleMarkPrinted() {
    if (!printTarget) {
      setFormError(t('error.cheque.save_first'));
      setShowPrintConfirm(false);
      return;
    }
    try {
      await api.post(`/cheques/${printTarget.id}/mark-printed`);
      setSuccess(t('msg.cheque.printed'));
      setShowPrintConfirm(false);
      const res = await api.get(`/cheques/${printTarget.id}`);
      setPrintTarget(res.data.data);
      await loadData(page);
    } catch (e) {
      setFormError(errorMessage(e));
      setShowPrintConfirm(false);
    }
  }

  // ── Cancel ────────────────────────────────────────────────────────────────

  async function handleCancel(cheque: Cheque) {
    if (!window.confirm(t('page.cheques.confirm_cancel'))) return;
    try {
      await api.post(`/cheques/${cheque.id}/cancel`);
      setSuccess(t('msg.cheque.cancelled'));
      if (printTarget?.id === cheque.id) {
        const res = await api.get(`/cheques/${cheque.id}`);
        setPrintTarget(res.data.data);
      }
      await loadData(page);
    } catch (e) {
      setFormError(errorMessage(e));
    }
  }

  // ── Preview data: from printTarget (saved cheque) or live form ────────────

  const previewData: PreviewData = printTarget
    ? {
        chequeNumber: printTarget.chequeNumber,
        chequeDate: printTarget.chequeDate,
        beneficiaryName: printTarget.beneficiaryName,
        amount: printTarget.amount,
        currency: printTarget.currency,
        description: printTarget.description,
        bankName: printTarget.bankName,
      }
    : {
        chequeNumber: form.chequeNumber,
        chequeDate: form.chequeDate,
        beneficiaryName: form.beneficiaryName,
        amount: form.amount,
        currency: form.currency,
        description: form.description || null,
        bankName: form.bankName,
      };

  // ── Table columns ──────────────────────────────────────────────────────────

  const columns = [
    { key: 'chequeDate', label: 'col.cheque.date', render: (r: Cheque) => formatDate(r.chequeDate) },
    {
      key: 'chequeNumber',
      label: 'col.cheque.number',
      render: (r: Cheque) => <strong style={{ fontFamily: 'monospace' }}>{r.chequeNumber}</strong>,
    },
    {
      key: 'beneficiaryName',
      label: 'col.cheque.beneficiary',
      render: (r: Cheque) => <strong>{r.beneficiaryName}</strong>,
    },
    {
      key: 'amount',
      label: 'col.cheque.amount',
      render: (r: Cheque) => fmtAmount(r.amount, r.currency),
    },

    { key: 'bankName', label: 'col.cheque.bank' },
    { key: 'status', label: 'col.cheque.status', render: (r: Cheque) => statusPill(r.status, t) },
  ];

  const tableActions = (row: Cheque) => (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap' }}>
      <button className="btn sm secondary" onClick={() => loadChequeIntoForm(row)}>
        {t('btn.cheque.select')}
      </button>
      {canCancel && row.status === 'DRAFT' && (
        <button className="btn sm danger" onClick={() => handleCancel(row)}>
          {t('page.cheques.cancel_cheque')}
        </button>
      )}
    </div>
  );

  const isPrintable = !!printTarget && printTarget.status === 'DRAFT';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="page">
      {/* Hidden print area — revealed only by @media print */}
      <div className="cheque-print-only" style={{ display: 'none' }}>
        {/* Page-level offset: shifts the entire print block in physical mm on the A4 page */}
        <div style={{ transform: `translate(${CHEQUE_PAGE_OFFSET_X_MM}mm, ${CHEQUE_PAGE_OFFSET_Y_MM}mm)` }}>
          <ChequePrintOutput data={previewData} />
        </div>
      </div>

      {/* Inline print CSS — scoped to this component via class selectors */}
      <style>{`
        @page { size: A4 landscape; }
        @media print {
          body > * { visibility: hidden !important; }
          .cheque-print-only {
            display: block !important;
            visibility: visible !important;
            position: fixed;
            inset: 0;
            background: white;
            z-index: 9999;
          }
          .cheque-print-only * { visibility: visible !important; }
          .cheque-bg-img { display: none !important; }
        }
      `}</style>

      {/* Page header */}
      <div className="page-head no-print">
        <div>
          <h2>{t('page.cheques.title')}</h2>
          <p>{t('page.cheques.subtitle')}</p>
        </div>
        {canCreate && (
          <button className="btn" onClick={resetForm}>
            {t('page.cheques.new')}
          </button>
        )}
      </div>

      {/* Alerts */}
      {formError && (
        <div className="alert error no-print" style={{ marginBottom: 12 }}>
          {formError}
          <button
            onClick={() => setFormError('')}
            style={{
              marginInlineStart: 12,
              cursor: 'pointer',
              background: 'none',
              border: 'none',
              fontSize: 16,
            }}
          >
            ✕
          </button>
        </div>
      )}
      {success && (
        <div className="alert success no-print" style={{ marginBottom: 12 }}>
          {success}
          <button
            onClick={() => setSuccess('')}
            style={{
              marginInlineStart: 12,
              cursor: 'pointer',
              background: 'none',
              border: 'none',
              fontSize: 16,
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Mark-as-printed confirmation modal */}
      {showPrintConfirm && printTarget && (
        <div className="modal-overlay no-print" onMouseDown={() => setShowPrintConfirm(false)}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{t('page.cheques.mark_printed')}</h3>
              <button className="icon-btn" onClick={() => setShowPrintConfirm(false)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p style={{ margin: 0 }}>{t('page.cheques.confirm_printed')}</p>
            </div>
            <div
              className="modal-foot"
              style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}
            >
              <button className="btn secondary" onClick={() => setShowPrintConfirm(false)}>
                {t('action.cancel')}
              </button>
              {canPrint && (
                <button className="btn" onClick={handleMarkPrinted}>
                  {t('page.cheques.mark_printed')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Stats row */}
      <div
        className="no-print"
        style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 20 }}
      >
        <StatCard
          label={t('stat.cheques.total')}
          value={stats.total}
          icon="🖊️"
          color="#1d4e6f"
          bg="#e8f4f8"
        />
        <StatCard
          label={t('stat.cheques.draft')}
          value={stats.draft}
          icon="📝"
          color="#92400e"
          bg="#fef3c7"
        />
        <StatCard
          label={t('stat.cheques.printed')}
          value={stats.printed}
          icon="✅"
          color="#065f46"
          bg="#d1fae5"
        />
        <StatCard
          label={t('stat.cheques.cancelled')}
          value={stats.cancelled}
          icon="❌"
          color="#991b1b"
          bg="#fee2e2"
        />
      </div>

      {/* Main two-column layout: preview + form */}
      <div
        className="no-print"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 420px',
          gap: 20,
          marginBottom: 24,
          alignItems: 'start',
        }}
      >
        {/* Left: cheque preview + print button */}
        <div className="card" style={{ padding: 20 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text-muted)',
              marginBottom: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            {t('page.cheques.preview')}
            {printTarget && statusPill(printTarget.status, t)}
          </div>

          <ChequePrintOutput data={previewData} />

          <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              className="btn"
              style={{ flex: 1, fontSize: 15, padding: '10px 0' }}
              onClick={handlePrint}
              disabled={!isPrintable}
            >
              🖨️ {t('page.cheques.print')}
            </button>
            {canCancel && printTarget && printTarget.status === 'DRAFT' && (
              <button className="btn danger" onClick={() => handleCancel(printTarget)}>
                {t('page.cheques.cancel_cheque')}
              </button>
            )}
          </div>
          {!printTarget && (
            <p
              style={{
                margin: '8px 0 0',
                fontSize: 12,
                color: 'var(--text-muted)',
                textAlign: 'center',
              }}
            >
              {t('error.cheque.save_first')}
            </p>
          )}
          {printTarget?.status === 'CANCELLED' && (
            <p style={{ margin: '8px 0 0', fontSize: 12, color: '#dc2626', textAlign: 'center' }}>
              {t('error.cheque.is_cancelled')}
            </p>
          )}
          {printTarget?.status === 'PRINTED' && (
            <p style={{ margin: '8px 0 0', fontSize: 12, color: '#64748b', textAlign: 'center' }}>
              {t('error.cheque.already_printed')}
            </p>
          )}
        </div>

        {/* Right: input form */}
        <div className="card" style={{ padding: 20 }}>
          <div
            style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 14 }}
          >
            {t('page.cheques.form')}
            {editId && (
              <span style={{ marginInlineStart: 8, color: 'var(--accent)' }}>#{editId}</span>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                {t('field.cheque.beneficiary')} *
              </label>
              <input
                className="form-input"
                value={form.beneficiaryName}
                onChange={(e) => field('beneficiaryName', e.target.value)}
                placeholder={t('ph.cheque.beneficiary')}
                disabled={!!editId && !canUpdate}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                  {t('field.cheque.amount')} *
                </label>
                <input
                  className="form-input"
                  type="number"
                  min="0"
                  step="0.001"
                  value={form.amount}
                  onChange={(e) => field('amount', e.target.value)}
                  title={t('field.cheque.amount')}
                  style={{ fontFamily: 'monospace' }}
                  disabled={!!editId && !canUpdate}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                  {t('field.cheque.currency')} *
                </label>
                <select
                  className="form-input"
                  value={form.currency}
                  onChange={(e) => field('currency', e.target.value)}
                  title={t('field.cheque.currency')}
                  disabled={!!editId && !canUpdate}
                >
                  <option value="KWD">KWD</option>
                  <option value="USD">USD</option>
                  <option value="SAR">SAR</option>
                  <option value="AED">AED</option>
                </select>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                {t('field.cheque.date')} *
              </label>
              <input
                className="form-input"
                type="date"
                value={form.chequeDate}
                onChange={(e) => field('chequeDate', e.target.value)}
                title={t('field.cheque.date')}
                disabled={!!editId && !canUpdate}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                {t('field.cheque.number')} *
              </label>
              <input
                className="form-input"
                value={form.chequeNumber}
                onChange={(e) => field('chequeNumber', e.target.value)}
                placeholder={t('ph.cheque.number')}
                style={{ fontFamily: 'monospace' }}
                disabled={!!editId && !canUpdate}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                {t('field.cheque.bank')} *
              </label>
              <select
                className="form-input"
                value={form.bankName}
                onChange={(e) => field('bankName', e.target.value)}
                title={t('field.cheque.bank')}
                disabled
              >
                {KUWAITI_BANKS.map((bank) => (
                  <option key={bank} value={bank}>
                    {bank}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                {t('field.cheque.description')}
              </label>
              <input
                className="form-input"
                value={form.description}
                onChange={(e) => field('description', e.target.value)}
                placeholder={t('ph.cheque.description')}
                disabled={!!editId && !canUpdate}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                {t('field.cheque.notes')}
              </label>
              <textarea
                className="form-input"
                rows={2}
                value={form.notes}
                onChange={(e) => field('notes', e.target.value)}
                placeholder={t('ph.cheque.notes')}
                disabled={!!editId && !canUpdate}
                style={{ resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              {(canCreate && !editId) || (editId && canUpdate) ? (
                <button className="btn" onClick={handleSave} disabled={saving} style={{ flex: 1 }}>
                  {saving ? t('msg.saving') : t('page.cheques.save')}
                </button>
              ) : null}
              <button className="btn secondary" onClick={resetForm}>
                {t('page.cheques.reset')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* History table */}
      <div className="card no-print" style={{ padding: 0 }}>
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid var(--border)',
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          {t('page.cheques.history')}
        </div>
        <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            className="form-input"
            style={{ maxWidth: 240, padding: '6px 10px' }}
            placeholder={t('action.search_placeholder')}
            value={historySearch}
            onChange={(e) => { setHistorySearch(e.target.value); setPage(1); }}
          />
          <select
            className="form-input"
            style={{ maxWidth: 160, padding: '6px 10px' }}
            title={t('filter.status')}
            value={historyStatus}
            onChange={(e) => { setHistoryStatus(e.target.value); setPage(1); }}
          >
            <option value="">{t('opt.all')}</option>
            <option value="DRAFT">{t('cheque.status.draft')}</option>
            <option value="PRINTED">{t('cheque.status.printed')}</option>
            <option value="CANCELLED">{t('cheque.status.cancelled')}</option>
          </select>
          {(historySearch || historyStatus) && (
            <button
              type="button"
              className="btn secondary sm"
              onClick={() => { setHistorySearch(''); setHistoryStatus(''); setPage(1); }}
            >
              {t('action.reset_filters')}
            </button>
          )}
        </div>
        <DataTable
          columns={columns}
          rows={cheques}
          loading={loading}
          meta={meta}
          onPage={(p) => {
            setPage(p);
            loadData(p);
          }}
          actions={tableActions}
          emptyText={t('empty.cheques')}
        />
      </div>
    </div>
  );
}
