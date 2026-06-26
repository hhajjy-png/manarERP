import { useEffect, useState } from 'react';
import Modal from './Modal';
import ConfirmModal from './ConfirmModal';
import { api, errorMessage } from '../api/client';
import { useT } from '../lib/i18n';

export interface FormField {
  name: string;
  label: string;
  type?: 'text' | 'number' | 'date' | 'select' | 'textarea' | 'password';
  options?: { value: string; label: string }[];
  optionsEndpoint?: string; // يحمّل الخيارات من API: data => {value:id,label}
  optionLabel?: string; // اسم الحقل المعروض من نتيجة الـ endpoint
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  optionLabelFn?: (x: any) => string; // دالة مخصصة لبناء نص الخيار
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSelectRaw?: (raw: any) => Record<string, string>; // تعبئة حقول أخرى عند الاختيار
  required?: boolean;
  half?: boolean;
  defaultValue?: string;
  placeholder?: string;
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
      v[f.name] = f.type === 'date' ? toInputDate(raw) : raw ?? f.defaultValue ?? '';
    }
    return v;
  });
  const [initialValues] = useState(values);
  const [asyncOptions, setAsyncOptions] = useState<Record<string, { value: string; label: string; raw: unknown }[]>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [helperMsg, setHelperMsg] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  useEffect(() => {
    fields
      .filter((f) => f.optionsEndpoint)
      .forEach(async (f) => {
        try {
          const res = await api.get(f.optionsEndpoint!);
          const list = res.data.data?.data ?? res.data.data ?? [];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const opts = list.map((x: any) => ({
            value: String(x.id),
            label: f.optionLabelFn ? f.optionLabelFn(x) : (x[f.optionLabel ?? 'name'] ?? x.displayName ?? x.code),
            raw: x,
          }));
          setAsyncOptions((p) => ({ ...p, [f.name]: opts }));
        } catch {
          // نتجاهل فشل تحميل الخيارات
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isDirty = JSON.stringify(values) !== JSON.stringify(initialValues);

  function tryClose() {
    if (isDirty) { setShowDiscardConfirm(true); } else { onClose(); }
  }

  function set(name: string, value: string) {
    setValues((p: Record<string, unknown>) => ({ ...p, [name]: value }));
  }

  function validate(vals: Record<string, unknown>): Record<string, string> {
    const errors: Record<string, string> = {};
    for (const field of fields) {
      if (field.required && !String(vals[field.name] ?? '').trim()) {
        errors[field.name] = `الحقل «${t(field.label)}» مطلوب`;
      }
    }
    return errors;
  }

  async function submit() {
    setError('');
    const errors = validate(values);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
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
    <>
      <Modal
        title={title}
        onClose={tryClose}
        footer={
          <>
            <button type="button" className="btn" onClick={submit} disabled={saving}>{saving ? t('msg.saving') : t('action.save')}</button>
            <button type="button" className="btn secondary" onClick={tryClose}>{t('action.cancel')}</button>
          </>
        }
      >
        {error && <div className="alert error">⚠️ {error}</div>}
        {helperMsg && <div className="alert info">✓ {helperMsg}</div>}
        <div className="form-grid">
          {fields.map((f, i) => {
            const opts = f.options ?? asyncOptions[f.name] ?? [];
            const autoFocus = i === 0 && f.type !== 'select';
            return (
              <div className={`field${f.half === false ? ' field-full' : ''}`} key={f.name}>
                <label>{t(f.label)}{f.required ? ' *' : ''}</label>
                {f.type === 'select' ? (
                  <select
                    aria-label={t(f.label)}
                    value={values[f.name] ?? ''}
                    style={{ borderColor: fieldErrors[f.name] ? '#EF4444' : undefined }}
                    onChange={(e) => {
                      const newVal = e.target.value;
                      if (fieldErrors[f.name]) {
                        setFieldErrors(prev => { const n = { ...prev }; delete n[f.name]; return n; });
                      }
                      if (f.onSelectRaw && newVal) {
                        const rawOpt = asyncOptions[f.name]?.find((o) => o.value === newVal);
                        if (rawOpt) {
                          const updates = f.onSelectRaw(rawOpt.raw);
                          setValues((p: Record<string, unknown>) => ({ ...p, [f.name]: newVal, ...updates }));
                          setHelperMsg(t('msg.price_autofill'));
                          return;
                        }
                      }
                      set(f.name, newVal);
                    }}
                  >
                    <option value="">{t('msg.select_placeholder')}</option>
                    {opts.map((o) => <option key={o.value} value={o.value}>{t(o.label)}</option>)}
                  </select>
                ) : f.type === 'textarea' ? (
                  <textarea
                    rows={3}
                    autoFocus={autoFocus}
                    placeholder={f.placeholder}
                    value={values[f.name] ?? ''}
                    style={{ borderColor: fieldErrors[f.name] ? '#EF4444' : undefined }}
                    onChange={(e) => {
                      set(f.name, e.target.value);
                      if (fieldErrors[f.name]) {
                        setFieldErrors(prev => { const n = { ...prev }; delete n[f.name]; return n; });
                      }
                    }}
                  />
                ) : (
                  <input
                    autoFocus={autoFocus}
                    type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'password' ? 'password' : 'text'}
                    placeholder={f.placeholder}
                    value={values[f.name] ?? ''}
                    style={{ borderColor: fieldErrors[f.name] ? '#EF4444' : undefined }}
                    onChange={(e) => {
                      set(f.name, e.target.value);
                      if (fieldErrors[f.name]) {
                        setFieldErrors(prev => { const n = { ...prev }; delete n[f.name]; return n; });
                      }
                    }}
                  />
                )}
                {fieldErrors[f.name] && (
                  <span style={{ color: '#EF4444', fontSize: 12, marginTop: 2, display: 'block' }}>
                    {fieldErrors[f.name]}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </Modal>
      {showDiscardConfirm && (
        <ConfirmModal
          title="تغييرات غير محفوظة"
          message={t('msg.unsaved_changes')}
          confirmLabel="إغلاق بدون حفظ"
          cancelLabel="العودة"
          variant="warning"
          onConfirm={onClose}
          onCancel={() => setShowDiscardConfirm(false)}
        />
      )}
    </>
  );
}
