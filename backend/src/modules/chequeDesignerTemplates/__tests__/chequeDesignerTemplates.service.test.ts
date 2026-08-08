import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Cheque Designer Templates — service suite (Cheque Template Persistence
 * Migration Pack v1).
 *
 * Cheque designer templates used to be the only user-created data in the system
 * stored outside `manar.db` (browser `localStorage`), which put them outside
 * backup, restore, Google Drive sync and any move to a new machine — and made
 * them destroyable by an unrelated `productName`/`userData` change. They are
 * ordinary database rows now.
 *
 * This suite pins the two things that decide whether that move is safe:
 *   1. the one-time legacy import is genuinely idempotent and atomic, so no
 *      retry, relaunch or restored profile can duplicate or clobber data;
 *   2. every semantic the old store had is preserved exactly, so no user sees a
 *      behaviour change.
 */

vi.mock('../../../config/database', () => ({
  prisma: {
    chequeDesignerTemplate: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    setting: { findUnique: vi.fn(), create: vi.fn(), upsert: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../../core/middleware/audit', () => ({ recordAudit: vi.fn() }));

import { prisma } from '../../../config/database';
import { recordAudit } from '../../../core/middleware/audit';
import {
  ChequeDesignerTemplatesService,
  LEGACY_IMPORT_MARKER_KEY,
  LEGACY_RECOVERY_MARKER_KEY,
} from '../chequeDesignerTemplates.service';

const req = { user: { userId: 3, username: 'admin' } } as any;
const service = new ChequeDesignerTemplatesService();

const FIELD = {
  id: 'beneficiary',
  label: 'اسم المستفيد',
  value: 'اسم المستفيد',
  x: 22,
  y: 31,
  width: 45,
  height: 6,
  rotation: 0,
  fontSize: 14,
  fontWeight: 400,
  textAlign: 'right',
  color: '#000000',
  zIndex: 3,
  visible: true,
  binding: 'beneficiary',
};

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tpl-1',
    name: 'قالب A4',
    isDefault: false,
    surfaceWidthCm: 17.8,
    surfaceHeightCm: 8.9,
    fields: JSON.stringify([FIELD]),
    createdAt: new Date('2026-07-24T04:02:48.954Z'),
    updatedAt: new Date('2026-07-30T13:10:00.000Z'),
    ...overrides,
  } as any;
}

/** Run the callback against the same mocked client — mirrors Prisma's interactive transaction. */
function passthroughTransaction() {
  (prisma.$transaction as any).mockImplementation(async (arg: any) =>
    typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  passthroughTransaction();
});

// ── Reads ────────────────────────────────────────────────────────────────────

describe('reads', () => {
  it('lists newest-updated first — the order the Open dialog depends on', async () => {
    (prisma.chequeDesignerTemplate.findMany as any).mockResolvedValue([row()]);
    const result = await service.list();

    expect(prisma.chequeDesignerTemplate.findMany).toHaveBeenCalledWith({ orderBy: { updatedAt: 'desc' } });
    expect(result[0].surface).toEqual({ widthCm: 17.8, heightCm: 8.9 });
    expect(result[0].fields).toEqual([FIELD]);
    expect(result[0].createdAt).toBe('2026-07-24T04:02:48.954Z');
  });

  it('returns the flagged default, or null when none is flagged', async () => {
    (prisma.chequeDesignerTemplate.findFirst as any).mockResolvedValue(row({ isDefault: true }));
    expect((await service.getDefault())?.name).toBe('قالب A4');

    (prisma.chequeDesignerTemplate.findFirst as any).mockResolvedValue(null);
    expect(await service.getDefault()).toBeNull();
  });

  it('reports a corrupt stored layout loudly instead of presenting an empty template', async () => {
    (prisma.chequeDesignerTemplate.findUnique as any).mockResolvedValue(row({ fields: '{not json' }));
    await expect(service.get('tpl-1')).rejects.toThrow(/تالفة/);
  });

  it('404s for an unknown id', async () => {
    (prisma.chequeDesignerTemplate.findUnique as any).mockResolvedValue(null);
    await expect(service.get('nope')).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ── Default-template semantics ───────────────────────────────────────────────

describe('default-template semantics are preserved exactly', () => {
  it('the first template ever created becomes the default automatically', async () => {
    (prisma.chequeDesignerTemplate.count as any).mockResolvedValue(0);
    (prisma.chequeDesignerTemplate.create as any).mockImplementation(async ({ data }: any) => row(data));

    const created = await service.create({ name: 'الأول', surface: { widthCm: 17.8, heightCm: 8.9 }, fields: [] } as any, req);
    expect(created.isDefault).toBe(true);
  });

  it('a later template does not steal the default flag', async () => {
    (prisma.chequeDesignerTemplate.count as any).mockResolvedValue(2);
    (prisma.chequeDesignerTemplate.create as any).mockImplementation(async ({ data }: any) => row(data));

    const created = await service.create({ name: 'الثالث', surface: { widthCm: 17.8, heightCm: 8.9 }, fields: [] } as any, req);
    expect(created.isDefault).toBe(false);
    expect(prisma.chequeDesignerTemplate.updateMany).not.toHaveBeenCalled();
  });

  it('promoting a default demotes every other one in the same transaction', async () => {
    (prisma.chequeDesignerTemplate.findUnique as any).mockResolvedValue(row());
    (prisma.chequeDesignerTemplate.update as any).mockResolvedValue(row({ isDefault: true }));

    await service.setDefault('tpl-1', req);

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.chequeDesignerTemplate.updateMany).toHaveBeenCalledWith({ where: { isDefault: true }, data: { isDefault: false } });
  });

  it('promoting a default does NOT bump updatedAt — the list must not reorder', async () => {
    (prisma.chequeDesignerTemplate.findUnique as any).mockResolvedValue(row());
    (prisma.chequeDesignerTemplate.update as any).mockResolvedValue(row({ isDefault: true }));

    await service.setDefault('tpl-1', req);

    const call = (prisma.chequeDesignerTemplate.update as any).mock.calls[0][0];
    expect(call.data).toEqual({ isDefault: true });
    expect(call.data).not.toHaveProperty('updatedAt');
  });

  it('deleting the default promotes the most-recently-updated survivor', async () => {
    (prisma.chequeDesignerTemplate.findUnique as any).mockResolvedValue(row({ isDefault: true }));
    (prisma.chequeDesignerTemplate.findFirst as any).mockResolvedValue(row({ id: 'tpl-2' }));

    await service.remove('tpl-1', req);

    expect(prisma.chequeDesignerTemplate.findFirst).toHaveBeenCalledWith({ orderBy: { updatedAt: 'desc' } });
    expect(prisma.chequeDesignerTemplate.update).toHaveBeenCalledWith({ where: { id: 'tpl-2' }, data: { isDefault: true } });
  });

  it('deleting a non-default template promotes nobody', async () => {
    (prisma.chequeDesignerTemplate.findUnique as any).mockResolvedValue(row({ isDefault: false }));

    await service.remove('tpl-1', req);

    expect(prisma.chequeDesignerTemplate.update).not.toHaveBeenCalled();
  });
});

// ── Writes ───────────────────────────────────────────────────────────────────

describe('writes', () => {
  it('a save persists the layout and bumps updatedAt', async () => {
    (prisma.chequeDesignerTemplate.findUnique as any).mockResolvedValue(row());
    (prisma.chequeDesignerTemplate.update as any).mockResolvedValue(row());

    await service.update('tpl-1', { surface: { widthCm: 20, heightCm: 10 }, fields: [FIELD] } as any, req);

    const data = (prisma.chequeDesignerTemplate.update as any).mock.calls[0][0].data;
    expect(data.surfaceWidthCm).toBe(20);
    expect(JSON.parse(data.fields)).toEqual([FIELD]);
    expect(data.updatedAt).toBeInstanceOf(Date);
    expect(data).not.toHaveProperty('name'); // an omitted name is left alone
  });

  it('every write is audited', async () => {
    (prisma.chequeDesignerTemplate.findUnique as any).mockResolvedValue(row());
    (prisma.chequeDesignerTemplate.update as any).mockResolvedValue(row({ name: 'اسم جديد' }));

    await service.rename('tpl-1', 'اسم جديد', req);
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'UPDATE', module: 'cheques', entityId: 'tpl-1' }));
  });
});

// ── One-time legacy import ───────────────────────────────────────────────────

describe('one-time legacy import', () => {
  const legacy = [
    {
      id: 'tpl-legacy-0',
      name: 'قالب A4',
      isDefault: true,
      surface: { widthCm: 17.8, heightCm: 8.9 },
      fields: [FIELD],
      createdAt: '2026-07-24T04:02:48.954Z',
      updatedAt: '2026-07-30T13:10:00.000Z',
    },
    {
      id: 'tpl-legacy-1',
      name: 'تجربه',
      isDefault: false,
      surface: { widthCm: 17.8, heightCm: 8.9 },
      fields: [FIELD],
      createdAt: '2026-07-24T04:02:48.954Z',
      updatedAt: '2026-07-30T13:11:00.000Z',
    },
  ];

  it('imports every template, preserving id, default flag, layout and timestamps', async () => {
    (prisma.setting.findUnique as any).mockResolvedValue(null);
    (prisma.chequeDesignerTemplate.count as any).mockResolvedValue(0);

    const result = await service.importLegacy({ templates: legacy } as any, req);

    expect(result).toEqual({ imported: true, count: 2, reason: 'imported' });
    const created = (prisma.chequeDesignerTemplate.create as any).mock.calls.map((c: any) => c[0].data);
    expect(created.map((r: any) => r.id)).toEqual(['tpl-legacy-0', 'tpl-legacy-1']);
    expect(created[0].isDefault).toBe(true);
    expect(created[1].isDefault).toBe(false);
    expect(created[0].createdAt).toEqual(new Date('2026-07-24T04:02:48.954Z'));
    expect(created[0].updatedAt).toEqual(new Date('2026-07-30T13:10:00.000Z'));
    expect(JSON.parse(created[0].fields)).toEqual([FIELD]);
  });

  it('writes the marker inside the SAME transaction as the rows — no half-migrated database', async () => {
    (prisma.setting.findUnique as any).mockResolvedValue(null);
    (prisma.chequeDesignerTemplate.count as any).mockResolvedValue(0);

    await service.importLegacy({ templates: legacy } as any, req);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.setting.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ key: LEGACY_IMPORT_MARKER_KEY }) }),
    );
  });

  it('refuses a second import once the marker exists — nothing is written', async () => {
    (prisma.setting.findUnique as any).mockResolvedValue({ key: LEGACY_IMPORT_MARKER_KEY, value: '{}' });

    const result = await service.importLegacy({ templates: legacy } as any, req);

    expect(result).toEqual({ imported: false, count: 0, reason: 'already-migrated' });
    expect(prisma.chequeDesignerTemplate.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('never overwrites a database that already holds templates, and stops asking', async () => {
    (prisma.setting.findUnique as any).mockResolvedValue(null);
    (prisma.chequeDesignerTemplate.count as any).mockResolvedValue(4);

    const result = await service.importLegacy({ templates: legacy } as any, req);

    expect(result).toEqual({ imported: false, count: 0, reason: 'db-not-empty' });
    expect(prisma.chequeDesignerTemplate.create).not.toHaveBeenCalled();
    expect(prisma.setting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: LEGACY_IMPORT_MARKER_KEY } }),
    );
  });

  it('collapses several legacy defaults down to one', async () => {
    (prisma.setting.findUnique as any).mockResolvedValue(null);
    (prisma.chequeDesignerTemplate.count as any).mockResolvedValue(0);

    await service.importLegacy({ templates: legacy.map((t) => ({ ...t, isDefault: true })) } as any, req);

    const created = (prisma.chequeDesignerTemplate.create as any).mock.calls.map((c: any) => c[0].data);
    expect(created.filter((r: any) => r.isDefault)).toHaveLength(1);
  });

  it('reports whether the import has been settled, so a clean machine never posts a payload', async () => {
    (prisma.setting.findUnique as any).mockResolvedValue(null);
    expect(await service.legacyImportStatus()).toEqual({ done: false });

    (prisma.setting.findUnique as any).mockResolvedValue({ key: LEGACY_IMPORT_MARKER_KEY, value: '{}' });
    expect(await service.legacyImportStatus()).toEqual({ done: true });
  });
});

// ── One-time recovery from a PREVIOUS userData folder ────────────────────────

describe('one-time recovery from a previous userData folder', () => {
  const recovered = [
    {
      id: 'tpl-a84711c8-632e-45c3-a1e6-bc03b633885e',
      name: 'تجربه نسخةتحت',
      isDefault: true,
      surface: { widthCm: 17.8, heightCm: 8.9 },
      fields: [FIELD],
      createdAt: '2026-07-30T18:00:01.441Z',
      updatedAt: '2026-07-30T18:00:01.441Z',
    },
    {
      id: 'tpl-b3ba4314-6dac-4e96-ae8b-4c2d9761e016',
      name: 'الخليج',
      isDefault: false,
      surface: { widthCm: 17.8, heightCm: 8.9 },
      fields: [FIELD],
      createdAt: '2026-07-24T19:38:19.235Z',
      updatedAt: '2026-07-24T19:38:19.235Z',
    },
  ];

  const source = { userDataName: 'manar-erp', leveldbPath: 'C:/…/manar-erp/Local Storage/leveldb', origin: 'http://localhost:5173', file: '000041.ldb' };

  /** Answer the two marker lookups independently — they use different keys. */
  function markers(options: { recovery?: boolean; migration?: boolean } = {}) {
    (prisma.setting.findUnique as any).mockImplementation(async ({ where }: any) => {
      if (where.key === LEGACY_RECOVERY_MARKER_KEY) return options.recovery ? { key: where.key, value: '{}' } : null;
      if (where.key === LEGACY_IMPORT_MARKER_KEY) return options.migration ? { key: where.key, value: '{}' } : null;
      return null;
    });
  }

  // ── Eligibility: all four preconditions ──

  it('is eligible only on an empty database that has settled neither one-time path', async () => {
    markers();
    (prisma.chequeDesignerTemplate.count as any).mockResolvedValue(0);
    expect(await service.legacyRecoveryStatus()).toEqual({ eligible: true, reason: 'eligible' });
  });

  it('is NOT eligible once recovery has already run', async () => {
    markers({ recovery: true });
    (prisma.chequeDesignerTemplate.count as any).mockResolvedValue(0);
    expect(await service.legacyRecoveryStatus()).toEqual({ eligible: false, reason: 'already-recovered' });
  });

  it('is NOT eligible once the ordinary migration has run', async () => {
    markers({ migration: true });
    (prisma.chequeDesignerTemplate.count as any).mockResolvedValue(0);
    expect(await service.legacyRecoveryStatus()).toEqual({ eligible: false, reason: 'already-migrated' });
  });

  it('is NOT eligible when the database already holds templates', async () => {
    markers();
    (prisma.chequeDesignerTemplate.count as any).mockResolvedValue(3);
    expect(await service.legacyRecoveryStatus()).toEqual({ eligible: false, reason: 'db-not-empty' });
  });

  // ── Successful recovery ──

  it('recovers every template, preserving id, name, default flag, surface, layout and timestamps', async () => {
    markers();
    (prisma.chequeDesignerTemplate.count as any).mockResolvedValue(0);

    const result = await service.recoverLegacy({ templates: recovered, source } as any, req);

    expect(result).toEqual({ recovered: true, count: 2, reason: 'recovered' });
    const rows = (prisma.chequeDesignerTemplate.create as any).mock.calls.map((c: any) => c[0].data);
    expect(rows.map((r: any) => r.id)).toEqual(recovered.map((t) => t.id));
    expect(rows.map((r: any) => r.name)).toEqual(['تجربه نسخةتحت', 'الخليج']);
    expect(rows[0].isDefault).toBe(true);
    expect(rows[1].isDefault).toBe(false);
    expect(rows[0].surfaceWidthCm).toBe(17.8);
    expect(rows[0].surfaceHeightCm).toBe(8.9);
    expect(rows[0].createdAt).toEqual(new Date('2026-07-30T18:00:01.441Z'));
    expect(rows[0].updatedAt).toEqual(new Date('2026-07-30T18:00:01.441Z'));
    expect(JSON.parse(rows[0].fields)).toEqual([FIELD]);
  });

  it('writes rows and marker in ONE transaction — no half-recovered database', async () => {
    markers();
    (prisma.chequeDesignerTemplate.count as any).mockResolvedValue(0);

    await service.recoverLegacy({ templates: recovered, source } as any, req);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.setting.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ key: LEGACY_RECOVERY_MARKER_KEY }) }),
    );
  });

  it('records where the templates came from, in the marker and in the audit log', async () => {
    markers();
    (prisma.chequeDesignerTemplate.count as any).mockResolvedValue(0);

    await service.recoverLegacy({ templates: recovered, source } as any, req);

    const marker = JSON.parse((prisma.setting.create as any).mock.calls[0][0].data.value);
    expect(marker.source.userDataName).toBe('manar-erp');
    expect(marker.count).toBe(2);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ newValue: expect.objectContaining({ chequeDesignerLegacyRecovery: 2 }) }),
    );
  });

  it('collapses several recovered defaults down to one', async () => {
    markers();
    (prisma.chequeDesignerTemplate.count as any).mockResolvedValue(0);

    await service.recoverLegacy({ templates: recovered.map((t) => ({ ...t, isDefault: true })), source } as any, req);

    const rows = (prisma.chequeDesignerTemplate.create as any).mock.calls.map((c: any) => c[0].data);
    expect(rows.filter((r: any) => r.isDefault)).toHaveLength(1);
  });

  // ── Refusals: nothing imported, nothing replaced, nothing merged ──

  it('imports NOTHING once recovery has already run', async () => {
    markers({ recovery: true });
    (prisma.chequeDesignerTemplate.count as any).mockResolvedValue(0);

    const result = await service.recoverLegacy({ templates: recovered, source } as any, req);

    expect(result).toEqual({ recovered: false, count: 0, reason: 'already-recovered' });
    expect(prisma.chequeDesignerTemplate.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('imports NOTHING once the ordinary migration has run', async () => {
    markers({ migration: true });
    (prisma.chequeDesignerTemplate.count as any).mockResolvedValue(0);

    const result = await service.recoverLegacy({ templates: recovered, source } as any, req);

    expect(result.reason).toBe('already-migrated');
    expect(prisma.chequeDesignerTemplate.create).not.toHaveBeenCalled();
  });

  it('never imports, replaces or merges over a database that already holds templates', async () => {
    markers();
    (prisma.chequeDesignerTemplate.count as any).mockResolvedValue(5);

    const result = await service.recoverLegacy({ templates: recovered, source } as any, req);

    expect(result).toEqual({ recovered: false, count: 0, reason: 'db-not-empty' });
    expect(prisma.chequeDesignerTemplate.create).not.toHaveBeenCalled();
    expect(prisma.chequeDesignerTemplate.update).not.toHaveBeenCalled();
    expect(prisma.chequeDesignerTemplate.updateMany).not.toHaveBeenCalled();
    expect(prisma.chequeDesignerTemplate.delete).not.toHaveBeenCalled();
    // …but it stops the client asking again on every launch.
    expect(prisma.setting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: LEGACY_RECOVERY_MARKER_KEY } }),
    );
  });

  it('re-checks eligibility itself rather than trusting the client that just asked', async () => {
    markers({ recovery: true });
    (prisma.chequeDesignerTemplate.count as any).mockResolvedValue(0);

    // A client that ignored the status probe entirely still cannot import.
    await service.recoverLegacy({ templates: recovered, source } as any, req);
    expect(prisma.chequeDesignerTemplate.create).not.toHaveBeenCalled();
  });

  it('keeps the two markers independent — recovery does not satisfy migration', async () => {
    expect(LEGACY_RECOVERY_MARKER_KEY).not.toBe(LEGACY_IMPORT_MARKER_KEY);
  });
});
