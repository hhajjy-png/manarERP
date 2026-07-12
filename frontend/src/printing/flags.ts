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

// ── Phase 2 — per-document migration flags ──────────────────────────────────────
//
// FLAG HIERARCHY: a document uses the Print Center only when the MASTER flag AND its
// own flag are both on (`isPhase2Enabled`). The master is the single kill switch; the
// per-document flags let each migration be rolled out — and rolled back — on its own
// physical-print verification, which is exactly the strangler discipline this repo
// already follows for every release.
//
// DEFAULTS: the master is ON (the machinery is safe and inert without a document
// flag), and every per-document flag is OFF until its physical print gate passes.
// Receipt Voucher is included in that rule: its Phase 2 flag ships OFF, so on first
// launch it still uses the reviewed Phase 1 path. Nothing changes for any user until
// someone deliberately turns a document on.
export const PRINT_CENTER_PHASE2 = 'PRINT_CENTER_PHASE2' as const;
export const PRINT_CENTER_PHASE2_RECEIPT_VOUCHER = 'PRINT_CENTER_PHASE2_RECEIPT_VOUCHER' as const;
// Phase 2B — independent per-document flags. Both ship OFF, and a failed or uncertain
// style capture must never auto-enable them.
export const PRINT_CENTER_PHASE2_INVOICE = 'PRINT_CENTER_PHASE2_INVOICE' as const;
export const PRINT_CENTER_PHASE2_QUOTATION = 'PRINT_CENTER_PHASE2_QUOTATION' as const;

/**
 * Legacy Print Preview Overlay — Phase 1 rollout across the FormLayout forms.
 *
 * Three flags, not thirteen: one master kill switch and two cohesive groups, so a
 * rollout (or a rollback) is one decision per group rather than one per form. The
 * master enables nothing by itself — a form previews only when the master AND its
 * group are on, exactly like the Phase 2 document flags.
 *
 * ALL OFF on ship. With them off the Print button is wired to `doPrint` directly,
 * with no interceptor in between — byte-for-byte the behaviour that exists today.
 */
export const PRINT_PREVIEW_LEGACY_FORMS_V1 = 'PRINT_PREVIEW_LEGACY_FORMS_V1' as const;
/** سند الصرف · طلب الشراء */
export const PRINT_PREVIEW_LEGACY_FORMS_FINANCE = 'PRINT_PREVIEW_LEGACY_FORMS_FINANCE' as const;
/** خطابات ونماذج الموارد البشرية الثمانية */
export const PRINT_PREVIEW_LEGACY_FORMS_HR = 'PRINT_PREVIEW_LEGACY_FORMS_HR' as const;

export type FlagName =
  | typeof PRINT_CENTER_FOUNDATION_V1
  | typeof PRINT_CENTER_PHASE2
  | typeof PRINT_CENTER_PHASE2_RECEIPT_VOUCHER
  | typeof PRINT_CENTER_PHASE2_INVOICE
  | typeof PRINT_CENTER_PHASE2_QUOTATION
  | typeof PRINT_PREVIEW_LEGACY_FORMS_V1
  | typeof PRINT_PREVIEW_LEGACY_FORMS_FINANCE
  | typeof PRINT_PREVIEW_LEGACY_FORMS_HR;

/** A document is on the Print Center only when master AND its own flag are enabled. */
export function isPhase2Enabled(documentFlag: FlagName): boolean {
  return isFlagEnabled(PRINT_CENTER_PHASE2) && isFlagEnabled(documentFlag);
}

/** نموذج يعاين قبل الطباعة فقط حين يكون العلم الرئيسي **ومجموعته** مفعّلين. */
export function isLegacyFormsPreviewEnabled(groupFlag: FlagName): boolean {
  return isFlagEnabled(PRINT_PREVIEW_LEGACY_FORMS_V1) && isFlagEnabled(groupFlag);
}

/**
 * Default ON: the pilot routes through the gateway, which in this phase delegates to
 * exactly the same Electron print call the page used before (see printService).
 * Physical output is therefore unchanged — the flag exists so it can be turned OFF
 * instantly if a printer disagrees.
 */
const DEFAULTS: Record<FlagName, boolean> = {
  PRINT_CENTER_FOUNDATION_V1: true,
  // Master kill switch: on. It enables nothing by itself.
  PRINT_CENTER_PHASE2: true,
  // OFF until the physical print gate passes. Conservative by policy — no user's
  // printing behaviour changes on upgrade.
  PRINT_CENTER_PHASE2_RECEIPT_VOUCHER: false,
  // Phase 2B — OFF until side-by-side fidelity is proven against the legacy output.
  // These documents carry their styling in stylesheets (CSS Modules, Template Studio,
  // designer overrides), so their composition depends on style capture; until a human
  // has compared legacy vs preview vs saved PDF vs physical print, they stay off.
  PRINT_CENTER_PHASE2_INVOICE: false,
  PRINT_CENTER_PHASE2_QUOTATION: false,
  // Legacy Preview Overlay — OFF, including the master: the rollout changes no user's
  // behaviour on upgrade. Enabling the master alone still previews nothing.
  PRINT_PREVIEW_LEGACY_FORMS_V1: false,
  PRINT_PREVIEW_LEGACY_FORMS_FINANCE: false,
  PRINT_PREVIEW_LEGACY_FORMS_HR: false,
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
