import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { generateFormNumber } from '../forms/shared/formNumber';
import EmploymentContractTemplate, {
  type ContractParams,
  type ContractEmployee,
} from '../forms/EmploymentContractTemplate';
import { ProfileId, DEFAULT_PROFILE_ID } from '../forms/shared/printProfiles';
import PrintProfileToggle from '../forms/shared/PrintProfileToggle';
import { usePrintDraftStore } from '../stores/printDraftStore';
import { usePrintLogStore } from '../stores/printLogStore';
import { getNationalityEn, getJobTitleEn } from '../forms/shared/contractTranslations';

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

const DURATION_OPTIONS = [
  { ar: 'سنة', en: 'ONE YEAR' },
  { ar: 'سنتين', en: 'TWO YEARS' },
  { ar: 'ثلاث سنوات', en: 'THREE YEARS' },
] as const;

const inp: React.CSSProperties = {
  padding: '7px 10px',
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--bg)',
  color: 'var(--text)',
  fontFamily: 'inherit',
  fontSize: 13,
  width: '100%',
  boxSizing: 'border-box',
};

const lbl: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 700,
  marginBottom: 5,
  color: 'var(--text-muted)',
};

function defaultParams(): ContractParams {
  return {
    issueDate: todayISO(),
    startDate: todayISO(),
    durationAr: 'سنة',
    durationEn: 'ONE YEAR',
    probationDays: 100,
    annualLeaveDays: 30,
    specialConditionsAr: 'لايوجد',
    specialConditionsEn: 'NOTHING',
  };
}

// ─── Contract params dialog ──────────────────────────────────────────────────

interface DialogProps {
  employee: ContractEmployee;
  params: ContractParams;
  onChange: <K extends keyof ContractParams>(key: K, value: ContractParams[K]) => void;
  onConfirm: () => void;
  onBack: () => void;
}

function ContractParamsDialog({ employee, params, onChange, onConfirm, onBack }: DialogProps) {
  function handleDuration(ar: string) {
    const opt = DURATION_OPTIONS.find(o => o.ar === ar);
    if (!opt) return;
    onChange('durationAr', opt.ar);
    onChange('durationEn', opt.en);
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>عقد العمل — بيانات العقد</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>
            الموظف: <strong>{employee.fullName}</strong>
            {employee.fullNameEn ? ` / ${employee.fullNameEn}` : ''}
          </p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 640, padding: 28 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 14 }}>
          <div>
            <label style={lbl}>تاريخ تحرير العقد</label>
            <input type="date" lang="en" style={inp} value={params.issueDate}
              onChange={e => onChange('issueDate', e.target.value)} />
          </div>
          <div>
            <label style={lbl}>تاريخ بداية نفاذ العقد</label>
            <input type="date" lang="en" style={inp} value={params.startDate}
              onChange={e => onChange('startDate', e.target.value)} />
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>مدة العقد</label>
          <select title="مدة العقد" style={inp} value={params.durationAr}
            onChange={e => handleDuration(e.target.value)}>
            {DURATION_OPTIONS.map(o => (
              <option key={o.ar} value={o.ar}>{o.ar} / {o.en}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 14 }}>
          <div>
            <label style={lbl}>فترة التجربة (أيام)</label>
            <input type="number" lang="en" style={inp} min={1} max={365}
              value={params.probationDays}
              onChange={e => onChange('probationDays', Math.max(1, Number(e.target.value)))} />
          </div>
          <div>
            <label style={lbl}>الإجازة السنوية (أيام)</label>
            <input type="number" lang="en" style={inp} min={1} max={60}
              value={params.annualLeaveDays}
              onChange={e => onChange('annualLeaveDays', Math.max(1, Number(e.target.value)))} />
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>الشروط الخاصة (عربي)</label>
          <input type="text" style={inp} value={params.specialConditionsAr}
            onChange={e => onChange('specialConditionsAr', e.target.value)}
            placeholder="لايوجد" />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={lbl}>الشروط الخاصة (English)</label>
          <input type="text" style={inp} value={params.specialConditionsEn}
            onChange={e => onChange('specialConditionsEn', e.target.value)}
            placeholder="NOTHING" />
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn" style={{ flex: 1 }} onClick={onConfirm}>
            معاينة وطباعة
          </button>
          <button className="btn secondary" onClick={onBack}>رجوع</button>
        </div>
      </div>
    </div>
  );
}

// ─── New employee form ────────────────────────────────────────────────────────

function NewEmployeeForm({ onComplete, onBack }: {
  onComplete: (emp: ContractEmployee) => void;
  onBack: () => void;
}) {
  const [data, setData] = useState({
    fullName: '',
    fullNameEn: '',
    civilId: '',
    nationality: '',
    nationalityEn: '',
    passportNumber: '',
    jobTitle: '',
    jobTitleEn: '',
    salary: '',
    address: '',
    phone: '',
  });
  const [error, setError] = useState('');

  function set<K extends keyof typeof data>(key: K, val: string) {
    setData(prev => ({ ...prev, [key]: val }));
  }

  function handleSubmit() {
    if (!data.fullName.trim()) { setError('الاسم بالعربي مطلوب'); return; }
    const sal = Number(data.salary);
    if (!data.salary || isNaN(sal) || sal <= 0) {
      setError('الراتب مطلوب ويجب أن يكون رقماً أكبر من صفر');
      return;
    }
    setError('');
    onComplete({
      id: 0,
      code: 'جديد',
      fullName: data.fullName.trim(),
      fullNameEn: data.fullNameEn.trim() || null,
      civilId: data.civilId.trim() || null,
      nationality: data.nationality.trim() || null,
      nationalityEn: data.nationalityEn.trim() || null,
      passportNumber: data.passportNumber.trim() || null,
      jobTitle: data.jobTitle.trim() || null,
      jobTitleEn: data.jobTitleEn.trim() || null,
      salary: sal,
      address: data.address.trim() || null,
      phone: data.phone.trim() || null,
    });
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>عقد العمل — بيانات الموظف الجديد</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>
            أدخل البيانات يدوياً — لن يُنشأ سجل للموظف في النظام
          </p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 640, padding: 28 }}>
        {error && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fca5a5',
            borderRadius: 8, padding: '10px 14px', marginBottom: 16,
            color: '#dc2626', fontSize: 13,
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 14 }}>
          <div>
            <label style={lbl}>الاسم بالعربي <span style={{ color: '#dc2626' }}>*</span></label>
            <input style={inp} value={data.fullName}
              onChange={e => set('fullName', e.target.value)}
              placeholder="الاسم الكامل بالعربي" />
          </div>
          <div>
            <label style={lbl}>الاسم بالإنجليزي</label>
            <input style={inp} value={data.fullNameEn}
              onChange={e => set('fullNameEn', e.target.value)}
              placeholder="Full name in English" />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 14 }}>
          <div>
            <label style={lbl}>الرقم المدني</label>
            <input style={inp} value={data.civilId}
              onChange={e => set('civilId', e.target.value)}
              placeholder="00000000000" />
          </div>
          <div>
            <label style={lbl}>رقم الجواز</label>
            <input style={inp} value={data.passportNumber}
              onChange={e => set('passportNumber', e.target.value)} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 14 }}>
          <div>
            <label style={lbl}>الجنسية</label>
            <input style={inp} value={data.nationality}
              onChange={e => set('nationality', e.target.value)}
              placeholder="مثال: كويتي" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
              <label style={{ ...lbl, marginBottom: 0 }}>الجنسية بالإنجليزي</label>
              {data.nationality && (
                <button
                  type="button"
                  title="ترجمة الجنسية من العربي تلقائياً"
                  style={{ fontSize: 11, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px', fontFamily: 'inherit' }}
                  onClick={() => set('nationalityEn', getNationalityEn(data.nationality))}
                >
                  ترجمة ←
                </button>
              )}
            </div>
            <input style={inp} value={data.nationalityEn}
              onChange={e => set('nationalityEn', e.target.value)}
              placeholder="e.g. Kuwaiti" />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 14 }}>
          <div>
            <label style={lbl}>المسمى الوظيفي</label>
            <input style={inp} value={data.jobTitle}
              onChange={e => set('jobTitle', e.target.value)}
              placeholder="مثال: مهندس مدني" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
              <label style={{ ...lbl, marginBottom: 0 }}>المسمى الوظيفي بالإنجليزي</label>
              {data.jobTitle && (
                <button
                  type="button"
                  title="ترجمة المسمى الوظيفي من العربي تلقائياً"
                  style={{ fontSize: 11, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px', fontFamily: 'inherit' }}
                  onClick={() => set('jobTitleEn', getJobTitleEn(data.jobTitle))}
                >
                  ترجمة ←
                </button>
              )}
            </div>
            <input style={inp} value={data.jobTitleEn}
              onChange={e => set('jobTitleEn', e.target.value)}
              placeholder="e.g. Civil Engineer" />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 14 }}>
          <div>
            <label style={lbl}>الراتب الشهري (د.ك) <span style={{ color: '#dc2626' }}>*</span></label>
            <input type="number" lang="en" style={inp} value={data.salary}
              onChange={e => set('salary', e.target.value)}
              placeholder="0.000" min={0} step={0.001} />
          </div>
          <div>
            <label style={lbl}>رقم الهاتف</label>
            <input style={inp} value={data.phone}
              onChange={e => set('phone', e.target.value)}
              placeholder="+965 XXXX XXXX" />
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={lbl}>العنوان</label>
          <input style={inp} value={data.address}
            onChange={e => set('address', e.target.value)}
            placeholder="المنطقة، الشارع، القطعة، البناية..." />
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn" style={{ flex: 1 }} onClick={handleSubmit}>
            متابعة — بيانات العقد
          </button>
          <button className="btn secondary" onClick={onBack}>رجوع</button>
        </div>

        {/* Informational notice */}
        <div style={{
          marginTop: 16,
          padding: '10px 14px',
          background: 'var(--surface-2, #f0f9ff)',
          border: '1px solid var(--info-border, #bae6fd)',
          borderRadius: 8,
          color: 'var(--text-muted)',
          fontSize: 12,
          lineHeight: 1.6,
        }}>
          <strong style={{ color: 'var(--text)', display: 'block', marginBottom: 2 }}>
            ملاحظة:
          </strong>
          البيانات المدخلة هنا تُستخدم لإنشاء وطباعة عقد العمل فقط، ولن يتم إنشاء سجل موظف جديد في النظام.
          <br />
          <span style={{ direction: 'ltr', display: 'block', marginTop: 2, opacity: 0.75 }}>
            Note: The information entered here is used only to generate and print this employment contract. It will not create a new employee record in the system.
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Mode selector ────────────────────────────────────────────────────────────

function ModeSelector({ onSelectNew, onSelectExisting }: {
  onSelectNew: () => void;
  onSelectExisting: () => void;
}) {
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>عقد العمل — اختر نوع الموظف</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>
            حدد ما إذا كان الموظف موجوداً في النظام أم لا
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20, maxWidth: 640, padding: '8px 0' }}>
        <button
          className="card"
          style={{
            flex: 1, padding: 28, textAlign: 'center', cursor: 'pointer',
            border: '2px solid var(--border)', borderRadius: 12,
            background: 'var(--surface)', transition: 'border-color .15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = '#1d4e6f')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
          onClick={onSelectExisting}
        >
          <div style={{ fontSize: 32, marginBottom: 10 }}>🔍</div>
          <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 6 }}>موظف موجود في النظام</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            ابحث عن موظف مسجّل وأصدر له عقد العمل
          </div>
        </button>

        <button
          className="card"
          style={{
            flex: 1, padding: 28, textAlign: 'center', cursor: 'pointer',
            border: '2px solid var(--border)', borderRadius: 12,
            background: 'var(--surface)', transition: 'border-color .15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = '#1d4e6f')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
          onClick={onSelectNew}
        >
          <div style={{ fontSize: 32, marginBottom: 10 }}>✏️</div>
          <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 6 }}>موظف جديد (إدخال يدوي)</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            أدخل البيانات يدوياً دون إنشاء سجل في النظام
          </div>
        </button>
      </div>
    </div>
  );
}

// ─── Existing employee lookup ─────────────────────────────────────────────────

function ExistingEmployeeLookup({ onFound, onBack }: {
  onFound: (emp: ContractEmployee) => void;
  onBack: () => void;
}) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSearch() {
    if (!query.trim()) { setError('أدخل رقم الموظف أو الرقم المدني'); return; }
    setError('');
    setLoading(true);
    try {
      const res = await api.get(`/employees?search=${encodeURIComponent(query.trim())}&limit=1`);
      const rows: ContractEmployee[] = res.data.data?.data ?? [];
      if (rows.length === 0) { setError('لم يُعثر على موظف بهذا الرقم أو الاسم'); return; }
      const emp = rows[0];
      const detail = await api.get(`/forms/employment-contract/${emp.id}`);
      onFound(detail.data.data.employee);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>عقد العمل — البحث عن موظف</h2>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 480, padding: 28 }}>
        {error && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fca5a5',
            borderRadius: 8, padding: '10px 14px', marginBottom: 16,
            color: '#dc2626', fontSize: 13,
          }}>
            {error}
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <label style={lbl}>ابحث بالاسم أو الرقم المدني أو رمز الموظف</label>
          <input style={inp} value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="مثال: أحمد، EMP-001، 287..." />
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn" style={{ flex: 1 }} onClick={handleSearch} disabled={loading}>
            {loading ? 'جارٍ البحث…' : 'بحث'}
          </button>
          <button className="btn secondary" onClick={onBack}>رجوع</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type Mode = 'selector' | 'existing-lookup' | 'new-form' | 'params' | 'preview';

export default function EmploymentContract() {
  const { employeeId } = useParams<{ employeeId?: string }>();
  const navigate = useNavigate();
  const formNumber = useMemo(() => generateFormNumber('employment-contract'), []);

  const [mode, setMode] = useState<Mode>(employeeId ? 'params' : 'selector');
  const [employee, setEmployee] = useState<ContractEmployee | null>(null);
  const [fetchError, setFetchError] = useState('');
  const hasLogged = useRef(false);

  const [params, setParams] = useState<ContractParams>(defaultParams());
  const [profile, setProfile] = useState<ProfileId>(DEFAULT_PROFILE_ID);
  const [printCount, setPrintCount] = useState(0);

  const saveDraft = usePrintDraftStore(s => s.saveDraft);
  const getDraft = usePrintDraftStore(s => s.getDraft);
  const addPrintLog = usePrintLogStore(s => s.addEntry);

  // Fetch when coming from Employees list with a URL param
  useEffect(() => {
    if (!employeeId) return;
    api
      .get(`/forms/employment-contract/${employeeId}`)
      .then(res => {
        setEmployee(res.data.data.employee);
        setMode('params');
      })
      .catch(e => setFetchError(errorMessage(e)));
  }, [employeeId]);

  useEffect(() => {
    if (!employee || mode !== 'preview' || hasLogged.current) return;
    hasLogged.current = true;
    api
      .post('/forms/print-log', {
        formType: 'employment-contract',
        formNumber,
        employeeId: employee.id || 0,
        employeeName: employee.fullName,
        issueDate: new Date().toISOString(),
        printMode: profile,
      })
      .catch(() => {});
  }, [employee, mode, formNumber, profile]);

  function handlePrint() {
    if (employee) {
      saveDraft('employment-contract', { employee, params, profile });
      addPrintLog({
        formType: 'employment-contract',
        formNumber,
        employeeName: employee.fullName,
        printProfile: profile,
      });
    }
    setPrintCount(c => c + 1);
    window.print();
  }

  function restoreLastDraft() {
    const draft = getDraft('employment-contract');
    if (!draft) return;
    const { employee: e, params: p, profile: pr } = draft.state as {
      employee: ContractEmployee;
      params: ContractParams;
      profile: ProfileId;
    };
    setEmployee(e);
    setParams(p);
    setProfile(pr);
    setMode('preview');
  }

  function handleChange<K extends keyof ContractParams>(key: K, value: ContractParams[K]) {
    setParams(prev => ({ ...prev, [key]: value }));
  }

  // ── Loading / error states ─────────────────────────────────────────────────

  if (fetchError) {
    return <div className="center-msg">تعذّر تحميل بيانات الموظف: {fetchError}</div>;
  }

  if (employeeId && !employee) {
    return (
      <div className="center-msg">
        <div className="spinner" />
        جارٍ التحميل…
      </div>
    );
  }

  // ── Mode selector ──────────────────────────────────────────────────────────

  if (mode === 'selector') {
    return (
      <ModeSelector
        onSelectNew={() => setMode('new-form')}
        onSelectExisting={() => setMode('existing-lookup')}
      />
    );
  }

  if (mode === 'existing-lookup') {
    return (
      <ExistingEmployeeLookup
        onFound={emp => { setEmployee(emp); setMode('params'); }}
        onBack={() => setMode('selector')}
      />
    );
  }

  if (mode === 'new-form') {
    return (
      <NewEmployeeForm
        onComplete={emp => { setEmployee(emp); setMode('params'); }}
        onBack={() => setMode('selector')}
      />
    );
  }

  // ── Contract params dialog ─────────────────────────────────────────────────

  if (mode === 'params' && employee) {
    return (
      <ContractParamsDialog
        employee={employee}
        params={params}
        onChange={handleChange}
        onConfirm={() => setMode('preview')}
        onBack={() => employeeId ? navigate(-1) : setMode(employee.id === 0 ? 'new-form' : 'existing-lookup')}
      />
    );
  }

  // ── Preview / print ────────────────────────────────────────────────────────

  if (mode === 'preview' && employee) {
    return (
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '16px 20px', background: '#fff' }}>
        <div
          className="no-print"
          style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center' }}
        >
          <button className="btn" onClick={handlePrint}>
            🖨️ طباعة / حفظ PDF
          </button>
          <button className="btn secondary" onClick={() => setMode('params')}>
            ✏️ تعديل البيانات
          </button>
          <button className="btn secondary" onClick={() => employeeId ? navigate(-1) : setMode('selector')}>
            رجوع
          </button>
          {printCount > 0 && getDraft('employment-contract') && (
            <button type="button" className="btn secondary" onClick={restoreLastDraft} title="استعادة آخر مسودة مطبوعة">
              ↩ استعادة المسودة
            </button>
          )}
          <PrintProfileToggle profile={profile} onChange={setProfile} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginRight: 'auto' }}>
            {formNumber}
          </span>
        </div>

        <EmploymentContractTemplate employee={employee} params={params} profile={profile} />
      </div>
    );
  }

  return null;
}
