// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Cheque Template Persistence Migration Pack v1 — storage-layer suite.
 *
 * The defect this pack closes: cheque designer templates were the only
 * user-created data in the system living outside `manar.db`. They sat in
 * `localStorage`, so they were absent from local backup, restore, Google Drive
 * sync and any move to a new machine — and Chromium destroyed them outright
 * whenever the `userData` path or the page origin changed (a `productName`
 * rename, a reinstall, or simply dev `http://localhost:5173` vs packaged
 * `file://`). One real template was lost exactly that way.
 *
 * These tests pin the replacement end to end:
 *   - the one-time import moves EVERYTHING, losing no field and no default;
 *   - it cannot run twice, whatever the client does;
 *   - after it settles, `localStorage` is neither read nor written — the
 *     database is the only copy;
 *   - a failed import is non-destructive, so data is never dropped on the way.
 */

vi.mock('../api/client', async () => {
  const mod = await import('./helpers/fakeChequeTemplateApi');
  return { api: mod.fakeApi };
});

import { fakeTemplateDb, resetFakeTemplateDb, seedFakeTemplates } from './helpers/fakeChequeTemplateApi';
import type { FakeTemplateRow } from './helpers/fakeChequeTemplateApi';
import {
  LEGACY_STORAGE_KEY,
  ensureLegacyImport,
  resetLegacyImportForTests,
  listTemplates,
  getTemplate,
  getDefaultTemplate,
  createTemplate,
  saveTemplate,
  renameTemplate,
  deleteTemplate,
  setDefaultTemplate,
} from '../components/chequeTemplateManager/chequeDesignerStore';

const SURFACE = { widthCm: 17.8, heightCm: 8.9 };

/**
 * A field carrying EVERY property the designer persists, plus an unknown one.
 * `futureProp` is the guard against silent schema-stripping: a template must
 * survive the move with properties this version has never heard of intact.
 */
function fullField(overrides: Record<string, unknown> = {}) {
  return {
    id: 'beneficiary',
    label: 'اسم المستفيد',
    value: 'اسم المستفيد',
    x: 22.5,
    y: 31.25,
    width: 45,
    height: 6,
    rotation: 12.5,
    fontSize: 14,
    fontWeight: 700,
    textAlign: 'right' as const,
    color: '#112233',
    zIndex: 3,
    visible: true,
    binding: 'beneficiary',
    futureProp: { nested: ['a', 1, true] },
    ...overrides,
  };
}

/** Five legacy templates in the exact shape the old `localStorage` store wrote. */
const LEGACY_NAMES = ['تجربه', 'قالب A4', 'الخليج', 'نسخة احتياطية', 'قديم'];

function legacyTemplates() {
  return LEGACY_NAMES.map((name, i) => ({
    id: `tpl-legacy-${i}`,
    name,
    isDefault: name === 'قالب A4',
    surface: { ...SURFACE },
    fields: [
      fullField(),
      fullField({ id: 'date', label: 'التاريخ', binding: undefined, value: '24 / 07 / 2026', x: 70, y: 12 }),
      fullField({ id: 'amount', label: 'المبلغ', binding: undefined, value: '#1,250.000#', x: 78, y: 44 }),
    ],
    createdAt: '2026-07-24T04:02:48.954Z',
    updatedAt: `2026-07-30T13:${String(10 + i).padStart(2, '0')}:00.000Z`,
  }));
}

function seedLegacyLocalStorage(templates = legacyTemplates()) {
  localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ version: 1, templates }));
}

function dbRow(name: string): FakeTemplateRow | undefined {
  return fakeTemplateDb.templates.find((t) => t.name === name);
}

beforeEach(() => {
  localStorage.clear();
  resetFakeTemplateDb();
  resetLegacyImportForTests();
});

afterEach(() => localStorage.clear());

// ── 1. Migration: localStorage → SQLite ──────────────────────────────────────

describe('one-time migration from localStorage to the database', () => {
  it('moves every legacy template into the database', async () => {
    seedLegacyLocalStorage();
    await ensureLegacyImport();

    expect(fakeTemplateDb.templates).toHaveLength(5);
    expect(fakeTemplateDb.templates.map((t) => t.name).sort()).toEqual([...LEGACY_NAMES].sort());
  });

  it('preserves the default template — the flag survives the move', async () => {
    seedLegacyLocalStorage();
    await ensureLegacyImport();

    const defaults = fakeTemplateDb.templates.filter((t) => t.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].name).toBe('قالب A4');
    expect((await getDefaultTemplate())?.name).toBe('قالب A4');
  });

  it('preserves identity, name, surface, timestamps and EVERY field property', async () => {
    seedLegacyLocalStorage();
    await ensureLegacyImport();

    const source = legacyTemplates()[1];
    const moved = dbRow('قالب A4')!;
    expect(moved.id).toBe(source.id);
    expect(moved.surface).toEqual(SURFACE);
    expect(moved.createdAt).toBe(source.createdAt);
    expect(moved.updatedAt).toBe(source.updatedAt);
    expect(moved.fields).toEqual(source.fields);
  });

  it('carries through field properties this version does not know about', async () => {
    seedLegacyLocalStorage();
    await ensureLegacyImport();

    const moved = dbRow('قالب A4')!;
    const field = (moved.fields as Record<string, unknown>[])[0];
    expect(field.futureProp).toEqual({ nested: ['a', 1, true] });
    expect(field.rotation).toBe(12.5);
    expect(field.color).toBe('#112233');
    expect(field.zIndex).toBe(3);
  });

  it('keeps the updatedAt-descending list order the Open dialog relies on', async () => {
    seedLegacyLocalStorage();
    await ensureLegacyImport();

    const names = (await listTemplates()).map((t) => t.name);
    expect(names).toEqual([...LEGACY_NAMES].reverse());
  });

  it('imports at most one default even if the legacy store held several', async () => {
    seedLegacyLocalStorage(legacyTemplates().map((t) => ({ ...t, isDefault: true })));
    await ensureLegacyImport();

    expect(fakeTemplateDb.templates.filter((t) => t.isDefault)).toHaveLength(1);
  });

  it('does nothing at all when there is no legacy data (the normal case)', async () => {
    await ensureLegacyImport();

    expect(fakeTemplateDb.templates).toHaveLength(0);
    expect(fakeTemplateDb.requests).toHaveLength(0);
  });
});

// ── 2. Idempotency ───────────────────────────────────────────────────────────

describe('the migration cannot run twice', () => {
  it('a second run on the same page imports nothing more', async () => {
    seedLegacyLocalStorage();
    await ensureLegacyImport();
    await ensureLegacyImport();

    expect(fakeTemplateDb.templates).toHaveLength(5);
    expect(fakeTemplateDb.requests.filter((r) => r.method === 'POST')).toHaveLength(1);
  });

  it('a fresh launch with the legacy key restored still imports nothing more', async () => {
    seedLegacyLocalStorage();
    await ensureLegacyImport();

    // Simulate a relaunch: new page, memoisation gone, stale key put back by a
    // restored profile or a copied AppData folder.
    resetLegacyImportForTests();
    seedLegacyLocalStorage();
    await ensureLegacyImport();

    expect(fakeTemplateDb.templates).toHaveLength(5);
    expect(fakeTemplateDb.marker?.reason).toBe('imported');
  });

  it('never overwrites a database that already holds templates', async () => {
    seedFakeTemplates([
      { id: 'tpl-existing', name: 'موجود مسبقًا', isDefault: true, surface: SURFACE, fields: [], createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' },
    ]);
    seedLegacyLocalStorage();
    await ensureLegacyImport();

    expect(fakeTemplateDb.templates).toHaveLength(1);
    expect(fakeTemplateDb.templates[0].name).toBe('موجود مسبقًا');
    expect(fakeTemplateDb.marker?.reason).toBe('db-not-empty');
  });

  it('does not resurrect templates the user deliberately deleted after migrating', async () => {
    seedLegacyLocalStorage();
    await ensureLegacyImport();
    for (const row of [...fakeTemplateDb.templates]) await deleteTemplate(row.id);
    expect(fakeTemplateDb.templates).toHaveLength(0);

    resetLegacyImportForTests();
    seedLegacyLocalStorage();
    await ensureLegacyImport();

    expect(fakeTemplateDb.templates).toHaveLength(0);
  });
});

// ── 3. localStorage is abandoned after the move ──────────────────────────────

describe('localStorage stops being used once the database is authoritative', () => {
  it('removes the legacy key after a successful import — no second copy remains', async () => {
    seedLegacyLocalStorage();
    await ensureLegacyImport();

    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
  });

  it('removes the legacy key when the server reports the import already settled', async () => {
    fakeTemplateDb.marker = { at: '2026-08-08T00:00:00.000Z', count: 3, reason: 'imported' };
    seedLegacyLocalStorage();
    await ensureLegacyImport();

    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
    expect(fakeTemplateDb.requests.filter((r) => r.method === 'POST')).toHaveLength(0);
  });

  it('no write path touches localStorage — every mutation lands in the database only', async () => {
    const created = await createTemplate({ name: 'قالب جديد', surface: SURFACE, fields: [fullField()] });
    await saveTemplate(created.id, { surface: SURFACE, fields: [fullField({ x: 5 })] });
    await renameTemplate(created.id, 'باسم آخر');
    await setDefaultTemplate(created.id);

    expect(localStorage.length).toBe(0);
    expect(dbRow('باسم آخر')).toBeTruthy();
    expect((dbRow('باسم آخر')!.fields as Record<string, unknown>[])[0].x).toBe(5);
  });

  it('reads come from the database, not from a browser copy', async () => {
    seedFakeTemplates([
      { id: 'tpl-db', name: 'من قاعدة البيانات', isDefault: true, surface: SURFACE, fields: [fullField()], createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' },
    ]);
    // A stale browser copy claiming something else entirely must be ignored.
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ version: 1, templates: [{ id: 'tpl-ghost', name: 'شبح', isDefault: true, surface: SURFACE, fields: [] }] }));

    const def = await getDefaultTemplate();
    expect(def?.name).toBe('من قاعدة البيانات');
    expect((await listTemplates()).map((t) => t.name)).toEqual(['من قاعدة البيانات']);
    expect(fakeTemplateDb.requests.some((r) => r.url.includes('/default'))).toBe(true);
  });
});

// ── 4. Failure is non-destructive ────────────────────────────────────────────

describe('a failed migration never loses data', () => {
  it('keeps the legacy data in place when the backend is unreachable', async () => {
    seedLegacyLocalStorage();
    fakeTemplateDb.offline = true;
    await ensureLegacyImport();

    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).not.toBeNull();
    expect(fakeTemplateDb.templates).toHaveLength(0);
  });

  it('completes on a later attempt once the backend is reachable again', async () => {
    seedLegacyLocalStorage();
    fakeTemplateDb.offline = true;
    await ensureLegacyImport();

    fakeTemplateDb.offline = false;
    resetLegacyImportForTests();
    await ensureLegacyImport();

    expect(fakeTemplateDb.templates).toHaveLength(5);
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
  });

  it('a corrupt legacy payload is ignored rather than throwing', async () => {
    localStorage.setItem(LEGACY_STORAGE_KEY, '{not json');
    await expect(ensureLegacyImport()).resolves.toBeUndefined();
    expect(fakeTemplateDb.templates).toHaveLength(0);
  });
});

// ── 5. CRUD semantics preserved ──────────────────────────────────────────────

describe('template semantics are unchanged by the move', () => {
  it('the first template ever created becomes the default automatically', async () => {
    const first = await createTemplate({ name: 'الأول', surface: SURFACE, fields: [] });
    expect(first.isDefault).toBe(true);

    const second = await createTemplate({ name: 'الثاني', surface: SURFACE, fields: [] });
    expect(second.isDefault).toBe(false);
    expect((await getDefaultTemplate())?.name).toBe('الأول');
  });

  it('deleting the default promotes the most-recently-updated survivor', async () => {
    // Fake timers so each write lands on a distinct `updatedAt`; without them
    // all three creations share a millisecond and "most recently updated" has
    // no defined answer to assert on.
    vi.useFakeTimers();
    try {
      const a = await createTemplate({ name: 'أ', surface: SURFACE, fields: [] });
      vi.advanceTimersByTime(1000);
      await createTemplate({ name: 'ب', surface: SURFACE, fields: [] });
      vi.advanceTimersByTime(1000);
      const c = await createTemplate({ name: 'ج', surface: SURFACE, fields: [] });
      vi.advanceTimersByTime(1000);
      await saveTemplate(c.id, { surface: SURFACE, fields: [fullField()] }); // newest updatedAt

      await deleteTemplate(a.id);
      expect((await getDefaultTemplate())?.name).toBe('ج');
    } finally {
      vi.useRealTimers();
    }
  });

  it('setting a default does not reorder the list', async () => {
    const a = await createTemplate({ name: 'أ', surface: SURFACE, fields: [] });
    await createTemplate({ name: 'ب', surface: SURFACE, fields: [] });
    const before = (await listTemplates()).map((t) => t.name);

    await setDefaultTemplate(a.id);
    expect((await listTemplates()).map((t) => t.name)).toEqual(before);
  });

  it('reads still normalize legacy binding-less fields', async () => {
    seedLegacyLocalStorage();
    await ensureLegacyImport();

    const tpl = await getTemplate('tpl-legacy-1');
    expect(tpl?.fields.find((f) => f.id === 'date')?.binding).toBe('chequeDate');
    expect(tpl?.fields.find((f) => f.id === 'amount')?.binding).toBe('amount');
  });
});
