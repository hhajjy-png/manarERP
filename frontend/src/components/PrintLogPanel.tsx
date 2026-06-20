import { usePrintLogStore, FORM_LABELS, PROFILE_LABELS } from '../stores/printLogStore';

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('ar-KW', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const time = d.toLocaleTimeString('ar-KW', { hour: '2-digit', minute: '2-digit' });
  return `${date} — ${time}`;
}

export default function PrintLogPanel() {
  const entries = usePrintLogStore((s) => s.entries);
  const clear = usePrintLogStore((s) => s.clear);

  if (entries.length === 0) return null;

  return (
    <div className="card" style={{ marginTop: 32, padding: 0, overflow: 'hidden' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 18px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface-2)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-muted)' }}>
            history
          </span>
          <span style={{ fontWeight: 700, fontSize: 14 }}>سجل الطباعة لهذه الجلسة</span>
          <span
            style={{
              background: 'var(--primary)',
              color: '#fff',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 700,
              padding: '1px 7px',
            }}
          >
            {entries.length}
          </span>
        </div>
        <button
          type="button"
          className="btn secondary"
          style={{ fontSize: 12, padding: '4px 10px' }}
          onClick={clear}
        >
          مسح السجل
        </button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', direction: 'rtl' }}>
          <thead>
            <tr style={{ background: 'var(--surface-2)' }}>
              <th style={{ padding: '7px 10px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                التاريخ والوقت
              </th>
              <th style={{ padding: '7px 10px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textAlign: 'right' }}>
                الموظف
              </th>
              <th style={{ padding: '7px 10px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textAlign: 'right' }}>
                النموذج
              </th>
              <th style={{ padding: '7px 10px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                نوع الطباعة
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, i) => (
              <tr key={entry.id} style={{ background: i % 2 === 0 ? 'var(--bg)' : 'var(--surface-2)' }}>
                <td style={{ padding: '6px 10px', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {formatDateTime(entry.printedAt)}
                </td>
                <td style={{ padding: '6px 10px', fontSize: 13, fontWeight: 600 }}>
                  {entry.employeeName || '—'}
                </td>
                <td style={{ padding: '6px 10px', fontSize: 12 }}>
                  {FORM_LABELS[entry.formType] ?? entry.formType}
                </td>
                <td style={{ padding: '6px 10px', fontSize: 12, color: 'var(--text-muted)' }}>
                  {PROFILE_LABELS[entry.printProfile] ?? entry.printProfile}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
