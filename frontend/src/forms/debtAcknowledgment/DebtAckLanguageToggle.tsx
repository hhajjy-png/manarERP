import type { DebtAckLang } from './debtAcknowledgmentModel';

/**
 * مبدّل قالب إقرار دين موظف: العربية · English · हिन्दी.
 *
 * مكوّن **مستقل** عن `FormVariantToggle` و`LanguageToggle` عمدًا — كما هي سياسة هذا
 * المستودع مع كل مبدّل جديد. الفرق ليس شكليًا: `FormVariantToggle` يقدّم نسخة
 * ثنائية (`en-hi`) تعرض الإنجليزية والهندية معًا في مستند واحد، بينما هنا **ثلاثة
 * قوالب مستقلة**، لكل واحد نصّه الرسمي الكامل من ملف Word الخاص به. تعديل المبدّل
 * المشترك كان سيغيّر معنى النسخ في كل نموذج يستخدمه.
 */
const LABELS: Record<DebtAckLang, { text: string; aria: string }> = {
  ar: { text: 'العربية', aria: 'Arabic' },
  en: { text: 'English', aria: 'English' },
  hi: { text: 'हिन्दी', aria: 'Hindi' },
};

const ORDER: readonly DebtAckLang[] = ['ar', 'en', 'hi'] as const;

interface Props {
  lang: DebtAckLang;
  onChange: (lang: DebtAckLang) => void;
}

export default function DebtAckLanguageToggle({ lang, onChange }: Props) {
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
      {ORDER.map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={lang === v ? 'true' : 'false'}
          aria-label={LABELS[v].aria}
          onClick={() => onChange(v)}
          style={{
            padding: '4px 12px',
            fontSize: 12,
            border: 'none',
            cursor: 'pointer',
            background: lang === v ? 'var(--primary)' : 'transparent',
            color: lang === v ? '#fff' : 'var(--text-muted)',
            fontWeight: lang === v ? 700 : 400,
            whiteSpace: 'nowrap',
          }}
        >
          {LABELS[v].text}
        </button>
      ))}
    </div>
  );
}
