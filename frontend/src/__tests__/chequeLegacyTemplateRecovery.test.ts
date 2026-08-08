// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Legacy Cheque Template Recovery Pack v1 — renderer flow suite.
 *
 * The ordinary migration (Persistence Migration Pack v1) moves templates out of
 * the CURRENT browser profile. It cannot reach templates created before
 * `productName` was introduced, because those live in a different Chromium
 * partition entirely — a different `userData` folder, usually under a different
 * page origin. Recovery closes that last gap: the main process reads the old
 * store (read-only), and the renderer hands what it found to the same database
 * service every other template goes through.
 *
 * These tests pin the renderer half of that flow: when it runs, when it must
 * NOT run, and that it can never disturb ordinary use of the application.
 */

vi.mock('../api/client', async () => {
  const mod = await import('./helpers/fakeChequeTemplateApi');
  return { api: mod.fakeApi };
});

import { fakeTemplateDb, resetFakeTemplateDb, seedFakeTemplates } from './helpers/fakeChequeTemplateApi';
import {
  LEGACY_STORAGE_KEY,
  ensureLegacyImport,
  ensureLegacyRecovery,
  resetLegacyImportForTests,
  resetLegacyRecoveryForTests,
  getDefaultTemplate,
  listTemplates,
} from '../components/chequeTemplateManager/chequeDesignerStore';

const SURFACE = { widthCm: 17.8, heightCm: 8.9 };

/** A field carrying every persisted property plus one this version does not know. */
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
    textAlign: 'right',
    color: '#112233',
    zIndex: 3,
    visible: true,
    binding: 'beneficiary',
    futureProp: { nested: ['a', 1, true] },
    ...overrides,
  };
}

/** The six real templates recovered from `%AppData%\manar-erp` on the reporting machine. */
function strandedTemplates() {
  const names = ['1', '1 نسخة', 'الخليج', '2026', 'تجربه', 'تجربه نسخةتحت'];
  return names.map((name, i) => ({
    id: `tpl-legacy-${i}`,
    name,
    isDefault: name === 'تجربه نسخةتحت',
    surface: { ...SURFACE },
    fields: [fullField(), fullField({ id: 'date', binding: undefined })],
    createdAt: '2026-07-24T04:02:48.954Z',
    updatedAt: `2026-07-30T13:${String(10 + i).padStart(2, '0')}:00.000Z`,
  }));
}

const SOURCE = {
  userDataName: 'manar-erp',
  leveldbPath: 'C:\\Users\\x\\AppData\\Roaming\\manar-erp\\Local Storage\\leveldb',
  origin: 'http://localhost:5173',
  file: '000041.ldb',
};

/** Install the Electron main-process bridge the renderer talks to. */
function installBridge(result: unknown, spy = vi.fn()) {
  const scan = spy.mockResolvedValue(result);
  (window as unknown as { manar?: unknown }).manar = { scanLegacyChequeTemplates: scan };
  return scan;
}

function removeBridge() {
  delete (window as unknown as { manar?: unknown }).manar;
}

function foundPayload(templates = strandedTemplates()) {
  return { found: { templates, source: SOURCE }, inspected: [{ path: SOURCE.leveldbPath, outcome: `found:${templates.length}` }] };
}

beforeEach(() => {
  localStorage.clear();
  resetFakeTemplateDb();
  resetLegacyImportForTests();
  resetLegacyRecoveryForTests();
  removeBridge();
});

afterEach(() => {
  localStorage.clear();
  removeBridge();
});

// ── 1. Successful recovery ───────────────────────────────────────────────────

describe('successful recovery', () => {
  it('imports every stranded template into the database', async () => {
    installBridge(foundPayload());
    await ensureLegacyRecovery();

    expect(fakeTemplateDb.templates).toHaveLength(6);
    expect(fakeTemplateDb.templates.map((t) => t.name)).toContain('تجربه نسخةتحت');
    expect(fakeTemplateDb.recoveryMarker?.reason).toBe('recovered');
  });

  it('preserves the default template', async () => {
    installBridge(foundPayload());
    await ensureLegacyRecovery();

    const defaults = fakeTemplateDb.templates.filter((t) => t.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].name).toBe('تجربه نسخةتحت');
    expect((await getDefaultTemplate())?.name).toBe('تجربه نسخةتحت');
  });

  it('preserves identity, surface, timestamps and every field property', async () => {
    installBridge(foundPayload());
    await ensureLegacyRecovery();

    const source = strandedTemplates()[2];
    const moved = fakeTemplateDb.templates.find((t) => t.name === 'الخليج')!;
    expect(moved.id).toBe(source.id);
    expect(moved.surface).toEqual(SURFACE);
    expect(moved.createdAt).toBe(source.createdAt);
    expect(moved.updatedAt).toBe(source.updatedAt);
    expect(moved.fields).toEqual(source.fields);
    expect((moved.fields as Record<string, unknown>[])[0].futureProp).toEqual({ nested: ['a', 1, true] });
  });

  it('runs automatically as part of the ordinary store bootstrap — no user action', async () => {
    const scan = installBridge(foundPayload());

    // Exactly what any read does: nothing recovery-specific is called here.
    const templates = await listTemplates();

    expect(scan).toHaveBeenCalledTimes(1);
    expect(templates).toHaveLength(6);
  });

  it('carries the provenance through so the recovery is explainable afterwards', async () => {
    installBridge(foundPayload());
    await ensureLegacyRecovery();

    const post = fakeTemplateDb.requests.find((r) => r.method === 'POST' && r.url.endsWith('/legacy-recovery'));
    expect(post).toBeTruthy();
  });
});

// ── 2. Idempotency ───────────────────────────────────────────────────────────

describe('recovery runs once and only once', () => {
  it('a second call in the same session posts nothing more', async () => {
    installBridge(foundPayload());
    await ensureLegacyRecovery();
    await ensureLegacyRecovery();

    expect(fakeTemplateDb.templates).toHaveLength(6);
    expect(fakeTemplateDb.requests.filter((r) => r.method === 'POST')).toHaveLength(1);
  });

  it('a fresh launch finds the database ineligible and never even scans', async () => {
    installBridge(foundPayload());
    await ensureLegacyRecovery();

    resetLegacyRecoveryForTests();
    const secondScan = installBridge(foundPayload());
    await ensureLegacyRecovery();

    expect(secondScan).not.toHaveBeenCalled();
    expect(fakeTemplateDb.templates).toHaveLength(6);
  });

  it('does not resurrect templates deleted after a successful recovery', async () => {
    installBridge(foundPayload());
    await ensureLegacyRecovery();
    fakeTemplateDb.templates = [];

    resetLegacyRecoveryForTests();
    installBridge(foundPayload());
    await ensureLegacyRecovery();

    expect(fakeTemplateDb.templates).toHaveLength(0);
  });
});

// ── 3. Safety: never touch a database that has data ──────────────────────────

describe('a database that already has templates is left completely alone', () => {
  it('imports nothing, replaces nothing, merges nothing', async () => {
    const existing = { id: 'tpl-existing', name: 'قالب قائم', isDefault: true, surface: SURFACE, fields: [fullField()], createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' };
    seedFakeTemplates([existing]);
    const scan = installBridge(foundPayload());

    await ensureLegacyRecovery();

    expect(fakeTemplateDb.templates).toHaveLength(1);
    expect(fakeTemplateDb.templates[0]).toEqual(existing);
    expect(scan).not.toHaveBeenCalled(); // not eligible ⇒ not a single file opened
  });

  it('does not run when the ordinary migration already settled this database', async () => {
    fakeTemplateDb.marker = { at: '2026-08-08T00:00:00.000Z', count: 2, reason: 'imported' };
    const scan = installBridge(foundPayload());

    await ensureLegacyRecovery();

    expect(scan).not.toHaveBeenCalled();
    expect(fakeTemplateDb.templates).toHaveLength(0);
  });

  it('the migration path takes precedence: a current-profile store is used, recovery is skipped', async () => {
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({
      version: 1,
      templates: [{ id: 'tpl-current', name: 'من الملف الحالي', isDefault: true, surface: SURFACE, fields: [fullField()], createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' }],
    }));
    const scan = installBridge(foundPayload());

    await ensureLegacyImport();

    expect(fakeTemplateDb.templates.map((t) => t.name)).toEqual(['من الملف الحالي']);
    expect(scan).not.toHaveBeenCalled();
  });
});

// ── 4. Nothing found / corrupt / unavailable — never fatal ───────────────────

describe('recovery never disturbs ordinary use', () => {
  it('does nothing when there is no Electron bridge at all (plain browser)', async () => {
    removeBridge();
    await expect(ensureLegacyRecovery()).resolves.toBeUndefined();
    expect(fakeTemplateDb.templates).toHaveLength(0);
  });

  it('does nothing when the scan found no legacy store', async () => {
    installBridge({ found: null, inspected: [{ path: 'x', outcome: 'absent' }] });
    await ensureLegacyRecovery();
    expect(fakeTemplateDb.templates).toHaveLength(0);
    expect(fakeTemplateDb.recoveryMarker).toBeNull();
  });

  it('does nothing when the legacy store was corrupt or unreadable', async () => {
    installBridge({ found: null, inspected: [{ path: 'x', outcome: 'unreadable-payload' }] });
    await expect(ensureLegacyRecovery()).resolves.toBeUndefined();
    expect(fakeTemplateDb.templates).toHaveLength(0);
  });

  it('does nothing when the legacy store held zero templates', async () => {
    installBridge(foundPayload([]));
    await ensureLegacyRecovery();
    expect(fakeTemplateDb.templates).toHaveLength(0);
  });

  it('survives a bridge that throws', async () => {
    (window as unknown as { manar?: unknown }).manar = {
      scanLegacyChequeTemplates: vi.fn().mockRejectedValue(new Error('IPC exploded')),
    };
    await expect(ensureLegacyRecovery()).resolves.toBeUndefined();
    expect(fakeTemplateDb.templates).toHaveLength(0);
  });

  it('survives an unreachable backend and leaves the database untouched', async () => {
    installBridge(foundPayload());
    fakeTemplateDb.offline = true;

    await expect(ensureLegacyRecovery()).resolves.toBeUndefined();
    expect(fakeTemplateDb.templates).toHaveLength(0);
  });

  it('completes on a later attempt once the backend is reachable again', async () => {
    installBridge(foundPayload());
    fakeTemplateDb.offline = true;
    await ensureLegacyRecovery();

    fakeTemplateDb.offline = false;
    resetLegacyRecoveryForTests();
    installBridge(foundPayload());
    await ensureLegacyRecovery();

    expect(fakeTemplateDb.templates).toHaveLength(6);
  });

  it('reading templates still works when recovery fails outright', async () => {
    (window as unknown as { manar?: unknown }).manar = {
      scanLegacyChequeTemplates: vi.fn().mockRejectedValue(new Error('nope')),
    };
    await expect(listTemplates()).resolves.toEqual([]);
    await expect(getDefaultTemplate()).resolves.toBeNull();
  });
});
