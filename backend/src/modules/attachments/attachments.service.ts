import fs from 'fs';
import path from 'path';
import type { Request } from 'express';
import { prisma } from '@config/database';
import { env } from '@config/env';
import { AppError } from '@core/errors/AppError';
import { recordAudit } from '@core/middleware/audit';
import { hasRolePermission } from '@core/middleware/rbac.middleware';

const ALLOWED_ENTITY_TYPES = new Set([
  'CUSTOMER', 'CONTRACT', 'INVOICE', 'EMPLOYEE', 'SUPPLIER', 'EXPENSE', 'EQUIPMENT',
]);

/** Entity-type → minimum permission required for read access to its attachments. */
export const ENTITY_READ_PERM: Record<string, string> = {
  CUSTOMER:  'customers.read',
  CONTRACT:  'contracts.read',
  INVOICE:   'invoices.read',
  EMPLOYEE:  'employees.read',
  SUPPLIER:  'suppliers.read',
  EXPENSE:   'expenses.read',
  EQUIPMENT: 'equipment.read',
};

/** Entity-type → minimum permission required for write/delete access to its attachments. */
export const ENTITY_WRITE_PERM: Record<string, string> = {
  CUSTOMER:  'customers.update',
  CONTRACT:  'contracts.update',
  INVOICE:   'invoices.update',
  EMPLOYEE:  'employees.update',
  SUPPLIER:  'suppliers.update',
  EXPENSE:   'expenses.update',
  EQUIPMENT: 'equipment.update',
};

export class AttachmentsService {
  /** Throws AppError.forbidden if the actor lacks the entity-module permission required to read this entity type's attachments. */
  assertReadPermission(entityType: string, roleName: string, permissions: string[] | undefined): void {
    const perm = ENTITY_READ_PERM[entityType];
    if (perm && !hasRolePermission(roleName, permissions, perm)) {
      throw AppError.forbidden('ليست لديك صلاحية لعرض مرفقات هذا النوع');
    }
  }

  /** Throws AppError.forbidden if the actor lacks the entity-module permission required to write/delete this entity type's attachments. */
  assertWritePermission(entityType: string, roleName: string, permissions: string[] | undefined, message: string): void {
    const perm = ENTITY_WRITE_PERM[entityType];
    if (perm && !hasRolePermission(roleName, permissions, perm)) {
      throw AppError.forbidden(message);
    }
  }

  /** The entityType of an existing attachment, or null if it doesn't exist — used to authorize a delete before touching the file/row. */
  async findEntityType(id: number): Promise<string | null> {
    const attachment = await prisma.attachment.findUnique({ where: { id }, select: { entityType: true } });
    return attachment?.entityType ?? null;
  }

  storageDir(entityType: string, entityId: number): string {
    if (!ALLOWED_ENTITY_TYPES.has(entityType)) throw new Error('invalid entityType');
    const base = path.resolve(process.cwd(), env.ATTACHMENTS_DIR);
    const dir = path.resolve(path.join(base, entityType, String(entityId)));
    if (!dir.startsWith(base + path.sep)) throw new Error('invalid storage path');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  async list(entityType: string, entityId: number) {
    return prisma.attachment.findMany({
      where: { entityType, entityId },
      orderBy: { uploadedAt: 'desc' },
      include: { uploadedBy: { select: { username: true, fullName: true } } },
    });
  }

  /**
   * Persists an uploaded file's metadata row. `file` is the multer-handled disk file
   * (already validated/stored by the route's upload middleware). Cleans up the
   * on-disk file if the DB insert fails, so a failed upload never leaves an orphan.
   */
  async create(
    entityType: string,
    entityId: number,
    title: string,
    file: { filename: string; originalname: string; path: string; size: number; mimetype: string },
    uploadedById: number,
    req: Request,
  ) {
    let att;
    try {
      att = await prisma.attachment.create({
        data: {
          entityType,
          entityId,
          title,
          fileName:     file.filename,
          originalName: file.originalname,
          filePath:     file.path,
          fileSize:     file.size,
          mimeType:     file.mimetype,
          uploadedById,
        },
      });
    } catch (err) {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      throw err;
    }

    await recordAudit({
      req,
      action: 'CREATE',
      module: 'attachments',
      entityId: att.id,
      newValue: JSON.stringify({ entityType, entityId, fileName: att.originalName }),
    });

    return att;
  }

  async remove(id: number, userId: number, req: Request): Promise<void> {
    const att = await prisma.attachment.findUnique({ where: { id } });
    if (!att) throw AppError.notFound('المرفق غير موجود');

    if (fs.existsSync(att.filePath)) {
      fs.unlinkSync(att.filePath);
    }

    await prisma.attachment.delete({ where: { id } });

    await recordAudit({
      req,
      action: 'DELETE',
      module: 'attachments',
      entityId: id,
      oldValue: JSON.stringify({
        entityType: att.entityType,
        entityId:   att.entityId,
        fileName:   att.originalName,
      }),
    });
  }
}

export const attachmentsService = new AttachmentsService();
