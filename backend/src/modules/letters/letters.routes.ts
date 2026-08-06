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
  createCommentSchema,
  createVersionSchema,
  listLettersQuerySchema,
  registerLetterSchema,
  resolveCommentSchema,
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

/* ── Version history and comments (Professional Document Automation v1) ────
   NO NEW PERMISSION KEYS. Both subsystems reuse the three the module already has:

     read   → `letters.read`    — seeing history and comments is seeing the letter.
     write  → `letters.update`  — taking a version, restoring one, opening a thread.
     delete → `letters.delete`  — removing a version or a comment.

   Inventing `letters.version` and `letters.comment` would mean two more keys in
   `constants.ts`, two more seed rows, and an administrator having to grant them
   before anyone could use a feature that is plainly part of editing a letter. The
   capability boundary is unchanged; only the surface it applies to is wider.

   Restoring is refused on a registered letter by the SERVICE, regardless of
   permission — a frozen document stays frozen for everyone. */

router.get('/:id/versions', requirePermission('letters.read'), ctrl.listVersions);
router.post('/:id/versions', requirePermission('letters.update'), validate(createVersionSchema), ctrl.createVersion);
router.get('/:id/versions/:versionId', requirePermission('letters.read'), ctrl.getVersion);
router.post('/:id/versions/:versionId/restore', requirePermission('letters.update'), ctrl.restoreVersion);
router.delete('/:id/versions/:versionId', requirePermission('letters.delete'), ctrl.deleteVersion);

router.get('/:id/comments', requirePermission('letters.read'), ctrl.listComments);
router.post('/:id/comments', requirePermission('letters.update'), validate(createCommentSchema), ctrl.createComment);
router.patch('/:id/comments/:commentId', requirePermission('letters.update'), validate(resolveCommentSchema), ctrl.resolveComment);
router.delete('/:id/comments/:commentId', requirePermission('letters.delete'), ctrl.deleteComment);

export default router;
