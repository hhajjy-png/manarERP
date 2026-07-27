import { useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../api/client';
import { useUI } from '../stores/uiStore';
import { useAuth } from '../stores/authStore';
import { useSettings } from '../stores/settingsStore';
import type { CurrencyLanguage } from '../lib/format';
import { useT, type Lang } from '../lib/i18n';
import { useToast } from '../stores/toastStore';
import { BASE_NATIONALITY_EN, BASE_JOB_TITLE_EN, applyTranslationOverrides } from '../forms/shared/contractTranslations';
import BrandingLayoutDesigner from '../print-templates/components/BrandingLayoutDesigner';
import type { PrintBrandingLayoutSettings } from '../print-templates/engine/types';
import { parseBrandingLayout, serializeBrandingLayout, DEFAULT_BRANDING_LAYOUT } from '../print-templates/utils/brandingLayout';
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

interface SigSlot {
  id: string;
  name: string;
  title: string;
  imageUrl: string;
  show: boolean;
  isDefault: boolean;
}

function migrateLegacySig(values: Record<string, string>): SigSlot[] {
  const raw = values['print.signatures'];
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as SigSlot[];
      if (parsed.length > 0) return parsed;
    } catch { /* fall through */ }
  }
  const legacy = values['print.signatureImage'];
  if (legacy) {
    return [{ id: 'sig-1', name: '', title: '', imageUrl: legacy, show: (values['print.showSignature'] ?? 'true') !== 'false', isDefault: true }];
  }
  return [];
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

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function DictTable({
  rows,
  setRows,
  query,
  modifiedOnly,
  baseMap,
  t,
}: {
  rows: { ar: string; en: string }[];
  setRows: React.Dispatch<React.SetStateAction<{ ar: string; en: string }[]>>;
  query: string;
  modifiedOnly: boolean;
  baseMap: Record<string, string>;
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
              <th className="settings-dict-en" style={{ width: '45%' }}>English</th>
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
  const [signatures, setSignatures] = useState<SigSlot[]>([]);
  const sigFileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const stmpInputRef = useRef<HTMLInputElement>(null);
  const [brandingError, setBrandingError] = useState('');
  const [brandingSaving, setBrandingSaving] = useState(false);
  const [designerOpen, setDesignerOpen] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);
  const [brandingLayout, setBrandingLayout] = useState<PrintBrandingLayoutSettings>(DEFAULT_BRANDING_LAYOUT);
  const [natDict, setNatDict] = useState<{ ar: string; en: string }[]>([]);
  const [jobDict, setJobDict] = useState<{ ar: string; en: string }[]>([]);
  const [dictSaving, setDictSaving] = useState(false);
  const [dictTab, setDictTab] = useState<'nat' | 'job'>('nat');
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
        setSignatures(migrateLegacySig(v));
        const layoutEntry = list.find((s) => s.key === 'print.brandingLayout');
        if (layoutEntry?.value) setBrandingLayout(parseBrandingLayout(layoutEntry.value));

        // Load translation dictionaries — fall back to built-in static dict
        const natEntry = list.find((s) => s.key === 'dict.nationalities');
        const jobEntry = list.find((s) => s.key === 'dict.jobTitles');
        const natMap: Record<string, string> = natEntry?.value ? JSON.parse(natEntry.value) : BASE_NATIONALITY_EN;
        const jobMap: Record<string, string> = jobEntry?.value ? JSON.parse(jobEntry.value) : BASE_JOB_TITLE_EN;
        setNatDict(Object.entries(natMap).map(([ar, en]) => ({ ar, en })));
        setJobDict(Object.entries(jobMap).map(([ar, en]) => ({ ar, en })));
        applyTranslationOverrides(natMap, jobMap);
      } finally {
        setLoading(false);
      }
    })();
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
      const brandingSettings = [
        { key: 'print.showStamp', value: values['print.showStamp'] ?? 'true', group: 'print' },
      ];
      const settings = [
        ...FIELDS.map((f) => ({ key: f.key, value: values[f.key] ?? '', group: f.group })),
        ...brandingSettings,
      ];
      await api.put('/settings', { settings });
      // طبّق لغة عرض العملة فورًا على المُنسّق المشترك (بلا إعادة تحميل).
      useSettings.getState().setCurrencyLanguage(values['finance.currencyDisplayLanguage'] as CurrencyLanguage);
      await saveSignatures(signatures);
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
      const natMap = Object.fromEntries(natDict.filter(r => r.ar.trim()).map(r => [r.ar.trim(), r.en.trim()]));
      const jobMap = Object.fromEntries(jobDict.filter(r => r.ar.trim()).map(r => [r.ar.trim(), r.en.trim()]));
      await api.put('/settings', {
        settings: [
          { key: 'dict.nationalities', value: JSON.stringify(natMap), group: 'dict' },
          { key: 'dict.jobTitles', value: JSON.stringify(jobMap), group: 'dict' },
        ],
      });
      applyTranslationOverrides(natMap, jobMap);
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

  async function handleStampUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setBrandingError(t('msg.settings.select_image_file')); return; }
    if (file.size > 1_048_576) { setBrandingError(t('msg.settings.image_exceeds_1mb')); return; }
    setBrandingError('');
    setBrandingSaving(true);
    try {
      const dataUrl = await resizeImage(file, 400, 400);
      setValues(p => ({ ...p, 'print.stampImage': dataUrl }));
      await saveBrandingKey('print.stampImage', dataUrl);
      toast.ok(t('msg.settings.stamp_saved'));
    } catch (err) { setBrandingError(err instanceof Error ? err.message : t('msg.settings.stamp_upload_failed')); }
    finally { setBrandingSaving(false); e.target.value = ''; }
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

  async function handleDeleteStamp() {
    setBrandingSaving(true);
    try {
      setValues(p => ({ ...p, 'print.stampImage': '' }));
      await saveBrandingKey('print.stampImage', '');
      toast.ok(t('msg.settings.stamp_deleted'));
    } catch { setBrandingError(t('msg.settings.stamp_delete_failed')); }
    finally { setBrandingSaving(false); }
  }

  function addSignature() {
    const id = `sig-${Date.now()}`;
    const isFirst = signatures.length === 0;
    setSignatures((prev) => [...prev, { id, name: '', title: '', imageUrl: '', show: true, isDefault: isFirst }]);
  }

  function removeSignature(id: string) {
    setSignatures((prev) => {
      const filtered = prev.filter((s) => s.id !== id);
      if (filtered.length > 0 && !filtered.some((s) => s.isDefault)) {
        filtered[0] = { ...filtered[0]!, isDefault: true };
      }
      return filtered;
    });
  }

  function setAsDefault(id: string) {
    setSignatures((prev) => prev.map((s) => ({ ...s, isDefault: s.id === id })));
  }

  function updateSigField(id: string, field: 'name' | 'title', value: string) {
    setSignatures((prev) => prev.map((s) => s.id === id ? { ...s, [field]: value } : s));
  }

  function toggleSigShow(id: string) {
    setSignatures((prev) => prev.map((s) => s.id === id ? { ...s, show: !s.show } : s));
  }

  async function handleSigFileUpload(id: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setBrandingError(t('msg.settings.select_image_file')); return; }
    if (file.size > 1_048_576) { setBrandingError(t('msg.settings.image_exceeds_1mb')); return; }
    setBrandingError('');
    setBrandingSaving(true);
    try {
      const dataUrl = await resizeImage(file, 500, 250);
      setSignatures((prev) => prev.map((s) => s.id === id ? { ...s, imageUrl: dataUrl } : s));
    } catch (err) {
      setBrandingError(err instanceof Error ? err.message : t('msg.settings.signature_upload_failed'));
    } finally {
      setBrandingSaving(false);
      e.target.value = '';
    }
  }

  async function saveSignatures(sigs: SigSlot[]) {
    const defaultSig = sigs.find((s) => s.isDefault && s.show) ?? sigs.find((s) => s.show) ?? sigs[0];
    await api.put('/settings', {
      settings: [
        { key: 'print.signatures',     value: JSON.stringify(sigs), group: 'print' },
        { key: 'print.signatureImage', value: defaultSig?.imageUrl ?? '', group: 'print' },
        { key: 'print.showSignature',  value: defaultSig?.show ? 'true' : 'false', group: 'print' },
      ],
    });
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
  const hasStamp = Boolean(values['print.stampImage']);
  const stampVisible = (values['print.showStamp'] ?? 'true') !== 'false';
  const visibleSigs = signatures.filter((s) => s.show).length;
  const dictRows = dictTab === 'nat' ? natDict : jobDict;
  const dictBase = dictTab === 'nat' ? BASE_NATIONALITY_EN : BASE_JOB_TITLE_EN;
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
        <MetricCard icon="draw" tone="blue" label={t('page.settings.signature_count')} value={signatures.length} sub={t('page.settings.signatures_visible_count', { n: visibleSigs })} />
        <MetricCard
          icon="approval"
          tone={hasStamp ? 'green' : 'neutral'}
          label={t('page.settings.stamp_label')}
          value={hasStamp ? t('page.settings.stamp.loaded') : t('page.settings.stamp.not_loaded')}
          sub={hasStamp ? (stampVisible ? t('page.settings.visible_in_documents') : t('page.settings.hidden')) : undefined}
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

      {/* ── 3 · Signatures ── */}
      <div id="sec-signatures" className="settings-section">
        <SectionCard
          title={t('page.settings.nav.signatures')}
          icon="draw"
          actions={
            <Button variant="secondary" icon="add" small onClick={addSignature} disabled={brandingSaving}>
              {t('page.settings.signatures.add_btn')}
            </Button>
          }
        >
          {signatures.length === 0 && (
            <p className="settings-dict-desc">
              {t('page.settings.signatures.empty_hint')}
            </p>
          )}

          {signatures.map((sig, idx) => (
            <div
              key={sig.id}
              className={`settings-sig-card${sig.isDefault ? ' settings-sig-card--default' : ''}`}
            >
              {/* Card header */}
              <div className="settings-sig-head">
                <span className="settings-sig-index">{t('page.settings.signatures.index_label', { n: idx + 1 })}</span>
                {sig.isDefault && (
                  <span className="settings-sig-default-badge">{t('page.settings.default_badge')}</span>
                )}
                <StatusChip tone={sig.show ? 'green' : 'neutral'} icon={sig.show ? 'visibility' : 'visibility_off'}>
                  {sig.show ? t('page.settings.visible_in_documents') : t('page.settings.hidden')}
                </StatusChip>
                <div className="settings-sig-spacer" />
                {!sig.isDefault && (
                  <button
                    type="button"
                    className="btn secondary small"
                    onClick={() => setAsDefault(sig.id)}
                    disabled={brandingSaving}
                  >
                    {t('page.settings.set_default_btn')}
                  </button>
                )}
                <button
                  type="button"
                  className="btn danger small"
                  onClick={() => removeSignature(sig.id)}
                  disabled={brandingSaving}
                >
                  {t('action.delete')}
                </button>
              </div>

              {/* Meta fields */}
              <div className="settings-sig-meta">
                <div className="field">
                  <label>{t('page.settings.signatures.name_label')}</label>
                  <input
                    value={sig.name}
                    onChange={(e) => updateSigField(sig.id, 'name', e.target.value)}
                    placeholder={t('page.settings.signatures.name_placeholder')}
                  />
                </div>
                <div className="field">
                  <label>{t('page.settings.signatures.title_label')}</label>
                  <input
                    value={sig.title}
                    onChange={(e) => updateSigField(sig.id, 'title', e.target.value)}
                    placeholder={t('page.settings.signatures.title_placeholder')}
                  />
                </div>
              </div>

              {/* Signature stage — display only. The stored file and its real
                  dimensions are untouched: object-fit scales the view, not the image. */}
              <div className="settings-media-stage">
                {sig.imageUrl
                  ? <img src={sig.imageUrl} alt={t('page.settings.signatures.index_label', { n: idx + 1 })} />
                  : <span className="settings-media-stage--empty">{t('page.settings.signatures.no_image')}</span>}
              </div>

              {/* Image row */}
              <div className="settings-media-row">
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  ref={(el) => { sigFileRefs.current[sig.id] = el; }}
                  onChange={(e) => handleSigFileUpload(sig.id, e)}
                />
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => sigFileRefs.current[sig.id]?.click()}
                  disabled={brandingSaving}
                >
                  {sig.imageUrl ? t('page.settings.change_image') : t('page.settings.upload_image')}
                </button>
                <label className="branding-toggle-label">
                  <input
                    type="checkbox"
                    checked={sig.show}
                    onChange={() => toggleSigShow(sig.id)}
                  />
                  {t('page.settings.show_in_documents')}
                </label>
              </div>
            </div>
          ))}

          {brandingError && (
            <div className="branding-error">{brandingError}</div>
          )}
        </SectionCard>
      </div>

      {/* ── 4 · Company stamp ── */}
      <div id="sec-stamp" className="settings-section">
        <SectionCard
          title={t('page.settings.nav.stamp')}
          icon="approval"
          actions={
            <StatusChip tone={hasStamp ? (stampVisible ? 'green' : 'orange') : 'neutral'} icon={hasStamp ? 'approval' : 'block'}>
              {hasStamp ? (stampVisible ? t('page.settings.visible_in_documents') : t('page.settings.hidden')) : t('page.settings.stamp.not_loaded_status')}
            </StatusChip>
          }
        >
          {/* Stamp stage — display only; the uploaded file keeps its real size. */}
          <div className="settings-media-stage settings-stamp-stage">
            {values['print.stampImage']
              ? <img src={values['print.stampImage']} alt={t('page.settings.nav.stamp')} />
              : <span className="settings-media-stage--empty">{t('page.settings.stamp.no_image')}</span>}
          </div>

          <div className="settings-media-row">
            <input
              type="file"
              accept="image/*"
              hidden
              ref={stmpInputRef}
              onChange={handleStampUpload}
            />
            <button
              type="button"
              className="btn secondary"
              onClick={() => stmpInputRef.current?.click()}
              disabled={brandingSaving}
            >
              {values['print.stampImage'] ? t('page.settings.change_stamp') : t('page.settings.upload_stamp')}
            </button>
            {values['print.stampImage'] && (
              <button
                type="button"
                className="btn danger"
                onClick={handleDeleteStamp}
                disabled={brandingSaving}
              >
                {t('page.settings.delete_stamp')}
              </button>
            )}
            <label className="branding-toggle-label">
              <input
                type="checkbox"
                checked={(values['print.showStamp'] ?? 'true') !== 'false'}
                onChange={(e) => setValues(p => ({ ...p, 'print.showStamp': e.target.checked ? 'true' : 'false' }))}
              />
              {t('page.settings.show_stamp_in_documents')}
            </label>
          </div>
          {brandingError && (brandingError.includes('ختم') || brandingError.toLowerCase().includes('stamp')) && (
            <div className="branding-error">{brandingError}</div>
          )}
        </SectionCard>
      </div>

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

          {/* Tabs */}
          <div className="settings-dict-tabs">
            {([['nat', t('page.settings.dict.tab_nationalities')], ['job', t('page.settings.dict.tab_job_titles')]] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setDictTab(key)}
                className={`settings-dict-tab${dictTab === key ? ' settings-dict-tab--active' : ''}`}
              >
                {label} ({(key === 'nat' ? natDict : jobDict).length})
              </button>
            ))}
          </div>

          {/* Search + filter toolbar */}
          <div className="settings-dict-toolbar">
            <SearchBox value={dictSearch} onChange={setDictSearch} placeholder={t('page.settings.dict.search_placeholder')} ariaLabel={t('page.settings.dict.search_aria')} />
            <FilterChip active={!dictModifiedOnly} onClick={() => setDictModifiedOnly(false)}>{t('page.settings.dict.filter_all')}</FilterChip>
            <FilterChip active={dictModifiedOnly} onClick={() => setDictModifiedOnly(true)} icon="edit">{t('page.settings.dict.filter_modified')}</FilterChip>
            <span className="settings-dict-count">{dictVisible} / {dictRows.length}</span>
          </div>

          {/* Dictionary Table */}
          {dictTab === 'nat'
            ? <DictTable rows={natDict} setRows={setNatDict} query={dictSearch} modifiedOnly={dictModifiedOnly} baseMap={BASE_NATIONALITY_EN} t={t} />
            : <DictTable rows={jobDict} setRows={setJobDict} query={dictSearch} modifiedOnly={dictModifiedOnly} baseMap={BASE_JOB_TITLE_EN} t={t} />
          }
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
          signatureUrl={
            (signatures.find((s) => s.isDefault && s.imageUrl) ?? signatures.find((s) => s.imageUrl))?.imageUrl
            || values['print.signatureImage']
            || undefined
          }
          stampUrl={values['print.stampImage'] || undefined}
          initialLayout={brandingLayout}
          onSave={handleDesignerSave}
          onClose={() => setDesignerOpen(false)}
        />
      )}
    </div>
  );
}
