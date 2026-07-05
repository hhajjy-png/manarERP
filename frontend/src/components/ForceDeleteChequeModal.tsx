import { useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../api/client';
import Modal from './Modal';
import { formatNumber } from '../lib/format';

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

const STATUS_AR: Record<string, string> = {
  DRAFT: 'مسودة',
  PRINTED: 'مطبوع',
  CANCELLED: 'ملغى',
};

function fmtAmount(v: number, currency = 'KWD'): string {
  const n = Number(v ?? 0);
  return formatNumber(n) + ' ' + currency;
}

function fmtDate(v: string | null): string {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '—' : d.toISOString().slice(0, 10);
}

interface Props {
  chequeId: number;
  onClose: () => void;
  onDeleted: () => void;
}

export default function ForceDeleteChequeModal({ chequeId, onClose, onDeleted }: Props) {
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
      title="⚠️ حذف نهائي للشيك"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn secondary" onClick={onClose} disabled={deleting}>
            إلغاء
          </button>
          <button
            type="button"
            className="btn danger"
            onClick={onConfirm}
            disabled={!textMatches || deleting}
          >
            {deleting ? 'جارٍ الحذف...' : 'تأكيد الحذف النهائي'}
          </button>
        </>
      }
    >
      {loadError && <p className="alert error">{loadError}</p>}

      {!preview && !loadError && (
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0' }}>جارٍ التحميل...</p>
      )}

      {preview && (
        <>
          <div className="alert error" style={{ marginBottom: 16 }}>
            <strong>تحذير:</strong> هذا الإجراء يحذف سجل الشيك نهائياً ولا يمكن التراجع عنه. الإلغاء هو الإجراء المعتاد؛ الحذف النهائي إجراء استثنائي لمدير النظام فقط.
          </div>

          {(preview.status === 'PRINTED' || preview.hasPaymentVoucher) && (
            <div className="alert error" style={{ marginBottom: 16 }}>
              <strong>تنبيه مشدّد:</strong>{' '}
              {preview.status === 'PRINTED' && 'هذا الشيك مطبوع. '}
              {preview.hasPaymentVoucher && `صدر له سند صرف رقم ${preview.paymentVoucherNumber}. `}
              تأكد تماماً قبل المتابعة.
            </div>
          )}

          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12, fontSize: 14 }}>
            <tbody>
              <tr>
                <td style={tdLabel}>رقم الشيك</td>
                <td><strong style={{ fontFamily: 'monospace' }}>{preview.chequeNumber}</strong></td>
              </tr>
              <tr>
                <td style={tdLabel}>المستفيد</td>
                <td>{preview.beneficiaryName}</td>
              </tr>
              <tr>
                <td style={tdLabel}>المبلغ</td>
                <td style={{ color: 'var(--text)', fontWeight: 700 }}>{fmtAmount(preview.amount, preview.currency)}</td>
              </tr>
              <tr>
                <td style={tdLabel}>البنك</td>
                <td>{preview.bankName}</td>
              </tr>
              <tr>
                <td style={tdLabel}>تاريخ الشيك</td>
                <td>{fmtDate(preview.chequeDate)}</td>
              </tr>
              <tr>
                <td style={tdLabel}>الحالة</td>
                <td>{STATUS_AR[preview.status] ?? preview.status}</td>
              </tr>
              <tr>
                <td style={tdLabel}>تاريخ الطباعة</td>
                <td>{fmtDate(preview.printedAt)}</td>
              </tr>
              <tr>
                <td style={tdLabel}>تاريخ الإلغاء</td>
                <td>{fmtDate(preview.cancelledAt)}</td>
              </tr>
              <tr>
                <td style={tdLabel}>رقم سند الصرف</td>
                <td style={{ fontFamily: 'monospace', color: preview.hasPaymentVoucher ? 'var(--red)' : undefined }}>
                  {preview.paymentVoucherNumber ?? '—'}
                </td>
              </tr>
              <tr>
                <td style={tdLabel}>حركات كشف بنكي مطابَقة</td>
                <td style={{ fontWeight: preview.bankMatchesCount > 0 ? 700 : undefined, color: preview.bankMatchesCount > 0 ? 'var(--red)' : undefined }}>
                  {preview.bankMatchesCount}
                </td>
              </tr>
            </tbody>
          </table>

          {preview.warnings.length > 0 && (
            <div style={{ background: 'var(--amber-bg, #fff8e1)', border: '1px solid var(--amber, #f59e0b)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13 }}>
              <strong style={{ display: 'block', marginBottom: 4 }}>تنبيهات:</strong>
              {preview.warnings.map((w, i) => <div key={i}>• {w}</div>)}
            </div>
          )}

          <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
            اكتب رقم الشيك للتأكيد:{' '}
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
