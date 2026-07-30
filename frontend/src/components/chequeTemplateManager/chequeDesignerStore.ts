/**
 * Cheque Template Manager — storage layer (Cheque Template Manager v1).
 *
 * A COMPLETELY INDEPENDENT persistence mechanism for the Cheque Template
 * Designer. It uses the browser/Electron `localStorage` under the dedicated
 * namespace `chequeDesigner.templates.v1` and NEVER touches Classic
 * Calibration's storage (`cheque.template.*` Settings), the Settings API, the
 * database, or the Professional module.
 *
 * Only the template LAYOUT is persisted (surface size + fields with their
 * positions, sizes, fonts, alignment, rotation, styling, z-order, visibility).
 * No runtime cheque values are stored here.
 *
 * The module exposes a small, storage-agnostic CRUD surface so the backing
 * store could later be swapped (e.g. to a backend `chequeDesigner.*` namespace)
 * without changing the manager UI.
 */
import type { DesignerField, DesignerSurfaceSpec } from '../../modules/chequeTemplateDesigner';
import { normalizeFieldBindings } from '../../modules/chequeTemplateRuntime';

const STORAGE_KEY = 'chequeDesigner.templates.v1';

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

interface StoreShape {
  version: 1;
  templates: StoredChequeTemplate[];
}

function nowIso(): string {
  return new Date().toISOString();
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

function readStore(): StoreShape {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, templates: [] };
    const parsed = JSON.parse(raw) as StoreShape;
    if (!parsed || !Array.isArray(parsed.templates)) return { version: 1, templates: [] };
    return { version: 1, templates: parsed.templates.map(normalizeStoredTemplate) };
  } catch {
    return { version: 1, templates: [] };
  }
}

function writeStore(store: StoreShape): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* quota exceeded / storage unavailable — degrade to in-memory for this session */
  }
}

function applyDefault(store: StoreShape, id: string): void {
  for (const t of store.templates) t.isDefault = t.id === id;
}

/** All templates, newest-updated first. */
export function listTemplates(): StoredChequeTemplate[] {
  return readStore().templates.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getTemplate(id: string): StoredChequeTemplate | null {
  return readStore().templates.find((t) => t.id === id) ?? null;
}

export function getDefaultTemplate(): StoredChequeTemplate | null {
  return readStore().templates.find((t) => t.isDefault) ?? null;
}

export interface NewTemplateInput {
  name: string;
  surface: DesignerSurfaceSpec;
  fields: DesignerField[];
  makeDefault?: boolean;
}

/** Create a new stored template (used by "Save As"). The first-ever template becomes default automatically. */
export function createTemplate(input: NewTemplateInput): StoredChequeTemplate {
  const store = readStore();
  const ts = nowIso();
  const record: StoredChequeTemplate = {
    id: `tpl-${crypto.randomUUID()}`,
    name: input.name,
    isDefault: false,
    surface: input.surface,
    fields: input.fields,
    createdAt: ts,
    updatedAt: ts,
  };
  store.templates.push(record);
  if (input.makeDefault || store.templates.length === 1) {
    applyDefault(store, record.id);
    record.isDefault = true;
  }
  writeStore(store);
  return record;
}

export interface SaveTemplateInput {
  name?: string;
  surface: DesignerSurfaceSpec;
  fields: DesignerField[];
}

/** Persist the current layout onto an existing template (used by "Save"). */
export function saveTemplate(id: string, input: SaveTemplateInput): StoredChequeTemplate | null {
  const store = readStore();
  const rec = store.templates.find((t) => t.id === id);
  if (!rec) return null;
  rec.surface = input.surface;
  rec.fields = input.fields;
  if (input.name !== undefined) rec.name = input.name;
  rec.updatedAt = nowIso();
  writeStore(store);
  return rec;
}

export function renameTemplate(id: string, name: string): StoredChequeTemplate | null {
  const store = readStore();
  const rec = store.templates.find((t) => t.id === id);
  if (!rec) return null;
  rec.name = name;
  rec.updatedAt = nowIso();
  writeStore(store);
  return rec;
}

export function deleteTemplate(id: string): void {
  const store = readStore();
  const wasDefault = store.templates.find((t) => t.id === id)?.isDefault ?? false;
  store.templates = store.templates.filter((t) => t.id !== id);
  // If the default was removed, promote the most-recently-updated survivor.
  if (wasDefault && store.templates.length > 0) {
    const newest = store.templates.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    applyDefault(store, newest.id);
  }
  writeStore(store);
}

export function setDefaultTemplate(id: string): void {
  const store = readStore();
  if (!store.templates.some((t) => t.id === id)) return;
  applyDefault(store, id);
  writeStore(store);
}
