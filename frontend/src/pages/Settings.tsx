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

const NAV_SECTIONS: { id: string; icon: string; label: string }[] = [
  { id: 'sec-identity', icon: 'corporate_fare', label: 'هوية الشركة' },
  { id: 'sec-holidays', icon: 'event_busy', label: 'العطل الرسمية' },
  { id: 'sec-backup', icon: 'backup', label: 'النسخ الاحتياطي' },
  { id: 'sec-signatures', icon: 'draw', label: 'التواقيع' },
  { id: 'sec-stamp', icon: 'approval', label: 'ختم الشركة' },
  { id: 'sec-print', icon: 'print', label: 'الطباعة والقوالب' },
  { id: 'sec-dict', icon: 'translate', label: 'قاموس الترجمة' },
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

const HOLIDAY_STATUS_META: Record<string, { label: string; tone: 'green' | 'orange' | 'neutral' }> = {
  OFFICIAL: { label: 'رسمية', tone: 'green' },
  EXPECTED_ALOJAIRI: { label: 'متوقَّعة (العجيري)', tone: 'orange' },
  MANUALLY_ADJUSTED: { label: 'مُعدَّلة يدويًا', tone: 'neutral' },
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
}: {
  rows: { ar: string; en: string }[];
  setRows: React.Dispatch<React.SetStateAction<{ ar: string; en: string }[]>>;
  query: string;
  modifiedOnly: boolean;
  baseMap: Record<string, string>;
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
              <th className="settings-dict-ar" style={{ width: '45%' }}>عربي</th>
              <th className="settings-dict-en" style={{ width: '45%' }}>English</th>
              <th className="settings-dict-actions" aria-label="حذف"></th>
            </tr>
          </thead>
          <tbody ref={tbodyRef}>
            {visible.map(({ row, i }) => (
              <tr key={i}>
                <td className="settings-dict-ar">
                  <input
                    value={row.ar}
                    onChange={(e) => setRows((prev) => prev.map((r, j) => j === i ? { ...r, ar: e.target.value } : r))}
                    title="الجنسية أو المسمى بالعربي"
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
                    title="حذف"
                    aria-label="حذف الصف"
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">delete</span>
                  </button>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={3} className="settings-dict-empty">
                  لا توجد نتائج مطابقة
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
          إضافة صف
        </button>
      )}
    </>
  );
}

export default function Settings() {
  const { lang, setLang } = useUI();
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
      toast.ok('تمت إضافة العطلة بنجاح');
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
      toast.ok('تم حذف العطلة');
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
      toast.ok('تم حفظ قاموس الترجمة');
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
          reject(new Error('حجم الصورة بعد المعالجة كبير جداً (الحد الأقصى 300KB). استخدم صورة أصغر.'));
          return;
        }
        resolve(dataUrl);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('فشل تحميل الصورة')); };
      img.src = url;
    });
  }

  async function saveBrandingKey(key: string, value: string) {
    await api.put('/settings', { settings: [{ key, value, group: 'print' }] });
  }

  async function handleStampUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setBrandingError('يرجى اختيار ملف صورة'); return; }
    if (file.size > 1_048_576) { setBrandingError('حجم الصورة يتجاوز 1 ميغابايت'); return; }
    setBrandingError('');
    setBrandingSaving(true);
    try {
      const dataUrl = await resizeImage(file, 400, 400);
      setValues(p => ({ ...p, 'print.stampImage': dataUrl }));
      await saveBrandingKey('print.stampImage', dataUrl);
      toast.ok('تم حفظ الختم');
    } catch (err) { setBrandingError(err instanceof Error ? err.message : 'فشل رفع الختم'); }
    finally { setBrandingSaving(false); e.target.value = ''; }
  }

  async function handleDesignerSave(layout: PrintBrandingLayoutSettings) {
    setBrandingSaving(true);
    setBrandingError('');
    try {
      const serialized = serializeBrandingLayout(layout);
      await saveBrandingKey('print.brandingLayout', serialized);
      setBrandingLayout(layout);
      toast.ok('تم حفظ إعدادات معايرة التوقيع والختم');
      setDesignerOpen(false);
    } catch {
      setBrandingError('فشل حفظ إعدادات المعايرة');
    } finally {
      setBrandingSaving(false);
    }
  }

  async function handleDeleteStamp() {
    setBrandingSaving(true);
    try {
      setValues(p => ({ ...p, 'print.stampImage': '' }));
      await saveBrandingKey('print.stampImage', '');
      toast.ok('تم حذف الختم');
    } catch { setBrandingError('فشل حذف الختم'); }
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
    if (!file.type.startsWith('image/')) { setBrandingError('يرجى اختيار ملف صورة'); return; }
    if (file.size > 1_048_576) { setBrandingError('حجم الصورة يتجاوز 1 ميغابايت'); return; }
    setBrandingError('');
    setBrandingSaving(true);
    try {
      const dataUrl = await resizeImage(file, 500, 250);
      setSignatures((prev) => prev.map((s) => s.id === id ? { ...s, imageUrl: dataUrl } : s));
    } catch (err) {
      setBrandingError(err instanceof Error ? err.message : 'فشل رفع التوقيع');
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
        <MetricCard icon="translate" tone="indigo" label="لغة الواجهة" value={lang === 'ar' ? 'العربية' : 'English'} />
        <MetricCard
          icon="backup"
          tone={backupEnabled ? 'green' : 'neutral'}
          label="النسخ الاحتياطي"
          value={backupEnabled ? 'مفعّل' : 'متوقف'}
          sub={backupEnabled ? `يومياً · ${backupTime}` : undefined}
        />
        <MetricCard icon="draw" tone="blue" label="عدد التواقيع" value={signatures.length} sub={`${visibleSigs} يظهر في المستندات`} />
        <MetricCard
          icon="approval"
          tone={hasStamp ? 'green' : 'neutral'}
          label="الختم"
          value={hasStamp ? 'مُحمَّل' : 'غير مُحمَّل'}
          sub={hasStamp ? (stampVisible ? 'يظهر في المستندات' : 'مخفي') : undefined}
        />
        <MetricCard
          icon="dashboard_customize"
          tone="orange"
          label="Template Studio"
          value="فتح"
          onClick={() => setStudioOpen(true)}
          ariaLabel="فتح Template Studio"
        />
      </div>

      {/* ── Sticky in-page navigation ── */}
      <nav className="settings-nav" aria-label="التنقل داخل الإعدادات">
        {NAV_SECTIONS.map((n) => (
          <button key={n.id} type="button" className="settings-nav-item" onClick={() => scrollToSection(n.id)}>
            <span className="material-symbols-outlined" aria-hidden="true">{n.icon}</span>
            {n.label}
          </button>
        ))}
      </nav>

      {/* ── 1 · Company identity ── */}
      <div id="sec-identity" className="settings-section">
        <SectionCard title="هوية الشركة" icon="corporate_fare">
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

      {/* ── 1a · Official holidays (Article 70 — excluded from annual leave day counts) ── */}
      <div id="sec-holidays" className="settings-section">
        <SectionCard
          title="العطل الرسمية"
          icon="event_busy"
          actions={
            canManageHolidays ? (
              <div className="settings-generate-actions">
                <select
                  className="settings-generate-year"
                  value={generateYear}
                  onChange={(e) => setGenerateYear(Number(e.target.value))}
                  aria-label="سنة التوليد"
                >
                  {generatableYears().map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
                <Button variant="secondary" icon="event_repeat" onClick={() => setShowGenerateDialog(true)}>
                  توليد العطل
                </Button>
              </div>
            ) : undefined
          }
        >
          <p className="settings-dict-desc">
            العطل الرسمية المسجّلة هنا تُستثنى تلقائيًا من عدّ أيام الإجازة السنوية المستهلكة عند وقوعها داخل فترة إجازة معتمدة (المادة 70).
          </p>

          {canManageHolidays && (
            <div className="form-grid" style={{ marginBottom: 12 }}>
              <div className="field">
                <label htmlFor="new-holiday-date">التاريخ</label>
                <input
                  id="new-holiday-date"
                  type="date"
                  value={newHolidayDate}
                  onChange={(e) => setNewHolidayDate(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="new-holiday-name">اسم العطلة</label>
                <input
                  id="new-holiday-name"
                  value={newHolidayName}
                  onChange={(e) => setNewHolidayName(e.target.value)}
                  placeholder="مثال: اليوم الوطني"
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
                  إضافة عطلة
                </Button>
              </div>
            </div>
          )}

          {holidaysLoading ? (
            <p className="settings-dict-desc">جارٍ التحميل...</p>
          ) : holidays.length === 0 ? (
            <p className="settings-dict-desc">لا توجد عطل رسمية مسجّلة بعد.</p>
          ) : (
            <div className="settings-dict-grid">
              <table className="settings-dict-table">
                <thead>
                  <tr>
                    <th style={{ width: '20%' }}>التاريخ</th>
                    <th style={{ width: '40%' }}>الاسم</th>
                    <th style={{ width: '20%' }}>الحالة</th>
                    {canManageHolidays && <th className="settings-dict-actions" aria-label="حذف"></th>}
                  </tr>
                </thead>
                <tbody>
                  {holidays.map((h) => {
                    const statusMeta = h.status ? HOLIDAY_STATUS_META[h.status] : undefined;
                    return (
                    <tr key={h.id}>
                      <td>{h.date.slice(0, 10)}</td>
                      <td>{h.name}</td>
                      <td>{statusMeta ? <StatusChip tone={statusMeta.tone} icon="verified">{statusMeta.label}</StatusChip> : '—'}</td>
                      {canManageHolidays && (
                        <td className="settings-dict-actions">
                          <button
                            type="button"
                            className="settings-dict-del"
                            onClick={() => removeHoliday(h.id)}
                            disabled={holidaySaving}
                            title="حذف"
                            aria-label="حذف العطلة"
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

      {/* ── 1b · Financial period lock ── */}
      <div id="sec-period-lock" className="settings-section">
        <PeriodLockSettings />
      </div>

      {/* ── 2 · Backup settings ── */}
      <div id="sec-backup" className="settings-section">
        <SectionCard
          title="النسخ الاحتياطي"
          icon="backup"
          actions={
            <StatusChip tone={backupEnabled ? 'green' : 'neutral'} icon={backupEnabled ? 'check_circle' : 'pause_circle'}>
              {backupEnabled ? `مفعّل يومياً · ${backupTime}` : 'غير مفعّل'}
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
          title="التواقيع"
          icon="draw"
          actions={
            <Button variant="secondary" icon="add" small onClick={addSignature} disabled={brandingSaving}>
              إضافة توقيع
            </Button>
          }
        >
          {signatures.length === 0 && (
            <p className="settings-dict-desc">
              لا توجد توقيعات — انقر «إضافة توقيع» لإضافة الأول.
            </p>
          )}

          {signatures.map((sig, idx) => (
            <div
              key={sig.id}
              className={`settings-sig-card${sig.isDefault ? ' settings-sig-card--default' : ''}`}
            >
              {/* Card header */}
              <div className="settings-sig-head">
                <span className="settings-sig-index">توقيع {idx + 1}</span>
                {sig.isDefault && (
                  <span className="settings-sig-default-badge">افتراضي</span>
                )}
                <StatusChip tone={sig.show ? 'green' : 'neutral'} icon={sig.show ? 'visibility' : 'visibility_off'}>
                  {sig.show ? 'يظهر في المستندات' : 'مخفي'}
                </StatusChip>
                <div className="settings-sig-spacer" />
                {!sig.isDefault && (
                  <button
                    type="button"
                    className="btn secondary small"
                    onClick={() => setAsDefault(sig.id)}
                    disabled={brandingSaving}
                  >
                    تعيين كافتراضي
                  </button>
                )}
                <button
                  type="button"
                  className="btn danger small"
                  onClick={() => removeSignature(sig.id)}
                  disabled={brandingSaving}
                >
                  حذف
                </button>
              </div>

              {/* Meta fields */}
              <div className="settings-sig-meta">
                <div className="field">
                  <label>الاسم (اختياري)</label>
                  <input
                    value={sig.name}
                    onChange={(e) => updateSigField(sig.id, 'name', e.target.value)}
                    placeholder="مثال: المدير العام"
                  />
                </div>
                <div className="field">
                  <label>المسمى الوظيفي (اختياري)</label>
                  <input
                    value={sig.title}
                    onChange={(e) => updateSigField(sig.id, 'title', e.target.value)}
                    placeholder="مثال: General Manager"
                  />
                </div>
              </div>

              {/* Signature stage — display only. The stored file and its real
                  dimensions are untouched: object-fit scales the view, not the image. */}
              <div className="settings-media-stage">
                {sig.imageUrl
                  ? <img src={sig.imageUrl} alt={`توقيع ${idx + 1}`} />
                  : <span className="settings-media-stage--empty">لا توجد صورة توقيع</span>}
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
                  {sig.imageUrl ? 'تغيير الصورة' : 'رفع صورة'}
                </button>
                <label className="branding-toggle-label">
                  <input
                    type="checkbox"
                    checked={sig.show}
                    onChange={() => toggleSigShow(sig.id)}
                  />
                  إظهار في المستندات
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
          title="ختم الشركة"
          icon="approval"
          actions={
            <StatusChip tone={hasStamp ? (stampVisible ? 'green' : 'orange') : 'neutral'} icon={hasStamp ? 'approval' : 'block'}>
              {hasStamp ? (stampVisible ? 'يظهر في المستندات' : 'مخفي') : 'غير مُحمّل'}
            </StatusChip>
          }
        >
          {/* Stamp stage — display only; the uploaded file keeps its real size. */}
          <div className="settings-media-stage settings-stamp-stage">
            {values['print.stampImage']
              ? <img src={values['print.stampImage']} alt="ختم الشركة" />
              : <span className="settings-media-stage--empty">لا يوجد ختم مُحمَّل</span>}
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
              {values['print.stampImage'] ? 'تغيير الختم' : 'رفع الختم'}
            </button>
            {values['print.stampImage'] && (
              <button
                type="button"
                className="btn danger"
                onClick={handleDeleteStamp}
                disabled={brandingSaving}
              >
                حذف الختم
              </button>
            )}
            <label className="branding-toggle-label">
              <input
                type="checkbox"
                checked={(values['print.showStamp'] ?? 'true') !== 'false'}
                onChange={(e) => setValues(p => ({ ...p, 'print.showStamp': e.target.checked ? 'true' : 'false' }))}
              />
              إظهار الختم في المستندات
            </label>
          </div>
          {brandingError && brandingError.includes('ختم') && (
            <div className="branding-error">{brandingError}</div>
          )}
        </SectionCard>
      </div>

      {/* ── 5 · Print & Template Studio ── */}
      <div id="sec-print" className="settings-section">
        <SectionCard title="الطباعة والقوالب" icon="print">
          <div className="settings-print-row branding-row-controls">
            <div className="branding-row-label" style={{ marginBottom: 0, flex: 1, minWidth: 180 }}>
              معايرة موضع التوقيع والختم على المستندات المطبوعة
            </div>
            <button
              type="button"
              className="btn secondary"
              onClick={() => setDesignerOpen(true)}
              disabled={brandingSaving}
            >
              معايرة التوقيع والختم
            </button>
          </div>

          <div className="settings-print-row settings-studio-card">
            <div className="settings-studio-icon">
              <span className="material-symbols-outlined" aria-hidden="true">dashboard_customize</span>
            </div>
            <div className="settings-studio-body">
              <p className="settings-studio-title">Template Studio</p>
              <p className="settings-studio-desc">بناء قوالب طباعة مخصصة بدون برمجة.</p>
            </div>
            <Button variant="primary" icon="open_in_new" onClick={() => setStudioOpen(true)}>
              فتح Template Studio
            </Button>
          </div>
        </SectionCard>
      </div>

      {/* ── 6 · Translation dictionary ── */}
      <div id="sec-dict" className="settings-section">
        <SectionCard
          title="قاموس الترجمة"
          icon="translate"
          actions={
            <Button variant="primary" icon="save" busy={dictSaving} onClick={saveDict}>
              حفظ القاموس
            </Button>
          }
        >
          <p className="settings-dict-desc">
            ترجمات الجنسيات والمسميات الوظيفية المستخدمة في عقود العمل
          </p>

          {/* Tabs */}
          <div className="settings-dict-tabs">
            {([['nat', 'الجنسيات'], ['job', 'المسميات الوظيفية']] as const).map(([key, label]) => (
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
            <SearchBox value={dictSearch} onChange={setDictSearch} placeholder="ابحث في القاموس (عربي أو English)..." ariaLabel="بحث في القاموس" />
            <FilterChip active={!dictModifiedOnly} onClick={() => setDictModifiedOnly(false)}>الكل</FilterChip>
            <FilterChip active={dictModifiedOnly} onClick={() => setDictModifiedOnly(true)} icon="edit">المعدلة فقط</FilterChip>
            <span className="settings-dict-count">{dictVisible} / {dictRows.length}</span>
          </div>

          {/* Dictionary Table */}
          {dictTab === 'nat'
            ? <DictTable rows={natDict} setRows={setNatDict} query={dictSearch} modifiedOnly={dictModifiedOnly} baseMap={BASE_NATIONALITY_EN} />
            : <DictTable rows={jobDict} setRows={setJobDict} query={dictSearch} modifiedOnly={dictModifiedOnly} baseMap={BASE_JOB_TITLE_EN} />
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
