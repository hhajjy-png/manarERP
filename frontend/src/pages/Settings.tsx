import { useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../api/client';
import { useUI } from '../stores/uiStore';
import { useAuth } from '../stores/authStore';
import { useSettings } from '../stores/settingsStore';
import type { CurrencyLanguage } from '../lib/format';
import { useT, type Lang } from '../lib/i18n';
import { useToast } from '../stores/toastStore';
import { BASE_NATIONALITY_EN, BASE_JOB_TITLE_EN, applyTranslationOverrides } from '../forms/shared/contractTranslations';
import {
  BUSINESS_TERM_CATEGORIES,
  BUSINESS_TERM_SETTING_KEYS,
  BASE_BUSINESS_TERMS,
  dictionaryEditorRows,
  parseBusinessTermDictionaries,
  serializeBusinessTermRows,
  type BusinessTermCategory,
} from '../lib/businessTerms';
import {
  BUSINESS_TERM_HI_SETTING_KEYS,
  BASE_BUSINESS_TERMS_HI,
  parseBusinessTermHiDictionaries,
} from '../lib/businessTermsHi';
import BrandingLayoutDesigner from '../print-templates/components/BrandingLayoutDesigner';
import type { PrintBrandingLayoutSettings } from '../print-templates/engine/types';
import { parseBrandingLayout, serializeBrandingLayout, DEFAULT_BRANDING_LAYOUT } from '../print-templates/utils/brandingLayout';
import {
  BRANDING_ASSET_KEYS,
  appendBrandingAsset,
  brandingAssetSettingsRows,
  findDefaultAsset,
  newBrandingAssetId,
  parseBrandingAssets,
  removeBrandingAsset,
  setBrandingAssetImage,
  setDefaultBrandingAsset,
  toggleBrandingAssetVisibility,
  updateBrandingAssetField,
  type BrandingAsset,
  type BrandingAssetKind,
} from '../print-templates/branding/brandingAssets';
import TemplateStudioEditor from '../print-templates/studio/TemplateStudioEditor';
import {
  ExecutiveHeader,
  MetricCard,
  SectionCard,
  StatusChip,
  SearchBox,
  FilterChip,
  Button,
} from '../components/explorer/ExplorerKit';
import '../components/explorer/explorer-kit.css';
import './Settings.css';
import PeriodLockSettings from '../components/period/PeriodLockSettings';
import GenerateHolidaysDialog from '../components/employee/GenerateHolidaysDialog';
import { NAV } from '../config/modules';
import { isProtectedNavKey, permittedNav } from '../config/navVisibility';

/**
 * التواقيع والأختام قائمتان من نفس النوع (`BrandingAsset`) ونفس منطق الإدارة، فكل
 * دوال هذا القسم تعمل على أي منهما عبر `kind`. التخزين والترحيل والمرايا القديمة في
 * `print-templates/branding/brandingAssets` — لا تُكرَّر هنا.
 */
const ASSET_KINDS: BrandingAssetKind[] = ['signature', 'stamp'];

/** حدود تصغير الصورة قبل الحفظ — لكل نوع أبعاده كما كان قبل التوحيد. */
const ASSET_IMAGE_BOUNDS: Record<BrandingAssetKind, { maxW: number; maxH: number }> = {
  signature: { maxW: 500, maxH: 250 },
  stamp: { maxW: 400, maxH: 400 },
};

interface AssetSectionText {
  sectionId: string;
  navKey: string;
  icon: string;
  addKey: string;
  emptyKey: string;
  indexKey: string;
  noImageKey: string;
  showKey: string;
  nameLabelKey: string;
  namePlaceholderKey: string;
  titleLabelKey: string;
  titlePlaceholderKey: string;
  stageClass: string;
  uploadFailedKey: string;
}

const ASSET_TEXT: Record<BrandingAssetKind, AssetSectionText> = {
  signature: {
    sectionId: 'sec-signatures',
    navKey: 'page.settings.nav.signatures',
    icon: 'draw',
    addKey: 'page.settings.signatures.add_btn',
    emptyKey: 'page.settings.signatures.empty_hint',
    indexKey: 'page.settings.signatures.index_label',
    noImageKey: 'page.settings.signatures.no_image',
    showKey: 'page.settings.show_in_documents',
    nameLabelKey: 'page.settings.signatures.name_label',
    namePlaceholderKey: 'page.settings.signatures.name_placeholder',
    titleLabelKey: 'page.settings.signatures.title_label',
    titlePlaceholderKey: 'page.settings.signatures.title_placeholder',
    stageClass: 'settings-media-stage',
    uploadFailedKey: 'msg.settings.signature_upload_failed',
  },
  stamp: {
    sectionId: 'sec-stamp',
    navKey: 'page.settings.nav.stamp',
    icon: 'approval',
    addKey: 'page.settings.stamps.add_btn',
    emptyKey: 'page.settings.stamps.empty_hint',
    indexKey: 'page.settings.stamps.index_label',
    noImageKey: 'page.settings.stamp.no_image',
    showKey: 'page.settings.show_stamp_in_documents',
    nameLabelKey: 'page.settings.stamps.name_label',
    namePlaceholderKey: 'page.settings.stamps.name_placeholder',
    titleLabelKey: 'page.settings.stamps.title_label',
    titlePlaceholderKey: 'page.settings.stamps.title_placeholder',
    stageClass: 'settings-media-stage settings-stamp-stage',
    uploadFailedKey: 'msg.settings.stamp_upload_failed',
  },
};

/**
 * How long a name/job-title edit waits before it is written.
 *
 * Structural changes (add, upload, delete, default, show/hide) are written immediately —
 * they are single deliberate clicks. Only free-text typing is debounced, so a name is one
 * PUT after the user stops typing instead of one per keystroke.
 */
const ASSET_TEXT_SAVE_DEBOUNCE_MS = 800;

type AssetSaveState = 'idle' | 'saving' | 'saved' | 'failed';

const ASSET_SAVE_CHIP: Record<
  Exclude<AssetSaveState, 'idle'>,
  { tone: 'blue' | 'green' | 'red'; icon: string; labelKey: string }
> = {
  saving: { tone: 'blue', icon: 'sync', labelKey: 'page.settings.assets.saving' },
  saved: { tone: 'green', icon: 'cloud_done', labelKey: 'page.settings.assets.saved' },
  failed: { tone: 'red', icon: 'error', labelKey: 'page.settings.assets.save_failed' },
};

function readAssets(kind: BrandingAssetKind, values: Record<string, string>): BrandingAsset[] {
  const keys = BRANDING_ASSET_KEYS[kind];
  return parseBrandingAssets({
    raw: values[keys.list],
    legacyImage: values[keys.legacyImage],
    legacyShow: values[keys.legacyShow],
    idPrefix: kind === 'signature' ? 'sig' : 'stamp',
  });
}

const DEFAULT_VALUES: Record<string, string> = {
  'backup.auto.enabled': 'true',
  'backup.auto.time': '02:00',
  'backup.auto.retention': '30',
  'finance.currencyDisplayLanguage': 'english',
};

type FieldType = 'text' | 'checkbox' | 'time' | 'number' | 'select';

const FIELDS: { key: string; label: string; group: string; type?: FieldType; options?: { value: string; label: string }[] }[] = [
  { key: 'company.name', label: 'field.company_name', group: 'company' },
  { key: 'company.country', label: 'field.settings.country', group: 'company' },
  { key: 'company.phone', label: 'field.phone', group: 'company' },
  { key: 'company.address', label: 'field.address', group: 'company' },
  { key: 'finance.currencyLabel', label: 'field.settings.currency_label', group: 'finance' },
  { key: 'finance.decimals', label: 'field.settings.decimals', group: 'finance' },
  { key: 'finance.currencyDisplayLanguage', label: 'field.settings.currency_display_language', group: 'finance', type: 'select', options: [
    { value: 'english', label: 'opt.currency_lang.english' },
    { value: 'arabic', label: 'opt.currency_lang.arabic' },
  ] },
  { key: 'backup.cron', label: 'field.settings.backup_cron', group: 'backup' },
  { key: 'backup.auto.enabled', label: 'field.settings.backup_auto_enabled', group: 'backup', type: 'checkbox' },
  { key: 'backup.auto.time', label: 'field.settings.backup_auto_time', group: 'backup', type: 'time' },
  { key: 'backup.auto.retention', label: 'field.settings.backup_auto_retention', group: 'backup', type: 'number' },
];

const IDENTITY_FIELDS = FIELDS.filter((f) => f.group === 'company' || f.group === 'finance');
const BACKUP_FIELDS = FIELDS.filter((f) => f.group === 'backup');

const NAV_SECTIONS: { id: string; icon: string; labelKey: string }[] = [
  { id: 'sec-identity', icon: 'corporate_fare', labelKey: 'page.settings.nav.identity' },
  { id: 'sec-sidebar', icon: 'view_sidebar', labelKey: 'page.settings.nav.sidebar' },
  { id: 'sec-holidays', icon: 'event_busy', labelKey: 'page.settings.nav.holidays' },
  { id: 'sec-backup', icon: 'backup', labelKey: 'page.settings.nav.backup' },
  { id: 'sec-signatures', icon: 'draw', labelKey: 'page.settings.nav.signatures' },
  { id: 'sec-stamp', icon: 'approval', labelKey: 'page.settings.nav.stamp' },
  { id: 'sec-print', icon: 'print', labelKey: 'page.settings.nav.printing' },
  { id: 'sec-dict', icon: 'translate', labelKey: 'page.settings.nav.dictionary' },
];

/** يطابق Holiday في backend/prisma/schema.prisma (قراءة/كتابة عبر /api/holidays فقط). */
interface Holiday {
  id: number;
  date: string;
  name: string;
  notes: string | null;
  /** مُشتقّ وقت القراءة فقط (Kuwait Holiday Intelligence Pack v1) — ليس عمودًا مخزَّنًا. */
  origin?: 'FIXED_GREGORIAN' | 'HIJRI';
  status?: 'OFFICIAL' | 'EXPECTED_ALOJAIRI' | 'MANUALLY_ADJUSTED';
}

const HOLIDAY_STATUS_META: Record<string, { labelKey: string; tone: 'green' | 'orange' | 'neutral' }> = {
  OFFICIAL: { labelKey: 'page.settings.holiday_status.official', tone: 'green' },
  EXPECTED_ALOJAIRI: { labelKey: 'page.settings.holiday_status.expected_alojairi', tone: 'orange' },
  MANUALLY_ADJUSTED: { labelKey: 'page.settings.holiday_status.manually_adjusted', tone: 'neutral' },
};

/** سنوات مختارة للتوليد — السنة الحالية والقادمتان (الأكثر فائدة عمليًا). */
function generatableYears(): number[] {
  const y = new Date().getFullYear();
  return [y, y + 1, y + 2];
}

/**
 * تبويبات قسم القواميس. مجموعتان **معزولتان تمامًا** لكل منهما مفاتيحها وبذورها:
 *   • `forms:*`    → النماذج الإدارية (`dict.forms.*`).
 *   • `contract:*` → عقد العمل (`dict.nationalities` / `dict.jobTitles`) كما كان.
 * تحرير إحداهما لا يمسّ الأخرى — نفس المحرّر المشترك، مصدران منفصلان.
 */
type DictTabKey =
  | `forms:${BusinessTermCategory}`
  | `forms-hi:${HiDictCategory}`
  | 'contract:nationality'
  | 'contract:jobTitle';

/**
 * الفئات التي يملك القاموس الهندي تبويبًا لها في هذه المرحلة التجريبية.
 * «طلب الإجازة» يعرض المسمى الوظيفي والقسم وحدهما، فهذان التبويبان هما **الحد
 * الأدنى اللازم للـPilot**. بقية الفئات (الجنسية، غرض الشهادة) تُضاف عند تعميم
 * القالب الثنائي على النماذج التي تعرضها.
 */
const HI_DICT_CATEGORIES = ['jobTitle', 'department'] as const;
type HiDictCategory = typeof HI_DICT_CATEGORIES[number];

interface DictTabSpec {
  key: DictTabKey;
  settingKey: string;
  baseMap: Record<string, string>;
  labelKey: string;
  scope: 'forms' | 'forms-hi' | 'contract';
  /** ترويسة عمود اللغة الهدف — غير معرَّفة ⇒ `English` كما في كل تبويب قائم. */
  targetLabel?: string;
}

const DICT_TABS: DictTabSpec[] = [
  ...BUSINESS_TERM_CATEGORIES.map((c): DictTabSpec => ({
    key: `forms:${c}`,
    settingKey: BUSINESS_TERM_SETTING_KEYS[c],
    baseMap: BASE_BUSINESS_TERMS[c],
    labelKey: {
      nationality: 'page.settings.dict.tab_nationalities',
      jobTitle: 'page.settings.dict.tab_job_titles',
      department: 'page.settings.dict.tab_departments',
      certificatePurpose: 'page.settings.dict.tab_purposes',
    }[c],
    scope: 'forms',
  })),
  ...HI_DICT_CATEGORIES.map((c): DictTabSpec => ({
    key: `forms-hi:${c}`,
    settingKey: BUSINESS_TERM_HI_SETTING_KEYS[c],
    baseMap: BASE_BUSINESS_TERMS_HI[c],
    labelKey: {
      jobTitle: 'page.settings.dict.tab_job_titles_hi',
      department: 'page.settings.dict.tab_departments_hi',
    }[c],
    scope: 'forms-hi',
    targetLabel: 'हिन्दी',
  })),
  {
    key: 'contract:nationality',
    settingKey: 'dict.nationalities',
    baseMap: BASE_NATIONALITY_EN,
    labelKey: 'page.settings.dict.tab_contract_nationalities',
    scope: 'contract',
  },
  {
    key: 'contract:jobTitle',
    settingKey: 'dict.jobTitles',
    baseMap: BASE_JOB_TITLE_EN,
    labelKey: 'page.settings.dict.tab_contract_job_titles',
    scope: 'contract',
  },
];

/** عنوان كل مجموعة قواميس في الواجهة. */
const DICT_SCOPE_LABEL_KEY: Record<DictTabSpec['scope'], string> = {
  'forms': 'page.settings.dict.scope_forms',
  'forms-hi': 'page.settings.dict.scope_forms_hi',
  'contract': 'page.settings.dict.scope_contract',
};

const DICT_TAB_BY_KEY: Record<DictTabKey, DictTabSpec> = Object.fromEntries(
  DICT_TABS.map((tab) => [tab.key, tab]),
) as Record<DictTabKey, DictTabSpec>;

type DictState = Record<DictTabKey, { ar: string; en: string }[]>;

function emptyDictState(): DictState {
  return {
    'forms:nationality': [], 'forms:jobTitle': [], 'forms:department': [], 'forms:certificatePurpose': [],
    'forms-hi:jobTitle': [], 'forms-hi:department': [],
    'contract:nationality': [], 'contract:jobTitle': [],
  };
}


function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function DictTable({
  rows,
  setRows,
  query,
  modifiedOnly,
  baseMap,
  targetLabel = 'English',
  t,
}: {
  rows: { ar: string; en: string }[];
  setRows: React.Dispatch<React.SetStateAction<{ ar: string; en: string }[]>>;
  query: string;
  modifiedOnly: boolean;
  baseMap: Record<string, string>;
  /**
   * ترويسة عمود اللغة الهدف. الافتراضي `'English'` — أي أن كل تبويب قائم يعرض
   * ما كان يعرضه حرفيًا؛ تبويبات القاموس الهندي وحدها تمرّر قيمة أخرى. الحقل
   * `row.en` يبقى اسمه كما هو: هو «القيمة المترجَمة» أيًّا كانت لغتها، وتغيير
   * اسمه كان سيمسّ كل مستهلك لـ`dictionaryEditorRows`/`serializeBusinessTermRows`.
   */
  targetLabel?: string;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const tbodyRef = useRef<HTMLTableSectionElement>(null);
  const filtering = modifiedOnly || query.trim().length > 0;

  const q = query.trim().toLowerCase();
  // Keep the ORIGINAL index so edit/delete handlers stay correct while filtering.
  const visible = rows
    .map((row, i) => ({ row, i }))
    .filter(({ row }) => {
      if (modifiedOnly) {
        if (!row.ar.trim() && !row.en.trim()) return false;
        const base = baseMap[row.ar];
        const isModified = base === undefined || base !== row.en;
        if (!isModified) return false;
      }
      if (!q) return true;
      return row.ar.toLowerCase().includes(q) || row.en.toLowerCase().includes(q);
    });

  function addRow() {
    setRows((prev) => [...prev, { ar: '', en: '' }]);
    requestAnimationFrame(() => {
      const tbody = tbodyRef.current;
      if (!tbody) return;
      const lastRow = tbody.lastElementChild;
      if (lastRow) {
        lastRow.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        const input = lastRow.querySelector<HTMLInputElement>('input');
        input?.focus();
      }
    });
  }

  return (
    <>
      <div className="settings-dict-grid">
        <table className="settings-dict-table">
          <thead>
            <tr>
              <th className="settings-dict-ar" style={{ width: '45%' }}>{t('page.settings.dict.col_ar')}</th>
              <th className="settings-dict-en" style={{ width: '45%' }}>{targetLabel}</th>
              <th className="settings-dict-actions" aria-label={t('action.delete')}></th>
            </tr>
          </thead>
          <tbody ref={tbodyRef}>
            {visible.map(({ row, i }) => (
              <tr key={i}>
                <td className="settings-dict-ar">
                  <input
                    value={row.ar}
                    onChange={(e) => setRows((prev) => prev.map((r, j) => j === i ? { ...r, ar: e.target.value } : r))}
                    title={t('page.settings.dict.title_ar')}
                  />
                </td>
                <td className="settings-dict-en">
                  <input
                    value={row.en}
                    onChange={(e) => setRows((prev) => prev.map((r, j) => j === i ? { ...r, en: e.target.value } : r))}
                    title="Translation in English"
                  />
                </td>
                <td className="settings-dict-actions">
                  <button
                    type="button"
                    className="settings-dict-del"
                    onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
                    title={t('action.delete')}
                    aria-label={t('page.settings.dict.delete_row_aria')}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">delete</span>
                  </button>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={3} className="settings-dict-empty">
                  {t('msg.no_results')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {!filtering && (
        <button
          type="button"
          className="settings-dict-add"
          onClick={addRow}
        >
          <span className="material-symbols-outlined" aria-hidden="true">add</span>
          {t('page.settings.dict.add_row')}
        </button>
      )}
    </>
  );
}

export default function Settings() {
  const { lang, setLang, hiddenNavKeys, toggleNavItemVisibility, showAllNavItems } = useUI();
  const { t } = useT();
  const toast = useToast();
  const { hasPermission } = useAuth();
  const canManageHolidays = hasPermission('employees.update');
  const [values, setValues] = useState<Record<string, string>>({});
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [holidaysLoading, setHolidaysLoading] = useState(true);
  const [holidaySaving, setHolidaySaving] = useState(false);
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayName, setNewHolidayName] = useState('');
  const [generateYear, setGenerateYear] = useState(() => new Date().getFullYear());
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [assets, setAssets] = useState<Record<BrandingAssetKind, BrandingAsset[]>>({
    signature: [],
    stamp: [],
  });
  const assetFileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  /**
   * The newest asset lists, readable synchronously.
   *
   * Every mutation persists the WHOLE snapshot, and some of them run after an `await`
   * (image upload). Reading `assets` from a closure would send a stale snapshot and
   * silently drop whatever changed in between; this ref is always current.
   */
  const assetsRef = useRef<Record<BrandingAssetKind, BrandingAsset[]>>({ signature: [], stamp: [] });
  /** Serializes the PUTs so two quick edits can never be applied out of order. */
  const assetSaveChain = useRef<Promise<void>>(Promise.resolve());
  const assetSavesInFlight = useRef(0);
  const assetSaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [assetSaveState, setAssetSaveState] = useState<AssetSaveState>('idle');
  /** Upload errors, keyed `kind:id` — shown inside the card that failed, not page-wide. */
  const [assetErrors, setAssetErrors] = useState<Record<string, string>>({});
  const [brandingError, setBrandingError] = useState('');
  const [brandingSaving, setBrandingSaving] = useState(false);
  const [designerOpen, setDesignerOpen] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);
  const [brandingLayout, setBrandingLayout] = useState<PrintBrandingLayoutSettings>(DEFAULT_BRANDING_LAYOUT);
  // محرّر قواميس المصطلحات — محرّر واحد مشترك لكل التبويبات (لا نسخة لكل قاموس).
  const [dicts, setDicts] = useState<Record<DictTabKey, { ar: string; en: string }[]>>(emptyDictState);
  const [dictSaving, setDictSaving] = useState(false);
  const [dictTab, setDictTab] = useState<DictTabKey>('forms:nationality');
  const [dictSearch, setDictSearch] = useState('');
  const [dictModifiedOnly, setDictModifiedOnly] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/settings');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const list = (res.data.data.settings ?? []) as any[];
        const v: Record<string, string> = { ...DEFAULT_VALUES };
        list.forEach((s) => (v[s.key] = s.value));
        setValues(v);
        const loadedAssets = { signature: readAssets('signature', v), stamp: readAssets('stamp', v) };
        assetsRef.current = loadedAssets;
        setAssets(loadedAssets);
        const layoutEntry = list.find((s) => s.key === 'print.brandingLayout');
        if (layoutEntry?.value) setBrandingLayout(parseBrandingLayout(layoutEntry.value));

        // Load translation dictionaries — كل تبويب من مفتاحه الخاص، وإلا بذوره.
        const loaded = emptyDictState();
        for (const tab of DICT_TABS) loaded[tab.key] = dictionaryEditorRows(list, tab.settingKey, tab.baseMap);
        setDicts(loaded);
        // عقد العمل: نفس النداء ونفس المفاتيح ونفس القيم تمامًا كما كان.
        const natEntry = list.find((s) => s.key === 'dict.nationalities');
        const jobEntry = list.find((s) => s.key === 'dict.jobTitles');
        const natMap: Record<string, string> = natEntry?.value ? JSON.parse(natEntry.value) : BASE_NATIONALITY_EN;
        const jobMap: Record<string, string> = jobEntry?.value ? JSON.parse(jobEntry.value) : BASE_JOB_TITLE_EN;
        applyTranslationOverrides(natMap, jobMap);
        // النماذج الإدارية تقرأ من مفاتيحها المنفصلة عبر المخزن المركزي.
        useSettings.getState().setBusinessTerms(parseBusinessTermDictionaries(list));
        // القاموس الهندي: مساحة مفاتيح ثالثة (`dict.forms.hi.*`) لا تمسّ ما سبق.
        useSettings.getState().setBusinessTermsHi(parseBusinessTermHiDictionaries(list));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /**
   * تعديل نصّي مؤجَّل ما زال في مهلته لحظة مغادرة الصفحة يُرسَل فورًا.
   *
   * يستدعي `api` مباشرة لا `persistAssets`: المكوّن يُفكَّك، فأي `setState` بعد ذلك
   * بلا معنى — والمطلوب هنا هو وصول البيانات لا تحديث مؤشر الحالة.
   */
  useEffect(() => () => {
    if (assetSaveTimer.current === undefined) return;
    clearTimeout(assetSaveTimer.current);
    assetSaveTimer.current = undefined;
    api
      .put('/settings', {
        settings: ASSET_KINDS.flatMap((kind) =>
          brandingAssetSettingsRows(kind, assetsRef.current[kind]),
        ),
      })
      .catch(() => { /* لا واجهة باقية لعرض الخطأ */ });
  }, []);

  async function reloadHolidays() {
    try {
      const res = await api.get('/holidays');
      setHolidays((res.data?.data ?? []) as Holiday[]);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setHolidaysLoading(false);
    }
  }

  useEffect(() => {
    if (!hasPermission('employees.read')) { setHolidaysLoading(false); return; }
    reloadHolidays();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addHoliday() {
    if (!newHolidayDate || !newHolidayName.trim()) return;
    setHolidaySaving(true);
    try {
      const res = await api.post('/holidays', { date: newHolidayDate, name: newHolidayName.trim() });
      const created = res.data.data as Holiday;
      setHolidays((prev) => [...prev, created].sort((a, b) => a.date.localeCompare(b.date)));
      setNewHolidayDate('');
      setNewHolidayName('');
      toast.ok(t('msg.settings.holiday_added'));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setHolidaySaving(false);
    }
  }

  async function removeHoliday(id: number) {
    setHolidaySaving(true);
    try {
      await api.delete(`/holidays/${id}`);
      setHolidays((prev) => prev.filter((h) => h.id !== id));
      toast.ok(t('msg.settings.holiday_deleted'));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setHolidaySaving(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const settings = FIELDS.map((f) => ({ key: f.key, value: values[f.key] ?? '', group: f.group }));
      await api.put('/settings', { settings });
      // طبّق لغة عرض العملة فورًا على المُنسّق المشترك (بلا إعادة تحميل).
      useSettings.getState().setCurrencyLanguage(values['finance.currencyDisplayLanguage'] as CurrencyLanguage);
      // التواقيع والأختام محفوظة أصلًا لحظة تعديلها؛ هذه إعادة تأكيد تلتقط أيضًا أي
      // تعديل نصّي ما زال في مهلته.
      cancelPendingAssetSave();
      await saveAssets();
      await window.manar?.backupReconfigure?.();
      toast.ok(t('page.settings.saved'));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function saveDict() {
    setDictSaving(true);
    try {
      // كل تبويب يُحفظ في مفتاحه الخاص — لا مفتاح مشترك بين المجموعتين.
      const rows = DICT_TABS.map((tab) => ({
        key: tab.settingKey,
        value: JSON.stringify(serializeBusinessTermRows(dicts[tab.key])),
        group: 'dict',
      }));
      await api.put('/settings', { settings: rows });
      // عقد العمل: يُحدَّث من تبويباته وحدها.
      applyTranslationOverrides(
        serializeBusinessTermRows(dicts['contract:nationality']),
        serializeBusinessTermRows(dicts['contract:jobTitle']),
      );
      // النماذج الإدارية: تُحدَّث من مفاتيح `dict.forms.*` وحدها.
      useSettings.getState().setBusinessTerms(parseBusinessTermDictionaries(rows));
      // القاموس الهندي: من `dict.forms.hi.*` وحدها — لا تقاطع مع ما فوقه.
      useSettings.getState().setBusinessTermsHi(parseBusinessTermHiDictionaries(rows));
      toast.ok(t('msg.settings.dict_saved'));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setDictSaving(false);
    }
  }

  function resizeImage(file: File, maxW: number, maxH: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        // never upscale, only downscale
        const scale = Math.min(1, maxW / img.width, maxH / img.height);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/png');
        const MAX_B64_BYTES = 300 * 1024;
        if (dataUrl.length > MAX_B64_BYTES) {
          reject(new Error(t('msg.settings.image_too_large_processed')));
          return;
        }
        resolve(dataUrl);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(t('msg.settings.image_load_failed'))); };
      img.src = url;
    });
  }

  async function saveBrandingKey(key: string, value: string) {
    await api.put('/settings', { settings: [{ key, value, group: 'print' }] });
  }

  async function handleDesignerSave(layout: PrintBrandingLayoutSettings) {
    setBrandingSaving(true);
    setBrandingError('');
    try {
      const serialized = serializeBrandingLayout(layout);
      await saveBrandingKey('print.brandingLayout', serialized);
      setBrandingLayout(layout);
      toast.ok(t('msg.settings.calibration_saved'));
      setDesignerOpen(false);
    } catch {
      setBrandingError(t('msg.settings.calibration_save_failed'));
    } finally {
      setBrandingSaving(false);
    }
  }

  // ─── حفظ التواقيع والأختام ────────────────────────────────────────────────
  //
  // كل تعديل يُحفظ من نفسه: لا يوجد "تغييرات غير محفوظة" يمكن أن تضيع عند مغادرة
  // الصفحة. زر «حفظ» العلوي يبقى كما هو ويحفظ نفس اللقطة — لم يُستبدل، بل صار
  // تأكيدًا لا شرطًا.

  const assetErrorKey = (kind: BrandingAssetKind, id: string) => `${kind}:${id}`;

  function setAssetError(kind: BrandingAssetKind, id: string, message: string) {
    setAssetErrors((prev) => ({ ...prev, [assetErrorKey(kind, id)]: message }));
  }

  function clearAssetError(kind: BrandingAssetKind, id: string) {
    setAssetErrors((prev) => {
      const key = assetErrorKey(kind, id);
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  /** يحفظ القائمتين مع مرايا المفاتيح القديمة في طلب واحد. */
  async function saveAssets(next: Record<BrandingAssetKind, BrandingAsset[]> = assetsRef.current) {
    await api.put('/settings', {
      settings: ASSET_KINDS.flatMap((kind) => brandingAssetSettingsRows(kind, next[kind])),
    });
  }

  /**
   * يضع لقطة كاملة في طابور الحفظ. الطلبات متسلسلة، وكل طلب يحمل القائمتين كاملتين،
   * فآخر كتابة هي الأحدث دائمًا — لا دمج جزئي ولا سباق بين طلبين.
   */
  function persistAssets(next: Record<BrandingAssetKind, BrandingAsset[]>) {
    assetSavesInFlight.current += 1;
    setAssetSaveState('saving');
    assetSaveChain.current = assetSaveChain.current
      .then(() => saveAssets(next))
      .then(() => {
        assetSavesInFlight.current -= 1;
        // آخر طلب فقط هو من يعلن النتيجة، حتى لا يومض المؤشر بين حفظين متتاليين.
        if (assetSavesInFlight.current === 0) setAssetSaveState('saved');
      })
      .catch((err) => {
        assetSavesInFlight.current -= 1;
        if (assetSavesInFlight.current === 0) setAssetSaveState('failed');
        toast.error(errorMessage(err));
      });
  }

  function cancelPendingAssetSave() {
    if (assetSaveTimer.current === undefined) return;
    clearTimeout(assetSaveTimer.current);
    assetSaveTimer.current = undefined;
  }

  function scheduleAssetSave() {
    cancelPendingAssetSave();
    assetSaveTimer.current = setTimeout(() => {
      assetSaveTimer.current = undefined;
      persistAssets(assetsRef.current);
    }, ASSET_TEXT_SAVE_DEBOUNCE_MS);
  }

  /**
   * يعدّل قائمة نوع واحد بلا لمس الآخر، ثم يحفظ.
   *
   * `persist: 'now'` يلغي أي حفظ مؤجَّل — واللقطة المرسلة مأخوذة من `assetsRef` فتحمل
   * أصلًا ما كُتب في حقل الاسم قبل لحظة، فلا يضيع نص كان بانتظار مهلته.
   */
  function mutateAssets(
    kind: BrandingAssetKind,
    change: (list: BrandingAsset[]) => BrandingAsset[],
    persist: 'now' | 'debounced',
  ) {
    const next = { ...assetsRef.current, [kind]: change(assetsRef.current[kind]) };
    assetsRef.current = next;
    setAssets(next);
    if (persist === 'now') {
      cancelPendingAssetSave();
      persistAssets(next);
    } else {
      scheduleAssetSave();
    }
  }

  function addAsset(kind: BrandingAssetKind) {
    mutateAssets(kind, (list) => appendBrandingAsset(list, newBrandingAssetId(kind)), 'now');
  }

  function removeAsset(kind: BrandingAssetKind, id: string) {
    clearAssetError(kind, id);
    mutateAssets(kind, (list) => removeBrandingAsset(list, id), 'now');
  }

  function setAssetAsDefault(kind: BrandingAssetKind, id: string) {
    mutateAssets(kind, (list) => setDefaultBrandingAsset(list, id), 'now');
  }

  function updateAssetField(
    kind: BrandingAssetKind,
    id: string,
    field: 'name' | 'title',
    value: string,
  ) {
    mutateAssets(kind, (list) => updateBrandingAssetField(list, id, field, value), 'debounced');
  }

  function toggleAssetShow(kind: BrandingAssetKind, id: string) {
    mutateAssets(kind, (list) => toggleBrandingAssetVisibility(list, id), 'now');
  }

  async function handleAssetFileUpload(
    kind: BrandingAssetKind,
    id: string,
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    // كل خطأ رفع يُعرض داخل البطاقة صاحبة المشكلة — لا في أسفل القسم حيث قد لا يُرى.
    if (!file.type.startsWith('image/')) { setAssetError(kind, id, t('msg.settings.select_image_file')); e.target.value = ''; return; }
    if (file.size > 1_048_576) { setAssetError(kind, id, t('msg.settings.image_exceeds_1mb')); e.target.value = ''; return; }
    clearAssetError(kind, id);
    setBrandingSaving(true);
    try {
      const bounds = ASSET_IMAGE_BOUNDS[kind];
      const dataUrl = await resizeImage(file, bounds.maxW, bounds.maxH);
      mutateAssets(kind, (list) => setBrandingAssetImage(list, id, dataUrl), 'now');
    } catch (err) {
      setAssetError(kind, id, err instanceof Error ? err.message : t(ASSET_TEXT[kind].uploadFailedKey));
    } finally {
      setBrandingSaving(false);
      e.target.value = '';
    }
  }

  /**
   * بطاقة إدارة نوع أصل واحد (توقيع أو ختم): إضافة، تسمية، رفع صورة، إظهار/إخفاء،
   * تعيين افتراضي، حذف. نفس التخطيط للنوعين — الفرق نصوصٌ في `ASSET_TEXT` وحدود
   * تصغير في `ASSET_IMAGE_BOUNDS`، لا منطق مكرَّر.
   */
  function renderAssetSection(kind: BrandingAssetKind) {
    const text = ASSET_TEXT[kind];
    const list = assets[kind];
    const refKey = (id: string) => `${kind}:${id}`;

    return (
      <div id={text.sectionId} className="settings-section" key={kind}>
        <SectionCard
          title={t(text.navKey)}
          icon={text.icon}
          actions={
            <>
              {assetSaveState !== 'idle' && (
                <StatusChip
                  tone={ASSET_SAVE_CHIP[assetSaveState].tone}
                  icon={ASSET_SAVE_CHIP[assetSaveState].icon}
                >
                  {t(ASSET_SAVE_CHIP[assetSaveState].labelKey)}
                </StatusChip>
              )}
              <Button variant="secondary" icon="add" small onClick={() => addAsset(kind)} disabled={brandingSaving}>
                {t(text.addKey)}
              </Button>
            </>
          }
        >
          {list.length === 0 && (
            <p className="settings-dict-desc">{t(text.emptyKey)}</p>
          )}

          {list.map((asset, idx) => {
            const indexLabel = t(text.indexKey, { n: idx + 1 });
            return (
              <div
                key={asset.id}
                className={`settings-sig-card${asset.isDefault ? ' settings-sig-card--default' : ''}`}
              >
                {/* Card header */}
                <div className="settings-sig-head">
                  <span className="settings-sig-index">{indexLabel}</span>
                  {asset.isDefault && (
                    <span className="settings-sig-default-badge">{t('page.settings.default_badge')}</span>
                  )}
                  <StatusChip tone={asset.show ? 'green' : 'neutral'} icon={asset.show ? 'visibility' : 'visibility_off'}>
                    {asset.show ? t('page.settings.visible_in_documents') : t('page.settings.hidden')}
                  </StatusChip>
                  <div className="settings-sig-spacer" />
                  {!asset.isDefault && (
                    <button
                      type="button"
                      className="btn secondary small"
                      onClick={() => setAssetAsDefault(kind, asset.id)}
                      disabled={brandingSaving}
                    >
                      {t('page.settings.set_default_btn')}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn danger small"
                    onClick={() => removeAsset(kind, asset.id)}
                    disabled={brandingSaving}
                  >
                    {t('action.delete')}
                  </button>
                </div>

                {/* Meta fields — الاسم هو ما يظهر في قائمة الاختيار داخل النماذج */}
                <div className="settings-sig-meta">
                  <div className="field">
                    <label>{t(text.nameLabelKey)}</label>
                    <input
                      value={asset.name}
                      onChange={(e) => updateAssetField(kind, asset.id, 'name', e.target.value)}
                      placeholder={t(text.namePlaceholderKey)}
                    />
                  </div>
                  <div className="field">
                    <label>{t(text.titleLabelKey)}</label>
                    <input
                      value={asset.title}
                      onChange={(e) => updateAssetField(kind, asset.id, 'title', e.target.value)}
                      placeholder={t(text.titlePlaceholderKey)}
                    />
                  </div>
                </div>

                {/* Stage — display only. The stored file and its real dimensions are
                    untouched: object-fit scales the view, not the image. */}
                <div className={text.stageClass}>
                  {asset.imageUrl
                    ? <img src={asset.imageUrl} alt={indexLabel} />
                    : <span className="settings-media-stage--empty">{t(text.noImageKey)}</span>}
                </div>

                {/* Image row */}
                <div className="settings-media-row">
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    ref={(el) => { assetFileRefs.current[refKey(asset.id)] = el; }}
                    onChange={(e) => handleAssetFileUpload(kind, asset.id, e)}
                  />
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => assetFileRefs.current[refKey(asset.id)]?.click()}
                    disabled={brandingSaving}
                  >
                    {asset.imageUrl ? t('page.settings.change_image') : t('page.settings.upload_image')}
                  </button>
                  <label className="branding-toggle-label">
                    <input
                      type="checkbox"
                      checked={asset.show}
                      onChange={() => toggleAssetShow(kind, asset.id)}
                    />
                    {t(text.showKey)}
                  </label>
                </div>

                {/* خطأ الرفع يخصّ هذه البطاقة وحدها فيُعرض فيها — لا في أسفل القسم. */}
                {assetErrors[refKey(asset.id)] && (
                  <div className="branding-error">{assetErrors[refKey(asset.id)]}</div>
                )}
              </div>
            );
          })}

          {brandingError && (
            <div className="branding-error">{brandingError}</div>
          )}
        </SectionCard>
      </div>
    );
  }

  function renderField(f: { key: string; label: string; group: string; type?: FieldType; options?: { value: string; label: string }[] }) {
    return (
      <div className="field" key={f.key}>
        <label htmlFor={f.key}>{t(f.label)}</label>
        {f.type === 'checkbox' ? (
          <input
            id={f.key}
            type="checkbox"
            title={t(f.label)}
            checked={(values[f.key] ?? DEFAULT_VALUES[f.key] ?? 'true') !== 'false'}
            onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.checked ? 'true' : 'false' }))}
          />
        ) : f.type === 'time' ? (
          <input
            id={f.key}
            type="time"
            title={t(f.label)}
            value={values[f.key] ?? DEFAULT_VALUES[f.key] ?? '02:00'}
            onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))}
          />
        ) : f.type === 'number' ? (
          <input
            id={f.key}
            type="number"
            title={t(f.label)}
            min={1}
            max={365}
            value={values[f.key] ?? DEFAULT_VALUES[f.key] ?? '30'}
            onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))}
          />
        ) : f.type === 'select' ? (
          <select
            id={f.key}
            title={t(f.label)}
            value={values[f.key] ?? DEFAULT_VALUES[f.key] ?? ''}
            onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))}
          >
            {(f.options ?? []).map((o) => <option key={o.value} value={o.value}>{t(o.label)}</option>)}
          </select>
        ) : (
          <input
            id={f.key}
            title={t(f.label)}
            value={values[f.key] ?? ''}
            onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))}
          />
        )}
      </div>
    );
  }

  if (loading) return <div className="center-msg"><div className="spinner" />{t('msg.loading')}</div>;

  // قائمة إدارة الشريط الجانبي — مشتقّة من نفس تعريف `NAV` الذي يرسم الشريط، مرشَّحة
  // بالصلاحيات فقط: ما لا يملك المستخدم صلاحيته لا يُعرض له مفتاح إظهار أصلًا.
  const sidebarSections = permittedNav(NAV, hasPermission);
  const sidebarTotal = sidebarSections.reduce((n, s) => n + s.items.length, 0);
  const sidebarVisibleCount = sidebarSections.reduce(
    (n, s) => n + s.items.filter((it) => !hiddenNavKeys.includes(it.key)).length,
    0,
  );

  const backupEnabled = (values['backup.auto.enabled'] ?? DEFAULT_VALUES['backup.auto.enabled']) !== 'false';
  const backupTime = values['backup.auto.time'] ?? DEFAULT_VALUES['backup.auto.time'];
  const visibleSigs = assets.signature.filter((a) => a.show).length;
  const visibleStamps = assets.stamp.filter((a) => a.show).length;
  const dictRows = dicts[dictTab];
  const dictBase = DICT_TAB_BY_KEY[dictTab].baseMap;
  const dictVisible = dictRows.filter((row) => {
    if (dictModifiedOnly) {
      if (!row.ar.trim() && !row.en.trim()) return false;
      const base = dictBase[row.ar];
      if (!(base === undefined || base !== row.en)) return false;
    }
    const q = dictSearch.trim().toLowerCase();
    if (!q) return true;
    return row.ar.toLowerCase().includes(q) || row.en.toLowerCase().includes(q);
  }).length;

  return (
    <div className={`xpl-scope xpl-page settings-center`} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      {/* ── Executive header ── */}
      <ExecutiveHeader
        icon="settings"
        title={t('page.settings.title')}
        subtitle={t('page.settings.subtitle')}
        aside={
          <Button variant="primary" icon="save" busy={saving} onClick={save}>
            {saving ? t('page.settings.saving') : t('page.settings.save')}
          </Button>
        }
      />

      {/* ── Status metrics (existing state only) ── */}
      <div className="settings-metrics">
        <MetricCard icon="translate" tone="indigo" label={t('page.settings.language')} value={lang === 'ar' ? 'العربية' : 'English'} />
        <MetricCard
          icon="backup"
          tone={backupEnabled ? 'green' : 'neutral'}
          label={t('page.settings.nav.backup')}
          value={backupEnabled ? t('page.settings.status.enabled') : t('page.settings.status.disabled')}
          sub={backupEnabled ? t('page.settings.backup.daily_at', { time: backupTime ?? '' }) : undefined}
        />
        <MetricCard icon="draw" tone="blue" label={t('page.settings.signature_count')} value={assets.signature.length} sub={t('page.settings.signatures_visible_count', { n: visibleSigs })} />
        <MetricCard
          icon="approval"
          tone={assets.stamp.length > 0 ? 'green' : 'neutral'}
          label={t('page.settings.stamp_count')}
          value={assets.stamp.length}
          sub={t('page.settings.stamps_visible_count', { n: visibleStamps })}
        />
        <MetricCard
          icon="dashboard_customize"
          tone="orange"
          label="Template Studio"
          value={t('page.settings.open')}
          onClick={() => setStudioOpen(true)}
          ariaLabel={t('page.settings.open_template_studio_aria')}
        />
      </div>

      {/* ── Sticky in-page navigation ── */}
      <nav className="settings-nav" aria-label={t('page.settings.nav_aria')}>
        {NAV_SECTIONS.map((n) => (
          <button key={n.id} type="button" className="settings-nav-item" onClick={() => scrollToSection(n.id)}>
            <span className="material-symbols-outlined" aria-hidden="true">{n.icon}</span>
            {t(n.labelKey)}
          </button>
        ))}
      </nav>

      {/* ── 1 · Company identity ── */}
      <div id="sec-identity" className="settings-section">
        <SectionCard title={t('page.settings.nav.identity')} icon="corporate_fare">
          <div className="form-grid">
            {IDENTITY_FIELDS.map(renderField)}
            <div className="field">
              <label htmlFor="ui-lang">{t('page.settings.language')}</label>
              <select id="ui-lang" value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
                <option value="ar">العربية</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* ── 1a · Sidebar visibility (UI customization only — routes/permissions untouched) ── */}
      <div id="sec-sidebar" className="settings-section">
        <SectionCard
          title={t('page.settings.nav.sidebar')}
          icon="view_sidebar"
          actions={
            <>
              <StatusChip tone={hiddenNavKeys.length === 0 ? 'green' : 'orange'} icon="view_sidebar">
                {t('page.settings.sidebar.visible_count', { n: sidebarVisibleCount, total: sidebarTotal })}
              </StatusChip>
              <Button
                variant="secondary"
                icon="visibility"
                small
                onClick={showAllNavItems}
                disabled={hiddenNavKeys.length === 0}
              >
                {t('page.settings.sidebar.show_all')}
              </Button>
            </>
          }
        >
          <p className="settings-dict-desc">{t('page.settings.sidebar.desc')}</p>

          <div className="settings-sidebar-groups">
            {sidebarSections.map((section) => (
              <div key={section.group || 'main'} className="settings-sidebar-group">
                <div className="settings-sidebar-group-title">
                  {section.group ? t(section.group) : t('page.settings.sidebar.group_main')}
                </div>
                {section.items.map((it) => {
                  const locked = isProtectedNavKey(it.key);
                  const visible = !hiddenNavKeys.includes(it.key);
                  return (
                    <label
                      key={it.key}
                      className={`settings-sidebar-row${locked ? ' settings-sidebar-row--locked' : ''}`}
                    >
                      <span className="material-symbols-outlined settings-sidebar-icon" aria-hidden="true">
                        {it.icon}
                      </span>
                      <span className="settings-sidebar-name">{t(it.label)}</span>
                      {locked && (
                        <span className="settings-sidebar-lock" title={t('page.settings.sidebar.locked_hint')}>
                          {t('page.settings.sidebar.always_visible')}
                        </span>
                      )}
                      <input
                        type="checkbox"
                        className="settings-switch"
                        checked={visible}
                        disabled={locked}
                        onChange={() => toggleNavItemVisibility(it.key)}
                      />
                    </label>
                  );
                })}
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      {/* ── 1b · Official holidays (Article 70 — excluded from annual leave day counts) ── */}
      <div id="sec-holidays" className="settings-section">
        <SectionCard
          title={t('page.settings.nav.holidays')}
          icon="event_busy"
          actions={
            canManageHolidays ? (
              <div className="settings-generate-actions">
                <select
                  className="settings-generate-year"
                  value={generateYear}
                  onChange={(e) => setGenerateYear(Number(e.target.value))}
                  aria-label={t('page.settings.holidays.generate_year_aria')}
                >
                  {generatableYears().map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
                <Button variant="secondary" icon="event_repeat" onClick={() => setShowGenerateDialog(true)}>
                  {t('page.settings.holidays.generate_btn')}
                </Button>
              </div>
            ) : undefined
          }
        >
          <p className="settings-dict-desc">
            {t('page.settings.holidays.explanation')}
          </p>

          {canManageHolidays && (
            <div className="form-grid" style={{ marginBottom: 12 }}>
              <div className="field">
                <label htmlFor="new-holiday-date">{t('col.date')}</label>
                <input
                  id="new-holiday-date"
                  type="date"
                  value={newHolidayDate}
                  onChange={(e) => setNewHolidayDate(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="new-holiday-name">{t('page.settings.holidays.name_label')}</label>
                <input
                  id="new-holiday-name"
                  value={newHolidayName}
                  onChange={(e) => setNewHolidayName(e.target.value)}
                  placeholder={t('page.settings.holidays.name_placeholder')}
                />
              </div>
              <div className="field" style={{ alignSelf: 'end' }}>
                <Button
                  variant="primary"
                  icon="add"
                  busy={holidaySaving}
                  disabled={!newHolidayDate || !newHolidayName.trim()}
                  onClick={addHoliday}
                >
                  {t('page.settings.holidays.add_btn')}
                </Button>
              </div>
            </div>
          )}

          {holidaysLoading ? (
            <p className="settings-dict-desc">{t('page.settings.holidays.loading')}</p>
          ) : holidays.length === 0 ? (
            <p className="settings-dict-desc">{t('page.settings.holidays.empty')}</p>
          ) : (
            <div className="settings-dict-grid">
              <table className="settings-dict-table">
                <thead>
                  <tr>
                    <th style={{ width: '20%' }}>{t('col.date')}</th>
                    <th style={{ width: '40%' }}>{t('page.settings.holidays.name_col')}</th>
                    <th style={{ width: '20%' }}>{t('col.status')}</th>
                    {canManageHolidays && <th className="settings-dict-actions" aria-label={t('action.delete')}></th>}
                  </tr>
                </thead>
                <tbody>
                  {holidays.map((h) => {
                    const statusMeta = h.status ? HOLIDAY_STATUS_META[h.status] : undefined;
                    return (
                    <tr key={h.id}>
                      <td>{h.date.slice(0, 10)}</td>
                      <td>{h.name}</td>
                      <td>{statusMeta ? <StatusChip tone={statusMeta.tone} icon="verified">{t(statusMeta.labelKey)}</StatusChip> : '—'}</td>
                      {canManageHolidays && (
                        <td className="settings-dict-actions">
                          <button
                            type="button"
                            className="settings-dict-del"
                            onClick={() => removeHoliday(h.id)}
                            disabled={holidaySaving}
                            title={t('action.delete')}
                            aria-label={t('page.settings.holidays.delete_aria')}
                          >
                            <span className="material-symbols-outlined" aria-hidden="true">delete</span>
                          </button>
                        </td>
                      )}
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>

      {/* ── 1c · Financial period lock ── */}
      <div id="sec-period-lock" className="settings-section">
        <PeriodLockSettings />
      </div>

      {/* ── 2 · Backup settings ── */}
      <div id="sec-backup" className="settings-section">
        <SectionCard
          title={t('page.settings.nav.backup')}
          icon="backup"
          actions={
            <StatusChip tone={backupEnabled ? 'green' : 'neutral'} icon={backupEnabled ? 'check_circle' : 'pause_circle'}>
              {backupEnabled ? t('page.settings.backup.enabled_daily', { time: backupTime ?? '' }) : t('page.settings.backup.disabled')}
            </StatusChip>
          }
        >
          <div className="form-grid">
            {BACKUP_FIELDS.map(renderField)}
          </div>
        </SectionCard>
      </div>

      {/* ── 3 · التواقيع  ·  4 · الأختام — بطاقة واحدة تُستخدم للنوعين ── */}
      {ASSET_KINDS.map((kind) => renderAssetSection(kind))}

      {/* ── 5 · Print & Template Studio ── */}
      <div id="sec-print" className="settings-section">
        <SectionCard title={t('page.settings.nav.printing')} icon="print">
          <div className="settings-print-row branding-row-controls">
            <div className="branding-row-label" style={{ marginBottom: 0, flex: 1, minWidth: 180 }}>
              {t('page.settings.calibration_label')}
            </div>
            <button
              type="button"
              className="btn secondary"
              onClick={() => setDesignerOpen(true)}
              disabled={brandingSaving}
            >
              {t('page.settings.calibrate_btn')}
            </button>
          </div>

          <div className="settings-print-row settings-studio-card">
            <div className="settings-studio-icon">
              <span className="material-symbols-outlined" aria-hidden="true">dashboard_customize</span>
            </div>
            <div className="settings-studio-body">
              <p className="settings-studio-title">Template Studio</p>
              <p className="settings-studio-desc">{t('page.settings.studio_desc')}</p>
            </div>
            <Button variant="primary" icon="open_in_new" onClick={() => setStudioOpen(true)}>
              {t('page.settings.open_template_studio_aria')}
            </Button>
          </div>
        </SectionCard>
      </div>

      {/* ── 6 · Translation dictionary ── */}
      <div id="sec-dict" className="settings-section">
        <SectionCard
          title={t('page.settings.nav.dictionary')}
          icon="translate"
          actions={
            <Button variant="primary" icon="save" busy={dictSaving} onClick={saveDict}>
              {t('page.settings.dict.save_btn')}
            </Button>
          }
        >
          <p className="settings-dict-desc">
            {t('page.settings.dict.desc')}
          </p>

          {/* Tabs — ثلاث مجموعات معزولة، لكل منها مساحة مفاتيح `Setting` خاصة:
              النماذج الإدارية (`dict.forms.*`)، ثم القاموس الهندي للنماذج
              (`dict.forms.hi.*`)، ثم عقد العمل (`dict.*`). */}
          {(['forms', 'forms-hi', 'contract'] as const).map((scope) => (
            <div key={scope} className="settings-dict-scope">
              <p className="settings-dict-scope-label">
                {t(DICT_SCOPE_LABEL_KEY[scope])}
              </p>
              <div className="settings-dict-tabs">
                {DICT_TABS.filter((tab) => tab.scope === scope).map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setDictTab(tab.key)}
                    className={`settings-dict-tab${dictTab === tab.key ? ' settings-dict-tab--active' : ''}`}
                  >
                    {t(tab.labelKey)} ({dicts[tab.key].length})
                  </button>
                ))}
              </div>
            </div>
          ))}

          {/* Search + filter toolbar */}
          <div className="settings-dict-toolbar">
            <SearchBox value={dictSearch} onChange={setDictSearch} placeholder={t('page.settings.dict.search_placeholder')} ariaLabel={t('page.settings.dict.search_aria')} />
            <FilterChip active={!dictModifiedOnly} onClick={() => setDictModifiedOnly(false)}>{t('page.settings.dict.filter_all')}</FilterChip>
            <FilterChip active={dictModifiedOnly} onClick={() => setDictModifiedOnly(true)} icon="edit">{t('page.settings.dict.filter_modified')}</FilterChip>
            <span className="settings-dict-count">{dictVisible} / {dictRows.length}</span>
          </div>

          {/* Dictionary Table — محرّر واحد مشترك لكل الفئات */}
          <DictTable
            key={dictTab}
            rows={dicts[dictTab]}
            setRows={(update) =>
              setDicts((prev) => ({
                ...prev,
                [dictTab]: typeof update === 'function' ? update(prev[dictTab]) : update,
              }))
            }
            query={dictSearch}
            modifiedOnly={dictModifiedOnly}
            baseMap={dictBase}
            targetLabel={DICT_TAB_BY_KEY[dictTab].targetLabel}
            t={t}
          />
        </SectionCard>
      </div>

      {showGenerateDialog && (
        <GenerateHolidaysDialog
          year={generateYear}
          onClose={() => setShowGenerateDialog(false)}
          onApplied={reloadHolidays}
        />
      )}

      {studioOpen && (
        <TemplateStudioEditor onClose={() => setStudioOpen(false)} />
      )}

      {designerOpen && (
        <BrandingLayoutDesigner
          signatureUrl={findDefaultAsset(assets.signature)?.imageUrl || undefined}
          stampUrl={findDefaultAsset(assets.stamp)?.imageUrl || undefined}
          initialLayout={brandingLayout}
          onSave={handleDesignerSave}
          onClose={() => setDesignerOpen(false)}
        />
      )}
    </div>
  );
}
