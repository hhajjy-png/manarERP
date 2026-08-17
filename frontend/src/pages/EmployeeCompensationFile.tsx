/**
 * ملف الموظف السنوي — الاثنا عشر شهرًا + الملخّص السنوي.
 *
 * الشاشة الوسطى في التدفق. الشبكة **٤ أعمدة × ٣ صفوف** ثابتة على سطح المكتب، فتقع
 * الأشهر الاثنا عشر في مستطيل مكتمل بلا صفّ أخير أعرج. كل بطاقة بارتفاع أدنى موحّد
 * سواء أُنشئ الشهر أم لا، فالشبكة لا تتعرّج بين حالتين.
 *
 * الملخّص السنوي **خاص بهذه الوحدة وحدها** ولا يُرحَّل إلى أي وحدة مالية — مذكور
 * صراحةً في الشاشة كي لا يُقرأ خطأً على أنه رقم رواتب.
 *
 * `xpl-scope` على الجذر إلزامي: هو حامل توكينات الألوان (انظر EmployeeCompensation.css).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { compensationApi } from '../employee-compensation/api';
import { OVERTIME_LABEL_AR, monthNameAr, selectableYears } from '../employee-compensation/labels';
import '../employee-compensation/OvertimeDailyLedger.css';
import type {
  AnnualFile,
  DebtSummary,
  MonthCell,
  OvertimeHistoryRow,
  OvertimeType,
} from '../employee-compensation/types';
import {
  Button,
  ErrorBanner,
  ExecutiveHeader,
  IdChip,
  SectionCard,
  SkeletonRows,
  StatusChip,
} from '../components/explorer/ExplorerKit';
import '../components/explorer/explorer-kit.css';
import './EmployeeCompensation.css';
import { money } from '../config/modules';
import { useT } from '../lib/i18n';

export default function EmployeeCompensationFile() {
  const { t } = useT();
  const navigate = useNavigate();
  const { employeeId, year: yearParam } = useParams<{ employeeId: string; year: string }>();
  const employeeIdNum = Number(employeeId);
  const year = Number(yearParam);
  const years = useMemo(() => selectableYears(), []);

  const [file, setFile] = useState<AnnualFile | null>(null);
  const [debtSummary, setDebtSummary] = useState<DebtSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    if (!Number.isFinite(employeeIdNum) || !Number.isFinite(year)) return;
    setLoading(true);
    setError('');
    compensationApi
      .annualFile(employeeIdNum, year)
      .then(setFile)
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }, [employeeIdNum, year]);

  useEffect(load, [load]);

  /**
   * ملخّص المديونيات — طلب مستقلّ **بلا سنة**: السجل يمتدّ عبر السنوات، ومديونية
   * ٢٠٢٦ تظهر في ملف ٢٠٢٧ كما هي (المتطلب ٢٢). لذلك لا يُعاد جلبه عند تبديل السنة.
   */
  useEffect(() => {
    if (!Number.isFinite(employeeIdNum)) return;
    let cancelled = false;
    compensationApi
      .debts(employeeIdNum)
      .then((l) => { if (!cancelled) setDebtSummary(l.summary); })
      .catch(() => { /* قسم مساعد؛ فشله لا يمنع عرض الملف السنوي */ });
    return () => { cancelled = true; };
  }, [employeeIdNum]);

  const openMonth = (month: number) => navigate(`/employee-compensation/${employeeIdNum}/${year}/${month}`);

  if (loading) {
    return (
      <div className="xpl-scope xpl-page ecmp-page">
        <SectionCard><SkeletonRows rows={6} /></SectionCard>
      </div>
    );
  }

  if (error || !file) {
    return (
      <div className="xpl-scope xpl-page ecmp-page">
        <ErrorBanner>{error || t('ecmp.file.load_failed')}</ErrorBanner>
        <Button icon="arrow_forward" onClick={() => navigate('/employee-compensation')}>{t('ecmp.action.back_to_list')}</Button>
      </div>
    );
  }

  const { employee, months, yearSummary } = file;

  return (
    <div className="xpl-scope xpl-page ecmp-page">
      <ExecutiveHeader
        icon="folder_shared"
        title={employee.fullName}
        subtitle={t('ecmp.file.subtitle', { year })}
        onBack={() => navigate('/employee-compensation')}
        chips={
          <>
            <IdChip icon="badge">{employee.code}</IdChip>
            {employee.jobTitle && <IdChip icon="work">{employee.jobTitle}</IdChip>}
            {employee.department && <IdChip icon="apartment">{employee.department}</IdChip>}
            <IdChip icon="payments" tone="green">
              {t('ecmp.file.current_salary', { amount: money(employee.currentBasicSalary) })}
            </IdChip>
            <IdChip icon="event_available" tone="indigo">
              {t('ecmp.file.months_chip', { done: yearSummary.createdMonths, approved: yearSummary.approvedMonths })}
            </IdChip>
          </>
        }
        aside={
          <div className="ecmp-year-switch">
            <label htmlFor="ecmp-file-year">{t('ecmp.year')}</label>
            <select
              id="ecmp-file-year"
              value={year}
              onChange={(e) => navigate(`/employee-compensation/${employeeIdNum}/${e.target.value}`)}
            >
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        }
      />

      {/* الأشهر أولًا — هي سبب زيارة الصفحة. لا صفّ مؤشّرات يفصل الترويسة عنها. */}
      <SectionCard title={t('ecmp.file.months_section', { year })} icon="calendar_month">
        <div className="ecmp-month-grid">
          {months.map((m) => (
            <MonthTile key={m.month} cell={m} onOpen={() => openMonth(m.month)} />
          ))}
        </div>
      </SectionCard>

      {/*
        الالتزام السنوي (المتطلبان ٣٢ و٣٣) — قسم **مضغوط** لا لوحة معلومات.
        الأنواع الثلاثة معروضة منفصلة: حدود المادة ٦٦ تُقاس على العمل الإضافي العادي
        وحده، وعرضها فوق مجموعٍ يخلط الأنواع كان سيوحي بأنها تحكمها كلها.
      */}
      <SectionCard title="الالتزام القانوني للعمل الإضافي" icon="gavel">
        <div className="ecmp-summary-grid">
          <SummaryCount
            label={`ساعات الإضافي العادي / ${file.overtimeYtd.annualHoursLimit}`}
            value={file.overtimeYtd.regularHours}
          />
          <SummaryCount
            label={`أيام الإضافي العادي / ${file.overtimeYtd.annualDaysLimit}`}
            value={file.overtimeYtd.regularDays}
          />
          <SummaryCount label="ساعات الراحة الأسبوعية (م.٦٧)" value={file.overtimeYtd.weeklyRestHours} />
          <SummaryCount label="ساعات العطلة الرسمية (م.٦٨)" value={file.overtimeYtd.officialHolidayHours} />
          <SummaryCount label="أيام راحة بديلة مستحقّة" value={file.overtimeYtd.compensatoryRestPending} />
        </div>

        <OvertimeHistoryTable rows={file.overtimeHistory} onOpenMonth={openMonth} />
      </SectionCard>

      {/* المديونيات والسلف — قسم مضغوط، سجل واحد لكل السنوات لا نسخة لكل سنة. */}
      <SectionCard
        title={t('ecmp.file.debt_section')}
        icon="account_balance_wallet"
        actions={
          <Button small variant="primary" icon="open_in_new" onClick={() => navigate(`/employee-compensation/${employeeIdNum}/debts`)}>
            {t('ecmp.action.open_debts')}
          </Button>
        }
      >
        {debtSummary && debtSummary.totalDebts > 0 ? (
          <div className="ecmp-summary-grid">
            <SummaryCount label={t('ecmp.file.debt_open')} value={debtSummary.openDebts} />
            <SummaryRow label={t('ecmp.file.debt_remaining')} value={debtSummary.totalRemaining} strong highlight />
            <SummaryRow label={t('ecmp.file.debt_paid')} value={debtSummary.totalPaid} />
            <SummaryRow label={t('ecmp.debt.col.original')} value={debtSummary.totalOriginal} />
          </div>
        ) : (
          <p className="ecmp-scope-note" style={{ marginTop: 0 }}>{t('ecmp.file.debt_none')}</p>
        )}
      </SectionCard>

      {/* الملخّص ملاصق للشبكة مباشرةً — صفّ واحد مضغوط لا ستّ بطاقات ضخمة. */}
      <SectionCard title={t('ecmp.file.summary_section')} icon="summarize">
        <div className="ecmp-summary-grid">
          <SummaryRow label={t('ecmp.sum.basic')} value={yearSummary.totalBasic} />
          <SummaryRow label={t('ecmp.sum.overtime')} value={yearSummary.totalOvertime} />
          <SummaryRow label={t('ecmp.sum.other_earnings')} value={yearSummary.totalOtherEarnings} />
          <SummaryRow label={t('ecmp.sum.gross')} value={yearSummary.totalGross} strong />
          <SummaryRow label={t('ecmp.sum.deductions')} value={yearSummary.totalDeductions} negative />
          <SummaryRow label={t('ecmp.sum.net')} value={yearSummary.totalNet} strong highlight />
        </div>
        <p className="ecmp-scope-note">{t('ecmp.file.summary_scope_note')}</p>
      </SectionCard>
    </div>
  );
}

/**
 * سجلّ الإضافي السنوي (المتطلب ٣٣) — ترشيح بالنوع وبحث بالتاريخ.
 *
 * الترشيح يقع على قائمة جاهزة وصلت مع الملف، بلا طلب شبكة لكل تغيير مرشِّح. البحث
 * نصّي على `YYYY-MM-DD` **وعلى صيغة العرض معًا**، فيجد المستخدمُ يومًا سواء كتب
 * `2026-08` أو `08/2026` — ولا يُنشأ `Date` في أي من الحالتين فلا ينزلق يوم.
 */
function OvertimeHistoryTable({
  rows,
  onOpenMonth,
}: {
  rows: OvertimeHistoryRow[];
  onOpenMonth: (month: number) => void;
}) {
  const [filter, setFilter] = useState<OvertimeType | 'ALL'>('ALL');
  const [search, setSearch] = useState('');

  const shown = useMemo(() => {
    const q = search.trim();
    return rows.filter((r) => {
      if (filter !== 'ALL' && r.overtimeType !== filter) return false;
      if (!q) return true;
      const display = `${r.date.slice(8, 10)}/${r.date.slice(5, 7)}/${r.date.slice(0, 4)}`;
      return r.date.includes(q) || display.includes(q);
    });
  }, [rows, filter, search]);

  if (rows.length === 0) {
    return (
      <p className="ecmp-scope-note">
        لا توجد تفاصيل يومية مسجَّلة لهذه السنة. الأشهر المحفوظة بإجماليات شهرية فقط
        تبقى كما هي بلا تواريخ مصطنعة.
      </p>
    );
  }

  const totalHours = Number(shown.reduce((s, r) => s + r.hours, 0).toFixed(3));

  return (
    <div className="ecmp-history">
      <div className="ecmp-history-bar">
        <div className="ecmp-history-filters">
          {(['ALL', 'REGULAR', 'WEEKLY_REST', 'OFFICIAL_HOLIDAY'] as const).map((k) => (
            <button
              key={k}
              type="button"
              className={filter === k ? 'is-active' : ''}
              onClick={() => setFilter(k)}
            >
              {k === 'ALL' ? 'كل الأنواع' : OVERTIME_LABEL_AR[k]}
            </button>
          ))}
        </div>
        <input
          className="ecmp-history-search"
          value={search}
          placeholder="بحث بالتاريخ…"
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="ecmp-day-table-wrap">
        <table className="ecmp-day-table">
          <thead>
            <tr>
              <th>التاريخ</th>
              <th>الشهر</th>
              <th>النوع</th>
              <th className="num">الساعات</th>
              <th>الراحة البديلة</th>
              <th aria-label="فتح" />
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={`${r.date}-${r.overtimeType}-${i}`}>
                <td>{`${r.date.slice(8, 10)}/${r.date.slice(5, 7)}/${r.date.slice(0, 4)}`}</td>
                <td>{monthNameAr(r.month)}</td>
                <td>{OVERTIME_LABEL_AR[r.overtimeType]}</td>
                <td className="num">{r.hours}</td>
                <td>
                  {r.compensatoryRestStatus == null ? (
                    <span className="ecmp-cmp-sub">—</span>
                  ) : (
                    <span className={`ecmp-rest-chip s-${r.compensatoryRestStatus}`}>
                      {r.compensatoryRestStatus === 'PENDING'
                        ? 'مستحق'
                        : r.compensatoryRestStatus === 'SCHEDULED'
                          ? 'مجدول'
                          : 'أُخذ'}
                    </span>
                  )}
                </td>
                <td className="ecmp-day-row-actions">
                  <Button
                    small
                    variant="ghost"
                    icon="open_in_new"
                    aria-label="فتح الشهر"
                    onClick={() => onOpenMonth(r.month)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="ecmp-scope-note">
        {shown.length} يوم — {totalHours} ساعة
        {shown.length !== rows.length ? ` (من ${rows.length} يومًا)` : ''}
      </p>
    </div>
  );
}

/** خليّة عدّ — لا تمرّ بمنسّق العملة، فـ«٣ مديونيات» ليست مبلغًا. */
function SummaryCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="ecmp-summary-row">
      <span className="ecmp-summary-label">{label}</span>
      <span className="ecmp-summary-value">{value}</span>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  strong,
  negative,
  highlight,
}: {
  label: string;
  value: number;
  strong?: boolean;
  negative?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className={`ecmp-summary-row${strong ? ' is-strong' : ''}${highlight ? ' is-highlight' : ''}`}>
      <span className="ecmp-summary-label">{label}</span>
      <span className={`ecmp-summary-value${negative ? ' is-negative' : ''}`}>
        {negative && value > 0 ? `(${money(value)})` : money(value)}
      </span>
    </div>
  );
}

/**
 * بطاقة شهر — تراتب ثابت: الاسم والحالة أعلى، والصافي أسفل بوصفه البطل البصري،
 * وسطر مصغّر واحد للتفاصيل. لا جدول داخل بطاقة، ولا خمسة أسطر متساوية الوزن.
 */
function MonthTile({ cell, onOpen }: { cell: MonthCell; onOpen: () => void }) {
  const { t } = useT();
  const name = monthNameAr(cell.month);

  if (!cell.exists) {
    return (
      <button type="button" className="ecmp-month ecmp-month--empty" onClick={onOpen}>
        <span className="ecmp-month-name">{name}</span>
        <span className="ecmp-month-empty-label">{t('ecmp.month.not_created')}</span>
        <span className="ecmp-month-cta">
          <span className="material-symbols-outlined" aria-hidden="true">add_circle</span>
          {t('ecmp.month.create')}
        </span>
      </button>
    );
  }

  return (
    <button type="button" className="ecmp-month" onClick={onOpen}>
      <div className="ecmp-month-head">
        <span className="ecmp-month-name">{name}</span>
        <StatusChip tone={cell.status === 'APPROVED' ? 'green' : 'orange'}>
          {t(cell.status === 'APPROVED' ? 'ecmp.status.approved' : 'ecmp.status.draft')}
        </StatusChip>
      </div>

      <div className="ecmp-month-mini">
        <span>{t('ecmp.sum.overtime')} <b>{money(cell.totalOvertimeAmount ?? 0)}</b></span>
        {(cell.overtimeHours ?? 0) > 0 && <span>{t('ecmp.month.hours', { hours: cell.overtimeHours ?? 0 })}</span>}
        {(cell.totalDeductions ?? 0) > 0 && (
          <span className="is-negative">{t('ecmp.sum.deductions')} <b>{money(cell.totalDeductions ?? 0)}</b></span>
        )}
      </div>

      <div className="ecmp-month-net">
        <span>{t('ecmp.sum.net')}</span>
        <strong>{money(cell.netAmount ?? 0)}</strong>
      </div>

      <span className="ecmp-month-cta">
        <span className="material-symbols-outlined" aria-hidden="true">open_in_new</span>
        {t('ecmp.month.open')}
      </span>
    </button>
  );
}
