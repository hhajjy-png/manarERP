import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client';
import { useUI } from '../stores/uiStore';
import { useT, type Lang } from '../lib/i18n';

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

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/settings');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const list = (res.data.data.settings ?? []) as any[];
        const v: Record<string, string> = { ...DEFAULT_VALUES };
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
      await window.manar?.backupReconfigure?.();
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
    </div>
  );
}
