import DateInput from '../DateInput';
import { Button, FilterChip, Icon } from '../explorer/ExplorerKit';
import { useT } from '../../lib/i18n';
import type { CollectionFacets, CollectionFilters, CollectionScope, SettlementStatus } from './collectionTypes';

/* ════════════════════════════════════════════════════════════════════════════
   فلتر تحليل التحصيلات — **الوحيد في الصفحة**، ويُطبَّق على الجداول الخمسة معًا.

   نفس بنية شريط فلاتر مركز التحليل المالي حرفيًا (`xpl-toolbar` + `fac-filter` +
   حقول `xpl-field`)، وبنفس وسم `no-print` الذي يستبعده مُركِّب PDF.

   يختلف عنه في شيء واحد جوهري: هذه الصفحة تحمل **مِحوَرين زمنيين لا واحدًا** —
   تاريخ الفاتورة وتاريخ التحصيل. لذلك لا تتبع «الفترة المالية العامة» (فترة
   واحدة لا تكفي لسؤال يربط سنتين)، وتملك مدَييها بنفسها.

   كل الفلاتر تعمل **مجتمعةً**: الغياب يعني «بلا حصر» لا «افتراضي خفيّ».
   ════════════════════════════════════════════════════════════════════════════ */

const SETTLEMENT_OPTIONS: { value: SettlementStatus; labelKey: string }[] = [
  { value: 'PAID', labelKey: 'ca.settlement.paid' },
  { value: 'PARTIAL', labelKey: 'ca.settlement.partial' },
  { value: 'UNPAID', labelKey: 'ca.settlement.unpaid' },
];

const SCOPE_OPTIONS: { value: CollectionScope; labelKey: string }[] = [
  { value: 'all', labelKey: 'ca.scope.all' },
  { value: 'same-year', labelKey: 'ca.scope.same_year' },
  { value: 'other-years', labelKey: 'ca.scope.other_years' },
];

interface CollectionAnalysisFiltersProps {
  filters: CollectionFilters;
  onChange: (next: CollectionFilters) => void;
  onReset: () => void;
  onRefresh: () => void;
  /** قوائم الاختيار المشتقّة من البيانات — تصل مع أول تقرير. */
  facets: CollectionFacets | null;
  busy?: boolean;
}

/** `''` من عنصر `select` يعني «الكل» ⇒ حذف المفتاح لا تخزين قيمة فارغة. */
function numberOrUndefined(raw: string): number | undefined {
  if (raw === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export default function CollectionAnalysisFilters({
  filters,
  onChange,
  onReset,
  onRefresh,
  facets,
  busy = false,
}: CollectionAnalysisFiltersProps) {
  const { t } = useT();

  /** تعديل مفتاح واحد؛ `undefined` يحذفه فيعود إلى «بلا حصر». */
  function patch<K extends keyof CollectionFilters>(key: K, value: CollectionFilters[K]) {
    const next = { ...filters };
    if (value === undefined || value === '' || value === false) delete next[key];
    else next[key] = value;
    onChange(next);
  }

  const activeCount = Object.keys(filters).filter((k) => filters[k as keyof CollectionFilters] !== undefined).length;

  return (
    <div className="xpl-toolbar fac-filter no-print" role="search" aria-label={t('ca.filter.aria')}>
      <div className="xpl-toolbar-row fac-filter-row">
        <Button variant="primary" icon="refresh" busy={busy} onClick={onRefresh}>
          {t('ca.filter.refresh')}
        </Button>

        <label className="xpl-field fac-filter-field">
          <span className="xpl-field-label">{t('ca.filter.invoice_from')}</span>
          <DateInput
            value={filters.invoiceFrom ?? ''}
            max={filters.invoiceTo || undefined}
            className="xpl-input"
            ariaLabel={t('ca.filter.invoice_from')}
            onChange={(v) => patch('invoiceFrom', v || undefined)}
          />
        </label>

        <label className="xpl-field fac-filter-field">
          <span className="xpl-field-label">{t('ca.filter.invoice_to')}</span>
          <DateInput
            value={filters.invoiceTo ?? ''}
            min={filters.invoiceFrom || undefined}
            className="xpl-input"
            ariaLabel={t('ca.filter.invoice_to')}
            onChange={(v) => patch('invoiceTo', v || undefined)}
          />
        </label>

        <label className="xpl-field fac-filter-field">
          <span className="xpl-field-label">{t('ca.filter.collection_from')}</span>
          <DateInput
            value={filters.collectionFrom ?? ''}
            max={filters.collectionTo || undefined}
            className="xpl-input"
            ariaLabel={t('ca.filter.collection_from')}
            onChange={(v) => patch('collectionFrom', v || undefined)}
          />
        </label>

        <label className="xpl-field fac-filter-field">
          <span className="xpl-field-label">{t('ca.filter.collection_to')}</span>
          <DateInput
            value={filters.collectionTo ?? ''}
            min={filters.collectionFrom || undefined}
            className="xpl-input"
            ariaLabel={t('ca.filter.collection_to')}
            onChange={(v) => patch('collectionTo', v || undefined)}
          />
        </label>

        <label className="xpl-field fac-filter-field">
          <span className="xpl-field-label">{t('ca.filter.invoice_year')}</span>
          <select
            className="xpl-select"
            value={filters.invoiceYear != null ? String(filters.invoiceYear) : ''}
            onChange={(e) => patch('invoiceYear', numberOrUndefined(e.target.value))}
          >
            <option value="">{t('ca.filter.all_years')}</option>
            {facets?.invoiceYears.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </label>

        <label className="xpl-field fac-filter-field">
          <span className="xpl-field-label">{t('ca.filter.collection_year')}</span>
          <select
            className="xpl-select"
            value={filters.collectionYear != null ? String(filters.collectionYear) : ''}
            onChange={(e) => patch('collectionYear', numberOrUndefined(e.target.value))}
          >
            <option value="">{t('ca.filter.all_years')}</option>
            {facets?.collectionYears.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="xpl-toolbar-row fac-filter-row">
        <label className="xpl-field fac-filter-field ca-filter-wide">
          <span className="xpl-field-label">{t('ca.filter.customer')}</span>
          <select
            className="xpl-select"
            value={filters.customerId != null ? String(filters.customerId) : ''}
            onChange={(e) => patch('customerId', numberOrUndefined(e.target.value))}
          >
            <option value="">{t('ca.filter.all_customers')}</option>
            {facets?.customers
              .filter((c) => c.id != null)
              .map((c) => (
                <option key={c.id} value={String(c.id)}>{c.name}</option>
              ))}
          </select>
        </label>

        <label className="xpl-field fac-filter-field ca-filter-wide">
          <span className="xpl-field-label">{t('ca.filter.contract')}</span>
          <select
            className="xpl-select"
            value={filters.contractId != null ? String(filters.contractId) : ''}
            onChange={(e) => patch('contractId', numberOrUndefined(e.target.value))}
          >
            <option value="">{t('ca.filter.all_contracts')}</option>
            {facets?.contracts
              .filter((c) => c.id != null)
              .map((c) => (
                <option key={c.id} value={String(c.id)}>{c.name}</option>
              ))}
          </select>
        </label>

        <label className="xpl-field fac-filter-field ca-filter-wide">
          <span className="xpl-field-label">{t('ca.filter.project')}</span>
          <select
            className="xpl-select"
            value={filters.projectId != null ? String(filters.projectId) : ''}
            onChange={(e) => {
              // `0` قيمة صالحة («غير محدّد») ولا يجوز أن تسقط مع الفراغ.
              const raw = e.target.value;
              patch('projectId', raw === '' ? undefined : Number(raw));
            }}
          >
            <option value="">{t('ca.filter.all_projects')}</option>
            {facets?.projects.map((p) => (
              <option key={p.id} value={String(p.id)}>{p.name}</option>
            ))}
          </select>
        </label>

        <label className="xpl-field fac-filter-field">
          <span className="xpl-field-label">{t('ca.filter.invoice_status')}</span>
          <select
            className="xpl-select"
            value={filters.settlement ?? ''}
            onChange={(e) => patch('settlement', (e.target.value || undefined) as SettlementStatus | undefined)}
          >
            <option value="">{t('ca.filter.all_statuses')}</option>
            {SETTLEMENT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
            ))}
          </select>
        </label>

        <label className="xpl-field fac-filter-field">
          <span className="xpl-field-label">{t('ca.filter.collection_status')}</span>
          <select
            className="xpl-select"
            value={filters.collectionScope ?? 'all'}
            onChange={(e) => {
              const value = e.target.value as CollectionScope;
              patch('collectionScope', value === 'all' ? undefined : value);
            }}
          >
            {SCOPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
            ))}
          </select>
        </label>

        <div className="ca-filter-chips">
          <FilterChip
            active={filters.outstandingOnly === true}
            icon="account_balance_wallet"
            onClick={() => patch('outstandingOnly', filters.outstandingOnly ? undefined : true)}
          >
            {t('ca.filter.outstanding_only')}
          </FilterChip>
          <FilterChip
            active={filters.overdueOnly === true}
            icon="schedule"
            onClick={() => patch('overdueOnly', filters.overdueOnly ? undefined : true)}
          >
            {t('ca.filter.overdue_only')}
          </FilterChip>
          <Button variant="ghost" icon="filter_alt_off" disabled={activeCount === 0} onClick={onReset}>
            {t('ca.filter.reset')}
          </Button>
        </div>

        {/* بطاقة المدَيين — مرّة واحدة في الصفحة كلها، نظير بطاقة «الفترة المختارة». */}
        <div className="fac-period-card ca-range-card">
          <span className="fac-period-card-head">
            <Icon name="receipt_long" />
            {t('ca.range.invoices')}
          </span>
          <span className="fac-period-card-range">
            {filters.invoiceFrom || '—'} … {filters.invoiceTo || '—'}
          </span>
          <span className="fac-period-card-head">
            <Icon name="payments" />
            {t('ca.range.collections')}
          </span>
          <span className="fac-period-card-range">
            {filters.collectionFrom || '—'} … {filters.collectionTo || '—'}
          </span>
        </div>
      </div>
    </div>
  );
}
