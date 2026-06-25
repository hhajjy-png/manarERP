import { Router } from 'express';
import { authenticate } from '../../core/middleware/auth.middleware';
import { validate } from '../../core/middleware/validate.middleware';
import { verifyByUuidSchema } from './verification.schema';
import { verifyByUuidHandler } from './verification.controller';

const router = Router();
router.use(authenticate);

router.get('/:uuid', validate(verifyByUuidSchema), verifyByUuidHandler);

export default router;
