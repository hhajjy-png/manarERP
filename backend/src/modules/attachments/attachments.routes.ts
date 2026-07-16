import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { authenticate } from '@core/middleware/auth.middleware';
import { requirePermission } from '@core/middleware/rbac.middleware';
import { asyncHandler } from '@core/utils/asyncHandler';
import { AppError } from '@core/errors/AppError';
import { attachmentsService } from './attachments.service';
import { attachmentsController } from './attachments.controller';
import { listQuerySchema, ALLOWED_MIME_TYPES } from './attachments.schema';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

// Multer wiring is HTTP transport-layer concern (disk storage location/naming,
// upload size/type limits) — it stays here rather than in the controller, same
// as `validate(schema)` middleware stays in other modules' routes.ts files.
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

router.get('/', requirePermission('attachments.read'), asyncHandler(attachmentsController.list));
router.post(
  '/',
  requirePermission('attachments.create'),
  upload.single('file'),
  asyncHandler(attachmentsController.create),
);
router.delete('/:id', requirePermission('attachments.delete'), asyncHandler(attachmentsController.remove));

export default router;
