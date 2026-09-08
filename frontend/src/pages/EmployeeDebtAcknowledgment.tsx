/**
 * إقرار دين موظف — شاشة النموذج.
 *
 * تتبع نمط النماذج الإدارية القائم حرفيًا: `FormLayout` هي المُغلِّف، و`.form-page`
 * التي تملكها هي **العقدة الوحيدة** التي تُطبع وتُعاين وتُصدَّر PDF. لا محرّك طباعة
 * جديد هنا، ولا معاينة بديلة، ولا مسار `@page` ثانٍ:
 *
 *   · الطباعة       → `FormLayout.doPrint` (مركز الطباعة → webContents.print).
 *   · المعاينة الدقيقة → `useAccurateFormPreview` (نفس عقدة `.form-page`،
 *                        `composeStyledFromNode` ثم `printToPDF` في نافذة Chromium
 *                        مخفية) — أي أن ما يظهر في المعاينة هو ما يخرج من الطابعة.
 *   · حفظ PDF       → `FormLayout.doExportPdf` (نفس المُركِّب).
 *
 * الهندسة (40mm أعلى / 20mm أسفل) تأتي كلها من ملف الطباعة
 * `employee-debt-acknowledgment-letterhead` — ملف مستقل أُضيف لهذا المستند وحده،
 * `selectable: false`، فلا يظهر في مبدّل أي نموذج آخر ولا يغيّر أي ملف قائم. ولأن
 * القيم تصبح هامش `@page`، يفرضها المتصفح على **كل** صفحة من صفحات المستند.
 *
 * `contentOnly` تُسقط ترويسة الشركة ورقم النموذج والعنوان الداخلي وكتلة الاعتماد
 * ورمز QR — الورقة الفيزيائية تحمل ترويسة الشركة وتذييلها، والمستند يحمل عنوانه
 * وتوقيعاته من نصّه الرسمي نفسه.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import ConfirmModal from '../components/ConfirmModal';
import { api, errorMessage } from '../api/client';
import { useT, t as translate } from '../lib/i18n';
import { generateFormNumber } from '../forms/shared/formNumber';
import FormLayout from '../forms/shared/FormLayout';
import { isFlagEnabled, useAccurateFormPreview, UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1 } from '../printing';
import { usePrintLogStore } from '../stores/printLogStore';
import { usePrintDraftStore } from '../stores/printDraftStore';
import { DOC_FONT_STACK, DOC_FONT_STACK_EN_HI } from '../styles/fontRegistry';
import DebtAcknowledgmentTemplate, { DEBT_ACK_CONTENT } from '../forms/debtAcknowledgment/DebtAcknowledgmentTemplate';
import DebtAckDataEntry from '../forms/debtAcknowledgment/DebtAckDataEntry';
import DebtAckLanguageToggle from '../forms/debtAcknowledgment/DebtAckLanguageToggle';
import {
  EMPTY_DEBT_ACK_DATA,
  type DebtAckData,
  type DebtAckLang,
} from '../forms/debtAcknowledgment/debtAcknowledgmentModel';
import { applyAutofill, buildDebtAckAutofill, type DebtAckEmployee } from '../forms/debtAcknowledgment/debtAcknowledgmentAutofill';

const FORM_KEY = 'employee-debt-acknowledgment';

/** ملف الطباعة ثابت لهذا المستند: هندسة ورق الشركة (40mm / 20mm) لا يبدّلها المستخدم. */
const PROFILE = 'employee-debt-acknowledgment-letterhead';

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
  const [data, setData] = useState<DebtAckData>(EMPTY_DEBT_ACK_DATA);

  const layoutLang = shellLang(lang);
  const docTitle = lang === 'ar' ? translate('page.debtAck.title', 'ar') : DEBT_ACK_CONTENT[lang].title;

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

  const printApiRef = useRef<{ getNode: () => HTMLElement | null; print: () => void } | null>(null);
  const accurate = useAccurateFormPreview({
    enabled: isFlagEnabled(UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1),
    getNode: () => printApiRef.current?.getNode() ?? null,
    onPrint: () => printApiRef.current?.print(),
    title: docTitle,
    documentLabel: `${docTitle} · ${formNumber}`,
    lang: layoutLang,
  });

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
        docFontStack={lang === 'hi' ? DOC_FONT_STACK_EN_HI : DOC_FONT_STACK}
        toolbarExtra={
          <>
            <DebtAckLanguageToggle lang={lang} onChange={setLang} />
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
                onClick={() => setData({ ...EMPTY_DEBT_ACK_DATA, ...(draftEntry.state as Partial<DebtAckData>) })}
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
          employeeNameEn={employee.fullNameEn ?? undefined}
          onChange={(patch) => setData((prev) => ({ ...prev, ...patch }))}
        />
        <DebtAcknowledgmentTemplate lang={lang} data={data} />
        {showClearConfirm && (
          <ConfirmModal
            message={t('page.warning.clear_confirm')}
            confirmLabel={t('page.warning.clear_confirm_btn')}
            variant="warning"
            onConfirm={() => {
              setShowClearConfirm(false);
              autofilledRef.current = false;
              setData(EMPTY_DEBT_ACK_DATA);
            }}
            onCancel={() => setShowClearConfirm(false)}
          />
        )}
      </FormLayout>
    </>
  );
}
