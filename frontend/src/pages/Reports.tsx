import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api/client';

const TYPES = [
  { key: 'contracts', label: 'تقرير العقود', icon: '📄' },
  { key: 'customers', label: 'تقرير العملاء', icon: '👥' },
  { key: 'invoices', label: 'تقرير الفواتير', icon: '🧾' },
  { key: 'expenses', label: 'تقرير المصروفات', icon: '💸' },
  { key: 'equipment', label: 'تقرير المعدّات', icon: '🚜' },
  { key: 'employees', label: 'تقرير الموظفين', icon: '👷' },
  { key: 'payroll', label: 'تقرير الرواتب', icon: '💵' },
  { key: 'profit-loss', label: 'الأرباح والخسائر', icon: '📈' },
];

export default function Reports() {
  const [busy, setBusy] = useState('');
  const navigate = useNavigate();

  // Excel من الخادم (يدعم العربية بالكامل)
  async function downloadExcel(type: string) {
    setBusy(`${type}-excel`);
    try {
      const res = await api.get(`/reports/${type}/export`, { params: { format: 'excel' }, responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report-${type}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(errorMessage(err));
    } finally {
      setBusy('');
    }
  }

  // PDF عبر صفحة طباعة (Chromium) — عربية سليمة 100%
  function openPdf(type: string) {
    navigate(`/print/${type}`);
  }

  return (
    <div>
      <div className="page-head"><div><h2>التقارير الشاملة</h2><p>تصدير التقارير المالية والإدارية (Excel / PDF بعربية سليمة)</p></div></div>
      <div className="stats" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))' }}>
        {TYPES.map((t) => (
          <div className="card" style={{ padding: 22 }} key={t.key}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
              <div className="si" style={{ width: 50, height: 50, borderRadius: 12, background: 'var(--surface-2)', display: 'grid', placeItems: 'center', fontSize: 24 }}>{t.icon}</div>
              <strong style={{ fontSize: 15 }}>{t.label}</strong>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn secondary" style={{ flex: 1, justifyContent: 'center', padding: 9 }} disabled={busy === `${t.key}-excel`} onClick={() => downloadExcel(t.key)}>⤓ Excel</button>
              <button className="btn secondary" style={{ flex: 1, justifyContent: 'center', padding: 9 }} onClick={() => openPdf(t.key)}>🖨️ PDF</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
