import { useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../api/client';
import Modal from './Modal';

interface ChildCounts {
  invoices: number;
  expenses: number;
  purchaseOrdersActive: number;
  purchaseOrdersCancelled: number;
  goodsReceiptsPosted: number;
  goodsReceiptsDraft: number;
}

interface PreviewData {
  supplier: { id: number; code: string; name?: string | null };
  childCounts: ChildCounts;
  totalChildRecords: number;
  willBeDeleted: string[];
  willBeNullified: string[];
  blockedReason?: string;
}

interface Props {
  supplierId: number;
  onClose: () => void;
  onDeleted: () => void;
}

const DELETED_LABELS: Record<string, string> = {
  supplier: 'المورّد',
  purchaseOrdersCancelled: 'أوامر الشراء الملغاة',
  goodsReceiptsDraft: 'إيصالات الاستلام المسودة',
};

const NULLIFIED_LABELS: Record<string, string> = {
  'expenses.supplierId': 'المصروفات (إلغاء ربطها بالمورّد)',
};

const CHILD_COUNT_LABELS: Record<keyof ChildCounts, string> = {
  invoices: 'فواتير مرتبطة بالمورّد',
  expenses: 'مصروفات',
  purchaseOrdersActive: 'أوامر شراء نشطة',
  purchaseOrdersCancelled: 'أوامر شراء ملغاة',
  goodsReceiptsPosted: 'إيصالات استلام محاسبية',
  goodsReceiptsDraft: 'إيصالات استلام مسودة',
};

export default function ForceDeleteSupplierModal({ supplierId, onClose, onDeleted }: Props) {
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loadError, setLoadError] = useState('');
  const [confirmCode, setConfirmCode] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get(`/suppliers/${supplierId}/force`)
      .then((res) => {
        setPreview(res.data.data);
        if (!res.data.data.blockedReason) {
          setTimeout(() => inputRef.current?.focus(), 50);
        }
      })
      .catch((err) => setLoadError(errorMessage(err)));
  }, [supplierId]);

  async function onConfirm() {
    if (!preview || preview.blockedReason || confirmCode !== preview.supplier.code || deleting) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await api.delete(`/suppliers/${supplierId}/force`);
      onDeleted();
    } catch (err) {
      setDeleteError(errorMessage(err));
      setDeleting(false);
    }
  }

  const isBlocked = !!preview?.blockedReason;
  const codeMatches = !!preview && !isBlocked && confirmCode === preview.supplier.code;

  return (
    <Modal
      title="⚠️ حذف إجباري للمورّد"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn secondary" onClick={onClose} disabled={deleting}>
            {isBlocked ? 'إغلاق' : 'إلغاء'}
          </button>
          {!isBlocked && (
            <button
              type="button"
              className="btn danger"
              onClick={onConfirm}
              disabled={!codeMatches || deleting}
            >
              {deleting ? 'جارٍ الحذف...' : 'تأكيد الحذف الإجباري'}
            </button>
          )}
        </>
      }
    >
      {loadError && <p className="alert error">{loadError}</p>}

      {!preview && !loadError && (
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0' }}>جارٍ التحميل...</p>
      )}

      {preview && (
        <>
          {isBlocked ? (
            <div className="alert error" style={{ marginBottom: 16 }}>
              <strong>الحذف غير ممكن:</strong> {preview.blockedReason}
            </div>
          ) : (
            <div className="alert error" style={{ marginBottom: 16 }}>
              <strong>تحذير:</strong> هذه العملية لا يمكن التراجع عنها. سيتم حذف المورّد وجميع بياناتها بشكل نهائي.
            </div>
          )}

          <p style={{ marginBottom: 12 }}>
            <strong>المورّد:</strong>{' '}
            <code style={{ background: 'var(--bg-alt)', padding: '2px 6px', borderRadius: 4 }}>
              {preview.supplier.code}
            </code>
            {preview.supplier.name && ` — ${preview.supplier.name}`}
          </p>

          {preview.totalChildRecords > 0 && (
            <>
              <p style={{ marginBottom: 8, fontWeight: 600 }}>
                السجلات المرتبطة ({preview.totalChildRecords} سجل):
              </p>
              <ul style={{ margin: '0 0 8px', paddingInlineStart: 20, lineHeight: 2 }}>
                {(Object.entries(preview.childCounts) as [keyof ChildCounts, number][])
                  .filter(([, count]) => count > 0)
                  .map(([key, count]) => (
                    <li key={key}>
                      {CHILD_COUNT_LABELS[key]}: <strong>{count}</strong>
                    </li>
                  ))}
              </ul>
            </>
          )}

          {!isBlocked && (
            <>
              {preview.willBeDeleted.length > 1 && (
                <p style={{ marginBottom: 4, fontSize: 13, color: 'var(--danger)' }}>
                  <strong>سيُحذف نهائياً:</strong>{' '}
                  {preview.willBeDeleted.map((k) => DELETED_LABELS[k] ?? k).join('، ')}
                </p>
              )}
              {preview.willBeNullified.length > 0 && (
                <p style={{ marginBottom: 16, fontSize: 13, color: 'var(--text-muted)' }}>
                  <strong>سيُلغى ربطه:</strong>{' '}
                  {preview.willBeNullified.map((k) => NULLIFIED_LABELS[k] ?? k).join('، ')}
                </p>
              )}

              <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
                اكتب رمز المورّد للتأكيد:{' '}
                <code style={{ background: 'var(--bg-alt)', padding: '2px 6px', borderRadius: 4 }}>
                  {preview.supplier.code}
                </code>
              </label>
              <input
                ref={inputRef}
                type="text"
                value={confirmCode}
                onChange={(e) => setConfirmCode(e.target.value)}
                placeholder={preview.supplier.code}
                disabled={deleting}
                style={{ width: '100%' }}
                onKeyDown={(e) => { if (e.key === 'Enter' && codeMatches) onConfirm(); }}
              />
              {deleteError && (
                <p className="alert error" style={{ marginTop: 10 }}>{deleteError}</p>
              )}
            </>
          )}
        </>
      )}
    </Modal>
  );
}
