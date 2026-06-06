import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client';
import { dateText } from '../config/modules';

export default function Backup() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function load() {
    setLoading(true);
    try {
      const res = await api.get('/backups');
      setList(res.data.data ?? []);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function createBackup() {
    setBusy(true); setMsg('');
    try {
      await api.post('/backups');
      setMsg('تم إنشاء نسخة احتياطية ✓');
      load();
    } catch (err) { setMsg(errorMessage(err)); } finally { setBusy(false); }
  }

  async function exportDb() {
    const path = await window.manar?.chooseSavePath('manar-export.db');
    if (!path) return;
    try { await api.post('/backups/export', { path }); setMsg('تم تصدير قاعدة البيانات ✓'); }
    catch (err) { setMsg(errorMessage(err)); }
  }

  async function restore(id: number) {
    if (!confirm('سيُعاد تشغيل النظام بعد الاستعادة. متابعة؟')) return;
    try {
      await api.post(`/backups/${id}/restore`);
      setMsg('تمت الاستعادة — سيُعاد تشغيل النظام');
      await window.manar?.restartApp();
    } catch (err) { setMsg(errorMessage(err)); }
  }

  async function remove(id: number) {
    if (!confirm('حذف هذه النسخة؟')) return;
    try { await api.delete(`/backups/${id}`); load(); } catch (err) { alert(errorMessage(err)); }
  }

  return (
    <div>
      <div className="page-head">
        <div><h2>النسخ الاحتياطي والاستعادة</h2><p>نسخ تلقائي يومي + نسخ يدوي واستعادة كاملة</p></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn secondary" onClick={exportDb}>⤓ تصدير قاعدة البيانات</button>
          <button className="btn" onClick={createBackup} disabled={busy}>💾 نسخة احتياطية الآن</button>
        </div>
      </div>
      {msg && <div className="alert warn">{msg}</div>}

      <div className="card panel" style={{ padding: 0 }}>
        <div className="table-responsive">
          <table>
            <thead><tr><th>الملف</th><th>الحجم</th><th>النوع</th><th>التاريخ</th><th></th></tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5}><div className="center-msg"><div className="spinner" />جارٍ التحميل…</div></td></tr>
              ) : list.length === 0 ? (
                <tr><td colSpan={5}><div className="center-msg">لا توجد نسخ بعد</div></td></tr>
              ) : list.map((b) => (
                <tr key={b.id}>
                  <td style={{ fontFamily: 'monospace' }}><strong>{b.fileName}</strong></td>
                  <td>{(b.sizeBytes / 1048576).toFixed(2)} م.ب</td>
                  <td><span className={`pill ${b.type === 'MANUAL' ? 'blue' : 'gray'}`}>{b.type === 'MANUAL' ? 'يدوي' : b.type === 'AUTO' ? 'تلقائي' : 'مجدول'}</span></td>
                  <td>{dateText(b.createdAt)}</td>
                  <td style={{ textAlign: 'left', whiteSpace: 'nowrap' }}>
                    <button className="btn secondary sm" onClick={() => restore(b.id)}>↩️ استعادة</button>{' '}
                    <button className="btn danger sm" onClick={() => remove(b.id)}>حذف</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
