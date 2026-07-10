import { Router } from 'express';
import { chequesController } from './cheques.controller';
import { authenticate } from '../../core/middleware/auth.middleware';
import { requirePermission, requireRole } from '../../core/middleware/rbac.middleware';
import { validate } from '../../core/middleware/validate.middleware';
import { asyncHandler } from '../../core/utils/asyncHandler';
import {
  createChequeSchema,
  updateChequeSchema,
  forceDeleteChequeSchema,
  saveTemplateVersionSchema,
  reprintChequeSchema,
  saveCalibrationGeometrySchema,
} from './cheques.schema';
import { ROLES } from '../../config/constants';

const router = Router();
router.use(authenticate);

// /stats must be registered before /:id to avoid Express matching 'stats' as an id param
router.get('/stats', requirePermission('cheques.read'), asyncHandler(chequesController.stats));
router.get('/', requirePermission('cheques.read'), asyncHandler(chequesController.list));

// ── Cheque calibration template versions ──────────────────────────────────────
// Static prefix registered before /:id so 'template-versions' is never matched as
// an id. Gated on settings.update — the same permission the calibrator already
// requires, so no new permission key and no change to who can calibrate.
router.get('/template-versions/:bank', requirePermission('settings.update'), asyncHandler(chequesController.listTemplateVersions));
router.post('/template-versions', requirePermission('settings.update'), validate(saveTemplateVersionSchema), asyncHandler(chequesController.saveTemplateVersion));
router.post('/template-versions/:id/restore', requirePermission('settings.update'), asyncHandler(chequesController.restoreTemplateVersion));

// ── Calibration Studio geometry ───────────────────────────────────────────────
// Read: available to anyone who can calibrate (settings.update). Write: SYSTEM_ADMIN
// only — geometry is an advanced, printer-physical setting hidden from normal users.
router.get('/calibration-geometry', requirePermission('settings.update'), asyncHandler(chequesController.getCalibrationGeometry));
router.put('/calibration-geometry', requireRole(ROLES.SYSTEM_ADMIN), validate(saveCalibrationGeometrySchema), asyncHandler(chequesController.saveCalibrationGeometry));

// /:id/force (SYSTEM_ADMIN force-delete preview) must be registered before /:id
router.get('/:id/force', requireRole(ROLES.SYSTEM_ADMIN), asyncHandler(chequesController.forceRemovePreview));
router.get('/:id/print-logs', requirePermission('cheques.read'), asyncHandler(chequesController.listPrintLogs));
router.get('/:id', requirePermission('cheques.read'), asyncHandler(chequesController.getById));
router.post('/', requirePermission('cheques.create'), validate(createChequeSchema), asyncHandler(chequesController.create));
router.put('/:id', requirePermission('cheques.update'), validate(updateChequeSchema), asyncHandler(chequesController.update));
router.post('/:id/mark-printed', requirePermission('cheques.print'), asyncHandler(chequesController.markPrinted));
router.post('/:id/reprint', requirePermission('cheques.print'), validate(reprintChequeSchema), asyncHandler(chequesController.reprint));
router.post('/:id/cancel', requirePermission('cheques.cancel'), asyncHandler(chequesController.cancel));
router.post('/:id/payment-voucher-number', requirePermission('cheques.print'), asyncHandler(chequesController.generatePaymentVoucherNumber));
router.delete('/:id/force', requireRole(ROLES.SYSTEM_ADMIN), validate(forceDeleteChequeSchema), asyncHandler(chequesController.forceRemove));

export default router;
