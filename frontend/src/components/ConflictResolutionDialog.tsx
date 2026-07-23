import Modal from './Modal';
import { dateText } from '../config/modules';
import { useT } from '../lib/i18n';

interface DatabaseVersionInfo {
  sha256: string;
  sizeBytes: number;
  modifiedAt: string;
  deviceId: string | null;
  deviceName: string | null;
}

interface SyncConflictInfo {
  local: DatabaseVersionInfo;
  remote: DatabaseVersionInfo;
  recommendation: 'LOCAL' | 'REMOTE' | 'UNKNOWN';
}

interface Props {
  conflict: SyncConflictInfo;
  busy: boolean;
  /** إن كانت false، يُعرض الحوار للعلم فقط (زرّا الحسم مخفيّان) — يطابق صلاحية backups.update في العملية الرئيسية. */
  canResolve: boolean;
  onKeepLocal: () => void;
  onKeepCloud: () => void;
  onCancel: () => void;
}

function fmtSize(bytes: number, t: (key: string) => string): string {
  if (bytes === 0) return `0 ${t('unit.bytes')}`;
  if (bytes < 1024) return `${bytes} ${t('unit.bytes')}`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} ${t('unit.kilobytes')}`;
  return `${(bytes / 1048576).toFixed(2)} ${t('unit.megabytes')}`;
}

function VersionCard({
  title,
  info,
  recommended,
  t,
}: {
  title: string;
  info: DatabaseVersionInfo;
  recommended: boolean;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  return (
    <div
      className="card panel"
      style={{
        flex: '1 1 260px',
        borderColor: recommended ? 'var(--accent)' : undefined,
        boxShadow: recommended ? '0 0 0 2px var(--accent-light)' : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        {recommended && <span className="pill blue">{t('lbl.conflict.recommended')}</span>}
      </div>
      <table style={{ width: '100%' }}>
        <tbody>
          <tr>
            <td style={{ padding: '5px 0', color: 'var(--text-muted)', width: 110 }}>{t('lbl.conflict.modified_at')}</td>
            <td>{dateText(info.modifiedAt)}</td>
          </tr>
          <tr>
            <td style={{ padding: '5px 0', color: 'var(--text-muted)' }}>{t('lbl.conflict.device')}</td>
            <td>{info.deviceName ?? t('lbl.conflict.unknown_device')}</td>
          </tr>
          <tr>
            <td style={{ padding: '5px 0', color: 'var(--text-muted)' }}>{t('col.backup.size')}</td>
            <td>{fmtSize(info.sizeBytes, t)}</td>
          </tr>
          <tr>
            <td style={{ padding: '5px 0', color: 'var(--text-muted)' }}>SHA-256</td>
            <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{info.sha256 ? `${info.sha256.slice(0, 12)}…` : '—'}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/**
 * حوار حلّ تعارض المزامنة — يُعرض عندما تغيّرت النسختان المحلية والسحابية معًا
 * منذ آخر مزامنة ناجحة. لا يقرّر شيئًا تلقائيًا أبدًا؛ القرار للمستخدم فقط.
 */
export default function ConflictResolutionDialog({ conflict, busy, canResolve, onKeepLocal, onKeepCloud, onCancel }: Props) {
  const { t } = useT();

  return (
    <Modal title={t('title.conflict.dialog')} onClose={onCancel} size="lg">
      <p style={{ lineHeight: 1.8, fontWeight: 600, marginBottom: 16 }}>{t('msg.conflict.explanation')}</p>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
        <VersionCard
          title={t('lbl.conflict.local_title')}
          info={conflict.local}
          recommended={conflict.recommendation === 'LOCAL'}
          t={t}
        />
        <VersionCard
          title={t('lbl.conflict.cloud_title')}
          info={conflict.remote}
          recommended={conflict.recommendation === 'REMOTE'}
          t={t}
        />
      </div>

      <div className="alert warn">{t('msg.conflict.warning')}</div>

      {!canResolve && <div className="alert warn" style={{ marginTop: 12 }}>{t('msg.conflict.no_permission')}</div>}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 20 }}>
        {canResolve && (
          <>
            <button type="button" className="btn" onClick={onKeepLocal} disabled={busy}>
              💾 {t('btn.conflict.keep_local')}
            </button>
            <button type="button" className="btn" onClick={onKeepCloud} disabled={busy}>
              ☁️ {t('btn.conflict.keep_cloud')}
            </button>
          </>
        )}
        <button type="button" className="btn secondary" onClick={onCancel} disabled={busy}>
          {t('action.cancel')}
        </button>
      </div>
    </Modal>
  );
}
