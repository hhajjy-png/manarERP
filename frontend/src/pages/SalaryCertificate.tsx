import { useMemo, useState, useEffect } from 'react';
import ConfirmModal from '../components/ConfirmModal';
import { useParams, useLocation } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { getProfileIdFromSearch, ProfileId } from '../forms/shared/printProfiles';
import { usePrintProfileMemory } from '../forms/shared/usePrintProfileMemory';
import { generateFormNumber } from '../forms/shared/formNumber';
import FormLayout from '../forms/shared/FormLayout';
import LanguageToggle from '../forms/shared/LanguageToggle';
import PrintProfileToggle from '../forms/shared/PrintProfileToggle';
import SalaryCertificateTemplate, { PrintOverrides } from '../forms/SalaryCertificateTemplate';
import { usePrintLogStore } from '../stores/printLogStore';
import { usePrintDraftStore } from '../stores/printDraftStore';

type Lang = 'ar' | 'en';

const FORM_KEY = 'salary-certificate';

const INITIAL_PRINT_OVERRIDES: PrintOverrides = {
  purpose: '',
  jobTitle: '',
  department: '',
  salaryText: '',
  issueDate: '',
  notes: '',
};

export default function SalaryCertificate() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const { search } = useLocation();
  const formNumber = useMemo(() => generateFormNumber('salary-certificate'), []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [lang, setLang] = useState<Lang>('ar');
  const [profile, setProfile] = usePrintProfileMemory(FORM_KEY, getProfileIdFromSearch(search));
  const [printOverrides, setPrintOverrides] = useState<PrintOverrides>({ ...INITIAL_PRINT_OVERRIDES });

  useEffect(() => {
    if (!employeeId) return;
    api
      .get(`/forms/salary-certificate/${employeeId}`)
      .then((res) => setData(res.data.data))
      .catch((e) => setError(errorMessage(e)));
  }, [employeeId]);

  useEffect(() => {
    if (!data) return;
    api
      .post('/forms/print-log', {
        formType: 'salary-certificate',
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
  function resetPrintOverrides() { setShowClearConfirm(true); }
  function executeClear() { setShowClearConfirm(false); setPrintOverrides({ ...INITIAL_PRINT_OVERRIDES }); }

  const addPrintLog = usePrintLogStore((s) => s.addEntry);
  useEffect(() => {
    if (!data) return;
    const handler = () => addPrintLog({ formType: 'salary-certificate', formNumber, employeeName: data.employee.fullName, printProfile: profile });
    window.addEventListener('beforeprint', handler);
    return () => window.removeEventListener('beforeprint', handler);
  }, [data, formNumber, addPrintLog, profile]);

  if (error)
    return <div className="center-msg">تعذّر تحميل بيانات الشهادة: {error}</div>;
  if (!data)
    return (
      <div className="center-msg">
        <div className="spinner" />
        جارٍ تجهيز الشهادة…
      </div>
    );

  return (
    <FormLayout
      formType={FORM_KEY}
      lang={lang}
      ready
      formNumber={formNumber}
      title={lang === 'en' ? 'Salary Certificate' : 'شـهـادة راتـب'}
      profile={profile}
      toolbarExtra={
        <>
          <LanguageToggle lang={lang} onChange={setLang} />
          <PrintProfileToggle profile={profile} onChange={setProfile} />
          <button
            type="button"
            className="btn secondary"
            style={{ fontSize: 12, padding: '4px 8px' }}
            title="حفظ مسودة"
            onClick={() => saveDraft(FORM_KEY, printOverrides as unknown as Record<string, unknown>)}
          >
            💾
          </button>
          {draftEntry && (
            <button
              type="button"
              className="btn secondary"
              style={{ fontSize: 12, padding: '4px 8px', color: 'var(--primary)' }}
              title="استعادة المسودة"
              onClick={() => setPrintOverrides(draftEntry.state as PrintOverrides)}
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
        formType: 'salary-certificate',
        formNumber,
        employeeId: Number(employeeId),
        employeeName: data.employee.fullName,
        issueDate: new Date().toISOString(),
      }}
    >
      <div className="no-print" style={{ marginBottom: 16, padding: '14px 18px', background: 'var(--surface-2)', border: '1px dashed var(--border)', borderRadius: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
          تعديلات الطباعة — لن تُحفظ في قاعدة البيانات / Print Overrides — not saved
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', maxWidth: 700 }}>
          <div className="field">
            <label>الغرض / Purpose</label>
            <input
              maxLength={120}
              value={printOverrides.purpose ?? ''}
              onChange={(e) => setPrintOverrides(p => ({ ...p, purpose: e.target.value }))}
              placeholder="مثال: للتقديم إلى البنك"
            />
          </div>
          <div className="field">
            <label>المسمى الوظيفي / Job Title</label>
            <input
              maxLength={100}
              value={printOverrides.jobTitle ?? ''}
              onChange={(e) => setPrintOverrides(p => ({ ...p, jobTitle: e.target.value }))}
              placeholder={data.employee.jobTitle ?? ''}
            />
          </div>
          <div className="field">
            <label>القسم / Department</label>
            <input
              maxLength={100}
              value={printOverrides.department ?? ''}
              onChange={(e) => setPrintOverrides(p => ({ ...p, department: e.target.value }))}
              placeholder={data.employee.department ?? ''}
            />
          </div>
          <div className="field">
            <label>نص الراتب / Salary Text</label>
            <input
              maxLength={120}
              value={printOverrides.salaryText ?? ''}
              onChange={(e) => setPrintOverrides(p => ({ ...p, salaryText: e.target.value }))}
              placeholder="مثال: مئتان وخمسون دينارًا كويتيًا"
            />
          </div>
          <div className="field">
            <label>تاريخ الإصدار / Issue Date</label>
            <input
              maxLength={60}
              value={printOverrides.issueDate ?? ''}
              onChange={(e) => setPrintOverrides(p => ({ ...p, issueDate: e.target.value }))}
              placeholder="اتركه فارغًا للتاريخ التلقائي"
            />
          </div>
          <div className="field">
            <label>ملاحظات / Notes</label>
            <input
              maxLength={200}
              value={printOverrides.notes ?? ''}
              onChange={(e) => setPrintOverrides(p => ({ ...p, notes: e.target.value }))}
              placeholder="ملاحظات إضافية تظهر في الطباعة"
            />
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          <button
            type="button"
            className="btn secondary"
            style={{ fontSize: 12 }}
            onClick={resetPrintOverrides}
          >
            ↺ مسح تعديلات الطباعة
          </button>
        </div>
      </div>
      <SalaryCertificateTemplate
        employee={data.employee}
        latestPayroll={data.latestPayroll}
        lang={lang}
        printOverrides={printOverrides}
      />
      {showClearConfirm && (
        <ConfirmModal message="سيتم مسح جميع تعديلات الطباعة. هل تريد المتابعة؟" confirmLabel="مسح" variant="warning" onConfirm={executeClear} onCancel={() => setShowClearConfirm(false)} />
      )}
    </FormLayout>
  );
}
