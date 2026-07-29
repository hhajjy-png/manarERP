import { FormDocVariant, FORM_DOC_VARIANTS } from './formVariant';

/**
 * مبدّل نسخة المستند بثلاث نسخ: عربي · English · EN + हिन्दी.
 *
 * مكوّن **مستقل** عن `LanguageToggle` عمدًا: ذاك المبدّل يخدم بقية النماذج
 * الإدارية بنسختين، وهذه المرحلة تجريبية على «طلب الإجازة» وحده — فتعديل
 * المبدّل المشترك كان سيغيّر كل نموذج يستخدمه. نفس المظهر والسلوك، ثلاثة أزرار
 * بدل اثنين.
 */

const LABELS: Record<FormDocVariant, { text: string; aria: string }> = {
  'ar':    { text: 'عربي',        aria: 'Arabic' },
  'en':    { text: 'English',     aria: 'English' },
  'en-hi': { text: 'EN + हिन्दी', aria: 'English and Hindi' },
};

interface Props {
  variant: FormDocVariant;
  onChange: (variant: FormDocVariant) => void;
}

export default function FormVariantToggle({ variant, onChange }: Props) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 0,
        alignItems: 'center',
        border: '1px solid var(--border)',
        borderRadius: 6,
        overflow: 'hidden',
      }}
    >
      {FORM_DOC_VARIANTS.map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={variant === v ? 'true' : 'false'}
          aria-label={LABELS[v].aria}
          onClick={() => onChange(v)}
          style={{
            padding: '4px 12px',
            fontSize: 12,
            border: 'none',
            cursor: 'pointer',
            background: variant === v ? 'var(--primary)' : 'transparent',
            color: variant === v ? '#fff' : 'var(--text-muted)',
            fontWeight: variant === v ? 700 : 400,
            whiteSpace: 'nowrap',
          }}
        >
          {LABELS[v].text}
        </button>
      ))}
    </div>
  );
}
