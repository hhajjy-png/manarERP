import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  scanLegacyChequeTemplates,
  legacyLevelDbPaths,
  LEGACY_USER_DATA_NAMES,
  LEGACY_STORAGE_KEY,
} from '../legacyTemplateRecovery';

/**
 * Legacy Cheque Template Recovery Pack v1 — scanner suite.
 *
 * The scanner looks for cheque designer templates left behind in a PREVIOUS
 * `userData` folder. Two properties matter and are pinned here:
 *
 *   1. it looks in every folder name this project has actually used, taken from
 *      the project's own history — not one guessed path;
 *   2. nothing it can encounter on a user's disk is fatal. A missing folder, an
 *      unreadable file, a corrupt LevelDB or a store holding zero templates all
 *      resolve to "nothing found, here is why". A recovery convenience must
 *      never be able to stop the application from starting.
 */

// ── Fixture builders (a minimal but REAL write-ahead log) ────────────────────

function varint(value: number): Buffer {
  const bytes: number[] = [];
  let v = value;
  while (v >= 0x80) {
    bytes.push((v & 0x7f) | 0x80);
    v = Math.floor(v / 128);
  }
  bytes.push(v);
  return Buffer.from(bytes);
}

/**
 * Chromium's LocalStorage key layout: an underscore, the page origin, a NUL
 * separator, an encoding byte, then the script key. Built from explicit bytes so
 * the fixture matches the real on-disk shape rather than an approximation.
 */
function storageKeyBytes(origin: string, key: string): Buffer {
  return Buffer.concat([
    Buffer.from(`_${origin}`, 'latin1'),
    Buffer.from([0x00, 0x01]),
    Buffer.from(key, 'latin1'),
  ]);
}
function buildLog(key: Buffer, value: string | null): Buffer {
  const keyBuf = key;
  const valueBuf = value === null ? null : Buffer.concat([Buffer.from([0x01]), Buffer.from(value, 'utf8')]);
  const record =
    valueBuf === null
      ? Buffer.concat([Buffer.from([0]), varint(keyBuf.length), keyBuf])
      : Buffer.concat([Buffer.from([1]), varint(keyBuf.length), keyBuf, varint(valueBuf.length), valueBuf]);
  const batch = Buffer.concat([Buffer.alloc(12), record]);
  const header = Buffer.alloc(7);
  header.writeUInt16LE(batch.length, 4);
  header[6] = 1; // FULL
  return Buffer.concat([header, batch]);
}

/** A template carrying every property the designer persists, plus an unknown one. */
function template(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tpl-dacb6970-8552-4414-a943-0ec0d48c90a3',
    name: 'الخليج',
    isDefault: true,
    surface: { widthCm: 17.8, heightCm: 8.9 },
    fields: [
      {
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
      },
    ],
    createdAt: '2026-07-24T04:02:48.954Z',
    updatedAt: '2026-07-30T13:10:00.000Z',
    ...overrides,
  };
}

let root: string;

function leveldbDir(userDataName: string): string {
  return path.join(root, userDataName, 'Local Storage', 'leveldb');
}

function seedStore(userDataName: string, payload: string | null, fileName = '000005.log'): void {
  const dir = leveldbDir(userDataName);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, fileName), buildLog(storageKeyBytes('http://localhost:5173', LEGACY_STORAGE_KEY), payload));
}

function seedTemplates(userDataName: string, templates: unknown[], fileName?: string): void {
  seedStore(userDataName, JSON.stringify({ version: 1, templates }), fileName);
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'manar-recovery-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

// ── Legacy path discovery ────────────────────────────────────────────────────

describe('legacy path discovery', () => {
  it('covers every userData folder name this project has used', () => {
    // Derived from the project's own history:
    //   `manar-erp`  — package.json `name` (initial commit), used whenever no
    //                  productName was set: every dev run and every pre-rename build
    //   `نظام المنار` — electron-builder productName before commit 0d88a50d
    //   `Electron`   — Electron's fallback folder when the app name is unresolved
    expect([...LEGACY_USER_DATA_NAMES]).toEqual(['manar-erp', 'نظام المنار', 'Electron']);
  });

  it('never includes the CURRENT folder — that case belongs to the ordinary migration', () => {
    expect([...LEGACY_USER_DATA_NAMES]).not.toContain('Al Manar ERP');
  });

  it('builds a Local Storage/leveldb path per candidate', () => {
    const paths = legacyLevelDbPaths('/appdata');
    expect(paths).toHaveLength(3);
    for (const p of paths) {
      expect(p.leveldbPath).toContain(path.join('Local Storage', 'leveldb'));
    }
  });
});

// ── Successful recovery ──────────────────────────────────────────────────────

describe('successful recovery', () => {
  it('finds templates in the old name-derived folder', () => {
    seedTemplates('manar-erp', [template()]);
    const result = scanLegacyChequeTemplates(root);

    expect(result.found).not.toBeNull();
    expect(result.found!.templates).toHaveLength(1);
    expect(result.found!.source.userDataName).toBe('manar-erp');
    expect(result.found!.source.origin).toBe('http://localhost:5173');
  });

  it('finds templates in the old productName-derived folder', () => {
    seedTemplates('نظام المنار', [template()]);
    expect(scanLegacyChequeTemplates(root).found!.source.userDataName).toBe('نظام المنار');
  });

  it("finds templates in Electron's fallback folder", () => {
    seedTemplates('Electron', [template()]);
    expect(scanLegacyChequeTemplates(root).found!.source.userDataName).toBe('Electron');
  });

  it('preserves EVERY stored property byte for byte, including unknown ones', () => {
    const source = template();
    seedTemplates('manar-erp', [source]);

    const recovered = scanLegacyChequeTemplates(root).found!.templates[0] as Record<string, unknown>;
    expect(recovered).toEqual(source);

    const field = (recovered.fields as Record<string, unknown>[])[0];
    expect(field.futureProp).toEqual({ nested: ['a', 1, true] });
    expect(field.rotation).toBe(12.5);
    expect(recovered.createdAt).toBe('2026-07-24T04:02:48.954Z');
    expect(recovered.updatedAt).toBe('2026-07-30T13:10:00.000Z');
  });

  it('preserves the default template flag', () => {
    seedTemplates('manar-erp', [template({ id: 'tpl-a', isDefault: false }), template({ id: 'tpl-b', isDefault: true })]);

    const found = scanLegacyChequeTemplates(root).found!.templates as Record<string, unknown>[];
    expect(found.filter((t) => t.isDefault).map((t) => t.id)).toEqual(['tpl-b']);
  });

  it('takes the FIRST folder that yields templates and stops looking', () => {
    seedTemplates('manar-erp', [template({ id: 'tpl-newest' })]);
    seedTemplates('Electron', [template({ id: 'tpl-older' })]);

    const result = scanLegacyChequeTemplates(root);
    expect((result.found!.templates[0] as Record<string, unknown>).id).toBe('tpl-newest');
    expect(result.inspected.some((i) => i.outcome.startsWith('found:'))).toBe(true);
  });

  it('falls through to a LATER candidate when an earlier one has nothing', () => {
    seedStore('manar-erp', JSON.stringify({ version: 1, templates: [] }));
    seedTemplates('نظام المنار', [template()]);

    expect(scanLegacyChequeTemplates(root).found!.source.userDataName).toBe('نظام المنار');
  });
});

// ── Nothing to recover ───────────────────────────────────────────────────────

describe('nothing to recover', () => {
  it('reports nothing when no legacy folder exists at all', () => {
    const result = scanLegacyChequeTemplates(root);
    expect(result.found).toBeNull();
    expect(result.inspected.every((i) => i.outcome === 'absent')).toBe(true);
  });

  it('reports nothing when the folder exists but holds no store files', () => {
    fs.mkdirSync(leveldbDir('manar-erp'), { recursive: true });
    const result = scanLegacyChequeTemplates(root);
    expect(result.found).toBeNull();
    expect(result.inspected[0].outcome).toBe('no-store-files');
  });

  it('reports nothing when the store has no cheque-template key', () => {
    const dir = leveldbDir('manar-erp');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '000005.log'), buildLog(storageKeyBytes('file://', 'manar.theme'), 'dark'));

    const result = scanLegacyChequeTemplates(root);
    expect(result.found).toBeNull();
    expect(result.inspected[0].outcome).toBe('key-absent-or-deleted');
  });

  it('does not resurrect a store the user deliberately cleared', () => {
    seedStore('manar-erp', null); // deletion record
    const result = scanLegacyChequeTemplates(root);
    expect(result.found).toBeNull();
    expect(result.inspected[0].outcome).toBe('key-absent-or-deleted');
  });

  it('reports an empty template list as empty, not as a find', () => {
    seedStore('manar-erp', JSON.stringify({ version: 1, templates: [] }));
    const result = scanLegacyChequeTemplates(root);
    expect(result.found).toBeNull();
    expect(result.inspected[0].outcome).toBe('store-empty');
  });
});

// ── Corruption is never fatal ────────────────────────────────────────────────

describe('a corrupt or unreadable store never breaks anything', () => {
  it('survives a store file full of random bytes', () => {
    const dir = leveldbDir('manar-erp');
    fs.mkdirSync(dir, { recursive: true });
    const junk = Buffer.alloc(4096);
    for (let i = 0; i < junk.length; i++) junk[i] = (i * 61) % 253;
    fs.writeFileSync(path.join(dir, '000005.ldb'), junk);

    expect(() => scanLegacyChequeTemplates(root)).not.toThrow();
    expect(scanLegacyChequeTemplates(root).found).toBeNull();
  });

  it('survives a value that is not valid JSON', () => {
    seedStore('manar-erp', '{not json at all');
    const result = scanLegacyChequeTemplates(root);
    expect(result.found).toBeNull();
    expect(result.inspected[0].outcome).toBe('unreadable-payload');
  });

  it('survives valid JSON of the wrong shape', () => {
    seedStore('manar-erp', JSON.stringify({ version: 1, templates: 'not-an-array' }));
    expect(scanLegacyChequeTemplates(root).inspected[0].outcome).toBe('unreadable-payload');
  });

  it('drops individual records that are not templates and keeps the rest', () => {
    seedStore('manar-erp', JSON.stringify({ version: 1, templates: [null, 42, 'x', template()] }));
    expect(scanLegacyChequeTemplates(root).found!.templates).toHaveLength(1);
  });

  it('still finds a good store in a later folder when an earlier one is corrupt', () => {
    seedStore('manar-erp', '{broken');
    seedTemplates('Electron', [template()]);

    expect(scanLegacyChequeTemplates(root).found!.source.userDataName).toBe('Electron');
  });

  it('records an explanation for every path it inspected', () => {
    seedStore('manar-erp', '{broken');
    const result = scanLegacyChequeTemplates(root);
    expect(result.inspected).toHaveLength(3);
    expect(result.inspected[0].outcome).toBe('unreadable-payload');
  });
});

// ── Read-only guarantee ──────────────────────────────────────────────────────

describe('the scan is strictly read-only', () => {
  it('leaves the legacy folder byte-for-byte unchanged', () => {
    seedTemplates('manar-erp', [template()]);
    const file = path.join(leveldbDir('manar-erp'), '000005.log');
    const before = fs.readFileSync(file);
    const listingBefore = fs.readdirSync(leveldbDir('manar-erp'));

    scanLegacyChequeTemplates(root);

    expect(fs.readFileSync(file).equals(before)).toBe(true);
    expect(fs.readdirSync(leveldbDir('manar-erp'))).toEqual(listingBefore);
  });

  it('creates no LOCK, no new files and no new folders', () => {
    seedTemplates('manar-erp', [template()]);
    scanLegacyChequeTemplates(root);

    expect(fs.readdirSync(leveldbDir('manar-erp'))).toEqual(['000005.log']);
    expect(fs.readdirSync(root).sort()).toEqual(['manar-erp']);
  });
});
