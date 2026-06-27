import { Router } from 'express';
import { validate } from '../../core/middleware/validate.middleware';
import { verifyByUuidSchema } from './verification.schema';
import { verifyByUuidHandler } from './verification.controller';

const router = Router();

// Public endpoint — no authentication required for document verification
router.get('/:uuid', validate(verifyByUuidSchema), verifyByUuidHandler);

export default router;
