/**
 * إقرار دين موظف — شاشة النموذج.
 *
 * تتبع نمط النماذج الإدارية القائم حرفيًا: `FormLayout` هي المُغلِّف، و`.form-page`
 * التي تملكها هي **العقدة الوحيدة** التي تُطبع وتُعاين وتُصدَّر PDF. لا محرّك طباعة
 * جديد هنا، ولا معاينة بديلة، ولا مسار `@page` ثانٍ:
 *
 *   · الطباعة       → `FormLayout.doPrint` (مركز الطباعة → webContents.print).
 *   · المعاينة الدقيقة → `composeStyledFromNode` على نفس عقدة `.form-page` ثم
 *                        `printToPDF` في نافذة Chromium مخفية.
 *   · حفظ PDF       → `FormLayout.doExportPdf` (نفس المُركِّب).
 *
 * الهندسة (40mm أعلى / 20mm أسفل) تأتي كلها من ملف الطباعة
 * `employee-debt-acknowledgment-letterhead`، و`contentOnly` تُسقط ترويسة التطبيق
 * ورقم النموذج وكتلة الاعتماد ورمز QR.
 *
 * ═══ ما تملكه هذه الشاشة ═══
 * 1. **مسار تحديث واحد** (`updateData`): كل تغيير يمرّ منه، فتُفرض بيانات الدائن
 *    الثابتة ويُعاد توليد جدول السداد في مكان واحد لا في تأثيرات متفرقة.
 * 2. **بوابة لغوية** قبل المعاينة والطباعة وتصدير PDF: قالبٌ أجنبي يحمل قيمة عربية
 *    لا يخرج — انظر `arabicScript.ts` للسبب.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import ConfirmModal from '../components/ConfirmModal';
import Modal from '../components/Modal';
import { api, errorMessage } from '../api/client';
import { useT, t as translate } from '../lib/i18n';
import { generateFormNumber } from '../forms/shared/formNumber';
import FormLayout from '../forms/shared/FormLayout';
import {
  composeStyledFromNode,
  getPageSpec,
  isFlagEnabled,
  useAccurateFormPreview,
  UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1,
} from '../printing';
import { usePrintLogStore } from '../stores/printLogStore';
import { usePrintDraftStore } from '../stores/printDraftStore';
import { DOC_FONT_STACK, DOC_FONT_STACK_EN_HI } from '../styles/fontRegistry';
import DebtAcknowledgmentTemplate, { DEBT_ACK_CONTENT } from '../forms/debtAcknowledgment/DebtAcknowledgmentTemplate';
import DebtAckDataEntry from '../forms/debtAcknowledgment/DebtAckDataEntry';
import DebtAckLanguageToggle from '../forms/debtAcknowledgment/DebtAckLanguageToggle';
import DebtAckInstructionsDialog from '../forms/debtAcknowledgment/DebtAckInstructionsDialog';
import { MAX_INSTALLMENTS } from '../forms/debtAcknowledgment/constants';
import {
  derivedInstallmentFields,
  regenerateSchedule,
  scheduleBaseAmount,
} from '../forms/debtAcknowledgment/debtAcknowledgmentDocument';
import { findArabicLeaks } from '../forms/debtAcknowledgment/arabicScript';
import { DEBT_ACK_FIELD_LABEL_KEY } from '../forms/debtAcknowledgment/debtAcknowledgmentLabels';
import { resolveDynamicValues } from '../forms/debtAcknowledgment/debtAcknowledgmentValues';
import { validateSchedule } from '../forms/debtAcknowledgment/debtAcknowledgmentSchedule';
import {
  EMPTY_DEBT_ACK_DATA,
  type DebtAckData,
  type DebtAckLang,
} from '../forms/debtAcknowledgment/debtAcknowledgmentModel';
import {
  applyAutofill,
  buildDebtAckAutofill,
  withFixedCreditorData,
  type DebtAckEmployee,
} from '../forms/debtAcknowledgment/debtAcknowledgmentAutofill';

const FORM_KEY = 'employee-debt-acknowledgment';

/** ملف الطباعة ثابت لهذا المستند: هندسة ورق الشركة (40mm / 20mm) لا يبدّلها المستخدم. */
const PROFILE = 'employee-debt-acknowledgment-letterhead';

/** الحقول الثلاثة التي يُشتقّ منها جدول السداد كله. */
// محرّكات الجدول: الرصيد عند التوقيع (وهو ما يُقسَّط)، وأصل الدين لأن الرصيد يتبعه
// ما لم يُعدَّل يدويًا، وعدد الأقساط، وتاريخ أولها.
const SCHEDULE_DRIVERS = [
  'amountFigures',
  'balanceFigures',
  'installmentsCount',
  'firstInstallmentDate',
] as const;

/** لغة الـShell المقابلة لقالب المستند — الهندي LTR كالإنجليزي، تمامًا كملف DOCX. */
function shellLang(lang: DebtAckLang): 'ar' | 'en' {
  return lang === 'ar' ? 'ar' : 'en';
}

export default function EmployeeDebtAcknowledgment() {
  const { t } = useT();
  const { employeeId } = useParams<{ employeeId: string }>();
  const { search } = useLocation();
  void search; // ?printMode لا يُقرأ هنا: هندسة هذا المستند ثابتة بملف طباعته الخاص.

  const formNumber = useMemo(() => generateFormNumber(FORM_KEY), []);
  const [employee, setEmployee] = useState<DebtAckEmployee | null>(null);
  const [error, setError] = useState('');
  const [lang, setLang] = useState<DebtAckLang>('ar');
  const [data, setData] = useState<DebtAckData>(() => withFixedCreditorData(EMPTY_DEBT_ACK_DATA));
  const [showRecalcConfirm, setShowRecalcConfirm] = useState(false);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);

  const layoutLang = shellLang(lang);
  const docTitle = lang === 'ar' ? translate('page.debtAck.title', 'ar') : DEBT_ACK_CONTENT[lang].title;

  /**
   * مسار التحديث الوحيد.
   *
   * تغيير أحد محرّكات الجدول (أصل الدين، العدد، تاريخ أول قسط) يعيد توليده تلقائيًا —
   * **إلا** إذا كان الجدول مُعدَّلًا يدويًا، فحينها يُطبَّق تغيير الحقل ويُسأل المستخدم
   * قبل استبدال عمله. لا يُمحى تعديل يدوي بصمت أبدًا.
   */
  /**
   * «الرصيد عند التوقيع» يتبع «أصل الدين» ما دام لم يُمسّ بيد.
   *
   * ═══ ثلاث حالات، لا رابعة ═══
   * 1. المستخدم يكتب في **الرصيد** نفسه ⇒ يصير يدويًا (`balanceManual`) من الآن.
   * 2. المستخدم يغيّر **أصل الدين** والرصيد لم يُعدَّل بعدُ ⇒ ينسخ إليه.
   * 3. المستخدم يغيّر أصل الدين والرصيد **معدَّل يدويًا** ⇒ لا يُمسّ. قيمته تعبّر عن
   *    المتبقّي الفعلي يوم التوقيع، ودهسُها صامتًا يغيّر مبلغ الإقرار بلا علم صاحبه.
   *    وتظهر في الشاشة ملاحظةٌ بأنه معدَّل يدويًا مع زرّ يعيد مزامنته عند الطلب.
   */
  function syncBalanceToPrincipal(current: DebtAckData, patch: Partial<DebtAckData>): DebtAckData {
    const merged = { ...current, ...patch };
    if ('balanceFigures' in patch) {
      return { ...merged, balanceManual: patch.balanceFigures !== merged.amountFigures };
    }
    if ('amountFigures' in patch && !merged.balanceManual) {
      return { ...merged, balanceFigures: merged.amountFigures };
    }
    return merged;
  }

  function updateData(patch: Partial<DebtAckData>) {
    // يُحسب خارج مُحدِّث الحالة عمدًا: فتح الحوار أثرٌ جانبي، ومُحدِّث الحالة قد
    // يُستدعى مرتين في وضع التطوير الصارم — فيُفتح الحوار مرتين.
    const next = withFixedCreditorData(syncBalanceToPrincipal(data, patch));
    const touchesDriver = SCHEDULE_DRIVERS.some((key) => key in patch);
    if (!touchesDriver) {
      setData(next);
      return;
    }
    if (next.scheduleManual) {
      setData(next);
      setShowRecalcConfirm(true);
      return;
    }
    setData(regenerateSchedule(next));
  }

  useEffect(() => {
    if (!employeeId) return;
    api
      .get(`/forms/employee-debt-acknowledgment/${employeeId}`)
      .then((res) => setEmployee(res.data.data?.employee ?? null))
      .catch((e) => setError(errorMessage(e)));
  }, [employeeId]);

  /**
   * الملء التلقائي من سجل الموظف — **مرة واحدة** عند وصول البيانات، وللحقول الفارغة
   * فقط (انظر `applyAutofill`). أي تعديل يجريه المستخدم بعدها يخصّ هذا المستند وحده
   * ولا يُكتب في سجل الموظف إطلاقًا: لا يوجد في هذه الشاشة أي استدعاء كتابة لوحدة
   * الموظفين.
   */
  const autofilledRef = useRef(false);
  useEffect(() => {
    if (!employee || autofilledRef.current) return;
    autofilledRef.current = true;
    setData((prev) => applyAutofill(prev, buildDebtAckAutofill(employee)));
  }, [employee]);

  useEffect(() => {
    if (!employee) return;
    api
      .post('/forms/print-log', {
        formType: FORM_KEY,
        formNumber,
        employeeId: Number(employeeId),
        employeeName: employee.fullName ?? '',
        issueDate: new Date().toISOString(),
        printMode: PROFILE,
      })
      .catch(() => {});
  }, [employee, formNumber, employeeId]);

  const addPrintLog = usePrintLogStore((s) => s.addEntry);
  useEffect(() => {
    if (!employee) return;
    const handler = () =>
      addPrintLog({
        formType: FORM_KEY,
        formNumber,
        employeeName: employee.fullName ?? '',
        printProfile: PROFILE,
      });
    window.addEventListener('beforeprint', handler);
    return () => window.removeEventListener('beforeprint', handler);
  }, [employee, formNumber, addPrintLog]);

  const draftEntry = usePrintDraftStore((s) => s.drafts[FORM_KEY] ?? null);
  const saveDraft = usePrintDraftStore((s) => s.saveDraft);
  const clearDraft = usePrintDraftStore((s) => s.clearDraft);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);

  // ── التحقق والبوابة اللغوية ─────────────────────────────────────────────────
  const scheduleIssues = useMemo(
    () =>
      validateSchedule({
        // ما يُتحقَّق منه هو ما يُقسَّط: الرصيد عند التوقيع.
        debtAmount: scheduleBaseAmount(data),
        count: Number(data.installmentsCount),
        firstDate: data.firstInstallmentDate,
        rows: data.schedule,
        maxInstallments: MAX_INSTALLMENTS,
      }),
    [data.amountFigures, data.installmentsCount, data.firstInstallmentDate, data.schedule],
  );

  /**
   * الحقول التي ستُطبع بالعربية في القالب الحالي — تُفحص **القيم النهائية المحلولة**
   * (نفس ما يُصيّره القالب)، لا الحالة الخام. فارغة دائمًا في القالب العربي.
   */
  const arabicLeakFields = useMemo(() => {
    if (lang === 'ar') return [] as string[];
    return findArabicLeaks(resolveDynamicValues(data, lang)).map((leak) => leak.field);
  }, [data, lang]);

  const arabicLeakLabels = useMemo(
    () => arabicLeakFields.map((field) => t(DEBT_ACK_FIELD_LABEL_KEY[field] ?? field)),
    [arabicLeakFields, t],
  );

  const blockReason = arabicLeakLabels.length
    ? `${t('page.debtAck.arabic_block_title')} — ${arabicLeakLabels.join('، ')}`
    : null;

  const printApiRef = useRef<{ getNode: () => HTMLElement | null; print: () => void } | null>(null);

  /**
   * مُركِّب المعاينة الدقيقة — **نفس** المُركِّب ونفس `PageSpec` اللذين يستعملهما المسار
   * الافتراضي للخطّاف، مسبوقَين بالبوابة اللغوية وحدها. الرمي هنا يُظهر السبب داخل
   * حوار المعاينة نفسه بدل أن يعرض مستندًا لا يجوز تسليمه.
   */
  const composeForPreview = () => {
    if (blockReason) throw new Error(blockReason);
    const node = printApiRef.current?.getNode() ?? null;
    if (!node) throw new Error(t('msg.error'));
    return composeStyledFromNode({
      node,
      pageSpec: getPageSpec('a4-portrait'),
      title: docTitle,
      lang: layoutLang,
      stripSelectors: ['.no-print'],
    });
  };

  const accurate = useAccurateFormPreview({
    enabled: isFlagEnabled(UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1),
    compose: composeForPreview,
    onPrint: () => printApiRef.current?.print(),
    title: docTitle,
    documentLabel: `${docTitle} · ${formNumber}`,
    lang: layoutLang,
  });

  /** بوابة واحدة للطباعة ولتصدير PDF: تمنع الخروج وتشرح السبب، أو تُمرّر المسار الأصلي. */
  const gate = ({ proceed }: { proceed: () => void }) => {
    if (blockReason) {
      setBlockedMessage(blockReason);
      return;
    }
    proceed();
  };

  if (error) return <div className="center-msg">{t('msg.error')}: {error}</div>;
  if (!employee)
    return (
      <div className="center-msg">
        <div className="spinner" />
        {t('msg.loading')}
      </div>
    );

  return (
    <>
      {accurate.dialog}
      {/* التعليمات: حوارٌ **خارج** `FormLayout` عمدًا. أبناء `FormLayout` يسكنون
          `.form-page` — العقدة الوحيدة التي تُستنسخ إلى المعاينة الدقيقة والطباعة
          وتصدير PDF — فسكناه هنا تعني أنه لا يدخل شجرة الطباعة أصلًا، مفتوحًا كان
          أو مغلقًا. ولغته لغة القالب المختار لا لغة الواجهة. */}
      {showInstructions && (
        <DebtAckInstructionsDialog lang={lang} onClose={() => setShowInstructions(false)} />
      )}
      <FormLayout
        formType={FORM_KEY}
        lang={layoutLang}
        onPrintApiReady={(printApi) => {
          printApiRef.current = printApi;
        }}
        ready
        formNumber={formNumber}
        title={docTitle}
        profile={PROFILE}
        // ورق الشركة يحمل ترويسته وتذييله، والمستند يحمل عنوانه وتوقيعاته من نصّه
        // الرسمي — فلا ترويسة تطبيق، ولا رقم نموذج، ولا كتلة اعتماد، ولا QR.
        contentOnly
        hideApprovalSection
        // البوابة اللغوية على المسارين معًا — طباعةٌ ممنوعة و«حفظ PDF» مفتوح ليست بوابة.
        printIntercept={gate}
        exportIntercept={gate}
        docFontStack={lang === 'hi' ? DOC_FONT_STACK_EN_HI : DOC_FONT_STACK}
        toolbarExtra={
          <>
            <DebtAckLanguageToggle lang={lang} onChange={setLang} />
            <button
              type="button"
              className="btn secondary"
              style={{ fontSize: 12, padding: '4px 8px' }}
              title={t('page.debtAck.instructions_btn')}
              onClick={() => setShowInstructions(true)}
            >
              ℹ
            </button>
            <button
              type="button"
              className="btn secondary"
              style={{ fontSize: 12, padding: '4px 8px' }}
              title={t('page.warning.save_draft_title')}
              onClick={() => saveDraft(FORM_KEY, data as unknown as Record<string, unknown>)}
            >
              💾
            </button>
            {draftEntry && (
              <button
                type="button"
                className="btn secondary"
                style={{ fontSize: 12, padding: '4px 8px', color: 'var(--primary)' }}
                title={t('page.warning.load_draft_title')}
                onClick={() =>
                  setData(
                    withFixedCreditorData({
                      ...EMPTY_DEBT_ACK_DATA,
                      ...(draftEntry.state as Partial<DebtAckData>),
                    }),
                  )
                }
              >
                ↩
              </button>
            )}
            {draftEntry && (
              <button
                type="button"
                className="btn secondary"
                style={{ fontSize: 12, padding: '4px 8px' }}
                title={t('page.warning.clear_draft_title')}
                onClick={() => clearDraft(FORM_KEY)}
              >
                ✕
              </button>
            )}
            <button
              type="button"
              className="btn secondary"
              style={{ fontSize: 12, padding: '4px 8px' }}
              onClick={() => setShowClearConfirm(true)}
            >
              {t('page.warning.clear_fields_btn')}
            </button>
            {accurate.button}
          </>
        }
        qrData={{
          formType: FORM_KEY,
          formNumber,
          entityName: employee.fullName ?? '',
          entityId: Number(employeeId),
        }}
      >
        <DebtAckDataEntry
          data={data}
          lang={lang}
          employeeNameEn={employee.fullNameEn ?? undefined}
          onChange={updateData}
          onScheduleChange={(rows) =>
            setData((prev) => ({
              ...prev,
              schedule: rows,
              scheduleManual: true,
              ...derivedInstallmentFields(rows, prev.firstInstallmentDate),
            }))
          }
          onRegenerateSchedule={() => setShowRecalcConfirm(true)}
          onResyncBalance={() => updateData({ balanceFigures: data.amountFigures })}
          issues={scheduleIssues}
          arabicLeaks={arabicLeakLabels}
        />
        <DebtAcknowledgmentTemplate lang={lang} data={data} />

        {showRecalcConfirm && (
          <ConfirmModal
            title={t('page.debtAck.schedule_recalc_title')}
            message={t('page.debtAck.schedule_recalc_confirm')}
            confirmLabel={t('page.debtAck.schedule_recalc_confirm_btn')}
            variant="warning"
            onConfirm={() => {
              setShowRecalcConfirm(false);
              setData((prev) => regenerateSchedule(prev));
            }}
            onCancel={() => setShowRecalcConfirm(false)}
          />
        )}

        {showClearConfirm && (
          <ConfirmModal
            message={t('page.warning.clear_confirm')}
            confirmLabel={t('page.warning.clear_confirm_btn')}
            variant="warning"
            onConfirm={() => {
              setShowClearConfirm(false);
              autofilledRef.current = false;
              setData(withFixedCreditorData(EMPTY_DEBT_ACK_DATA));
            }}
            onCancel={() => setShowClearConfirm(false)}
          />
        )}

        {blockedMessage && (
          <Modal
            title={t('page.debtAck.arabic_block_title')}
            size="sm"
            onClose={() => setBlockedMessage(null)}
            footer={
              <button type="button" className="btn" onClick={() => setBlockedMessage(null)}>
                {t('page.debtAck.ok')}
              </button>
            }
          >
            <p style={{ lineHeight: 1.8, fontWeight: 600 }}>{blockedMessage}</p>
          </Modal>
        )}
      </FormLayout>
    </>
  );
}
