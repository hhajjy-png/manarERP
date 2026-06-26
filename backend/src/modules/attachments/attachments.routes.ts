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
import { ROLES } from '@config/constants';
import { attachmentsService } from './attachments.service';
import {
  listQuerySchema,
  deleteParamSchema,
  ALLOWED_MIME_TYPES,
} from './attachments.schema';

// Entity-type → minimum permission required for read access
const ENTITY_READ_PERM: Record<string, string> = {
  CUSTOMER:  'customers.read',
  CONTRACT:  'contracts.read',
  INVOICE:   'invoices.read',
  EMPLOYEE:  'employees.read',
  SUPPLIER:  'suppliers.read',
  EXPENSE:   'expenses.read',
  EQUIPMENT: 'equipment.read',
};

// Entity-type → minimum permission required for write/delete access
const ENTITY_WRITE_PERM: Record<string, string> = {
  CUSTOMER:  'customers.update',
  CONTRACT:  'contracts.update',
  INVOICE:   'invoices.update',
  EMPLOYEE:  'employees.update',
  SUPPLIER:  'suppliers.update',
  EXPENSE:   'expenses.update',
  EQUIPMENT: 'equipment.update',
};

/** Returns true if the user has the required entity-module permission (SYSTEM_ADMIN always passes). */
function hasEntityPerm(
  roleName: string,
  permissions: string[],
  perm: string,
): boolean {
  if (roleName === ROLES.SYSTEM_ADMIN) return true;
  return permissions.includes(perm);
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const parsed = listQuerySchema.safeParse(req.query);
      if (!parsed.success) return cb(AppError.badRequest('نوع الكيان أو المعرّف غير صالح.'), '');
      const dir = attachmentsService.storageDir(parsed.data.entityType, parsed.data.entityId);
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const safeOriginal = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${randomUUID()}-${safeOriginal}`);
    },
  }),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if ((ALLOWED_MIME_TYPES as readonly string[]).includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(AppError.badRequest('نوع الملف غير مدعوم.'));
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

    const entityPerm = ENTITY_READ_PERM[entityType];
    if (entityPerm && !hasEntityPerm(req.user!.roleName, req.permissions ?? [], entityPerm)) {
      throw AppError.forbidden('ليست لديك صلاحية لعرض مرفقات هذا النوع');
    }

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

    // Enforce entity-module write permission (Zod already validates entityType above)
    const entityPerm = ENTITY_WRITE_PERM[entityType];
    if (entityPerm && !hasEntityPerm(req.user!.roleName, req.permissions ?? [], entityPerm)) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      throw AppError.forbidden('ليست لديك صلاحية لرفع مرفقات لهذا النوع');
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

    // Enforce entity-module write permission based on the attachment's entityType
    const attachment = await prisma.attachment.findUnique({ where: { id }, select: { entityType: true } });
    if (attachment) {
      const entityPerm = ENTITY_WRITE_PERM[attachment.entityType];
      if (entityPerm && !hasEntityPerm(req.user!.roleName, req.permissions ?? [], entityPerm)) {
        throw AppError.forbidden('ليست لديك صلاحية لحذف مرفقات هذا النوع');
      }
    }

    await attachmentsService.remove(id, req.user!.userId, req);
    ok(res, null, 'تم حذف المرفق');
  }),
);

export default router;
