import { useCallback, useEffect, useRef, useState } from 'react';
import ConfirmModal from './ConfirmModal';
import ConflictResolutionDialog from './ConflictResolutionDialog';
import CloudDiagnosticsCard from './CloudDiagnosticsCard';
import { dateText } from '../config/modules';
import { useAuth } from '../stores/authStore';
import { useT } from '../lib/i18n';
import { useToast } from '../stores/toastStore';

const isElectron = typeof window !== 'undefined' && !!window.manar;

type StatusInfo = {
  status: string;
  message: string;
  configured: boolean;
  authenticated: boolean;
  account: string | null;
  lastSyncAt: string | null;
  lastUploadAt: string | null;
  lastDownloadAt: string | null;
  lastError: string | null;
  /** Production Hardening Pack v1 — انتهت صلاحية ربط Google ويجب إعادة الربط. */
  needsReauth?: boolean;
  /** سبب انقطاع الربط بالعربية، جاهز للعرض كما هو. */
  grantDeadMessage?: string | null;
  localDb: { exists: boolean; sizeBytes: number };
  device?: { deviceId: string; deviceName: string };
} | null;

/** نتيجة النسخة المحلية المضمونة بعد فشل سحابي — تصل مع كل استجابة مزامنة فاشلة. */
type RescueBackupOutcome = {
  ok: boolean;
  via: 'BACKEND_SERVICE' | 'DIRECT_SNAPSHOT' | null;
  fileName?: string;
  filePath?: string;
  sizeBytes?: number;
  error?: string;
};

type LogEntry = {
  at: string;
  action: string;
  result: string;
  message: string;
  deviceName?: string;
  conflictResolved?: boolean;
  resolutionSelected?: 'LOCAL' | 'REMOTE';
  /** Production Polish Pack v1 — توقيت العملية ومدّتها والإجراء المقترح (تغيب في الإدخالات القديمة). */
  startedAt?: string;
  durationMs?: number;
  suggestedAction?: 'NONE' | 'RECONNECT' | 'RETRY' | 'RESOLVE_CONFLICT' | 'CHECK_BACKUPS' | 'CHECK_NETWORK';
};

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

function fmt(bytes: number, t: (key: string) => string): string {
  if (bytes === 0) return `0 ${t('unit.bytes')}`;
  if (bytes < 1024) return `${bytes} ${t('unit.bytes')}`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} ${t('unit.kilobytes')}`;
  return `${(bytes / 1048576).toFixed(2)} ${t('unit.megabytes')}`;
}

function statusPillClass(status: string): string {
  switch (status) {
    case 'COMPLETED': return 'green';
    case 'FAILED': return 'red';
    case 'CONFLICT': return 'red';
    case 'GRANT_DEAD': return 'red';
    case 'OFFLINE': return 'amber';
    case 'RETRY': return 'amber';
    case 'CHECKING': case 'DOWNLOADING': case 'UPLOADING': return 'blue';
    default: return 'gray';
  }
}

/**
 * لوحة المزامنة السحابية — مُضمَّنة داخل تبويب "مزامنة سحابية" في صفحة النسخ
 * الاحتياطي (Backup.tsx)، وليست صفحة مستقلة. ميزة إدارية وليست جزءًا من سير
 * العمل اليومي، لذا لا تملك مسارًا أو مدخلًا خاصًا بها في الشريط الجانبي.
 */
export default function CloudSyncPanel() {
  const { hasPermission } = useAuth();
  const { t } = useT();
  const toast = useToast();
  const canUpload = hasPermission('backups.create');
  const canManage = hasPermission('backups.update');

  const [info, setInfo] = useState<StatusInfo>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [liveMessage, setLiveMessage] = useState('');
  const [disconnectConfirm, setDisconnectConfirm] = useState(false);
  const [downloadConfirm, setDownloadConfirm] = useState(false);
  const [conflict, setConflict] = useState<SyncConflictInfo | null>(null);
  /**
   * آخر عملية فشلت — أساس زرّ «إعادة المحاولة» (P0-11).
   * فشل المزامنة كان يترك المستخدم أمام رسالة فقط، فيعيد البحث عن الزرّ الصحيح
   * بين خمسة أزرار. الآن الإجراء التالي معروض بجانب سبب الفشل مباشرة.
   */
  const [lastFailed, setLastFailed] = useState<'SYNC' | 'UPLOAD' | 'DOWNLOAD' | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /**
   * عدّاد يتقدّم بعد كل قراءة حالة ⇒ يُعيد بطاقة التشخيص قراءتها **مرة واحدة**.
   * بديل متعمَّد عن أي `setInterval`: التحديث يتبع أحداثًا حقيقية لا مؤقّتًا (§9).
   */
  const [diagRefreshKey, setDiagRefreshKey] = useState(0);
  const logAnchorRef = useRef<HTMLDivElement | null>(null);

  const statusLabel = (status: string): string => {
    const key = `cloudsync.status.${status.toLowerCase()}`;
    const label = t(key);
    return label === key ? status : label;
  };

  const load = useCallback(async () => {
    if (!isElectron || !window.manar?.syncGetStatus) { setLoading(false); return; }
    setLoading(true);
    try {
      const [statusRes, logRes, conflictRes] = await Promise.all([
        window.manar.syncGetStatus(),
        window.manar.syncGetLog ? window.manar.syncGetLog() : Promise.resolve([]),
        window.manar.syncGetConflict ? window.manar.syncGetConflict() : Promise.resolve(null),
      ]);
      setInfo(statusRes);
      setLog(logRes);
      if (conflictRes) setConflict(conflictRes);
    } catch {
      // يُترك info كما هو — رسالة "غير متاح" تظهر من الحالة الفارغة
    } finally {
      setLoading(false);
      setDiagRefreshKey((n) => n + 1);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  function startProgressPolling() {
    if (!window.manar?.syncGetStatus) return;
    pollRef.current = setInterval(async () => {
      try {
        const s = await window.manar!.syncGetStatus!();
        setLiveMessage(s.message);
      } catch { /* تجاهل — سيُعاد المحاولة في الدورة التالية */ }
    }, 1200);
  }

  function stopProgressPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    setLiveMessage('');
  }

  /**
   * بعد استبدال قاعدة البيانات، الخادم الخلفي يُعاد تشغيله تلقائيًا من العملية
   * الرئيسية (لا حاجة لإعادة تشغيل التطبيق يدويًا). الواجهة فقط تحتاج لإعادة
   * تحميل نفسها لتعكس بيانات القاعدة الجديدة — إعادة تحميل داخل النافذة نفسها،
   * لا إعادة تشغيل Electron كاملة.
   */
  async function maybeReconnect(backendRestarted: boolean | undefined) {
    if (!backendRestarted || !isElectron) return;
    toast.warn(t('msg.cloudsync.reconnecting'));
    await new Promise((r) => setTimeout(r, 1500));
    window.location.reload();
  }

  async function connect() {
    if (!isElectron || !window.manar?.syncAuthenticate) return;
    setBusy(true);
    toast.ok(t('msg.cloudsync.browser_opened'));
    try {
      const result = await window.manar.syncAuthenticate();
      if (result.ok) {
        setLastFailed(null);
        toast.ok(t('msg.cloudsync.connected', { email: result.email ?? '' }));
      } else {
        toast.error(result.error ?? t('msg.cloudsync.connect_fail'));
      }
    } finally {
      setBusy(false);
      load();
    }
  }

  function disconnect() { setDisconnectConfirm(true); }

  async function executeDisconnect() {
    setDisconnectConfirm(false);
    if (!isElectron || !window.manar?.syncDisconnect) return;
    setBusy(true);
    try {
      await window.manar.syncDisconnect();
      toast.ok(t('msg.cloudsync.disconnected'));
    } finally {
      setBusy(false);
      load();
    }
  }

  /**
   * تبليغ موحّد عن فشل سحابي — يعرض دائمًا **حالتين منفصلتين**: نتيجة العملية
   * السحابية ونتيجة النسخة الاحتياطية المحلية المضمونة بعدها
   * (Cloud-Failure Local Backup Guarantee v1). الفصل مقصود: فشل السحابة وحده لم
   * يعد يعني ضياع النسخة، والمستخدم يجب أن يرى ذلك صراحة لا أن يستنتجه.
   */
  function reportCloudFailure(
    result: { error?: string; rescueBackup?: RescueBackupOutcome; needsReauth?: boolean; busy?: boolean; conflict?: SyncConflictInfo },
    action: 'SYNC' | 'UPLOAD' | 'DOWNLOAD',
  ) {
    // رفض بسبب عملية جارية ليس فشلًا ولا يستحق زرّ إعادة محاولة فوريًا —
    // الرسالة وحدها تكفي، والمستخدم ينتظر انتهاء العملية القائمة.
    if (result.busy) {
      toast.warn(result.error ?? t('msg.cloudsync.busy_rejected'));
      return;
    }

    // P0-7 — الرفع رُفض لأن النسخة السحابية تغيّرت: تعارض يقرّره المستخدم، لا فشل.
    if (result.conflict) {
      setConflict(result.conflict);
      setLastFailed(null);
      toast.warn(result.error ?? t('msg.cloudsync.remote_changed'));
      return;
    }

    setLastFailed(action);

    // P0-1 — منحة ميتة: إعادة المحاولة بلا فائدة. اللافتة الدائمة أعلى اللوحة
    // تحمل الشرح وزرّ إعادة الربط؛ هنا نكتفي برسالة واحدة غير مكرِّرة لها.
    const cloudMsg = result.error ?? t('msg.cloudsync.sync_fail');
    if (result.needsReauth) {
      toast.error(cloudMsg);
      return;
    }

    if (result.rescueBackup?.ok) {
      toast.warn(t('msg.cloudsync.failed_rescue_ok', { error: cloudMsg }));
    } else if (result.rescueBackup) {
      toast.error(t('msg.cloudsync.failed_rescue_fail', { error: cloudMsg }));
    } else {
      toast.error(cloudMsg);
    }
  }

  async function syncNow() {
    if (!isElectron || !window.manar?.syncNow) return;
    setBusy(true);
    startProgressPolling();
    try {
      const result = await window.manar.syncNow();
      if (result.action === 'CONFLICT' && result.conflict) {
        setConflict(result.conflict);
        toast.warn(t('msg.conflict.detected'));
      } else if (result.ok) {
        setLastFailed(null);
        if (result.action === 'NONE') toast.ok(t('msg.cloudsync.up_to_date'));
        else toast.ok(t(result.action === 'UPLOAD' ? 'msg.cloudsync.upload_done' : 'msg.cloudsync.download_done'));
        await maybeReconnect(result.backendRestarted);
      } else {
        reportCloudFailure(result, 'SYNC');
      }
    } finally {
      stopProgressPolling();
      setBusy(false);
      load();
    }
  }

  async function resolveKeepLocal() {
    if (!isElectron || !window.manar?.syncResolveConflict) return;
    setBusy(true);
    startProgressPolling();
    try {
      const result = await window.manar.syncResolveConflict('LOCAL');
      setConflict(null);
      if (result.ok) {
        setLastFailed(null);
        toast.ok(t('msg.cloudsync.upload_done'));
      } else {
        // قد يُعيد تعارضًا جديدًا حين يكون جهاز آخر قد رفع أثناء فتح الحوار (P0-7).
        reportCloudFailure(result, 'UPLOAD');
      }
    } finally {
      stopProgressPolling();
      setBusy(false);
      load();
    }
  }

  async function resolveKeepCloud() {
    if (!isElectron || !window.manar?.syncResolveConflict) return;
    setBusy(true);
    startProgressPolling();
    try {
      const result = await window.manar.syncResolveConflict('REMOTE');
      setConflict(null);
      if (result.ok) {
        setLastFailed(null);
        toast.ok(t('msg.cloudsync.download_done'));
        await maybeReconnect(result.backendRestarted);
      } else {
        reportCloudFailure(result, 'DOWNLOAD');
      }
    } finally {
      stopProgressPolling();
      setBusy(false);
      load();
    }
  }

  function cancelConflict() {
    // "إلغاء": يُغلق الحوار فقط — لا يُستدعى أي IPC، ولا تتغيّر أي من النسختين.
    setConflict(null);
  }

  async function upload() {
    if (!isElectron || !window.manar?.syncUpload) return;
    setBusy(true);
    startProgressPolling();
    try {
      const result = await window.manar.syncUpload();
      // Data Safety Pack v2 (F-01) — الرفع صار قائمًا على قرار المحرّك، فله الآن
      // نتيجتان مشروعتان لم تكونا ممكنتين قبل الحزمة، وكلتاهما ليست فشلًا:
      //   • NONE     — لا تغييرات محلية تستحق الرفع.
      //   • DOWNLOAD — النسخة السحابية أحدث، فرُفض الرفع حمايةً لها.
      // ما عدا ذلك يمرّ بمسار التبليغ القائم بلا تغيير (بما فيه حوار التعارض).
      if (result.ok) {
        setLastFailed(null);
        toast.ok(result.action === 'NONE' ? t('msg.cloudsync.up_to_date') : t('msg.cloudsync.upload_done'));
      } else if (result.action === 'DOWNLOAD') {
        setLastFailed(null);
        toast.warn(result.error ?? t('msg.cloudsync.sync_fail'));
      } else {
        reportCloudFailure(result, 'UPLOAD');
      }
    } finally {
      stopProgressPolling();
      setBusy(false);
      load();
    }
  }

  function download() { setDownloadConfirm(true); }

  /**
   * P0-11 — يعيد تنفيذ آخر عملية فشلت بالضبط، بلا أن يبحث المستخدم عن الزرّ الصحيح.
   * التنزيل يمرّ بحوار التأكيد نفسه — إعادة المحاولة لا تتجاوز تأكيدًا مقصودًا.
   */
  function retryLastFailed() {
    if (lastFailed === 'SYNC') { syncNow(); return; }
    if (lastFailed === 'UPLOAD') { upload(); return; }
    if (lastFailed === 'DOWNLOAD') setDownloadConfirm(true);
  }

  async function executeDownload() {
    setDownloadConfirm(false);
    if (!isElectron || !window.manar?.syncDownload) return;
    setBusy(true);
    startProgressPolling();
    try {
      const result = await window.manar.syncDownload();
      if (result.ok) {
        setLastFailed(null);
        toast.ok(t('msg.cloudsync.download_done'));
        await maybeReconnect(result.backendRestarted);
      } else {
        reportCloudFailure(result, 'DOWNLOAD');
      }
    } finally {
      stopProgressPolling();
      setBusy(false);
      load();
    }
  }

  if (!isElectron) {
    return <div className="alert warn">{t('msg.backup.desktop_only')}</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <button type="button" className="btn secondary sm" onClick={load} disabled={busy || loading}>
          🔄 {t('btn.cloudsync.refresh')}
        </button>
        {info?.configured && info.authenticated && canManage && (
          <button type="button" className="btn secondary sm" onClick={disconnect} disabled={busy}>
            🔌 {t('btn.cloudsync.disconnect')}
          </button>
        )}
        {info?.configured && !info.authenticated && canManage && (
          <button type="button" className="btn sm" onClick={connect} disabled={busy}>
            🔐 {t('btn.cloudsync.connect')}
          </button>
        )}
        {info?.authenticated && canUpload && (
          <button type="button" className="btn secondary sm" onClick={upload} disabled={busy}>
            ⤴️ {t('btn.cloudsync.upload')}
          </button>
        )}
        {info?.authenticated && canManage && (
          <button type="button" className="btn secondary sm" onClick={download} disabled={busy}>
            ⤵️ {t('btn.cloudsync.download')}
          </button>
        )}
        {info?.authenticated && canManage && (
          <button type="button" className="btn sm" onClick={syncNow} disabled={busy}>
            ☁️ {t('btn.cloudsync.sync_now')}
          </button>
        )}
      </div>

      {busy && (
        <div className="alert warn" style={{ marginBottom: 16 }}>
          ⏳ {liveMessage || t('msg.cloudsync.busy')}
        </div>
      )}

      {/*
        P0-1 / P0-11 — لافتة إعادة الربط.
        تظهر حين تموت المنحة (انتهاء صلاحية، إلغاء من حساب Google، تغيير كلمة المرور،
        أو عدم تطابق عميل OAuth). تحمل ثلاثة أشياء يحتاجها المستخدم فورًا: **ماذا حدث**
        بالعربية، **أن بياناته المحلية سليمة**، و**الإجراء الوحيد المُجدي** كزرّ واحد.
        دائمة عبر إعادة تشغيل التطبيق حتى يُعاد الربط فعليًا — لا تختفي بمجرد إغلاق toast.
      */}
      {!busy && info?.needsReauth && (
        <div className="alert error" style={{ marginBottom: 16, flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
          <div>🔑 {t('title.cloudsync.reauth')}</div>
          <div style={{ fontWeight: 500, fontSize: 13 }}>
            {info.grantDeadMessage ?? t('msg.cloudsync.reauth_default')}
          </div>
          <div style={{ fontWeight: 500, fontSize: 13 }}>{t('msg.cloudsync.local_safe')}</div>
          {canManage && (
            <div>
              <button type="button" className="btn sm" onClick={connect} disabled={busy} style={{ marginTop: 6 }}>
                🔐 {t('btn.cloudsync.reconnect')}
              </button>
            </div>
          )}
        </div>
      )}

      {/*
        زرّ إعادة المحاولة — يظهر فقط بعد فشل قابل لإعادة المحاولة فعلًا. لا يظهر مع
        موت المنحة (إعادة المحاولة هناك بلا فائدة، والإجراء الصحيح هو إعادة الربط أعلاه).
      */}
      {!busy && lastFailed && !info?.needsReauth && (
        <div className="alert warn" style={{ marginBottom: 16, alignItems: 'center', gap: 12 }}>
          <span style={{ flex: 1 }}>⚠️ {info?.lastError ?? t('msg.cloudsync.sync_fail')}</span>
          <button type="button" className="btn secondary sm" onClick={retryLastFailed} disabled={busy}>
            ↻ {t('btn.cloudsync.retry')}
          </button>
        </div>
      )}

      {/*
        مركز التشخيص — Production UX & Diagnostics Pack v1.
        يُعرض فوق بطاقة الحالة لأن الدعم الفني يقرأ من أعلى الصفحة إلى أسفلها.
        طبقة عرض بحتة: لا تتخذ قرارًا ولا تنادي Google؛ الإجراءات الحقيقية تُنفَّذ
        عبر نفس الدوال القائمة في هذه اللوحة (إعادة الربط / إعادة المحاولة).
      */}
      <CloudDiagnosticsCard
        refreshKey={diagRefreshKey}
        log={log}
        canManage={canManage}
        busy={busy}
        canRetry={!!lastFailed}
        needsReauth={!!info?.needsReauth}
        onReconnect={connect}
        onRetry={retryLastFailed}
        onOpenLog={() => logAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        onRepaired={() => { setLastFailed(null); load(); }}
      />

      {loading ? (
        <div className="center-msg"><div className="spinner" />{t('msg.loading')}</div>
      ) : !info?.configured ? (
        <div className="alert warn">{t('msg.cloudsync.not_configured')}</div>
      ) : (
        <>
          <div className="card panel" style={{ marginBottom: 16, background: 'var(--surface-2)' }}>
            <h3 style={{ marginBottom: 12 }}>☁️ {t('section.cloudsync.status')}</h3>
            <table style={{ width: '100%' }}>
              <tbody>
                <tr>
                  <td style={{ padding: '5px 0', color: 'var(--text-muted)', width: 180 }}>{t('col.status')}</td>
                  <td><span className={`pill ${statusPillClass(info.status)}`}>{statusLabel(info.status)}</span></td>
                </tr>
                <tr>
                  <td style={{ padding: '5px 0', color: 'var(--text-muted)' }}>{t('lbl.cloudsync.account')}</td>
                  <td>
                    {info.authenticated
                      ? <span className="pill green">{info.account ?? '—'} ✓</span>
                      : <span className="pill gray">{t('lbl.cloudsync.not_connected')}</span>}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '5px 0', color: 'var(--text-muted)' }}>{t('lbl.cloudsync.last_sync')}</td>
                  <td>{info.lastSyncAt ? dateText(info.lastSyncAt) : '—'}</td>
                </tr>
                <tr>
                  <td style={{ padding: '5px 0', color: 'var(--text-muted)' }}>{t('lbl.cloudsync.last_upload')}</td>
                  <td>{info.lastUploadAt ? dateText(info.lastUploadAt) : '—'}</td>
                </tr>
                <tr>
                  <td style={{ padding: '5px 0', color: 'var(--text-muted)' }}>{t('lbl.cloudsync.last_download')}</td>
                  <td>{info.lastDownloadAt ? dateText(info.lastDownloadAt) : '—'}</td>
                </tr>
                {info.lastError && (
                  <tr>
                    <td style={{ padding: '5px 0', color: 'var(--text-muted)' }}>{t('lbl.backup.last_error')}</td>
                    <td style={{ color: 'var(--red)', fontSize: 13 }}>{info.lastError}</td>
                  </tr>
                )}
                <tr>
                  <td style={{ padding: '5px 0', color: 'var(--text-muted)' }}>{t('lbl.cloudsync.local_db')}</td>
                  <td>
                    <span className={`pill ${info.localDb.exists ? 'green' : 'red'}`}>
                      {info.localDb.exists ? fmt(info.localDb.sizeBytes, t) : t('lbl.backup.db_missing')}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="card panel" style={{ padding: 0 }} ref={logAnchorRef}>
            <div className="table-responsive">
              <table>
                <thead>
                  <tr>
                    <th>{t('col.date')}</th>
                    <th>{t('col.cloudsync.action')}</th>
                    <th>{t('col.cloudsync.result')}</th>
                    <th>{t('lbl.conflict.device')}</th>
                    <th>{t('col.cloudsync.message')}</th>
                  </tr>
                </thead>
                <tbody>
                  {log.length === 0 ? (
                    <tr><td colSpan={5}><div className="center-msg">{t('msg.cloudsync.no_log')}</div></td></tr>
                  ) : log.map((entry, idx) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <tr key={`${entry.at}-${idx}`}>
                      <td>{dateText(entry.at)}</td>
                      <td>
                        {t(`cloudsync.action.${entry.action.toLowerCase()}`)}
                        {entry.conflictResolved && (
                          <span className="pill amber" style={{ marginInlineStart: 6 }}>
                            {t(entry.resolutionSelected === 'LOCAL' ? 'lbl.conflict.resolved_local' : 'lbl.conflict.resolved_cloud')}
                          </span>
                        )}
                      </td>
                      <td>
                        <span className={`pill ${entry.result === 'SUCCESS' ? 'green' : entry.result === 'FAILED' ? 'red' : entry.result === 'RETRY' ? 'amber' : 'gray'}`}>
                          {t(`cloudsync.result.${entry.result.toLowerCase()}`)}
                        </span>
                      </td>
                      <td style={{ fontSize: 13 }}>{entry.deviceName ?? '—'}</td>
                      <td style={{ fontSize: 13 }}>{entry.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {disconnectConfirm && (
        <ConfirmModal
          title={t('confirm.cloudsync.disconnect_title')}
          message={t('confirm.cloudsync.disconnect')}
          confirmLabel={t('btn.cloudsync.disconnect')}
          variant="warning"
          onConfirm={executeDisconnect}
          onCancel={() => setDisconnectConfirm(false)}
        />
      )}
      {downloadConfirm && (
        <ConfirmModal
          title={t('confirm.cloudsync.download_title')}
          message={t('confirm.cloudsync.download')}
          confirmLabel={t('btn.cloudsync.download')}
          variant="warning"
          onConfirm={executeDownload}
          onCancel={() => setDownloadConfirm(false)}
        />
      )}
      {conflict && (
        <ConflictResolutionDialog
          conflict={conflict}
          busy={busy}
          canResolve={canManage}
          onKeepLocal={resolveKeepLocal}
          onKeepCloud={resolveKeepCloud}
          onCancel={cancelConflict}
        />
      )}
    </div>
  );
}
