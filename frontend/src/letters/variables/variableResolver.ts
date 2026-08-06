/**
 * Letter Engine — variable resolution (Professional Document Automation v1).
 *
 * PURE. Sources in, a name→value map out. No fetching, no clock, no React.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  RESOLUTION IS LIVE ON A DRAFT AND FROZEN AT REGISTRATION.
 * ══════════════════════════════════════════════════════════════════════════
 * The same rule the barcode payload and the signature image already follow, and for
 * the same reason: a pay rise, a transfer or a renamed project must never rewrite a
 * letter that has already been issued and handed to someone.
 *
 * So `resolveVariables` has two modes, and which one applies is decided by the
 * document's status rather than by a caller's preference:
 *
 *   · DRAFT      — resolve from the live sources. `{{Salary}}` is today's salary.
 *   · REGISTERED — resolve from `frozen`, the map recorded in the registration
 *                  snapshot. The live sources are not consulted at all, so a reprint
 *                  years later reproduces the letter that was issued.
 *
 * A registered letter whose snapshot predates this feature has no frozen map. Its
 * variables resolve to nothing rather than to today's values — which is the honest
 * answer: the engine does not know what that letter said, and guessing would be worse
 * than a visible gap. In practice no such letter exists, because a letter registered
 * before this pack could not contain a variable.
 *
 * ── THE CLOCK IS AN ARGUMENT ─────────────────────────────────────────────
 * `Today` and `CurrentTime` come from `now` in the sources, never from `new Date()`
 * here. That is what makes this file testable without freezing time globally, and it
 * is the same discipline the validation context follows.
 */

import { type VariableName, VARIABLE_NAMES, findVariable } from './variableCatalog';

/** What an employee record contributes. Every field optional — records are partial. */
export interface EmployeeSource {
  readonly name?: string | null;
  readonly jobTitle?: string | null;
  readonly department?: string | null;
  readonly nationality?: string | null;
  readonly civilId?: string | null;
  readonly phone?: string | null;
  readonly email?: string | null;
  readonly managerName?: string | null;
  readonly salary?: number | null;
}

export interface ContractSource {
  readonly reference?: string | null;
}

export interface ProjectSource {
  readonly name?: string | null;
}

export interface CompanySource {
  readonly name?: string | null;
  readonly address?: string | null;
}

/** Everything resolution can read. Assembled by the composer, never fetched here. */
export interface VariableSources {
  readonly company: CompanySource;
  readonly employee: EmployeeSource | null;
  readonly contract: ContractSource | null;
  readonly project: ProjectSource | null;
  /** The signed-in user's display name. */
  readonly currentUser: string | null;
  /** The letter's own reference. `null` on a draft — there is no number yet. */
  readonly reference: string | null;
  /** The letter's issue date, `yyyy-MM-dd`. */
  readonly issueDate: string;
  /** The clock, supplied rather than read. See the header. */
  readonly now: Date;
}

/** A resolved map. `null` means "this variable has no value", never "not asked". */
export type ResolvedVariables = Readonly<Record<string, string | null>>;

/**
 * Money, in the ERP's own convention: Kuwaiti Dinar, three decimals, grouped
 * thousands. Written here rather than imported so this module stays free of UI
 * dependencies, and matched to the format every other printed document uses.
 */
function formatKwd(amount: number | null | undefined): string | null {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return null;
  return `${amount.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} د.ك`;
}

/** `yyyy-MM-dd` from a Date, in LOCAL time — the date the user is living in. */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** `HH:mm`, 24-hour. */
function formatTime(date: Date): string {
  return `${`${date.getHours()}`.padStart(2, '0')}:${`${date.getMinutes()}`.padStart(2, '0')}`;
}

/** Empty and whitespace-only both mean "no value". */
function text(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Resolve every catalogued variable from live sources.
 *
 * Returns a value for EVERY name, `null` where there is none — a total map rather
 * than a sparse one, so a caller never has to distinguish "absent from the map"
 * from "resolved to nothing". Those are the same fact and conflating them is correct.
 */
export function resolveVariables(sources: VariableSources): ResolvedVariables {
  const employee = sources.employee;

  const resolved: Record<VariableName, string | null> = {
    Company: text(sources.company.name),
    Address: text(sources.company.address),
    Department: text(employee?.department),

    Employee: text(employee?.name),
    JobTitle: text(employee?.jobTitle),
    Nationality: text(employee?.nationality),
    CivilId: text(employee?.civilId),
    Phone: text(employee?.phone),
    Email: text(employee?.email),
    Manager: text(employee?.managerName),

    Salary: formatKwd(employee?.salary),

    Contract: text(sources.contract?.reference),
    Project: text(sources.project?.name),

    Today: formatDate(sources.now),
    // The letter's OWN date, not the clock's — a letter dated last week says last
    // week. Confusing the two is the most common variable bug in every template
    // engine that offers both.
    CurrentDate: text(sources.issueDate),
    CurrentTime: formatTime(sources.now),

    Reference: text(sources.reference),
    CurrentUser: text(sources.currentUser),
  };

  return resolved;
}

/**
 * The map to render with, choosing live or frozen by the document's status.
 *
 * The decision is made HERE rather than by the caller so that no surface can
 * accidentally render a registered letter from live data. There is one path to a
 * value and it knows the rule.
 */
export function resolveForStatus(
  status: string,
  sources: VariableSources,
  frozen: ResolvedVariables | null,
): ResolvedVariables {
  if (status === 'DRAFT') return resolveVariables(sources);
  // Registered, printed, superseded, cancelled — all frozen. A snapshot that predates
  // this feature yields an empty map, which renders as unresolved rather than as
  // today's values. See the header for why that is the honest answer.
  return frozen ?? {};
}

/**
 * The subset actually used by a document, for freezing.
 *
 * Only the names the letter mentions are recorded. Freezing all eighteen would put a
 * salary into the snapshot of a letter that never asked for one, which is data
 * retention nobody requested.
 */
export function freezeUsedVariables(
  used: readonly string[],
  resolved: ResolvedVariables,
): ResolvedVariables {
  const frozen: Record<string, string | null> = {};
  for (const name of used) {
    if (!findVariable(name)) continue;
    frozen[name] = resolved[name] ?? null;
  }
  return frozen;
}

/** Names that are used but have no value — what `E18_unresolvedVariable` reports. */
export function unresolvedNames(
  used: readonly string[],
  resolved: ResolvedVariables,
): string[] {
  return used.filter((name) => findVariable(name) !== undefined && !resolved[name]);
}

/** Sample values, for the browser's preview before anything is bound. */
export function sampleValues(): ResolvedVariables {
  const samples: Record<string, string> = {};
  for (const name of VARIABLE_NAMES) samples[name] = findVariable(name)!.sampleAr;
  return samples;
}
