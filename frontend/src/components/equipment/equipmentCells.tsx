import { ToneCell, CellTone } from '../explorer/ToneCell';

/**
 * Equipment Table Visual Consistency Pack — presentation-only cell renderer
 * for the registration "remaining period" column. Renders through the exact
 * same shared `ToneCell` the Employee table uses (../explorer/ToneCell.tsx +
 * toneCell.css) — soft pastel tint + thin colour accent, no badge, no icon —
 * so there is exactly one green/amber/red system across the app, never a
 * second, independently-styled copy.
 *
 * Reads the SAME `registration.expired` / `registration.expiringSoon` flags
 * the previous pill rendering did. No expiry calculation changes here.
 */
interface RegistrationInfo {
  expiry?: string | null;
  expired?: boolean;
  expiringSoon?: boolean;
  remainingText?: string;
}

function registrationTone(reg?: RegistrationInfo | null): CellTone | null {
  if (!reg?.expiry) return null;
  if (reg.expired) return 'red';
  if (reg.expiringSoon) return 'amber';
  return 'green';
}

export function RegRemainingCell({ registration }: { registration?: RegistrationInfo | null }) {
  const tone = registrationTone(registration);
  return <ToneCell tone={tone}>{registration?.expiry ? (registration.remainingText ?? '—') : '—'}</ToneCell>;
}
