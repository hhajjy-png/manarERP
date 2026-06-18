import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { generateFormNumber } from '../forms/shared/formNumber';
import EmploymentContractTemplate, {
  type ContractParams,
  type ContractEmployee,
} from '../forms/EmploymentContractTemplate';

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
            <input type="date" style={inp} value={params.issueDate}
              onChange={e => onChange('issueDate', e.target.value)} />
          </div>
          <div>
            <label style={lbl}>تاريخ بداية نفاذ العقد</label>
            <input type="date" style={inp} value={params.startDate}
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
            <input type="number" style={inp} min={1} max={365}
              value={params.probationDays}
              onChange={e => onChange('probationDays', Math.max(1, Number(e.target.value)))} />
          </div>
          <div>
            <label style={lbl}>الإجازة السنوية (أيام)</label>
            <input type="number" style={inp} min={1} max={60}
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

export default function EmploymentContract() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const navigate = useNavigate();
  const formNumber = useMemo(() => generateFormNumber('employment-contract'), []);

  const [employee, setEmployee] = useState<ContractEmployee | null>(null);
  const [fetchError, setFetchError] = useState('');
  const [showTemplate, setShowTemplate] = useState(false);

  const [params, setParams] = useState<ContractParams>({
    issueDate: todayISO(),
    startDate: todayISO(),
    durationAr: 'سنة',
    durationEn: 'ONE YEAR',
    probationDays: 100,
    annualLeaveDays: 30,
    specialConditionsAr: 'لايوجد',
    specialConditionsEn: 'NOTHING',
  });

  useEffect(() => {
    if (!employeeId) return;
    api
      .get(`/forms/employment-contract/${employeeId}`)
      .then(res => setEmployee(res.data.data.employee))
      .catch(e => setFetchError(errorMessage(e)));
  }, [employeeId]);

  useEffect(() => {
    if (!employee || !showTemplate) return;
    api
      .post('/forms/print-log', {
        formType: 'employment-contract',
        formNumber,
        employeeId: Number(employeeId),
        employeeName: employee.fullName,
        issueDate: new Date().toISOString(),
        printMode: 'full-template',
      })
      .catch(() => {});
  }, [employee, showTemplate, formNumber, employeeId]);

  if (fetchError)
    return (
      <div className="center-msg">تعذّر تحميل بيانات الموظف: {fetchError}</div>
    );

  if (!employee)
    return (
      <div className="center-msg">
        <div className="spinner" />
        جارٍ التحميل…
      </div>
    );

  if (!showTemplate) {
    return (
      <ContractParamsDialog
        employee={employee}
        params={params}
        onChange={(key, value) => setParams(prev => ({ ...prev, [key]: value }))}
        onConfirm={() => setShowTemplate(true)}
        onBack={() => navigate(-1)}
      />
    );
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '16px 20px', background: '#fff' }}>
      <div
        className="no-print"
        style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center' }}
      >
        <button className="btn" onClick={() => window.print()}>
          🖨️ طباعة / حفظ PDF
        </button>
        <button className="btn secondary" onClick={() => setShowTemplate(false)}>
          ✏️ تعديل البيانات
        </button>
        <button className="btn secondary" onClick={() => navigate(-1)}>
          رجوع
        </button>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginRight: 'auto' }}>
          {formNumber}
        </span>
      </div>

      <EmploymentContractTemplate employee={employee} params={params} />
    </div>
  );
}
