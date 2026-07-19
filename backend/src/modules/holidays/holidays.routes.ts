import { Router } from 'express';
import { holidaysController } from './holidays.controller';
import { authenticate } from '../../core/middleware/auth.middleware';
import { requirePermission } from '../../core/middleware/rbac.middleware';
import { validate } from '../../core/middleware/validate.middleware';
import { asyncHandler } from '../../core/utils/asyncHandler';
import { createHolidaySchema, generateHolidaysSchema } from './holidays.schema';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('employees.read'), asyncHandler(holidaysController.list));
router.post('/', requirePermission('employees.update'), validate(createHolidaySchema), asyncHandler(holidaysController.create));
router.delete('/:id', requirePermission('employees.update'), asyncHandler(holidaysController.remove));

// توليد العطل (Kuwait Holiday Intelligence Pack v1) — مسارات إضافية جديدة فقط، لا تغيير
// على المسارات الثلاثة أعلاه. المعاينة تكفيها صلاحية القراءة؛ التطبيق (كتابة فعلية)
// يتطلّب نفس صلاحية الإضافة/الحذف الحاليتين.
router.post('/generate/preview', requirePermission('employees.read'), validate(generateHolidaysSchema), asyncHandler(holidaysController.previewGeneration));
router.post('/generate/apply', requirePermission('employees.update'), validate(generateHolidaysSchema), asyncHandler(holidaysController.applyGeneration));

export default router;
