import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../stores/authStore';
import { useT } from '../lib/i18n';
import { tafqeetKWD } from '../lib/tafqeet';
import DataTable, { PageMeta } from '../components/DataTable';
import StatCard from '../components/StatCard';

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
  templateName: string | null;
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
    bankName: '',
    notes: '',
  };
}

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

// ── ChequePreview ─────────────────────────────────────────────────────────────

interface PreviewData {
  chequeNumber: string;
  chequeDate: string;
  beneficiaryName: string;
  amount: string | number;
  currency: string;
  description: string | null;
  bankName: string;
}

function ChequePreview({ data, t }: { data: PreviewData; t: (k: string) => string }) {
  const amount = Number(data.amount ?? 0);

  return (
    <div
      style={{
        border: '2px solid #1d4e6f',
        borderRadius: 8,
        padding: '24px 28px',
        background: 'linear-gradient(135deg, #f8fafc 0%, #e8f4f8 100%)',
        fontFamily: "'Cairo', 'Tajawal', sans-serif",
        direction: 'rtl',
        minHeight: 200,
        color: '#0f172a',
      }}
    >
      {/* Header: bank + cheque number */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 10,
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 700, color: '#1d4e6f' }}>
          {data.bankName || '—'}
        </div>
        <div
          style={{ fontSize: 12, color: '#475569', fontFamily: 'monospace', letterSpacing: 0.5 }}
        >
          {t('col.cheque.number')}: <strong>{data.chequeNumber || '—'}</strong>
        </div>
      </div>

      {/* Company */}
      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 12 }}>
        {t('lbl.cheque.company')}
      </div>

      {/* Date */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          marginBottom: 14,
          fontSize: 13,
          color: '#334155',
        }}
      >
        {t('col.cheque.date')}:{' '}
        <strong style={{ marginInlineStart: 6 }}>{fmtDate(data.chequeDate)}</strong>
      </div>

      {/* Beneficiary */}
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 8,
          marginBottom: 14,
          paddingBottom: 10,
          borderBottom: '1px dashed #94a3b8',
        }}
      >
        <span style={{ whiteSpace: 'nowrap', fontSize: 12, color: '#475569' }}>
          {t('lbl.cheque.pay_to')}:
        </span>
        <span style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', flex: 1 }}>
          {data.beneficiaryName || '—'}
        </span>
      </div>

      {/* Amount box */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 12,
          padding: '10px 14px',
          background: 'rgba(29, 78, 111, 0.07)',
          borderRadius: 6,
          border: '1px solid rgba(29, 78, 111, 0.15)',
        }}
      >
        <span style={{ fontSize: 12, color: '#475569', whiteSpace: 'nowrap' }}>
          {t('lbl.cheque.amount_label')}:
        </span>
        <span
          style={{
            fontSize: 22,
            fontWeight: 800,
            color: '#1d4e6f',
            fontFamily: 'monospace',
            letterSpacing: 0.5,
          }}
        >
          {amount > 0 ? amount.toLocaleString('en-US', { minimumFractionDigits: 3 }) : '0.000'}
        </span>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#1d4e6f' }}>{data.currency}</span>
      </div>

      {/* Amount in words */}
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: '#1d4e6f',
          marginBottom: 12,
          padding: '6px 12px',
          background: 'rgba(29, 78, 111, 0.06)',
          borderRadius: 4,
          textAlign: 'center',
          direction: 'rtl',
          lineHeight: 1.7,
        }}
      >
        {amount > 0 && data.currency === 'KWD'
          ? tafqeetKWD(amount)
          : amount > 0
          ? `${t('lbl.cheque.amount_words')}: ${fmtAmount(amount, data.currency)}`
          : '—'}
      </div>

      {/* Description */}
      {data.description && (
        <div style={{ fontSize: 13, color: '#475569', marginBottom: 12 }}>
          <span>{t('lbl.cheque.for')}: </span>
          <span style={{ color: '#0f172a' }}>{data.description}</span>
        </div>
      )}

      {/* Signature line */}
      <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 18 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 160, borderBottom: '1px solid #334155', marginBottom: 4 }} />
          <div style={{ fontSize: 11, color: '#64748b' }}>{t('lbl.cheque.signature')}</div>
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
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState('');
  const [showPrintConfirm, setShowPrintConfirm] = useState(false);
  const printAreaRef = useRef<HTMLDivElement>(null);

  const canCreate = hasPermission('cheques.create');
  const canUpdate = hasPermission('cheques.update');
  const canPrint = hasPermission('cheques.print');
  const canCancel = hasPermission('cheques.cancel');

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadData = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const [listRes, statsRes] = await Promise.all([
        api.get('/cheques', { params: { page: p, pageSize: 20 } }),
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
  }, []);

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
    { key: 'chequeDate', label: 'col.cheque.date', render: (r: Cheque) => fmtDate(r.chequeDate) },
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
      <div ref={printAreaRef} className="cheque-print-only" style={{ display: 'none' }}>
        <div style={{ padding: 32, maxWidth: 700, margin: '0 auto' }}>
          <ChequePreview data={previewData} t={t} />
        </div>
      </div>

      {/* Inline print CSS */}
      <style>{`
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
        }
      `}</style>

      {/* Page header */}
      <div className="page-header no-print">
        <div>
          <h1>{t('page.cheques.title')}</h1>
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

          <ChequePreview data={previewData} t={t} />

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
                {t('field.cheque.bank')} *
              </label>
              <input
                className="form-input"
                value={form.bankName}
                onChange={(e) => field('bankName', e.target.value)}
                placeholder={t('ph.cheque.bank')}
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
                {t('field.cheque.date')} *
              </label>
              <input
                className="form-input"
                type="date"
                value={form.chequeDate}
                onChange={(e) => field('chequeDate', e.target.value)}
                disabled={!!editId && !canUpdate}
              />
            </div>

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
