import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { generateExportFileName, ReportName } from '../utils/exportFilename';
import { downloadBlob } from '../utils/exportUtils';
import {
  ExecutiveHeader,
  IdChip,
  HeroMetric,
  MetricCard,
  StatusChip,
  FilterChip,
  SearchBox,
  SectionCard,
  EmptyState,
  ErrorBanner,
  SkeletonRows,
  Drawer,
  DrawerSection,
  Button,
} from '../components/explorer/ExplorerKit';
import '../components/explorer/explorer-kit.css';
import './DocumentExpirationCenter.css';

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

const CATEGORY_ICON: Record<string, string> = {
  EMPLOYEE_RESIDENCY:       'badge',
  EMPLOYEE_PASSPORT:        'travel_explore',
  EMPLOYEE_DRIVING_LICENSE: 'directions_car',
  EMPLOYEE_VEHICLE_LICENSE: 'local_shipping',
  EQUIPMENT_REGISTRATION:   'agriculture',
  EQUIPMENT_INSURANCE:      'verified_user',
  CONTRACT_EXPIRY:          'description',
};

const URGENCY_AR: Record<string, string> = {
  expired: 'منتهي',
  '7':     'خلال 7 أيام',
  '30':    'خلال 30 يوم',
  '60':    'خلال 60 يوم',
  '90':    'خلال 90 يوم',
  ok:      'جيد',
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

type Tone = 'neutral' | 'green' | 'red' | 'orange' | 'blue' | 'indigo';

function urgencyTone(u: string): Tone {
  if (u === 'expired' || u === '7') return 'red';
  if (u === '30' || u === '60')     return 'orange';
  if (u === '90')                   return 'blue';
  return 'green';
}

function daysClass(u: string): string {
  if (u === 'expired' || u === '7') return 'decx-days--expired';
  if (u === '30' || u === '60' || u === '90') return 'decx-days--soon';
  return 'decx-days--ok';
}

function urgencyHex(u: string): string {
  if (u === 'expired' || u === '7') return '#ef4444';
  if (u === '30' || u === '60')     return '#f59e0b';
  if (u === '90')                   return '#3b82f6';
  return '#10b981';
}

function daysLabel(d: number): string {
  return d < 0 ? `منتهي منذ ${Math.abs(d)} يوم` : `${d} يوم`;
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

  // Drawer
  const [selected, setSelected] = useState<ExpirationRecord | null>(null);

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

  async function handleExport() {
    setExporting(true);
    const params: Record<string, string> = {};
    if (urgency)  params.urgency  = urgency;
    if (category) params.category = category;
    if (search)   params.search   = search;

    try {
      const res = await api.get('/expirations/export', { params, responseType: 'blob' });
      downloadBlob(res.data as Blob, generateExportFileName({ reportName: ReportName.DocumentExpirations, extension: 'xlsx' }));
    } catch {
      setError('فشل التصدير');
    } finally {
      setExporting(false);
    }
  }

  function resetFilters() {
    setUrgency('all');
    setCategory('');
    setSearch('');
  }

  const hasFilters = urgency !== 'all' || category !== '' || search !== '';

  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; clear: () => void }[] = [];
    if (urgency !== 'all') chips.push({ key: 'u', label: URGENCY_AR[urgency] ?? urgency, clear: () => setUrgency('all') });
    if (category) chips.push({ key: 'c', label: CATEGORY_AR[category] ?? category, clear: () => setCategory('') });
    if (search) chips.push({ key: 's', label: `بحث: ${search}`, clear: () => setSearch('') });
    return chips;
  }, [urgency, category, search]);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="xpl-scope xpl-page" dir="rtl">

      {/* ── Document detail drawer ── */}
      {selected && (
        <Drawer
          title="تفاصيل الوثيقة"
          onClose={() => setSelected(null)}
          hero={
            <div className="xpl-drawer-hero">
              <div className="xpl-drawer-hero-icon">
                <span className="material-symbols-outlined" aria-hidden="true">{CATEGORY_ICON[selected.category] ?? 'description'}</span>
              </div>
              <div className="xpl-drawer-hero-body">
                <span className="xpl-drawer-hero-title">{selected.entityName}</span>
                <span className="xpl-drawer-hero-sub">{CATEGORY_AR[selected.category] ?? selected.category}</span>
                <div style={{ marginTop: 4 }}>
                  <StatusChip tone={urgencyTone(selected.urgency)} icon={selected.daysRemaining < 0 ? 'event_busy' : 'schedule'}>
                    {URGENCY_AR[selected.urgency] ?? selected.urgency}
                  </StatusChip>
                </div>
              </div>
            </div>
          }
          footer={<Button variant="ghost" icon="close" onClick={() => setSelected(null)}>إغلاق</Button>}
        >
          <DrawerSection title="بيانات الجهة">
            <div className="xpl-drawer-field">
              <span className="xpl-drawer-field-label">الاسم</span>
              <span className="xpl-drawer-field-value">{selected.entityName}</span>
            </div>
            <div className="xpl-drawer-field">
              <span className="xpl-drawer-field-label">الرمز</span>
              <span className="xpl-drawer-field-value mono">{selected.entityCode || '—'}</span>
            </div>
            <div className="xpl-drawer-field">
              <span className="xpl-drawer-field-label">نوع الوثيقة</span>
              <span className="xpl-drawer-field-value">{CATEGORY_AR[selected.category] ?? selected.category}</span>
            </div>
          </DrawerSection>

          <DrawerSection title="الصلاحية والمدة">
            <div className="xpl-drawer-field">
              <span className="xpl-drawer-field-label">تاريخ الانتهاء</span>
              <span className="xpl-drawer-field-value">{selected.expiryDate}</span>
            </div>
            <div className="xpl-drawer-field">
              <span className="xpl-drawer-field-label">الأيام المتبقية</span>
              <span className={`xpl-drawer-field-value ${daysClass(selected.urgency)}`} style={{ color: urgencyHex(selected.urgency) }}>
                {daysLabel(selected.daysRemaining)}
              </span>
            </div>
            <div className="xpl-drawer-field" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <span className="xpl-drawer-field-label">المؤشر الزمني</span>
              <div className="decx-gauge">
                <div
                  className="decx-gauge-fill"
                  style={{
                    width: `${Math.max(4, Math.min(100, (selected.daysRemaining / 90) * 100))}%`,
                    background: urgencyHex(selected.urgency),
                  }}
                />
              </div>
            </div>
            <div className="xpl-drawer-field">
              <span className="xpl-drawer-field-label">الحالة</span>
              <span className="xpl-drawer-field-value">
                <StatusChip tone={urgencyTone(selected.urgency)}>{URGENCY_AR[selected.urgency] ?? selected.urgency}</StatusChip>
              </span>
            </div>
          </DrawerSection>

          <DrawerSection title="إجراءات سريعة">
            <div className="decx-drawer-actions">
              <Button variant="secondary" icon="filter_alt" block onClick={() => { setCategory(selected.category); setSelected(null); }}>
                تصفية حسب هذا النوع
              </Button>
              <Button variant="ghost" icon="download" block busy={exporting} onClick={handleExport}>
                تصدير النتائج الحالية
              </Button>
            </div>
          </DrawerSection>
        </Drawer>
      )}

      {/* ── Executive header ── */}
      <ExecutiveHeader
        icon="event_busy"
        title="مركز انتهاء الوثائق"
        subtitle="متابعة مواعيد انتهاء وثائق الموظفين والمعدات والعقود في مكان واحد"
        chips={
          summary ? (
            <>
              <IdChip icon="inventory_2" tone="indigo">{summary.total} وثيقة متابَعة</IdChip>
              <IdChip icon="event_busy" tone="red">{summary.expired} منتهية</IdChip>
              <IdChip icon="warning" tone="orange">{summary.days7 + summary.days30} قريبة الانتهاء</IdChip>
            </>
          ) : undefined
        }
        aside={
          <Button variant="primary" icon="download" busy={exporting} onClick={handleExport}>
            تصدير Excel
          </Button>
        }
      />

      {/* ── KPI hero + clickable urgency grid ── */}
      {summary && (
        <div className="decx-metrics">
          <HeroMetric
            icon="fact_check"
            label="إجمالي الوثائق المتابَعة"
            value={summary.total}
            sub={<><span className="material-symbols-outlined">priority_high</span>{`${summary.expired} منتهية تحتاج إجراءً فورياً`}</>}
          />
          <div className="decx-metrics-secondary">
            <MetricCard icon="event_busy" tone="red" label="منتهية" value={summary.expired}
              onClick={() => setUrgency('expired')} active={urgency === 'expired'} ariaLabel="عرض الوثائق المنتهية" />
            <MetricCard icon="hourglass_bottom" tone="red" label="خلال 7 أيام" value={summary.days7}
              onClick={() => setUrgency('7')} active={urgency === '7'} ariaLabel="عرض ما ينتهي خلال 7 أيام" />
            <MetricCard icon="schedule" tone="orange" label="خلال 30 يوم" value={summary.days30}
              onClick={() => setUrgency('30')} active={urgency === '30'} ariaLabel="عرض ما ينتهي خلال 30 يوم" />
            <MetricCard icon="calendar_month" tone="orange" label="خلال 60 يوم" value={summary.days60}
              onClick={() => setUrgency('60')} active={urgency === '60'} ariaLabel="عرض ما ينتهي خلال 60 يوم" />
            <MetricCard icon="event_available" tone="blue" label="خلال 90 يوم" value={summary.days90}
              onClick={() => setUrgency('90')} active={urgency === '90'} ariaLabel="عرض ما ينتهي خلال 90 يوم" />
          </div>
        </div>
      )}

      {/* ── Sticky filter toolbar ── */}
      <div className="xpl-toolbar xpl-toolbar--sticky">
        <div className="xpl-toolbar-row">
          <SearchBox value={search} onChange={setSearch} placeholder="ابحث باسم الجهة أو الرمز..." ariaLabel="بحث في الوثائق" />
          <div className="xpl-field" style={{ minWidth: 190 }}>
            <span className="xpl-field-label">نوع الوثيقة</span>
            <select className="xpl-select" aria-label="نوع الوثيقة" value={category} onChange={e => setCategory(e.target.value)}>
              <option value="">كل الأنواع</option>
              {CATEGORY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          {hasFilters && (
            <Button variant="ghost" icon="restart_alt" onClick={resetFilters}>إعادة تعيين</Button>
          )}
        </div>
        <div className="xpl-toolbar-row">
          {URGENCY_OPTIONS.map(o => (
            <FilterChip key={o.value} active={urgency === o.value} onClick={() => setUrgency(o.value)}>
              {o.label}
            </FilterChip>
          ))}
        </div>
        <div className="xpl-active-row">
          <div className="xpl-active-chips">
            {activeChips.length === 0 ? (
              <span className="xpl-result-count">لا توجد فلاتر مطبّقة</span>
            ) : (
              activeChips.map(c => (
                <span key={c.key} className="xpl-active-chip">
                  {c.label}
                  <button type="button" onClick={c.clear} aria-label={`إزالة ${c.label}`}>
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </span>
              ))
            )}
          </div>
          <span className="xpl-result-count">{records.length} نتيجة</span>
        </div>
      </div>

      {/* ── Error ── */}
      {error && <ErrorBanner>{error}</ErrorBanner>}

      {/* ── Timeline table ── */}
      <SectionCard title="الجدول الزمني للوثائق" icon="table_rows" padded={false}>
        {loading ? (
          <div className="xpl-card--pad"><SkeletonRows rows={6} /></div>
        ) : records.length === 0 ? (
          <EmptyState
            icon="event_available"
            tone="neutral"
            title="لا توجد وثائق مطابقة"
            message="لا توجد نتائج للفلاتر المحددة. جرّب توسيع نطاق البحث أو إعادة تعيين الفلاتر."
            action={hasFilters ? <Button variant="secondary" icon="restart_alt" onClick={resetFilters}>إعادة تعيين الفلاتر</Button> : undefined}
          />
        ) : (
          <div className="xpl-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
            <table className="xpl-table">
              <thead>
                <tr>
                  <th>نوع الوثيقة</th>
                  <th>الجهة</th>
                  <th>تاريخ الانتهاء</th>
                  <th>الأيام المتبقية</th>
                  <th>الحالة</th>
                  <th aria-label="فتح" />
                </tr>
              </thead>
              <tbody>
                {records.map(r => (
                  <tr
                    key={r.id}
                    className="xpl-row--click"
                    tabIndex={0}
                    role="button"
                    aria-label={`تفاصيل ${CATEGORY_AR[r.category] ?? r.category} — ${r.entityName}`}
                    onClick={() => setSelected(r)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(r); } }}
                  >
                    <td>
                      <span className="decx-cat-cell">
                        <span className="decx-cat-icon">
                          <span className="material-symbols-outlined" aria-hidden="true">{CATEGORY_ICON[r.category] ?? 'description'}</span>
                        </span>
                        {CATEGORY_AR[r.category] ?? r.category}
                      </span>
                    </td>
                    <td>
                      <span className="decx-entity">
                        <span className="decx-entity-name">{r.entityName}</span>
                        {r.entityCode && <span className="decx-entity-code">{r.entityCode}</span>}
                      </span>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{r.expiryDate}</td>
                    <td><span className={`decx-days ${daysClass(r.urgency)}`}>{daysLabel(r.daysRemaining)}</span></td>
                    <td><StatusChip tone={urgencyTone(r.urgency)}>{URGENCY_AR[r.urgency] ?? r.urgency}</StatusChip></td>
                    <td className="decx-col-chevron"><span className="material-symbols-outlined" aria-hidden="true">chevron_left</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && records.length > 0 && (
          <div className="xpl-card--pad" style={{ borderTop: '1px solid var(--xpl-border)', fontSize: 12.5, color: 'var(--xpl-muted)' }}>
            إجمالي النتائج المعروضة: {records.length}
          </div>
        )}
      </SectionCard>

    </div>
  );
}
