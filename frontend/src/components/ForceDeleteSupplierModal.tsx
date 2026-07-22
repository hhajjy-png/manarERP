import { useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../api/client';
import { useT } from '../lib/i18n';
import { useUI } from '../stores/uiStore';
import { resolveName } from '../lib/resolveName';
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
  supplier: { id: number; code: string; name?: string | null; nameEn?: string | null };
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

const DELETED_KEYS: Record<string, string> = {
  supplier: 'field.supplier',
  purchaseOrdersCancelled: 'dlg.force_delete.supplier.deleted.po_cancelled',
  goodsReceiptsDraft: 'dlg.force_delete.supplier.deleted.gr_draft',
};

const NULLIFIED_KEYS: Record<string, string> = {
  'expenses.supplierId': 'dlg.force_delete.supplier.nullified.expenses',
};

const CHILD_COUNT_KEYS: Record<keyof ChildCounts, string> = {
  invoices: 'dlg.force_delete.supplier.count.invoices',
  expenses: 'dlg.force_delete.count.expenses',
  purchaseOrdersActive: 'dlg.force_delete.supplier.count.po_active',
  purchaseOrdersCancelled: 'dlg.force_delete.supplier.count.po_cancelled',
  goodsReceiptsPosted: 'dlg.force_delete.supplier.count.gr_posted',
  goodsReceiptsDraft: 'dlg.force_delete.supplier.count.gr_draft',
};

export default function ForceDeleteSupplierModal({ supplierId, onClose, onDeleted }: Props) {
  const { t } = useT();
  const lang = useUI((s) => s.lang);
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
      title={t('dlg.force_delete.supplier.title')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn secondary" onClick={onClose} disabled={deleting}>
            {isBlocked ? t('action.close') : t('action.cancel')}
          </button>
          {!isBlocked && (
            <button
              type="button"
              className="btn danger"
              onClick={onConfirm}
              disabled={!codeMatches || deleting}
            >
              {deleting ? t('dlg.force_delete.deleting') : t('dlg.force_delete.confirm_force')}
            </button>
          )}
        </>
      }
    >
      {loadError && <p className="alert error">{loadError}</p>}

      {!preview && !loadError && (
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0' }}>{t('dlg.force_delete.loading')}</p>
      )}

      {preview && (
        <>
          {isBlocked ? (
            <div className="alert error" style={{ marginBottom: 16 }}>
              <strong>{t('dlg.force_delete.blocked_prefix')}</strong> {preview.blockedReason}
            </div>
          ) : (
            <div className="alert error" style={{ marginBottom: 16 }}>
              <strong>{t('dlg.force_delete.warning_label')}</strong> {t('dlg.force_delete.supplier.warning_body')}
            </div>
          )}

          <p style={{ marginBottom: 12 }}>
            <strong>{t('dlg.force_delete.supplier.entity_label')}</strong>{' '}
            <code style={{ background: 'var(--bg-alt)', padding: '2px 6px', borderRadius: 4 }}>
              {preview.supplier.code}
            </code>
            {preview.supplier.name && ` — ${resolveName({ ...preview.supplier, name: preview.supplier.name }, lang)}`}
          </p>

          {preview.totalChildRecords > 0 && (
            <>
              <p style={{ marginBottom: 8, fontWeight: 600 }}>
                {t('dlg.force_delete.related_records', { n: preview.totalChildRecords })}
              </p>
              <ul style={{ margin: '0 0 8px', paddingInlineStart: 20, lineHeight: 2 }}>
                {(Object.entries(preview.childCounts) as [keyof ChildCounts, number][])
                  .filter(([, count]) => count > 0)
                  .map(([key, count]) => (
                    <li key={key}>
                      {t(CHILD_COUNT_KEYS[key])}: <strong>{count}</strong>
                    </li>
                  ))}
              </ul>
            </>
          )}

          {!isBlocked && (
            <>
              {preview.willBeDeleted.length > 1 && (
                <p style={{ marginBottom: 4, fontSize: 13, color: 'var(--danger)' }}>
                  <strong>{t('dlg.force_delete.will_delete')}</strong>{' '}
                  {preview.willBeDeleted.map((k) => (DELETED_KEYS[k] ? t(DELETED_KEYS[k]) : k)).join(t('dlg.force_delete.list_separator'))}
                </p>
              )}
              {preview.willBeNullified.length > 0 && (
                <p style={{ marginBottom: 16, fontSize: 13, color: 'var(--text-muted)' }}>
                  <strong>{t('dlg.force_delete.will_nullify')}</strong>{' '}
                  {preview.willBeNullified.map((k) => (NULLIFIED_KEYS[k] ? t(NULLIFIED_KEYS[k]) : k)).join(t('dlg.force_delete.list_separator'))}
                </p>
              )}

              <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
                {t('dlg.force_delete.supplier.confirm_prompt')}{' '}
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
