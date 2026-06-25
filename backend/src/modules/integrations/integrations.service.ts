import { Request } from 'express';
import { prisma } from '@config/database';
import { recordAudit } from '@core/middleware/audit';
import { INTEGRATION_REGISTRY, findIntegration } from './integrations.registry';
import type {
  IntegrationCard,
  IntegrationHealth,
  IntegrationRunResult,
  IntegrationSettingsUpdate,
} from './integrations.types';

/** Settings key prefix for all integration config stored in the Settings table. */
const SETTINGS_PREFIX = 'integrations';

function settingsKey(integrationId: string, field: string): string {
  return `${SETTINGS_PREFIX}.${integrationId}.${field}`;
}

/** Load all integration-related Settings rows in one query and index by key. */
async function loadAllSettings(): Promise<Map<string, string>> {
  const rows = await prisma.setting.findMany({
    where: { key: { startsWith: `${SETTINGS_PREFIX}.` } },
  });
  return new Map(rows.map((r) => [r.key, r.value]));
}

/** Derive health from live settings. */
function deriveHealth(
  integrationId: string,
  status: string,
  enabled: boolean,
): IntegrationHealth {
  if (status === 'planned' || status === 'comingSoon') return 'unavailable';
  if (!enabled) return 'disabled';
  // 'available' integrations are ok when enabled (no external credentials to check in Phase 1)
  void integrationId; // extension point for Phase 2+ health probing
  return 'ok';
}

/** Merge a definition with its live settings to produce an IntegrationCard. */
function buildCard(
  def: (typeof INTEGRATION_REGISTRY)[number],
  settingsMap: Map<string, string>,
): IntegrationCard {
  const enabledRaw = settingsMap.get(settingsKey(def.id, 'enabled'));
  const notes      = settingsMap.get(settingsKey(def.id, 'notes')) ?? '';

  // 'available' integrations default to enabled = true; others default to false
  const defaultEnabled = def.status === 'available';
  const enabled = enabledRaw !== undefined
    ? enabledRaw === 'true'
    : defaultEnabled;

  const configured = enabled && def.status === 'available';
  const health = deriveHealth(def.id, def.status, enabled);

  const settings: Record<string, string | boolean> = { enabled, notes };

  return { ...def, enabled, configured, health, lastRunAt: null, settings };
}

export const integrationsService = {
  /** List all integrations with live settings overlay. */
  async list(): Promise<IntegrationCard[]> {
    const settingsMap = await loadAllSettings();
    return INTEGRATION_REGISTRY.map((def) => buildCard(def, settingsMap));
  },

  /** Get a single integration by id, or null if unknown. */
  async getById(id: string): Promise<IntegrationCard | null> {
    const def = findIntegration(id);
    if (!def) return null;
    const settingsMap = await loadAllSettings();
    return buildCard(def, settingsMap);
  },

  /** Persist safe settings for an integration. Writes AuditLog. */
  async updateSettings(
    id: string,
    input: IntegrationSettingsUpdate,
    req: Request,
  ): Promise<IntegrationCard> {
    const def = findIntegration(id);
    if (!def) throw new Error(`التكامل غير موجود: ${id}`);

    const updates: { key: string; value: string; group: string }[] = [];

    if (input.enabled !== undefined) {
      updates.push({ key: settingsKey(id, 'enabled'), value: String(input.enabled), group: SETTINGS_PREFIX });
    }
    if (input.notes !== undefined) {
      updates.push({ key: settingsKey(id, 'notes'), value: input.notes, group: SETTINGS_PREFIX });
    }

    if (updates.length > 0) {
      await prisma.$transaction(
        updates.map((u) =>
          prisma.setting.upsert({
            where:  { key: u.key },
            update: { value: u.value },
            create: { key: u.key, value: u.value, group: u.group },
          }),
        ),
      );
    }

    await recordAudit({
      req,
      action:   'UPDATE',
      module:   'integrations',
      entityId: id,
      newValue: input,
    });

    const settingsMap = await loadAllSettings();
    return buildCard(def, settingsMap);
  },

  /**
   * Placeholder run endpoint.
   * Phase 1: always returns not_implemented — no business data is touched.
   * Phase 2+: replace with real connector logic per integration id.
   */
  async run(id: string, req: Request): Promise<IntegrationRunResult> {
    const def = findIntegration(id);
    if (!def) throw new Error(`التكامل غير موجود: ${id}`);

    await recordAudit({
      req,
      action:   'RUN',
      module:   'integrations',
      entityId: id,
      newValue: { status: 'not_implemented' },
    });

    return {
      success:   false,
      status:    'not_implemented',
      messageAr: 'هذا التكامل لم يتم تفعيله بعد',
      runAt:     new Date().toISOString(),
    };
  },
};
