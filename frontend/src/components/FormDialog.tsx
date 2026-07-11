import { useEffect, useState, type ReactNode } from 'react';
import Modal from './Modal';
import ConfirmModal from './ConfirmModal';
import DateInput from './DateInput';
import { normalizeDateOnly } from '../lib/dateInput';
import { api, errorMessage } from '../api/client';
import { useT } from '../lib/i18n';
import { Dialog, DialogSection, Button } from './explorer/ExplorerKit';

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
  /** Optional grouping id — only used by the explorer skin to place the field in a section card. */
  section?: string;
}

/** A section descriptor for the explorer skin (title + icon + order). */
export interface FormSection {
  id: string;
  title: string;
  icon?: string;
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
  /** Visual skin. 'legacy' (default) keeps the classic Modal exactly as before;
   *  'explorer' renders the ExplorerKit Dialog with sectioned field cards. */
  skin?: 'legacy' | 'explorer';
  /** Explorer skin only: header icon + subtitle + ordered section definitions. */
  icon?: string;
  subtitle?: string;
  sections?: FormSection[];
}

export default function FormDialog({ title, fields, initial, endpoint, id, onClose, onSaved, skin = 'legacy', icon, subtitle, sections }: Props) {
  const { t } = useT();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [values, setValues] = useState<any>(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v: any = {};
    for (const f of fields) {
      const raw = initial?.[f.name];
      // Date-only rehydration is timezone-safe (string-based) — no UTC day shift.
      v[f.name] = f.type === 'date' ? normalizeDateOnly(raw) : raw ?? f.defaultValue ?? '';
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

  // ─── Shared per-field control (used by both skins) ──────────────────────────
  function renderControl(f: FormField, autoFocus: boolean, explorer: boolean): ReactNode {
    const opts = f.options ?? asyncOptions[f.name] ?? [];
    const errStyle = explorer ? undefined : { borderColor: fieldErrors[f.name] ? '#EF4444' : undefined };
    const cls = (base: string) => explorer ? `xpl-${base}${fieldErrors[f.name] ? ' xpl-invalid' : ''}` : undefined;
    const clearErr = () => { if (fieldErrors[f.name]) setFieldErrors((prev) => { const n = { ...prev }; delete n[f.name]; return n; }); };

    if (f.type === 'select') {
      return (
        <select
          aria-label={t(f.label)}
          className={cls('select')}
          value={values[f.name] ?? ''}
          style={errStyle}
          onChange={(e) => {
            const newVal = e.target.value;
            clearErr();
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
      );
    }
    if (f.type === 'textarea') {
      return (
        <textarea
          rows={3}
          aria-label={t(f.label)}
          className={cls('textarea')}
          autoFocus={autoFocus}
          placeholder={f.placeholder}
          value={values[f.name] ?? ''}
          style={errStyle}
          onChange={(e) => { set(f.name, e.target.value); clearErr(); }}
        />
      );
    }
    if (f.type === 'date') {
      // Standardized DD/MM/YYYY display + calendar; emits canonical YYYY-MM-DD.
      return (
        <DateInput
          value={values[f.name] ?? ''}
          onChange={(v) => { set(f.name, v); clearErr(); }}
          className={cls('input')}
          ariaLabel={t(f.label)}
          autoFocus={autoFocus}
          required={f.required}
          invalid={!!fieldErrors[f.name]}
        />
      );
    }
    return (
      <input
        autoFocus={autoFocus}
        aria-label={t(f.label)}
        className={cls('input')}
        type={f.type === 'number' ? 'number' : f.type === 'password' ? 'password' : 'text'}
        placeholder={f.placeholder}
        value={values[f.name] ?? ''}
        style={errStyle}
        onChange={(e) => { set(f.name, e.target.value); clearErr(); }}
      />
    );
  }

  // ─── Explorer skin (sectioned kit dialog) ───────────────────────────────────
  if (skin === 'explorer') {
    const secDefs: FormSection[] = sections && sections.length > 0 ? sections : [{ id: '__default', title: 'البيانات', icon: 'badge' }];
    const grouped = secDefs.map((s) => ({
      sec: s,
      items: fields.filter((f) => (f.section ?? secDefs[0].id) === s.id),
    })).filter((g) => g.items.length > 0);
    // Any field whose section id doesn't match a known section falls into the first section.
    const known = new Set(secDefs.map((s) => s.id));
    const orphans = fields.filter((f) => f.section && !known.has(f.section));
    if (orphans.length > 0 && grouped.length > 0) grouped[0].items.push(...orphans);

    let fieldIdx = 0;
    return (
      <>
        <Dialog
          icon={icon ?? 'edit'}
          title={title}
          subtitle={subtitle}
          size="lg"
          onClose={tryClose}
          footer={
            <>
              <Button variant="primary" icon="save" busy={saving} onClick={submit}>{t('action.save')}</Button>
              <Button variant="ghost" onClick={tryClose}>{t('action.cancel')}</Button>
            </>
          }
        >
          {error && <div className="xpl-form-error"><span className="material-symbols-outlined">error</span>{error}</div>}
          {helperMsg && <div className="xpl-form-error" style={{ background: 'rgba(16,185,129,.07)', borderColor: 'rgba(16,185,129,.25)', color: 'var(--xpl-green)' }}><span className="material-symbols-outlined">check_circle</span>{helperMsg}</div>}
          {grouped.map((g) => (
            <DialogSection key={g.sec.id} title={g.sec.title} icon={g.sec.icon}>
              {g.items.map((f) => {
                const autoFocus = fieldIdx === 0 && f.type !== 'select';
                fieldIdx += 1;
                return (
                  <div className={`xpl-field${f.half === false ? ' xpl-field--full' : ''}`} key={f.name}>
                    <label>{t(f.label)}{f.required ? <span className="req">*</span> : null}</label>
                    {renderControl(f, autoFocus, true)}
                    {fieldErrors[f.name] && <span className="xpl-field-err">{fieldErrors[f.name]}</span>}
                  </div>
                );
              })}
            </DialogSection>
          ))}
        </Dialog>
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

  // ─── Legacy skin (unchanged) ────────────────────────────────────────────────
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
            const autoFocus = i === 0 && f.type !== 'select';
            return (
              <div className={`field${f.half === false ? ' field-full' : ''}`} key={f.name}>
                <label>{t(f.label)}{f.required ? ' *' : ''}</label>
                {renderControl(f, autoFocus, false)}
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
