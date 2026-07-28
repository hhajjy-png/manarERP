import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { ProfileId, PRINT_PROFILES, SELECTABLE_PROFILE_IDS, DEFAULT_PROFILE_ID } from '../forms/shared/printProfiles';
import { FORM_CARDS, type FormCard, type FormCategory } from '../forms/shared/formsRegistry';
import PrintLogPanel from '../components/PrintLogPanel';
import { t as translate, useT } from '../lib/i18n';
import { useUI } from '../stores/uiStore';
import {
  ExecutiveHeader,
  IdChip,
  HeroMetric,
  MetricCard,
  SearchBox,
  FilterChip,
  SectionCard,
  EmptyState,
  ErrorBanner,
  Button,
} from '../components/explorer/ExplorerKit';
import '../components/explorer/explorer-kit.css';
import './Forms.css';

interface EmployeeOption {
  id: number;
  code: string;
  fullName: string;
  jobTitle: string | null;
}

const CATEGORY_CHIPS: { key: 'all' | FormCategory; labelKey: string; icon?: string }[] = [
  { key: 'all', labelKey: 'page.forms.cat_all' },
  { key: 'hr', labelKey: 'page.forms.cat_hr', icon: 'badge' },
  { key: 'ops', labelKey: 'page.forms.cat_ops', icon: 'sell' },
];

export default function Forms() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectEmployeeId = searchParams.get('employee');
  const preselectFormId = searchParams.get('form');
  const { t } = useT();
  const { lang } = useUI();
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<'all' | FormCategory>('all');
  const [printModes, setPrintModes] = useState<Record<string, ProfileId>>(() =>
    Object.fromEntries(FORM_CARDS.map((c) => [c.key, DEFAULT_PROFILE_ID])),
  );

  useEffect(() => {
    api
      .get('/employees', { params: { pageSize: 500, status: 'ACTIVE' } })
      .then((res) => setEmployees(res.data.data?.data ?? res.data.data ?? []))
      .catch((e) => setLoadError(errorMessage(e)));
  }, []);

  // مقبض تحديد الموظف الوحيد للشاشة: يستدعيه اختيار المستخدم اليدوي من القائمة
  // **وكذلك** التحديد التلقائي القادم من درج الموظف أدناه — فكل ما يتفرّع من
  // selectedId (بطاقة المقاييس، تفعيل/تعطيل البطاقات، الطباعة) يتحدّث بنفس المسار
  // بلا أي منطق مُكرَّر.
  function selectEmployee(id: string) {
    setSelectedId(id);
  }

  // Quick Launch من درج الموظف: يمرَّر رقم تعريف الموظف فقط عبر ?employee=<id>،
  // فيُحل هنا من نفس مصدر البيانات الحالي — بلا تكرار وبلا ذاكرة مؤقتة. إن لم يوجد
  // الموظف ضمن القائمة (مثلاً غير نشط أو محذوف) تبقى الشاشة بلا اختيار، بلا أي خطأ.
  useEffect(() => {
    if (!preselectEmployeeId) return;
    if (employees.some((e) => String(e.id) === preselectEmployeeId)) {
      selectEmployee(preselectEmployeeId);
    }
  }, [preselectEmployeeId, employees]);

  function setMode(key: string, mode: ProfileId) {
    setPrintModes((prev) => ({ ...prev, [key]: mode }));
  }

  // مقبض الطباعة نفسه الذي يستدعيه زر «طباعة» في كل بطاقة — مُلفوف بـ useCallback
  // فقط لإتاحة إعادة استخدامه بأمان من تأثير الإطلاق التلقائي أدناه (Employee Smart
  // Forms Hub) بلا أي منطق مُكرَّر ولا استدعاء مباشر لأي حالة داخلية. `replace`
  // يُستخدَم **فقط** من التأثير التلقائي أدناه — النقر اليدوي على بطاقة يبقى
  // navigate() عاديًا (push) كما كان، فالرجوع من الطباعة اليدوية يعيد إلى مركز
  // النماذج بلا أي تغيير في السلوك القائم.
  const handlePrint = useCallback((card: FormCard, opts?: { replace?: boolean }) => {
    const go = (path: string) => navigate(path, opts?.replace ? { replace: true } : undefined);
    if (card.requiresEmployee === false) {
      go(`/forms/${card.route}`);
      return;
    }
    // موظف اختياري وبلا اختيار ⇒ نفتح الشاشة **بلا معرّف**، فتعرض هي مُحدِّد النمط
    // (موظف موجود / موظف جديد). أما مع اختيار موظف فالمسار القديم كما هو بحذافيره.
    if (card.employeeOptional && !selectedId) {
      go(`/forms/${card.route}`);
      return;
    }
    if (!selectedId) return;
    go(`/forms/${card.route}/${selectedId}?printMode=${printModes[card.key]}`);
  }, [navigate, selectedId, printModes]);

  // Smart Forms Hub: طلب نموذج محدَّد عبر ?form=<key> من قائمة الدرج. يُنفَّذ فقط
  // بعد أن يستقرّ selectedId على نفس معرّف الموظف المطلوب (أي بعد أن ينجح تأثير
  // التحديد أعلاه فعليًا) — فإن كان معرّف الموظف غير صالح يبقى selectedId فارغًا
  // إلى الأبد فلا يُنفَّذ شيء (سلوك اليوم تمامًا، بلا أخطاء). وإن كان النموذج
  // المطلوب غير موجود في السجل، يبقى الموظف مُحدَّدًا فقط بلا أي تنقّل إضافي.
  // ينادي **نفس** handlePrint الذي يستدعيه نقر المستخدم اليدوي على البطاقة — بلا
  // أي تكرار لمنطق الاختيار أو التنقّل.
  //
  // `replace: true` هنا تحديدًا (انحدار الرجوع — إصلاح): هذا الرابط
  // (?employee=<id>&form=<key>) هو رابط **عبور** لا صفحة يقصدها المستخدم أبدًا؛
  // بلا `replace` يبقى مدخلًا خفيًا إضافيًا في سجل المتصفح بين الدرج والمعاينة،
  // فيعيد زر «رجوع» (history.back الأصلي في FormLayout) المستخدمَ إلى رابط
  // العبور هذا بالذات — وهو يُطلق نفس الانتقال التلقائي من جديد فورًا، فيبدو أن
  // «رجوع» لا يفعل شيئًا. الاستبدال هنا يُسقط رابط العبور من السجل، فيصبح
  // الانتقال بأكمله (الدرج ← المعاينة) مدخلاً واحدًا فقط — ويعود «رجوع» مباشرة
  // إلى ما قبل الدرج، كما يفعل أي رابط عميق مباشر آخر لهذه الشاشة.
  useEffect(() => {
    if (!preselectFormId || !preselectEmployeeId) return;
    if (selectedId !== preselectEmployeeId) return;
    const card = FORM_CARDS.find((c) => c.key === preselectFormId);
    if (!card) return;
    handlePrint(card, { replace: true });
  }, [preselectFormId, preselectEmployeeId, selectedId, handlePrint]);

  const filteredCards = useMemo(() => {
    const q = search.trim().toLowerCase();
    return FORM_CARDS.filter((c) => {
      if (category !== 'all' && c.category !== category) return false;
      if (!q) return true;
      // العنوان يُحلّ عبر t(titleKey) بكلتا اللغتين (بحث ثنائي اللغة كما كان)،
      // لا نصًا حرفيًا مخزَّنًا في السجل — مصدر الحقيقة الوحيد هو i18n.ts.
      return translate(c.titleKey, 'ar').toLowerCase().includes(q) || translate(c.titleKey, 'en').toLowerCase().includes(q) || c.description.toLowerCase().includes(q);
    });
  }, [search, category]);

  const counts = useMemo(() => ({
    total: FORM_CARDS.length,
    hr: FORM_CARDS.filter((c) => c.category === 'hr').length,
    ops: FORM_CARDS.filter((c) => c.category === 'ops').length,
  }), []);

  return (
    <div className="xpl-scope xpl-page">
      <ExecutiveHeader
        icon="print"
        title={t('page.forms.title')}
        subtitle={t('page.forms.subtitle')}
        chips={
          <>
            <IdChip icon="description" tone="indigo">{t('page.forms.chip_total', { n: counts.total })}</IdChip>
            <IdChip icon="badge" tone="green">{t('page.forms.chip_hr', { n: counts.hr })}</IdChip>
            <IdChip icon="sell" tone="orange">{t('page.forms.chip_ops', { n: counts.ops })}</IdChip>
          </>
        }
      />

      <div className="rcx-metrics" style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 340px) 1fr', gap: 14, alignItems: 'stretch' }}>
        <HeroMetric icon="description" label={t('page.forms.hero_label')} value={counts.total} sub={<><span className="material-symbols-outlined">category</span>{t('page.forms.hero_sub')}</>} />
        <div className="xpl-kpi-grid">
          <MetricCard icon="badge" tone="green" label={t('page.forms.metric_hr')} value={counts.hr} />
          <MetricCard icon="sell" tone="orange" label={t('page.forms.metric_ops')} value={counts.ops} />
          <MetricCard icon="person" tone={selectedId ? 'indigo' : 'neutral'} label={t('page.forms.metric_selected_employee')} value={selectedId ? (employees.find((e) => String(e.id) === selectedId)?.fullName ?? '—') : t('page.forms.metric_none_selected')} />
        </div>
      </div>

      {loadError && <ErrorBanner>{loadError}</ErrorBanner>}

      {/* Employee selector — shared across all employee-based cards */}
      <SectionCard>
        <div className="fmx-employee-bar">
          <div className="fmx-employee-icon"><span className="material-symbols-outlined" aria-hidden="true">badge</span></div>
          <div className="fmx-employee-field">
            <label>{t('page.forms.select_employee_label')}</label>
            <select className="xpl-select" aria-label={t('page.forms.select_employee_label')} value={selectedId} onChange={(e) => selectEmployee(e.target.value)}>
              <option value="">{t('page.forms.select_employee_ph')}</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.fullName}{emp.jobTitle ? ` — ${emp.jobTitle}` : ''} ({emp.code})
                </option>
              ))}
            </select>
          </div>
          {!selectedId && (
            <span className="fmx-employee-hint"><span className="material-symbols-outlined">info</span>{t('page.forms.employee_required')}</span>
          )}
        </div>
      </SectionCard>

      {/* Search + category chips */}
      <div className="xpl-toolbar xpl-toolbar--sticky">
        <div className="xpl-toolbar-row">
          <SearchBox value={search} onChange={setSearch} placeholder={t('page.forms.search_ph')} ariaLabel={t('page.forms.search_aria')} />
        </div>
        <div className="xpl-toolbar-row">
          {CATEGORY_CHIPS.map((c) => (
            <FilterChip key={c.key} active={category === c.key} onClick={() => setCategory(c.key)} icon={c.icon}>{t(c.labelKey)}</FilterChip>
          ))}
          <span className="xpl-result-count" style={{ marginInlineStart: 'auto' }}>{t('page.forms.chip_total', { n: filteredCards.length })}</span>
        </div>
      </div>

      {/* Cards grid */}
      {filteredCards.length === 0 ? (
        <EmptyState icon="search_off" tone="neutral" title={t('page.forms.empty_title')} message={t('page.forms.empty_message')}
          action={<Button variant="secondary" icon="restart_alt" onClick={() => { setSearch(''); setCategory('all'); }}>{t('page.forms.reset_btn')}</Button>} />
      ) : (
        <div className="fmx-grid">
          {filteredCards.map((card) => {
            const needsEmployee = card.requiresEmployee !== false;
            // البطاقة ذات الموظف الاختياري لا تُعطَّل بغياب الاختيار — وإلا صار مسار
            // «موظف جديد» غير قابل للوصول أصلًا (وهذا هو ما كان يحدث لعقد العمل).
            const disabled = needsEmployee && !card.employeeOptional && !selectedId;
            return (
              <div key={card.key} className="fmx-card">
                <div className="fmx-card-head">
                  <div className="fmx-card-icon">{card.icon}</div>
                  <div className="fmx-card-titles">
                    <div className="fmx-card-title-ar">{translate(card.titleKey, 'ar')}</div>
                    <div className="fmx-card-title-en">{translate(card.titleKey, 'en')}</div>
                  </div>
                  <StatusChipInline category={card.category} t={t} />
                </div>

                <p className="fmx-card-desc">{lang === 'en' ? card.descriptionEn : card.description}</p>

                {card.key !== 'employment-contract' && needsEmployee && (
                  <div className="fmx-card-mode">
                    <label htmlFor={`mode-${card.key}`}>{t('page.forms.print_mode')}</label>
                    <select id={`mode-${card.key}`} className="xpl-select" title={t('page.forms.print_mode')} value={printModes[card.key]} onChange={(e) => setMode(card.key, e.target.value as ProfileId)}>
                      {SELECTABLE_PROFILE_IDS.map((id) => (
                        <option key={id} value={id}>{PRINT_PROFILES[id].labelAr}</option>
                      ))}
                    </select>
                  </div>
                )}

                <Button variant="primary" icon="print" block onClick={() => handlePrint(card)} disabled={disabled}>
                  {t('page.forms.print_btn')}
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <PrintLogPanel />
    </div>
  );
}

function StatusChipInline({ category, t }: { category: FormCategory; t: (key: string, vars?: Record<string, string | number>) => string }) {
  return (
    <span className={`xpl-chip xpl-chip--${category === 'hr' ? 'green' : 'orange'}`} style={{ flexShrink: 0 }}>
      <span className="material-symbols-outlined" aria-hidden="true">{category === 'hr' ? 'badge' : 'sell'}</span>
      {category === 'hr' ? t('page.forms.chip_hr_short') : t('page.forms.chip_ops_short')}
    </span>
  );
}
