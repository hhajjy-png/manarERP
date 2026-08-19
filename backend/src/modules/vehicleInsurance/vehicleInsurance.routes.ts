import { Router } from 'express';
import { authenticate } from '../../core/middleware/auth.middleware';
import { requirePermission } from '../../core/middleware/rbac.middleware';
import { validate } from '../../core/middleware/validate.middleware';
import { asyncHandler } from '../../core/utils/asyncHandler';
import { sendExcel } from '../../core/utils/excelResponse';
import { recordAudit } from '../../core/middleware/audit';
import { vehicleInsuranceController } from './vehicleInsurance.controller';
import { vehicleInsuranceService } from './vehicleInsurance.service';
import {
  createAccidentSchema,
  createPolicySchema,
  policyFiltersSchema,
  updateAccidentSchema,
  updatePolicySchema,
} from './vehicleInsurance.schema';

/**
 * تأمين المركبات — المسارات (Vehicle Insurance Management v1).
 *
 * كل مسار محروس بـ `authenticate` ثم مفتاح `vehicleInsurance.*` الخاص بالوحدة. لا يوجد
 * مسار DELETE لأيٍّ من الوثائق أو الحوادث عمدًا: التجديد يُنشئ سجلًا جديدًا، والسجل
 * التاريخي لا يُحذف.
 */
const router = Router();
router.use(authenticate);

const canRead = requirePermission('vehicleInsurance.read');
const canCreate = requirePermission('vehicleInsurance.create');
const canUpdate = requirePermission('vehicleInsurance.update');
const canExport = requirePermission('vehicleInsurance.export');

// ── المؤشرات وقوائم التغذية ───────────────────────────────────────────────────
router.get('/summary', canRead, asyncHandler(vehicleInsuranceController.summary));
router.get('/insurers', canRead, asyncHandler(vehicleInsuranceController.listInsurers));
router.get('/equipment-options', canRead, asyncHandler(vehicleInsuranceController.listEquipmentOptions));

// ── وثائق التأمين ─────────────────────────────────────────────────────────────
// `/policies` قبل `/` في القراءة لا يهم (مساران مختلفان)، لكن ترتيب التصدير قبل الجذر
// مقصود كي لا يُلتقط `/export` كقيمة مسار جذري في أي إعادة تنظيم لاحقة.
router.get(
  '/export',
  canExport,
  asyncHandler(async (req, res) => {
    const filters = policyFiltersSchema.parse(req.query);
    const buf = await vehicleInsuranceService.exportExcel(filters);
    await recordAudit({
      req,
      action: 'EXPORT',
      module: 'vehicleInsurance',
      entityId: 'vehicle-insurance',
      newValue: { format: 'excel', filters },
    });
    sendExcel(res, buf, 'vehicle-insurance.xlsx');
  }),
);
router.get('/policies', canRead, asyncHandler(vehicleInsuranceController.listPolicies));
router.post('/policies', canCreate, validate(createPolicySchema), asyncHandler(vehicleInsuranceController.createPolicy));
router.patch('/policies/:id', canUpdate, validate(updatePolicySchema), asyncHandler(vehicleInsuranceController.updatePolicy));

// ── سجل الحوادث ───────────────────────────────────────────────────────────────
router.get('/accidents', canRead, asyncHandler(vehicleInsuranceController.listAccidents));
router.post('/accidents', canCreate, validate(createAccidentSchema), asyncHandler(vehicleInsuranceController.createAccident));
router.patch('/accidents/:id', canUpdate, validate(updateAccidentSchema), asyncHandler(vehicleInsuranceController.updateAccident));

// ── الجدول الرئيسي ────────────────────────────────────────────────────────────
router.get('/', canRead, asyncHandler(vehicleInsuranceController.listCurrent));

export default router;
