import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { PrintMode, PRINT_MODE_LABELS } from '../forms/shared/printMode';
import PrintLogPanel from '../components/PrintLogPanel';
import { useT } from '../lib/i18n';
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

type FormCategory = 'hr' | 'ops';

interface FormCard {
  key: string;
  route: string;
  titleAr: string;
  titleEn: string;
  description: string;
  icon: string;
  category: FormCategory;
  requiresEmployee?: boolean;
}

const FORM_CARDS: FormCard[] = [
  { key: 'salary-certificate', route: 'salary-certificate', titleAr: 'شهادة راتب', titleEn: 'Salary Certificate', description: 'شهادة رسمية تُثبت راتب الموظف الشهري للجهات الطالبة.', icon: '📋', category: 'hr' },
  { key: 'to-whom-it-may-concern', route: 'to-whom-it-may-concern', titleAr: 'إلى من يهمه الأمر', titleEn: 'To Whom It May Concern', description: 'شهادة عمل عامة لتقديمها للجهات الخارجية.', icon: '📄', category: 'hr' },
  { key: 'leave-request', route: 'leave-request', titleAr: 'طلب إجازة', titleEn: 'Leave Request', description: 'نموذج طلب إجازة سنوية أو مرضية أو طارئة.', icon: '🗓️', category: 'hr' },
  { key: 'return-to-work', route: 'return-to-work', titleAr: 'إشعار العودة إلى العمل', titleEn: 'Return To Work Notice', description: 'إشعار رسمي بعودة الموظف من الإجازة.', icon: '↩️', category: 'hr' },
  { key: 'salary-advance', route: 'salary-advance', titleAr: 'طلب سلفة راتب', titleEn: 'Salary Advance Request', description: 'نموذج طلب سلفة مالية يُخصم من الراتب الشهري.', icon: '💰', category: 'hr' },
  { key: 'resignation', route: 'resignation', titleAr: 'طلب استقالة', titleEn: 'Resignation Request', description: 'نموذج استقالة رسمي مع تحديد آخر يوم عمل.', icon: '✉️', category: 'hr' },
  { key: 'employee-warning', route: 'employee-warning', titleAr: 'إنذار موظف', titleEn: 'Employee Warning Notice', description: 'نموذج إنذار رسمي للموظف يُحدد درجة المخالفة وسببها.', icon: '⚠️', category: 'hr' },
  { key: 'performance-evaluation', route: 'performance-evaluation', titleAr: 'تقييم أداء الموظف', titleEn: 'Employee Performance Evaluation', description: 'نموذج تقييم الأداء السنوي بمعايير موضوعية.', icon: '⭐', category: 'hr' },
  { key: 'employment-contract', route: 'employment-contract', titleAr: 'عقد العمل', titleEn: 'Employment Contract', description: 'نموذج عقد العمل الرسمي الصادر عن الهيئة العامة للقوى العاملة، ثنائي اللغة (عربي / إنجليزي).', icon: '📝', category: 'hr' },
  { key: 'quotation', route: 'quotation', titleAr: 'عرض سعر', titleEn: 'Quotation', description: 'نموذج عرض سعر رسمي للعملاء يتضمن جدول الأسعار والشروط.', icon: '📊', category: 'ops', requiresEmployee: false },
  { key: 'purchase-request', route: 'purchase-request', titleAr: 'طلب شراء', titleEn: 'Purchase Request', description: 'نموذج طلب شراء داخلي مع جدول المواد والكميات وبيانات الاعتماد.', icon: '🛒', category: 'ops', requiresEmployee: false },
  { key: 'receipt-voucher', route: 'receipt-voucher', titleAr: 'سند قبض', titleEn: 'Receipt Voucher', description: 'سند قبض رسمي لتوثيق المبالغ المستلمة نقداً أو بشيك أو تحويل بنكي.', icon: '🧾', category: 'ops', requiresEmployee: false },
];

const CATEGORY_CHIPS: { key: 'all' | FormCategory; label: string; icon?: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'hr', label: 'الموارد البشرية', icon: 'badge' },
  { key: 'ops', label: 'العمليات والمبيعات', icon: 'sell' },
];

export default function Forms() {
  const navigate = useNavigate();
  const { t } = useT();
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<'all' | FormCategory>('all');
  const [printModes, setPrintModes] = useState<Record<string, PrintMode>>(() =>
    Object.fromEntries(FORM_CARDS.map((c) => [c.key, 'full-template' as PrintMode])),
  );

  useEffect(() => {
    api
      .get('/employees', { params: { pageSize: 500, status: 'ACTIVE' } })
      .then((res) => setEmployees(res.data.data?.data ?? res.data.data ?? []))
      .catch((e) => setLoadError(errorMessage(e)));
  }, []);

  function setMode(key: string, mode: PrintMode) {
    setPrintModes((prev) => ({ ...prev, [key]: mode }));
  }

  function handlePrint(card: FormCard) {
    if (card.requiresEmployee !== false && !selectedId) return;
    if (card.requiresEmployee === false) {
      navigate(`/forms/${card.route}`);
    } else {
      navigate(`/forms/${card.route}/${selectedId}?printMode=${printModes[card.key]}`);
    }
  }

  const filteredCards = useMemo(() => {
    const q = search.trim().toLowerCase();
    return FORM_CARDS.filter((c) => {
      if (category !== 'all' && c.category !== category) return false;
      if (!q) return true;
      return c.titleAr.toLowerCase().includes(q) || c.titleEn.toLowerCase().includes(q) || c.description.toLowerCase().includes(q);
    });
  }, [search, category]);

  const counts = useMemo(() => ({
    total: FORM_CARDS.length,
    hr: FORM_CARDS.filter((c) => c.category === 'hr').length,
    ops: FORM_CARDS.filter((c) => c.category === 'ops').length,
  }), []);

  return (
    <div className="xpl-scope xpl-page" dir="rtl">
      <ExecutiveHeader
        icon="print"
        title={t('page.forms.title')}
        subtitle={t('page.forms.subtitle')}
        chips={
          <>
            <IdChip icon="description" tone="indigo">{counts.total} نموذج</IdChip>
            <IdChip icon="badge" tone="green">{counts.hr} موارد بشرية</IdChip>
            <IdChip icon="sell" tone="orange">{counts.ops} عمليات</IdChip>
          </>
        }
      />

      <div className="rcx-metrics" style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 340px) 1fr', gap: 14, alignItems: 'stretch' }}>
        <HeroMetric icon="description" label="نماذج رسمية جاهزة للطباعة" value={counts.total} sub={<><span className="material-symbols-outlined">category</span>فئتان رئيسيتان</>} />
        <div className="xpl-kpi-grid">
          <MetricCard icon="badge" tone="green" label="نماذج الموارد البشرية" value={counts.hr} />
          <MetricCard icon="sell" tone="orange" label="نماذج العمليات والمبيعات" value={counts.ops} />
          <MetricCard icon="person" tone={selectedId ? 'indigo' : 'neutral'} label="الموظف المحدد" value={selectedId ? (employees.find((e) => String(e.id) === selectedId)?.fullName ?? '—') : 'لم يُحدد'} />
        </div>
      </div>

      {loadError && <ErrorBanner>{loadError}</ErrorBanner>}

      {/* Employee selector — shared across all employee-based cards */}
      <SectionCard>
        <div className="fmx-employee-bar">
          <div className="fmx-employee-icon"><span className="material-symbols-outlined" aria-hidden="true">badge</span></div>
          <div className="fmx-employee-field">
            <label>{t('page.forms.select_employee_label')}</label>
            <select className="xpl-select" aria-label={t('page.forms.select_employee_label')} value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
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
          <SearchBox value={search} onChange={setSearch} placeholder="ابحث عن نموذج…" ariaLabel="بحث في النماذج" />
        </div>
        <div className="xpl-toolbar-row">
          {CATEGORY_CHIPS.map((c) => (
            <FilterChip key={c.key} active={category === c.key} onClick={() => setCategory(c.key)} icon={c.icon}>{c.label}</FilterChip>
          ))}
          <span className="xpl-result-count" style={{ marginInlineStart: 'auto' }}>{filteredCards.length} نموذج</span>
        </div>
      </div>

      {/* Cards grid */}
      {filteredCards.length === 0 ? (
        <EmptyState icon="search_off" tone="neutral" title="لا يوجد نموذج مطابق" message="جرّب كلمة بحث مختلفة أو فئة أخرى."
          action={<Button variant="secondary" icon="restart_alt" onClick={() => { setSearch(''); setCategory('all'); }}>إعادة التعيين</Button>} />
      ) : (
        <div className="fmx-grid">
          {filteredCards.map((card) => {
            const needsEmployee = card.requiresEmployee !== false;
            const disabled = needsEmployee && !selectedId;
            return (
              <div key={card.key} className="fmx-card">
                <div className="fmx-card-head">
                  <div className="fmx-card-icon">{card.icon}</div>
                  <div className="fmx-card-titles">
                    <div className="fmx-card-title-ar">{card.titleAr}</div>
                    <div className="fmx-card-title-en">{card.titleEn}</div>
                  </div>
                  <StatusChipInline category={card.category} />
                </div>

                <p className="fmx-card-desc">{card.description}</p>

                {card.key !== 'employment-contract' && needsEmployee && (
                  <div className="fmx-card-mode">
                    <label htmlFor={`mode-${card.key}`}>{t('page.forms.print_mode')}</label>
                    <select id={`mode-${card.key}`} className="xpl-select" title={t('page.forms.print_mode')} value={printModes[card.key]} onChange={(e) => setMode(card.key, e.target.value as PrintMode)}>
                      {(Object.entries(PRINT_MODE_LABELS) as [PrintMode, string][]).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
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

function StatusChipInline({ category }: { category: FormCategory }) {
  return (
    <span className={`xpl-chip xpl-chip--${category === 'hr' ? 'green' : 'orange'}`} style={{ flexShrink: 0 }}>
      <span className="material-symbols-outlined" aria-hidden="true">{category === 'hr' ? 'badge' : 'sell'}</span>
      {category === 'hr' ? 'موارد بشرية' : 'عمليات'}
    </span>
  );
}
