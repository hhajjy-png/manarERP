import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { printCurrentView } from '../utils/print';
import {
  useAccurateFormPreview,
  isFlagEnabled,
  UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1,
} from '../printing';
import { useParams, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import DateInput from '../components/DateInput';
import { todayDateOnly } from '../lib/date';
import { generateFormNumber } from '../forms/shared/formNumber';
import { useT } from '../lib/i18n';
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

type Translate = (key: string, vars?: Record<string, string | number>) => string;

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
  t: Translate;
}

function ContractParamsDialog({ employee, params, onChange, onConfirm, onBack, t }: DialogProps) {
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
          <h2>{t('page.contract.params_title')}</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>
            {t('page.contract.employee_label')} <strong>{employee.fullName}</strong>
            {employee.fullNameEn ? ` / ${employee.fullNameEn}` : ''}
          </p>
        </div>
      </div>

      <div className="ecx-shell">
        <div className="ecx-panel">
          <div className="ecx-panel-head">
            <span className="ecx-panel-icon" aria-hidden="true">📅</span>
            <div>
              <h3 className="ecx-panel-title">{t('page.contract.dates_section_title')}</h3>
              <p className="ecx-panel-desc">{t('page.contract.dates_section_desc')}</p>
            </div>
          </div>
          <div className="ecx-grid-2" style={{ marginBottom: 16 }}>
            <div className="field">
              <label>{t('page.contract.field.issue_date')}</label>
              <DateInput value={params.issueDate} onChange={v => onChange('issueDate', v)} />
            </div>
            <div className="field">
              <label>{t('page.contract.field.effective_date')}</label>
              <DateInput value={params.startDate} onChange={v => onChange('startDate', v)} />
            </div>
          </div>
          <div className="field">
            <label>{t('page.contract.field.duration')}</label>
            <select title={t('page.contract.field.duration')} value={params.durationAr}
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
              <h3 className="ecx-panel-title">{t('page.contract.signatory')}</h3>
              <p className="ecx-panel-desc">{t('page.contract.signatory_desc')}</p>
            </div>
          </div>
          <div className="field">
            <label>{t('page.contract.signatory')}</label>
            <select title={t('page.contract.signatory')} value={params.authorizedSignatoryId}
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
              <h3 className="ecx-panel-title">{t('page.contract.probation_section_title')}</h3>
            </div>
          </div>
          <div className="ecx-grid-2">
            <div className="field">
              <label>{t('page.contract.field.probation_days')}</label>
              <input type="number" lang="en" min={1} max={365}
                value={params.probationDays}
                onChange={e => onChange('probationDays', Math.max(1, Number(e.target.value)))} />
            </div>
            <div className="field">
              <label>{t('page.contract.field.annual_leave_days')}</label>
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
              <h3 className="ecx-panel-title">{t('page.contract.special_conditions_title')}</h3>
            </div>
          </div>
          <div className="ecx-grid-2">
            <div className="field">
              <label>{t('page.contract.field.special_conditions_ar')}</label>
              <input type="text" value={params.specialConditionsAr}
                onChange={e => onChange('specialConditionsAr', e.target.value)}
                placeholder="لايوجد" />
            </div>
            <div className="field">
              <label>{t('page.contract.field.special_conditions_en')}</label>
              <input type="text" value={params.specialConditionsEn}
                onChange={e => onChange('specialConditionsEn', e.target.value)}
                placeholder="NOTHING" />
            </div>
          </div>
        </div>

        <div className="ecx-actions">
          <button className="btn" style={{ flex: 1 }} onClick={onConfirm}>
            {t('page.contract.preview_print_btn')}
          </button>
          <button className="btn secondary" onClick={onBack}>{t('btn.payslip.back')}</button>
        </div>
      </div>
    </div>
  );
}

// ─── New employee form ────────────────────────────────────────────────────────

function NewEmployeeForm({ onComplete, onBack, t }: {
  onComplete: (emp: ContractEmployee) => void;
  onBack: () => void;
  t: Translate;
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
    if (!data.fullName.trim()) { setError(t('page.contract.err_name_required')); return; }
    const sal = Number(data.salary);
    if (!data.salary || isNaN(sal) || sal <= 0) {
      setError(t('page.contract.err_salary_required'));
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
          <h2>{t('page.contract.new_employee_title')}</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>
            {t('page.contract.new_employee_hint')}
          </p>
        </div>
      </div>

      <div className="ecx-shell">
        {error && <div className="ecx-error-banner">{error}</div>}

        <div className="ecx-panel">
          <div className="ecx-panel-head">
            <span className="ecx-panel-icon" aria-hidden="true">🧑</span>
            <div>
              <h3 className="ecx-panel-title">{t('page.contract.identity_section_title')}</h3>
              <p className="ecx-panel-desc">{t('page.contract.identity_section_desc')}</p>
            </div>
          </div>
          <div className="ecx-grid-2" style={{ marginBottom: 16 }}>
            <div className="field">
              <label>{t('page.contract.field.name_ar')} <span style={{ color: '#dc2626' }}>*</span></label>
              <input value={data.fullName}
                onChange={e => set('fullName', e.target.value)}
                placeholder={t('page.contract.ph.name_ar')} />
            </div>
            <div className="field">
              <label>{t('page.contract.field.name_en')}</label>
              <input value={data.fullNameEn}
                onChange={e => set('fullNameEn', e.target.value)}
                placeholder="Full name in English" />
            </div>
          </div>
          <div className="ecx-grid-2">
            <div className="field">
              <label>{t('col.civil_id')}</label>
              <input value={data.civilId}
                onChange={e => set('civilId', e.target.value)}
                placeholder="00000000000" />
            </div>
            <div className="field">
              <label>{t('page.contract.field.passport')}</label>
              <input value={data.passportNumber}
                onChange={e => set('passportNumber', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="ecx-panel">
          <div className="ecx-panel-head">
            <span className="ecx-panel-icon" aria-hidden="true">🌍</span>
            <div>
              <h3 className="ecx-panel-title">{t('page.contract.nationality_job_title')}</h3>
            </div>
          </div>
          <div className="ecx-grid-2" style={{ marginBottom: 16 }}>
            <div className="field">
              <label>{t('col.nationality')}</label>
              <input value={data.nationality}
                onChange={e => set('nationality', e.target.value)}
                placeholder={t('page.contract.ph.nationality')} />
            </div>
            <div className="field">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label>{t('page.contract.field.nationality_en')}</label>
                {data.nationality && (
                  <button
                    type="button"
                    className="ecx-translate-btn"
                    title={t('page.contract.translate_nationality_title')}
                    onClick={() => set('nationalityEn', getNationalityEn(data.nationality))}
                  >
                    {t('page.contract.translate_btn')}
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
              <label>{t('page.contract.field.job_title')}</label>
              <input value={data.jobTitle}
                onChange={e => set('jobTitle', e.target.value)}
                placeholder={t('page.contract.ph.job_title')} />
            </div>
            <div className="field">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label>{t('page.contract.field.job_title_en')}</label>
                {data.jobTitle && (
                  <button
                    type="button"
                    className="ecx-translate-btn"
                    title={t('page.contract.translate_job_title_title')}
                    onClick={() => set('jobTitleEn', getJobTitleEn(data.jobTitle))}
                  >
                    {t('page.contract.translate_btn')}
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
              <h3 className="ecx-panel-title">{t('page.contract.contact_salary_title')}</h3>
            </div>
          </div>
          <div className="ecx-grid-2" style={{ marginBottom: 16 }}>
            <div className="field">
              <label>{t('page.contract.field.monthly_salary')} <span style={{ color: '#dc2626' }}>*</span></label>
              <input type="number" lang="en" value={data.salary}
                onChange={e => set('salary', e.target.value)}
                placeholder="0.000" min={0} step={0.001} />
            </div>
            <div className="field">
              <label>{t('page.contract.field.phone')}</label>
              <input value={data.phone}
                onChange={e => set('phone', e.target.value)}
                placeholder="+965 XXXX XXXX" />
            </div>
          </div>
          <div className="field">
            <label>{t('field.address')}</label>
            <input value={data.address}
              onChange={e => set('address', e.target.value)}
              placeholder={t('page.contract.ph.address')} />
          </div>
        </div>

        <div className="ecx-actions">
          <button className="btn" style={{ flex: 1 }} onClick={handleSubmit}>
            {t('page.contract.continue_btn')}
          </button>
          <button className="btn secondary" onClick={onBack}>{t('btn.payslip.back')}</button>
        </div>

        {/* Informational notice */}
        <div className="ecx-hint-banner">
          <strong style={{ color: 'var(--text)', display: 'block', marginBottom: 2 }}>
            {t('page.contract.note_label')}
          </strong>
          {t('page.contract.note_text')}
        </div>
      </div>
    </div>
  );
}

// ─── Mode selector ────────────────────────────────────────────────────────────

function ModeSelector({ onSelectNew, onSelectExisting, onBackToForms, t }: {
  onSelectNew: () => void;
  onSelectExisting: () => void;
  onBackToForms: () => void;
  t: Translate;
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
            <h2 style={{ margin: 0 }}>{t('page.contract.mode_title')}</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '4px 0 0' }}>
              {t('page.contract.mode_subtitle')}
            </p>
          </div>
          {/* رجوع **صريح** إلى مركز النماذج — لا navigate(-1)، فالمستخدم قد يكون وصل
              من أي مكان (رابط مباشر، تحديث الصفحة، أو شاشة أخرى). */}
          <button type="button" className="btn secondary" onClick={onBackToForms}>
            <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 18, verticalAlign: 'text-bottom', marginInlineEnd: 4 }}>
              arrow_forward
            </span>
            {t('page.contract.back_to_forms')}
          </button>
        </div>

        <div className="ecx-cards">
          <button type="button" className="ecx-card" onClick={onSelectExisting}>
            <span className="ecx-card-icon" aria-hidden="true">🔍</span>
            <span className="ecx-card-title">{t('page.contract.mode_existing_title')}</span>
            <span className="ecx-card-desc">{t('page.contract.mode_existing_desc')}</span>
          </button>

          <button type="button" className="ecx-card" onClick={onSelectNew}>
            <span className="ecx-card-icon" aria-hidden="true">✏️</span>
            <span className="ecx-card-title">{t('page.contract.mode_new_title')}</span>
            <span className="ecx-card-desc">{t('page.contract.mode_new_desc')}</span>
            <span className="ecx-note">{t('page.contract.mode_new_note')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Existing employee lookup ─────────────────────────────────────────────────

function ExistingEmployeeLookup({ onFound, onBack, t }: {
  onFound: (emp: ContractEmployee) => void;
  onBack: () => void;
  t: Translate;
}) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSearch() {
    if (!query.trim()) { setError(t('page.contract.err_search_required')); return; }
    setError('');
    setLoading(true);
    try {
      const res = await api.get(`/employees?search=${encodeURIComponent(query.trim())}&limit=1`);
      const rows: ContractEmployee[] = res.data.data?.data ?? [];
      if (rows.length === 0) { setError(t('page.contract.err_not_found')); return; }
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
          <h2>{t('page.contract.lookup_title')}</h2>
        </div>
      </div>

      <div className="ecx-shell" style={{ maxWidth: 480 }}>
        <div className="ecx-panel">
          {error && <div className="ecx-error-banner">{error}</div>}

          <div className="field" style={{ marginBottom: 16 }}>
            <label>{t('page.contract.field.search_label')}</label>
            <input value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder={t('page.contract.ph.search')} />
          </div>

          <div className="ecx-actions">
            <button className="btn" style={{ flex: 1 }} onClick={handleSearch} disabled={loading}>
              {loading ? t('search.loading') : t('action.search')}
            </button>
            <button className="btn secondary" onClick={onBack}>{t('btn.payslip.back')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type Mode = 'selector' | 'existing-lookup' | 'new-form' | 'params' | 'preview';

export default function EmploymentContract() {
  const { t } = useT();
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

  const contractDocLabel = `${t('page.contract.doc_title')} · ${formNumber}`;

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
    title: t('page.contract.doc_title'),
    documentLabel: contractDocLabel,
    // لا مبدّل لغة في هذا النموذج — العقد ثنائي اللغة داخل نفس الصفحة (عربي/
    // إنجليزي جنبًا إلى جنب)، لا "نسختان" يختار المستخدم بينهما. 'ar' هنا صريحة
    // لِما كان ضمنيًا (افتراضي الخطّاف السابق) — لا تغيير سلوكي.
    lang: 'ar',
  });

  /** زر الطباعة يستدعي `handlePrint` مباشرة — لا معترِض، ولا معاينة قبل الطباعة. */
  const requestPrint = useCallback(() => {
    handlePrint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    return <div className="center-msg">{t('page.contract.err_load_failed')} {fetchError}</div>;
  }

  if (employeeId && !employee) {
    return (
      <div className="center-msg">
        <div className="spinner" />
        {t('msg.loading')}
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
        t={t}
      />
    );
  }

  if (mode === 'existing-lookup') {
    return (
      <ExistingEmployeeLookup
        onFound={emp => { setEmployee(emp); setMode('params'); }}
        onBack={() => setMode('selector')}
        t={t}
      />
    );
  }

  if (mode === 'new-form') {
    return (
      <NewEmployeeForm
        onComplete={emp => { setEmployee(emp); setMode('params'); }}
        onBack={() => setMode('selector')}
        t={t}
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
        t={t}
      />
    );
  }

  // ── Preview / print ────────────────────────────────────────────────────────

  if (mode === 'preview' && employee) {
    return (
      <>
      {/* خارج الجذر القابل للطباعة — لا يدخل المستند المُركَّب. */}
      {accurate.dialog}
      <div ref={printRootRef} className="contract-print-root" style={{ maxWidth: 860, margin: '0 auto', padding: '16px 20px', background: '#fff' }}>
        <div
          className="no-print"
          style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center' }}
        >
          <button className="btn" onClick={requestPrint}>
            {t('page.contract.print_save_pdf')}
          </button>
          {accurate.button}
          <button className="btn secondary" onClick={() => setMode('params')}>
            {t('page.contract.edit_details')}
          </button>
          <button className="btn secondary" onClick={() => employeeId ? navigate(-1) : setMode('selector')}>
            {t('btn.payslip.back')}
          </button>
          {printCount > 0 && getDraft('employment-contract') && (
            <button type="button" className="btn secondary" onClick={restoreLastDraft} title={t('page.contract.restore_draft_title')}>
              {t('page.contract.restore_draft_btn')}
            </button>
          )}
          {/* Employment Contract intentionally does not offer "Ready Paper" (Phase 1). */}
          <PrintProfileToggle profile={profile} onChange={setProfile} excludeIds={['ready-paper']} />
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
