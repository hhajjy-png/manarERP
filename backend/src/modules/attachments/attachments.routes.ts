import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { authenticate } from '@core/middleware/auth.middleware';
import { requirePermission } from '@core/middleware/rbac.middleware';
import { asyncHandler } from '@core/utils/asyncHandler';
import { ok, created } from '@core/utils/response';
import { recordAudit } from '@core/middleware/audit';
import { AppError } from '@core/errors/AppError';
import { prisma } from '@config/database';
import { attachmentsService } from './attachments.service';
import {
  listQuerySchema,
  deleteParamSchema,
  ALLOWED_MIME_TYPES,
  ALLOWED_ENTITY_TYPES,
} from './attachments.schema';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const { entityType, entityId } = req.query as { entityType: string; entityId: string };
      const dir = attachmentsService.storageDir(entityType, Number(entityId));
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if ((ALLOWED_MIME_TYPES as readonly string[]).includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`نوع الملف غير مسموح: ${file.mimetype}`));
    }
  },
});

const router = Router();
router.use(authenticate);

router.get(
  '/',
  requirePermission('attachments.read'),
  asyncHandler(async (req, res) => {
    const { entityType, entityId } = listQuerySchema.parse(req.query);
    ok(res, await attachmentsService.list(entityType, entityId));
  }),
);

router.post(
  '/',
  requirePermission('attachments.create'),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw AppError.badRequest('لم يتم رفع أي ملف');

    const { entityType, entityId } = listQuerySchema.parse(req.query);
    const title: string = (req.body.title as string) || req.file.originalname;

    if (!(ALLOWED_ENTITY_TYPES as readonly string[]).includes(entityType)) {
      // Clean up the already-uploaded file before throwing
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      throw AppError.badRequest('نوع الكيان غير مسموح');
    }

    let att;
    try {
      att = await prisma.attachment.create({
        data: {
          entityType,
          entityId:     Number(entityId),
          title,
          fileName:     req.file.filename,
          originalName: req.file.originalname,
          filePath:     req.file.path,
          fileSize:     req.file.size,
          mimeType:     req.file.mimetype,
          uploadedById: req.user!.userId,
        },
      });
    } catch (err) {
      // Clean up the uploaded file if DB insert fails
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      throw err;
    }

    await recordAudit({
      req,
      action: 'CREATE',
      module: 'attachments',
      entityId: att.id,
      newValue: JSON.stringify({ entityType, entityId, fileName: att.originalName }),
    });

    created(res, att, 'تم رفع المرفق');
  }),
);

router.delete(
  '/:id',
  requirePermission('attachments.delete'),
  asyncHandler(async (req, res) => {
    const { id } = deleteParamSchema.parse(req.params);
    await attachmentsService.remove(id, req.user!.userId, req);
    ok(res, null, 'تم حذف المرفق');
  }),
);

export default router;
