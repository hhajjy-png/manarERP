/**
 * Letter Engine — routes.
 *
 * Every route sits behind `authenticate` and an explicit `requirePermission`. There is
 * no open path and no route that infers its permission from another.
 *
 * ── WHY register AND cancel HAVE THEIR OWN PERMISSIONS ───────────────────
 * They are the two irreversible operations in the module. `letters.register` burns a
 * permanent number that can never be reused; `letters.cancel` withdraws an issued
 * document and reserves its number for ever. Both are consequences that cannot be
 * undone by a later edit, so authorising someone to draft letters must not implicitly
 * authorise either.
 *
 * ── WHY THERE IS NO PRINT ROUTE ──────────────────────────────────────────
 * Printing, PDF, preview and rendering belong to later packs. `letters.print` is
 * deliberately NOT created here: a permission with no route behind it is a promise
 * the system cannot keep, and it would show up in the roles screen as a capability
 * that silently does nothing.
 */

import { Router } from 'express';
import { authenticate } from '@core/middleware/auth.middleware';
import { requirePermission } from '@core/middleware/rbac.middleware';
import { validate } from '@core/middleware/validate.middleware';
import {
  archiveLetterSchema,
  bulkArchiveSchema,
  cancelLetterSchema,
  createLetterSchema,
  listLettersQuerySchema,
  registerLetterSchema,
  updateLetterSchema,
} from './letters.schema';
import * as ctrl from './letters.controller';

const router = Router();

router.use(authenticate);

// Static paths before `/:id`, or `/:id` swallows them as identifiers.
router.get('/gaps', requirePermission('letters.read'), ctrl.gaps);

// Bulk archiving shares `letters.archive` with the single-letter routes: same
// capability, applied to a selection.
router.post('/bulk-archive', requirePermission('letters.archive'), validate(bulkArchiveSchema), ctrl.bulkArchive);
router.post('/bulk-unarchive', requirePermission('letters.archive'), validate(bulkArchiveSchema), ctrl.bulkUnarchive);

router.get('/', requirePermission('letters.read'), validate(listLettersQuerySchema), ctrl.list);
router.post('/', requirePermission('letters.create'), validate(createLetterSchema), ctrl.create);

router.get('/:id', requirePermission('letters.read'), ctrl.getOne);
router.patch('/:id', requirePermission('letters.update'), validate(updateLetterSchema), ctrl.update);

// Irreversible: issues a permanent, never-reused reference number.
router.post('/:id/register', requirePermission('letters.register'), validate(registerLetterSchema), ctrl.register);

// Archiving is a FLAG, not a status transition — and it is reversible, so both
// directions share one permission: they are the same capability pointed two ways.
router.post('/:id/archive', requirePermission('letters.archive'), validate(archiveLetterSchema), ctrl.archive);
router.post('/:id/unarchive', requirePermission('letters.archive'), validate(archiveLetterSchema), ctrl.unarchive);

// Irreversible: withdraws the document and reserves its number for ever.
router.post('/:id/cancel', requirePermission('letters.cancel'), validate(cancelLetterSchema), ctrl.cancel);

// Draft-only, enforced in the service regardless of this permission.
router.delete('/:id', requirePermission('letters.delete'), ctrl.remove);

export default router;
