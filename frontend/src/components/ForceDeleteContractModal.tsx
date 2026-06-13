import { useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../api/client';
import Modal from './Modal';

interface ChildCounts {
  invoices: number;
  expenses: number;
  materialIssues: number;
  contractDocuments: number;
}

interface PreviewData {
  contract: { id: number; code: string; asphaltPlant?: string | null };
  childCounts: ChildCounts;
  totalChildRecords: number;
  willBeDeleted: string[];
  willBeNullified: string[];
  blockedReason?: string;
}

interface Props {
  contractId: number;
  onClose: () => void;
  onDeleted: () => void;
}

const DELETED_LABELS: Record<string, string> = {
  contract: 'العقد',
  contractDocuments: 'مستندات العقد',
};

const NULLIFIED_LABELS: Record<string, string> = {
  'expenses.contractId': 'المصروفات (إلغاء ربطها بالعقد)',
  'materialIssues.contractId': 'سندات صرف المواد (إلغاء ربطها بالعقد)',
};

const CHILD_COUNT_LABELS: Record<keyof ChildCounts, string> = {
  invoices: 'فواتير مرتبطة بالعقد',
  expenses: 'مصروفات',
  materialIssues: 'سندات صرف مواد',
  contractDocuments: 'مستندات العقد',
};

export default function ForceDeleteContractModal({ contractId, onClose, onDeleted }: Props) {
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loadError, setLoadError] = useState('');
  const [confirmCode, setConfirmCode] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get(`/contracts/${contractId}/force`)
      .then((res) => {
        setPreview(res.data.data);
        if (!res.data.data.blockedReason) {
          setTimeout(() => inputRef.current?.focus(), 50);
        }
      })
      .catch((err) => setLoadError(errorMessage(err)));
  }, [contractId]);

  async function onConfirm() {
    if (!preview || preview.blockedReason || confirmCode !== preview.contract.code || deleting) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await api.delete(`/contracts/${contractId}/force`);
      onDeleted();
    } catch (err) {
      setDeleteError(errorMessage(err));
      setDeleting(false);
    }
  }

  const isBlocked = !!preview?.blockedReason;
  const codeMatches = !!preview && !isBlocked && confirmCode === preview.contract.code;

  return (
    <Modal
      title="⚠️ حذف إجباري للعقد"
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
              <strong>تحذير:</strong> هذه العملية لا يمكن التراجع عنها. سيتم حذف العقد وجميع بياناته بشكل نهائي.
            </div>
          )}

          <p style={{ marginBottom: 12 }}>
            <strong>العقد:</strong>{' '}
            <code style={{ background: 'var(--bg-alt)', padding: '2px 6px', borderRadius: 4 }}>
              {preview.contract.code}
            </code>
            {preview.contract.asphaltPlant && ` — ${preview.contract.asphaltPlant}`}
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
                اكتب رمز العقد للتأكيد:{' '}
                <code style={{ background: 'var(--bg-alt)', padding: '2px 6px', borderRadius: 4 }}>
                  {preview.contract.code}
                </code>
              </label>
              <input
                ref={inputRef}
                type="text"
                value={confirmCode}
                onChange={(e) => setConfirmCode(e.target.value)}
                placeholder={preview.contract.code}
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
