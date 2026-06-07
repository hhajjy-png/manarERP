import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client';
import { dateText } from '../config/modules';

const isElectron = typeof window !== 'undefined' && !!window.manar;

function fmt(bytes: number): string {
  if (bytes === 0) return '0 ب';
  if (bytes < 1024) return `${bytes} ب`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} ك.ب`;
  return `${(bytes / 1048576).toFixed(2)} م.ب`;
}

export default function Backup() {
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
    } catch { /* الجدول قد يكون فارغًا */ } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  // ─── نسخة احتياطية عبر الخادم (HTTP API) ─────────────────────────────────
  async function createBackupApi() {
    setBusy(true); setMsg(null);
    try {
      await api.post('/backups');
      showMsg('تم إنشاء النسخة الاحتياطية بنجاح ✓');
      load();
    } catch (err) { showMsg(errorMessage(err), 'err'); } finally { setBusy(false); }
  }

  // ─── نسخة احتياطية مباشرة عبر Electron IPC ────────────────────────────────
  async function createBackupElectron() {
    if (!isElectron) { showMsg('هذه الميزة متاحة فقط في تطبيق سطح المكتب', 'warn'); return; }
    setBusy(true); setMsg(null);
    const result = await window.manar!.backupCreate();
    setBusy(false);
    if (result.success) {
      showMsg(`تم حفظ النسخة الاحتياطية بنجاح ✓  (${fmt(result.sizeBytes ?? 0)})`);
    } else if (!result.canceled) {
      showMsg(result.error ?? 'فشل إنشاء النسخة الاحتياطية', 'err');
    }
  }

  // ─── تصدير قاعدة البيانات ─────────────────────────────────────────────────
  async function exportDb() {
    if (!isElectron) { showMsg('هذه الميزة متاحة فقط في تطبيق سطح المكتب', 'warn'); return; }
    const targetPath = await window.manar!.chooseSavePath('manar-export.db');
    if (!targetPath) return;
    try { await api.post('/backups/export', { path: targetPath }); showMsg('تم تصدير قاعدة البيانات ✓'); }
    catch (err) { showMsg(errorMessage(err), 'err'); }
  }

  // ─── استعادة من قائمة النسخ (backend) ────────────────────────────────────
  async function restoreFromList(id: number, fileName: string) {
    if (!confirm(
      `⚠️ تحذير — استعادة النسخة الاحتياطية\n\n` +
      `سيتم استبدال قاعدة البيانات الحالية بالنسخة: ${fileName}\n` +
      `سيتم إنشاء نسخة تلقائية قبل الاستعادة.\n\n` +
      `هل تريد المتابعة؟`
    )) return;
    setBusy(true); setMsg(null);
    try {
      await api.post(`/backups/${id}/restore`);
      showMsg('تمت الاستعادة — يلزم إعادة تشغيل التطبيق', 'warn');
      if (isElectron) {
        await new Promise((r) => setTimeout(r, 2000));
        await window.manar!.restartApp();
      }
    } catch (err) { showMsg(errorMessage(err), 'err'); } finally { setBusy(false); }
  }

  // ─── استعادة من ملف خارجي عبر Electron IPC ───────────────────────────────
  async function restoreFromFile() {
    if (!isElectron) { showMsg('هذه الميزة متاحة فقط في تطبيق سطح المكتب', 'warn'); return; }

    const sourcePath = await window.manar!.chooseBackupFile();
    if (!sourcePath) return;

    const confirmed = confirm(
      `⚠️ تحذير — استعادة قاعدة البيانات\n\n` +
      `سيتم استبدال قاعدة البيانات الحالية بالملف:\n${sourcePath}\n\n` +
      `سيتم إنشاء نسخة احتياطية تلقائية قبل الاستعادة.\n` +
      `يجب إعادة تشغيل التطبيق بعد الاستعادة.\n\n` +
      `هل تريد المتابعة؟`
    );
    if (!confirmed) return;

    setBusy(true);
    setMsg(null);
    const result = await window.manar!.backupRestore(sourcePath);
    setBusy(false);

    if (result.success) {
      showMsg(
        `تمت الاستعادة بنجاح ✓  (${fmt(result.sizeBytes ?? 0)}) — سيُعاد تشغيل التطبيق خلال ثوانٍ`,
        'warn'
      );
      await new Promise((r) => setTimeout(r, 3000));
      await window.manar!.restartApp();
    } else {
      showMsg(result.error ?? 'فشل الاستعادة', 'err');
    }
  }

  // ─── عرض مسار قاعدة البيانات ─────────────────────────────────────────────
  async function toggleDbPath() {
    if (!isElectron) { showMsg('هذه الميزة متاحة فقط في تطبيق سطح المكتب', 'warn'); return; }
    if (showDbPath) { setShowDbPath(false); return; }
    const info = await window.manar!.getDbPath();
    setDbInfo(info);
    setShowDbPath(true);
  }

  // ─── حذف نسخة ─────────────────────────────────────────────────────────────
  async function remove(id: number) {
    if (!confirm('حذف هذه النسخة الاحتياطية؟')) return;
    try { await api.delete(`/backups/${id}`); load(); } catch (err) { showMsg(errorMessage(err), 'err'); }
  }

  const alertClass = msg?.type === 'ok' ? 'alert ok' : msg?.type === 'warn' ? 'alert warn' : 'alert error';

  return (
    <div>
      <div className="page-head">
        <div><h2>النسخ الاحتياطي والاستعادة</h2><p>نسخ تلقائي يومي + نسخ يدوي واستعادة كاملة</p></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn secondary" onClick={toggleDbPath}>
            {showDbPath ? '🔒 إخفاء المسار' : '📂 مسار قاعدة البيانات'}
          </button>
          <button className="btn secondary" onClick={exportDb} disabled={busy}>⤓ تصدير</button>
          <button className="btn secondary" onClick={restoreFromFile} disabled={busy}>↩️ استعادة من ملف</button>
          <button className="btn secondary" onClick={createBackupElectron} disabled={busy}>💾 نسخ مباشر</button>
          <button className="btn" onClick={createBackupApi} disabled={busy}>💾 نسخة احتياطية الآن</button>
        </div>
      </div>

      {msg && <div className={alertClass} style={{ marginBottom: 16 }}>{msg.text}</div>}
      {busy && <div className="alert warn" style={{ marginBottom: 16 }}>⏳ جارٍ التنفيذ…</div>}

      {/* مسار قاعدة البيانات */}
      {showDbPath && dbInfo && (
        <div className="card panel" style={{ marginBottom: 16, background: 'var(--surface-2)' }}>
          <h3 style={{ marginBottom: 12 }}>📂 معلومات قاعدة البيانات</h3>
          <table style={{ width: '100%' }}>
            <tbody>
              <tr>
                <td style={{ padding: '5px 0', color: 'var(--text-muted)', width: 160 }}>المجلد</td>
                <td style={{ fontFamily: 'monospace', fontSize: 13, wordBreak: 'break-all' }}>{dbInfo.dir}</td>
              </tr>
              <tr>
                <td style={{ padding: '5px 0', color: 'var(--text-muted)' }}>مجلد النسخ</td>
                <td style={{ fontFamily: 'monospace', fontSize: 13, wordBreak: 'break-all' }}>{dbInfo.backupDir}</td>
              </tr>
              <tr>
                <td style={{ padding: '5px 0', color: 'var(--text-muted)' }}>الحجم</td>
                <td><strong>{fmt(dbInfo.sizeBytes)}</strong></td>
              </tr>
              <tr>
                <td style={{ padding: '5px 0', color: 'var(--text-muted)' }}>الحالة</td>
                <td><span className={`pill ${dbInfo.exists ? 'green' : 'red'}`}>{dbInfo.exists ? 'موجودة ✓' : 'غير موجودة ✗'}</span></td>
              </tr>
              <tr>
                <td style={{ padding: '5px 0', color: 'var(--text-muted)' }}>البيئة</td>
                <td><span className={`pill ${dbInfo.isDev ? 'amber' : 'blue'}`}>{dbInfo.isDev ? 'تطوير' : 'إنتاج'}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* قائمة النسخ الاحتياطية */}
      <div className="card panel" style={{ padding: 0 }}>
        <div className="table-responsive">
          <table>
            <thead>
              <tr><th>الملف</th><th>الحجم</th><th>النوع</th><th>التاريخ</th><th></th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5}><div className="center-msg"><div className="spinner" />جارٍ التحميل…</div></td></tr>
              ) : list.length === 0 ? (
                <tr><td colSpan={5}><div className="center-msg">لا توجد نسخ مسجّلة في النظام بعد</div></td></tr>
              ) : list.map((b) => (
                <tr key={b.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 13 }}><strong>{b.fileName}</strong></td>
                  <td>{fmt(b.sizeBytes)}</td>
                  <td>
                    <span className={`pill ${b.type === 'MANUAL' ? 'blue' : b.type === 'AUTO' ? 'gray' : 'amber'}`}>
                      {b.type === 'MANUAL' ? 'يدوي' : b.type === 'AUTO' ? 'تلقائي' : 'مجدول'}
                    </span>
                  </td>
                  <td>{dateText(b.createdAt)}</td>
                  <td style={{ textAlign: 'left', whiteSpace: 'nowrap' }}>
                    <button className="btn secondary sm" disabled={busy} onClick={() => restoreFromList(b.id, b.fileName)}>↩️ استعادة</button>{' '}
                    <button className="btn danger sm" onClick={() => remove(b.id)}>حذف</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* توضيح الفرق بين أنواع النسخ */}
      <div className="card panel" style={{ marginTop: 16, background: 'var(--surface-2)', fontSize: 13, color: 'var(--text-muted)' }}>
        <strong>ملاحظة:</strong> &ldquo;نسخ مباشر&rdquo; يحفظ الملف مباشرة إلى مكان تختاره — بدون تسجيل في قائمة النسخ.
        &ldquo;نسخة احتياطية الآن&rdquo; تُسجّل في القائمة وتُحفظ في مجلد النسخ الداخلي.
        عند &ldquo;استعادة من ملف&rdquo; يُنشأ تلقائيًا نسخة أمان في مجلد <strong>pre-restore</strong> قبل أي تغيير.
      </div>
    </div>
  );
}
