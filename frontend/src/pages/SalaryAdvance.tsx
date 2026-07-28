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
import SalaryAdvanceTemplate from '../forms/SalaryAdvanceTemplate';
import { usePrintLogStore } from '../stores/printLogStore';
import { usePrintDraftStore } from '../stores/printDraftStore';
import LanguageToggle from '../forms/shared/LanguageToggle';
import PrintProfileToggle from '../forms/shared/PrintProfileToggle';

const FORM_KEY = 'salary-advance';

const INITIAL_PRINT_FIELDS = {
  advanceAmount: '',
  requestDate: '',
  reason: '',
  installments: '',
  installmentAmount: '',
  repaymentSchedule: '',
};

export default function SalaryAdvance() {
  const { t } = useT();
  const { employeeId } = useParams<{ employeeId: string }>();
  const { search } = useLocation();
  const formNumber = useMemo(() => generateFormNumber('salary-advance'), []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [lang, setLang] = useState<'ar' | 'en'>('ar');
  const [profile, setProfile] = usePrintProfileMemory(FORM_KEY, getProfileIdFromSearch(search));
  const [printFields, setPrintFields] = useState({
    advanceAmount: '',
    requestDate: '',
    reason: '',
    installments: '',
    installmentAmount: '',
    repaymentSchedule: '',
  });

  useEffect(() => {
    if (!employeeId) return;
    api
      .get(`/forms/salary-advance/${employeeId}`)
      .then((res) => setData(res.data.data))
      .catch((e) => setError(errorMessage(e)));
  }, [employeeId]);

  useEffect(() => {
    if (!data) return;
    api
      .post('/forms/print-log', {
        formType: 'salary-advance',
        formNumber,
        employeeId: Number(employeeId),
        employeeName: data.employee.fullName,
        issueDate: new Date().toISOString(),
        printMode: profile,
      })
      .catch(() => {});
  }, [data, formNumber, employeeId, profile]);

  const draftEntry = usePrintDraftStore((s) => s.drafts[FORM_KEY] ?? null);
  const saveDraft = usePrintDraftStore((s) => s.saveDraft);
  const clearDraft = usePrintDraftStore((s) => s.clearDraft);

  const [showClearConfirm, setShowClearConfirm] = useState(false);
  function resetPrintFields() { setShowClearConfirm(true); }
  function executeClear() { setShowClearConfirm(false); setPrintFields({ ...INITIAL_PRINT_FIELDS }); }

  const addPrintLog = usePrintLogStore((s) => s.addEntry);
  useEffect(() => {
    if (!data) return;
    const handler = () => addPrintLog({ formType: 'salary-advance', formNumber, employeeName: data.employee.fullName, printProfile: profile });
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
    title: translate('page.salaryAdv.title', lang),
    documentLabel: `${translate('page.salaryAdv.title', lang)} · ${formNumber}`,
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
      title={translate('page.salaryAdv.title', lang)}
      profile={profile}
      // Overflows the official-letterhead band by a few mm — reclaim the 10mm
      // bottom margin so it stays on one page (letterhead only; top unchanged).
      letterheadCompactFooter
      // HR Print Templates – Shared Visual Consistency Pack v1: reuse the Salary
      // Certificate's opt-in ApprovalSection/FormLayout behavior.
      approvalHideDate
      approvalStampInline
      hideFormNumber
      // Multi-Signature & Stamp Management v1: the footer approval block draws the
      // signature/stamp chosen in the toolbar. No per-form logic — see FormLayout.
      approvalBranding
      toolbarExtra={
        <>
          <LanguageToggle lang={lang} onChange={setLang} />
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
        formType: 'salary-advance',
        formNumber,
        entityName: data.employee.fullName,
        entityId: Number(employeeId),
      }}
    >
      <div className="no-print" style={{ marginBottom: 16, padding: '14px 18px', background: 'var(--surface-2)', border: '1px dashed var(--border)', borderRadius: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>{t('page.warning.print_fields_header')}</div>
        {!data.latestAdvance && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div className="field">
              <label>{t('page.salaryAdv.field.amount')}</label>
              <input type="number" lang="en" min="0" step="0.001" title={t('page.salaryAdv.field.amount')} value={printFields.advanceAmount} onChange={(e) => setPrintFields(p => ({ ...p, advanceAmount: e.target.value }))} placeholder="0.000" />
            </div>
            <div className="field">
              <label>{t('page.salaryAdv.field.request_date')}</label>
              <DateInput title={t('page.salaryAdv.field.request_date')} value={printFields.requestDate} onChange={(v) => setPrintFields(p => ({ ...p, requestDate: v }))} />
            </div>
            <div className="field">
              <label>{t('page.salaryAdv.field.reason')}</label>
              <input title={t('page.salaryAdv.field.reason')} value={printFields.reason} onChange={(e) => setPrintFields(p => ({ ...p, reason: e.target.value }))} />
            </div>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <div className="field">
            <label>{t('page.salaryAdv.field.installments')}</label>
            <input type="number" lang="en" min="1" title={t('page.salaryAdv.field.installments')} value={printFields.installments} onChange={(e) => setPrintFields(p => ({ ...p, installments: e.target.value }))} />
          </div>
          <div className="field">
            <label>{t('page.salaryAdv.field.installment_amount')}</label>
            <input type="number" lang="en" min="0" step="0.001" title={t('page.salaryAdv.field.installment_amount')} value={printFields.installmentAmount} onChange={(e) => setPrintFields(p => ({ ...p, installmentAmount: e.target.value }))} placeholder="0.000" />
          </div>
          <div className="field">
            <label>{t('page.salaryAdv.field.repayment_schedule')}</label>
            <input title={t('page.salaryAdv.field.repayment_schedule')} value={printFields.repaymentSchedule} onChange={(e) => setPrintFields(p => ({ ...p, repaymentSchedule: e.target.value }))} placeholder={t('page.salaryAdv.ph.repayment_schedule')} />
          </div>
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
      <SalaryAdvanceTemplate employee={data.employee} latestAdvance={data.latestAdvance} lang={lang} printFields={printFields} />
      {showClearConfirm && (
        <ConfirmModal message={t('page.warning.clear_confirm')} confirmLabel={t('page.warning.clear_confirm_btn')} variant="warning" onConfirm={executeClear} onCancel={() => setShowClearConfirm(false)} />
      )}
    </FormLayout>
    </>
  );
}
