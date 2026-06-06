import { Router } from 'express';
import { maintenanceController } from './maintenance.controller';
import { authenticate } from '../../core/middleware/auth.middleware';
import { requirePermission } from '../../core/middleware/rbac.middleware';
import { validate } from '../../core/middleware/validate.middleware';
import { asyncHandler } from '../../core/utils/asyncHandler';
import {
  createBreakdownSchema,
  createFuelSchema,
  createMaintenanceSchema,
  createSparePartSchema,
} from './maintenance.schema';

const router = Router();
router.use(authenticate);

const canRead = requirePermission('maintenance.read', 'equipment.read');
const canWrite = requirePermission('maintenance.create', 'equipment.update');

// سجلات الصيانة + تنبيهات الصيانة الدورية
router.get('/records', canRead, asyncHandler(maintenanceController.listRecords));
router.post('/records', canWrite, validate(createMaintenanceSchema), asyncHandler(maintenanceController.createRecord));
router.get('/due', canRead, asyncHandler(maintenanceController.due));

// الوقود
router.get('/fuel', canRead, asyncHandler(maintenanceController.listFuel));
router.post('/fuel', canWrite, validate(createFuelSchema), asyncHandler(maintenanceController.addFuel));

// الأعطال
router.get('/breakdowns', canRead, asyncHandler(maintenanceController.listBreakdowns));
router.post('/breakdowns', canWrite, validate(createBreakdownSchema), asyncHandler(maintenanceController.reportBreakdown));
router.patch('/breakdowns/:id/resolve', canWrite, asyncHandler(maintenanceController.resolveBreakdown));

// قطع الغيار
router.get('/spare-parts', canRead, asyncHandler(maintenanceController.listSpareParts));
router.post('/spare-parts', canWrite, validate(createSparePartSchema), asyncHandler(maintenanceController.addSparePart));

export default router;
