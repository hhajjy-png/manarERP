/**
 * Print Center — feature flags.
 *
 * PRINT_CENTER_FOUNDATION_V1 gates the new gateway. When OFF (the default in this
 * phase for anything that has not been physically verified), every caller keeps the
 * exact legacy code path it had before. This is the rollback lever: flip it off and
 * the Print Center becomes inert without a revert.
 *
 * Resolution order (first hit wins):
 *   1. `localStorage['manar:flag:PRINT_CENTER_FOUNDATION_V1']` — 'on' | 'off'.
 *      Lets an operator or QA toggle the pilot on a machine without a rebuild, and
 *      lets us turn it OFF in the field if the physical print regresses.
 *   2. Vite env `VITE_PRINT_CENTER_FOUNDATION_V1` — build-time default.
 *   3. DEFAULTS below.
 *
 * The flag is read through a function (never captured in a module-level const) so a
 * toggle takes effect on the next print without a reload.
 */

export const PRINT_CENTER_FOUNDATION_V1 = 'PRINT_CENTER_FOUNDATION_V1' as const;

type FlagName = typeof PRINT_CENTER_FOUNDATION_V1;

/**
 * Default ON: the pilot routes through the gateway, which in this phase delegates to
 * exactly the same Electron print call the page used before (see printService).
 * Physical output is therefore unchanged — the flag exists so it can be turned OFF
 * instantly if a printer disagrees.
 */
const DEFAULTS: Record<FlagName, boolean> = {
  PRINT_CENTER_FOUNDATION_V1: true,
};

function readOverride(name: FlagName): boolean | null {
  try {
    const raw = localStorage.getItem(`manar:flag:${name}`);
    if (raw === 'on') return true;
    if (raw === 'off') return false;
  } catch {
    /* storage unavailable — fall through */
  }
  try {
    const env = import.meta.env?.[`VITE_${name}`];
    if (env === 'true' || env === '1') return true;
    if (env === 'false' || env === '0') return false;
  } catch {
    /* no env — fall through */
  }
  return null;
}

export function isFlagEnabled(name: FlagName): boolean {
  return readOverride(name) ?? DEFAULTS[name];
}

/** Operator/QA escape hatch — used by no UI in this phase; call from the console. */
export function setFlagOverride(name: FlagName, value: boolean | null): void {
  try {
    if (value === null) localStorage.removeItem(`manar:flag:${name}`);
    else localStorage.setItem(`manar:flag:${name}`, value ? 'on' : 'off');
  } catch {
    /* ignore */
  }
}
