import { useState } from 'react';
import { useFinancialPeriod } from '../../context/FinancialPeriodContext';
import { displayDate, buildLocalizedPeriodLabel, type FinancialPeriodPreset } from '../../lib/financialPeriod';
import DateInput from '../DateInput';
import { useT } from '../../lib/i18n';
import './period-control.css';

/**
 * عنصر التحكم بالفترة المالية العامة.
 *
 * يعرض الفترة النشطة بوضوح، ويتيح اختيار preset أو سنة أو نطاق مخصص أو كل الفترات،
 * مع زر رجوع سريع للسنة الحالية. أرقام غربية، تواريخ DD/MM/YYYY، ودعم Dark Mode
 * عبر توكنات الثيم (لا ألوان ثابتة). لا يعيد تصميم الهيدر العام — عنصر مستقل يُدرَج
 * في أعلى الصفحات المتأثرة.
 */

const PRESETS: { key: FinancialPeriodPreset; labelKey: string }[] = [
  { key: 'year-to-date',   labelKey: 'fc.period.year_to_date' },
  { key: 'current-year',   labelKey: 'fc.period.current_year' },
  { key: 'previous-year',  labelKey: 'fc.period.previous_year' },
  { key: 'current-month',  labelKey: 'fc.period.current_month' },
  { key: 'previous-month', labelKey: 'fc.period.previous_month' },
  { key: 'all',            labelKey: 'fc.period.all' },
];

/** أقدم سنة قابلة للاختيار — نفس حدّ قائمة السنوات التي حلّت أزرار الأشهر محلّها. */
const MIN_YEAR = 2020;

/** الأشهر مُفهرَسة من الصفر (0 = يناير) — نفس عقد `Date.getMonth()` و`selectedMonth`. */
const MONTH_INDEXES = Array.from({ length: 12 }, (_, i) => i);

function clampYear(year: number, maxYear: number): number {
  return Math.min(Math.max(year, MIN_YEAR), maxYear);
}

interface PeriodControlProps {
  /** When true, the summary label omits the "Period Shown:" prefix and shows only the bare date range — scoped opt-in for pages with tighter header space. Defaults to false (unchanged behavior). */
  hideLabelPrefix?: boolean;
}

export default function PeriodControl({ hideLabelPrefix = false }: PeriodControlProps) {
  const { t } = useT();
  const { period, setPreset, setMonth, setCustomRange, resetToCurrentYear } = useFinancialPeriod();
  const [open, setOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(period.fromDate ?? '');
  const [customTo, setCustomTo] = useState(period.toDate ?? '');

  // ── سنة أزرار الأشهر ────────────────────────────────────────────────────────
  // أزرار الأشهر تحتاج سنةً تعمل عليها، والفترة النشطة هي مصدرها الطبيعي: سنة
  // مختارة صراحةً إن وُجدت، وإلا سنة نهاية النطاق المعروض (فـ«السنة السابقة»
  // تفتح على 2025 لا 2026)، وإلا السنة الحالية. السهمان يغطّيان ما لا تصله
  // الفترة النشطة — فتبقى أشهر السنوات التاريخية (أغسطس 2024 مثلًا) قابلة
  // للوصول بعد زوال أزرار «سنة محددة».
  const maxYear = new Date().getFullYear();
  const periodYear = period.selectedYear
    ?? (period.toDate ? Number(period.toDate.slice(0, 4)) : maxYear);
  const [monthYear, setMonthYear] = useState(() => clampYear(periodYear, maxYear));

  // إعادة البذر عند **الفتح** فقط — لا `useEffect` على الفترة: فتح اللوحة يعرض
  // سنة الفترة النشطة وحدودها، بينما التنقّل بالسهمين أو تحرير الحقول داخل جلسة
  // فتح واحدة يبقى كما تركه المستخدم بدل أن يُدهَس عند كل إعادة رسم.
  //
  // حقلا النطاق المخصص كانا يُبذران في `useState` وحده — أي مرة واحدة عند تركيب
  // العنصر. والعنصر يبقى مركّبًا بينما تتغيّر الفترة المشتركة من حوله (preset،
  // شهر، إعادة تعيين)، فتبقى الحقول على قيم فترةٍ قديمة و«تطبيق» يلتزم بها.
  // البذر عند الفتح يربطهما بالفترة **المُلتزَم بها حاليًا** بلا مزامنة مستمرة.
  const toggleOpen = () => {
    if (!open) {
      setMonthYear(clampYear(periodYear, maxYear));
      setCustomFrom(period.fromDate ?? '');
      setCustomTo(period.toDate ?? '');
    }
    setOpen((v) => !v);
  };

  const applyCustom = () => {
    if (customFrom && customTo && customFrom <= customTo) {
      setCustomRange(customFrom, customTo);
      setOpen(false);
    }
  };

  const stateClass = period.isAllPeriods
    ? 'period-control--all'
    : period.isHistorical
      ? 'period-control--historical'
      : 'period-control--current';

  return (
    <div className={`period-control ${stateClass}`}>
      <button
        type="button"
        className="period-control__summary"
        onClick={toggleOpen}
        aria-expanded={open}
        aria-label={t('fc.period.select_aria')}
      >
        <span className="material-symbols-outlined period-control__icon" aria-hidden>calendar_month</span>
        <span className="period-control__label">{buildLocalizedPeriodLabel(period, t, hideLabelPrefix)}</span>
        {period.isAllPeriods && <span className="period-control__badge period-control__badge--all">{t('fc.period.all')}</span>}
        {period.isHistorical && <span className="period-control__badge period-control__badge--hist">{t('fc.period.previous_year_badge')}</span>}
        <span className="material-symbols-outlined period-control__chevron" aria-hidden>
          {open ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      {open && (
        <>
          <div className="period-control__overlay" onClick={() => setOpen(false)} aria-hidden />
          <div className="period-control__panel" role="dialog" aria-label={t('fc.period.dialog_aria')}>
            <div className="period-control__section-title">{t('fc.period.section_presets')}</div>
            <div className="period-control__presets">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  className={`period-control__preset ${period.preset === p.key ? 'is-active' : ''} ${
                    p.key === 'all' ? 'period-control__preset--all' : ''
                  }`}
                  onClick={() => { setPreset(p.key); setOpen(false); }}
                >
                  {t(p.labelKey)}
                </button>
              ))}
            </div>

            <div className="period-control__section-head">
              <span className="period-control__section-title">{t('fc.period.section_month')}</span>
              <span className="period-control__year-nav">
                <button
                  type="button"
                  className="period-control__year-step"
                  onClick={() => setMonthYear((y) => Math.max(MIN_YEAR, y - 1))}
                  disabled={monthYear <= MIN_YEAR}
                  aria-label={t('fc.period.prev_year')}
                  title={t('fc.period.prev_year')}
                >
                  <span className="material-symbols-outlined" aria-hidden>chevron_right</span>
                </button>
                <span className="period-control__year-value">{monthYear}</span>
                <button
                  type="button"
                  className="period-control__year-step"
                  onClick={() => setMonthYear((y) => Math.min(maxYear, y + 1))}
                  disabled={monthYear >= maxYear}
                  aria-label={t('fc.period.next_year')}
                  title={t('fc.period.next_year')}
                >
                  <span className="material-symbols-outlined" aria-hidden>chevron_left</span>
                </button>
              </span>
            </div>
            <div className="period-control__months">
              {MONTH_INDEXES.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`period-control__month ${
                    period.preset === 'month' && period.selectedYear === monthYear && period.selectedMonth === m
                      ? 'is-active'
                      : ''
                  }`}
                  onClick={() => { setMonth(monthYear, m); setOpen(false); }}
                >
                  {t(`fc.period.month_${m + 1}`)}
                </button>
              ))}
            </div>

            <div className="period-control__section-title">{t('fc.period.section_custom')}</div>
            <div className="period-control__custom">
              <label className="period-control__field">
                <span>{t('fc.period.from')}</span>
                <DateInput value={customFrom} max={customTo || undefined} onChange={setCustomFrom} />
              </label>
              <label className="period-control__field">
                <span>{t('fc.period.to')}</span>
                <DateInput value={customTo} min={customFrom || undefined} onChange={setCustomTo} />
              </label>
              <button
                type="button"
                className="period-control__apply"
                disabled={!customFrom || !customTo || customFrom > customTo}
                onClick={applyCustom}
              >
                {t('fc.period.apply')}
              </button>
            </div>

            {period.isAllPeriods && (
              <div className="period-control__warning" role="note">
                <span className="material-symbols-outlined" aria-hidden>warning</span>
                {t('fc.period.warn_all_mixed')}
              </div>
            )}
            {period.isHistorical && !period.isAllPeriods && (
              <div className="period-control__warning period-control__warning--hist" role="note">
                <span className="material-symbols-outlined" aria-hidden>history</span>
                {t('fc.period.warn_historical', { year: period.toDate ? period.toDate.slice(0, 4) : '' })}
              </div>
            )}

            <div className="period-control__footer">
              <span className="period-control__range">
                {period.isAllPeriods
                  ? t('fc.period.all')
                  : `${displayDate(period.fromDate)} – ${displayDate(period.toDate)}`}
              </span>
              <button type="button" className="period-control__reset" onClick={() => { resetToCurrentYear(); setOpen(false); }}>
                <span className="material-symbols-outlined" aria-hidden>restart_alt</span>
                {t('fc.period.current_year')}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
