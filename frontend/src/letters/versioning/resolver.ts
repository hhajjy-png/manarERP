/**
 * Letter Engine — the version resolver contract (INV-9).
 *
 * WHAT THIS IS
 * ────────────
 * A generic registry that maps a version number on one axis to the implementation
 * that version's documents must be rendered with. It is the mechanism that makes
 * "a document registered under version n renders under version n forever" true in
 * code rather than in prose.
 *
 * WHAT THIS PACK REGISTERS: NOTHING.
 * P0 ships the contract only. The implementations it will eventually address do not
 * exist yet and belong to later packs:
 *
 *   · layout  implementations → P3 (geometry) and P4 (pagination)
 *   · barcode payload builders → P6
 *   · template resolution      → already data-only; see `registry/templateRegistry`
 *
 * Registering an implementation here from P0 would be future-pack leakage. The empty
 * resolver is the correct P0 state, and `resolve()` failing loudly on an unregistered
 * version is the correct behaviour until those packs land.
 *
 * WHY `resolve` THROWS RATHER THAN FALLING BACK
 * ─────────────────────────────────────────────
 * A silent fallback to LATEST is the single most dangerous behaviour this module
 * could have: it would render a historical document under today's rules and produce
 * a page that no longer matches the copy in the recipient's file, with no error and
 * no trace. Under INV-9 that is a correctness failure, not a degradation — so an
 * unresolvable version is always an exception.
 */

import { type EngineVersion, type VersionAxis, isKnownVersion } from './versions';

/**
 * A resolver for one axis. Later packs create one per axis and register their
 * implementations into it at module load.
 */
export interface VersionResolver<T> {
  readonly axis: VersionAxis;
  /**
   * Bind an implementation to a version. Throws if the version is not declared in
   * `versions.ts`, or if that version already has an implementation — a silent
   * overwrite would change how already-issued documents render.
   */
  register(version: EngineVersion, implementation: T): void;
  /** The implementation for this version. Throws if none is registered. */
  resolve(version: EngineVersion): T;
  /** Non-throwing lookup, for callers that can legitimately handle absence. */
  find(version: EngineVersion): T | undefined;
  /** Is an implementation bound to this version? */
  has(version: EngineVersion): boolean;
  /** Versions with a registered implementation, ascending. */
  registeredVersions(): readonly EngineVersion[];
}

/**
 * Create a resolver for one axis.
 *
 * @param axis  which version axis this resolver addresses
 * @param label human-readable name used in error messages (e.g. "barcode payload builder")
 */
export function createVersionResolver<T>(axis: VersionAxis, label: string): VersionResolver<T> {
  const implementations = new Map<EngineVersion, T>();

  return {
    axis,

    register(version: EngineVersion, implementation: T): void {
      if (!isKnownVersion(axis, version)) {
        throw new Error(
          `[LetterEngine] Cannot register a ${label} for undeclared ${axis} version ${version}. ` +
            `Declare it in letters/versioning/versions.ts first.`,
        );
      }
      if (implementations.has(version)) {
        throw new Error(
          `[LetterEngine] A ${label} is already registered for ${axis} version ${version}. ` +
            `Overwriting it would change how already-issued documents render (INV-9).`,
        );
      }
      implementations.set(version, implementation);
    },

    resolve(version: EngineVersion): T {
      const found = implementations.get(version);
      if (found === undefined) {
        throw new Error(
          `[LetterEngine] No ${label} registered for ${axis} version ${version}. ` +
            `Refusing to fall back to a different version — a historical document must never ` +
            `be rendered under another version's rules (INV-9).`,
        );
      }
      return found;
    },

    find(version: EngineVersion): T | undefined {
      return implementations.get(version);
    },

    has(version: EngineVersion): boolean {
      return implementations.has(version);
    },

    registeredVersions(): readonly EngineVersion[] {
      return [...implementations.keys()].sort((a, b) => a - b);
    },
  };
}
