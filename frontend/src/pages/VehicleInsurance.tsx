import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../stores/authStore';
import { useT } from '../lib/i18n';
import { dateText, MoneyText, MoneyCell } from '../config/modules';
import { usePersistedState } from '../hooks/usePersistedState';
import { useTableSort } from '../hooks/useTableSort';
import { sortRowsClient } from '../lib/clientSort';
import SortableHeader from '../components/SortableHeader';
import {
  ExecutiveHeader,
  HeroMetric,
  MetricCard,
  Tabs,
  StatusChip,
  SearchBox,
  FilterChip,
  EmptyState,
  ErrorBanner,
  SkeletonRows,
  Drawer,
  DrawerSection,
  DrawerField,
  Dialog,
  DialogSection,
  Button,
} from '../components/explorer/ExplorerKit';
import DateInput from '../components/DateInput';
import { downloadBlob } from '../utils/exportUtils';
import { generateExportFileName, ReportName } from '../utils/exportFilename';
import '../components/explorer/explorer-kit.css';
import './VehicleInsurance.css';
import { fcMoneyHeader } from '../components/financial/financialLabels';

/**
 * تأمين المركبات — Vehicle Insurance Management v1.
 *
 * تبويبان: «وثائق التأمين» (صف واحد لكل مركبة يحمل وثيقتها الحالية) و«سجل الحوادث».
 * لا زرّ حذف في الشاشة كلها: التجديد يُنشئ وثيقة جديدة، والسجل التاريخي محفوظ —
 * والخادم لا يعرض مسار DELETE أصلًا، فالشاشة لا تُخفي قدرة موجودة.
 */

// ── Domain Types ──────────────────────────────────────────────────────────────

interface EquipmentBrief {
  id: number;
  code: string;
  name?: string | null;
  plateNumber?: string | null;
}

type Urgency = 'EXPIRED' | 'DUE_7' | 'DUE_15' | 'DUE_30' | 'VALID';
type PolicyStatus = 'EXPIRED' | 'EXPIRING_SOON' | 'VALID';

interface Policy {
  id: number;
  equipmentId: number;
  equipment: EquipmentBrief | null;
  policyNumber: string;
  insurerName: string;
  coverageType: string;
  startDate: string;
  endDate: string;
  cost: number;
  notes: string | null;
  daysRemaining: number;
  urgency: Urgency;
  status: PolicyStatus;
  createdAt: string;
  updatedAt: string;
}

interface Accident {
  id: number;
  equipmentId: number;
  equipment?: EquipmentBrief | null;
  accidentDate: string;
  description: string;
  repairCost: number | null;
  notes: string | null;
  createdAt: string;
}

interface Summary {
  insuredVehicles: number;
  expired: number;
  expiringSoon: number;
  due7: number;
  due15: number;
  due30: number;
  totalCost: number;
  totalCostAllPolicies: number;
  totalPolicies: number;
  totalAccidents: number;
}

type Tone = 'neutral' | 'green' | 'red' | 'orange' | 'blue' | 'indigo';
type Tab = 'policies' | 'accidents';

// ── Status presentation ───────────────────────────────────────────────────────

const STATUS_META: Record<PolicyStatus, { key: string; tone: Tone; icon: string }> = {
  VALID: { key: 'opt.vins.status_valid', tone: 'green', icon: 'verified_user' },
  EXPIRING_SOON: { key: 'opt.vins.status_expiring', tone: 'orange', icon: 'schedule' },
  EXPIRED: { key: 'opt.vins.status_expired', tone: 'red', icon: 'gpp_bad' },
};

const URGENCY_META: Record<Urgency, { key: string; rowClass: string }> = {
  EXPIRED: { key: 'opt.vins.expired', rowClass: 'vins-row--expired' },
  DUE_7: { key: 'opt.vins.due_7', rowClass: 'vins-row--due7' },
  DUE_15: { key: 'opt.vins.due_15', rowClass: 'vins-row--due15' },
  DUE_30: { key: 'opt.vins.due_30', rowClass: 'vins-row--due30' },
  VALID: { key: 'opt.vins.valid', rowClass: 'vins-row--valid' },
};

const COVERAGE_KEY: Record<string, string> = {
  COMPREHENSIVE: 'opt.vins.comprehensive',
  THIRD_PARTY: 'opt.vins.third_party',
  OTHER: 'opt.vins.other',
};

type Translate = (key: string, vars?: Record<string, string | number>) => string;

function coverageLabel(t: Translate, value: string): string {
  const key = COVERAGE_KEY[value];
  return key ? t(key) : value;
}

function statusChip(t: Translate, status: PolicyStatus) {
  const m = STATUS_META[status];
  return <StatusChip tone={m.tone} icon={m.icon}>{t(m.key)}</StatusChip>;
}

/** نص الأيام المتبقية + لونه — «تنتهي اليوم» عند الصفر، و«منتهية منذ…» عند السالب. */
function DaysCell({ days }: { days: number }) {
  const { t } = useT();
  const cls = days < 0 ? 'vins-days--expired' : days <= 15 ? 'vins-days--warn' : 'vins-days--ok';
  const label =
    days < 0
      ? t('msg.vins.days_overdue', { days: Math.abs(days) })
      : days === 0
        ? t('msg.vins.expires_today')
        : t('msg.vins.days_remaining', { days });
  return <span className={`vins-days ${cls}`}>{label}</span>;
}

// ── Reusable bits ─────────────────────────────────────────────────────────────

function clickRow(handler: () => void) {
  return {
    tabIndex: 0,
    role: 'button' as const,
    onClick: handler,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handler();
      }
    },
  };
}

const Chevron = () => (
  <td style={{ width: 32, textAlign: 'center' }}>
    <span
      className="material-symbols-outlined"
      aria-hidden="true"
      style={{ fontSize: 18, color: 'var(--xpl-muted)' }}
    >
      chevron_left
    </span>
  </td>
);

function TableShell({
  loading,
  empty,
  children,
}: {
  loading: boolean;
  empty: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="xpl-card" style={{ overflow: 'hidden' }}>
      {loading ? <div style={{ padding: 16 }}><SkeletonRows rows={6} /></div> : empty ? empty : children}
    </section>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div className="vins-hint">
      <span className="material-symbols-outlined" aria-hidden="true">info</span>
      <span>{children}</span>
    </div>
  );
}

/** قائمة اختيار المعدة — تُغذّى من نقطة نهاية الوحدة لا من `/equipment`. */
function EquipmentSelect({
  value,
  onChange,
  equipmentList,
  plate,
  disabled,
}: {
  value: string;
  onChange: (id: string, plate: string) => void;
  equipmentList: EquipmentBrief[];
  plate: string;
  disabled?: boolean;
}) {
  const { t } = useT();
  return (
    <DialogSection title={t('field.vins.equipment')} icon="construction">
      <div className="xpl-field xpl-field--full">
        <label>{t('field.vins.equipment')} <span className="req">*</span></label>
        <select
          className="xpl-select"
          required
          disabled={disabled}
          value={value}
          onChange={(e) => {
            const eq = equipmentList.find((x) => String(x.id) === e.target.value);
            onChange(e.target.value, eq?.plateNumber ?? '');
          }}
          aria-label={t('field.vins.equipment')}
        >
          <option value="">{t('field.select_equipment')}</option>
          {equipmentList.map((eq) => (
            <option key={eq.id} value={eq.id}>
              {eq.code}{eq.name ? ` — ${eq.name}` : ''}
            </option>
          ))}
        </select>
      </div>
      <div className="xpl-field xpl-field--full">
        <label>{t('field.plate_number')}</label>
        <div className="vins-readonly">{plate || '—'}</div>
      </div>
    </DialogSection>
  );
}

// ── Summary KPIs ──────────────────────────────────────────────────────────────

function SummaryKPIs({ reloadKey }: { reloadKey: number }) {
  const { t } = useT();
  const [s, setS] = useState<Summary | null>(null);

  useEffect(() => {
    api
      .get('/vehicle-insurance/summary')
      .then((r) => setS(r.data.data ?? null))
      .catch(() => {});
  }, [reloadKey]);

  const insured = s?.insuredVehicles ?? 0;
  const expired = s?.expired ?? 0;
  const soon = s?.expiringSoon ?? 0;

  return (
    <div className="vins-metrics">
      <HeroMetric
        icon="shield"
        label={t('stat.vins.insured_vehicles')}
        value={insured}
        sub={
          <>
            <span className="material-symbols-outlined">description</span>
            {t('msg.vins.policies_count', { count: s?.totalPolicies ?? 0 })}
          </>
        }
      />
      <div className="xpl-kpi-grid">
        <MetricCard
          icon="gpp_bad"
          tone={expired > 0 ? 'red' : 'green'}
          label={t('stat.vins.expired')}
          value={expired}
          sub={expired > 0 ? t('stat.vins.needs_renewal') : undefined}
        />
        <MetricCard
          icon="schedule"
          tone={soon > 0 ? 'orange' : 'green'}
          label={t('stat.vins.expiring_soon')}
          value={soon}
          sub={soon > 0 ? t('stat.vins.within_30_days') : undefined}
        />
        <MetricCard
          icon="payments"
          tone="indigo"
          label={t('stat.vins.total_cost')}
          value={<MoneyText value={s?.totalCost ?? 0} />}
          sub={t('stat.vins.current_policies')}
        />
        <MetricCard
          icon="car_crash"
          tone={(s?.totalAccidents ?? 0) > 0 ? 'orange' : 'neutral'}
          label={t('stat.vins.accidents')}
          value={s?.totalAccidents ?? 0}
        />
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function VehicleInsurance() {
  const { t } = useT();
  const [tab, setTab] = usePersistedState<Tab>('vins:tab', 'policies');
  /** فلتر معدة تبويب الحوادث — يُضبَط أيضًا عند «سجل الحوادث» من صف وثيقة. */
  const [accidentEquip, setAccidentEquip] = usePersistedState('vins:accidents:equip', '');
  /** عدّاد يُجبر بطاقات المؤشرات على إعادة التحميل بعد أي كتابة. */
  const [kpiKey, setKpiKey] = useState(0);
  const bumpKpis = useCallback(() => setKpiKey((n) => n + 1), []);

  const [equipmentList, setEquipmentList] = useState<EquipmentBrief[]>([]);
  useEffect(() => {
    api
      .get('/vehicle-insurance/equipment-options')
      .then((r) => setEquipmentList(r.data.data ?? []))
      .catch(() => {});
  }, []);

  const openAccidentsFor = useCallback(
    (equipmentId: number) => {
      setAccidentEquip(String(equipmentId));
      setTab('accidents');
    },
    [setAccidentEquip, setTab],
  );

  return (
    <div className="xpl-scope xpl-page">
      <ExecutiveHeader icon="shield" title={t('page.vins.title')} subtitle={t('page.vins.subtitle')} />
      <SummaryKPIs reloadKey={kpiKey} />
      <Tabs<Tab>
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'policies', label: t('tab.vins.policies'), icon: 'shield' },
          { key: 'accidents', label: t('tab.vins.accidents'), icon: 'car_crash' },
        ]}
      />
      {tab === 'policies' && (
        <PoliciesTab equipmentList={equipmentList} onChanged={bumpKpis} onOpenAccidents={openAccidentsFor} />
      )}
      {tab === 'accidents' && (
        <AccidentsTab
          equipmentList={equipmentList}
          filterEquip={accidentEquip}
          setFilterEquip={setAccidentEquip}
          onChanged={bumpKpis}
        />
      )}
    </div>
  );
}

// ── Policies tab ──────────────────────────────────────────────────────────────

const EMPTY_POLICY_FORM = {
  equipmentId: '',
  plateNumber: '',
  policyNumber: '',
  insurerName: '',
  coverageType: 'COMPREHENSIVE',
  startDate: '',
  endDate: '',
  cost: '',
  notes: '',
};
type PolicyForm = typeof EMPTY_POLICY_FORM;

function PolicyFormBody({
  form,
  setForm,
  equipmentList,
  lockEquipment,
}: {
  form: PolicyForm;
  setForm: (f: PolicyForm) => void;
  equipmentList: EquipmentBrief[];
  lockEquipment: boolean;
}) {
  const { t } = useT();
  return (
    <>
      <EquipmentSelect
        value={form.equipmentId}
        plate={form.plateNumber}
        equipmentList={equipmentList}
        disabled={lockEquipment}
        onChange={(id, plate) => setForm({ ...form, equipmentId: id, plateNumber: plate })}
      />
      <DialogSection title={t('sec.vins.policy_data')} icon="description">
        <div className="xpl-field">
          <label>{t('field.vins.policy_number')} <span className="req">*</span></label>
          <input
            className="xpl-input"
            required
            value={form.policyNumber}
            onChange={(e) => setForm({ ...form, policyNumber: e.target.value })}
            aria-label={t('field.vins.policy_number')}
          />
        </div>
        <div className="xpl-field">
          <label>{t('field.vins.insurer')} <span className="req">*</span></label>
          <input
            className="xpl-input"
            required
            value={form.insurerName}
            onChange={(e) => setForm({ ...form, insurerName: e.target.value })}
            aria-label={t('field.vins.insurer')}
          />
        </div>
        <div className="xpl-field">
          <label>{t('field.vins.coverage')} <span className="req">*</span></label>
          <select
            className="xpl-select"
            value={form.coverageType}
            onChange={(e) => setForm({ ...form, coverageType: e.target.value })}
            aria-label={t('field.vins.coverage')}
          >
            <option value="COMPREHENSIVE">{t('opt.vins.comprehensive')}</option>
            <option value="THIRD_PARTY">{t('opt.vins.third_party')}</option>
            <option value="OTHER">{t('opt.vins.other')}</option>
          </select>
        </div>
      </DialogSection>
      <DialogSection title={t('sec.vins.period_cost')} icon="event">
        <div className="xpl-field">
          <label>{t('field.vins.start_date')} <span className="req">*</span></label>
          <DateInput
            className="xpl-input"
            value={form.startDate}
            onChange={(v) => setForm({ ...form, startDate: v })}
            ariaLabel={t('field.vins.start_date')}
          />
        </div>
        <div className="xpl-field">
          <label>{t('field.vins.end_date')} <span className="req">*</span></label>
          <DateInput
            className="xpl-input"
            value={form.endDate}
            onChange={(v) => setForm({ ...form, endDate: v })}
            ariaLabel={t('field.vins.end_date')}
          />
        </div>
        <div className="xpl-field">
          <label>{t('field.vins.cost')}</label>
          <input
            className="xpl-input"
            type="number"
            min="0"
            step="0.001"
            value={form.cost}
            onChange={(e) => setForm({ ...form, cost: e.target.value })}
            style={{ direction: 'ltr' }}
            aria-label={t('field.vins.cost')}
          />
        </div>
        <div className="xpl-field xpl-field--full">
          <label>{t('field.vins.notes')}</label>
          <textarea
            className="xpl-textarea"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            aria-label={t('field.vins.notes')}
          />
        </div>
      </DialogSection>
    </>
  );
}

function policySortValue(row: Policy, key: string): unknown {
  if (key === 'equipment') return row.equipment?.code ?? '';
  return (row as unknown as Record<string, unknown>)[key];
}

function PoliciesTab({
  equipmentList,
  onChanged,
  onOpenAccidents,
}: {
  equipmentList: EquipmentBrief[];
  onChanged: () => void;
  onOpenAccidents: (equipmentId: number) => void;
}) {
  const { t } = useT();
  const { hasPermission } = useAuth();
  const [rows, setRows] = useState<Policy[]>([]);
  const [insurers, setInsurers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = usePersistedState('vins:policies:search', '');
  const [filterInsurer, setFilterInsurer] = usePersistedState('vins:policies:insurer', '');
  const [filterStatus, setFilterStatus] = usePersistedState('vins:policies:status', '');
  const sort = useTableSort('vehicle-insurance-policies');

  const [viewing, setViewing] = useState<Policy | null>(null);
  const [history, setHistory] = useState<Policy[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [renewFor, setRenewFor] = useState<Policy | null>(null);
  const [editPolicy, setEditPolicy] = useState<Policy | null>(null);
  const [form, setForm] = useState<PolicyForm>(EMPTY_POLICY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string> = {};
      if (filterInsurer) params.insurer = filterInsurer;
      if (filterStatus) params.status = filterStatus;
      const res = await api.get('/vehicle-insurance', { params });
      setRows(res.data.data ?? []);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [filterInsurer, filterStatus]);

  useEffect(() => {
    load();
  }, [load]);

  const loadInsurers = useCallback(() => {
    api
      .get('/vehicle-insurance/insurers')
      .then((r) => setInsurers(r.data.data ?? []))
      .catch(() => {});
  }, []);
  useEffect(() => {
    loadInsurers();
  }, [loadInsurers]);

  // البحث محلي (المجموعة محمَّلة بكاملها) — بنفس حقول بحث الخادم.
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        (r.equipment?.code ?? '').toLowerCase().includes(q) ||
        (r.equipment?.name ?? '').toLowerCase().includes(q) ||
        (r.equipment?.plateNumber ?? '').toLowerCase().includes(q) ||
        r.policyNumber.toLowerCase().includes(q) ||
        r.insurerName.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const sorted = useMemo(
    () => sortRowsClient(visible, sort.sortBy, sort.sortDir, policySortValue),
    [visible, sort.sortBy, sort.sortDir],
  );

  function openHistory(p: Policy) {
    setViewing(p);
    setHistoryLoading(true);
    setHistory([]);
    api
      .get('/vehicle-insurance/policies', { params: { equipmentId: p.equipmentId } })
      .then((r) => setHistory(r.data.data ?? []))
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }

  function openCreate() {
    setForm(EMPTY_POLICY_FORM);
    setFormError('');
    setShowCreate(true);
  }

  /** التجديد = إنشاء وثيقة جديدة لنفس المعدة، مع تعبئة مسبقة من الوثيقة الحالية. */
  function openRenew(p: Policy) {
    setForm({
      equipmentId: String(p.equipmentId),
      plateNumber: p.equipment?.plateNumber ?? '',
      policyNumber: '',
      insurerName: p.insurerName,
      coverageType: p.coverageType,
      startDate: '',
      endDate: '',
      cost: '',
      notes: '',
    });
    setFormError('');
    setRenewFor(p);
  }

  function openEdit(p: Policy) {
    setForm({
      equipmentId: String(p.equipmentId),
      plateNumber: p.equipment?.plateNumber ?? '',
      policyNumber: p.policyNumber,
      insurerName: p.insurerName,
      coverageType: p.coverageType,
      startDate: p.startDate,
      endDate: p.endDate,
      cost: String(p.cost),
      notes: p.notes ?? '',
    });
    setFormError('');
    setEditPolicy(p);
  }

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      await api.post('/vehicle-insurance/policies', {
        equipmentId: Number(form.equipmentId),
        policyNumber: form.policyNumber,
        insurerName: form.insurerName,
        coverageType: form.coverageType,
        startDate: form.startDate,
        endDate: form.endDate,
        cost: form.cost ? Number(form.cost) : 0,
        ...(form.notes ? { notes: form.notes } : {}),
      });
      setShowCreate(false);
      setRenewFor(null);
      setViewing(null);
      loadInsurers();
      onChanged();
      await load();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editPolicy) return;
    setSaving(true);
    setFormError('');
    try {
      await api.patch(`/vehicle-insurance/policies/${editPolicy.id}`, {
        policyNumber: form.policyNumber,
        insurerName: form.insurerName,
        coverageType: form.coverageType,
        startDate: form.startDate,
        endDate: form.endDate,
        cost: form.cost ? Number(form.cost) : 0,
        notes: form.notes ? form.notes : null,
      });
      setEditPolicy(null);
      setViewing(null);
      loadInsurers();
      onChanged();
      await load();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    setError('');
    try {
      const params: Record<string, string> = {};
      if (filterInsurer) params.insurer = filterInsurer;
      if (filterStatus) params.status = filterStatus;
      if (search.trim()) params.search = search.trim();
      const res = await api.get('/vehicle-insurance/export', { params, responseType: 'blob' });
      downloadBlob(
        res.data as Blob,
        generateExportFileName({ reportName: ReportName.VehicleInsurance, extension: 'xlsx' }),
      );
    } catch {
      setError(t('err.vins.export_failed'));
    } finally {
      setExporting(false);
    }
  }

  const STATUS_CHIPS: [string, string][] = [
    ['', t('filter.vins.all_statuses')],
    ['VALID', t('opt.vins.status_valid')],
    ['EXPIRING_SOON', t('opt.vins.status_expiring')],
    ['EXPIRED', t('opt.vins.status_expired')],
  ];

  const canCreate = hasPermission('vehicleInsurance.create');
  const canUpdate = hasPermission('vehicleInsurance.update');
  const canExport = hasPermission('vehicleInsurance.export');

  return (
    <>
      <div className="xpl-toolbar xpl-toolbar--sticky">
        <div className="xpl-toolbar-row">
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder={t('search.placeholder')}
            ariaLabel={t('search.placeholder')}
          />
          <div className="xpl-field" style={{ minWidth: 190 }}>
            <span className="xpl-field-label">{t('filter.vins.all_insurers')}</span>
            <select
              className="xpl-select"
              aria-label={t('filter.vins.all_insurers')}
              value={filterInsurer}
              onChange={(e) => setFilterInsurer(e.target.value)}
            >
              <option value="">{t('filter.vins.all_insurers')}</option>
              {insurers.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
          <Button variant="ghost" icon="refresh" busy={loading} onClick={load}>{t('action.refresh')}</Button>
          {canExport && (
            <Button variant="ghost" icon="download" busy={exporting} onClick={handleExport}>
              {t('action.vins.export_excel')}
            </Button>
          )}
          {canCreate && (
            <Button variant="primary" icon="add" onClick={openCreate}>{t('action.vins.add_policy')}</Button>
          )}
        </div>
        <div className="xpl-toolbar-row">
          {STATUS_CHIPS.map(([v, l]) => (
            <FilterChip key={`s${v}`} active={filterStatus === v} onClick={() => setFilterStatus(v)}>{l}</FilterChip>
          ))}
        </div>
      </div>

      {error && <ErrorBanner>{error}</ErrorBanner>}
      <Hint>{t('msg.vins.renew_hint')}</Hint>

      <TableShell
        loading={loading}
        empty={
          !loading && visible.length === 0 && (
            <EmptyState
              icon="shield"
              tone="neutral"
              title={t('empty.vins.policies')}
              action={canCreate ? <Button variant="primary" icon="add" onClick={openCreate}>{t('action.vins.add_policy')}</Button> : undefined}
            />
          )
        }
      >
        <div className="xpl-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
          <table className="xpl-table">
            <thead>
              <tr>
                <SortableHeader label={t('col.vins.equipment')} title={t('col.vins.equipment')} state={sort.getState('equipment')} onToggle={() => sort.toggle('equipment')} />
                <SortableHeader label={t('col.vins.policy_number')} title={t('col.vins.policy_number')} state={sort.getState('policyNumber')} onToggle={() => sort.toggle('policyNumber')} />
                <SortableHeader label={t('col.vins.insurer')} title={t('col.vins.insurer')} state={sort.getState('insurerName')} onToggle={() => sort.toggle('insurerName')} />
                <SortableHeader label={t('col.vins.coverage')} title={t('col.vins.coverage')} state={sort.getState('coverageType')} onToggle={() => sort.toggle('coverageType')} />
                <SortableHeader label={t('col.vins.end_date')} title={t('col.vins.end_date')} state={sort.getState('endDate')} onToggle={() => sort.toggle('endDate')} />
                <SortableHeader label={t('col.vins.days_remaining')} title={t('col.vins.days_remaining')} state={sort.getState('daysRemaining')} onToggle={() => sort.toggle('daysRemaining')} />
                <SortableHeader label={fcMoneyHeader(t('col.vins.cost'))} title={t('col.vins.cost')} state={sort.getState('cost')} onToggle={() => sort.toggle('cost')} />
                <SortableHeader label={t('col.vins.status')} title={t('col.vins.status')} state={sort.getState('status')} onToggle={() => sort.toggle('status')} />
                <th aria-label={t('a11y.open_row')} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr
                  key={r.id}
                  {...clickRow(() => openHistory(r))}
                  className={`xpl-row--click vins-row ${URGENCY_META[r.urgency].rowClass}`}
                  aria-label={t('a11y.vins.policy_details', { code: r.equipment?.code ?? r.equipmentId })}
                >
                  <td>
                    <span className="vins-code">{r.equipment?.code ?? r.equipmentId}</span>
                    {r.equipment?.name ? <span className="vins-sub">{r.equipment.name}</span> : null}
                  </td>
                  <td><span className="vins-policy-no">{r.policyNumber}</span></td>
                  <td>{r.insurerName}</td>
                  <td>{coverageLabel(t, r.coverageType)}</td>
                  <td style={{ whiteSpace: 'nowrap', color: 'var(--xpl-muted)' }}>{dateText(r.endDate)}</td>
                  <td><DaysCell days={r.daysRemaining} /></td>
                  <td><MoneyCell value={r.cost} /></td>
                  <td>{statusChip(t, r.status)}</td>
                  <Chevron />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TableShell>

      {viewing && (
        <Drawer
          title={`${t('sec.vins.history')} — ${viewing.equipment?.code ?? viewing.equipmentId}`}
          onClose={() => setViewing(null)}
          hero={
            <div className="xpl-drawer-hero">
              <div className="xpl-drawer-hero-icon">
                <span className="material-symbols-outlined" aria-hidden="true">shield</span>
              </div>
              <div className="xpl-drawer-hero-body">
                <span className="xpl-drawer-hero-title">{viewing.equipment?.code ?? viewing.equipmentId}</span>
                <span className="xpl-drawer-hero-sub">
                  {viewing.equipment?.name ?? ''} · {viewing.insurerName}
                </span>
                <div style={{ marginTop: 4 }}>{statusChip(t, viewing.status)}</div>
              </div>
            </div>
          }
          footer={
            <>
              {canCreate && (
                <Button variant="primary" icon="autorenew" onClick={() => openRenew(viewing)}>
                  {t('action.vins.renew')}
                </Button>
              )}
              {canUpdate && (
                <Button variant="secondary" icon="edit" onClick={() => openEdit(viewing)}>
                  {t('action.vins.edit_policy')}
                </Button>
              )}
              <Button variant="ghost" icon="car_crash" onClick={() => { const id = viewing.equipmentId; setViewing(null); onOpenAccidents(id); }}>
                {t('action.vins.open_accidents')}
              </Button>
            </>
          }
        >
          <DrawerSection title={t('sec.vins.current_policy')}>
            <DrawerField label={t('field.vins.policy_number')} value={viewing.policyNumber} mono />
            <DrawerField label={t('field.vins.insurer')} value={viewing.insurerName} />
            <DrawerField label={t('field.vins.coverage')} value={coverageLabel(t, viewing.coverageType)} />
            <DrawerField label={t('field.vins.start_date')} value={dateText(viewing.startDate)} />
            <DrawerField label={t('field.vins.end_date')} value={dateText(viewing.endDate)} />
            <DrawerField label={t('col.vins.days_remaining')} value={<DaysCell days={viewing.daysRemaining} />} />
            <DrawerField label={t('col.vins.status')} value={t(URGENCY_META[viewing.urgency].key)} />
            <DrawerField label={t('field.vins.cost')} value={<MoneyText value={viewing.cost} />} />
            <DrawerField label={t('field.vins.notes')} value={viewing.notes || '—'} />
          </DrawerSection>
          <DrawerSection title={t('sec.vins.history')}>
            {historyLoading ? (
              <SkeletonRows rows={3} withAvatar={false} />
            ) : history.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--xpl-muted)' }}>{t('empty.vins.history')}</p>
            ) : (
              <div className="vins-history-list">
                {history.map((h) => (
                  <div key={h.id} className={`vins-history-item${h.id === viewing.id ? ' vins-history-item--current' : ''}`}>
                    <div className="vins-history-head">
                      <span className="vins-policy-no">{h.policyNumber}</span>
                      {statusChip(t, h.status)}
                    </div>
                    <span className="vins-history-meta">
                      {h.insurerName} · {coverageLabel(t, h.coverageType)} · {dateText(h.startDate)} — {dateText(h.endDate)}
                    </span>
                    <span className="vins-history-meta"><MoneyText value={h.cost} /></span>
                    {h.notes ? <span className="vins-history-meta">{h.notes}</span> : null}
                  </div>
                ))}
              </div>
            )}
          </DrawerSection>
          <DrawerSection>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--xpl-muted)', lineHeight: 1.6 }}>
              {t('msg.vins.no_delete')}
            </p>
          </DrawerSection>
        </Drawer>
      )}

      {(showCreate || renewFor) && (
        <Dialog
          icon={renewFor ? 'autorenew' : 'add_moderator'}
          title={renewFor ? t('action.vins.renew') : t('action.vins.add_policy')}
          subtitle={t('msg.vins.renew_hint')}
          size="lg"
          onClose={() => { setShowCreate(false); setRenewFor(null); }}
          footer={
            <>
              <Button variant="primary" icon="save" type="submit" form="vins-policy-create" busy={saving}>{t('action.save')}</Button>
              <Button variant="ghost" onClick={() => { setShowCreate(false); setRenewFor(null); }}>{t('action.cancel')}</Button>
            </>
          }
        >
          {formError && <div className="xpl-form-error"><span className="material-symbols-outlined">error</span>{formError}</div>}
          <form id="vins-policy-create" onSubmit={submitCreate}>
            <PolicyFormBody form={form} setForm={setForm} equipmentList={equipmentList} lockEquipment={!!renewFor} />
            <input type="submit" hidden disabled={saving} />
          </form>
        </Dialog>
      )}

      {editPolicy && (
        <Dialog
          icon="edit"
          title={t('action.vins.edit_policy')}
          size="lg"
          onClose={() => setEditPolicy(null)}
          footer={
            <>
              <Button variant="primary" icon="save" type="submit" form="vins-policy-edit" busy={saving}>{t('action.save')}</Button>
              <Button variant="ghost" onClick={() => setEditPolicy(null)}>{t('action.cancel')}</Button>
            </>
          }
        >
          {formError && <div className="xpl-form-error"><span className="material-symbols-outlined">error</span>{formError}</div>}
          <form id="vins-policy-edit" onSubmit={submitEdit}>
            {/* المعدة مقفلة: نقل وثيقة بين مركبتين ليس تصحيحًا كتابيًا، والخادم يرفضه أصلًا. */}
            <PolicyFormBody form={form} setForm={setForm} equipmentList={equipmentList} lockEquipment />
            <input type="submit" hidden disabled={saving} />
          </form>
        </Dialog>
      )}
    </>
  );
}

// ── Accidents tab ─────────────────────────────────────────────────────────────

const EMPTY_ACCIDENT_FORM = {
  equipmentId: '',
  plateNumber: '',
  accidentDate: '',
  description: '',
  repairCost: '',
  notes: '',
};
type AccidentForm = typeof EMPTY_ACCIDENT_FORM;

function AccidentFormBody({
  form,
  setForm,
  equipmentList,
  lockEquipment,
}: {
  form: AccidentForm;
  setForm: (f: AccidentForm) => void;
  equipmentList: EquipmentBrief[];
  lockEquipment: boolean;
}) {
  const { t } = useT();
  return (
    <>
      <EquipmentSelect
        value={form.equipmentId}
        plate={form.plateNumber}
        equipmentList={equipmentList}
        disabled={lockEquipment}
        onChange={(id, plate) => setForm({ ...form, equipmentId: id, plateNumber: plate })}
      />
      <DialogSection title={t('sec.vins.accident_data')} icon="car_crash">
        <div className="xpl-field">
          <label>{t('field.vins.accident_date')} <span className="req">*</span></label>
          <DateInput
            className="xpl-input"
            value={form.accidentDate}
            onChange={(v) => setForm({ ...form, accidentDate: v })}
            ariaLabel={t('field.vins.accident_date')}
          />
        </div>
        <div className="xpl-field">
          <label>{t('field.vins.repair_cost')}</label>
          <input
            className="xpl-input"
            type="number"
            min="0"
            step="0.001"
            value={form.repairCost}
            onChange={(e) => setForm({ ...form, repairCost: e.target.value })}
            style={{ direction: 'ltr' }}
            aria-label={t('field.vins.repair_cost')}
          />
        </div>
        <div className="xpl-field xpl-field--full">
          <label>{t('field.vins.description')} <span className="req">*</span></label>
          <textarea
            className="xpl-textarea"
            required
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            aria-label={t('field.vins.description')}
          />
        </div>
        <div className="xpl-field xpl-field--full">
          <label>{t('field.vins.notes')}</label>
          <textarea
            className="xpl-textarea"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            aria-label={t('field.vins.notes')}
          />
        </div>
      </DialogSection>
    </>
  );
}

function accidentSortValue(row: Accident, key: string): unknown {
  if (key === 'equipment') return row.equipment?.code ?? '';
  return (row as unknown as Record<string, unknown>)[key];
}

function AccidentsTab({
  equipmentList,
  filterEquip,
  setFilterEquip,
  onChanged,
}: {
  equipmentList: EquipmentBrief[];
  filterEquip: string;
  setFilterEquip: (v: string) => void;
  onChanged: () => void;
}) {
  const { t } = useT();
  const { hasPermission } = useAuth();
  const [rows, setRows] = useState<Accident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = usePersistedState('vins:accidents:search', '');
  const sort = useTableSort('vehicle-insurance-accidents');

  const [viewing, setViewing] = useState<Accident | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editAccident, setEditAccident] = useState<Accident | null>(null);
  const [form, setForm] = useState<AccidentForm>(EMPTY_ACCIDENT_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string> = {};
      if (filterEquip) params.equipmentId = filterEquip;
      const res = await api.get('/vehicle-insurance/accidents', { params });
      setRows(res.data.data ?? []);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [filterEquip]);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        (r.equipment?.code ?? '').toLowerCase().includes(q) ||
        (r.equipment?.name ?? '').toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const sorted = useMemo(
    () => sortRowsClient(visible, sort.sortBy, sort.sortDir, accidentSortValue),
    [visible, sort.sortBy, sort.sortDir],
  );

  function openCreate() {
    const eq = equipmentList.find((x) => String(x.id) === filterEquip);
    setForm({
      ...EMPTY_ACCIDENT_FORM,
      equipmentId: filterEquip,
      plateNumber: eq?.plateNumber ?? '',
    });
    setFormError('');
    setShowCreate(true);
  }

  function openEdit(a: Accident) {
    setForm({
      equipmentId: String(a.equipmentId),
      plateNumber: a.equipment?.plateNumber ?? '',
      accidentDate: a.accidentDate.slice(0, 10),
      description: a.description,
      repairCost: a.repairCost != null ? String(a.repairCost) : '',
      notes: a.notes ?? '',
    });
    setFormError('');
    setEditAccident(a);
  }

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      await api.post('/vehicle-insurance/accidents', {
        equipmentId: Number(form.equipmentId),
        accidentDate: form.accidentDate,
        description: form.description,
        ...(form.repairCost ? { repairCost: Number(form.repairCost) } : {}),
        ...(form.notes ? { notes: form.notes } : {}),
      });
      setShowCreate(false);
      onChanged();
      await load();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editAccident) return;
    setSaving(true);
    setFormError('');
    try {
      await api.patch(`/vehicle-insurance/accidents/${editAccident.id}`, {
        accidentDate: form.accidentDate,
        description: form.description,
        repairCost: form.repairCost ? Number(form.repairCost) : null,
        notes: form.notes ? form.notes : null,
      });
      setEditAccident(null);
      setViewing(null);
      onChanged();
      await load();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const canCreate = hasPermission('vehicleInsurance.create');
  const canUpdate = hasPermission('vehicleInsurance.update');

  return (
    <>
      <div className="xpl-toolbar xpl-toolbar--sticky">
        <div className="xpl-toolbar-row">
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder={t('search.placeholder')}
            ariaLabel={t('search.placeholder')}
          />
          <div className="xpl-field" style={{ minWidth: 190 }}>
            <span className="xpl-field-label">{t('filter.all_equipment')}</span>
            <select
              className="xpl-select"
              aria-label={t('filter.all_equipment')}
              value={filterEquip}
              onChange={(e) => setFilterEquip(e.target.value)}
            >
              <option value="">{t('filter.all_equipment')}</option>
              {equipmentList.map((eq) => (
                <option key={eq.id} value={eq.id}>
                  {eq.code}{eq.name ? ` — ${eq.name}` : ''}
                </option>
              ))}
            </select>
          </div>
          <Button variant="ghost" icon="refresh" busy={loading} onClick={load}>{t('action.refresh')}</Button>
          {canCreate && (
            <Button variant="primary" icon="add" onClick={openCreate}>{t('action.vins.add_accident')}</Button>
          )}
        </div>
      </div>

      {error && <ErrorBanner>{error}</ErrorBanner>}
      <Hint>{t('msg.vins.no_delete')}</Hint>

      <TableShell
        loading={loading}
        empty={
          !loading && visible.length === 0 && (
            <EmptyState
              icon="car_crash"
              tone="neutral"
              title={t('empty.vins.accidents')}
              action={canCreate ? <Button variant="primary" icon="add" onClick={openCreate}>{t('action.vins.add_accident')}</Button> : undefined}
            />
          )
        }
      >
        <div className="xpl-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
          <table className="xpl-table">
            <thead>
              <tr>
                <SortableHeader label={t('col.vins.equipment')} title={t('col.vins.equipment')} state={sort.getState('equipment')} onToggle={() => sort.toggle('equipment')} />
                <SortableHeader label={t('col.vins.accident_date')} title={t('col.vins.accident_date')} state={sort.getState('accidentDate')} onToggle={() => sort.toggle('accidentDate')} />
                <SortableHeader label={t('col.vins.description')} title={t('col.vins.description')} state={sort.getState('description')} onToggle={() => sort.toggle('description')} />
                <SortableHeader label={fcMoneyHeader(t('col.vins.repair_cost'))} title={t('col.vins.repair_cost')} state={sort.getState('repairCost')} onToggle={() => sort.toggle('repairCost')} />
                <SortableHeader label={t('col.notes')} title={t('col.notes')} state={sort.getState('notes')} onToggle={() => sort.toggle('notes')} />
                <th aria-label={t('a11y.open_row')} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr
                  key={r.id}
                  {...clickRow(() => setViewing(r))}
                  className="xpl-row--click"
                  aria-label={t('a11y.vins.accident_details', { code: r.equipment?.code ?? r.equipmentId })}
                >
                  <td>
                    <span className="vins-code">{r.equipment?.code ?? r.equipmentId}</span>
                    {r.equipment?.name ? <span className="vins-sub">{r.equipment.name}</span> : null}
                  </td>
                  <td style={{ whiteSpace: 'nowrap', color: 'var(--xpl-muted)' }}>{dateText(r.accidentDate)}</td>
                  <td><span className="vins-desc">{r.description}</span></td>
                  <td>{r.repairCost != null ? <MoneyCell value={r.repairCost} /> : '—'}</td>
                  <td><span className="vins-desc">{r.notes || '—'}</span></td>
                  <Chevron />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TableShell>

      {viewing && (
        <Drawer
          title={`${t('tab.vins.accidents')} — ${viewing.equipment?.code ?? viewing.equipmentId}`}
          onClose={() => setViewing(null)}
          hero={
            <div className="xpl-drawer-hero">
              <div className="xpl-drawer-hero-icon">
                <span className="material-symbols-outlined" aria-hidden="true">car_crash</span>
              </div>
              <div className="xpl-drawer-hero-body">
                <span className="xpl-drawer-hero-title">{viewing.equipment?.code ?? viewing.equipmentId}</span>
                <span className="xpl-drawer-hero-sub">{dateText(viewing.accidentDate)}</span>
              </div>
            </div>
          }
          footer={
            canUpdate ? (
              <Button variant="primary" icon="edit" onClick={() => { openEdit(viewing); setViewing(null); }}>
                {t('action.vins.edit_accident')}
              </Button>
            ) : undefined
          }
        >
          <DrawerSection title={t('sec.vins.accident_data')}>
            <DrawerField label={t('field.vins.accident_date')} value={dateText(viewing.accidentDate)} />
            <DrawerField
              label={t('field.vins.repair_cost')}
              value={viewing.repairCost != null ? <MoneyText value={viewing.repairCost} /> : '—'}
            />
            <DrawerField label={t('col.created_at')} value={dateText(viewing.createdAt)} />
          </DrawerSection>
          <DrawerSection title={t('field.vins.description')}>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', color: 'var(--xpl-text)' }}>
              {viewing.description}
            </p>
          </DrawerSection>
          {viewing.notes ? (
            <DrawerSection title={t('field.vins.notes')}>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', color: 'var(--xpl-text)' }}>
                {viewing.notes}
              </p>
            </DrawerSection>
          ) : null}
        </Drawer>
      )}

      {showCreate && (
        <Dialog
          icon="car_crash"
          title={t('action.vins.add_accident')}
          size="lg"
          onClose={() => setShowCreate(false)}
          footer={
            <>
              <Button variant="primary" icon="save" type="submit" form="vins-accident-create" busy={saving}>{t('action.save')}</Button>
              <Button variant="ghost" onClick={() => setShowCreate(false)}>{t('action.cancel')}</Button>
            </>
          }
        >
          {formError && <div className="xpl-form-error"><span className="material-symbols-outlined">error</span>{formError}</div>}
          <form id="vins-accident-create" onSubmit={submitCreate}>
            <AccidentFormBody form={form} setForm={setForm} equipmentList={equipmentList} lockEquipment={false} />
            <input type="submit" hidden disabled={saving} />
          </form>
        </Dialog>
      )}

      {editAccident && (
        <Dialog
          icon="edit"
          title={t('action.vins.edit_accident')}
          size="lg"
          onClose={() => setEditAccident(null)}
          footer={
            <>
              <Button variant="primary" icon="save" type="submit" form="vins-accident-edit" busy={saving}>{t('action.save')}</Button>
              <Button variant="ghost" onClick={() => setEditAccident(null)}>{t('action.cancel')}</Button>
            </>
          }
        >
          {formError && <div className="xpl-form-error"><span className="material-symbols-outlined">error</span>{formError}</div>}
          <form id="vins-accident-edit" onSubmit={submitEdit}>
            {/* المعدة مقفلة عند التصحيح — الخادم لا يقبل نقل حادث بين مركبتين. */}
            <AccidentFormBody form={form} setForm={setForm} equipmentList={equipmentList} lockEquipment />
            <input type="submit" hidden disabled={saving} />
          </form>
        </Dialog>
      )}
    </>
  );
}
