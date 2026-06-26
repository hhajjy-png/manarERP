import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';

// ─────────────────────────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────────────────────────

type DocCategory =
  | 'EMPLOYEE_RESIDENCY'
  | 'EMPLOYEE_PASSPORT'
  | 'EMPLOYEE_DRIVING_LICENSE'
  | 'EMPLOYEE_VEHICLE_LICENSE'
  | 'EQUIPMENT_REGISTRATION'
  | 'EQUIPMENT_INSURANCE'
  | 'CONTRACT_EXPIRY';

type UrgencyBand = 'expired' | '7' | '30' | '60' | '90' | 'ok';

interface ExpirationRecord {
  id: string;
  category: DocCategory;
  entityId: number;
  entityName: string;
  entityCode: string;
  expiryDate: string;
  daysRemaining: number;
  urgency: UrgencyBand;
}

interface ExpirationSummary {
  expired: number;
  days7: number;
  days30: number;
  days60: number;
  days90: number;
  total: number;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Lookup tables
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORY_AR: Record<string, string> = {
  EMPLOYEE_RESIDENCY:       'إقامة موظف',
  EMPLOYEE_PASSPORT:        'جواز سفر موظف',
  EMPLOYEE_DRIVING_LICENSE: 'رخصة قيادة موظف',
  EMPLOYEE_VEHICLE_LICENSE: 'رخصة مركبة موظف',
  EQUIPMENT_REGISTRATION:   'تسجيل معدة',
  EQUIPMENT_INSURANCE:      'تأمين معدة',
  CONTRACT_EXPIRY:          'انتهاء عقد',
};

const URGENCY_AR: Record<string, string> = {
  expired: 'منتهي',
  '7':     '7 أيام',
  '30':    '30 يوم',
  '60':    '60 يوم',
  '90':    '90 يوم',
  ok:      'جيد',
};

const URGENCY_COLOR: Record<string, string> = {
  expired: '#EF4444',
  '7':     '#F97316',
  '30':    '#F59E0B',
  '60':    '#EAB308',
  '90':    '#14B8A6',
  ok:      '#22C55E',
};

const CATEGORY_OPTIONS = Object.entries(CATEGORY_AR).map(([value, label]) => ({ value, label }));

const URGENCY_OPTIONS: { value: string; label: string }[] = [
  { value: 'all',     label: 'الكل' },
  { value: 'expired', label: 'منتهية' },
  { value: '7',       label: 'أقل من 7 أيام' },
  { value: '30',      label: 'أقل من 30 يوم' },
  { value: '60',      label: 'أقل من 60 يوم' },
  { value: '90',      label: 'أقل من 90 يوم' },
  { value: 'ok',      label: 'جيد (أكثر من 90)' },
];

// ─────────────────────────────────────────────────────────────────────────────
//  Urgency badge component
// ─────────────────────────────────────────────────────────────────────────────

function UrgencyBadge({ urgency }: { urgency: string }) {
  const color = URGENCY_COLOR[urgency] ?? '#6B7280';
  return (
    <span
      style={{
        background: color + '22',
        border: `1px solid ${color}55`,
        color,
        borderRadius: 6,
        padding: '2px 10px',
        fontSize: 12,
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {URGENCY_AR[urgency] ?? urgency}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Summary card component
// ─────────────────────────────────────────────────────────────────────────────

interface SummaryCardProps {
  label: string;
  count: number;
  color: string;
  onClick?: () => void;
}

function SummaryCard({ label, count, color, onClick }: SummaryCardProps) {
  return (
    <div
      onClick={onClick}
      style={{
        background: color + '14',
        border: `1px solid ${color}44`,
        borderRadius: 10,
        padding: '12px 18px',
        textAlign: 'center',
        minWidth: 100,
        cursor: onClick ? 'pointer' : 'default',
        flex: '1 1 100px',
      }}
    >
      <div style={{ fontSize: 28, fontWeight: 700, color }}>{count}</div>
      <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{label}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Main page component
// ─────────────────────────────────────────────────────────────────────────────

export default function DocumentExpirationCenter() {
  const [summary, setSummary] = useState<ExpirationSummary | null>(null);
  const [records, setRecords] = useState<ExpirationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  // Filters
  const [urgency, setUrgency] = useState('all');
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');

  const loadSummary = useCallback(() => {
    api
      .get<{ data: ExpirationSummary }>('/expirations/summary')
      .then(r => setSummary(r.data.data))
      .catch(() => {});
  }, []);

  const loadList = useCallback(() => {
    setLoading(true);
    setError('');
    const params: Record<string, string> = {};
    if (urgency)  params.urgency  = urgency;
    if (category) params.category = category;
    if (search)   params.search   = search;

    api
      .get<{ data: ExpirationRecord[] }>('/expirations', { params })
      .then(r => setRecords(r.data.data))
      .catch(() => setError('حدث خطأ أثناء تحميل البيانات'))
      .finally(() => setLoading(false));
  }, [urgency, category, search]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  function handleExport() {
    setExporting(true);
    const params = new URLSearchParams();
    if (urgency)  params.set('urgency',  urgency);
    if (category) params.set('category', category);
    if (search)   params.set('search',   search);

    const baseUrl = (window as Window & typeof globalThis & { manar?: { apiBaseUrl?: string } })
      .manar?.apiBaseUrl ?? 'http://127.0.0.1:48211/api';
    const token = localStorage.getItem('manar.token');
    const qs = params.toString();
    const url = `${baseUrl}/expirations/export${qs ? `?${qs}` : ''}`;

    fetch(url, { headers: { Authorization: `Bearer ${token ?? ''}` } })
      .then(res => res.blob())
      .then(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'expirations.xlsx';
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(() => setError('فشل التصدير'))
      .finally(() => setExporting(false));
  }

  return (
    <div style={{ padding: '20px 24px', direction: 'rtl', maxWidth: 1200, margin: '0 auto' }}>
      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>مركز انتهاء الوثائق</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6B7280' }}>
            متابعة مواعيد انتهاء وثائق الموظفين والمعدات والعقود
          </p>
        </div>
        <button
          type="button"
          className="btn primary"
          onClick={handleExport}
          disabled={exporting}
          style={{ minWidth: 120 }}
        >
          {exporting ? '⏳ جاري التصدير...' : '⬇ تصدير Excel'}
        </button>
      </div>

      {/* ── Summary cards ─────────────────────────────────────────────────── */}
      {summary && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
          <SummaryCard
            label="منتهية"
            count={summary.expired}
            color="#EF4444"
            onClick={() => setUrgency('expired')}
          />
          <SummaryCard
            label="أقل من 7 أيام"
            count={summary.days7}
            color="#F97316"
            onClick={() => setUrgency('7')}
          />
          <SummaryCard
            label="أقل من 30 يوم"
            count={summary.days30}
            color="#F59E0B"
            onClick={() => setUrgency('30')}
          />
          <SummaryCard
            label="أقل من 60 يوم"
            count={summary.days60}
            color="#EAB308"
            onClick={() => setUrgency('60')}
          />
          <SummaryCard
            label="أقل من 90 يوم"
            count={summary.days90}
            color="#3B82F6"
            onClick={() => setUrgency('90')}
          />
        </div>
      )}

      {/* ── Filters ───────────────────────────────────────────────────────── */}
      <div
        className="card"
        style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20, padding: '14px 18px', alignItems: 'flex-end' }}
      >
        <div style={{ flex: '1 1 180px' }}>
          <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>درجة الإلحاح</label>
          <select
            className="input"
            value={urgency}
            onChange={e => setUrgency(e.target.value)}
            style={{ width: '100%' }}
          >
            {URGENCY_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div style={{ flex: '1 1 180px' }}>
          <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>نوع الوثيقة</label>
          <select
            className="input"
            value={category}
            onChange={e => setCategory(e.target.value)}
            style={{ width: '100%' }}
          >
            <option value="">الكل</option>
            {CATEGORY_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div style={{ flex: '2 1 200px' }}>
          <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>بحث</label>
          <input
            type="text"
            className="input"
            placeholder="ابحث باسم أو رمز..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>
        <button
          type="button"
          className="btn secondary"
          onClick={() => { setUrgency('all'); setCategory(''); setSearch(''); }}
        >
          إعادة تعيين
        </button>
      </div>

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {error && (
        <div className="alert error" style={{ marginBottom: 16 }}>{error}</div>
      )}

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#6B7280' }}>⏳ جاري التحميل...</div>
        ) : records.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#6B7280' }}>
            لا توجد نتائج مطابقة للفلاتر المحددة
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--surface-2, #f9fafb)', borderBottom: '1px solid var(--border, #e5e7eb)' }}>
                  {['نوع الوثيقة', 'الاسم', 'الرمز', 'تاريخ الانتهاء', 'الأيام المتبقية', 'درجة الإلحاح'].map(h => (
                    <th
                      key={h}
                      style={{ padding: '10px 14px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#6B7280', whiteSpace: 'nowrap' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map(r => (
                  <tr
                    key={r.id}
                    style={{ borderBottom: '1px solid var(--border, #e5e7eb)' }}
                  >
                    <td style={{ padding: '10px 14px', fontSize: 13 }}>{CATEGORY_AR[r.category] ?? r.category}</td>
                    <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 500 }}>{r.entityName}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, fontFamily: 'monospace', color: '#6B7280' }}>{r.entityCode}</td>
                    <td style={{ padding: '10px 14px', fontSize: 13, whiteSpace: 'nowrap' }}>{r.expiryDate}</td>
                    <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: URGENCY_COLOR[r.urgency] ?? '#374151' }}>
                      {r.daysRemaining < 0 ? `منتهي منذ ${Math.abs(r.daysRemaining)} يوم` : `${r.daysRemaining} يوم`}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <UrgencyBadge urgency={r.urgency} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && records.length > 0 && (
          <div style={{ padding: '8px 14px', borderTop: '1px solid var(--border, #e5e7eb)', fontSize: 12, color: '#6B7280' }}>
            إجمالي النتائج: {records.length}
          </div>
        )}
      </div>
    </div>
  );
}
