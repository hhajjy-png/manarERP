import { useMemo, useState, useEffect } from 'react';
import ConfirmModal from '../components/ConfirmModal';
import DateInput from '../components/DateInput';
import { useParams, useLocation } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { getProfileIdFromSearch, ProfileId } from '../forms/shared/printProfiles';
import { usePrintProfileMemory } from '../forms/shared/usePrintProfileMemory';
import { generateFormNumber } from '../forms/shared/formNumber';
import FormLayout from '../forms/shared/FormLayout';
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

  if (error) return <div className="center-msg">خطأ: {error}</div>;
  if (!data)
    return (
      <div className="center-msg">
        <div className="spinner" />
        جارٍ التحميل…
      </div>
    );

  return (
    <FormLayout
      formType={FORM_KEY}
      lang={lang}
      ready
      formNumber={formNumber}
      title="طلب سلفة راتب"
      profile={profile}
      // Overflows the official-letterhead band by a few mm — reclaim the 10mm
      // bottom margin so it stays on one page (letterhead only; top unchanged).
      letterheadCompactFooter
      toolbarExtra={
        <>
          <LanguageToggle lang={lang} onChange={setLang} />
          <PrintProfileToggle profile={profile} onChange={setProfile} />
          <button
            type="button"
            className="btn secondary"
            style={{ fontSize: 12, padding: '4px 8px' }}
            title="حفظ مسودة"
            onClick={() => saveDraft(FORM_KEY, printFields as unknown as Record<string, unknown>)}
          >
            💾
          </button>
          {draftEntry && (
            <button
              type="button"
              className="btn secondary"
              style={{ fontSize: 12, padding: '4px 8px', color: 'var(--primary)' }}
              title="استعادة المسودة"
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
              title="مسح المسودة"
              onClick={() => clearDraft(FORM_KEY)}
            >
              ✕
            </button>
          )}
        </>
      }
      qrData={{
        formType: 'salary-advance',
        formNumber,
        employeeId: Number(employeeId),
        employeeName: data.employee.fullName,
        issueDate: new Date().toISOString(),
      }}
    >
      <div className="no-print" style={{ marginBottom: 16, padding: '14px 18px', background: 'var(--surface-2)', border: '1px dashed var(--border)', borderRadius: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>حقول الطباعة فقط — لن تُحفظ</div>
        {!data.latestAdvance && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div className="field">
              <label>مبلغ السلفة (د.ك)</label>
              <input type="number" lang="en" min="0" step="0.001" title="مبلغ السلفة" value={printFields.advanceAmount} onChange={(e) => setPrintFields(p => ({ ...p, advanceAmount: e.target.value }))} placeholder="0.000" />
            </div>
            <div className="field">
              <label>تاريخ الطلب</label>
              <DateInput title="تاريخ الطلب" value={printFields.requestDate} onChange={(v) => setPrintFields(p => ({ ...p, requestDate: v }))} />
            </div>
            <div className="field">
              <label>سبب السلفة</label>
              <input title="سبب السلفة" value={printFields.reason} onChange={(e) => setPrintFields(p => ({ ...p, reason: e.target.value }))} />
            </div>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <div className="field">
            <label>عدد الأقساط</label>
            <input type="number" lang="en" min="1" title="عدد الأقساط" value={printFields.installments} onChange={(e) => setPrintFields(p => ({ ...p, installments: e.target.value }))} />
          </div>
          <div className="field">
            <label>قيمة القسط (د.ك)</label>
            <input type="number" lang="en" min="0" step="0.001" title="قيمة القسط" value={printFields.installmentAmount} onChange={(e) => setPrintFields(p => ({ ...p, installmentAmount: e.target.value }))} placeholder="0.000" />
          </div>
          <div className="field">
            <label>جدول السداد</label>
            <input title="جدول السداد" value={printFields.repaymentSchedule} onChange={(e) => setPrintFields(p => ({ ...p, repaymentSchedule: e.target.value }))} placeholder="مثال: 3 أقساط × 100 د.ك" />
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          <button
            type="button"
            className="btn secondary"
            style={{ fontSize: 12 }}
            onClick={resetPrintFields}
          >
            ↺ مسح حقول الطباعة
          </button>
        </div>
      </div>
      <SalaryAdvanceTemplate employee={data.employee} latestAdvance={data.latestAdvance} lang={lang} printFields={printFields} />
      {showClearConfirm && (
        <ConfirmModal message="سيتم مسح جميع حقول الطباعة. هل تريد المتابعة؟" confirmLabel="مسح" variant="warning" onConfirm={executeClear} onCancel={() => setShowClearConfirm(false)} />
      )}
    </FormLayout>
  );
}
