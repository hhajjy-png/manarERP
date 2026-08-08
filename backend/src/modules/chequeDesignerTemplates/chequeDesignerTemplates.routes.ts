import { Router } from 'express';
import { chequeDesignerTemplatesController } from './chequeDesignerTemplates.controller';
import { authenticate } from '../../core/middleware/auth.middleware';
import { requirePermission } from '../../core/middleware/rbac.middleware';
import { validate } from '../../core/middleware/validate.middleware';
import { asyncHandler } from '../../core/utils/asyncHandler';
import {
  createTemplateSchema,
  updateTemplateSchema,
  renameTemplateSchema,
  importLegacyTemplatesSchema,
  recoverLegacyTemplatesSchema,
} from './chequeDesignerTemplates.schema';

/**
 * Cheque Designer Templates — routes.
 *
 * Permission model deliberately reuses EXISTING keys, so no role gains or loses
 * access and no seed change is required:
 *   - read  → `cheques.read`: anyone who can work with cheques must be able to
 *     resolve the default template, because production printing depends on it;
 *   - write → `settings.update`: the exact key that already gates the Cheque
 *     Studio overlay hosting the designer (Cheques.tsx `canCalibrate`) and the
 *     Classic calibration template versions. Designing a cheque template is the
 *     same class of administrative action.
 *
 * Static prefixes are registered before `/:id` so `default` and `legacy-import`
 * are never matched as template ids.
 */

const router = Router();
router.use(authenticate);

router.get('/default', requirePermission('cheques.read'), asyncHandler(chequeDesignerTemplatesController.getDefault));
router.get('/legacy-import', requirePermission('cheques.read'), asyncHandler(chequeDesignerTemplatesController.legacyImportStatus));
router.post('/legacy-import', requirePermission('settings.update'), validate(importLegacyTemplatesSchema), asyncHandler(chequeDesignerTemplatesController.importLegacy));

// Legacy Cheque Template Recovery Pack v1 — templates stranded in a PREVIOUS
// `userData` folder. Same permission model as the migration above: the status
// probe is a read, the recovery itself is an administrative write.
router.get('/legacy-recovery', requirePermission('cheques.read'), asyncHandler(chequeDesignerTemplatesController.legacyRecoveryStatus));
router.post('/legacy-recovery', requirePermission('settings.update'), validate(recoverLegacyTemplatesSchema), asyncHandler(chequeDesignerTemplatesController.recoverLegacy));

router.get('/', requirePermission('cheques.read'), asyncHandler(chequeDesignerTemplatesController.list));
router.get('/:id', requirePermission('cheques.read'), asyncHandler(chequeDesignerTemplatesController.getById));

router.post('/', requirePermission('settings.update'), validate(createTemplateSchema), asyncHandler(chequeDesignerTemplatesController.create));
router.put('/:id', requirePermission('settings.update'), validate(updateTemplateSchema), asyncHandler(chequeDesignerTemplatesController.update));
router.patch('/:id/name', requirePermission('settings.update'), validate(renameTemplateSchema), asyncHandler(chequeDesignerTemplatesController.rename));
router.patch('/:id/default', requirePermission('settings.update'), asyncHandler(chequeDesignerTemplatesController.setDefault));
router.delete('/:id', requirePermission('settings.update'), asyncHandler(chequeDesignerTemplatesController.remove));

export default router;
