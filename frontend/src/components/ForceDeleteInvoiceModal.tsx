import { useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../api/client';
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

const STATUS_AR: Record<string, string> = {
  UNPAID: 'غير مدفوعة',
  PARTIAL: 'مدفوعة جزئياً',
  PAID: 'مدفوعة',
  OVERDUE: 'متأخرة',
  CANCELLED: 'ملغاة',
};

const DIRECTION_AR: Record<string, string> = {
  SALES: 'مبيعات',
  PURCHASE: 'مشتريات',
};

interface Props {
  invoiceId: number;
  onClose: () => void;
  onDeleted: () => void;
}

export default function ForceDeleteInvoiceModal({ invoiceId, onClose, onDeleted }: Props) {
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
      title="⚠️ حذف نهائي للفاتورة"
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
            <strong>تحذير:</strong> هذا الإجراء سيحذف الفاتورة وجميع البنود والمدفوعات المرتبطة بها ولا يمكن التراجع عنه.
          </div>

          {preview.paidAmount > 0 && (
            <div className="alert error" style={{ marginBottom: 16 }}>
              <strong>تنبيه:</strong> هذه الفاتورة تحتوي على مدفوعات وسيتم حذف سجل المدفوعات نهائياً.
            </div>
          )}

          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12, fontSize: 14 }}>
            <tbody>
              <tr>
                <td style={tdLabel}>رقم الفاتورة</td>
                <td><strong style={{ fontFamily: 'monospace' }}>{preview.invoiceNumber}</strong></td>
              </tr>
              <tr>
                <td style={tdLabel}>الاتجاه</td>
                <td>{DIRECTION_AR[preview.direction] ?? preview.direction}</td>
              </tr>
              <tr>
                <td style={tdLabel}>الحالة</td>
                <td>{STATUS_AR[preview.status] ?? preview.status}</td>
              </tr>
              <tr>
                <td style={tdLabel}>الإجمالي</td>
                <td style={{ color: 'var(--text)', fontWeight: 700 }}>{money(preview.total)}</td>
              </tr>
              <tr>
                <td style={tdLabel}>المسدّد</td>
                <td style={{ color: preview.paidAmount > 0 ? 'var(--red)' : undefined, fontWeight: preview.paidAmount > 0 ? 700 : undefined }}>
                  {money(preview.paidAmount)}
                </td>
              </tr>
              <tr>
                <td style={tdLabel}>البنود</td>
                <td>{preview.itemsCount}</td>
              </tr>
              <tr>
                <td style={tdLabel}>الدفعات</td>
                <td>{preview.paymentsCount}</td>
              </tr>
              <tr>
                <td style={tdLabel}>القيود المحاسبية</td>
                <td>{preview.transactionsCount}</td>
              </tr>
            </tbody>
          </table>

          <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13 }}>
            <strong style={{ display: 'block', marginBottom: 6 }}>الأثر المحاسبي:</strong>
            {preview.accountingImpact.revenueReduced > 0 && (
              <div>• الإيرادات ستنخفض بـ <strong>{money(preview.accountingImpact.revenueReduced)}</strong></div>
            )}
            {preview.accountingImpact.expenseReduced > 0 && (
              <div>• المصروفات ستنخفض بـ <strong>{money(preview.accountingImpact.expenseReduced)}</strong></div>
            )}
            {preview.accountingImpact.journalEntriesToDelete > 0
              ? <div>• سيتم حذف <strong>{preview.accountingImpact.journalEntriesToDelete}</strong> قيد محاسبي</div>
              : <div style={{ color: 'var(--text-muted)' }}>• لا توجد قيود محاسبية (فاتورة مستوردة)</div>
            }
          </div>

          {preview.warnings.length > 0 && (
            <div style={{ background: 'var(--amber-bg, #fff8e1)', border: '1px solid var(--amber, #f59e0b)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13 }}>
              <strong style={{ display: 'block', marginBottom: 4 }}>تنبيهات:</strong>
              {preview.warnings.map((w, i) => <div key={i}>• {w}</div>)}
            </div>
          )}

          <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
            اكتب رقم الفاتورة للتأكيد:{' '}
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
