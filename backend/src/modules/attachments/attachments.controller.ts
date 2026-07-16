import fs from 'fs';
import { Request, Response } from 'express';
import { ok, created } from '@core/utils/response';
import { AppError } from '@core/errors/AppError';
import { attachmentsService } from './attachments.service';
import { listQuerySchema, deleteParamSchema } from './attachments.schema';

export const attachmentsController = {
  async list(req: Request, res: Response) {
    const { entityType, entityId } = listQuerySchema.parse(req.query);
    attachmentsService.assertReadPermission(entityType, req.user!.roleName, req.permissions);
    ok(res, await attachmentsService.list(entityType, entityId));
  },

  async create(req: Request, res: Response) {
    if (!req.file) throw AppError.badRequest('لم يتم رفع أي ملف');
    const { entityType, entityId } = listQuerySchema.parse(req.query);
    const title: string = (req.body.title as string) || req.file.originalname;

    try {
      attachmentsService.assertWritePermission(
        entityType,
        req.user!.roleName,
        req.permissions,
        'ليست لديك صلاحية لرفع مرفقات لهذا النوع',
      );
    } catch (err) {
      // Zod already validated entityType/entityId above — clean up the file multer
      // already wrote to disk before this permission check ran.
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      throw err;
    }

    const att = await attachmentsService.create(
      entityType,
      Number(entityId),
      title,
      req.file,
      req.user!.userId,
      req,
    );
    created(res, att, 'تم رفع المرفق');
  },

  async remove(req: Request, res: Response) {
    const { id } = deleteParamSchema.parse(req.params);

    // Entity-module write permission is enforced against the attachment's own
    // entityType, not a route-time-known one — mirrors the read/create checks.
    const entityType = await attachmentsService.findEntityType(id);
    if (entityType) {
      attachmentsService.assertWritePermission(
        entityType,
        req.user!.roleName,
        req.permissions,
        'ليست لديك صلاحية لحذف مرفقات هذا النوع',
      );
    }

    await attachmentsService.remove(id, req.user!.userId, req);
    ok(res, null, 'تم حذف المرفق');
  },
};
