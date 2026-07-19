import { useEffect, useState } from 'react';
import { api, errorMessage } from '../../api/client';
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

interface HolidayGenerationPlan {
  year: number;
  comparison: {
    entries: HolidayComparisonEntry[];
    summary: Record<HolidayComparisonCategory, number>;
  };
  conflicts: HolidayComparisonEntry[];
}

interface HolidayGenerationReport {
  year: number;
  createdCount: number;
  skippedCount: number;
  conflictCount: number;
}

const CATEGORY_META: Record<HolidayComparisonCategory, { label: string; tone: Tone; icon: string }> = {
  NEW: { label: 'جديدة', tone: 'green', icon: 'add_circle' },
  EXISTING: { label: 'موجودة بالفعل', tone: 'neutral', icon: 'check_circle' },
  CHANGED: { label: 'تختلف عن المسجَّل', tone: 'orange', icon: 'sync_problem' },
  SKIPPED: { label: 'مكرَّرة (تُتخطَّى)', tone: 'neutral', icon: 'remove_circle' },
  CONFLICT: { label: 'تعارض', tone: 'red', icon: 'warning' },
};

const STATUS_LABEL: Record<HolidayStatus, string> = {
  OFFICIAL: 'رسمية',
  EXPECTED_ALOJAIRI: 'متوقَّعة (العجيري)',
  MANUALLY_ADJUSTED: 'مُعدَّلة يدويًا',
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

  return (
    <Dialog
      icon="event_repeat"
      title={`توليد العطل الرسمية — سنة ${year}`}
      subtitle="معاينة كاملة قبل أي حفظ — لن يُكتب شيء إلا بعد تأكيدك صراحةً"
      size="lg"
      onClose={onClose}
      footer={
        phase === 'preview' ? (
          <>
            <Button variant="ghost" onClick={onClose}>إلغاء</Button>
            <Button variant="primary" icon="check" onClick={confirmGeneration} disabled={newCount === 0}>
              تأكيد التوليد ({newCount} عطلة جديدة)
            </Button>
          </>
        ) : phase === 'applying' ? (
          <Button variant="primary" icon="check" busy>جارٍ الحفظ...</Button>
        ) : phase === 'report' ? (
          <Button variant="primary" icon="check" onClick={onClose}>إغلاق</Button>
        ) : (
          <Button variant="ghost" onClick={onClose}>إغلاق</Button>
        )
      }
    >
      {error && <ErrorBanner>{error}</ErrorBanner>}

      {phase === 'loading' && <SkeletonRows rows={5} withAvatar={false} />}

      {phase === 'preview' && plan && (
        <>
          {/* ملخّص المقارنة (الجزء 5) */}
          <DialogSection title="ملخّص المقارنة" icon="fact_check">
            <div className="ghd-summary">
              {(Object.keys(CATEGORY_META) as HolidayComparisonCategory[]).map((cat) => (
                <StatusChip key={cat} tone={CATEGORY_META[cat].tone} icon={CATEGORY_META[cat].icon}>
                  {CATEGORY_META[cat].label}: {summary?.[cat] ?? 0}
                </StatusChip>
              ))}
            </div>
          </DialogSection>

          {/* ملخّص التعارض (الجزء 4 + 7) */}
          {hasConflicts && (
            <DialogSection title="تعارضات تحتاج مراجعة يدوية" icon="warning">
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
                هذه البنود لن تُطبَّق تلقائيًا — عدِّلها يدويًا (إضافة/حذف) من الجدول أدناه إن لزم.
              </p>
            </DialogSection>
          )}

          {/* التفاصيل الكاملة */}
          <DialogSection title="تفاصيل كل بند" icon="checklist">
            {plan.comparison.entries.length === 0 ? (
              <div className="ghd-full">
                <EmptyState icon="event_busy" title="لا توجد بنود" message="لم يُنتج أي مصدر عطل مرشَّحة لهذه السنة بعد." tone="neutral" />
              </div>
            ) : (
              <div className="ghd-full xpl-table-wrap">
                <table className="xpl-table">
                  <thead>
                    <tr><th>التاريخ</th><th>الاسم المقترَح</th><th>الحالة</th><th>النوع</th><th>ملاحظة</th></tr>
                  </thead>
                  <tbody>
                    {plan.comparison.entries.map((entry, i) => (
                      <tr key={i}>
                        <td>{entry.date.slice(0, 10)}</td>
                        <td>{entry.candidateName ?? entry.existingName ?? '—'}</td>
                        <td><StatusChip tone={CATEGORY_META[entry.category].tone} icon={CATEGORY_META[entry.category].icon}>{CATEGORY_META[entry.category].label}</StatusChip></td>
                        <td>{entry.status ? STATUS_LABEL[entry.status] : '—'}</td>
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
        <DialogSection title="تقرير التوليد" icon="task_alt">
          <div className="ghd-summary">
            <StatusChip tone="green" icon="add_circle">تم إنشاء: {report.createdCount}</StatusChip>
            <StatusChip tone="neutral" icon="check_circle">مُتخطّاة/موجودة: {report.skippedCount}</StatusChip>
            {report.conflictCount > 0 && (
              <StatusChip tone="orange" icon="warning">تحتاج مراجعة يدوية: {report.conflictCount}</StatusChip>
            )}
          </div>
        </DialogSection>
      )}
    </Dialog>
  );
}
