import { useEffect, useState } from 'react';
import Modal from './Modal';
import { api, errorMessage } from '../api/client';
import { useT } from '../lib/i18n';

export interface FormField {
  name: string;
  label: string;
  type?: 'text' | 'number' | 'date' | 'select' | 'textarea' | 'password';
  options?: { value: string; label: string }[];
  optionsEndpoint?: string; // يحمّل الخيارات من API: data => {value:id,label}
  optionLabel?: string; // اسم الحقل المعروض من نتيجة الـ endpoint
  required?: boolean;
  half?: boolean;
}

interface Props {
  title: string;
  fields: FormField[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initial?: any;
  endpoint: string; // مثل /contracts
  id?: number; // إن وُجد = تعديل
  onClose: () => void;
  onSaved: () => void;
}

function toInputDate(v: unknown): string {
  if (!v) return '';
  const d = new Date(v as string);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export default function FormDialog({ title, fields, initial, endpoint, id, onClose, onSaved }: Props) {
  const { t } = useT();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [values, setValues] = useState<any>(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v: any = {};
    for (const f of fields) {
      const raw = initial?.[f.name];
      v[f.name] = f.type === 'date' ? toInputDate(raw) : raw ?? '';
    }
    return v;
  });
  const [initialValues] = useState(values);
  const [asyncOptions, setAsyncOptions] = useState<Record<string, { value: string; label: string }[]>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fields
      .filter((f) => f.optionsEndpoint)
      .forEach(async (f) => {
        try {
          const res = await api.get(f.optionsEndpoint!);
          const list = res.data.data?.data ?? res.data.data ?? [];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const opts = list.map((x: any) => ({ value: String(x.id), label: x[f.optionLabel ?? 'name'] ?? x.displayName ?? x.code }));
          setAsyncOptions((p) => ({ ...p, [f.name]: opts }));
        } catch {
          // نتجاهل فشل تحميل الخيارات
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isDirty = JSON.stringify(values) !== JSON.stringify(initialValues);

  function canClose() {
    return !isDirty || confirm(t('msg.unsaved_changes'));
  }

  function set(name: string, value: string) {
    setValues((p: Record<string, unknown>) => ({ ...p, [name]: value }));
  }

  async function submit() {
    setError('');
    for (const f of fields) {
      if (f.required && !values[f.name]) {
        setError(t('msg.required_field', { field: t(f.label) }));
        return;
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload: any = {};
    for (const f of fields) {
      const val = values[f.name];
      if (val === '' || val === undefined || val === null) continue;
      payload[f.name] = val;
    }
    setSaving(true);
    try {
      if (id) await api.put(`${endpoint}/${id}`, payload);
      else await api.post(endpoint, payload);
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={title}
      onClose={onClose}
      onBeforeClose={canClose}
      footer={
        <>
          <button className="btn" onClick={submit} disabled={saving}>{saving ? t('msg.saving') : t('action.save')}</button>
          <button className="btn secondary" onClick={() => { if (canClose()) onClose(); }}>{t('action.cancel')}</button>
        </>
      }
    >
      {error && <div className="alert error">⚠️ {error}</div>}
      <div className="form-grid">
        {fields.map((f, i) => {
          const opts = f.options ?? asyncOptions[f.name] ?? [];
          const autoFocus = i === 0 && f.type !== 'select';
          return (
            <div className="field" key={f.name} style={f.half === false ? { gridColumn: '1 / -1' } : undefined}>
              <label>{t(f.label)}{f.required ? ' *' : ''}</label>
              {f.type === 'select' ? (
                <select value={values[f.name] ?? ''} onChange={(e) => set(f.name, e.target.value)}>
                  <option value="">{t('msg.select_placeholder')}</option>
                  {opts.map((o) => <option key={o.value} value={o.value}>{t(o.label)}</option>)}
                </select>
              ) : f.type === 'textarea' ? (
                <textarea rows={3} autoFocus={autoFocus} value={values[f.name] ?? ''} onChange={(e) => set(f.name, e.target.value)} />
              ) : (
                <input autoFocus={autoFocus} type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'password' ? 'password' : 'text'} value={values[f.name] ?? ''} onChange={(e) => set(f.name, e.target.value)} />
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
