/**
 * محرّر حسبة الشهر — الشاشة العميقة في التدفق.
 *
 * ═══ مبدأ واحد يحكم هذا الملف ═══
 * **لا معادلة حسابية هنا.** كل رقم يُعرض (أجر الساعة، قيمة السطر، الإجماليات، الصافي،
 * التحذيرات) يأتي من `POST /employee-compensation/preview` — أي من **نفس** المحرّك
 * الذي سيحفظ. لو حسبت الواجهة رقمًا بنفسها لأمكن أن تعرض غير ما تخزّن، وهو بالضبط
 * الخطأ الذي يجعل كشفًا موقَّعًا يخالف قاعدة البيانات.
 *
 * ═══ الاعتماد لا يقفل شيئًا ═══
 * لا حقل يُعطَّل بعد الاعتماد، ولا زر «إعادة فتح»، ولا صلاحية له. الحالة وسمٌ تنظيمي.
 *
 * ═══ تنظيم الشاشة ═══
 * ترويسة مضغوطة ← شريط ملخّص حيّ لاصق ← ثلاث بطاقات (إضافي · استحقاقات · استقطاعات)
 * ← ملاحظات ← شريط إجراءات بتراتب: أساسي · مستند · قائمة ثانوية.
 * «الحسبة العكسية» تعيش **داخل** ترويسة بطاقة العمل الإضافي، حيث تُستعمل.
 *
 * `xpl-scope` على الجذر إلزامي — هو حامل توكينات ألوان الأزرار.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { compensationApi } from '../employee-compensation/api';
import {
  DEBT_TYPE_LABEL_AR,
  DEDUCTION_LABEL_AR,
  EARNING_LABEL_AR,
  OVERTIME_LABEL_LONG_AR,
  SELECTABLE_DEDUCTION_TYPES,
  monthNameAr,
} from '../employee-compensation/labels';
import type {
  Calculation,
  CalculationDraft,
  CompensationWarning,
  Debt,
  DeductionType,
  EarningType,
  OvertimeType,
  PreviewResult,
  ReverseResult,
} from '../employee-compensation/types';
import {
  Button,
  Dialog,
  ErrorBanner,
  ExecutiveHeader,
  IdChip,
  SectionCard,
  SkeletonRows,
  StatusChip,
} from '../components/explorer/ExplorerKit';
import ConfirmModal from '../components/ConfirmModal';
import '../components/explorer/explorer-kit.css';
import './EmployeeCompensation.css';
import { money } from '../config/modules';
import { withFormOpenIntent } from '../forms/shared/formOpenIntent';
import { formatDate } from '../lib/date';
import { useT } from '../lib/i18n';

// ─────────────────────────────────────────────────────────────────────────────
//  حالة التحرير — نصوص لا أرقام
//
//  الحقول الرقمية تُحفظ نصًّا أثناء الكتابة كي لا يمحو `Number('')` ما يكتبه
//  المستخدم في منتصف الإدخال («٠٫» ليست عددًا بعد). التحويل يقع عند الإرسال وحده.
// ─────────────────────────────────────────────────────────────────────────────

interface OvertimeDraftRow {
  key: string;
  overtimeType: OvertimeType;
  hours: string;
  calculationMethod: 'MANUAL_HOURS' | 'REVERSE_FROM_AMOUNT';
  reverseTargetAmount: number | null;
  rawHoursBeforeCeiling: number | null;
  notes: string;
}
interface EarningDraftRow {
  key: string;
  type: EarningType;
  label: string;
  amount: string;
  reason: string;
  notes: string;
  recurring: boolean;
}
interface DeductionDraftRow {
  key: string;
  type: DeductionType;
  label: string;
  amount: string;
  notes: string;
  /** سجل المديونية — موجود لسطر `DEBT_REPAYMENT` وحده، ويأتي من حوار الاستقطاع. */
  debtId: number | null;
}

let keySeq = 0;
const nextKey = () => `r${++keySeq}`;
const toNumber = (v: string): number => {
  const n = Number(String(v).trim());
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

export default function EmployeeCompensationMonth() {
  const { t } = useT();
  const navigate = useNavigate();
  const { employeeId, year: yearParam, month: monthParam } = useParams<{ employeeId: string; year: string; month: string }>();
  const employeeIdNum = Number(employeeId);
  const year = Number(yearParam);
  const month = Number(monthParam);

  const [saved, setSaved] = useState<Calculation | null>(null);
  const [basicSalary, setBasicSalary] = useState<number | null>(null);
  const [employeeHeader, setEmployeeHeader] = useState<{ code: string; fullName: string; jobTitle: string | null } | null>(null);
  const [overtime, setOvertime] = useState<OvertimeDraftRow[]>([]);
  const [earnings, setEarnings] = useState<EarningDraftRow[]>([]);
  const [deductions, setDeductions] = useState<DeductionDraftRow[]>([]);
  const [notes, setNotes] = useState('');

  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');
  const [reverseOpen, setReverseOpen] = useState(false);
  const [openDebts, setOpenDebts] = useState<Debt[]>([]);
  const [debtDialogOpen, setDebtDialogOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);

  const monthLabel = useMemo(() => (month >= 1 && month <= 12 ? monthNameAr(month) : String(month)), [month]);

  /** يعبّئ حالة التحرير من سجل محفوظ. */
  const hydrate = useCallback((calc: Calculation) => {
    setSaved(calc);
    setBasicSalary(calc.basicSalarySnapshot);
    setEmployeeHeader({ code: calc.employeeNumberSnapshot, fullName: calc.employeeNameSnapshot, jobTitle: calc.jobTitleSnapshot });
    setOvertime(
      calc.overtimeLines.map((l) => ({
        key: nextKey(),
        overtimeType: l.overtimeType,
        hours: String(l.hours),
        calculationMethod: l.calculationMethod,
        reverseTargetAmount: l.reverseTargetAmount,
        rawHoursBeforeCeiling: l.rawHoursBeforeCeiling,
        notes: l.notes ?? '',
      })),
    );
    setEarnings(
      calc.earningLines.map((l) => ({
        key: nextKey(), type: l.type, label: l.label, amount: String(l.amount),
        reason: l.reason ?? '', notes: l.notes ?? '', recurring: l.recurring,
      })),
    );
    setDeductions(
      calc.deductionLines.map((l) => ({
        key: nextKey(), type: l.type, label: l.label, amount: String(l.amount),
        notes: l.notes ?? '', debtId: l.debtId,
      })),
    );
    setNotes(calc.notes ?? '');
  }, []);

  /** التحميل الأوّلي: سجل محفوظ إن وُجد، وإلا رأس الموظف وراتبه الحالي لحسبة جديدة. */
  useEffect(() => {
    if (!Number.isFinite(employeeIdNum) || !Number.isFinite(year) || !Number.isFinite(month)) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    compensationApi
      .month(employeeIdNum, year, month)
      .then(async (calc) => {
        if (cancelled) return;
        if (calc) {
          hydrate(calc);
          return;
        }
        const file = await compensationApi.annualFile(employeeIdNum, year);
        if (cancelled) return;
        setSaved(null);
        setBasicSalary(file.employee.currentBasicSalary);
        setEmployeeHeader({ code: file.employee.code, fullName: file.employee.fullName, jobTitle: file.employee.jobTitle });
      })
      .catch((e) => !cancelled && setError(errorMessage(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [employeeIdNum, year, month, hydrate]);

  /**
   * أرصدة المديونيات المفتوحة — طلب مستقلّ عن الحسبة.
   * يُعاد جلبه بعد كل حفظ لأن الحفظ نفسه يغيّر الأرصدة (سداد الشهر حركة في الدفتر).
   */
  const reloadOpenDebts = useCallback(() => {
    if (!Number.isFinite(employeeIdNum)) return;
    compensationApi
      .openDebts(employeeIdNum)
      .then(setOpenDebts)
      .catch(() => { /* السجل مساعد؛ فشل تحميله لا يمنع تحرير الحسبة */ });
  }, [employeeIdNum]);

  useEffect(reloadOpenDebts, [reloadOpenDebts]);

  /** جسم الحفظ/المعاينة — مشتقّ واحد يستهلكه المساران، فلا يتباعد ما يُعاين عمّا يُحفظ. */
  const draft: CalculationDraft = useMemo(
    () => ({
      overtime: overtime.map((r) => ({
        overtimeType: r.overtimeType,
        hours: toNumber(r.hours),
        calculationMethod: r.calculationMethod,
        reverseTargetAmount: r.reverseTargetAmount,
        rawHoursBeforeCeiling: r.rawHoursBeforeCeiling,
        notes: r.notes.trim() || null,
      })),
      earnings: earnings
        .filter((r) => r.label.trim())
        .map((r) => ({
          type: r.type, label: r.label.trim(), amount: toNumber(r.amount),
          reason: r.reason.trim() || null, notes: r.notes.trim() || null, recurring: r.recurring,
        })),
      deductions: deductions
        .filter((r) => r.label.trim())
        .map((r) => ({
          type: r.type, label: r.label.trim(), amount: toNumber(r.amount),
          notes: r.notes.trim() || null, debtId: r.debtId,
        })),
      notes: notes.trim() || null,
    }),
    [overtime, earnings, deductions, notes],
  );

  /**
   * معاينة حيّة من محرّك الخادم، بتأخير قصير.
   * التأخير ليس تحسينًا للأداء (الخادم على 127.0.0.1) بل يمنع وميض الأرقام بين
   * ضغطتَي مفتاح متتاليتين.
   */
  const draftKey = JSON.stringify(draft);
  const previewSeq = useRef(0);
  useEffect(() => {
    if (basicSalary == null || basicSalary <= 0) return;
    const seq = ++previewSeq.current;
    const timer = setTimeout(() => {
      compensationApi
        .preview({
          ...draft,
          basicSalary,
          hourlyRateOverride: saved?.hourlyRateSnapshot ?? null,
        })
        // تجاهل استجابة قديمة وصلت بعد أحدث منها — وإلا ارتدّت الأرقام إلى الوراء.
        .then((res) => { if (seq === previewSeq.current) setPreview(res); })
        .catch(() => { /* المعاينة مساعدة؛ فشلها لا يمنع التحرير ولا الحفظ */ });
    }, 180);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey, basicSalary, saved?.hourlyRateSnapshot]);

  const notify = (msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(''), 3500);
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const handleSave = () =>
    run(async () => {
      const calc = saved
        ? await compensationApi.update(saved.id, draft)
        : await compensationApi.create(employeeIdNum, year, month, draft);
      hydrate(calc);
      reloadOpenDebts();
      notify(t('ecmp.msg.saved'));
    });

  const handleApprove = () =>
    run(async () => {
      if (!saved) {
        const calc = await compensationApi.create(employeeIdNum, year, month, draft);
        hydrate(await compensationApi.approve(calc.id));
      } else {
        await compensationApi.update(saved.id, draft);
        hydrate(await compensationApi.approve(saved.id));
      }
      reloadOpenDebts();
      notify(t('ecmp.msg.approved'));
    });

  const handleDelete = () =>
    run(async () => {
      if (!saved) return;
      await compensationApi.remove(saved.id);
      navigate(`/employee-compensation/${employeeIdNum}/${year}`);
    });

  const handleCopyPrevious = () =>
    run(async () => {
      const calc = await compensationApi.copyPrevious(employeeIdNum, year, month);
      hydrate(calc);
      const from = calc.copiedFrom;
      setCopyNotice(
        from && from.basicSalarySnapshot !== from.newBasicSalarySnapshot
          ? t('ecmp.msg.copied_salary_changed', {
              month: monthNameAr(from.month),
              oldSalary: money(from.basicSalarySnapshot),
              newSalary: money(from.newBasicSalarySnapshot),
            })
          : t('ecmp.msg.copied', { month: from ? monthNameAr(from.month) : '' }),
      );
      // سطور سداد المديونيات لا تُنسخ — يُقال صراحةً بدل أن يكتشفه المستخدم بنفسه.
      if (from && from.skippedDebtRepayments > 0) {
        setCopyNotice((prev) => `${prev ?? ''} ${t('ecmp.msg.copied_debt_skipped', { count: from.skippedDebtRepayments })}`.trim());
      }
      reloadOpenDebts();
    });

  /** يضيف سطر سداد مديونية — النوع والمرجع يُضبطان هنا لا يكتبهما المستخدم. */
  const applyDebtRepayment = (debt: Debt, amount: number) => {
    setDeductions((rows) => [
      ...rows,
      {
        key: nextKey(),
        type: 'DEBT_REPAYMENT',
        label: `${t('ecmp.debt.repayment_prefix')} ${debt.label}`,
        amount: String(amount),
        notes: '',
        debtId: debt.id,
      },
    ]);
    setDebtDialogOpen(false);
  };

  const applyReverse = (result: ReverseResult) => {
    setOvertime((rows) => [
      ...rows,
      {
        key: nextKey(),
        overtimeType: result.overtimeType,
        hours: String(result.hours),
        // بعد التقريب تُعامَل الساعات كأي ساعات يدوية؛ الطريقة تُحفظ للتدقيق الداخلي وحده.
        calculationMethod: 'REVERSE_FROM_AMOUNT',
        reverseTargetAmount: result.targetAmount,
        rawHoursBeforeCeiling: result.rawHours,
        notes: '',
      },
    ]);
    setReverseOpen(false);
  };

  if (loading) {
    return <div className="xpl-scope xpl-page ecmp-page"><SectionCard><SkeletonRows rows={6} /></SectionCard></div>;
  }

  if (basicSalary == null) {
    return (
      <div className="xpl-scope xpl-page ecmp-page">
        <ErrorBanner>{error || t('ecmp.month.load_failed')}</ErrorBanner>
        <Button icon="arrow_forward" onClick={() => navigate(`/employee-compensation/${employeeIdNum}/${year}`)}>
          {t('ecmp.action.back_to_file')}
        </Button>
      </div>
    );
  }

  const totals = preview;
  // الرصيد القائم يصل محسوبًا من الخادم لكل مديونية — هذا مجرّد عرض لمجموعها.
  const debtOutstanding = openDebts.reduce((sum, d) => sum + d.remainingAmount, 0);
  const statementPath = saved ? `/employee-compensation/statement/${saved.id}` : '';
  const detailedPath = saved ? `/employee-compensation/detailed/${saved.id}` : '';

  return (
    <div className="xpl-scope xpl-page ecmp-page ecmp-month-page">
      <ExecutiveHeader
        icon="request_quote"
        title={t('ecmp.month.title', { month: monthLabel, year })}
        subtitle={employeeHeader?.fullName ?? ''}
        onBack={() => navigate(`/employee-compensation/${employeeIdNum}/${year}`)}
        chips={
          <>
            {employeeHeader && <IdChip icon="badge">{employeeHeader.code}</IdChip>}
            {employeeHeader?.jobTitle && <IdChip icon="work">{employeeHeader.jobTitle}</IdChip>}
            <IdChip icon="payments" tone="green">{t('ecmp.month.basic_used', { amount: money(basicSalary) })}</IdChip>
            {saved ? (
              <StatusChip tone={saved.status === 'APPROVED' ? 'green' : 'orange'}>
                {t(saved.status === 'APPROVED' ? 'ecmp.status.approved' : 'ecmp.status.draft')}
              </StatusChip>
            ) : (
              <StatusChip tone="neutral">{t('ecmp.status.new')}</StatusChip>
            )}
          </>
        }
      />

      {/* ── شريط الملخّص الحيّ — يبقى ظاهرًا أثناء التمرير ─────────────────── */}
      <div className="ecmp-live-summary">
        <div className="ecmp-summary-grid">
          <SummaryCell label={t('ecmp.sum.basic')} value={totals?.basicSalary ?? basicSalary} />
          <SummaryCell label={t('ecmp.sum.overtime')} value={totals?.totalOvertimeAmount ?? 0} />
          <SummaryCell label={t('ecmp.sum.other_earnings')} value={totals?.totalOtherEarnings ?? 0} />
          <SummaryCell label={t('ecmp.sum.gross')} value={totals?.grossEntitlements ?? 0} strong />
          <SummaryCell label={t('ecmp.sum.deductions')} value={totals?.totalDeductions ?? 0} negative />
          <SummaryCell label={t('ecmp.sum.net')} value={totals?.netAmount ?? 0} strong highlight />
        </div>
      </div>

      {error && <ErrorBanner>{error}</ErrorBanner>}
      {flash && <div className="ecmp-flash" role="status">{flash}</div>}
      {copyNotice && (
        <div className="ecmp-notice" role="status">
          <span className="material-symbols-outlined" aria-hidden="true">content_copy</span>
          <span>{copyNotice}</span>
          <button type="button" className="ecmp-notice-close" onClick={() => setCopyNotice(null)} aria-label={t('action.close')}>×</button>
        </div>
      )}

      {totals && totals.warnings.length > 0 && (
        <div className="ecmp-warnings">
          {totals.warnings.map((w) => <WarningRow key={w.code} warning={w} />)}
        </div>
      )}

      {/* ── العمل الإضافي — الحسبة العكسية داخل ترويسته حيث تُستعمل ────────── */}
      <SectionCard
        title={t('ecmp.section.overtime')}
        icon="schedule"
        actions={
          <>
            <Button small variant="secondary" icon="calculate" onClick={() => setReverseOpen(true)}>
              {t('ecmp.action.reverse')}
            </Button>
            <Button
              small
              variant="primary"
              icon="add"
              onClick={() =>
                setOvertime((r) => [
                  ...r,
                  { key: nextKey(), overtimeType: 'REGULAR', hours: '', calculationMethod: 'MANUAL_HOURS', reverseTargetAmount: null, rawHoursBeforeCeiling: null, notes: '' },
                ])
              }
            >
              {t('ecmp.action.add_overtime')}
            </Button>
          </>
        }
        padded={false}
      >
        {overtime.length === 0 ? (
          <InlineEmpty icon="schedule" text={t('ecmp.overtime.empty')} />
        ) : (
          <div className="ecmp-table-wrap">
            <table className="ecmp-table ecmp-table--edit">
              <thead>
                <tr>
                  <th>{t('ecmp.col.ot_type')}</th>
                  <th className="ecmp-col-num">{t('ecmp.col.hours')}</th>
                  <th className="ecmp-col-num">{t('ecmp.col.hourly_rate')}</th>
                  <th className="ecmp-col-num">{t('ecmp.col.multiplier')}</th>
                  <th className="ecmp-col-num">{t('ecmp.col.amount')}</th>
                  <th>{t('ecmp.col.notes')}</th>
                  <th aria-label={t('ecmp.col.actions')} />
                </tr>
              </thead>
              <tbody>
                {overtime.map((row, i) => {
                  const computed = totals?.overtimeLines[i];
                  return (
                    <tr key={row.key}>
                      <td>
                        <select
                          value={row.overtimeType}
                          aria-label={t('ecmp.col.ot_type')}
                          onChange={(e) =>
                            setOvertime((rows) =>
                              rows.map((r) => (r.key === row.key ? { ...r, overtimeType: e.target.value as OvertimeType } : r)),
                            )
                          }
                        >
                          {(Object.keys(OVERTIME_LABEL_LONG_AR) as OvertimeType[]).map((k) => (
                            <option key={k} value={k}>{OVERTIME_LABEL_LONG_AR[k]}</option>
                          ))}
                        </select>
                        {row.calculationMethod === 'REVERSE_FROM_AMOUNT' && (
                          <span className="ecmp-method-tag" title={t('ecmp.reverse.tag_title')}>
                            {t('ecmp.reverse.tag')}
                          </span>
                        )}
                      </td>
                      <td className="ecmp-col-num">
                        <input
                          type="number" lang="en" min="0" step="0.5" inputMode="decimal"
                          aria-label={t('ecmp.col.hours')}
                          value={row.hours}
                          onChange={(e) =>
                            setOvertime((rows) =>
                              rows.map((r) =>
                                r.key === row.key
                                  // تعديل الساعات يدويًا يُلغي وسم «الحسبة العكسية»: الرقم لم يعد
                                  // ناتج ذلك المبلغ المستهدف، فإبقاء الوسم كان سيوثّق أثرًا كاذبًا.
                                  ? { ...r, hours: e.target.value, calculationMethod: 'MANUAL_HOURS', reverseTargetAmount: null, rawHoursBeforeCeiling: null }
                                  : r,
                              ),
                            )
                          }
                        />
                      </td>
                      <td className="ecmp-col-num ecmp-derived">{computed ? money(computed.hourlyRate) : '—'}</td>
                      <td className="ecmp-col-num ecmp-derived">{computed ? `×${computed.multiplier}` : '—'}</td>
                      <td className="ecmp-col-num ecmp-amount">{computed ? money(computed.amount) : '—'}</td>
                      <td>
                        <input
                          type="text" aria-label={t('ecmp.col.notes')} value={row.notes}
                          onChange={(e) => setOvertime((rows) => rows.map((r) => (r.key === row.key ? { ...r, notes: e.target.value } : r)))}
                        />
                      </td>
                      <td className="ecmp-row-action">
                        <Button small variant="ghost" iconOnly icon="delete" aria-label={t('action.delete')}
                          onClick={() => setOvertime((rows) => rows.filter((r) => r.key !== row.key))} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* ── الاستحقاقات الأخرى ────────────────────────────────────────────── */}
      <LineSection
        title={t('ecmp.section.earnings')}
        icon="card_giftcard"
        addLabel={t('ecmp.action.add_earning')}
        emptyText={t('ecmp.earnings.empty')}
        onAdd={() => setEarnings((r) => [...r, { key: nextKey(), type: 'BONUS', label: '', amount: '', reason: '', notes: '', recurring: false }])}
        rows={earnings}
        headers={[t('ecmp.col.type'), t('ecmp.col.label'), t('ecmp.col.amount'), t('ecmp.col.reason'), t('ecmp.col.notes')]}
        renderRow={(row) => (
          <>
            <td>
              <select
                value={row.type} aria-label={t('ecmp.col.type')}
                onChange={(e) => setEarnings((rows) => rows.map((r) => (r.key === row.key ? { ...r, type: e.target.value as EarningType } : r)))}
              >
                {(Object.keys(EARNING_LABEL_AR) as EarningType[]).map((k) => (
                  <option key={k} value={k}>{EARNING_LABEL_AR[k]}</option>
                ))}
              </select>
            </td>
            <td>
              <input type="text" aria-label={t('ecmp.col.label')} placeholder={t('ecmp.ph.earning_label')} value={row.label}
                onChange={(e) => setEarnings((rows) => rows.map((r) => (r.key === row.key ? { ...r, label: e.target.value } : r)))} />
            </td>
            <td className="ecmp-col-num">
              <input type="number" lang="en" min="0" step="0.001" inputMode="decimal" aria-label={t('ecmp.col.amount')} value={row.amount}
                onChange={(e) => setEarnings((rows) => rows.map((r) => (r.key === row.key ? { ...r, amount: e.target.value } : r)))} />
            </td>
            <td>
              <input type="text" aria-label={t('ecmp.col.reason')} value={row.reason}
                onChange={(e) => setEarnings((rows) => rows.map((r) => (r.key === row.key ? { ...r, reason: e.target.value } : r)))} />
            </td>
            <td>
              <input type="text" aria-label={t('ecmp.col.notes')} value={row.notes}
                onChange={(e) => setEarnings((rows) => rows.map((r) => (r.key === row.key ? { ...r, notes: e.target.value } : r)))} />
            </td>
            <td className="ecmp-row-action">
              <Button small variant="ghost" iconOnly icon="delete" aria-label={t('action.delete')}
                onClick={() => setEarnings((rows) => rows.filter((r) => r.key !== row.key))} />
            </td>
          </>
        )}
      />

      {/* ── الاستقطاعات (يشمل سداد المديونيات) ──────────────────────────── */}
      <SectionCard
        title={t('ecmp.section.deductions')}
        icon="remove_circle"
        actions={
          <>
            <Button
              small variant="secondary" icon="account_balance_wallet"
              disabled={openDebts.length === 0}
              title={openDebts.length === 0 ? t('ecmp.debt.none_open') : undefined}
              onClick={() => setDebtDialogOpen(true)}
            >
              {t('ecmp.debt.deduct_action')}
            </Button>
            <Button
              small variant="primary" icon="add"
              onClick={() => setDeductions((r) => [...r, { key: nextKey(), type: 'ABSENCE', label: '', amount: '', notes: '', debtId: null }])}
            >
              {t('ecmp.action.add_deduction')}
            </Button>
          </>
        }
        padded={false}
      >
        {/* سطر معلومات مضغوط — لا لافتة ضخمة (المتطلب ١٦). */}
        {debtOutstanding > 0 && (
          <div className="ecmp-inline-info">
            <span className="material-symbols-outlined" aria-hidden="true">account_balance_wallet</span>
            <span>{t('ecmp.debt.outstanding_row', { amount: money(debtOutstanding), count: openDebts.length })}</span>
            <button
              type="button"
              className="ecmp-inline-link"
              onClick={() => navigate(`/employee-compensation/${employeeIdNum}/debts`)}
            >
              {t('ecmp.debt.open_ledger')}
            </button>
          </div>
        )}

        {deductions.length === 0 ? (
          <InlineEmpty icon="remove_circle" text={t('ecmp.deductions.empty')} />
        ) : (
          <div className="ecmp-table-wrap">
            <table className="ecmp-table ecmp-table--edit">
              <thead>
                <tr>
                  <th>{t('ecmp.col.type')}</th>
                  <th>{t('ecmp.col.label')}</th>
                  <th className="ecmp-col-num">{t('ecmp.col.amount')}</th>
                  <th>{t('ecmp.col.notes')}</th>
                  <th aria-label={t('ecmp.col.actions')} />
                </tr>
              </thead>
              <tbody>
                {deductions.map((row) => {
                  const isDebt = row.type === 'DEBT_REPAYMENT';
                  return (
                    <tr key={row.key}>
                      <td>
                        {isDebt ? (
                          // نوع سطر السداد **غير قابل للتبديل**: تغييره كان سيترك مرجع
                          // المديونية معلّقًا على سطر ليس سدادًا — والخادم يرفض ذلك.
                          <StatusChip tone="blue" icon="account_balance_wallet">
                            {DEDUCTION_LABEL_AR.DEBT_REPAYMENT}
                          </StatusChip>
                        ) : (
                          <select
                            value={row.type} aria-label={t('ecmp.col.type')}
                            onChange={(e) => setDeductions((rows) => rows.map((r) => (r.key === row.key ? { ...r, type: e.target.value as DeductionType } : r)))}
                          >
                            {SELECTABLE_DEDUCTION_TYPES.map((k) => (
                              <option key={k} value={k}>{DEDUCTION_LABEL_AR[k]}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td>
                        <input type="text" aria-label={t('ecmp.col.label')} placeholder={t('ecmp.ph.deduction_label')} value={row.label}
                          onChange={(e) => setDeductions((rows) => rows.map((r) => (r.key === row.key ? { ...r, label: e.target.value } : r)))} />
                      </td>
                      <td className="ecmp-col-num">
                        <input type="number" lang="en" min="0" step="0.001" inputMode="decimal" aria-label={t('ecmp.col.amount')} value={row.amount}
                          onChange={(e) => setDeductions((rows) => rows.map((r) => (r.key === row.key ? { ...r, amount: e.target.value } : r)))} />
                      </td>
                      <td>
                        <input type="text" aria-label={t('ecmp.col.notes')} value={row.notes}
                          onChange={(e) => setDeductions((rows) => rows.map((r) => (r.key === row.key ? { ...r, notes: e.target.value } : r)))} />
                      </td>
                      <td className="ecmp-row-action">
                        <Button small variant="ghost" iconOnly icon="delete" aria-label={t('action.delete')}
                          onClick={() => setDeductions((rows) => rows.filter((r) => r.key !== row.key))} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title={t('ecmp.section.notes')} icon="sticky_note_2">
        <textarea
          className="ecmp-notes" rows={2} value={notes} aria-label={t('ecmp.section.notes')}
          placeholder={t('ecmp.ph.notes')} onChange={(e) => setNotes(e.target.value)}
        />
        <p className="ecmp-scope-note">{t('ecmp.month.scope_note')}</p>
        {saved && (
          <p className="ecmp-meta-line">
            {t('ecmp.month.meta', { rules: saved.legalRulesVersion, rate: money(saved.hourlyRateSnapshot) })}
          </p>
        )}
      </SectionCard>

      {/* ── الإجراءات: أساسي · مستند · ثانوي ─────────────────────────────── */}
      <div className="ecmp-actions">
        <div className="ecmp-actions-group">
          <Button variant="primary" icon="save" busy={busy} onClick={handleSave}>{t('ecmp.action.save')}</Button>
          <Button variant="secondary" icon="verified" busy={busy} onClick={handleApprove}>{t('ecmp.action.approve')}</Button>
        </div>

        <span className="ecmp-actions-sep" />

        <div className="ecmp-actions-group">
          <Button icon="visibility" disabled={!saved} onClick={() => navigate(withFormOpenIntent(statementPath))}>
            {t('ecmp.action.preview_statement')}
          </Button>
          <Button icon="print" disabled={!saved} onClick={() => navigate(statementPath)}>{t('ecmp.action.print_statement')}</Button>
        </div>

        <span className="ecmp-actions-spacer" />

        <ActionMenu
          label={t('ecmp.action.more')}
          items={[
            { icon: 'description', label: t('ecmp.action.preview_detailed'), disabled: !saved, onClick: () => navigate(withFormOpenIntent(detailedPath)) },
            { icon: 'print', label: t('ecmp.action.print_detailed'), disabled: !saved, onClick: () => navigate(detailedPath) },
            { separator: true },
            { icon: 'content_copy', label: t('ecmp.action.copy_previous'), disabled: !!saved, onClick: () => void handleCopyPrevious() },
            { separator: true },
            { icon: 'delete', label: t('ecmp.action.delete'), disabled: !saved, danger: true, onClick: () => setConfirmDelete(true) },
          ]}
        />
      </div>

      {debtDialogOpen && (
        <DebtRepaymentDialog
          debts={openDebts}
          alreadyUsedDebtIds={deductions.map((d) => d.debtId).filter((x): x is number => x != null)}
          onApply={applyDebtRepayment}
          onClose={() => setDebtDialogOpen(false)}
        />
      )}

      {reverseOpen && (
        <ReverseDialog basicSalary={basicSalary} hourlyRate={saved?.hourlyRateSnapshot ?? null} onApply={applyReverse} onClose={() => setReverseOpen(false)} />
      )}

      {confirmDelete && (
        <ConfirmModal
          message={t('ecmp.confirm.delete', { month: monthLabel, year })}
          confirmLabel={t('ecmp.action.delete')}
          variant="danger"
          onConfirm={() => { setConfirmDelete(false); void handleDelete(); }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}

/** خليّة ملخّص — التسمية أخفت من القيمة عمدًا. */
function SummaryCell({ label, value, strong, negative, highlight }: { label: string; value: number; strong?: boolean; negative?: boolean; highlight?: boolean }) {
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
 * تنبيه قانوني — ثلاثة أوزان بصرية لثلاثة أسس مختلفة.
 * لا يجوز أن يبدو السقف المُشتَقّ أو الإفصاح كأنه حدّ منصوص فحصه النظام.
 */
function WarningRow({ warning }: { warning: CompensationWarning }) {
  const { t } = useT();
  const variant = warning.basis === 'STATUTORY' ? 'legal' : warning.basis === 'DERIVED' ? 'derived' : 'disclosure';
  const icon = warning.basis === 'STATUTORY' ? 'gavel' : warning.basis === 'DERIVED' ? 'warning' : 'info';
  const titleKey =
    warning.basis === 'STATUTORY' ? 'ecmp.warn.statutory' : warning.basis === 'DERIVED' ? 'ecmp.warn.derived' : 'ecmp.warn.disclosure';
  return (
    <div className={`ecmp-warning ecmp-warning--${variant}`} role={warning.basis === 'STATUTORY' ? 'alert' : 'note'}>
      <span className="material-symbols-outlined" aria-hidden="true">{icon}</span>
      <div>
        <strong>{t(titleKey)}</strong>
        <p>{warning.messageAr}</p>
      </div>
    </div>
  );
}

/** حالة فراغ داخل بطاقة — سطر واحد، لا لوحة بارتفاع مئات البكسلات. */
function InlineEmpty({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="xpl-card--pad" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--xpl-muted)', fontSize: 12.5 }}>
      <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 18 }}>{icon}</span>
      <span>{text}</span>
    </div>
  );
}

/** جدول بنود عام — يخدم الاستحقاقات والاستقطاعات بنفس البنية والتنسيق. */
function LineSection<T extends { key: string }>({
  title, icon, addLabel, emptyText, onAdd, rows, renderRow, headers,
}: {
  title: string;
  icon: string;
  addLabel: string;
  emptyText: string;
  onAdd: () => void;
  rows: T[];
  renderRow: (row: T) => React.ReactNode;
  headers: string[];
}) {
  const { t } = useT();
  return (
    <SectionCard
      title={title}
      icon={icon}
      actions={<Button small variant="primary" icon="add" onClick={onAdd}>{addLabel}</Button>}
      padded={false}
    >
      {rows.length === 0 ? (
        <InlineEmpty icon={icon} text={emptyText} />
      ) : (
        <div className="ecmp-table-wrap">
          <table className="ecmp-table ecmp-table--edit">
            <thead>
              <tr>
                {headers.map((h) => <th key={h}>{h}</th>)}
                <th aria-label={t('ecmp.col.actions')} />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => <tr key={row.key}>{renderRow(row)}</tr>)}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

interface MenuItem {
  icon?: string;
  label?: string;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
}

/**
 * قائمة الإجراءات الثانوية.
 *
 * وجودها هو التراتب نفسه: «حفظ» و«اعتماد» أزرار قائمة بذاتها، و«طباعة الكشف» بجوارها،
 * وما تبقّى (التفاصيل، النسخ، الحذف) خلف زر واحد — بدل سبعة أزرار متساوية الوزن تجعل
 * الحذف بنفس بروز الحفظ.
 */
function ActionMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  return (
    <div className="ecmp-menu" ref={ref}>
      <Button icon="more_horiz" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="menu">
        {label}
      </Button>
      {open && (
        <div className="ecmp-menu-list" role="menu">
          {items.map((item, i) =>
            item.separator ? (
              <span key={`s${i}`} className="ecmp-menu-sep" />
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className={`ecmp-menu-item${item.danger ? ' ecmp-menu-item--danger' : ''}`}
                disabled={item.disabled}
                onClick={() => { setOpen(false); item.onClick?.(); }}
              >
                {item.icon && <span className="material-symbols-outlined" aria-hidden="true">{item.icon}</span>}
                {item.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

/**
 * حوار الحسبة العكسية.
 *
 * لا يحسب شيئًا بنفسه: يرسل المبلغ المستهدف إلى `POST /reverse-overtime` ويعرض ما
 * يعود. الرفع إلى الساعة الكاملة والفرق الناتج قرارٌ قانوني يملكه المحرّك وحده.
 */
function ReverseDialog({
  basicSalary, hourlyRate, onApply, onClose,
}: {
  basicSalary: number;
  hourlyRate: number | null;
  onApply: (r: ReverseResult) => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<OvertimeType>('REGULAR');
  const [result, setResult] = useState<ReverseResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const calculate = () => {
    const target = Number(amount);
    if (!Number.isFinite(target) || target <= 0) {
      setError(t('ecmp.reverse.invalid_amount'));
      return;
    }
    setBusy(true);
    setError('');
    compensationApi
      .reverseOvertime({ targetAmount: target, overtimeType: type, basicSalary, hourlyRate: hourlyRate ?? undefined })
      .then(setResult)
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setBusy(false));
  };

  return (
    <Dialog
      icon="calculate"
      title={t('ecmp.reverse.title')}
      subtitle={t('ecmp.reverse.subtitle')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('action.cancel')}</Button>
          <Button variant="secondary" icon="calculate" busy={busy} onClick={calculate}>{t('ecmp.reverse.calculate')}</Button>
          <Button variant="primary" icon="check" disabled={!result} onClick={() => result && onApply(result)}>
            {t('ecmp.reverse.apply')}
          </Button>
        </>
      }
    >
      {error && <ErrorBanner>{error}</ErrorBanner>}
      <div className="ecmp-reverse-form">
        <label className="ecmp-field">
          <span>{t('ecmp.reverse.target_amount')}</span>
          <input type="number" lang="en" min="0" step="0.001" inputMode="decimal" value={amount} placeholder="0.000"
            onChange={(e) => { setAmount(e.target.value); setResult(null); }} />
        </label>
        <label className="ecmp-field">
          <span>{t('ecmp.col.ot_type')}</span>
          <select value={type} onChange={(e) => { setType(e.target.value as OvertimeType); setResult(null); }}>
            {(Object.keys(OVERTIME_LABEL_LONG_AR) as OvertimeType[]).map((k) => (
              <option key={k} value={k}>{OVERTIME_LABEL_LONG_AR[k]}</option>
            ))}
          </select>
        </label>
      </div>

      {result && (
        <div className="ecmp-reverse-result">
          <div><span>{t('ecmp.reverse.raw_hours')}</span><strong>{result.rawHours}</strong></div>
          <div className="is-key">
            <span>{t('ecmp.reverse.final_hours')}</span>
            <strong>{t('ecmp.reverse.hours_value', { hours: result.hours })}</strong>
          </div>
          <div><span>{t('ecmp.reverse.final_amount')}</span><strong>{money(result.amount)}</strong></div>
          <div><span>{t('ecmp.reverse.difference')}</span><strong>{money(result.difference)}</strong></div>
          <p className="ecmp-reverse-note">{t('ecmp.reverse.note')}</p>
        </div>
      )}
    </Dialog>
  );
}

/**
 * حوار «استقطاع من مديونية».
 *
 * لا يحسب رصيدًا: كل مديونية تصل ومعها رصيدها المشتقّ من الخادم. الحوار يمنع فقط ما
 * يمكن منعه محليًا بلا تخمين — مبلغًا يتجاوز الرصيد، أو مديونيةً مستقطَعة أصلًا في
 * هذا الشهر. التحقّق النهائي يبقى على الخادم داخل المعاملة.
 */
function DebtRepaymentDialog({
  debts, alreadyUsedDebtIds, onApply, onClose,
}: {
  debts: Debt[];
  alreadyUsedDebtIds: number[];
  onApply: (debt: Debt, amount: number) => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const available = debts.filter((d) => !alreadyUsedDebtIds.includes(d.id));
  const [selectedId, setSelectedId] = useState<number | null>(available[0]?.id ?? null);
  const [amount, setAmount] = useState('');

  const selected = available.find((d) => d.id === selectedId) ?? null;
  const value = Number(amount);
  const tooMuch = selected != null && Number.isFinite(value) && value > selected.remainingAmount;
  const valid = selected != null && Number.isFinite(value) && value > 0 && !tooMuch;

  return (
    <Dialog
      icon="account_balance_wallet"
      title={t('ecmp.debt.deduct_title')}
      subtitle={t('ecmp.debt.deduct_subtitle')}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>{t('action.cancel')}</Button>
          <Button variant="primary" icon="check" disabled={!valid} onClick={() => selected && onApply(selected, value)}>
            {t('ecmp.debt.deduct_confirm')}
          </Button>
        </>
      }
    >
      {available.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--xpl-muted)' }}>{t('ecmp.debt.all_used')}</p>
      ) : (
        <>
          <div className="ecmp-table-wrap">
            <table className="ecmp-table">
              <thead>
                <tr>
                  <th aria-label={t('ecmp.debt.col.select')} />
                  <th>{t('ecmp.col.type')}</th>
                  <th>{t('ecmp.debt.col.label')}</th>
                  <th>{t('ecmp.debt.col.date')}</th>
                  <th className="ecmp-col-num">{t('ecmp.debt.col.remaining')}</th>
                </tr>
              </thead>
              <tbody>
                {available.map((d) => (
                  <tr key={d.id} onClick={() => { setSelectedId(d.id); setAmount(''); }} style={{ cursor: 'pointer' }}>
                    <td>
                      <input
                        type="radio" name="ecmp-debt-pick" checked={selectedId === d.id}
                        aria-label={d.label} onChange={() => { setSelectedId(d.id); setAmount(''); }}
                      />
                    </td>
                    <td>{DEBT_TYPE_LABEL_AR[d.type]}</td>
                    <td className="ecmp-name">{d.label}</td>
                    <td>{formatDate(d.debtDate)}</td>
                    <td className="ecmp-money ecmp-amount">{money(d.remainingAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="ecmp-reverse-form" style={{ marginTop: 12 }}>
            <label className="ecmp-field">
              <span>{t('ecmp.debt.deduct_amount')}</span>
              <input
                type="number" lang="en" min="0" step="0.001" inputMode="decimal" placeholder="0.000"
                value={amount} onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            {selected && (
              <div className="ecmp-field">
                <span>{t('ecmp.debt.col.remaining')}</span>
                <strong style={{ fontSize: 16, fontVariantNumeric: 'tabular-nums' }}>{money(selected.remainingAmount)}</strong>
              </div>
            )}
          </div>

          {tooMuch && selected && (
            <ErrorBanner>{t('ecmp.debt.exceeds_balance', { amount: money(selected.remainingAmount) })}</ErrorBanner>
          )}
          <p className="ecmp-reverse-note">{t('ecmp.debt.deduct_note')}</p>
        </>
      )}
    </Dialog>
  );
}
