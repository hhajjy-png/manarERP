import { useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../api/client';
import { useUI } from '../stores/uiStore';
import { useT, type Lang } from '../lib/i18n';
import { useToast } from '../stores/toastStore';
import { BASE_NATIONALITY_EN, BASE_JOB_TITLE_EN, applyTranslationOverrides } from '../forms/shared/contractTranslations';
import BrandingLayoutDesigner from '../print-templates/components/BrandingLayoutDesigner';
import type { PrintBrandingLayoutSettings } from '../print-templates/engine/types';
import { parseBrandingLayout, serializeBrandingLayout, DEFAULT_BRANDING_LAYOUT } from '../print-templates/utils/brandingLayout';
import TemplateStudioEditor from '../print-templates/studio/TemplateStudioEditor';

const DEFAULT_VALUES: Record<string, string> = {
  'backup.auto.enabled': 'true',
  'backup.auto.time': '02:00',
  'backup.auto.retention': '30',
};

type FieldType = 'text' | 'checkbox' | 'time' | 'number';

const FIELDS: { key: string; label: string; group: string; type?: FieldType }[] = [
  { key: 'company.name', label: 'field.company_name', group: 'company' },
  { key: 'company.country', label: 'field.settings.country', group: 'company' },
  { key: 'company.phone', label: 'field.phone', group: 'company' },
  { key: 'company.address', label: 'field.address', group: 'company' },
  { key: 'finance.currencyLabel', label: 'field.settings.currency_label', group: 'finance' },
  { key: 'finance.decimals', label: 'field.settings.decimals', group: 'finance' },
  { key: 'backup.cron', label: 'field.settings.backup_cron', group: 'backup' },
  { key: 'backup.auto.enabled', label: 'field.settings.backup_auto_enabled', group: 'backup', type: 'checkbox' },
  { key: 'backup.auto.time', label: 'field.settings.backup_auto_time', group: 'backup', type: 'time' },
  { key: 'backup.auto.retention', label: 'field.settings.backup_auto_retention', group: 'backup', type: 'number' },
];

export default function Settings() {
  const { lang, setLang } = useUI();
  const { t } = useT();
  const toast = useToast();
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const sigInputRef = useRef<HTMLInputElement>(null);
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

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/settings');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const list = (res.data.data.settings ?? []) as any[];
        const v: Record<string, string> = { ...DEFAULT_VALUES };
        list.forEach((s) => (v[s.key] = s.value));
        setValues(v);
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

  async function save() {
    setSaving(true);
    try {
      const brandingSettings = [
        { key: 'print.showSignature', value: values['print.showSignature'] ?? 'true', group: 'print' },
        { key: 'print.showStamp', value: values['print.showStamp'] ?? 'true', group: 'print' },
      ];
      const settings = [
        ...FIELDS.map((f) => ({ key: f.key, value: values[f.key] ?? '', group: f.group })),
        ...brandingSettings,
      ];
      await api.put('/settings', { settings });
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

  async function handleSignatureUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setBrandingError('يرجى اختيار ملف صورة'); return; }
    if (file.size > 1_048_576) { setBrandingError('حجم الصورة يتجاوز 1 ميغابايت'); return; }
    setBrandingError('');
    setBrandingSaving(true);
    try {
      const dataUrl = await resizeImage(file, 500, 250);
      setValues(p => ({ ...p, 'print.signatureImage': dataUrl }));
      await saveBrandingKey('print.signatureImage', dataUrl);
      toast.ok('تم حفظ التوقيع');
    } catch (err) { setBrandingError(err instanceof Error ? err.message : 'فشل رفع التوقيع'); }
    finally { setBrandingSaving(false); e.target.value = ''; }
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

  async function handleDeleteSignature() {
    setBrandingSaving(true);
    try {
      setValues(p => ({ ...p, 'print.signatureImage': '' }));
      await saveBrandingKey('print.signatureImage', '');
      toast.ok('تم حذف التوقيع');
    } catch { setBrandingError('فشل حذف التوقيع'); }
    finally { setBrandingSaving(false); }
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

  if (loading) return <div className="center-msg"><div className="spinner" />{t('msg.loading')}</div>;

  return (
    <div>
      <div className="page-head">
        <div><h2>{t('page.settings.title')}</h2><p>{t('page.settings.subtitle')}</p></div>
        <button type="button" className="btn" onClick={save} disabled={saving}>{saving ? t('page.settings.saving') : t('page.settings.save')}</button>
      </div>

      <div className="card panel" style={{ marginBottom: 20 }}>
        <div className="form-grid">
          <div className="field">
            <label>{t('page.settings.language')}</label>
            <select value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
              <option value="ar">العربية</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card panel">
        <div className="form-grid">
          {FIELDS.map((f) => (
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
              ) : (
                <input
                  id={f.key}
                  title={t(f.label)}
                  value={values[f.key] ?? ''}
                  onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="card panel">
        <h3 className="branding-section-title">طباعة المستندات</h3>

        {/* Signature Row */}
        <div className="branding-row">
          <div className="branding-row-label">توقيع المدير</div>
          <div className="branding-row-controls">
            {values['print.signatureImage'] && (
              <img
                src={values['print.signatureImage']}
                alt="توقيع المدير"
                className="branding-preview-img"
              />
            )}
            <input
              type="file"
              accept="image/*"
              hidden
              ref={sigInputRef}
              onChange={handleSignatureUpload}
            />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => sigInputRef.current?.click()}
              disabled={brandingSaving}
            >
              رفع التوقيع
            </button>
            {values['print.signatureImage'] && (
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleDeleteSignature}
                disabled={brandingSaving}
              >
                حذف التوقيع
              </button>
            )}
            <label className="branding-toggle-label">
              <input
                type="checkbox"
                checked={(values['print.showSignature'] ?? 'true') !== 'false'}
                onChange={(e) => setValues(p => ({ ...p, 'print.showSignature': e.target.checked ? 'true' : 'false' }))}
              />
              إظهار التوقيع في المستندات
            </label>
          </div>
          {brandingError && brandingError.includes('توقيع') && (
            <div className="branding-error">{brandingError}</div>
          )}
        </div>

        {/* Stamp Row */}
        <div className="branding-row">
          <div className="branding-row-label">ختم الشركة</div>
          <div className="branding-row-controls">
            {values['print.stampImage'] && (
              <img
                src={values['print.stampImage']}
                alt="ختم الشركة"
                className="branding-preview-img"
              />
            )}
            <input
              type="file"
              accept="image/*"
              hidden
              ref={stmpInputRef}
              onChange={handleStampUpload}
            />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => stmpInputRef.current?.click()}
              disabled={brandingSaving}
            >
              رفع الختم
            </button>
            {values['print.stampImage'] && (
              <button
                type="button"
                className="btn btn-danger"
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
          {brandingError && !brandingError.includes('توقيع') && (
            <div className="branding-error">{brandingError}</div>
          )}
        </div>

        {/* Position designer */}
        <div className="branding-row" style={{ marginTop: 12 }}>
          <div className="branding-row-label">موضع التوقيع والختم</div>
          <div className="branding-row-controls">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setDesignerOpen(true)}
              disabled={brandingSaving}
            >
              معايرة التوقيع والختم
            </button>
          </div>
        </div>

        {/* Template Studio */}
        <div className="branding-row" style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #e2e8f0' }}>
          <div className="branding-row-label">Template Studio</div>
          <div className="branding-row-controls">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setStudioOpen(true)}
            >
              فتح Template Studio
            </button>
            <span style={{ fontSize: 12, color: '#64748b', marginInlineStart: 8 }}>
              بناء قوالب طباعة مخصصة بدون برمجة
            </span>
          </div>
        </div>
      </div>

      {studioOpen && (
        <TemplateStudioEditor onClose={() => setStudioOpen(false)} />
      )}

      {designerOpen && (
        <BrandingLayoutDesigner
          signatureUrl={values['print.signatureImage'] || undefined}
          stampUrl={values['print.stampImage'] || undefined}
          initialLayout={brandingLayout}
          onSave={handleDesignerSave}
          onClose={() => setDesignerOpen(false)}
        />
      )}

      {/* Translation Dictionary */}
      <div className="card panel" style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h3 className="branding-section-title" style={{ marginBottom: 4 }}>قاموس الترجمة</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
              ترجمات الجنسيات والمسميات الوظيفية المستخدمة في عقود العمل
            </p>
          </div>
          <button type="button" className="btn" onClick={saveDict} disabled={dictSaving} style={{ flexShrink: 0 }}>
            {dictSaving ? 'جارٍ الحفظ…' : 'حفظ القاموس'}
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 12, borderBottom: '2px solid var(--border)' }}>
          {([['nat', 'الجنسيات'], ['job', 'المسميات الوظيفية']] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setDictTab(key)}
              style={{
                padding: '6px 16px', fontSize: 13, fontWeight: 600,
                background: 'none', border: 'none', cursor: 'pointer',
                borderBottom: dictTab === key ? '2px solid var(--primary)' : '2px solid transparent',
                color: dictTab === key ? 'var(--primary)' : 'var(--text-muted)',
                marginBottom: -2,
              }}
            >
              {label} ({(dictTab === 'nat' ? natDict : jobDict).length})
            </button>
          ))}
        </div>

        {/* Dictionary Table */}
        {(() => {
          const rows = dictTab === 'nat' ? natDict : jobDict;
          const setRows = dictTab === 'nat' ? setNatDict : setJobDict;
          return (
            <>
              <div style={{ maxHeight: 360, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-2)', position: 'sticky', top: 0, zIndex: 1 }}>
                      <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, borderBottom: '1px solid var(--border)', width: '45%' }}>عربي</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid var(--border)', width: '45%' }}>English</th>
                      <th style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', width: '10%' }} aria-label="حذف"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '4px 8px' }}>
                          <input
                            value={row.ar}
                            onChange={e => setRows(prev => prev.map((r, j) => j === i ? { ...r, ar: e.target.value } : r))}
                            style={{ width: '100%', fontSize: 13, border: 'none', background: 'transparent', textAlign: 'right' }}
                            title="الجنسية أو المسمى بالعربي"
                          />
                        </td>
                        <td style={{ padding: '4px 8px' }}>
                          <input
                            value={row.en}
                            onChange={e => setRows(prev => prev.map((r, j) => j === i ? { ...r, en: e.target.value } : r))}
                            style={{ width: '100%', fontSize: 13, border: 'none', background: 'transparent', direction: 'ltr' }}
                            title="Translation in English"
                          />
                        </td>
                        <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => setRows(prev => prev.filter((_, j) => j !== i))}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', fontSize: 16, lineHeight: 1 }}
                            title="حذف"
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                onClick={() => setRows(prev => [...prev, { ar: '', en: '' }])}
                style={{ marginTop: 10, fontSize: 13, color: 'var(--primary)', background: 'none', border: '1px dashed var(--primary)', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', width: '100%' }}
              >
                + إضافة صف
              </button>
            </>
          );
        })()}
      </div>
    </div>
  );
}
