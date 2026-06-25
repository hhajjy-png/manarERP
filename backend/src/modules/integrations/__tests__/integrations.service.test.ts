import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request } from 'express';

vi.mock('../../../config/database', () => ({
  prisma: {
    setting: {
      findMany: vi.fn(),
      upsert:   vi.fn(),
    },
    $transaction: vi.fn(),
    auditLog: {
      create: vi.fn(),
    },
  },
}));

vi.mock('../../../core/middleware/audit', () => ({
  recordAudit: vi.fn(),
}));

import { integrationsService } from '../integrations.service';
import { INTEGRATION_REGISTRY } from '../integrations.registry';
import { prisma } from '../../../config/database';

const mockPrisma = prisma as unknown as {
  setting: {
    findMany:     ReturnType<typeof vi.fn>;
    upsert:       ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
};

const fakeReq = { user: { userId: 1 }, ip: '127.0.0.1', permissions: [] } as unknown as Request;

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.setting.findMany.mockResolvedValue([]);
  mockPrisma.$transaction.mockImplementation((ops: unknown[]) => Promise.all(ops));
  mockPrisma.setting.upsert.mockResolvedValue({});
});

// ─── list ────────────────────────────────────────────────────────────────────
describe('integrationsService.list', () => {
  it('returns all 6 integrations from the registry', async () => {
    const result = await integrationsService.list();
    expect(result).toHaveLength(INTEGRATION_REGISTRY.length);
    expect(result.length).toBe(6);
  });

  it('each card has the required runtime fields', async () => {
    const result = await integrationsService.list();
    for (const card of result) {
      expect(typeof card.id).toBe('string');
      expect(typeof card.nameAr).toBe('string');
      expect(typeof card.enabled).toBe('boolean');
      expect(typeof card.configured).toBe('boolean');
      expect(['ok', 'needsSetup', 'disabled', 'unavailable']).toContain(card.health);
      expect(card.lastRunAt).toBeNull();
      expect(typeof card.settings).toBe('object');
    }
  });

  it('available integrations default to enabled = true when no Settings row', async () => {
    const result = await integrationsService.list();
    const available = result.filter((c) => c.status === 'available');
    expect(available.length).toBeGreaterThan(0);
    for (const card of available) {
      expect(card.enabled).toBe(true);
    }
  });

  it('planned/comingSoon integrations default to enabled = false', async () => {
    const result = await integrationsService.list();
    const notAvailable = result.filter((c) => c.status !== 'available');
    expect(notAvailable.length).toBeGreaterThan(0);
    for (const card of notAvailable) {
      expect(card.enabled).toBe(false);
    }
  });

  it('planned integrations have health = unavailable', async () => {
    const result = await integrationsService.list();
    const planned = result.filter((c) => c.status === 'planned' || c.status === 'comingSoon');
    for (const card of planned) {
      expect(card.health).toBe('unavailable');
    }
  });

  it('respects enabled=false override from Settings', async () => {
    mockPrisma.setting.findMany.mockResolvedValue([
      { key: 'integrations.payroll-bank-import.enabled', value: 'false' },
    ]);
    const result = await integrationsService.list();
    const card = result.find((c) => c.id === 'payroll-bank-import')!;
    expect(card.enabled).toBe(false);
    expect(card.health).toBe('disabled');
  });

  it('respects enabled=true override from Settings for a planned integration', async () => {
    // even if someone forces enabled=true on a planned integration, health stays unavailable
    mockPrisma.setting.findMany.mockResolvedValue([
      { key: 'integrations.bank-reconciliation.enabled', value: 'true' },
    ]);
    const result = await integrationsService.list();
    const card = result.find((c) => c.id === 'bank-reconciliation')!;
    expect(card.enabled).toBe(true);
    expect(card.health).toBe('unavailable');
  });
});

// ─── getById ─────────────────────────────────────────────────────────────────
describe('integrationsService.getById', () => {
  it('returns the correct integration for a known id', async () => {
    const card = await integrationsService.getById('payroll-bank-import');
    expect(card).not.toBeNull();
    expect(card!.id).toBe('payroll-bank-import');
    expect(card!.nameAr).toBe('استيراد رواتب البنك');
  });

  it('returns null for an unknown id', async () => {
    const card = await integrationsService.getById('does-not-exist');
    expect(card).toBeNull();
  });

  it('includes settings schema in the card', async () => {
    const card = await integrationsService.getById('payroll-bank-import');
    expect(card!.settingsSchema.length).toBeGreaterThan(0);
    expect(card!.settingsSchema.some((f) => f.key === 'enabled')).toBe(true);
  });

  it('connector-sdk has empty settingsSchema', async () => {
    const card = await integrationsService.getById('connector-sdk');
    expect(card).not.toBeNull();
    expect(card!.settingsSchema).toHaveLength(0);
  });
});

// ─── updateSettings ──────────────────────────────────────────────────────────
describe('integrationsService.updateSettings', () => {
  it('persists enabled=false to Settings and returns updated card', async () => {
    mockPrisma.setting.findMany
      .mockResolvedValueOnce([  // post-update loadAllSettings call
        { key: 'integrations.payroll-bank-import.enabled', value: 'false' },
      ]);

    const card = await integrationsService.updateSettings(
      'payroll-bank-import',
      { enabled: false },
      fakeReq,
    );

    expect(mockPrisma.$transaction).toHaveBeenCalledOnce();
    expect(card.enabled).toBe(false);
    expect(card.health).toBe('disabled');
  });

  it('persists notes to Settings', async () => {
    mockPrisma.setting.findMany
      .mockResolvedValueOnce([
        { key: 'integrations.enhanced-excel-import.notes', value: 'test note' },
      ]);

    const card = await integrationsService.updateSettings(
      'enhanced-excel-import',
      { notes: 'test note' },
      fakeReq,
    );

    expect(card.settings.notes).toBe('test note');
  });

  it('throws for an unknown integration id', async () => {
    await expect(
      integrationsService.updateSettings('does-not-exist', { enabled: true }, fakeReq),
    ).rejects.toThrow('التكامل غير موجود');
  });

  it('does not call $transaction when input is empty', async () => {
    mockPrisma.setting.findMany.mockResolvedValue([]);
    await integrationsService.updateSettings('payroll-bank-import', {}, fakeReq);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});

// ─── run ─────────────────────────────────────────────────────────────────────
describe('integrationsService.run', () => {
  it('returns not_implemented for an available integration', async () => {
    const result = await integrationsService.run('payroll-bank-import', fakeReq);
    expect(result.success).toBe(false);
    expect(result.status).toBe('not_implemented');
    expect(result.messageAr).toBe('هذا التكامل لم يتم تفعيله بعد');
    expect(typeof result.runAt).toBe('string');
  });

  it('returns not_implemented for a planned integration', async () => {
    const result = await integrationsService.run('bank-statement-import', fakeReq);
    expect(result.status).toBe('not_implemented');
  });

  it('throws for an unknown integration id', async () => {
    await expect(
      integrationsService.run('does-not-exist', fakeReq),
    ).rejects.toThrow('التكامل غير موجود');
  });

  it('runAt is a valid ISO date string', async () => {
    const result = await integrationsService.run('enhanced-excel-import', fakeReq);
    expect(() => new Date(result.runAt)).not.toThrow();
    expect(new Date(result.runAt).toISOString()).toBe(result.runAt);
  });
});

// ─── registry completeness ────────────────────────────────────────────────────
describe('INTEGRATION_REGISTRY', () => {
  it('all entries have unique ids', () => {
    const ids = INTEGRATION_REGISTRY.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all entries have non-empty nameAr and nameEn', () => {
    for (const entry of INTEGRATION_REGISTRY) {
      expect(entry.nameAr.length).toBeGreaterThan(0);
      expect(entry.nameEn.length).toBeGreaterThan(0);
    }
  });

  it('all available integrations have a targetRoute', () => {
    const available = INTEGRATION_REGISTRY.filter((i) => i.status === 'available');
    for (const entry of available) {
      expect(entry.targetRoute).not.toBeNull();
    }
  });
});
