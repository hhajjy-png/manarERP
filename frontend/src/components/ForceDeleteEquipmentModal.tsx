import { useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../api/client';
import Modal from './Modal';

interface ChildCounts {
  maintenanceRecords: number;
  fuelLogs: number;
  breakdowns: number;
  spareParts: number;
}

interface PreviewData {
  equipment: { id: number; code: string; name?: string | null };
  childCounts: ChildCounts;
  totalChildRecords: number;
}

interface Props {
  equipmentId: number;
  onClose: () => void;
  onDeleted: () => void;
}

const CHILD_LABELS: Record<keyof ChildCounts, string> = {
  maintenanceRecords: 'سجلات الصيانة',
  fuelLogs: 'سجلات الوقود',
  breakdowns: 'سجلات الأعطال',
  spareParts: 'قطع الغيار',
};

export default function ForceDeleteEquipmentModal({ equipmentId, onClose, onDeleted }: Props) {
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loadError, setLoadError] = useState('');
  const [confirmCode, setConfirmCode] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get(`/equipment/${equipmentId}/force`, { params: { dryRun: 'true' } })
      .then((res) => {
        setPreview(res.data.data);
        setTimeout(() => inputRef.current?.focus(), 50);
      })
      .catch((err) => setLoadError(errorMessage(err)));
  }, [equipmentId]);

  async function onConfirm() {
    if (!preview || confirmCode !== preview.equipment.code || deleting) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await api.delete(`/equipment/${equipmentId}/force`);
      onDeleted();
    } catch (err) {
      setDeleteError(errorMessage(err));
      setDeleting(false);
    }
  }

  const codeMatches = !!preview && confirmCode === preview.equipment.code;

  return (
    <Modal
      title="⚠️ حذف إجباري للمعدة"
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
            disabled={!codeMatches || deleting}
          >
            {deleting ? 'جارٍ الحذف...' : 'تأكيد الحذف الإجباري'}
          </button>
        </>
      }
    >
      {loadError && (
        <p className="alert error">{loadError}</p>
      )}
      {!preview && !loadError && (
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0' }}>جارٍ التحميل...</p>
      )}
      {preview && (
        <>
          <div className="alert error" style={{ marginBottom: 16 }}>
            <strong>تحذير:</strong> هذه العملية لا يمكن التراجع عنها. سيتم حذف المعدة وجميع بياناتها بشكل نهائي.
          </div>

          <p style={{ marginBottom: 12 }}>
            <strong>المعدة:</strong>{' '}
            <code style={{ background: 'var(--bg-alt)', padding: '2px 6px', borderRadius: 4 }}>
              {preview.equipment.code}
            </code>
            {preview.equipment.name && ` — ${preview.equipment.name}`}
          </p>

          {preview.totalChildRecords > 0 ? (
            <>
              <p style={{ marginBottom: 8, fontWeight: 600 }}>
                السجلات التي ستُحذف ({preview.totalChildRecords} سجل):
              </p>
              <ul style={{ margin: '0 0 16px', paddingInlineStart: 20, lineHeight: 2 }}>
                {(Object.entries(preview.childCounts) as [keyof ChildCounts, number][])
                  .filter(([, count]) => count > 0)
                  .map(([key, count]) => (
                    <li key={key}>
                      {CHILD_LABELS[key]}: <strong>{count}</strong>
                    </li>
                  ))}
              </ul>
            </>
          ) : (
            <p style={{ marginBottom: 16, color: 'var(--text-muted)' }}>
              لا توجد سجلات مرتبطة بهذه المعدة.
            </p>
          )}

          <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
            اكتب رمز المعدة للتأكيد:{' '}
            <code style={{ background: 'var(--bg-alt)', padding: '2px 6px', borderRadius: 4 }}>
              {preview.equipment.code}
            </code>
          </label>
          <input
            ref={inputRef}
            type="text"
            value={confirmCode}
            onChange={(e) => setConfirmCode(e.target.value)}
            placeholder={preview.equipment.code}
            disabled={deleting}
            style={{ width: '100%' }}
            onKeyDown={(e) => { if (e.key === 'Enter' && codeMatches) onConfirm(); }}
          />
          {deleteError && (
            <p className="alert error" style={{ marginTop: 10 }}>{deleteError}</p>
          )}
        </>
      )}
    </Modal>
  );
}
