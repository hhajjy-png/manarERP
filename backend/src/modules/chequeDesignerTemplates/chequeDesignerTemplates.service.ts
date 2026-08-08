import { Request } from 'express';
import { randomUUID } from 'crypto';
import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';
import { recordAudit } from '../../core/middleware/audit';
import type { CreateTemplateInput, ImportLegacyInput, UpdateTemplateInput } from './chequeDesignerTemplates.schema';

/**
 * Cheque Designer Templates — service (Cheque Template Persistence Migration
 * Pack v1).
 *
 * This is a FAITHFUL PORT of the semantics the old `localStorage` store
 * (`chequeDesignerStore.ts`) had, moved onto SQLite so the templates become
 * ordinary system data: inside `manar.db`, therefore inside local backups,
 * restore, Google Drive sync and any move to a new machine — with no extra code
 * in any of those paths, because all four operate on the database file itself.
 *
 * Semantics deliberately preserved byte-for-byte:
 *   - list order is `updatedAt` DESCENDING (what the "Open" dialog shows);
 *   - the FIRST template ever created becomes the default automatically;
 *   - deleting the default promotes the most-recently-updated survivor;
 *   - setting a default is a no-op for an unknown id;
 *   - setting a default does NOT bump `updatedAt`, so it never reorders the
 *     list — which is why `updatedAt` is managed explicitly here rather than by
 *     Prisma's `@updatedAt`.
 *
 * The "at most one default" invariant is enforced inside a transaction on every
 * path that can create one, so no interleaving of requests can produce two.
 */

/** Settings key marking the one-time legacy import as done. Lives in the DB, so it travels with backup/sync. */
export const LEGACY_IMPORT_MARKER_KEY = 'chequeDesigner.localStorageImport.v1';

/**
 * Settings key marking the one-time recovery from a PREVIOUS `userData` folder
 * as done (Legacy Cheque Template Recovery Pack v1).
 *
 * Deliberately separate from the import marker above. They answer different
 * questions — "did this database ever take templates from the CURRENT browser
 * profile?" versus "did it ever take them from an OLD one?" — and recovery is
 * gated on BOTH being absent, so a database that already settled the ordinary
 * migration is never revisited by the recovery path.
 */
export const LEGACY_RECOVERY_MARKER_KEY = 'chequeDesigner.legacyRecovery.v1';

export interface TemplateDto {
  id: string;
  name: string;
  isDefault: boolean;
  surface: { widthCm: number; heightCm: number };
  fields: unknown[];
  createdAt: string;
  updatedAt: string;
}

interface TemplateRow {
  id: string;
  name: string;
  isDefault: boolean;
  surfaceWidthCm: number;
  surfaceHeightCm: number;
  fields: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Row → API shape. The layout is stored as one JSON document; a parse failure
 * is a hard error rather than the old silent `catch → []`, which presented a
 * corrupt template as an empty one and lost every field without a word.
 */
function toDto(row: TemplateRow): TemplateDto {
  let fields: unknown[];
  try {
    const parsed = JSON.parse(row.fields);
    if (!Array.isArray(parsed)) throw new Error('fields is not an array');
    fields = parsed;
  } catch (err) {
    throw AppError.internal(`تعذّرت قراءة تخطيط القالب «${row.name}» (${row.id}) — البيانات المخزّنة تالفة.`);
  }
  return {
    id: row.id,
    name: row.name,
    isDefault: row.isDefault,
    surface: { widthCm: row.surfaceWidthCm, heightCm: row.surfaceHeightCm },
    fields,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class ChequeDesignerTemplatesService {
  /** All templates, newest-updated first — the exact order the legacy store returned. */
  async list(): Promise<TemplateDto[]> {
    const rows = await prisma.chequeDesignerTemplate.findMany({ orderBy: { updatedAt: 'desc' } });
    return rows.map(toDto);
  }

  async get(id: string): Promise<TemplateDto> {
    const row = await prisma.chequeDesignerTemplate.findUnique({ where: { id } });
    if (!row) throw AppError.notFound('القالب غير موجود');
    return toDto(row);
  }

  /** The explicitly flagged default, or null. Production printing resolves through this. */
  async getDefault(): Promise<TemplateDto | null> {
    const row = await prisma.chequeDesignerTemplate.findFirst({ where: { isDefault: true } });
    return row ? toDto(row) : null;
  }

  async create(input: CreateTemplateInput, req: Request): Promise<TemplateDto> {
    const id = `tpl-${randomUUID()}`;
    const now = new Date();

    const row = await prisma.$transaction(async (tx) => {
      // The first template ever created becomes the default automatically —
      // legacy `store.templates.length === 1` (evaluated after the push).
      const existing = await tx.chequeDesignerTemplate.count();
      const becomesDefault = input.makeDefault === true || existing === 0;
      if (becomesDefault) {
        await tx.chequeDesignerTemplate.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
      }
      return tx.chequeDesignerTemplate.create({
        data: {
          id,
          name: input.name,
          isDefault: becomesDefault,
          surfaceWidthCm: input.surface.widthCm,
          surfaceHeightCm: input.surface.heightCm,
          fields: JSON.stringify(input.fields),
          createdAt: now,
          updatedAt: now,
        },
      });
    });

    await recordAudit({ req, action: 'CREATE', module: 'cheques', entityId: id, newValue: { chequeDesignerTemplate: input.name } });
    return toDto(row);
  }

  /** Persist the current layout onto an existing template ("Save"). */
  async update(id: string, input: UpdateTemplateInput, req: Request): Promise<TemplateDto> {
    await this.mustExist(id);
    const row = await prisma.chequeDesignerTemplate.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        surfaceWidthCm: input.surface.widthCm,
        surfaceHeightCm: input.surface.heightCm,
        fields: JSON.stringify(input.fields),
        updatedAt: new Date(),
      },
    });
    await recordAudit({ req, action: 'UPDATE', module: 'cheques', entityId: id, newValue: { chequeDesignerTemplate: row.name } });
    return toDto(row);
  }

  async rename(id: string, name: string, req: Request): Promise<TemplateDto> {
    const before = await this.mustExist(id);
    const row = await prisma.chequeDesignerTemplate.update({
      where: { id },
      data: { name, updatedAt: new Date() },
    });
    await recordAudit({ req, action: 'UPDATE', module: 'cheques', entityId: id, oldValue: { name: before.name }, newValue: { name } });
    return toDto(row);
  }

  /**
   * Delete a template. If it was the default, the most-recently-updated
   * survivor is promoted — so the system never silently ends up with cheque
   * templates but no default (which blocks production printing outright).
   */
  async remove(id: string, req: Request): Promise<void> {
    const existing = await this.mustExist(id);
    await prisma.$transaction(async (tx) => {
      await tx.chequeDesignerTemplate.delete({ where: { id } });
      if (!existing.isDefault) return;
      const survivor = await tx.chequeDesignerTemplate.findFirst({ orderBy: { updatedAt: 'desc' } });
      if (survivor) {
        await tx.chequeDesignerTemplate.update({ where: { id: survivor.id }, data: { isDefault: true } });
      }
    });
    await recordAudit({ req, action: 'DELETE', module: 'cheques', entityId: id, oldValue: { chequeDesignerTemplate: existing.name } });
  }

  /** Flag a template as THE default. Deliberately does not bump `updatedAt` (list order is stable). */
  async setDefault(id: string, req: Request): Promise<TemplateDto> {
    await this.mustExist(id);
    const row = await prisma.$transaction(async (tx) => {
      await tx.chequeDesignerTemplate.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
      return tx.chequeDesignerTemplate.update({ where: { id }, data: { isDefault: true } });
    });
    await recordAudit({ req, action: 'UPDATE', module: 'cheques', entityId: id, newValue: { chequeDesignerTemplateDefault: row.name } });
    return toDto(row);
  }

  /**
   * ONE-TIME import of templates found in the legacy `localStorage` store.
   *
   * Idempotency has two independent guards, both durable and both server-side,
   * so no amount of client retries, reloads or reinstalls can import twice:
   *
   *   1. a marker row in `settings` — written on EVERY outcome, including the
   *      refusals, so the question is asked exactly once per database;
   *   2. a non-empty templates table — a database that already has templates is
   *      never overwritten by whatever a client happens to still hold locally.
   *
   * The whole import — rows plus marker — is a single transaction: it either
   * lands completely or not at all, so a crash mid-import can never leave a
   * half-migrated database that the marker then declares finished.
   */
  async importLegacy(input: ImportLegacyInput, req: Request): Promise<{ imported: boolean; count: number; reason: string }> {
    const marker = await prisma.setting.findUnique({ where: { key: LEGACY_IMPORT_MARKER_KEY } });
    if (marker) return { imported: false, count: 0, reason: 'already-migrated' };

    const existing = await prisma.chequeDesignerTemplate.count();
    if (existing > 0) {
      await this.writeMarker(0, 'db-not-empty');
      return { imported: false, count: 0, reason: 'db-not-empty' };
    }

    // At most one default survives the import — the legacy store could in
    // principle hold more than one after a partial write.
    let defaultSeen = false;
    const rows = input.templates.map((t) => {
      const isDefault = t.isDefault && !defaultSeen;
      if (isDefault) defaultSeen = true;
      const createdAt = t.createdAt ? new Date(t.createdAt) : new Date();
      const updatedAt = t.updatedAt ? new Date(t.updatedAt) : createdAt;
      return {
        id: t.id,
        name: t.name,
        isDefault,
        surfaceWidthCm: t.surface.widthCm,
        surfaceHeightCm: t.surface.heightCm,
        fields: JSON.stringify(t.fields),
        createdAt,
        updatedAt,
      };
    });

    await prisma.$transaction(async (tx) => {
      for (const row of rows) {
        await tx.chequeDesignerTemplate.create({ data: row });
      }
      await tx.setting.create({
        data: {
          key: LEGACY_IMPORT_MARKER_KEY,
          value: JSON.stringify({ at: new Date().toISOString(), count: rows.length, reason: 'imported' }),
          group: 'general',
        },
      });
    });

    await recordAudit({
      req,
      action: 'CREATE',
      module: 'cheques',
      newValue: { chequeDesignerLegacyImport: rows.length, ids: rows.map((r) => r.id) },
    });
    return { imported: true, count: rows.length, reason: 'imported' };
  }

  /**
   * Has the one-time import already been settled for this database? The client
   * asks before sending anything, so a machine with no legacy data — the normal
   * case from now on — never posts a payload at all.
   */
  async legacyImportStatus(): Promise<{ done: boolean }> {
    const marker = await prisma.setting.findUnique({ where: { key: LEGACY_IMPORT_MARKER_KEY } });
    return { done: marker !== null };
  }

  /**
   * Should the client bother scanning previous `userData` folders for stranded
   * templates? All three cheap server-side preconditions are evaluated here, so
   * a database that has nothing to recover never causes a single file to be
   * opened on disk.
   *
   * Eligible only when: no recovery has run, the ordinary migration has not run
   * either, and the templates table is empty.
   */
  async legacyRecoveryStatus(): Promise<{ eligible: boolean; reason: string }> {
    const [recoveryMarker, importMarker, existing] = await Promise.all([
      prisma.setting.findUnique({ where: { key: LEGACY_RECOVERY_MARKER_KEY } }),
      prisma.setting.findUnique({ where: { key: LEGACY_IMPORT_MARKER_KEY } }),
      prisma.chequeDesignerTemplate.count(),
    ]);
    if (recoveryMarker) return { eligible: false, reason: 'already-recovered' };
    if (importMarker) return { eligible: false, reason: 'already-migrated' };
    if (existing > 0) return { eligible: false, reason: 'db-not-empty' };
    return { eligible: true, reason: 'eligible' };
  }

  /**
   * ONE-TIME recovery of templates found in a PREVIOUS `userData` folder.
   *
   * Templates stranded there are unreachable to the ordinary migration, because
   * the current application's browser storage is a different Chromium partition
   * entirely — a different `userData` path and, usually, a different page
   * origin. The renderer reads them through a read-only main-process scan and
   * posts them here.
   *
   * Every precondition is RE-CHECKED here rather than trusted from the status
   * call, and the whole thing lands in one transaction, so two clients racing —
   * or one client retrying after a lost response — cannot import twice or
   * import over existing data. The marker is written on EVERY outcome including
   * the refusals, so the question is asked exactly once per database.
   */
  async recoverLegacy(
    input: ImportLegacyInput & { source?: unknown },
    req: Request,
  ): Promise<{ recovered: boolean; count: number; reason: string }> {
    const status = await this.legacyRecoveryStatus();
    if (!status.eligible) {
      // Not eligible because of a marker → that marker already settles it.
      // Not eligible because the table has rows → record the refusal so the
      // client stops asking on every launch.
      if (status.reason === 'db-not-empty') await this.writeRecoveryMarker(0, status.reason);
      return { recovered: false, count: 0, reason: status.reason };
    }

    let defaultSeen = false;
    const rows = input.templates.map((t) => {
      const isDefault = t.isDefault && !defaultSeen;
      if (isDefault) defaultSeen = true;
      const createdAt = t.createdAt ? new Date(t.createdAt) : new Date();
      const updatedAt = t.updatedAt ? new Date(t.updatedAt) : createdAt;
      return {
        id: t.id,
        name: t.name,
        isDefault,
        surfaceWidthCm: t.surface.widthCm,
        surfaceHeightCm: t.surface.heightCm,
        fields: JSON.stringify(t.fields),
        createdAt,
        updatedAt,
      };
    });

    await prisma.$transaction(async (tx) => {
      for (const row of rows) {
        await tx.chequeDesignerTemplate.create({ data: row });
      }
      await tx.setting.create({
        data: {
          key: LEGACY_RECOVERY_MARKER_KEY,
          value: JSON.stringify({
            at: new Date().toISOString(),
            count: rows.length,
            reason: 'recovered',
            source: input.source ?? null,
          }),
          group: 'general',
        },
      });
    });

    await recordAudit({
      req,
      action: 'CREATE',
      module: 'cheques',
      newValue: {
        chequeDesignerLegacyRecovery: rows.length,
        ids: rows.map((r) => r.id),
        source: input.source ?? null,
      },
    });
    return { recovered: true, count: rows.length, reason: 'recovered' };
  }

  private async writeRecoveryMarker(count: number, reason: string): Promise<void> {
    await prisma.setting.upsert({
      where: { key: LEGACY_RECOVERY_MARKER_KEY },
      update: {},
      create: {
        key: LEGACY_RECOVERY_MARKER_KEY,
        value: JSON.stringify({ at: new Date().toISOString(), count, reason }),
        group: 'general',
      },
    });
  }

  private async writeMarker(count: number, reason: string): Promise<void> {
    await prisma.setting.upsert({
      where: { key: LEGACY_IMPORT_MARKER_KEY },
      update: {},
      create: {
        key: LEGACY_IMPORT_MARKER_KEY,
        value: JSON.stringify({ at: new Date().toISOString(), count, reason }),
        group: 'general',
      },
    });
  }

  private async mustExist(id: string): Promise<TemplateRow> {
    const row = await prisma.chequeDesignerTemplate.findUnique({ where: { id } });
    if (!row) throw AppError.notFound('القالب غير موجود');
    return row;
  }
}

export const chequeDesignerTemplatesService = new ChequeDesignerTemplatesService();
