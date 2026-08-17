/**
 * السجل اليومي للعمل الإضافي — تفاصيل الأيام التي يتكوّن منها مجموع الشهر.
 *
 * ═══ مبدأ واحد يحكم هذا الملف ═══
 * **لا قاعدة قانونية هنا.** المخالفات والإفصاحات تصل محسوبة من محرّك الالتزام على
 * الخادم (`overtimeComplianceEngine.ts`)، وهذا المكوّن يعرضها كما هي. نسخةٌ ثانية من
 * حدّ «ساعتان في اليوم» مكتوبة في React كانت ستتباعد عن القانون عند أول تعديل، وتُظهر
 * للمستخدم حكمًا يخالف ما يمنع الخادمُ الاعتمادَ به.
 *
 * ═══ ولا يولّد تواريخ ═══
 * لا زر «وزّع تلقائيًا» ينشئ أيامًا من عنده (المتطلب ٢٠). مساعد التوزيع يعمل على
 * **الأيام التي اختارها المستخدم وحدها**، ويعرض معاينة قبل التطبيق.
 */
import { useMemo, useState } from 'react';
import DateInput from '../components/DateInput';
import { Button, Dialog, Icon } from '../components/explorer/ExplorerKit';
import { money } from '../config/modules';
import { OVERTIME_LABEL_AR, OVERTIME_LABEL_LONG_AR } from './labels';
import './OvertimeDailyLedger.css';
import type {
  ComplianceFinding,
  CompensatoryRestStatus,
  OvertimeCompliance,
  OvertimeType,
} from './types';

/** صفّ يوم في حالة التحرير — الساعات نصّ أثناء الكتابة كما في بقية الوحدة. */
export interface DayDraftRow {
  key: string;
  date: string;
  overtimeType: OvertimeType;
  hours: string;
  notes: string;
  compensatoryRestStatus: CompensatoryRestStatus | null;
  compensatoryRestDate: string | null;
}

const OVERTIME_TYPES: OvertimeType[] = ['REGULAR', 'WEEKLY_REST', 'OFFICIAL_HOLIDAY'];

const COMPENSATORY_LABEL_AR: Record<CompensatoryRestStatus, string> = {
  PENDING: 'مستحق',
  SCHEDULED: 'مجدول',
  TAKEN: 'أُخذ',
};

/** `YYYY-MM-DD` → `DD/MM/YYYY` بأرقام إنجليزية، بلا أي إنشاء `Date`. */
export function displayDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/** أول وآخر يوم في الشهر بصيغة `YYYY-MM-DD` — بلا تحويل منطقة زمنية. */
export function monthBounds(year: number, month: number): { min: string; max: string } {
  const mm = String(month).padStart(2, '0');
  const last = new Date(Date.UTC(year, month, 0, 12)).getUTCDate();
  return { min: `${year}-${mm}-01`, max: `${year}-${mm}-${String(last).padStart(2, '0')}` };
}

function parseHours(text: string): number {
  const n = Number(text);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** مجموع ساعات نوع بعينه — عرضٌ فقط؛ المجموع المعتمد يأتي من الخادم. */
export function sumHoursOfType(rows: readonly DayDraftRow[], type: OvertimeType): number {
  return Number(
    rows.filter((r) => r.overtimeType === type).reduce((s, r) => s + parseHours(r.hours), 0).toFixed(3),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  شريط الالتزام القانوني — مضغوط، داخل بطاقة العمل الإضافي
// ─────────────────────────────────────────────────────────────────────────────

export function ComplianceBar({ compliance }: { compliance: OvertimeCompliance | null }) {
  if (!compliance) return null;
  const { regular, compliant, hasDailyDetail } = compliance;

  // العتبة الإدارية (٨٠٪) تُشتقّ من الأرقام الواصلة لا تُكتب رقمًا هنا.
  const hoursRatio = regular.annualHoursLimit > 0 ? regular.yearHours / regular.annualHoursLimit : 0;
  const daysRatio = regular.annualDaysLimit > 0 ? regular.yearDays / regular.annualDaysLimit : 0;
  const near = hoursRatio >= 0.8 || daysRatio >= 0.8;

  /*
    ترتيب الحالات مقصود: المخالفة المؤكَّدة أولًا، ثم **نقص التحقّق**، ثم الاقتراب.
    «✓ ضمن الحدود» ادّعاءُ فحصٍ اكتمل — ولا يجوز عرضه لسنة فيها أشهر مجمّعة بلا
    تواريخ، لأن حدَّي «٩٠ يومًا سنويًا» و«٣ أيام أسبوعيًا» لم يُفحصا لتلك الفترات أصلًا.
    فتُعرض حالة ثالثة صريحة بدل صحّةٍ لم تثبت.
  */
  const badge = !compliant
    ? { cls: 'ecmp-cmp-bad', icon: 'block', text: 'تجاوز قانوني' }
    : compliance.verification === 'PARTIAL'
      ? { cls: 'ecmp-cmp-warn', icon: 'help', text: 'تحقّق غير مكتمل' }
      : near
        ? { cls: 'ecmp-cmp-warn', icon: 'warning', text: 'قريب من الحد' }
        : { cls: 'ecmp-cmp-ok', icon: 'check_circle', text: 'ضمن الحدود' };

  return (
    <div className="ecmp-compliance-bar">
      <div className="ecmp-cmp-title">
        <Icon name="gavel" />
        <span>الالتزام القانوني</span>
      </div>

      <div className="ecmp-cmp-stats">
        {/*
          «هذا الشهر» مشتقّ من الأيام حصرًا. عرضه `0h` في شهر قديم يحمل ٩ ساعات
          مجمّعة كان يضع رقمين متناقضين في شاشة واحدة — يقرأ المستخدم «٠» فوق سطر
          يقول «٩». الشهر القديم لا يملك التوزيع اليومي أصلًا، فالصادق أن يُقال ذلك
          لا أن يُعرض صفرٌ يبدو قياسًا.
        */}
        <span className="ecmp-cmp-stat">
          هذا الشهر:{' '}
          {hasDailyDetail ? (
            <>
              <b>{regular.monthHours}h</b>
              <span className="ecmp-cmp-sub"> · {regular.monthDays} يوم</span>
            </>
          ) : (
            <b title="لا تفاصيل يومية لهذا الشهر">—</b>
          )}
        </span>
        <span className="ecmp-cmp-stat">
          {/* معزول اتجاهيًا: في RTL يقلب محرّك bidi ترتيب «35 / 180» بصريًا. */}
          السنة:{' '}
          <span dir="ltr" className="ecmp-ratio">
            <b>{regular.yearHours}</b> / {regular.annualHoursLimit}h
          </span>
          {regular.yearHoursFromLegacy > 0 && (
            <span className="ecmp-cmp-sub" title="جزء من الرصيد آتٍ من أشهر مجمّعة بلا تواريخ">
              {' '}(منها {regular.yearHoursFromLegacy} مجمّعة)
            </span>
          )}
        </span>
        <span className="ecmp-cmp-stat">
          أيام السنة:{' '}
          <span dir="ltr" className="ecmp-ratio">
            <b>{regular.yearDays}</b> / {regular.annualDaysLimit}
          </span>
          {/* الرقم ناقص حتمًا عند PARTIAL — يُقال بدل أن يُقرأ على أنه كامل. */}
          {compliance.verification === 'PARTIAL' && (
            <span className="ecmp-cmp-sub" title="الأشهر المجمّعة بلا تواريخ غير محسوبة هنا">
              {' '}(المؤرَّخة فقط)
            </span>
          )}
        </span>
      </div>

      <span className={`ecmp-cmp-badge ${badge.cls}`}>
        <Icon name={badge.icon} />
        {badge.text}
      </span>

      {!hasDailyDetail && (
        <span
          className="ecmp-cmp-legacy"
          title="سجل شهري قديم: الحدود اليومية والأسبوعية غير مفحوصة لهذا الشهر"
        >
          <Icon name="history" />
          سجل شهري قديم
        </span>
      )}
    </div>
  );
}

/** قائمة المخالفات والإفصاحات — مصنَّفة بصريًا بأساسها لا بلونٍ موحّد. */
export function ComplianceFindings({ compliance }: { compliance: OvertimeCompliance | null }) {
  if (!compliance) return null;
  const all = [...compliance.violations, ...compliance.warnings];
  if (all.length === 0) return null;

  const cls = (f: ComplianceFinding) =>
    f.basis === 'STATUTORY' && compliance.violations.includes(f)
      ? 'ecmp-find-violation'
      : f.basis === 'ADVISORY'
        ? 'ecmp-find-advisory'
        : 'ecmp-find-disclosure';

  const label = (f: ComplianceFinding) =>
    compliance.violations.includes(f)
      ? 'مخالفة قانونية'
      : f.basis === 'ADVISORY'
        ? 'تنبيه إداري'
        : 'إفصاح';

  return (
    <div className="ecmp-findings">
      {all.map((f, i) => (
        <div key={`${f.code}-${i}`} className={`ecmp-finding ${cls(f)}`}>
          <span className="ecmp-finding-tag">{label(f)}</span>
          <span className="ecmp-finding-msg">{f.messageAr}</span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  الحوار: تقويم | قائمة
// ─────────────────────────────────────────────────────────────────────────────

export default function OvertimeDailyLedger({
  year,
  month,
  rows,
  rates,
  compliance,
  savedHoursByType,
  onChange,
  onClose,
}: {
  year: number;
  month: number;
  rows: DayDraftRow[];
  /** السعر الفعلي لكل نوع — للعرض فقط؛ المبلغ المعتمد يأتي من المعاينة. */
  rates: Record<OvertimeType, number> | null;
  compliance: OvertimeCompliance | null;
  /**
   * ساعات كل نوع في **السجل المحفوظ** قبل التحويل — لمطابقة المجموع (المتطلب ٣١).
   * `null` لشهر لم يُحفظ بعد.
   */
  savedHoursByType: Record<OvertimeType, number> | null;
  onChange: (rows: DayDraftRow[]) => void;
  onClose: () => void;
}) {
  const [view, setView] = useState<'calendar' | 'list'>('list');
  const [editing, setEditing] = useState<DayDraftRow | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);

  const bounds = useMemo(() => monthBounds(year, month), [year, month]);

  /** التواريخ المخالفة — تصل من الخادم، فتُوسم في التقويم وفي القائمة معًا. */
  const violationDates = useMemo(
    () => new Set(compliance?.violations.map((v) => v.date).filter(Boolean) as string[]),
    [compliance],
  );

  const sorted = useMemo(
    () => [...rows].sort((a, b) => a.date.localeCompare(b.date) || a.overtimeType.localeCompare(b.overtimeType)),
    [rows],
  );

  const nextKey = () => `d${Date.now()}${Math.random().toString(16).slice(2, 6)}`;

  const upsert = (row: DayDraftRow) => {
    const exists = rows.some((r) => r.key === row.key);
    onChange(exists ? rows.map((r) => (r.key === row.key ? row : r)) : [...rows, row]);
    setEditing(null);
  };

  const remove = (key: string) => onChange(rows.filter((r) => r.key !== key));

  const totals = OVERTIME_TYPES.map((t) => ({ type: t, hours: sumHoursOfType(rows, t) })).filter(
    (t) => t.hours > 0,
  );
  const grandTotal = Number(totals.reduce((s, t) => s + t.hours, 0).toFixed(3));

  return (
    <Dialog
      icon="event_note"
      title="تفاصيل أيام العمل الإضافي"
      subtitle={`${String(month).padStart(2, '0')}/${year} — الساعات المعتمدة هي مجموع هذه الأيام`}
      size="xl"
      onClose={onClose}
      footer={
        <>
          <div className="ecmp-day-footer-total">
            الإجمالي: <b>{grandTotal}</b> ساعة
            {totals.length > 1 && (
              <span className="ecmp-cmp-sub">
                {' '}
                ({totals.map((t) => `${OVERTIME_LABEL_AR[t.type]} ${t.hours}`).join(' · ')})
              </span>
            )}
          </div>
          <Button variant="primary" icon="check" onClick={onClose}>
            تم
          </Button>
        </>
      }
    >
      <div className="ecmp-day-toolbar">
        <div className="ecmp-day-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={view === 'calendar'}
            className={view === 'calendar' ? 'is-active' : ''}
            onClick={() => setView('calendar')}
          >
            <Icon name="calendar_month" /> التقويم
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'list'}
            className={view === 'list' ? 'is-active' : ''}
            onClick={() => setView('list')}
          >
            <Icon name="list" /> القائمة
          </button>
        </div>

        <div className="ecmp-day-actions">
          <Button
            small
            variant="secondary"
            icon="auto_awesome"
            disabled={rows.length === 0}
            onClick={() => setAssistantOpen(true)}
          >
            مساعد التوزيع
          </Button>
          <Button
            small
            variant="primary"
            icon="add"
            onClick={() =>
              setEditing({
                key: nextKey(),
                date: bounds.min,
                overtimeType: 'REGULAR',
                hours: '',
                notes: '',
                compensatoryRestStatus: null,
                compensatoryRestDate: null,
              })
            }
          >
            إضافة يوم إضافي
          </Button>
        </div>
      </div>

      <ComplianceFindings compliance={compliance} />

      {/*
        مطابقة المجموع عند تحويل شهر قديم (المتطلب ٣١).

        منذ أن صارت الأيام مصدر الساعات، أيُّ نوع لم تُدخَل أيامه يصير مجموعه صفرًا —
        فشهرٌ محفوظ فيه ١٢ ساعة راحة أسبوعية يفقدها بصمت لمجرّد أن المستخدم أدخل أيام
        الإضافي العادي وحدها. النظام **لا يخترع** تواريخ لتلك الساعات (وذلك ممنوع
        صراحةً)، لكنه لا يجوز أن يصمت عن الفارق: يُعرض هنا صريحًا حتى يُدخل المستخدم
        الأيام المقابلة أو يقرّر أن الرقم القديم كان خاطئًا.
      */}
      <ReconciliationNotice rows={rows} savedHoursByType={savedHoursByType} />

      {view === 'calendar' ? (
        <MonthGrid
          year={year}
          month={month}
          rows={sorted}
          violationDates={violationDates}
          onPick={(date) => {
            const existing = sorted.find((r) => r.date === date);
            setEditing(
              existing ?? {
                key: nextKey(),
                date,
                overtimeType: 'REGULAR',
                hours: '',
                notes: '',
                compensatoryRestStatus: null,
                compensatoryRestDate: null,
              },
            );
          }}
        />
      ) : (
        <DayList
          rows={sorted}
          rates={rates}
          violationDates={violationDates}
          onEdit={setEditing}
          onRemove={remove}
        />
      )}

      {editing && (
        <DayEntryDialog
          row={editing}
          bounds={bounds}
          existing={rows}
          onCancel={() => setEditing(null)}
          onSave={upsert}
        />
      )}

      {assistantOpen && (
        <DistributionAssistant
          rows={rows}
          onCancel={() => setAssistantOpen(false)}
          onApply={(next) => {
            onChange(next);
            setAssistantOpen(false);
          }}
        />
      )}
    </Dialog>
  );
}

/**
 * يقارن مجموع الأيام المُدخلة بساعات السجل المحفوظ، نوعًا نوعًا.
 *
 * لا يصحّح ولا يولّد شيئًا — يقول الفارق وحده. الأنواع المتطابقة لا تُذكر إطلاقًا كي
 * لا يتحوّل التنبيه إلى ضجيج دائم في الأشهر السليمة.
 */
function ReconciliationNotice({
  rows,
  savedHoursByType,
}: {
  rows: readonly DayDraftRow[];
  savedHoursByType: Record<OvertimeType, number> | null;
}) {
  if (!savedHoursByType) return null;

  const gaps = OVERTIME_TYPES.map((type) => {
    const saved = savedHoursByType[type] ?? 0;
    const now = sumHoursOfType(rows, type);
    return { type, saved, now, diff: Number((now - saved).toFixed(3)) };
  }).filter((g) => g.saved > 0 && g.diff !== 0);

  if (gaps.length === 0) return null;

  return (
    <div className="ecmp-findings">
      {gaps.map((g) => (
        <div key={g.type} className="ecmp-finding ecmp-find-advisory">
          <span className="ecmp-finding-tag">مطابقة</span>
          <span className="ecmp-finding-msg">
            {OVERTIME_LABEL_AR[g.type]}: السجل المحفوظ يحمل <b>{g.saved}</b> ساعة، ومجموع
            الأيام المُدخلة <b>{g.now}</b> ساعة
            {g.now === 0
              ? ' — لم تُدخل أيام هذا النوع بعد، وسيصبح مجموعه صفرًا عند الحفظ.'
              : ` — بفارق ${g.diff > 0 ? '+' : ''}${g.diff} ساعة.`}{' '}
            أدخل الأيام الفعلية المقابلة، أو اعتمد الفارق إن كان الرقم القديم خاطئًا.
          </span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  عرض التقويم
// ─────────────────────────────────────────────────────────────────────────────

const WEEKDAY_AR = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

function MonthGrid({
  year,
  month,
  rows,
  violationDates,
  onPick,
}: {
  year: number;
  month: number;
  rows: readonly DayDraftRow[];
  violationDates: ReadonlySet<string>;
  onPick: (date: string) => void;
}) {
  const daysInMonth = new Date(Date.UTC(year, month, 0, 12)).getUTCDate();
  // أسبوع العمل يبدأ الأحد — نفس عُرف المشروع المستعمل في المحرّك.
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1, 12)).getUTCDay();

  const byDate = new Map<string, DayDraftRow[]>();
  for (const r of rows) {
    const list = byDate.get(r.date) ?? [];
    list.push(r);
    byDate.set(r.date, list);
  }

  const cells: (string | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from(
      { length: daysInMonth },
      (_, i) => `${year}-${String(month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`,
    ),
  ];

  return (
    <div className="ecmp-cal">
      <div className="ecmp-cal-head">
        {WEEKDAY_AR.map((d) => (
          <div key={d} className="ecmp-cal-wd">
            {d}
          </div>
        ))}
      </div>
      <div className="ecmp-cal-grid">
        {cells.map((iso, i) =>
          iso === null ? (
            <div key={`pad-${i}`} className="ecmp-cal-cell is-pad" />
          ) : (
            <button
              key={iso}
              type="button"
              className={`ecmp-cal-cell${byDate.has(iso) ? ' has-entry' : ''}${
                violationDates.has(iso) ? ' has-violation' : ''
              }`}
              onClick={() => onPick(iso)}
              aria-label={`${displayDate(iso)}${byDate.has(iso) ? ' — يوجد عمل إضافي' : ''}`}
            >
              <span className="ecmp-cal-num">{Number(iso.slice(8, 10))}</span>
              {(byDate.get(iso) ?? []).map((r) => (
                <span key={r.key} className={`ecmp-cal-badge t-${r.overtimeType}`}>
                  {parseHours(r.hours)}h
                </span>
              ))}
            </button>
          ),
        )}
      </div>
      <div className="ecmp-cal-legend">
        {OVERTIME_TYPES.map((t) => (
          <span key={t} className="ecmp-cal-legend-item">
            <i className={`ecmp-cal-dot t-${t}`} />
            {OVERTIME_LABEL_AR[t]}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  عرض القائمة
// ─────────────────────────────────────────────────────────────────────────────

function DayList({
  rows,
  rates,
  violationDates,
  onEdit,
  onRemove,
}: {
  rows: readonly DayDraftRow[];
  rates: Record<OvertimeType, number> | null;
  violationDates: ReadonlySet<string>;
  onEdit: (row: DayDraftRow) => void;
  onRemove: (key: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="ecmp-day-empty">
        <Icon name="event_busy" />
        <span>لا توجد أيام مسجَّلة. استعمل «إضافة يوم إضافي» لتسجيل أيام العمل الفعلية.</span>
      </div>
    );
  }

  return (
    <div className="ecmp-day-table-wrap">
      <table className="ecmp-day-table">
        <thead>
          <tr>
            <th>التاريخ</th>
            <th>النوع</th>
            <th className="num">الساعات</th>
            <th className="num">السعر</th>
            <th className="num">المبلغ</th>
            <th>الراحة البديلة</th>
            <th>ملاحظات</th>
            <th aria-label="إجراءات" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const hours = parseHours(r.hours);
            const rate = rates?.[r.overtimeType] ?? null;
            return (
              <tr key={r.key} className={violationDates.has(r.date) ? 'is-violation' : ''}>
                <td>
                  {displayDate(r.date)}
                  {violationDates.has(r.date) && (
                    <Icon name="error" aria-label="مخالفة قانونية في هذا اليوم" />
                  )}
                </td>
                <td>{OVERTIME_LABEL_AR[r.overtimeType]}</td>
                <td className="num">{hours}</td>
                <td className="num">{rate == null ? '—' : money(rate)}</td>
                <td className="num">{rate == null ? '—' : money(hours * rate)}</td>
                <td>
                  {r.overtimeType === 'REGULAR' ? (
                    <span className="ecmp-cmp-sub">—</span>
                  ) : (
                    <span className={`ecmp-rest-chip s-${r.compensatoryRestStatus ?? 'PENDING'}`}>
                      {COMPENSATORY_LABEL_AR[r.compensatoryRestStatus ?? 'PENDING']}
                      {r.compensatoryRestDate ? ` · ${displayDate(r.compensatoryRestDate)}` : ''}
                    </span>
                  )}
                </td>
                <td className="ecmp-day-notes">{r.notes || '—'}</td>
                <td className="ecmp-day-row-actions">
                  <Button small variant="ghost" icon="edit" onClick={() => onEdit(r)} aria-label="تعديل" />
                  <Button small variant="ghost" icon="delete" onClick={() => onRemove(r.key)} aria-label="حذف" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  حوار إدخال يوم
// ─────────────────────────────────────────────────────────────────────────────

function DayEntryDialog({
  row,
  bounds,
  existing,
  onCancel,
  onSave,
}: {
  row: DayDraftRow;
  bounds: { min: string; max: string };
  existing: readonly DayDraftRow[];
  onCancel: () => void;
  onSave: (row: DayDraftRow) => void;
}) {
  const [draft, setDraft] = useState<DayDraftRow>(row);

  const set = <K extends keyof DayDraftRow>(k: K, v: DayDraftRow[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  // تكرار (تاريخ، نوع) يُمنع هنا أيضًا لا في الخادم وحده — كي يعرف المستخدم فورًا
  // بدل أن يكتشفه بعد ضغط الحفظ. الخادم يبقى الحكم النهائي.
  const duplicate = existing.some(
    (r) => r.key !== draft.key && r.date === draft.date && r.overtimeType === draft.overtimeType,
  );
  const hours = parseHours(draft.hours);
  const canSave = !duplicate && hours > 0 && draft.date >= bounds.min && draft.date <= bounds.max;

  return (
    <Dialog
      icon="edit_calendar"
      title={existing.some((r) => r.key === row.key) ? 'تعديل يوم' : 'إضافة يوم إضافي'}
      size="sm"
      elevated
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            إلغاء
          </Button>
          <Button variant="primary" icon="check" disabled={!canSave} onClick={() => onSave(draft)}>
            حفظ
          </Button>
        </>
      }
    >
      <div className="ecmp-form-grid">
        <label className="ecmp-field">
          <span>التاريخ</span>
          <DateInput
            value={draft.date}
            min={bounds.min}
            max={bounds.max}
            onChange={(v) => set('date', v)}
          />
        </label>

        <label className="ecmp-field">
          <span>النوع</span>
          <select
            value={draft.overtimeType}
            onChange={(e) => {
              const t = e.target.value as OvertimeType;
              setDraft((d) => ({
                ...d,
                overtimeType: t,
                // المادة ٦٦ لا تُنشئ استحقاق راحة بديلة — تُصفَّر الحقول عند التحويل إليها.
                compensatoryRestStatus: t === 'REGULAR' ? null : (d.compensatoryRestStatus ?? 'PENDING'),
                compensatoryRestDate: t === 'REGULAR' ? null : d.compensatoryRestDate,
              }));
            }}
          >
            {OVERTIME_TYPES.map((t) => (
              <option key={t} value={t}>
                {OVERTIME_LABEL_LONG_AR[t]}
              </option>
            ))}
          </select>
        </label>

        <label className="ecmp-field">
          <span>الساعات</span>
          <input
            type="number"
            min={0}
            max={24}
            step={0.25}
            value={draft.hours}
            autoFocus
            onChange={(e) => set('hours', e.target.value)}
          />
        </label>

        {draft.overtimeType !== 'REGULAR' && (
          <>
            <label className="ecmp-field">
              <span>يوم الراحة البديل</span>
              <select
                value={draft.compensatoryRestStatus ?? 'PENDING'}
                onChange={(e) => set('compensatoryRestStatus', e.target.value as CompensatoryRestStatus)}
              >
                {(Object.keys(COMPENSATORY_LABEL_AR) as CompensatoryRestStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {COMPENSATORY_LABEL_AR[s]}
                  </option>
                ))}
              </select>
            </label>

            {draft.compensatoryRestStatus !== 'PENDING' && (
              <label className="ecmp-field">
                <span>تاريخ اليوم البديل</span>
                <DateInput
                  value={draft.compensatoryRestDate ?? ''}
                  onChange={(v) => set('compensatoryRestDate', v || null)}
                />
              </label>
            )}
          </>
        )}

        <label className="ecmp-field ecmp-field-wide">
          <span>ملاحظات</span>
          <input value={draft.notes} onChange={(e) => set('notes', e.target.value)} maxLength={500} />
        </label>
      </div>

      {duplicate && (
        <div className="ecmp-inline-error">
          يوجد سطر بنفس التاريخ والنوع. ادمج الساعات في سطر واحد — حدود المادة ٦٦ تحسب
          ساعات اليوم لا عدد الفترات.
        </div>
      )}
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  مساعد توزيع الساعات (المتطلب ٢١)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * يوزّع إجماليًا مستهدفًا على **الأيام المختارة وحدها**.
 *
 * لا ينشئ تاريخًا، ولا يحذف يومًا، ولا يتجاوز سقف الساعات المسموح لليوم. التوزيع
 * متساوٍ قدر الإمكان مع دفع الباقي إلى الأيام الأولى — والمعاينة تُعرض قبل التطبيق.
 */
export function distributeHours(count: number, target: number, maxPerDay: number): number[] {
  if (count <= 0 || target <= 0) return [];
  const capped = Math.min(target, count * maxPerDay);
  const base = Math.floor(capped / count);
  let remainder = Math.round((capped - base * count) * 100) / 100;

  return Array.from({ length: count }, () => {
    const extra = Math.min(remainder, maxPerDay - base);
    remainder = Math.round((remainder - extra) * 100) / 100;
    return Math.round((base + extra) * 100) / 100;
  });
}

function DistributionAssistant({
  rows,
  onCancel,
  onApply,
}: {
  rows: DayDraftRow[];
  onCancel: () => void;
  onApply: (rows: DayDraftRow[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(rows.map((r) => r.key)));
  const [target, setTarget] = useState('');
  const [maxPerDay, setMaxPerDay] = useState('2');

  const chosen = rows.filter((r) => selected.has(r.key));
  const targetNum = Number(target);
  const capNum = Number(maxPerDay);
  const valid = Number.isFinite(targetNum) && targetNum > 0 && Number.isFinite(capNum) && capNum > 0;
  const preview = valid ? distributeHours(chosen.length, targetNum, capNum) : [];
  const previewTotal = Number(preview.reduce((s, h) => s + h, 0).toFixed(3));

  return (
    <Dialog
      icon="auto_awesome"
      title="مساعد توزيع الساعات"
      subtitle="يوزّع على الأيام التي تختارها وحدها — لا ينشئ تواريخ جديدة"
      size="md"
      elevated
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            إلغاء
          </Button>
          <Button
            variant="primary"
            icon="check"
            disabled={!valid || chosen.length === 0}
            onClick={() => {
              const byKey = new Map(chosen.map((r, i) => [r.key, preview[i]]));
              onApply(
                rows.map((r) => (byKey.has(r.key) ? { ...r, hours: String(byKey.get(r.key)) } : r)),
              );
            }}
          >
            تطبيق التوزيع
          </Button>
        </>
      }
    >
      <div className="ecmp-form-grid">
        <label className="ecmp-field">
          <span>إجمالي الساعات المطلوب</span>
          <input type="number" min={0} step={0.25} value={target} onChange={(e) => setTarget(e.target.value)} />
        </label>
        <label className="ecmp-field">
          <span>الحد الأقصى لليوم</span>
          <input type="number" min={0} step={0.25} value={maxPerDay} onChange={(e) => setMaxPerDay(e.target.value)} />
        </label>
      </div>

      <div className="ecmp-assist-note">
        <Icon name="info" />
        اختر الأيام التي عمل فيها الموظف فعليًا. لن يُنشأ أي يوم لم تختره.
      </div>

      <div className="ecmp-day-table-wrap">
        <table className="ecmp-day-table">
          <thead>
            <tr>
              <th aria-label="اختيار" />
              <th>التاريخ</th>
              <th>النوع</th>
              <th className="num">الحالي</th>
              <th className="num">بعد التوزيع</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const idx = chosen.findIndex((c) => c.key === r.key);
              return (
                <tr key={r.key}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(r.key)}
                      onChange={(e) =>
                        setSelected((s) => {
                          const next = new Set(s);
                          if (e.target.checked) next.add(r.key);
                          else next.delete(r.key);
                          return next;
                        })
                      }
                    />
                  </td>
                  <td>{displayDate(r.date)}</td>
                  <td>{OVERTIME_LABEL_AR[r.overtimeType]}</td>
                  <td className="num">{parseHours(r.hours)}</td>
                  <td className="num">{idx >= 0 && valid ? preview[idx] : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {valid && previewTotal < targetNum && (
        <div className="ecmp-inline-error">
          الأيام المختارة لا تتّسع للإجمالي المطلوب عند هذا الحد اليومي: سيُوزَّع{' '}
          {previewTotal} من {targetNum} ساعة. اختر أيامًا أكثر بدل رفع الحد اليومي فوق
          الحد القانوني.
        </div>
      )}
    </Dialog>
  );
}
