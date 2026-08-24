import type { DesignerField } from '../../modules/chequeTemplateDesigner';
import { SEMANTIC_KEYS, isSemanticKey } from '../../modules/chequeTemplateRuntime';

/**
 * Data Source control — Cheque Template Data Binding UI v1.
 *
 * The per-field "Data Source" section injected into the designer's properties
 * panel. It binds a field to a stable SEMANTIC id (never display text) via a
 * DROPDOWN only — no free-text data-source entry.
 *
 * Stored on `field.binding`:
 *   - `'none'`      → static, unbound (shows the field's own value)
 *   - `'custom'`    → static "Custom Text" (user edits `field.value` manually)
 *   - a SemanticKey → runtime-bound (the Runtime Engine drives the text)
 *
 * The Arabic labels below are display-only; persistence uses the stable ids.
 */

type Props = {
  field: DesignerField;
  onChange: (patch: Partial<DesignerField>) => void;
};

const SEMANTIC_LABELS: Record<string, string> = {
  beneficiary: 'المستفيد',
  chequeDate: 'تاريخ الشيك',
  chequeDay: 'تاريخ الشيك — اليوم',
  chequeMonth: 'تاريخ الشيك — الشهر',
  chequeYear: 'تاريخ الشيك — السنة',
  amount: 'المبلغ',
  amountInWords: 'المبلغ كتابةً',
  chequeNumber: 'رقم الشيك',
  bankName: 'اسم البنك',
  branchName: 'اسم الفرع',
  companyName: 'اسم الشركة',
  issueDate: 'تاريخ الإصدار',
};

// Spec order: None → semantic sources → Custom Text.
const OPTIONS: { value: string; label: string }[] = [
  { value: 'none', label: 'بدون' },
  ...SEMANTIC_KEYS.map((k) => ({ value: k, label: SEMANTIC_LABELS[k] ?? k })),
  { value: 'custom', label: 'نص مخصص' },
];

function currentValue(field: DesignerField): string {
  if (field.binding === 'custom') return 'custom';
  if (isSemanticKey(field.binding)) return field.binding;
  return 'none';
}

export default function DataSourceControl({ field, onChange }: Props) {
  const value = currentValue(field);
  const isBound = value !== 'none' && value !== 'custom';

  return (
    <div className="ctm-datasource">
      <label className="ctm-datasource-label" htmlFor="ctm-datasource-select">مصدر البيانات</label>
      <select
        id="ctm-datasource-select"
        className="ctm-datasource-select"
        value={value}
        onChange={(e) => onChange({ binding: e.target.value })}
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {value === 'custom' && (
        <div className="ctm-datasource-custom">
          <label className="ctm-datasource-label" htmlFor="ctm-datasource-text">النص المخصص</label>
          <input
            id="ctm-datasource-text"
            className="ctm-datasource-input"
            value={field.value}
            onChange={(e) => onChange({ value: e.target.value })}
            placeholder="أدخل النص"
          />
        </div>
      )}

      {isBound && (
        <p className="ctm-datasource-hint">
          <span className="material-symbols-outlined" aria-hidden="true">link</span>
          حقل مرتبط — تُعرض قيمة تجريبية أثناء التصميم.
        </p>
      )}
    </div>
  );
}
