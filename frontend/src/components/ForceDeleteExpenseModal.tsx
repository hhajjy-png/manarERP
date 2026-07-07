import { useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../api/client';
import Modal from './Modal';
import { money, dateText } from '../config/modules';
import { expenseCategoryLabel } from '../config/expenseCategories';

interface PreviewData {
  id: number;
  code: string;
  category: string;
  amount: number;
  date: string;
  status: string;
  paymentMethod: string;
  supplierName: string | null;
  journalEntriesCount: number;
  legacyTransactionsCount: number;
  attachmentsCount: number;
  bankMatchesCount: number;
  willBeDeleted: string[];
  warnings: string[];
}

const STATUS_AR: Record<string, string> = {
  PENDING: 'معلّق',
  APPROVED: 'معتمد',
  REJECTED: 'مرفوض',
  REVERSED: 'معكوس',
  CANCELLED: 'ملغى',
};

interface Props {
  expenseId: number;
  onClose: () => void;
  onDeleted: () => void;
}

/**
 * حذف نهائي لمصروف (SYSTEM_ADMIN فقط) — بما في ذلك المعتمد/المُرحَّل.
 * يعرض لقطة كاملة + الأثر المحاسبي، ويتطلب كتابة رمز المصروف بشكل مطابق.
 * يعكس نمط ForceDeleteInvoiceModal وبقية نوافذ الحذف النهائي.
 */
export default function ForceDeleteExpenseModal({ expenseId, onClose, onDeleted }: Props) {
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loadError, setLoadError] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get(`/expenses/${expenseId}/force`)
      .then((res) => {
        setPreview(res.data.data);
        setTimeout(() => inputRef.current?.focus(), 50);
      })
      .catch((err) => setLoadError(errorMessage(err)));
  }, [expenseId]);

  const textMatches = !!preview && confirmText === preview.code;

  async function onConfirm() {
    if (!textMatches || deleting) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await api.delete(`/expenses/${expenseId}/force`, { data: { confirmation: confirmText } });
      onDeleted();
    } catch (err) {
      setDeleteError(errorMessage(err));
      setDeleting(false);
    }
  }

  const hasAccounting = !!preview && (preview.journalEntriesCount > 0 || preview.legacyTransactionsCount > 0);

  return (
    <Modal
      title="⚠️ حذف نهائي للمصروف"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn secondary" onClick={onClose} disabled={deleting}>إلغاء</button>
          <button type="button" className="btn danger" onClick={onConfirm} disabled={!textMatches || deleting}>
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
            <strong>تحذير:</strong> هذا الإجراء سيحذف المصروف وكل السجلات المرتبطة به نهائيًا ولا يمكن التراجع عنه.
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12, fontSize: 14 }}>
            <tbody>
              <tr>
                <td style={tdLabel}>رمز المصروف</td>
                <td><strong style={{ fontFamily: 'monospace' }}>{preview.code}</strong></td>
              </tr>
              <tr>
                <td style={tdLabel}>التصنيف</td>
                <td>{expenseCategoryLabel(preview.category)}</td>
              </tr>
              <tr>
                <td style={tdLabel}>المبلغ</td>
                <td style={{ color: 'var(--text)', fontWeight: 700 }}>{money(preview.amount)}</td>
              </tr>
              <tr>
                <td style={tdLabel}>التاريخ</td>
                <td>{dateText(preview.date)}</td>
              </tr>
              <tr>
                <td style={tdLabel}>الحالة</td>
                <td>{STATUS_AR[preview.status] ?? preview.status}</td>
              </tr>
              {preview.supplierName && (
                <tr>
                  <td style={tdLabel}>المورد</td>
                  <td>{preview.supplierName}</td>
                </tr>
              )}
            </tbody>
          </table>

          <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13 }}>
            <strong style={{ display: 'block', marginBottom: 6 }}>السجلات المرتبطة:</strong>
            {hasAccounting ? (
              <>
                {preview.journalEntriesCount > 0 && <div>• سيتم حذف <strong>{preview.journalEntriesCount}</strong> قيد يومية محاسبي</div>}
                {preview.legacyTransactionsCount > 0 && <div>• سيتم حذف <strong>{preview.legacyTransactionsCount}</strong> قيد (سجل مفرد)</div>}
              </>
            ) : (
              <div style={{ color: 'var(--text-muted)' }}>• لا توجد قيود محاسبية مرتبطة</div>
            )}
            {preview.attachmentsCount > 0 && <div>• سيتم حذف <strong>{preview.attachmentsCount}</strong> مرفق</div>}
            {preview.bankMatchesCount > 0 && <div>• ستُلغى مطابقة <strong>{preview.bankMatchesCount}</strong> عملية في كشوف البنك</div>}
          </div>

          {preview.warnings.length > 0 && (
            <div style={{ background: 'var(--amber-bg, #fff8e1)', border: '1px solid var(--amber, #f59e0b)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13 }}>
              <strong style={{ display: 'block', marginBottom: 4 }}>تنبيهات:</strong>
              {preview.warnings.map((w, i) => <div key={i}>• {w}</div>)}
            </div>
          )}

          <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
            اكتب رمز المصروف للتأكيد:{' '}
            <code style={{ background: 'var(--bg-alt)', padding: '2px 6px', borderRadius: 4 }}>{preview.code}</code>
          </label>
          <input
            ref={inputRef}
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={preview.code}
            disabled={deleting}
            style={{ width: '100%', direction: 'ltr' }}
            onKeyDown={(e) => { if (e.key === 'Enter' && textMatches) onConfirm(); }}
          />
          {deleteError && <p className="alert error" style={{ marginTop: 10 }}>{deleteError}</p>}
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
