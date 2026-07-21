import { useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../api/client';
import { useT } from '../lib/i18n';
import Modal from './Modal';
import { formatNumber } from '../lib/format';
import { formatDate } from '../lib/date';

interface PreviewData {
  id: number;
  chequeNumber: string;
  beneficiaryName: string;
  amount: number;
  currency: string;
  bankName: string;
  chequeDate: string;
  status: string;
  printedAt: string | null;
  cancelledAt: string | null;
  paymentVoucherNumber: string | null;
  hasPaymentVoucher: boolean;
  bankMatchesCount: number;
  willBeDeleted: string[];
  warnings: string[];
}

const STATUS_KEYS: Record<string, string> = {
  DRAFT: 'cheque.status.draft',
  PRINTED: 'cheque.status.printed',
  CANCELLED: 'dlg.force_delete.cheque.status.cancelled',
};

function fmtAmount(v: number, currency = 'KWD'): string {
  return formatNumber(v) + ' ' + currency;
}

// عرض تاريخ للمستخدم — يمرّ عبر المُنسّق المشترك (DD/MM/YYYY، أرقام إنجليزية).
function fmtDate(v: string | null): string {
  return formatDate(v);
}

interface Props {
  chequeId: number;
  onClose: () => void;
  onDeleted: () => void;
}

export default function ForceDeleteChequeModal({ chequeId, onClose, onDeleted }: Props) {
  const { t } = useT();
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loadError, setLoadError] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get(`/cheques/${chequeId}/force`)
      .then((res) => {
        setPreview(res.data.data);
        setTimeout(() => inputRef.current?.focus(), 50);
      })
      .catch((err) => setLoadError(errorMessage(err)));
  }, [chequeId]);

  async function onConfirm() {
    if (!preview || confirmText !== preview.chequeNumber || deleting) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await api.delete(`/cheques/${chequeId}/force`, { data: { confirmation: confirmText } });
      onDeleted();
    } catch (err) {
      setDeleteError(errorMessage(err));
      setDeleting(false);
    }
  }

  const textMatches = !!preview && confirmText === preview.chequeNumber;

  return (
    <Modal
      title={t('dlg.force_delete.cheque.title')}
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
            <strong>{t('dlg.force_delete.warning_label')}</strong> {t('dlg.force_delete.cheque.warning_body')}
          </div>

          {(preview.status === 'PRINTED' || preview.hasPaymentVoucher) && (
            <div className="alert error" style={{ marginBottom: 16 }}>
              <strong>{t('dlg.force_delete.cheque.strict_warning_label')}</strong>{' '}
              {preview.status === 'PRINTED' && t('dlg.force_delete.cheque.printed_note')}
              {preview.hasPaymentVoucher && t('dlg.force_delete.cheque.voucher_note', { number: preview.paymentVoucherNumber ?? '' })}
              {t('dlg.force_delete.cheque.confirm_before_proceed')}
            </div>
          )}

          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12, fontSize: 14 }}>
            <tbody>
              <tr>
                <td style={tdLabel}>{t('field.cheque.number')}</td>
                <td><strong style={{ fontFamily: 'monospace' }}>{preview.chequeNumber}</strong></td>
              </tr>
              <tr>
                <td style={tdLabel}>{t('dlg.force_delete.cheque.col_beneficiary')}</td>
                <td>{preview.beneficiaryName}</td>
              </tr>
              <tr>
                <td style={tdLabel}>{t('field.cheque.amount')}</td>
                <td style={{ color: 'var(--text)', fontWeight: 700 }}>{fmtAmount(preview.amount, preview.currency)}</td>
              </tr>
              <tr>
                <td style={tdLabel}>{t('dlg.force_delete.cheque.col_bank')}</td>
                <td>{preview.bankName}</td>
              </tr>
              <tr>
                <td style={tdLabel}>{t('field.cheque.date')}</td>
                <td>{fmtDate(preview.chequeDate)}</td>
              </tr>
              <tr>
                <td style={tdLabel}>{t('col.status')}</td>
                <td>{STATUS_KEYS[preview.status] ? t(STATUS_KEYS[preview.status]) : preview.status}</td>
              </tr>
              <tr>
                <td style={tdLabel}>{t('dlg.force_delete.cheque.col_printed_at')}</td>
                <td>{fmtDate(preview.printedAt)}</td>
              </tr>
              <tr>
                <td style={tdLabel}>{t('dlg.force_delete.cheque.col_cancelled_at')}</td>
                <td>{fmtDate(preview.cancelledAt)}</td>
              </tr>
              <tr>
                <td style={tdLabel}>{t('dlg.force_delete.cheque.col_voucher_number')}</td>
                <td style={{ fontFamily: 'monospace', color: preview.hasPaymentVoucher ? 'var(--red)' : undefined }}>
                  {preview.paymentVoucherNumber ?? '—'}
                </td>
              </tr>
              <tr>
                <td style={tdLabel}>{t('dlg.force_delete.cheque.col_bank_matches')}</td>
                <td style={{ fontWeight: preview.bankMatchesCount > 0 ? 700 : undefined, color: preview.bankMatchesCount > 0 ? 'var(--red)' : undefined }}>
                  {preview.bankMatchesCount}
                </td>
              </tr>
            </tbody>
          </table>

          {preview.warnings.length > 0 && (
            <div style={{ background: 'var(--amber-bg, #fff8e1)', border: '1px solid var(--amber, #f59e0b)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13 }}>
              <strong style={{ display: 'block', marginBottom: 4 }}>{t('dlg.force_delete.warnings_heading')}</strong>
              {preview.warnings.map((w, i) => <div key={i}>• {w}</div>)}
            </div>
          )}

          <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
            {t('dlg.force_delete.cheque.confirm_prompt')}{' '}
            <code style={{ background: 'var(--bg-alt)', padding: '2px 6px', borderRadius: 4 }}>
              {preview.chequeNumber}
            </code>
          </label>
          <input
            ref={inputRef}
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={preview.chequeNumber}
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
  width: 160,
  whiteSpace: 'nowrap',
};
