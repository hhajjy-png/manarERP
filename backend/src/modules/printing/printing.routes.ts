import { Router } from 'express';
import { authenticate } from '../../core/middleware/auth.middleware';
import { validate } from '../../core/middleware/validate.middleware';
import { asyncHandler } from '../../core/utils/asyncHandler';
import { printingController } from './printing.controller';
import { printEventSchema } from './printing.schema';

const router = Router();

// Authentication is mandatory — an unauthenticated caller is rejected before the
// handler runs, and the acting user is taken from the JWT, never from the body.
router.use(authenticate);

/**
 * POST /api/printing/events — record a PRINT / PDF_EXPORT outcome in the AuditLog.
 *
 * PERMISSION MODEL (deliberate, and disclosed):
 *
 * This route is gated by `authenticate` only — it carries NO dedicated permission
 * key. That is not an oversight:
 *
 *   • Permission keys are generated from the explicit `MODULE_ACTIONS` map in
 *     prisma/seed.ts. A new `printing.create` key would not exist in any ALREADY
 *     DEPLOYED database until it is reseeded. Every non-SYSTEM_ADMIN user would then
 *     get a 403 here, the client would swallow it (audit must never block a print),
 *     and the result would be an audit trail that silently does nothing — strictly
 *     worse than no gate at all.
 *
 *   • The endpoint is not a data surface: it writes one audit row about the caller's
 *     own action and returns `{ recorded: true }`. It reads nothing, exposes nothing,
 *     and cannot escalate anything.
 *
 *   • The ACT OF PRINTING remains governed where it always was — by each module's own
 *     permissions (`cheques.print`, `reports.export`, `payroll.read`, …). This route
 *     records an outcome; it does not authorize one.
 *
 * A dedicated `printing.*` permission lands with the `print_logs` table in a later
 * phase, where a migration + seed update happen together and the key is guaranteed to
 * exist before the gate depends on it.
 */
router.post('/events', validate(printEventSchema), asyncHandler(printingController.recordEvent));

export default router;
