import { useEffect, useState } from 'react';
import { api, errorMessage } from '../../api/client';
import { useT } from '../../lib/i18n';
import { Dialog, DialogSection, Button, ErrorBanner, StatusChip, EmptyState, SkeletonRows, type Tone } from '../explorer/ExplorerKit';
import './GenerateHolidaysDialog.css';

/** يطابق HolidayComparisonCategory في backend/src/modules/employee-entitlements/holidays/holidayYearComparison.ts. */
type HolidayComparisonCategory = 'NEW' | 'EXISTING' | 'CHANGED' | 'SKIPPED' | 'CONFLICT';
type HolidayOrigin = 'FIXED_GREGORIAN' | 'HIJRI';
type HolidayStatus = 'OFFICIAL' | 'EXPECTED_ALOJAIRI' | 'MANUALLY_ADJUSTED';

interface HolidayComparisonEntry {
  date: string;
  category: HolidayComparisonCategory;
  candidateName?: string;
  existingName?: string;
  origin?: HolidayOrigin;
  status?: HolidayStatus;
  reason?: string;
}

/** يطابق HolidayProviderWarningCode في backend/.../holidays/providers/HolidaySourceProvider.ts. */
type HolidayProviderWarningCode = 'UNSUPPORTED_YEAR' | 'PROVIDER_FAILURE' | 'INVALID_DATA';

interface HolidayProviderWarning {
  code: HolidayProviderWarningCode;
  sourceName: string;
  message: string;
}

interface HolidayGenerationPlan {
  year: number;
  comparison: {
    entries: HolidayComparisonEntry[];
    summary: Record<HolidayComparisonCategory, number>;
  };
  conflicts: HolidayComparisonEntry[];
  /** رسائل تحقّق صادرة عن مصادر التوليد (سنة هجرية غير مدعومة، فشل مصدر...) — Al-Ojairi Integration Pack v1. */
  warnings?: HolidayProviderWarning[];
}

interface HolidayGenerationReport {
  year: number;
  createdCount: number;
  skippedCount: number;
  conflictCount: number;
}

const CATEGORY_META: Record<HolidayComparisonCategory, { key: string; tone: Tone; icon: string }> = {
  NEW: { key: 'opt.ent.holiday_category.new', tone: 'green', icon: 'add_circle' },
  EXISTING: { key: 'opt.ent.holiday_category.existing', tone: 'neutral', icon: 'check_circle' },
  CHANGED: { key: 'opt.ent.holiday_category.changed', tone: 'orange', icon: 'sync_problem' },
  SKIPPED: { key: 'opt.ent.holiday_category.skipped', tone: 'neutral', icon: 'remove_circle' },
  CONFLICT: { key: 'opt.ent.holiday_category.conflict', tone: 'red', icon: 'warning' },
};

const STATUS_LABEL: Record<HolidayStatus, string> = {
  OFFICIAL: 'opt.ent.holiday_status.official',
  EXPECTED_ALOJAIRI: 'opt.ent.holiday_status.expected_alojairi',
  MANUALLY_ADJUSTED: 'opt.ent.holiday_status.manually_adjusted',
};

/** مصدر/مزوِّد كل عطلة — لعرض «Provider name / Holiday source» في المعاينة (Part 6). */
const SOURCE_LABEL: Record<HolidayOrigin, string> = {
  FIXED_GREGORIAN: 'opt.ent.holiday_source.fixed_gregorian',
  HIJRI: 'opt.ent.holiday_source.hijri_alojairi',
};

const WARNING_META: Record<HolidayProviderWarningCode, { key: string; tone: Tone; icon: string }> = {
  UNSUPPORTED_YEAR: { key: 'msg.ent.holiday_warning.unsupported_year', tone: 'orange', icon: 'event_busy' },
  PROVIDER_FAILURE: { key: 'msg.ent.holiday_warning.generation_source_failed', tone: 'red', icon: 'error' },
  INVALID_DATA: { key: 'msg.ent.holiday_warning.invalid_hijri_data', tone: 'orange', icon: 'warning' },
};

interface Props {
  year: number;
  onClose: () => void;
  /** يُستدعى بعد نجاح التطبيق فعليًا (لإعادة تحميل قائمة العطل في الصفحة الأم). */
  onApplied: () => void;
}

/**
 * حوار «توليد العطل» (Kuwait Holiday Intelligence Pack v1، الجزء 7) — معاينة كاملة
 * أولاً (POST /holidays/generate/preview، بلا أي كتابة)، ثم تطبيق فقط بعد تأكيد صريح
 * من المستخدم (POST /holidays/generate/apply). لا يُطبَّق أي بند CHANGED/CONFLICT
 * تلقائيًا أبدًا — هذه البنود تبقى تتطلّب مراجعة/تعديل يدوي.
 */
export default function GenerateHolidaysDialog({ year, onClose, onApplied }: Props) {
  const { t } = useT();
  const [phase, setPhase] = useState<'loading' | 'preview' | 'applying' | 'report' | 'error'>('loading');
  const [plan, setPlan] = useState<HolidayGenerationPlan | null>(null);
  const [report, setReport] = useState<HolidayGenerationReport | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setPhase('loading');
    setError('');
    api
      .post('/holidays/generate/preview', { year })
      .then((res) => { if (alive) { setPlan(res.data?.data ?? null); setPhase('preview'); } })
      .catch((e) => { if (alive) { setError(errorMessage(e)); setPhase('error'); } });
    return () => { alive = false; };
  }, [year]);

  async function confirmGeneration() {
    setPhase('applying');
    setError('');
    try {
      const res = await api.post('/holidays/generate/apply', { year });
      setReport(res.data?.data ?? null);
      setPhase('report');
      onApplied();
    } catch (e) {
      setError(errorMessage(e));
      setPhase('preview');
    }
  }

  const summary = plan?.comparison.summary;
  const newCount = summary?.NEW ?? 0;
  const hasConflicts = (plan?.conflicts.length ?? 0) > 0;
  const warnings = plan?.warnings ?? [];
  const hasWarnings = warnings.length > 0;

  return (
    <Dialog
      icon="event_repeat"
      title={t('page.ent.generate_holidays_title', { year })}
      subtitle={t('msg.ent.holidays_preview_subtitle')}
      size="lg"
      onClose={onClose}
      footer={
        phase === 'preview' ? (
          <>
            <Button variant="ghost" onClick={onClose}>{t('action.cancel')}</Button>
            <Button variant="primary" icon="check" onClick={confirmGeneration} disabled={newCount === 0}>
              {t('action.ent.confirm_generation', { count: newCount })}
            </Button>
          </>
        ) : phase === 'applying' ? (
          <Button variant="primary" icon="check" busy>{t('msg.ent.generating_saving')}</Button>
        ) : phase === 'report' ? (
          <Button variant="primary" icon="check" onClick={onClose}>{t('action.close')}</Button>
        ) : (
          <Button variant="ghost" onClick={onClose}>{t('action.close')}</Button>
        )
      }
    >
      {error && <ErrorBanner>{error}</ErrorBanner>}

      {phase === 'loading' && <SkeletonRows rows={5} withAvatar={false} />}

      {phase === 'preview' && plan && (
        <>
          {/* ملخّص المقارنة (الجزء 5) */}
          <DialogSection title={t('section.ent.holiday_comparison_summary')} icon="fact_check">
            <div className="ghd-summary">
              {(Object.keys(CATEGORY_META) as HolidayComparisonCategory[]).map((cat) => (
                <StatusChip key={cat} tone={CATEGORY_META[cat].tone} icon={CATEGORY_META[cat].icon}>
                  {t(CATEGORY_META[cat].key)}: {summary?.[cat] ?? 0}
                </StatusChip>
              ))}
            </div>
          </DialogSection>

          {/* رسائل التحقّق من مصادر التوليد (سنة غير مدعومة، فشل مصدر...) — Al-Ojairi Integration Pack v1، Part 4 + 5 + 6 */}
          {hasWarnings && (
            <DialogSection title={t('section.ent.holiday_warnings')} icon="error">
              <div className="ghd-conflicts">
                {warnings.map((w, i) => (
                  <div key={i} className="ghd-conflict-row">
                    <StatusChip tone={WARNING_META[w.code].tone} icon={WARNING_META[w.code].icon}>
                      {t(WARNING_META[w.code].key)}
                    </StatusChip>
                    <span>{w.message}</span>
                  </div>
                ))}
              </div>
            </DialogSection>
          )}

          {/* ملخّص التعارض (الجزء 4 + 7) */}
          {hasConflicts && (
            <DialogSection title={t('section.ent.holiday_conflicts')} icon="warning">
              <div className="ghd-conflicts">
                {plan.conflicts.map((c, i) => (
                  <div key={i} className="ghd-conflict-row">
                    <StatusChip tone={CATEGORY_META[c.category].tone} icon={CATEGORY_META[c.category].icon}>
                      {c.date.slice(0, 10)}
                    </StatusChip>
                    <span>{c.reason ?? `${c.candidateName ?? '—'} / ${c.existingName ?? '—'}`}</span>
                  </div>
                ))}
              </div>
              <p className="ghd-conflict-note">
                {t('msg.ent.holiday_conflicts_note')}
              </p>
            </DialogSection>
          )}

          {/* التفاصيل الكاملة */}
          <DialogSection title={t('section.ent.holiday_item_details')} icon="checklist">
            {plan.comparison.entries.length === 0 ? (
              <div className="ghd-full">
                <EmptyState icon="event_busy" title={t('msg.ent.no_holiday_items_title')} message={t('msg.ent.no_holiday_items_message')} tone="neutral" />
              </div>
            ) : (
              <div className="ghd-full xpl-table-wrap">
                <table className="xpl-table">
                  <thead>
                    <tr><th>{t('col.date')}</th><th>{t('col.ent.suggested_name')}</th><th>{t('col.status')}</th><th>{t('col.type')}</th><th>{t('col.ent.source')}</th><th>{t('col.ent.note')}</th></tr>
                  </thead>
                  <tbody>
                    {plan.comparison.entries.map((entry, i) => (
                      <tr key={i}>
                        <td>{entry.date.slice(0, 10)}</td>
                        <td>{entry.candidateName ?? entry.existingName ?? '—'}</td>
                        <td><StatusChip tone={CATEGORY_META[entry.category].tone} icon={CATEGORY_META[entry.category].icon}>{t(CATEGORY_META[entry.category].key)}</StatusChip></td>
                        <td>{entry.status ? t(STATUS_LABEL[entry.status]) : '—'}</td>
                        <td>{entry.origin ? t(SOURCE_LABEL[entry.origin]) : '—'}</td>
                        <td>{entry.reason ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DialogSection>
        </>
      )}

      {phase === 'report' && report && (
        <DialogSection title={t('section.ent.holiday_generation_report')} icon="task_alt">
          <div className="ghd-summary">
            <StatusChip tone="green" icon="add_circle">{t('msg.ent.report_created', { count: report.createdCount })}</StatusChip>
            <StatusChip tone="neutral" icon="check_circle">{t('msg.ent.report_skipped', { count: report.skippedCount })}</StatusChip>
            {report.conflictCount > 0 && (
              <StatusChip tone="orange" icon="warning">{t('msg.ent.report_needs_review', { count: report.conflictCount })}</StatusChip>
            )}
          </div>
        </DialogSection>
      )}
    </Dialog>
  );
}
