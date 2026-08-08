/**
 * Cheque Template Manager — storage layer (Cheque Template Persistence
 * Migration Pack v1).
 *
 * SQLite is the SINGLE SOURCE OF TRUTH for cheque designer templates. Every
 * read and every write in this module goes to `/api/cheque-designer-templates`
 * and therefore to `manar.db`. There is no second copy of the data anywhere.
 *
 * WHAT THIS REPLACES — and why
 * ───────────────────────────
 * Templates used to live in `localStorage` under `chequeDesigner.templates.v1`,
 * the only user-created data in the system stored outside the database. That
 * made them the only user-created data that did NOT travel with:
 *   - local backup and restore,
 *   - Google Drive sync,
 *   - a move to a new machine,
 * and it made them silently destroyable by things that have nothing to do with
 * cheques: Chromium partitions `localStorage` by `userData` path AND by page
 * origin, so renaming `productName` (which moves `userData`), reinstalling, or
 * simply switching between the dev server (`http://localhost:5173`) and the
 * packaged app (`file://`) presented the app with a brand-new, empty store.
 * That is exactly how a saved template was lost. Storing them in `manar.db`
 * removes the whole class of failure at its root — the four integration paths
 * above operate on the database file itself, so they carry the templates with
 * ZERO additional code.
 *
 * LEGACY IMPORT — one time, then never again
 * ──────────────────────────────────────────
 * `ensureLegacyImport()` runs once per page load and is awaited by every entry
 * point below, so no read or write can observe a half-migrated state. It is a
 * no-op the instant the server reports the import already settled — which is
 * the normal case from the second launch onwards. See the function for the
 * idempotency argument. After a settled import the legacy key is removed, so
 * two copies of the data never coexist.
 *
 * The API is asynchronous because the store is now remote; that is the only
 * change visible to callers. Ordering, default-template semantics, and the
 * shape of `StoredChequeTemplate` are unchanged.
 */
import type { DesignerField, DesignerSurfaceSpec } from '../../modules/chequeTemplateDesigner';
import { normalizeFieldBindings } from '../../modules/chequeTemplateRuntime';
import { api } from '../../api/client';

/** The legacy browser-storage key. Read exactly once, for the one-time import, then deleted. */
export const LEGACY_STORAGE_KEY = 'chequeDesigner.templates.v1';

const BASE = '/cheque-designer-templates';

export interface StoredChequeTemplate {
  id: string;
  name: string;
  isDefault: boolean;
  /** Physical surface the layout maps onto (cm). */
  surface: DesignerSurfaceSpec;
  /** The full field layout — the only thing persisted. No runtime values. */
  fields: DesignerField[];
  createdAt: string;
  updatedAt: string;
}

interface LegacyStoreShape {
  version: 1;
  templates: StoredChequeTemplate[];
}

/**
 * Load-time migration for LEGACY templates — non-destructive, in memory.
 *
 * Templates saved before the Data Binding pack shipped have no `binding` on any
 * field. Because the date field's id is `'date'` while its canonical semantic key
 * is `'chequeDate'`, such a template silently printed its design-time sample date
 * instead of the real cheque date. Every read therefore hands out fields with
 * explicit bindings restored, so:
 *   - the designer, live preview and print pipeline all see the corrected shape,
 *   - the next ORDINARY save persists it (no forced write, no template rewritten
 *     behind the user's back, nothing deleted or recreated),
 *   - a field the user deliberately marked `'none'` / `'custom'` is left alone.
 *
 * A template whose fields are missing or malformed degrades to an empty field
 * list rather than throwing, exactly as the surrounding parse already did.
 */
function normalizeStoredTemplate(record: StoredChequeTemplate): StoredChequeTemplate {
  if (!Array.isArray(record.fields)) return { ...record, fields: [] };
  const fields = normalizeFieldBindings(record.fields);
  // Preserve reference identity when nothing changed, so React memoisation and
  // the designer's change detection do not see a phantom edit.
  return fields.every((f, i) => f === record.fields[i]) ? record : { ...record, fields };
}

/**
 * A payload is a template only if it actually looks like one.
 *
 * Without this check any truthy body — `[]`, `{}`, an error envelope — would be
 * handed on as a template, and the print pipeline would then read `undefined`
 * off its `surface` and die mid-print. "No default template" is a state the
 * system already handles cleanly; a malformed response must resolve to that
 * state rather than to a fake template.
 */
function isTemplateShape(payload: unknown): payload is StoredChequeTemplate {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return false;
  const candidate = payload as Partial<StoredChequeTemplate>;
  return typeof candidate.id === 'string' && typeof candidate.surface === 'object' && candidate.surface !== null;
}

function unwrap(payload: unknown): StoredChequeTemplate {
  return normalizeStoredTemplate(payload as StoredChequeTemplate);
}

function unwrapOrNull(payload: unknown): StoredChequeTemplate | null {
  return isTemplateShape(payload) ? unwrap(payload) : null;
}

// ── One-time legacy import ───────────────────────────────────────────────────

let legacyImportPromise: Promise<void> | null = null;
let legacyRecoveryPromise: Promise<void> | null = null;

/** Read whatever the legacy browser store still holds. Never throws. */
function readLegacyStore(): StoredChequeTemplate[] {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LegacyStoreShape;
    if (!parsed || !Array.isArray(parsed.templates)) return [];
    return parsed.templates.filter((t) => t && typeof t.id === 'string' && typeof t.name === 'string');
  } catch {
    return [];
  }
}

function dropLegacyStore(): void {
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    /* storage unavailable — nothing to drop */
  }
}

/**
 * Move any templates still sitting in `localStorage` into the database, once.
 *
 * Idempotency does not rely on this client behaving well. The server records a
 * durable marker in `settings` the first time the question is asked and refuses
 * every later attempt, and it refuses outright if the templates table is not
 * empty — so a database that already has templates is never overwritten by a
 * stale browser store. This function therefore cannot double-import even if it
 * runs on every launch, on several machines, or concurrently.
 *
 * Failure is deliberately silent and NON-destructive: the legacy key is dropped
 * only after the server has confirmed the import is settled. If the user lacks
 * `settings.update`, or the backend is momentarily unavailable, the data simply
 * stays put and the next attempt — or the next admin login — completes it.
 */
export function ensureLegacyImport(): Promise<void> {
  legacyImportPromise ??= (async () => {
    try {
      const legacy = readLegacyStore();
      if (legacy.length === 0) {
        // Nothing to move. Still clear an empty leftover so the key does not
        // linger as a phantom "second copy" of an empty store.
        dropLegacyStore();
        // The CURRENT browser profile has nothing — but a PREVIOUS `userData`
        // folder still might (Legacy Cheque Template Recovery Pack v1).
        await ensureLegacyRecovery();
        return;
      }
      const status = await api.get(`${BASE}/legacy-import`);
      if (status.data?.data?.done === true) {
        dropLegacyStore();
        return;
      }
      const res = await api.post(`${BASE}/legacy-import`, {
        templates: legacy.map((t) => ({
          id: t.id,
          name: t.name,
          isDefault: Boolean(t.isDefault),
          surface: t.surface,
          fields: Array.isArray(t.fields) ? t.fields : [],
          ...(t.createdAt ? { createdAt: t.createdAt } : {}),
          ...(t.updatedAt ? { updatedAt: t.updatedAt } : {}),
        })),
      });
      // Any settled outcome — imported, already-migrated, or db-not-empty — means
      // the database is now authoritative and the browser copy must go.
      if (res.data?.success) dropLegacyStore();
    } catch {
      /* leave the legacy data untouched; a later attempt will complete it */
    }
  })();
  return legacyImportPromise;
}

/** Test seam: forget the memoised import so a fresh scenario can run it again. */
export function resetLegacyImportForTests(): void {
  legacyImportPromise = null;
}

// ── One-time recovery from a PREVIOUS userData folder ────────────────────────

/**
 * The read-only main-process bridge, when running inside Electron. Absent in a
 * plain browser (and in tests that do not install it), in which case recovery
 * is simply not attempted — there is no previous profile to read there.
 */
interface LegacyRecoveryBridge {
  scanLegacyChequeTemplates(): Promise<{
    found: {
      templates: unknown[];
      source: { userDataName: string; leveldbPath: string; origin: string; file: string };
    } | null;
    inspected: { path: string; outcome: string }[];
  }>;
}

function recoveryBridge(): LegacyRecoveryBridge | null {
  const bridge = (window as unknown as { manar?: Partial<LegacyRecoveryBridge> }).manar;
  return typeof bridge?.scanLegacyChequeTemplates === 'function' ? (bridge as LegacyRecoveryBridge) : null;
}

/**
 * Recover cheque templates stranded in a PREVIOUS `userData` folder, once.
 *
 * Templates created before `productName` was introduced live in a different
 * Chromium partition entirely — a different `userData` path, usually under a
 * different page origin — so `localStorage` in the running app cannot see them
 * at all. The main process reads them directly (read-only, no LevelDB handle,
 * no lock, no write) and they are imported through the same database service
 * every other template goes through.
 *
 * The server is asked FIRST whether recovery is even eligible, so the common
 * case — a database that already has templates, or has already settled either
 * one-time path — never opens a single file on disk. Every precondition is then
 * re-checked server-side inside the importing transaction, so this client is
 * not trusted to have got it right.
 *
 * Nothing here can fail loudly: a missing bridge, an unreadable store, a corrupt
 * payload, a refusal or a network error all end the same way — the application
 * carries on exactly as if no legacy data existed.
 */
export function ensureLegacyRecovery(): Promise<void> {
  legacyRecoveryPromise ??= (async () => {
    try {
      const bridge = recoveryBridge();
      if (!bridge) return;

      const status = await api.get(`${BASE}/legacy-recovery`);
      if (status.data?.data?.eligible !== true) return;

      const scan = await bridge.scanLegacyChequeTemplates();
      if (!scan?.found || scan.found.templates.length === 0) return;

      await api.post(`${BASE}/legacy-recovery`, {
        templates: scan.found.templates,
        source: scan.found.source,
      });
    } catch {
      /* recovery is opportunistic — never let it disturb ordinary use */
    }
  })();
  return legacyRecoveryPromise;
}

/** Test seam: forget the memoised recovery so a fresh scenario can run it again. */
export function resetLegacyRecoveryForTests(): void {
  legacyRecoveryPromise = null;
}

// ── CRUD surface (unchanged semantics, now asynchronous) ─────────────────────

/** All templates, newest-updated first. */
export async function listTemplates(): Promise<StoredChequeTemplate[]> {
  await ensureLegacyImport();
  const res = await api.get(BASE);
  const rows: unknown[] = Array.isArray(res.data?.data) ? res.data.data : [];
  return rows.filter(isTemplateShape).map(unwrap);
}

export async function getTemplate(id: string): Promise<StoredChequeTemplate | null> {
  await ensureLegacyImport();
  try {
    const res = await api.get(`${BASE}/${encodeURIComponent(id)}`);
    return unwrapOrNull(res.data?.data);
  } catch {
    return null;
  }
}

export async function getDefaultTemplate(): Promise<StoredChequeTemplate | null> {
  await ensureLegacyImport();
  const res = await api.get(`${BASE}/default`);
  return unwrapOrNull(res.data?.data);
}

export interface NewTemplateInput {
  name: string;
  surface: DesignerSurfaceSpec;
  fields: DesignerField[];
  makeDefault?: boolean;
}

/** Create a new stored template (used by "Save As"). The first-ever template becomes default automatically. */
export async function createTemplate(input: NewTemplateInput): Promise<StoredChequeTemplate> {
  await ensureLegacyImport();
  const res = await api.post(BASE, input);
  return unwrap(res.data.data);
}

export interface SaveTemplateInput {
  name?: string;
  surface: DesignerSurfaceSpec;
  fields: DesignerField[];
}

/** Persist the current layout onto an existing template (used by "Save"). */
export async function saveTemplate(id: string, input: SaveTemplateInput): Promise<StoredChequeTemplate | null> {
  await ensureLegacyImport();
  try {
    const res = await api.put(`${BASE}/${encodeURIComponent(id)}`, input);
    return unwrap(res.data.data);
  } catch {
    return null;
  }
}

export async function renameTemplate(id: string, name: string): Promise<StoredChequeTemplate | null> {
  await ensureLegacyImport();
  try {
    const res = await api.patch(`${BASE}/${encodeURIComponent(id)}/name`, { name });
    return unwrap(res.data.data);
  } catch {
    return null;
  }
}

export async function deleteTemplate(id: string): Promise<void> {
  await ensureLegacyImport();
  await api.delete(`${BASE}/${encodeURIComponent(id)}`);
}

export async function setDefaultTemplate(id: string): Promise<void> {
  await ensureLegacyImport();
  await api.patch(`${BASE}/${encodeURIComponent(id)}/default`);
}
