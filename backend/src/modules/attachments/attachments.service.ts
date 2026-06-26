import fs from 'fs';
import path from 'path';
import type { Request } from 'express';
import { prisma } from '@config/database';
import { env } from '@config/env';
import { AppError } from '@core/errors/AppError';
import { recordAudit } from '@core/middleware/audit';

export class AttachmentsService {
  storageDir(entityType: string, entityId: number): string {
    const dir = path.resolve(process.cwd(), env.ATTACHMENTS_DIR, entityType, String(entityId));
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
