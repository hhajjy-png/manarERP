import { useMemo, useState, useEffect, useRef } from 'react';
import ConfirmModal from '../components/ConfirmModal';
import DateInput from '../components/DateInput';
import { useParams, useLocation } from 'react-router-dom';
import { useT, t as translate } from '../lib/i18n';
import { api, errorMessage } from '../api/client';
import { getProfileIdFromSearch, ProfileId } from '../forms/shared/printProfiles';
import { usePrintProfileMemory } from '../forms/shared/usePrintProfileMemory';
import { generateFormNumber } from '../forms/shared/formNumber';
import FormLayout from '../forms/shared/FormLayout';
import { useAccurateFormPreview, isFlagEnabled, UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1 } from '../printing';
import ReturnToWorkTemplate from '../forms/ReturnToWorkTemplate';
import ReturnToWorkEnHiTemplate from '../forms/enhi/ReturnToWorkEnHiTemplate';
import { returnToWorkLabel } from '../forms/enhi/shared/returnToWorkEnHiLabels';
import { joinEnHi, APPROVAL_SECONDARY_LABELS_HI } from '../forms/enhi/shared/enHiLabels';
import { usePrintLogStore } from '../stores/printLogStore';
import { usePrintDraftStore } from '../stores/printDraftStore';
import FormVariantToggle from '../forms/shared/FormVariantToggle';
import { FormDocVariant, DEFAULT_FORM_DOC_VARIANT, toLayoutLang } from '../forms/shared/formVariant';
import PrintProfileToggle from '../forms/shared/PrintProfileToggle';
import { DOC_FONT_STACK, DOC_FONT_STACK_EN_HI } from '../styles/fontRegistry';

const FORM_KEY = 'return-to-work';

const INITIAL_PRINT_FIELDS = {
  leaveType: '' as '' | 'ANNUAL' | 'SICK' | 'UNPAID' | 'EMERGENCY',
  leaveStartDate: '',
  leaveEndDate: '',
  leaveDays: '',
  actualReturnDate: '',
  medicalNotes: '',
};

function calcDays(start: string, end: string): number {
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  const s = new Date(sy, sm - 1, sd);
  const e = new Date(ey, em - 1, ed);
  return Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000) + 1);
}

export default function ReturnToWork() {
  const { t } = useT();
  const { employeeId } = useParams<{ employeeId: string }>();
  const { search } = useLocation();
  const formNumber = useMemo(() => generateFormNumber('return-to-work'), []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  /**
   * نسخة المستند — ثلاث نسخ (`ar` / `en` / `en-hi`)، على نفس بنية «طلب
   * الإجازة» المعتمدة في PHASE 1 حرفيًا. `en-hi` تُصرَف إلى `lang='en'` — نفس
   * الاتجاه ونفس مسار الطباعة والمعاينة و PDF.
   */
  const [variant, setVariant] = useState<FormDocVariant>(DEFAULT_FORM_DOC_VARIANT);
  const lang = toLayoutLang(variant);
  const isEnHi = variant === 'en-hi';
  const docTitle = isEnHi
    ? joinEnHi(returnToWorkLabel('doc.title'))
    : translate('page.returnToWork.title', lang);
  const [profile, setProfile] = usePrintProfileMemory(FORM_KEY, getProfileIdFromSearch(search));
  const daysManuallyEdited = useRef(false);
  const [printFields, setPrintFields] = useState({
    leaveType: '' as '' | 'ANNUAL' | 'SICK' | 'UNPAID' | 'EMERGENCY',
    leaveStartDate: '',
    leaveEndDate: '',
    leaveDays: '',
    actualReturnDate: '',
    medicalNotes: '',
  });

  useEffect(() => {
    if (!employeeId) return;
    api
      .get(`/forms/return-to-work/${employeeId}`)
      .then((res) => setData(res.data.data))
      .catch((e) => setError(errorMessage(e)));
  }, [employeeId]);

  useEffect(() => {
    if (!data) return;
    api
      .post('/forms/print-log', {
        formType: 'return-to-work',
        formNumber,
        employeeId: Number(employeeId),
        employeeName: data.employee.fullName,
        issueDate: new Date().toISOString(),
        printMode: profile,
      })
      .catch(() => {});
  }, [data, formNumber, employeeId, profile]);

  useEffect(() => {
    const { leaveStartDate, leaveEndDate } = printFields;
    if (!leaveStartDate || !leaveEndDate) {
      daysManuallyEdited.current = false;
      return;
    }
    if (daysManuallyEdited.current) return;
    const computed = calcDays(leaveStartDate, leaveEndDate);
    setPrintFields(p => ({ ...p, leaveDays: String(computed) }));
  }, [printFields.leaveStartDate, printFields.leaveEndDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const draftEntry = usePrintDraftStore((s) => s.drafts[FORM_KEY] ?? null);
  const saveDraft = usePrintDraftStore((s) => s.saveDraft);
  const clearDraft = usePrintDraftStore((s) => s.clearDraft);

  const [showClearConfirm, setShowClearConfirm] = useState(false);
  function resetPrintFields() { setShowClearConfirm(true); }
  function executeClear() { setShowClearConfirm(false); daysManuallyEdited.current = false; setPrintFields({ ...INITIAL_PRINT_FIELDS }); }

  const addPrintLog = usePrintLogStore((s) => s.addEntry);
  useEffect(() => {
    if (!data) return;
    const handler = () => addPrintLog({ formType: 'return-to-work', formNumber, employeeName: data.employee.fullName, printProfile: profile });
    window.addEventListener('beforeprint', handler);
    return () => window.removeEventListener('beforeprint', handler);
  }, [data, formNumber, addPrintLog, profile]);

  /**
   * المعاينة الدقيقة (True Chromium WYSIWYG) — **إضافية بحتة**.
   *
   * تستهلك **نفس** العقدة المطبوعة (`.form-page`) و**نفس** دالة الطباعة القديمة
   * (`FormLayout.doPrint`) اللتين ينشرهما `onPrintApiReady`. لا قالب بديل، ولا HTML
   * مختلف، ولا محرّك طباعة جديد. المعاينة القديمة وزر الطباعة ومسارهما: كما هي.
   *
   * العلم مطفأ ⇒ لا زر ولا حوار إطلاقًا.
   */
  const printApiRef = useRef<{ getNode: () => HTMLElement | null; print: () => void } | null>(null);
  const accurate = useAccurateFormPreview({
    enabled: isFlagEnabled(UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1),
    getNode: () => printApiRef.current?.getNode() ?? null,
    onPrint: () => printApiRef.current?.print(),
    title: docTitle,
    documentLabel: `${docTitle} · ${formNumber}`,
    lang,
  });


  if (error) return <div className="center-msg">{t('msg.error')}: {error}</div>;
  if (!data)
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
      lang={lang}
      onPrintApiReady={(api) => { printApiRef.current = api; }}
      ready
      formNumber={formNumber}
      title={docTitle}
      profile={profile}
      // HR Print Templates – Shared Visual Consistency Pack v1: reuse the Salary
      // Certificate's opt-in ApprovalSection/FormLayout behavior.
      approvalHideDate
      approvalStampInline
      hideFormNumber
      // Multi-Signature & Stamp Management v1: the footer approval block draws the
      // signature/stamp chosen in the toolbar. No per-form logic — see FormLayout.
      approvalBranding
      // EN+HI فقط — نفس PHASE 1: Devanagari بعد Cairo، وتسميات الاعتماد الثنائية
      // المشتركة (نفس النص عبر كل النماذج الإدارية). في ar/en سلوك مطابق للسابق.
      approvalSecondaryLabels={isEnHi ? APPROVAL_SECONDARY_LABELS_HI : undefined}
      docFontStack={isEnHi ? DOC_FONT_STACK_EN_HI : DOC_FONT_STACK}
      toolbarExtra={
        <>
          <FormVariantToggle variant={variant} onChange={setVariant} />
          <PrintProfileToggle profile={profile} onChange={setProfile} />
          <button
            type="button"
            className="btn secondary"
            style={{ fontSize: 12, padding: '4px 8px' }}
            title={t('page.warning.save_draft_title')}
            onClick={() => saveDraft(FORM_KEY, printFields as unknown as Record<string, unknown>)}
          >
            💾
          </button>
          {draftEntry && (
            <button
              type="button"
              className="btn secondary"
              style={{ fontSize: 12, padding: '4px 8px', color: 'var(--primary)' }}
              title={t('page.warning.load_draft_title')}
              onClick={() => setPrintFields(draftEntry.state as typeof printFields)}
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
        {accurate.button}
        </>
      }
      qrData={{
        formType: 'return-to-work',
        formNumber,
        entityName: data.employee.fullName,
        entityId: Number(employeeId),
      }}
    >
      <div className="no-print" style={{ marginBottom: 16, padding: '14px 18px', background: 'var(--surface-2)', border: '1px dashed var(--border)', borderRadius: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>{t('page.warning.print_fields_header')}</div>
        {!data.latestLeave && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div className="field">
              <label>{t('page.leaveReq.field.leave_type')}</label>
              <select title={t('page.leaveReq.field.leave_type')} value={printFields.leaveType} onChange={(e) => setPrintFields(p => ({ ...p, leaveType: e.target.value as typeof printFields.leaveType }))}>
                <option value="">{t('msg.select_placeholder')}</option>
                <option value="ANNUAL">{t('page.leaveReq.opt.annual')}</option>
                <option value="SICK">{t('page.leaveReq.opt.sick')}</option>
                <option value="UNPAID">{t('page.leaveReq.opt.unpaid')}</option>
                <option value="EMERGENCY">{t('page.leaveReq.opt.emergency')}</option>
              </select>
            </div>
            <div className="field">
              <label>{t('page.leaveReq.field.days')}</label>
              <input
                type="number"
                lang="en"
                min="1"
                title={t('page.leaveReq.field.days')}
                value={printFields.leaveDays}
                onChange={(e) => {
                  daysManuallyEdited.current = true;
                  setPrintFields(p => ({ ...p, leaveDays: e.target.value }));
                }}
              />
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, display: 'block' }}>
                {t('page.leaveReq.days_hint')}
              </span>
            </div>
            <div className="field">
              <label>{t('page.returnToWork.field.leave_start_date')}</label>
              <DateInput title={t('page.returnToWork.field.leave_start_date')} value={printFields.leaveStartDate} onChange={(v) => setPrintFields(p => ({ ...p, leaveStartDate: v }))} />
            </div>
            <div className="field">
              <label>{t('page.returnToWork.field.leave_end_date')}</label>
              <DateInput title={t('page.returnToWork.field.leave_end_date')} value={printFields.leaveEndDate} onChange={(v) => setPrintFields(p => ({ ...p, leaveEndDate: v }))} />
            </div>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="field"><label>{t('page.returnToWork.field.actual_return_date')}</label><DateInput title={t('page.returnToWork.field.actual_return_date')} value={printFields.actualReturnDate} onChange={(v) => setPrintFields(p => ({ ...p, actualReturnDate: v }))} /></div>
          <div className="field"><label>{t('page.returnToWork.field.medical_notes')}</label><input title={t('page.returnToWork.medical_notes_short')} value={printFields.medicalNotes} onChange={(e) => setPrintFields(p => ({ ...p, medicalNotes: e.target.value }))} /></div>
        </div>
        <div style={{ marginTop: 10 }}>
          <button
            type="button"
            className="btn secondary"
            style={{ fontSize: 12 }}
            onClick={resetPrintFields}
          >
            {t('page.warning.clear_fields_btn')}
          </button>
        </div>
      </div>
      {/* اختيار القالب يحدث هنا وحده. `ReturnToWorkTemplate` (العربي والإنجليزي)
          لم يُمَسّ، والنسخة الثنائية ملف مستقل تمامًا. */}
      {isEnHi ? (
        <ReturnToWorkEnHiTemplate employee={data.employee} latestLeave={data.latestLeave} printFields={printFields} />
      ) : (
        <ReturnToWorkTemplate employee={data.employee} latestLeave={data.latestLeave} lang={lang} printFields={printFields} />
      )}
      {showClearConfirm && (
        <ConfirmModal message={t('page.warning.clear_confirm')} confirmLabel={t('page.warning.clear_confirm_btn')} variant="warning" onConfirm={executeClear} onCancel={() => setShowClearConfirm(false)} />
      )}
    </FormLayout>
    </>
  );
}
