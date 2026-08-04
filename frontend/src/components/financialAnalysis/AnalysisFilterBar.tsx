import { useEffect, useState } from 'react';
import { useFinancialPeriod } from '../../context/FinancialPeriodContext';
import { displayDate, toLocalDateString, type FinancialPeriodPreset } from '../../lib/financialPeriod';
import DateInput from '../DateInput';
import { Button, Icon } from '../explorer/ExplorerKit';
import { useT } from '../../lib/i18n';

/* ════════════════════════════════════════════════════════════════════════════
   فلتر مركز التحليل المالي — **الوحيد في الصفحة**، ويُطبَّق على الأقسام السبعة معًا.

   لا يُنشئ مفهوم فترة ثانيًا: يقود **الفترة المالية العامة** نفسها التي تتبعها
   بقية الشاشات المالية (`FinancialPeriodContext`). لذلك حين يفتح المستخدم
   مستعرض الفواتير أو المصروفات من نافذة التفصيل يجد النطاق الزمني نفسه مطبَّقًا
   هناك — «نفس الفلاتر» حرفيًا، بلا تمرير معطيات بين الصفحات.

   بطاقة «الفترة المختارة» تظهر هنا فقط، مرّة واحدة، ولا تتكرّر في أي قسم.
   ════════════════════════════════════════════════════════════════════════════ */

/** أقدم سنة قابلة للاختيار — نفس حدّ `PeriodControl` المعتمد في المشروع. */
const MIN_YEAR = 2020;

const PRESET_OPTIONS: { key: FinancialPeriodPreset; labelKey: string }[] = [
  { key: 'year-to-date', labelKey: 'fc.period.year_to_date' },
  { key: 'current-year', labelKey: 'fc.period.current_year' },
  { key: 'previous-year', labelKey: 'fc.period.previous_year' },
  { key: 'current-month', labelKey: 'fc.period.current_month' },
  { key: 'previous-month', labelKey: 'fc.period.previous_month' },
  { key: 'custom', labelKey: 'fac.filter.custom' },
  { key: 'all', labelKey: 'fc.period.all' },
];

const MONTH_INDEXES = Array.from({ length: 12 }, (_, i) => i);

interface AnalysisFilterBarProps {
  onRefresh: () => void;
  busy?: boolean;
}

export default function AnalysisFilterBar({ onRefresh, busy = false }: AnalysisFilterBarProps) {
  const { t } = useT();
  const { period, setPreset, setYear, setMonth, setCustomRange } = useFinancialPeriod();

  const maxYear = new Date().getFullYear();
  const years = Array.from({ length: maxYear - MIN_YEAR + 1 }, (_, i) => maxYear - i);
  const activeYear = period.selectedYear ?? (period.toDate ? Number(period.toDate.slice(0, 4)) : maxYear);

  // حقلا النطاق المخصص يتبعان الفترة الملتزَم بها، فلا يبقيان على قيم فترة سابقة
  // بعد تغيير الـ preset من حولهما (نفس العيب الذي عولج في `PeriodControl`).
  const [customFrom, setCustomFrom] = useState(period.fromDate ?? '');
  const [customTo, setCustomTo] = useState(period.toDate ?? '');
  useEffect(() => {
    setCustomFrom(period.fromDate ?? '');
    setCustomTo(period.toDate ?? '');
  }, [period.fromDate, period.toDate]);

  const isCustom = period.preset === 'custom';
  const isAll = period.isAllPeriods;

  function applyCustom(from: string, to: string) {
    setCustomFrom(from);
    setCustomTo(to);
    if (from && to && from <= to) setCustomRange(from, to);
  }

  function handlePreset(value: string) {
    const preset = value as FinancialPeriodPreset;
    // «فترة مخصصة» تُبذَر بالنطاق المعروض حاليًا ليُعدِّله المستخدم من الحقلين.
    // قادمًا من «كل الفترات» لا يوجد نطاق معروض، فنبدأ من السنة الحالية حتى اليوم
    // بدل ألّا يستجيب الاختيار إطلاقًا.
    if (preset === 'custom') {
      const today = new Date();
      const from = period.fromDate ?? `${today.getFullYear()}-01-01`;
      const to = period.toDate ?? toLocalDateString(today);
      setCustomRange(from, to);
      return;
    }
    setPreset(preset);
  }

  function handleYear(value: string) {
    const year = Number(value);
    if (!Number.isFinite(year)) return;
    if (period.preset === 'month' && period.selectedMonth != null) setMonth(year, period.selectedMonth);
    else setYear(year);
  }

  function handleMonth(value: string) {
    if (value === '') setYear(activeYear);
    else setMonth(activeYear, Number(value));
  }

  return (
    /* `no-print` هو الوسم الذي يستبعده مُركِّب PDF (`stripSelectors`) — قسم الفلاتر
       وحده يُحذف من الملف المُصدَّر، وبطاقة الفترة المختارة معه لأنها جزء منه. */
    <div className="xpl-toolbar fac-filter no-print" role="search" aria-label={t('fac.filter.aria')}>
      <div className="xpl-toolbar-row fac-filter-row">
        <Button variant="primary" icon="refresh" busy={busy} onClick={onRefresh}>
          {t('fac.filter.refresh')}
        </Button>

        <label className="xpl-field fac-filter-field">
          <span className="xpl-field-label">{t('fac.filter.year')}</span>
          <select
            className="xpl-select"
            value={String(activeYear)}
            onChange={(e) => handleYear(e.target.value)}
            disabled={isAll}
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </label>

        <label className="xpl-field fac-filter-field">
          <span className="xpl-field-label">{t('fac.filter.month')}</span>
          <select
            className="xpl-select"
            value={period.preset === 'month' && period.selectedMonth != null ? String(period.selectedMonth) : ''}
            onChange={(e) => handleMonth(e.target.value)}
            disabled={isAll}
          >
            <option value="">{t('fac.filter.all_months')}</option>
            {MONTH_INDEXES.map((m) => (
              <option key={m} value={m}>{t(`fc.period.month_${m + 1}`)}</option>
            ))}
          </select>
        </label>

        <label className="xpl-field fac-filter-field">
          <span className="xpl-field-label">{t('fac.filter.period')}</span>
          <select className="xpl-select" value={period.preset} onChange={(e) => handlePreset(e.target.value)}>
            {PRESET_OPTIONS.map((p) => (
              <option key={p.key} value={p.key}>{t(p.labelKey)}</option>
            ))}
            {/* أوضاع لا أزرار لها لكنها قابلة للاستعادة من جلسة سابقة — تُعرض ولا تُخفى. */}
            {(period.preset === 'year' || period.preset === 'month') && (
              <option value={period.preset}>{period.label}</option>
            )}
          </select>
        </label>

        <label className="xpl-field fac-filter-field">
          <span className="xpl-field-label">{t('fac.filter.from')}</span>
          <DateInput
            value={customFrom}
            max={customTo || undefined}
            disabled={isAll}
            className="xpl-input"
            ariaLabel={t('fac.filter.from')}
            onChange={(v) => applyCustom(v, customTo)}
          />
        </label>

        <label className="xpl-field fac-filter-field">
          <span className="xpl-field-label">{t('fac.filter.to')}</span>
          <DateInput
            value={customTo}
            min={customFrom || undefined}
            disabled={isAll}
            className="xpl-input"
            ariaLabel={t('fac.filter.to')}
            onChange={(v) => applyCustom(customFrom, v)}
          />
        </label>

        {/* بطاقة الفترة المختارة — مرّة واحدة في الصفحة كلها. */}
        <div className={`fac-period-card${isCustom ? ' fac-period-card--custom' : ''}`}>
          <span className="fac-period-card-head">
            <Icon name="calendar_month" />
            {t('fac.period.selected')}
          </span>
          {isAll ? (
            <span className="fac-period-card-range">{t('fc.period.all')}</span>
          ) : (
            <>
              <span className="fac-period-card-range">{displayDate(period.fromDate)}</span>
              <span className="fac-period-card-sep" aria-hidden="true" />
              <span className="fac-period-card-range">{displayDate(period.toDate)}</span>
            </>
          )}
          <span className="fac-period-card-days">{period.label}</span>
        </div>
      </div>
    </div>
  );
}
