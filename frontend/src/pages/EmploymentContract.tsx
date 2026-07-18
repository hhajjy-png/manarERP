import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { printCurrentView } from '../utils/print';
import {
  useLegacyFormPreview,
  isLegacyFormsPreviewEnabled,
  PRINT_PREVIEW_LEGACY_FORMS_SPECIAL,
  useAccurateFormPreview,
  isFlagEnabled,
  UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1,
} from '../printing';
import { useParams, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import DateInput from '../components/DateInput';
import { todayDateOnly } from '../lib/date';
import { generateFormNumber } from '../forms/shared/formNumber';
import EmploymentContractTemplate, {
  type ContractParams,
  type ContractEmployee,
} from '../forms/EmploymentContractTemplate';
import { ProfileId, DEFAULT_PROFILE_ID } from '../forms/shared/printProfiles';
import PrintProfileToggle from '../forms/shared/PrintProfileToggle';
import { usePrintDraftStore } from '../stores/printDraftStore';
import { usePrintLogStore } from '../stores/printLogStore';
import { getNationalityEn, getJobTitleEn, applyTranslationOverrides } from '../forms/shared/contractTranslations';
import { AUTHORIZED_SIGNATORIES, DEFAULT_AUTHORIZED_SIGNATORY_ID } from '../forms/shared/authorizedSignatories';

function todayISO(): string {
  return todayDateOnly();
}

const DURATION_OPTIONS = [
  { ar: 'سنة', en: 'ONE YEAR' },
  { ar: 'سنتين', en: 'TWO YEARS' },
  { ar: 'ثلاث سنوات', en: 'THREE YEARS' },
] as const;

/**
 * Enterprise-style panel/section chrome shared by the three data-entry screens
 * (contract params, new-employee, existing-employee lookup). Reuses the app's
 * existing design tokens (--surface/--border/--radius/--shadow/...) and the
 * global `.field` label+input pattern — no new input styling is introduced.
 * Scoped with an `ecx-` prefix distinct from `ModeSelector`'s own `.ecx-card`/
 * `.ecx-cards`/`.ecx-note` classes so neither screen's styles collide.
 */
const ENTERPRISE_FORM_STYLES = `
  .ecx-shell { max-width: 760px; margin-inline: auto; }
  .ecx-panel {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow-sm);
    padding: 24px 28px;
    margin-bottom: 20px;
  }
  .ecx-panel-head {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 18px;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--border);
  }
  .ecx-panel-icon {
    font-size: 18px;
    line-height: 1;
    width: 36px;
    height: 36px;
    border-radius: 10px;
    background: var(--surface-2);
    display: grid;
    place-items: center;
    flex-shrink: 0;
  }
  .ecx-panel-title { font-size: 15px; font-weight: 800; margin: 0; }
  .ecx-panel-desc { font-size: 12.5px; color: var(--text-muted); margin: 3px 0 0; font-weight: 600; }
  .ecx-grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
  .ecx-actions { display: flex; gap: 12px; margin-top: 4px; }
  .ecx-employee-chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 14px;
    background: var(--surface-2);
    border-radius: 999px;
    font-size: 12.5px;
    font-weight: 700;
    color: var(--text-muted);
  }
  .ecx-error-banner {
    background: #fef2f2;
    border: 1px solid #fca5a5;
    border-radius: 10px;
    padding: 12px 16px;
    margin-bottom: 18px;
    color: #dc2626;
    font-size: 13px;
    font-weight: 600;
  }
  .ecx-hint-banner {
    margin-top: 4px;
    padding: 12px 16px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 10px;
    color: var(--text-muted);
    font-size: 12.5px;
    line-height: 1.7;
  }
  .ecx-translate-btn {
    font-size: 11px;
    font-weight: 700;
    color: var(--accent, #3b82f6);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0 2px;
    font-family: inherit;
  }
`;

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
    authorizedSignatoryId: DEFAULT_AUTHORIZED_SIGNATORY_ID,
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
      <style>{ENTERPRISE_FORM_STYLES}</style>
      <div className="page-head">
        <div>
          <h2>عقد العمل — بيانات العقد</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>
            الموظف: <strong>{employee.fullName}</strong>
            {employee.fullNameEn ? ` / ${employee.fullNameEn}` : ''}
          </p>
        </div>
      </div>

      <div className="ecx-shell">
        <div className="ecx-panel">
          <div className="ecx-panel-head">
            <span className="ecx-panel-icon" aria-hidden="true">📅</span>
            <div>
              <h3 className="ecx-panel-title">التواريخ ومدة العقد</h3>
              <p className="ecx-panel-desc">تاريخ التحرير، بداية النفاذ، والمدة التعاقدية</p>
            </div>
          </div>
          <div className="ecx-grid-2" style={{ marginBottom: 16 }}>
            <div className="field">
              <label>تاريخ تحرير العقد</label>
              <DateInput value={params.issueDate} onChange={v => onChange('issueDate', v)} />
            </div>
            <div className="field">
              <label>تاريخ بداية نفاذ العقد</label>
              <DateInput value={params.startDate} onChange={v => onChange('startDate', v)} />
            </div>
          </div>
          <div className="field">
            <label>مدة العقد</label>
            <select title="مدة العقد" value={params.durationAr}
              onChange={e => handleDuration(e.target.value)}>
              {DURATION_OPTIONS.map(o => (
                <option key={o.ar} value={o.ar}>{o.ar} / {o.en}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="ecx-panel">
          <div className="ecx-panel-head">
            <span className="ecx-panel-icon" aria-hidden="true">🖋️</span>
            <div>
              <h3 className="ecx-panel-title">المفوض بالتوقيع</h3>
              <p className="ecx-panel-desc">ممثل الطرف الأول (صاحب العمل) في هذا العقد — يُحدَّث تلقائياً في كامل العقد</p>
            </div>
          </div>
          <div className="field">
            <label>المفوض بالتوقيع</label>
            <select title="المفوض بالتوقيع" value={params.authorizedSignatoryId}
              onChange={e => onChange('authorizedSignatoryId', e.target.value)}>
              {AUTHORIZED_SIGNATORIES.map(s => (
                <option key={s.id} value={s.id}>{s.nameAr}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="ecx-panel">
          <div className="ecx-panel-head">
            <span className="ecx-panel-icon" aria-hidden="true">⏱️</span>
            <div>
              <h3 className="ecx-panel-title">فترة التجربة والإجازة السنوية</h3>
            </div>
          </div>
          <div className="ecx-grid-2">
            <div className="field">
              <label>فترة التجربة (أيام)</label>
              <input type="number" lang="en" min={1} max={365}
                value={params.probationDays}
                onChange={e => onChange('probationDays', Math.max(1, Number(e.target.value)))} />
            </div>
            <div className="field">
              <label>الإجازة السنوية (أيام)</label>
              <input type="number" lang="en" min={1} max={60}
                value={params.annualLeaveDays}
                onChange={e => onChange('annualLeaveDays', Math.max(1, Number(e.target.value)))} />
            </div>
          </div>
        </div>

        <div className="ecx-panel">
          <div className="ecx-panel-head">
            <span className="ecx-panel-icon" aria-hidden="true">📝</span>
            <div>
              <h3 className="ecx-panel-title">الشروط الخاصة</h3>
            </div>
          </div>
          <div className="ecx-grid-2">
            <div className="field">
              <label>الشروط الخاصة (عربي)</label>
              <input type="text" value={params.specialConditionsAr}
                onChange={e => onChange('specialConditionsAr', e.target.value)}
                placeholder="لايوجد" />
            </div>
            <div className="field">
              <label>الشروط الخاصة (English)</label>
              <input type="text" value={params.specialConditionsEn}
                onChange={e => onChange('specialConditionsEn', e.target.value)}
                placeholder="NOTHING" />
            </div>
          </div>
        </div>

        <div className="ecx-actions">
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
      <style>{ENTERPRISE_FORM_STYLES}</style>
      <div className="page-head">
        <div>
          <h2>عقد العمل — بيانات الموظف الجديد</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>
            أدخل البيانات يدوياً — لن يُنشأ سجل للموظف في النظام
          </p>
        </div>
      </div>

      <div className="ecx-shell">
        {error && <div className="ecx-error-banner">{error}</div>}

        <div className="ecx-panel">
          <div className="ecx-panel-head">
            <span className="ecx-panel-icon" aria-hidden="true">🧑</span>
            <div>
              <h3 className="ecx-panel-title">الهوية</h3>
              <p className="ecx-panel-desc">الاسم والرقم المدني وجواز السفر</p>
            </div>
          </div>
          <div className="ecx-grid-2" style={{ marginBottom: 16 }}>
            <div className="field">
              <label>الاسم بالعربي <span style={{ color: '#dc2626' }}>*</span></label>
              <input value={data.fullName}
                onChange={e => set('fullName', e.target.value)}
                placeholder="الاسم الكامل بالعربي" />
            </div>
            <div className="field">
              <label>الاسم بالإنجليزي</label>
              <input value={data.fullNameEn}
                onChange={e => set('fullNameEn', e.target.value)}
                placeholder="Full name in English" />
            </div>
          </div>
          <div className="ecx-grid-2">
            <div className="field">
              <label>الرقم المدني</label>
              <input value={data.civilId}
                onChange={e => set('civilId', e.target.value)}
                placeholder="00000000000" />
            </div>
            <div className="field">
              <label>رقم الجواز</label>
              <input value={data.passportNumber}
                onChange={e => set('passportNumber', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="ecx-panel">
          <div className="ecx-panel-head">
            <span className="ecx-panel-icon" aria-hidden="true">🌍</span>
            <div>
              <h3 className="ecx-panel-title">الجنسية والوظيفة</h3>
            </div>
          </div>
          <div className="ecx-grid-2" style={{ marginBottom: 16 }}>
            <div className="field">
              <label>الجنسية</label>
              <input value={data.nationality}
                onChange={e => set('nationality', e.target.value)}
                placeholder="مثال: كويتي" />
            </div>
            <div className="field">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label>الجنسية بالإنجليزي</label>
                {data.nationality && (
                  <button
                    type="button"
                    className="ecx-translate-btn"
                    title="ترجمة الجنسية من العربي تلقائياً"
                    onClick={() => set('nationalityEn', getNationalityEn(data.nationality))}
                  >
                    ترجمة ←
                  </button>
                )}
              </div>
              <input value={data.nationalityEn}
                onChange={e => set('nationalityEn', e.target.value)}
                placeholder="e.g. Kuwaiti" />
            </div>
          </div>
          <div className="ecx-grid-2">
            <div className="field">
              <label>المسمى الوظيفي</label>
              <input value={data.jobTitle}
                onChange={e => set('jobTitle', e.target.value)}
                placeholder="مثال: مهندس مدني" />
            </div>
            <div className="field">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label>المسمى الوظيفي بالإنجليزي</label>
                {data.jobTitle && (
                  <button
                    type="button"
                    className="ecx-translate-btn"
                    title="ترجمة المسمى الوظيفي من العربي تلقائياً"
                    onClick={() => set('jobTitleEn', getJobTitleEn(data.jobTitle))}
                  >
                    ترجمة ←
                  </button>
                )}
              </div>
              <input value={data.jobTitleEn}
                onChange={e => set('jobTitleEn', e.target.value)}
                placeholder="e.g. Civil Engineer" />
            </div>
          </div>
        </div>

        <div className="ecx-panel">
          <div className="ecx-panel-head">
            <span className="ecx-panel-icon" aria-hidden="true">📞</span>
            <div>
              <h3 className="ecx-panel-title">التواصل والراتب</h3>
            </div>
          </div>
          <div className="ecx-grid-2" style={{ marginBottom: 16 }}>
            <div className="field">
              <label>الراتب الشهري (د.ك) <span style={{ color: '#dc2626' }}>*</span></label>
              <input type="number" lang="en" value={data.salary}
                onChange={e => set('salary', e.target.value)}
                placeholder="0.000" min={0} step={0.001} />
            </div>
            <div className="field">
              <label>رقم الهاتف</label>
              <input value={data.phone}
                onChange={e => set('phone', e.target.value)}
                placeholder="+965 XXXX XXXX" />
            </div>
          </div>
          <div className="field">
            <label>العنوان</label>
            <input value={data.address}
              onChange={e => set('address', e.target.value)}
              placeholder="المنطقة، الشارع، القطعة، البناية..." />
          </div>
        </div>

        <div className="ecx-actions">
          <button className="btn" style={{ flex: 1 }} onClick={handleSubmit}>
            متابعة — بيانات العقد
          </button>
          <button className="btn secondary" onClick={onBack}>رجوع</button>
        </div>

        {/* Informational notice */}
        <div className="ecx-hint-banner">
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

function ModeSelector({ onSelectNew, onSelectExisting, onBackToForms }: {
  onSelectNew: () => void;
  onSelectExisting: () => void;
  onBackToForms: () => void;
}) {
  return (
    <div className="page">
      {/* أنماط محصورة بهذه الخطوة — لا قواعد عامة، ولا تصل الطباعة (خارج الجذر المطبوع). */}
      <style>{`
        .ecx-mode { max-width: 860px; margin-inline: auto; }
        .ecx-cards {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 16px;
          align-items: stretch;          /* بطاقتان متساويتا الارتفاع */
        }
        .ecx-card {
          display: flex;
          flex-direction: column;
          gap: 6px;
          width: 100%;
          text-align: start;             /* RTL/LTR معًا */
          padding: 20px;
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--surface);
          color: var(--text);
          cursor: pointer;
          font-family: inherit;
          transition: border-color .15s, background .15s;
        }
        .ecx-card:hover { border-color: var(--primary, #4f46e5); background: var(--surface-2); }
        .ecx-card:focus-visible {
          outline: 2px solid var(--primary, #4f46e5);
          outline-offset: 2px;
        }
        .ecx-card-icon { font-size: 22px; line-height: 1; }
        .ecx-card-title { font-weight: 800; font-size: 15px; }
        .ecx-card-desc { font-size: 13px; color: var(--text-muted); }
        .ecx-note {
          margin-top: auto;              /* يثبّت التنبيه أسفل البطاقة مهما طال الوصف */
          padding-top: 10px;
          font-size: 12px;
          font-weight: 600;
          color: var(--text-muted);
        }
      `}</style>

      <div className="ecx-mode">
        <div className="page-head" style={{ marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0 }}>عقد العمل</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '4px 0 0' }}>
              اختر طريقة إدخال بيانات الموظف
            </p>
          </div>
          {/* رجوع **صريح** إلى مركز النماذج — لا navigate(-1)، فالمستخدم قد يكون وصل
              من أي مكان (رابط مباشر، تحديث الصفحة، أو شاشة أخرى). */}
          <button type="button" className="btn secondary" onClick={onBackToForms}>
            <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 18, verticalAlign: 'text-bottom', marginInlineEnd: 4 }}>
              arrow_forward
            </span>
            الرجوع إلى مركز النماذج
          </button>
        </div>

        <div className="ecx-cards">
          <button type="button" className="ecx-card" onClick={onSelectExisting}>
            <span className="ecx-card-icon" aria-hidden="true">🔍</span>
            <span className="ecx-card-title">موظف موجود في النظام</span>
            <span className="ecx-card-desc">اختيار موظف مسجل واستكمال بيانات عقده</span>
          </button>

          <button type="button" className="ecx-card" onClick={onSelectNew}>
            <span className="ecx-card-icon" aria-hidden="true">✏️</span>
            <span className="ecx-card-title">موظف جديد — إدخال يدوي</span>
            <span className="ecx-card-desc">إدخال بيانات الموظف لغرض طباعة العقد فقط</span>
            <span className="ecx-note">⚠️ لن يتم إنشاء سجل موظف في النظام</span>
          </button>
        </div>
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
      <style>{ENTERPRISE_FORM_STYLES}</style>
      <div className="page-head">
        <div>
          <h2>عقد العمل — البحث عن موظف</h2>
        </div>
      </div>

      <div className="ecx-shell" style={{ maxWidth: 480 }}>
        <div className="ecx-panel">
          {error && <div className="ecx-error-banner">{error}</div>}

          <div className="field" style={{ marginBottom: 16 }}>
            <label>ابحث بالاسم أو الرقم المدني أو رمز الموظف</label>
            <input value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="مثال: أحمد، EMP-001، 287..." />
          </div>

          <div className="ecx-actions">
            <button className="btn" style={{ flex: 1 }} onClick={handleSearch} disabled={loading}>
              {loading ? 'جارٍ البحث…' : 'بحث'}
            </button>
            <button className="btn secondary" onClick={onBack}>رجوع</button>
          </div>
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

  // Load translation overrides from settings on mount
  useEffect(() => {
    api.get('/settings').then(res => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const list = (res.data.data.settings ?? []) as any[];
      const natEntry = list.find((s: any) => s.key === 'dict.nationalities');
      const jobEntry = list.find((s: any) => s.key === 'dict.jobTitles');
      const nat = natEntry?.value ? JSON.parse(natEntry.value) : {};
      const job = jobEntry?.value ? JSON.parse(jobEntry.value) : {};
      applyTranslationOverrides(nat, job);
    }).catch(() => {});
  }, []);

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

  /** الجذر القابل للطباعة — نفس ما يطبعه المسار القديم (شريط الأوامر `.no-print` يُقتطع). */
  const printRootRef = useRef<HTMLDivElement>(null);

  const preview = useLegacyFormPreview({
    enabled: isLegacyFormsPreviewEnabled(PRINT_PREVIEW_LEGACY_FORMS_SPECIAL),
    title: 'عقد عمل',
    documentLabel: `عقد عمل · ${formNumber}`,
  });

  /**
   * المعاينة الدقيقة (True Chromium WYSIWYG) — **إضافية بحتة**.
   *
   * تستهلك **نفس** العقدة المطبوعة (`printRootRef`) و**نفس** دالة الطباعة القديمة
   * (`handlePrint`) — بمرجعها، بلا تغليف. لا قالب بديل، ولا HTML مختلف، ولا محرّك جديد.
   * المعاينة القديمة وزر الطباعة ومسارهما باقون كما هم. العلم مطفأ ⇒ لا زر ولا حوار.
   */
  const accurate = useAccurateFormPreview({
    enabled: isFlagEnabled(UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1),
    getNode: () => printRootRef.current,
    onPrint: () => handlePrint(),
    title: 'عقد عمل',
    documentLabel: `عقد عمل · ${formNumber}`,
  });

  /**
   * مِحوَل صغير حول زر الطباعة وحده. `handlePrint` القديمة تبقى كما هي حرفيًا — بما
   * فيها حفظ المسودّة وسجلّ الطباعة وعدّاد النسخ — وتُمرَّر كمرجع (`proceed`) فتُنفَّذ
   * **عند الموافقة داخل المعاينة**، لا عند فتحها. لا طباعة تلقائية في هذه الشاشة.
   */
  const requestPrint = useCallback(() => {
    if (preview.printIntercept) {
      preview.printIntercept({ proceed: handlePrint, node: printRootRef.current });
      return;
    }
    handlePrint(); // العلم OFF — السلوك القديم حرفيًا
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview.printIntercept]);

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
    printCurrentView();
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
        onBackToForms={() => navigate('/forms')}
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
      <>
      {/* خارج الجذر القابل للطباعة — لا يدخل المستند المُركَّب. */}
      {preview.dialog}
      {accurate.dialog}
      <div ref={printRootRef} className="contract-print-root" style={{ maxWidth: 860, margin: '0 auto', padding: '16px 20px', background: '#fff' }}>
        <div
          className="no-print"
          style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center' }}
        >
          <button className="btn" onClick={requestPrint}>
            🖨️ طباعة / حفظ PDF
          </button>
          {accurate.button}
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

        <EmploymentContractTemplate employee={employee} params={params} profile={profile} formNumber={formNumber} />
      </div>
      </>
    );
  }

  return null;
}
