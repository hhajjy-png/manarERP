import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client';
import { dateText } from '../config/modules';
import { useAuth } from '../stores/authStore';
import { useT } from '../lib/i18n';

const isElectron = typeof window !== 'undefined' && !!window.manar;

function fmt(bytes: number): string {
  if (bytes === 0) return '0 ب';
  if (bytes < 1024) return `${bytes} ب`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} ك.ب`;
  return `${(bytes / 1048576).toFixed(2)} م.ب`;
}

export default function Backup() {
  const { hasPermission } = useAuth();
  const { t } = useT();
  const canCreate = hasPermission('backups.create');
  const canRestore = hasPermission('backups.update');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'ok' | 'err' | 'warn' } | null>(null);
  const [dbInfo, setDbInfo] = useState<{ dir: string; backupDir: string; exists: boolean; sizeBytes: number; isDev: boolean } | null>(null);
  const [showDbPath, setShowDbPath] = useState(false);

  function showMsg(text: string, type: 'ok' | 'err' | 'warn' = 'ok') {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 8000);
  }

  async function load() {
    setLoading(true);
    try {
      const res = await api.get('/backups');
      setList(res.data.data ?? []);
    } catch { /* table may be empty */ } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function createBackupApi() {
    setBusy(true); setMsg(null);
    try {
      await api.post('/backups');
      showMsg(t('msg.backup.created'));
      load();
    } catch (err) { showMsg(errorMessage(err), 'err'); } finally { setBusy(false); }
  }

  async function createBackupElectron() {
    if (!isElectron) { showMsg(t('msg.backup.desktop_only'), 'warn'); return; }
    setBusy(true); setMsg(null);
    const result = await window.manar!.backupCreate();
    setBusy(false);
    if (result.success) {
      showMsg(t('msg.backup.direct_done', { size: fmt(result.sizeBytes ?? 0) }));
    } else if (!result.canceled) {
      showMsg(result.error ?? t('msg.backup.create_fail'), 'err');
    }
  }

  async function exportDb() {
    if (!isElectron) { showMsg(t('msg.backup.desktop_only'), 'warn'); return; }
    const targetPath = await window.manar!.chooseSavePath('manar-export.db');
    if (!targetPath) return;
    try { await api.post('/backups/export', { path: targetPath }); showMsg(t('msg.backup.export_done')); }
    catch (err) { showMsg(errorMessage(err), 'err'); }
  }

  async function restoreFromList(id: number, fileName: string) {
    if (!confirm(t('confirm.backup.restore_list', { fileName }))) return;
    setBusy(true); setMsg(null);
    try {
      await api.post(`/backups/${id}/restore`);
      showMsg(t('msg.backup.restored_restart', { size: '' }).replace(' ()', ''), 'warn');
      if (isElectron) {
        await new Promise((r) => setTimeout(r, 2000));
        await window.manar!.restartApp();
      }
    } catch (err) { showMsg(errorMessage(err), 'err'); } finally { setBusy(false); }
  }

  async function restoreFromFile() {
    if (!isElectron) { showMsg(t('msg.backup.desktop_only'), 'warn'); return; }

    const sourcePath = await window.manar!.chooseBackupFile();
    if (!sourcePath) return;

    if (!confirm(t('confirm.backup.restore_file', { path: sourcePath }))) return;

    setBusy(true);
    setMsg(null);
    const result = await window.manar!.backupRestore(sourcePath);
    setBusy(false);

    if (result.success) {
      showMsg(t('msg.backup.restored_restart', { size: fmt(result.sizeBytes ?? 0) }), 'warn');
      await new Promise((r) => setTimeout(r, 3000));
      await window.manar!.restartApp();
    } else {
      showMsg(result.error ?? t('msg.backup.restore_fail'), 'err');
    }
  }

  async function toggleDbPath() {
    if (!isElectron) { showMsg(t('msg.backup.desktop_only'), 'warn'); return; }
    if (showDbPath) { setShowDbPath(false); return; }
    const info = await window.manar!.getDbPath();
    setDbInfo(info);
    setShowDbPath(true);
  }

  async function remove(id: number) {
    if (!confirm(t('confirm.backup.delete'))) return;
    try { await api.delete(`/backups/${id}`); load(); } catch (err) { showMsg(errorMessage(err), 'err'); }
  }

  const alertClass = msg?.type === 'ok' ? 'alert ok' : msg?.type === 'warn' ? 'alert warn' : 'alert error';

  return (
    <div>
      <div className="page-head">
        <div><h2>{t('page.backup.title')}</h2><p>{t('page.backup.subtitle')}</p></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {isElectron && (
            <button className="btn secondary" onClick={toggleDbPath}>
              {showDbPath ? `🔒 ${t('btn.backup.toggle_path_hide')}` : `📂 ${t('btn.backup.toggle_path_show')}`}
            </button>
          )}
          {canCreate && isElectron && (
            <button className="btn secondary" onClick={exportDb} disabled={busy}>⤓ {t('btn.backup.export')}</button>
          )}
          {canRestore && isElectron && (
            <button className="btn secondary" onClick={restoreFromFile} disabled={busy}>↩️ {t('btn.backup.restore_file')}</button>
          )}
          {canCreate && isElectron && (
            <button className="btn secondary" onClick={createBackupElectron} disabled={busy}>💾 {t('btn.backup.direct')}</button>
          )}
          {canCreate && (
            <button className="btn" onClick={createBackupApi} disabled={busy}>💾 {t('btn.backup.now')}</button>
          )}
        </div>
      </div>

      {msg && <div className={alertClass} style={{ marginBottom: 16 }}>{msg.text}</div>}
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

      <div className="card panel" style={{ padding: 0 }}>
        <div className="table-responsive">
          <table>
            <thead>
              <tr><th>{t('col.backup.file')}</th><th>{t('col.backup.size')}</th><th>{t('col.backup.type')}</th><th>{t('col.date')}</th><th></th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5}><div className="center-msg"><div className="spinner" />{t('msg.loading')}</div></td></tr>
              ) : list.length === 0 ? (
                <tr><td colSpan={5}><div className="center-msg">{t('msg.backup.no_records')}</div></td></tr>
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
                  <td style={{ textAlign: 'left', whiteSpace: 'nowrap' }}>
                    {canRestore && <><button className="btn secondary sm" disabled={busy} onClick={() => restoreFromList(b.id, b.fileName)}>↩️ {t('btn.backup.restore')}</button>{' '}</>}
                    {canRestore && <button className="btn danger sm" onClick={() => remove(b.id)}>{t('action.delete')}</button>}
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
    </div>
  );
}
