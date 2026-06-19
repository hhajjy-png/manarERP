import { PRINT_PROFILES, ProfileId } from './printProfiles';

interface Props {
  profile: ProfileId;
  onChange: (p: ProfileId) => void;
}

export default function PrintProfileToggle({ profile, onChange }: Props) {
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
      {(Object.keys(PRINT_PROFILES) as ProfileId[]).map((id) => {
        const p = PRINT_PROFILES[id];
        const active = profile === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={active ? 'true' : 'false'}
            aria-label={p.labelEn}
            onClick={() => onChange(id)}
            style={{
              padding: '4px 12px',
              fontSize: 12,
              border: 'none',
              cursor: 'pointer',
              background: active ? 'var(--primary)' : 'transparent',
              color: active ? '#fff' : 'var(--text-muted)',
              fontWeight: active ? 700 : 400,
            }}
          >
            {p.labelAr}
          </button>
        );
      })}
    </div>
  );
}
