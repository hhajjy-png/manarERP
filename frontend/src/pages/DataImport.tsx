import { useState, lazy, Suspense, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../stores/authStore';
import { useT } from '../lib/i18n';
import { ExecutiveHeader, SectionCard, EmptyState, Button } from '../components/explorer/ExplorerKit';
import '../components/explorer/explorer-kit.css';
import './DataImport.css';
import GenericImporterView from './GenericImporterView';

// البنوك — المعالجات الكاملة مُضمَّنة هنا مباشرة (بلا صفحات/مسارات مستقلة)؛
// كسل التحميل يبقيها خارج حزمة صفحة الاستيراد العامة حتى يفتح المستخدم وضع البنوك.
const PayrollBankImport = lazy(() => import('./PayrollBankImport'));
const BankStatementImport = lazy(() => import('./BankStatementImport'));

// البنوك — معالجات الاستيراد البنكي الكاملة مُضمَّنة هنا مباشرة (لا صفحات مستقلة).
// صلاحية كل بطاقة تطابق فحص الصلاحية الداخلي لنفس المعالج (PayrollBankImport /
// BankStatementImport)، فلا تُعرض بطاقة يظهر خلفها معالج بلا صلاحية عرضه.
type BankModuleKey = 'payroll' | 'statement';
const BANK_MODULES: { key: BankModuleKey; permission: string; icon: string; label: string }[] = [
  { key: 'payroll',   permission: 'payrollBankImport.read',  icon: 'payments',              label: 'استيراد الرواتب البنكية' },
  { key: 'statement', permission: 'bankStatementImport.create', icon: 'account_balance_wallet', label: 'إضافة كشف بنكي' },
];

function parseBankModule(value: string | null): BankModuleKey | null {
  return value === 'payroll' || value === 'statement' ? value : null;
}

// ── Component ─────────────────────────────────────────────────────────────────
// نقطة الدخول: بوابة الصلاحية + مفتاح الوضع (استيراد بيانات عام / بنوك) فقط.
// كل وضع مُستقل تمامًا بحالته الخاصة — انظر GenericImporterView.tsx للاستيراد
// العام، ومعالجَي PayrollBankImport/BankStatementImport المُضمَّنين للبنوك.

export default function DataImport() {
  const { hasPermission } = useAuth();
  const { t } = useT();

  // إعادة توجيه المسارات القديمة (/payroll/bank-import، /bank-statement-import) تصل هنا
  // عبر ?bankModule=payroll|statement — تفتح المعالج البنكي المطلوب مباشرة عند التحميل،
  // وأيضًا لو تغيّر المعامل لاحقًا أثناء بقاء الصفحة مثبَّتة (تزامن باتجاه واحد: يفرض
  // وضع البنوك متى ظهر معامل صالح؛ اختيار المستخدم اليدوي للتبويبين لا يُغيّر رابط الصفحة).
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<'data' | 'banking'>(() => (searchParams.get('bankModule') ? 'banking' : 'data'));
  const [bankModule, setBankModule] = useState<BankModuleKey | null>(() => parseBankModule(searchParams.get('bankModule')));

  useEffect(() => {
    const requested = parseBankModule(searchParams.get('bankModule'));
    if (requested) {
      setMode('banking');
      setBankModule(requested);
    }
  }, [searchParams]);

  // كل وضع يفحص صلاحيته بنفسه (لا بوابة صلاحية واحدة على مستوى الصفحة) —
  // فمستخدم يملك صلاحيات البنوك فقط دون import.read يبقى قادرًا على الوصول
  // لمعالجات البنوك، تمامًا كما كان الحال عندما كانتا صفحتين مستقلتين.
  const hasImportPermission = hasPermission('import.read');
  const visibleBankModules = BANK_MODULES.filter((m) => hasPermission(m.permission));

  if (!hasImportPermission && visibleBankModules.length === 0) {
    return (
      <div className="xpl-scope xpl-page" dir="rtl">
        <div className="xpl-center-state">
          <span className="material-symbols-outlined">lock</span>
          {t('import.no_permission')}
        </div>
      </div>
    );
  }

  return (
    <div className="xpl-scope xpl-page" dir="rtl">

      {/* ── Import mode switch — data importer vs. banking ── */}
      <div className="dicx-entities dicx-mode-switch" role="tablist" aria-label="وضع الاستيراد">
        {hasImportPermission && (
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'data'}
            className={`dicx-entity-btn${mode === 'data' ? ' active' : ''}`}
            onClick={() => setMode('data')}
          >
            <span className="dicx-entity-icon">
              <span className="material-symbols-outlined" aria-hidden="true">upload_file</span>
            </span>
            استيراد البيانات
          </button>
        )}
        {visibleBankModules.length > 0 && (
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'banking'}
            className={`dicx-entity-btn${mode === 'banking' ? ' active' : ''}`}
            onClick={() => setMode('banking')}
          >
            <span className="dicx-entity-icon">
              <span className="material-symbols-outlined" aria-hidden="true">account_balance</span>
            </span>
            البنوك
          </button>
        )}
      </div>

      {mode === 'banking' && (
        <>
          <ExecutiveHeader
            icon="account_balance"
            title="البنوك"
            subtitle="استيراد الرواتب البنكية أو إضافة كشف حساب بنكي"
          />
          <div className="dicx-layout">
          <div className="dicx-main">
            {bankModule === null ? (
              <SectionCard title="اختر المعالج البنكي" icon="account_balance">
                <div className="dicx-entities">
                  {visibleBankModules.map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      className="dicx-entity-btn"
                      onClick={() => setBankModule(m.key)}
                    >
                      <span className="dicx-entity-icon">
                        <span className="material-symbols-outlined" aria-hidden="true">{m.icon}</span>
                      </span>
                      {m.label}
                    </button>
                  ))}
                </div>
              </SectionCard>
            ) : (
              <>
                <Button variant="ghost" icon="arrow_forward" onClick={() => setBankModule(null)}>
                  رجوع لاختيار المعالج البنكي
                </Button>
                <Suspense fallback={<EmptyState icon="hourglass_empty" tone="neutral" title="جارٍ التحميل" message="" />}>
                  {bankModule === 'payroll' && <PayrollBankImport />}
                  {bankModule === 'statement' && <BankStatementImport />}
                </Suspense>
              </>
            )}
          </div>
          </div>
        </>
      )}

      {mode === 'data' && <GenericImporterView />}

    </div>
  );
}
