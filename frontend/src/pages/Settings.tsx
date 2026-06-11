import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client';
import { useUI } from '../stores/uiStore';
import { useT, type Lang } from '../lib/i18n';

const FIELDS: { key: string; label: string; group: string }[] = [
  { key: 'company.name', label: 'field.company_name', group: 'company' },
  { key: 'company.country', label: 'field.settings.country', group: 'company' },
  { key: 'company.phone', label: 'field.phone', group: 'company' },
  { key: 'company.address', label: 'field.address', group: 'company' },
  { key: 'finance.currencyLabel', label: 'field.settings.currency_label', group: 'finance' },
  { key: 'finance.decimals', label: 'field.settings.decimals', group: 'finance' },
  { key: 'backup.cron', label: 'field.settings.backup_cron', group: 'backup' },
];

export default function Settings() {
  const { lang, setLang } = useUI();
  const { t } = useT();
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/settings');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const list = (res.data.data.settings ?? []) as any[];
        const v: Record<string, string> = {};
        list.forEach((s) => (v[s.key] = s.value));
        setValues(v);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save() {
    setSaving(true);
    setMsg('');
    try {
      const settings = FIELDS.map((f) => ({ key: f.key, value: values[f.key] ?? '', group: f.group }));
      await api.put('/settings', { settings });
      setMsg(t('page.settings.saved'));
    } catch (err) {
      setMsg(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="center-msg"><div className="spinner" />{t('msg.loading')}</div>;

  return (
    <div>
      <div className="page-head">
        <div><h2>{t('page.settings.title')}</h2><p>{t('page.settings.subtitle')}</p></div>
        <button className="btn" onClick={save} disabled={saving}>{saving ? t('page.settings.saving') : t('page.settings.save')}</button>
      </div>
      {msg && <div className="alert warn">{msg}</div>}

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
              <label>{t(f.label)}</label>
              <input value={values[f.key] ?? ''} onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
