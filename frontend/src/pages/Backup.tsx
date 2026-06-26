import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client';
import ConfirmModal from '../components/ConfirmModal';
import { dateText } from '../config/modules';
import { useAuth } from '../stores/authStore';
import { useT } from '../lib/i18n';
import { useToast } from '../stores/toastStore';

const isElectron = typeof window !== 'undefined' && !!window.manar;

interface BackupRecord {
  id: number;
  fileName: string;
  filePath: string;
  sizeBytes: number;
  type: string;
  status: string;
  createdAt: string;
  // verification fields (added Phase C)
  checksumSha256:     string | null;
  verifiedAt:         string | null;
  verificationStatus: string | null; // 'PASS' | 'FAIL' | null
  verificationNote:   string | null;
}

function fmt(bytes: number): string {
  if (bytes === 0) return '0 ب';
  if (bytes < 1024) return `${bytes} ب`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} ك.ب`;
  return `${(bytes / 1048576).toFixed(2)} م.ب`;
}

export default function Backup() {
  const { hasPermission } = useAuth();
  const { t } = useT();
  const toast = useToast();
  const canCreate = hasPermission('backups.create');
  const canRestore = hasPermission('backups.update');

  type AutoStatus = { lastRunAt: string | null; lastStatus: 'SUCCESS' | 'FAILED' | 'NEVER'; lastError: string; backupDir: string };
  type AutoSettings = { enabled: boolean; time: string; retentionCount: number };

  const canSettings = hasPermission('settings.update');

  const [list, setList] = useState<BackupRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [restoreListConfirm, setRestoreListConfirm] = useState<{ id: number; fileName: string } | null>(null);
  const [restoreFileConfirm, setRestoreFileConfirm] = useState<string | null>(null);
  const [deleteBackupId, setDeleteBackupId] = useState<number | null>(null);
  const [dbInfo, setDbInfo] = useState<{ dir: string; backupDir: string; exists: boolean; sizeBytes: number; isDev: boolean } | null>(null);
  const [showDbPath, setShowDbPath] = useState(false);
  const [autoStatus, setAutoStatus] = useState<AutoStatus | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<AutoSettings>({ enabled: true, time: '22:00', retentionCount: 30 });
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [verifying, setVerifying] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [listRes, statusRes, settingsRes] = await Promise.all([
        api.get('/backups'),
        api.get('/backups/auto-status').catch(() => null),
        api.get('/backups/settings').catch(() => null),
      ]);
      setList(listRes.data.data ?? []);
      if (statusRes) setAutoStatus(statusRes.data.data);
      if (settingsRes) setSettingsDraft(settingsRes.data.data);
    } catch { /* table may be empty */ } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function verifyBackup(id: number) {
    setVerifying(id);
    try {
      await api.post(`/backups/${id}/verify`);
      await load(); // refresh list
    } catch {
      // error shown by global interceptor
    } finally {
      setVerifying(null);
    }
  }

  async function saveSettings() {
    setSettingsBusy(true);
    try {
      await api.put('/backups/settings', settingsDraft);
      if (isElectron) await window.manar!.backupReconfigure();
      toast.ok(t('msg.backup.settings_saved'));
      // Reload status to reflect enabled/disabled immediately
      const statusRes = await api.get('/backups/auto-status').catch(() => null);
      if (statusRes) setAutoStatus(statusRes.data.data);
    } catch (err) { toast.error(errorMessage(err)); } finally { setSettingsBusy(false); }
  }

  async function createBackupApi() {
    setBusy(true);
    try {
      await api.post('/backups');
      toast.ok(t('msg.backup.created'));
      load();
    } catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
  }

  async function createBackupElectron() {
    if (!isElectron) { toast.warn(t('msg.backup.desktop_only')); return; }
    setBusy(true);
    const result = await window.manar!.backupCreate();
    setBusy(false);
    if (result.success) {
      toast.ok(t('msg.backup.direct_done', { size: fmt(result.sizeBytes ?? 0) }));
    } else if (!result.canceled) {
      toast.error(result.error ?? t('msg.backup.create_fail'));
    }
  }

  async function exportDb() {
    if (!isElectron) { toast.warn(t('msg.backup.desktop_only')); return; }
    const targetPath = await window.manar!.chooseSavePath('manar-export.db');
    if (!targetPath) return;
    try { await api.post('/backups/export', { path: targetPath }); toast.ok(t('msg.backup.export_done')); }
    catch (err) { toast.error(errorMessage(err)); }
  }

  function restoreFromList(id: number, fileName: string) { setRestoreListConfirm({ id, fileName }); }

  async function executeRestoreFromList(id: number) {
    setRestoreListConfirm(null);
    setBusy(true);
    try {
      await api.post(`/backups/${id}/restore`);
      toast.warn(t('msg.backup.restored_restart', { size: '' }).replace(' ()', ''));
      if (isElectron) {
        await new Promise((r) => setTimeout(r, 2000));
        await window.manar!.restartApp();
      }
    } catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
  }

  async function restoreFromFile() {
    if (!isElectron) { toast.warn(t('msg.backup.desktop_only')); return; }
    const sourcePath = await window.manar!.chooseBackupFile();
    if (!sourcePath) return;
    setRestoreFileConfirm(sourcePath);
  }

  async function executeRestoreFromFile(sourcePath: string) {
    setRestoreFileConfirm(null);
    setBusy(true);
    const result = await window.manar!.backupRestore(sourcePath);
    setBusy(false);
    if (result.success) {
      toast.warn(t('msg.backup.restored_restart', { size: fmt(result.sizeBytes ?? 0) }));
      await new Promise((r) => setTimeout(r, 3000));
      await window.manar!.restartApp();
    } else {
      toast.error(result.error ?? t('msg.backup.restore_fail'));
    }
  }

  async function toggleDbPath() {
    if (!isElectron) { toast.warn(t('msg.backup.desktop_only')); return; }
    if (showDbPath) { setShowDbPath(false); return; }
    const info = await window.manar!.getDbPath();
    setDbInfo(info);
    setShowDbPath(true);
  }

  function remove(id: number) { setDeleteBackupId(id); }

  async function executeRemove(id: number) {
    setDeleteBackupId(null);
    if (busy) return; setBusy(true);
    try { await api.delete(`/backups/${id}`); load(); } catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
  }

  function verifyBadge(status: string | null, note: string | null) {
    if (status === 'PASS') return <span style={{ color: '#10B981', fontWeight: 600 }} title={note ?? undefined}>✓ ناجح</span>;
    if (status === 'FAIL') return <span style={{ color: '#EF4444', fontWeight: 600 }} title={note ?? undefined}>✗ فشل</span>;
    return <span style={{ color: '#9CA3AF' }}>—</span>;
  }

  return (
    <div>
      <div className="page-head">
        <div><h2>{t('page.backup.title')}</h2><p>{t('page.backup.subtitle')}</p></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {isElectron && (
            <button type="button" className="btn secondary" onClick={toggleDbPath}>
              {showDbPath ? `🔒 ${t('btn.backup.toggle_path_hide')}` : `📂 ${t('btn.backup.toggle_path_show')}`}
            </button>
          )}
          {canCreate && isElectron && (
            <button type="button" className="btn secondary" onClick={exportDb} disabled={busy}>⤓ {t('btn.backup.export')}</button>
          )}
          {canRestore && isElectron && (
            <button type="button" className="btn secondary" onClick={restoreFromFile} disabled={busy}>↩️ {t('btn.backup.restore_file')}</button>
          )}
          {canCreate && isElectron && (
            <button type="button" className="btn secondary" onClick={createBackupElectron} disabled={busy}>💾 {t('btn.backup.direct')}</button>
          )}
          {canCreate && (
            <button type="button" className="btn" onClick={createBackupApi} disabled={busy}>💾 {t('btn.backup.now')}</button>
          )}
        </div>
      </div>

      {busy && <div className="alert warn" style={{ marginBottom: 16 }}>⏳ {t('msg.backup.busy')}</div>}

      {showDbPath && dbInfo && (
        <div className="card panel" style={{ marginBottom: 16, background: 'var(--surface-2)' }}>
          <h3 style={{ marginBottom: 12 }}>📂 {t('section.backup.db_info')}</h3>
          <table style={{ width: '100%' }}>
            <tbody>
              <tr>
                <td style={{ padding: '5px 0', color: 'var(--text-muted)', width: 160 }}>{t('col.backup.folder')}</td>
                <td style={{ fontFamily: 'monospace', fontSize: 13, wordBreak: 'break-all' }}>{dbInfo.dir}</td>
              </tr>
              <tr>
                <td style={{ padding: '5px 0', color: 'var(--text-muted)' }}>{t('col.backup.backup_dir')}</td>
                <td style={{ fontFamily: 'monospace', fontSize: 13, wordBreak: 'break-all' }}>{dbInfo.backupDir}</td>
              </tr>
              <tr>
                <td style={{ padding: '5px 0', color: 'var(--text-muted)' }}>{t('col.backup.size')}</td>
                <td><strong>{fmt(dbInfo.sizeBytes)}</strong></td>
              </tr>
              <tr>
                <td style={{ padding: '5px 0', color: 'var(--text-muted)' }}>{t('col.status')}</td>
                <td><span className={`pill ${dbInfo.exists ? 'green' : 'red'}`}>{dbInfo.exists ? `${t('lbl.backup.db_exists')} ✓` : `${t('lbl.backup.db_missing')} ✗`}</span></td>
              </tr>
              <tr>
                <td style={{ padding: '5px 0', color: 'var(--text-muted)' }}>{t('field.acc.active_status')}</td>
                <td><span className={`pill ${dbInfo.isDev ? 'amber' : 'blue'}`}>{dbInfo.isDev ? t('lbl.backup.dev_env') : t('lbl.backup.prod_env')}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {autoStatus && (
        <div className="card panel" style={{ marginBottom: 16, background: 'var(--surface-2)' }}>
          <h3 style={{ marginBottom: 12 }}>🕐 {t('section.backup.auto_status')}</h3>
          <table style={{ width: '100%' }}>
            <tbody>
              <tr>
                <td style={{ padding: '5px 0', color: 'var(--text-muted)', width: 180 }}>{t('lbl.backup.last_status')}</td>
                <td>
                  <span className={`pill ${autoStatus.lastStatus === 'SUCCESS' ? 'green' : autoStatus.lastStatus === 'FAILED' ? 'red' : 'gray'}`}>
                    {autoStatus.lastStatus === 'SUCCESS'
                      ? t('backup.status.success')
                      : autoStatus.lastStatus === 'FAILED'
                        ? t('backup.status.failed')
                        : t('backup.status.never')}
                  </span>
                </td>
              </tr>
              <tr>
                <td style={{ padding: '5px 0', color: 'var(--text-muted)' }}>{t('lbl.backup.last_run')}</td>
                <td>{autoStatus.lastRunAt ? dateText(autoStatus.lastRunAt) : '—'}</td>
              </tr>
              {autoStatus.lastStatus === 'FAILED' && autoStatus.lastError && (
                <tr>
                  <td style={{ padding: '5px 0', color: 'var(--text-muted)' }}>{t('lbl.backup.last_error')}</td>
                  <td style={{ color: 'var(--color-danger)', fontSize: 13 }}>{autoStatus.lastError}</td>
                </tr>
              )}
              <tr>
                <td style={{ padding: '5px 0', color: 'var(--text-muted)' }}>{t('lbl.backup.backup_dir_path')}</td>
                <td style={{ fontFamily: 'monospace', fontSize: 13, wordBreak: 'break-all' }}>{autoStatus.backupDir}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div className="card panel" style={{ marginBottom: 16, background: 'var(--surface-2)' }}>
        <h3 style={{ marginBottom: 12 }}>⚙️ {t('section.backup.auto_settings')}</h3>
        <table style={{ width: '100%' }}>
          <tbody>
            <tr>
              <td style={{ padding: '7px 0', color: 'var(--text-muted)', width: 200 }}>{t('lbl.backup.auto_enabled')}</td>
              <td>
                <input
                  type="checkbox"
                  title={t('lbl.backup.auto_enabled')}
                  checked={settingsDraft.enabled}
                  disabled={!canSettings || settingsBusy}
                  onChange={(e) => setSettingsDraft((s) => ({ ...s, enabled: e.target.checked }))}
                />
              </td>
            </tr>
            <tr>
              <td style={{ padding: '7px 0', color: 'var(--text-muted)' }}>{t('lbl.backup.auto_time')}</td>
              <td>
                <input
                  type="time"
                  title={t('lbl.backup.auto_time')}
                  value={settingsDraft.time}
                  disabled={!canSettings || settingsBusy}
                  onChange={(e) => setSettingsDraft((s) => ({ ...s, time: e.target.value }))}
                  style={{ width: 120 }}
                />
              </td>
            </tr>
            <tr>
              <td style={{ padding: '7px 0', color: 'var(--text-muted)' }}>{t('lbl.backup.auto_retention')}</td>
              <td>
                <input
                  type="number"
                  title={t('lbl.backup.auto_retention')}
                  min={1}
                  max={365}
                  value={settingsDraft.retentionCount}
                  disabled={!canSettings || settingsBusy}
                  onChange={(e) => setSettingsDraft((s) => ({ ...s, retentionCount: Math.max(1, Math.min(365, parseInt(e.target.value, 10) || 1)) }))}
                  style={{ width: 80 }}
                />
              </td>
            </tr>
          </tbody>
        </table>
        {canSettings && (
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
            <button type="button" className="btn" onClick={saveSettings} disabled={settingsBusy}>
              {settingsBusy ? `⏳ ${t('msg.loading')}` : t('btn.backup.save_settings')}
            </button>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {isElectron ? t('note.backup.reconfigure') : t('note.backup.reconfigure_web')}
            </span>
          </div>
        )}
      </div>

      <div className="card panel" style={{ padding: 0 }}>
        <div className="table-responsive">
          <table>
            <thead>
              <tr><th>{t('col.backup.file')}</th><th>{t('col.backup.size')}</th><th>{t('col.backup.type')}</th><th>{t('col.date')}</th><th>التحقق</th><th></th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6}><div className="center-msg"><div className="spinner" />{t('msg.loading')}</div></td></tr>
              ) : list.length === 0 ? (
                <tr><td colSpan={6}><div className="center-msg">{t('msg.backup.no_records')}</div></td></tr>
              ) : list.map((b) => (
                <tr key={b.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 13 }}><strong>{b.fileName}</strong></td>
                  <td>{fmt(b.sizeBytes)}</td>
                  <td>
                    <span className={`pill ${b.type === 'MANUAL' ? 'blue' : b.type === 'AUTO' ? 'gray' : 'amber'}`}>
                      {b.type === 'MANUAL' ? t('backup.type.manual') : b.type === 'AUTO' ? t('backup.type.auto') : t('backup.type.scheduled')}
                    </span>
                  </td>
                  <td>{dateText(b.createdAt)}</td>
                  <td>{verifyBadge(b.verificationStatus ?? null, b.verificationNote ?? null)}</td>
                  <td style={{ textAlign: 'left', whiteSpace: 'nowrap' }}>
                    <button type="button" className="btn secondary sm" disabled={verifying === b.id || busy} onClick={() => verifyBackup(b.id)}>
                      {verifying === b.id ? '⏳' : '✓'} تحقق
                    </button>{' '}
                    {canRestore && <><button type="button" className="btn secondary sm" disabled={busy} onClick={() => restoreFromList(b.id, b.fileName)}>↩️ {t('btn.backup.restore')}</button>{' '}</>}
                    {canRestore && <button type="button" className="btn danger sm" onClick={() => remove(b.id)} disabled={busy}>{t('action.delete')}</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card panel" style={{ marginTop: 16, background: 'var(--surface-2)', fontSize: 13, color: 'var(--text-muted)' }}>
        <strong>{t('note.backup.types')}</strong>
      </div>

      {restoreListConfirm && (
        <ConfirmModal
          title="تأكيد الاستعادة"
          message={t('confirm.backup.restore_list', { fileName: restoreListConfirm.fileName })}
          confirmLabel="استعادة"
          variant="warning"
          onConfirm={() => executeRestoreFromList(restoreListConfirm.id)}
          onCancel={() => setRestoreListConfirm(null)}
        />
      )}
      {restoreFileConfirm && (
        <ConfirmModal
          title="تأكيد الاستعادة من ملف"
          message={t('confirm.backup.restore_file', { path: restoreFileConfirm })}
          confirmLabel="استعادة"
          variant="warning"
          onConfirm={() => executeRestoreFromFile(restoreFileConfirm)}
          onCancel={() => setRestoreFileConfirm(null)}
        />
      )}
      {deleteBackupId !== null && (
        <ConfirmModal
          title="تأكيد الحذف"
          message={t('confirm.backup.delete')}
          confirmLabel="حذف"
          variant="danger"
          onConfirm={() => executeRemove(deleteBackupId)}
          onCancel={() => setDeleteBackupId(null)}
        />
      )}
    </div>
  );
}
