import { useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../api/client';
import Modal from './Modal';
import { money } from '../config/modules';

interface PreviewData {
  price: {
    id: number;
    asphaltPlant: string;
    companyName: string;
    contractLocation: string;
    contractUnit: string;
    unitPrice: number;
    isArchived: boolean;
  };
  childCounts: Record<string, never>;
  totalChildRecords: number;
  willBeDeleted: string[];
  willBeNullified: string[];
}

interface Props {
  priceId: number;
  onClose: () => void;
  onDeleted: () => void;
}

export default function ForceDeleteProjectPriceModal({ priceId, onClose, onDeleted }: Props) {
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loadError, setLoadError] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get(`/prices/${priceId}/force`)
      .then((res) => {
        setPreview(res.data.data);
        setTimeout(() => inputRef.current?.focus(), 50);
      })
      .catch((err) => setLoadError(errorMessage(err)));
  }, [priceId]);

  async function onConfirm() {
    if (!preview || confirmText !== preview.price.asphaltPlant || deleting) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await api.delete(`/prices/${priceId}/force`);
      onDeleted();
    } catch (err) {
      setDeleteError(errorMessage(err));
      setDeleting(false);
    }
  }

  const textMatches = !!preview && confirmText === preview.price.asphaltPlant;

  return (
    <Modal
      title="⚠️ حذف نهائي لسعر العقد"
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
            <strong>تحذير:</strong> هذه العملية لا يمكن التراجع عنها. سيتم حذف سعر العقد نهائياً من قاعدة البيانات.
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12, fontSize: 14 }}>
            <tbody>
              <tr>
                <td style={tdLabel}>المصنع</td>
                <td><strong>{preview.price.asphaltPlant}</strong></td>
              </tr>
              <tr>
                <td style={tdLabel}>الشركة</td>
                <td>{preview.price.companyName}</td>
              </tr>
              <tr>
                <td style={tdLabel}>الموقع</td>
                <td>{preview.price.contractLocation}</td>
              </tr>
              <tr>
                <td style={tdLabel}>الوحدة</td>
                <td>{preview.price.contractUnit}</td>
              </tr>
              <tr>
                <td style={tdLabel}>سعر الوحدة</td>
                <td style={{ color: 'var(--green)', fontWeight: 700 }}>{money(preview.price.unitPrice)}</td>
              </tr>
            </tbody>
          </table>

          <p style={{ marginBottom: 16, fontSize: 13, color: 'var(--text-muted)' }}>
            هذا السعر لا يحتوي على سجلات مرتبطة. حذفه لن يؤثر على أي عقد أو فاتورة قائمة.
          </p>

          <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
            اكتب اسم المصنع للتأكيد:{' '}
            <code style={{ background: 'var(--bg-alt)', padding: '2px 6px', borderRadius: 4 }}>
              {preview.price.asphaltPlant}
            </code>
          </label>
          <input
            ref={inputRef}
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={preview.price.asphaltPlant}
            disabled={deleting}
            style={{ width: '100%' }}
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
  width: 100,
  whiteSpace: 'nowrap',
};
