import { useEffect, useState, useRef } from 'react';
import { api, errorMessage } from '../api/client';
import { formatDate } from '../lib/date';
import { useT } from '../lib/i18n';

interface Attachment {
  id: number;
  title: string;
  originalName: string;
  filePath: string;
  fileSize: number;
  mimeType: string | null;
  uploadedAt: string;
  uploadedBy: { username: string; fullName: string | null } | null;
}

interface Props {
  entityType: 'CUSTOMER' | 'CONTRACT' | 'INVOICE' | 'EMPLOYEE' | 'SUPPLIER' | 'EXPENSE' | 'EQUIPMENT';
  entityId: number;
  readOnly?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function InlineError({ msg, onDismiss }: { msg: string; onDismiss: () => void }) {
  const { t } = useT();
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 8, padding: '8px 12px', background: 'var(--red-light)', border: '1px solid var(--red)', borderRadius: 6, fontSize: 13, color: 'var(--red)' }}>
      <span style={{ flex: 1, lineHeight: 1.5, whiteSpace: 'pre-line' }}>{msg}</span>
      <button
        type="button"
        onClick={onDismiss}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: '0 2px', fontSize: 16, lineHeight: 1, flexShrink: 0 }}
        aria-label={t('action.close')}
      >
        ×
      </button>
    </div>
  );
}

export default function AttachmentsPanel({ entityType, entityId, readOnly = false }: Props) {
  const { t } = useT();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    setListError(null);
    try {
      const r = await api.get<{ success: boolean; data: Attachment[] }>('/attachments', {
        params: { entityType, entityId },
      });
      setAttachments(r.data.data ?? []);
    } catch (e) {
      setListError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [entityType, entityId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', titleInput || file.name);

    setUploading(true);
    setUploadError(null);
    try {
      await api.post('/attachments', formData, {
        params: { entityType, entityId },
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setTitleInput('');
      if (fileRef.current) fileRef.current.value = '';
      await load();
    } catch (e) {
      setUploadError(errorMessage(e));
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm(t('dlg.attachments.confirm_delete'))) return;
    setListError(null);
    try {
      await api.delete(`/attachments/${id}`);
      await load();
    } catch (e) {
      setListError(errorMessage(e));
    }
  }

  async function handleOpen(filePath: string) {
    if (window.manar?.openAttachment) {
      const err = await window.manar.openAttachment(filePath);
      if (err) setListError(t('dlg.attachments.open_failed', { err }));
    }
  }

  return (
    <div style={{ marginTop: 16 }}>
      <strong style={{ fontSize: 13, color: 'var(--text)' }}>{t('dlg.attachments.heading', { n: attachments.length })}</strong>

      {!readOnly && (
        <>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder={t('dlg.attachments.title_placeholder')}
              value={titleInput}
              onChange={e => setTitleInput(e.target.value)}
              style={{ flex: 1, minWidth: 140, fontSize: 13 }}
            />
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx,.jpg,.jpeg,.png,.gif,.webp"
              title={t('dlg.attachments.choose_file_title')}
              style={{ flex: 2, fontSize: 13 }}
            />
            <button type="button" onClick={handleUpload} disabled={uploading} className="btn-primary" style={{ fontSize: 13 }}>
              {uploading ? t('dlg.attachments.uploading') : t('dlg.attachments.upload_btn')}
            </button>
          </div>
          {uploadError && <InlineError msg={uploadError} onDismiss={() => setUploadError(null)} />}
        </>
      )}

      {listError && <InlineError msg={listError} onDismiss={() => setListError(null)} />}

      {loading ? (
        <div style={{ marginTop: 10, color: 'var(--text-muted)', fontSize: 13 }}>{t('msg.loading')}</div>
      ) : attachments.length === 0 ? (
        <div style={{ marginTop: 10, color: 'var(--text-muted)', fontSize: 13 }}>{t('dlg.attachments.empty')}</div>
      ) : (
        <table style={{ width: '100%', marginTop: 10, fontSize: 13, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
              <th style={{ textAlign: 'right', padding: '6px 8px' }}>{t('dlg.attachments.col_title')}</th>
              <th style={{ textAlign: 'right', padding: '6px 8px' }}>{t('col.backup.size')}</th>
              <th style={{ textAlign: 'right', padding: '6px 8px' }}>{t('col.date')}</th>
              <th style={{ padding: '6px 8px' }}></th>
            </tr>
          </thead>
          <tbody>
            {attachments.map(att => (
              <tr key={att.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                <td style={{ padding: '6px 8px' }}>
                  <button
                    type="button"
                    onClick={() => handleOpen(att.filePath)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3B82F6', textAlign: 'right', padding: 0 }}
                  >
                    {att.title || att.originalName}
                  </button>
                </td>
                <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>{formatBytes(att.fileSize)}</td>
                <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>
                  {formatDate(att.uploadedAt)}
                </td>
                <td style={{ padding: '6px 8px' }}>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => handleDelete(att.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', fontSize: 13 }}
                    >
                      {t('action.delete')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
