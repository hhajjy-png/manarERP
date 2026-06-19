type Lang = 'ar' | 'en';

interface Props {
  lang: Lang;
  onChange: (lang: Lang) => void;
}

export default function LanguageToggle({ lang, onChange }: Props) {
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
      {(['ar', 'en'] as Lang[]).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => onChange(l)}
          style={{
            padding: '4px 12px',
            fontSize: 12,
            border: 'none',
            cursor: 'pointer',
            background: lang === l ? 'var(--primary)' : 'transparent',
            color: lang === l ? '#fff' : 'var(--text-muted)',
            fontWeight: lang === l ? 700 : 400,
          }}
        >
          {l === 'ar' ? 'عربي' : 'English'}
        </button>
      ))}
    </div>
  );
}
