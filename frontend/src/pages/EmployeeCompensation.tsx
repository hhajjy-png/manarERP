/**
 * مستحقات الموظف الشهرية — قائمة الموظفين.
 *
 * أول شاشة في التدفق: **قائمة الموظفين → ملف الموظف → ١٢ شهرًا → حسبة الشهر**.
 * لا رسوم بيانية ولا لوحة مؤشّرات: الأولوية للوضوح وسرعة الوصول إلى موظف بعينه.
 *
 * كل الأرقام المعروضة تصل محسوبة من الخادم؛ لا معادلة واحدة في هذا الملف.
 *
 * جذر الصفحة يحمل `xpl-scope` — وهو ما يحمل توكينات ExplorerKit التي تُلوِّن الأزرار.
 * إسقاطه (كما وقع في النسخة الأولى) يجعل `--xpl-primary` غير معرَّف فتُرسَم الأزرار
 * الأساسية بخلفية شفافة ونصّ أبيض: **أبيض على أبيض**. لا تُزله.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { compensationApi } from '../employee-compensation/api';
import CompanyOvertimeRateDialog from '../employee-compensation/CompanyOvertimeRateDialog';
import { monthNameAr, selectableYears } from '../employee-compensation/labels';
import type { EmployeeSummary } from '../employee-compensation/types';
import {
  Button,
  EmptyState,
  ErrorBanner,
  ExecutiveHeader,
  FilterChip,
  IdChip,
  MetricCard,
  SearchBox,
  SectionCard,
  SkeletonRows,
  StatusChip,
} from '../components/explorer/ExplorerKit';
import '../components/explorer/explorer-kit.css';
import './EmployeeCompensation.css';
import { kd as money } from '../employee-compensation/units';
import { useT } from '../lib/i18n';
import { useAuth } from '../stores/authStore';

type StatusFilter = 'ACTIVE' | 'ALL';

/** شارة تقدّم الأشهر — «٨ / ١٢» مع شريط رفيع يقرأه المستخدم بلمحة واحدة. */
function MonthsProgress({ done }: { done: number }) {
  const tone = done === 0 ? '' : done >= 12 ? ' ecmp-progress--full' : ' ecmp-progress--partial';
  return (
    <span className={`ecmp-progress${tone}`}>
      <span className="ecmp-progress-bar" aria-hidden="true">
        <span style={{ width: `${Math.min(100, (done / 12) * 100)}%` }} />
      </span>
      {done} / 12
    </span>
  );
}

export default function EmployeeCompensation() {
  const { t } = useT();
  const navigate = useNavigate();
  const years = useMemo(() => selectableYears(), []);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ACTIVE');
  const [rows, setRows] = useState<EmployeeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rateDialogOpen, setRateDialogOpen] = useState(false);
  const { hasPermission } = useAuth();

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    compensationApi
      .listSummaries({ year, status: statusFilter })
      .then((res) => setRows(res.employees))
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }, [year, statusFilter]);

  useEffect(load, [load]);

  /**
   * البحث يُصفّى **محليًا** لا بطلب لكل حرف.
   * القائمة هي موظفو الشركة — عشرات لا آلاف — وقد وصلت كاملة بالفعل. إرسال طلب لكل
   * ضغطة مفتاح كان سيضيف تأخيرًا ملموسًا بلا أي مكسب.
   */
  const filtered = useMemo(() => {
    const q = search.trim();
    if (!q) return rows;
    return rows.filter((r) => r.fullName.includes(q) || r.code.includes(q));
  }, [rows, search]);

  const totals = useMemo(
    () => ({
      employees: filtered.length,
      withCalculations: filtered.filter((r) => r.completedMonths > 0).length,
      completedMonths: filtered.reduce((s, r) => s + r.completedMonths, 0),
      // إجمالي عرضي داخل هذه الوحدة فقط — لا يُرحَّل إلى أي وحدة مالية.
      yearNet: filtered.reduce((s, r) => s + r.yearNetTotal, 0),
    }),
    [filtered],
  );

  return (
    <div className="xpl-scope xpl-page ecmp-page">
      <ExecutiveHeader
        icon="request_quote"
        title={t('ecmp.title')}
        subtitle={t('ecmp.subtitle')}
        chips={
          <>
            <IdChip icon="calendar_month" tone="indigo">{year}</IdChip>
            <IdChip icon="groups">{t('ecmp.list.employees_count', { count: totals.employees })}</IdChip>
          </>
        }
        aside={
          <div className="ecmp-header-aside">
            <div className="ecmp-year-switch">
              <label htmlFor="ecmp-year">{t('ecmp.year')}</label>
              <select id="ecmp-year" value={year} onChange={(e) => setYear(Number(e.target.value))}>
                {years.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            {/* إعدادات الوحدة — حوار مضغوط لا صفحة إعدادات ثانية (المتطلب ١٨). */}
            <Button icon="tune" onClick={() => setRateDialogOpen(true)}>
              {t('ecmp.rate.open_settings')}
            </Button>
          </div>
        }
      />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <div className="ecmp-metrics">
        <MetricCard icon="groups" tone="indigo" label={t('ecmp.list.metric.employees')} value={totals.employees} />
        <MetricCard icon="fact_check" tone="blue" label={t('ecmp.list.metric.with_calcs')} value={totals.withCalculations} />
        <MetricCard icon="event_available" tone="green" label={t('ecmp.list.metric.months')} value={totals.completedMonths} />
        <MetricCard
          icon="payments"
          tone="orange"
          label={t('ecmp.list.metric.year_net')}
          value={money(totals.yearNet)}
          sub={t('ecmp.module_only_note')}
        />
      </div>

      <SectionCard
        title={t('ecmp.list.section')}
        icon="badge"
        actions={
          <div className="ecmp-toolbar">
            <SearchBox value={search} onChange={setSearch} placeholder={t('ecmp.list.search_ph')} />
            <FilterChip active={statusFilter === 'ACTIVE'} onClick={() => setStatusFilter('ACTIVE')} icon="how_to_reg">
              {t('ecmp.filter.active')}
            </FilterChip>
            <FilterChip active={statusFilter === 'ALL'} onClick={() => setStatusFilter('ALL')} icon="groups">
              {t('ecmp.filter.all')}
            </FilterChip>
          </div>
        }
        padded={false}
      >
        {loading ? (
          <div className="xpl-card--pad"><SkeletonRows rows={6} /></div>
        ) : filtered.length === 0 ? (
          <EmptyState icon="person_search" title={t('ecmp.list.empty')} message={t('ecmp.list.empty_hint')} />
        ) : (
          <div className="ecmp-table-wrap">
            <table className="ecmp-table">
              <thead>
                <tr>
                  <th>{t('ecmp.col.employee')}</th>
                  <th>{t('ecmp.col.code')}</th>
                  <th>{t('ecmp.col.job_title')}</th>
                  <th>{t('ecmp.col.emp_status')}</th>
                  <th className="ecmp-col-num">{t('ecmp.col.basic_salary')}</th>
                  <th>{t('ecmp.col.months_done')}</th>
                  <th>{t('ecmp.col.last_month')}</th>
                  <th className="ecmp-col-num">{t('ecmp.col.year_net')}</th>
                  <th aria-label={t('ecmp.col.actions')} />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} onDoubleClick={() => navigate(`/employee-compensation/${r.id}/${year}`)}>
                    <td className="ecmp-name">{r.fullName}</td>
                    <td className="ecmp-mono">{r.code}</td>
                    <td>{r.jobTitle ?? '—'}</td>
                    <td>
                      <StatusChip tone={r.status === 'ACTIVE' ? 'green' : r.status === 'ON_LEAVE' ? 'orange' : 'neutral'}>
                        {t(`ecmp.emp_status.${r.status}`)}
                      </StatusChip>
                    </td>
                    <td className="ecmp-money">{money(r.currentBasicSalary)}</td>
                    <td><MonthsProgress done={r.completedMonths} /></td>
                    <td>{r.lastCalculatedMonth ? monthNameAr(r.lastCalculatedMonth) : '—'}</td>
                    <td className="ecmp-money">{r.completedMonths > 0 ? money(r.yearNetTotal) : '—'}</td>
                    <td className="ecmp-row-action">
                      {/* الإجراء الأساسي للصف — Primary صريح، لا زر باهت يُقرأ معطَّلًا. */}
                      <Button
                        small
                        variant="primary"
                        icon="folder_open"
                        onClick={() => navigate(`/employee-compensation/${r.id}/${year}`)}
                      >
                        {t('ecmp.action.open_file')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {rateDialogOpen && (
        <CompanyOvertimeRateDialog
          canEdit={hasPermission('employeeCompensation.update')}
          onClose={() => setRateDialogOpen(false)}
        />
      )}
    </div>
  );
}
