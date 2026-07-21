import { useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../api/client';
import { useT } from '../lib/i18n';
import Modal from './Modal';
import { money } from '../config/modules';

interface PreviewData {
  id: number;
  invoiceNumber: string;
  direction: string;
  status: string;
  total: number;
  paidAmount: number;
  itemsCount: number;
  paymentsCount: number;
  transactionsCount: number;
  accountingImpact: {
    revenueReduced: number;
    expenseReduced: number;
    journalEntriesToDelete: number;
  };
  willBeDeleted: string[];
  warnings: string[];
}

const STATUS_KEYS: Record<string, string> = {
  UNPAID: 'inv.status.unpaid',
  PARTIAL: 'dlg.force_delete.invoice.status.partial',
  PAID: 'dlg.force_delete.invoice.status.paid',
  OVERDUE: 'inv.status.overdue',
  CANCELLED: 'inv.status.cancelled',
};

const DIRECTION_KEYS: Record<string, string> = {
  SALES: 'dlg.force_delete.invoice.direction.sales',
  PURCHASE: 'dlg.force_delete.invoice.direction.purchase',
};

interface Props {
  invoiceId: number;
  onClose: () => void;
  onDeleted: () => void;
}

export default function ForceDeleteInvoiceModal({ invoiceId, onClose, onDeleted }: Props) {
  const { t } = useT();
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loadError, setLoadError] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get(`/invoices/${invoiceId}/force`)
      .then((res) => {
        setPreview(res.data.data);
        setTimeout(() => inputRef.current?.focus(), 50);
      })
      .catch((err) => setLoadError(errorMessage(err)));
  }, [invoiceId]);

  async function onConfirm() {
    if (!preview || confirmText !== preview.invoiceNumber || deleting) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await api.delete(`/invoices/${invoiceId}/force`, { data: { confirmation: confirmText } });
      onDeleted();
    } catch (err) {
      setDeleteError(errorMessage(err));
      setDeleting(false);
    }
  }

  const textMatches = !!preview && confirmText === preview.invoiceNumber;

  return (
    <Modal
      title={t('dlg.force_delete.invoice.title')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn secondary" onClick={onClose} disabled={deleting}>
            {t('action.cancel')}
          </button>
          <button
            type="button"
            className="btn danger"
            onClick={onConfirm}
            disabled={!textMatches || deleting}
          >
            {deleting ? t('dlg.force_delete.deleting') : t('dlg.force_delete.confirm_permanent')}
          </button>
        </>
      }
    >
      {loadError && <p className="alert error">{loadError}</p>}

      {!preview && !loadError && (
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0' }}>{t('dlg.force_delete.loading')}</p>
      )}

      {preview && (
        <>
          <div className="alert error" style={{ marginBottom: 16 }}>
            <strong>{t('dlg.force_delete.warning_label')}</strong> {t('dlg.force_delete.invoice.warning_body')}
          </div>

          {preview.paidAmount > 0 && (
            <div className="alert error" style={{ marginBottom: 16 }}>
              <strong>{t('dlg.force_delete.invoice.payments_warning_label')}</strong> {t('dlg.force_delete.invoice.payments_warning_body')}
            </div>
          )}

          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12, fontSize: 14 }}>
            <tbody>
              <tr>
                <td style={tdLabel}>{t('col.inv.number')}</td>
                <td><strong style={{ fontFamily: 'monospace' }}>{preview.invoiceNumber}</strong></td>
              </tr>
              <tr>
                <td style={tdLabel}>{t('col.inv.direction')}</td>
                <td>{DIRECTION_KEYS[preview.direction] ? t(DIRECTION_KEYS[preview.direction]) : preview.direction}</td>
              </tr>
              <tr>
                <td style={tdLabel}>{t('col.status')}</td>
                <td>{STATUS_KEYS[preview.status] ? t(STATUS_KEYS[preview.status]) : preview.status}</td>
              </tr>
              <tr>
                <td style={tdLabel}>{t('col.inv.total')}</td>
                <td style={{ color: 'var(--text)', fontWeight: 700 }}>{money(preview.total)}</td>
              </tr>
              <tr>
                <td style={tdLabel}>{t('col.inv.paid')}</td>
                <td style={{ color: preview.paidAmount > 0 ? 'var(--red)' : undefined, fontWeight: preview.paidAmount > 0 ? 700 : undefined }}>
                  {money(preview.paidAmount)}
                </td>
              </tr>
              <tr>
                <td style={tdLabel}>{t('lbl.items')}</td>
                <td>{preview.itemsCount}</td>
              </tr>
              <tr>
                <td style={tdLabel}>{t('dlg.force_delete.invoice.col_payments')}</td>
                <td>{preview.paymentsCount}</td>
              </tr>
              <tr>
                <td style={tdLabel}>{t('dlg.force_delete.invoice.col_journal_entries')}</td>
                <td>{preview.transactionsCount}</td>
              </tr>
            </tbody>
          </table>

          <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13 }}>
            <strong style={{ display: 'block', marginBottom: 6 }}>{t('dlg.force_delete.invoice.accounting_impact_heading')}</strong>
            {preview.accountingImpact.revenueReduced > 0 && (
              <div>• {t('dlg.force_delete.invoice.revenue_reduced')} <strong>{money(preview.accountingImpact.revenueReduced)}</strong></div>
            )}
            {preview.accountingImpact.expenseReduced > 0 && (
              <div>• {t('dlg.force_delete.invoice.expense_reduced')} <strong>{money(preview.accountingImpact.expenseReduced)}</strong></div>
            )}
            {preview.accountingImpact.journalEntriesToDelete > 0
              ? <div>• {t('dlg.force_delete.invoice.journal_delete_prefix')} <strong>{preview.accountingImpact.journalEntriesToDelete}</strong> {t('dlg.force_delete.invoice.journal_delete_suffix')}</div>
              : <div style={{ color: 'var(--text-muted)' }}>• {t('dlg.force_delete.invoice.no_journal_entries')}</div>
            }
          </div>

          {preview.warnings.length > 0 && (
            <div style={{ background: 'var(--amber-bg, #fff8e1)', border: '1px solid var(--amber, #f59e0b)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13 }}>
              <strong style={{ display: 'block', marginBottom: 4 }}>{t('dlg.force_delete.warnings_heading')}</strong>
              {preview.warnings.map((w, i) => <div key={i}>• {w}</div>)}
            </div>
          )}

          <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
            {t('dlg.force_delete.invoice.confirm_prompt')}{' '}
            <code style={{ background: 'var(--bg-alt)', padding: '2px 6px', borderRadius: 4 }}>
              {preview.invoiceNumber}
            </code>
          </label>
          <input
            ref={inputRef}
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={preview.invoiceNumber}
            disabled={deleting}
            style={{ width: '100%', direction: 'ltr' }}
            onKeyDown={(e) => { if (e.key === 'Enter' && textMatches) onConfirm(); }}
          />
          {deleteError && (
            <p className="alert error" style={{ marginTop: 10 }}>{deleteError}</p>
          )}
        </>
      )}
    </Modal>
  );
}

const tdLabel: React.CSSProperties = {
  padding: '4px 12px 4px 0',
  color: 'var(--text-muted)',
  fontWeight: 600,
  width: 130,
  whiteSpace: 'nowrap',
};
