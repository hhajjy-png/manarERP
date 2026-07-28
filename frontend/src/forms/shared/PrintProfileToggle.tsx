import { PRINT_PROFILES, ProfileId, SELECTABLE_PROFILE_IDS } from './printProfiles';

interface Props {
  profile: ProfileId;
  onChange: (p: ProfileId) => void;
  /**
   * Opt-in: profile ids to omit from this instance of the toggle, even though
   * they are otherwise `selectable`. Off by default (empty) — every existing
   * caller keeps showing the full `SELECTABLE_PROFILE_IDS` set unchanged.
   * Used by Employment Contract to keep the "Ready Paper" profile off its toggle.
   */
  excludeIds?: ProfileId[];
}

export default function PrintProfileToggle({ profile, onChange, excludeIds = [] }: Props) {
  const visibleIds = SELECTABLE_PROFILE_IDS.filter((id) => !excludeIds.includes(id));
  return (
    <div
      role="radiogroup"
      aria-label="Print Profile"
      style={{
        display: 'flex',
        gap: 0,
        alignItems: 'center',
        border: '1px solid var(--border)',
        borderRadius: 6,
        overflow: 'hidden',
      }}
    >
      {visibleIds.map((id) => {
        const p = PRINT_PROFILES[id];
        const active = profile === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={active ? 'true' : 'false'}
            role="radio"
            aria-checked={active}
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
