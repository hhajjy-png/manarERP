import { useMemo, useState, useEffect, useRef } from 'react';
import ConfirmModal from '../components/ConfirmModal';
import DateInput from '../components/DateInput';
import { useParams, useLocation } from 'react-router-dom';
import { useT } from '../lib/i18n';
import { api, errorMessage } from '../api/client';
import { getProfileIdFromSearch, ProfileId } from '../forms/shared/printProfiles';
import { usePrintProfileMemory } from '../forms/shared/usePrintProfileMemory';
import { generateFormNumber } from '../forms/shared/formNumber';
import FormLayout from '../forms/shared/FormLayout';
import { useLegacyFormPreview, isLegacyFormsPreviewEnabled, PRINT_PREVIEW_LEGACY_FORMS_HR, useAccurateFormPreview, isFlagEnabled, UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1 } from '../printing';
import PerformanceEvaluationTemplate from '../forms/PerformanceEvaluationTemplate';
import { usePrintLogStore } from '../stores/printLogStore';
import { usePrintDraftStore } from '../stores/printDraftStore';
import LanguageToggle from '../forms/shared/LanguageToggle';
import PrintProfileToggle from '../forms/shared/PrintProfileToggle';

const FORM_KEY = 'performance-evaluation';

function makePrintFields() {
  return {
    scores: ['', '', '', '', ''] as string[],
    reviewerComments: '',
    periodFrom: '',
    periodTo: '',
    overrideRating: '',
  };
}

const CRITERIA_KEYS = [
  'page.perfEval.criterion.quality',
  'page.perfEval.criterion.commitment',
  'page.perfEval.criterion.teamwork',
  'page.perfEval.criterion.initiative',
  'page.perfEval.criterion.punctuality',
] as const;

export default function PerformanceEvaluation() {
  const { t } = useT();
  const { employeeId } = useParams<{ employeeId: string }>();
  const { search } = useLocation();
  const formNumber = useMemo(() => generateFormNumber('performance-evaluation'), []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [lang, setLang] = useState<'ar' | 'en'>('ar');
  const [profile, setProfile] = usePrintProfileMemory(FORM_KEY, getProfileIdFromSearch(search));
  const [printFields, setPrintFields] = useState<{
    scores: string[];
    reviewerComments: string;
    periodFrom: string;
    periodTo: string;
    overrideRating: string;
  }>(makePrintFields);

  useEffect(() => {
    if (!employeeId) return;
    api
      .get(`/forms/performance-evaluation/${employeeId}`)
      .then((res) => setData(res.data.data))
      .catch((e) => setError(errorMessage(e)));
  }, [employeeId]);

  useEffect(() => {
    if (!data) return;
    api
      .post('/forms/print-log', {
        formType: 'performance-evaluation',
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
  function executeClear() { setShowClearConfirm(false); setPrintFields(makePrintFields()); }

  const addPrintLog = usePrintLogStore((s) => s.addEntry);
  useEffect(() => {
    if (!data) return;
    const handler = () => addPrintLog({ formType: 'performance-evaluation', formNumber, employeeName: data.employee.fullName, printProfile: profile });
    window.addEventListener('beforeprint', handler);
    return () => window.removeEventListener('beforeprint', handler);
  }, [data, formNumber, addPrintLog, profile]);

  /* معاينة قبل الطباعة — طبقة عرض فوق مسار FormLayout القديم. العلم مطفأ ⇒ لا اعتراض
     ولا حوار، فيبقى زر الطباعة على onClick={doPrint} كما هو. */
  const preview = useLegacyFormPreview({
    enabled: isLegacyFormsPreviewEnabled(PRINT_PREVIEW_LEGACY_FORMS_HR),
    title: t('page.perfEval.title'),
    documentLabel: `${t('page.perfEval.doc_label')} · ${formNumber}`,
    lang,
  });

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
    title: t('page.perfEval.title'),
    documentLabel: `${t('page.perfEval.doc_label')} · ${formNumber}`,
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
    {preview.dialog}
    {accurate.dialog}
    <FormLayout
      formType={FORM_KEY}
      lang={lang}
      printIntercept={preview.printIntercept}
      onPrintApiReady={(api) => { printApiRef.current = api; }}
      ready
      formNumber={formNumber}
      title={t('page.perfEval.title')}
      profile={profile}
      // HR Print Templates – Shared Visual Consistency Pack v1: reuse the Salary
      // Certificate's opt-in ApprovalSection/FormLayout behavior.
      approvalHideDate
      approvalStampInline
      hideFormNumber
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
        formType: 'performance-evaluation',
        formNumber,
        entityName: data.employee.fullName,
        entityId: Number(employeeId),
      }}
    >
      <div className="no-print" style={{ marginBottom: 16, padding: '14px 18px', background: 'var(--surface-2)', border: '1px dashed var(--border)', borderRadius: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>{t('page.warning.print_fields_header')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div className="field">
            <label>{t('page.perfEval.field.period_from')}</label>
            <DateInput title={t('page.perfEval.field.period_from')} value={printFields.periodFrom} onChange={(v) => setPrintFields(p => ({ ...p, periodFrom: v }))} />
          </div>
          <div className="field">
            <label>{t('page.perfEval.field.period_to')}</label>
            <DateInput title={t('page.perfEval.field.period_to')} value={printFields.periodTo} onChange={(v) => setPrintFields(p => ({ ...p, periodTo: v }))} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 10 }}>
          {CRITERIA_KEYS.map((key, i) => (
            <div key={i} className="field">
              <label>{t(key)} {t('page.perfEval.out_of_20')}</label>
              <input type="number" lang="en" min="0" max="20" title={t(key)} value={printFields.scores[i]} onChange={(e) => setPrintFields(p => { const s = [...p.scores]; s[i] = e.target.value; return { ...p, scores: s }; })} />
            </div>
          ))}
        </div>
        {(() => {
          const allFilled = printFields.scores.length === 5 && printFields.scores.every(s => s?.trim());
          const autoTotal = allFilled ? printFields.scores.reduce((a, s) => a + (parseFloat(s) || 0), 0) : null;
          return autoTotal !== null ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
              {t('page.perfEval.auto_total_label')} <strong>{autoTotal}</strong> / 100
            </div>
          ) : null;
        })()}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div className="field">
            <label>{t('page.perfEval.field.override_rating')}</label>
            <select title={t('page.perfEval.override_rating_short')} value={printFields.overrideRating} onChange={(e) => setPrintFields(p => ({ ...p, overrideRating: e.target.value }))}>
              <option value="">{t('page.perfEval.opt.auto')}</option>
              <option value="excellent">{t('page.perfEval.opt.excellent')}</option>
              <option value="very_good">{t('page.perfEval.opt.very_good')}</option>
              <option value="good">{t('page.perfEval.opt.good')}</option>
              <option value="acceptable">{t('page.perfEval.opt.acceptable')}</option>
              <option value="poor">{t('page.perfEval.opt.poor')}</option>
            </select>
          </div>
          <div className="field">
            <label>{t('page.perfEval.field.reviewer_comments')}</label>
            <input title={t('page.perfEval.reviewer_comments_short')} value={printFields.reviewerComments} onChange={(e) => setPrintFields(p => ({ ...p, reviewerComments: e.target.value }))} />
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
      <PerformanceEvaluationTemplate
        employee={data.employee}
        latestReview={data.latestReview}
        lang={lang}
        printFields={printFields}
      />
      {showClearConfirm && (
        <ConfirmModal message={t('page.warning.clear_confirm')} confirmLabel={t('page.warning.clear_confirm_btn')} variant="warning" onConfirm={executeClear} onCancel={() => setShowClearConfirm(false)} />
      )}
    </FormLayout>
    </>
  );
}
