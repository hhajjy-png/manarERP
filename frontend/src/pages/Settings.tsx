import { useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../api/client';
import { useUI } from '../stores/uiStore';
import { useT, type Lang } from '../lib/i18n';
import BrandingLayoutDesigner from '../print-templates/components/BrandingLayoutDesigner';
import type { PrintBrandingLayoutSettings } from '../print-templates/engine/types';
import { parseBrandingLayout, serializeBrandingLayout, DEFAULT_BRANDING_LAYOUT } from '../print-templates/utils/brandingLayout';

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
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState<'ok' | 'error'>('ok');
  const sigInputRef = useRef<HTMLInputElement>(null);
  const stmpInputRef = useRef<HTMLInputElement>(null);
  const [brandingError, setBrandingError] = useState('');
  const [brandingMsg, setBrandingMsg] = useState('');
  const [brandingSaving, setBrandingSaving] = useState(false);
  const [designerOpen, setDesignerOpen] = useState(false);
  const [brandingLayout, setBrandingLayout] = useState<PrintBrandingLayoutSettings>(DEFAULT_BRANDING_LAYOUT);

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
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save() {
    setSaving(true);
    setMsg('');
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
      setMsg(t('page.settings.saved'));
      setMsgType('ok');
    } catch (err) {
      setMsg(errorMessage(err));
      setMsgType('error');
    } finally {
      setSaving(false);
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
      setBrandingMsg('تم حفظ التوقيع');
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
      setBrandingMsg('تم حفظ الختم');
    } catch (err) { setBrandingError(err instanceof Error ? err.message : 'فشل رفع الختم'); }
    finally { setBrandingSaving(false); e.target.value = ''; }
  }

  async function handleDeleteSignature() {
    setBrandingSaving(true);
    try {
      setValues(p => ({ ...p, 'print.signatureImage': '' }));
      await saveBrandingKey('print.signatureImage', '');
      setBrandingMsg('تم حذف التوقيع');
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
      setBrandingMsg('تم حفظ إعدادات معايرة التوقيع والختم');
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
      setBrandingMsg('تم حذف الختم');
    } catch { setBrandingError('فشل حذف الختم'); }
    finally { setBrandingSaving(false); }
  }

  if (loading) return <div className="center-msg"><div className="spinner" />{t('msg.loading')}</div>;

  return (
    <div>
      <div className="page-head">
        <div><h2>{t('page.settings.title')}</h2><p>{t('page.settings.subtitle')}</p></div>
        <button className="btn" onClick={save} disabled={saving}>{saving ? t('page.settings.saving') : t('page.settings.save')}</button>
      </div>
      {msg && <div className={`alert ${msgType}`}>{msgType === 'error' ? `⚠️ ${msg}` : msg}</div>}

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

        {brandingMsg && <div className="alert ok branding-msg">{brandingMsg}</div>}

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
      </div>

      {designerOpen && (
        <BrandingLayoutDesigner
          signatureUrl={values['print.signatureImage'] || undefined}
          stampUrl={values['print.stampImage'] || undefined}
          initialLayout={brandingLayout}
          onSave={handleDesignerSave}
          onClose={() => setDesignerOpen(false)}
        />
      )}
    </div>
  );
}
