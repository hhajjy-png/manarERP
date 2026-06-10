import { Router } from 'express';
import { authenticate } from '@core/middleware/auth.middleware';
import { requirePermission } from '@core/middleware/rbac.middleware';
import { validate } from '@core/middleware/validate.middleware';
import { createPriceSchema, updatePriceSchema } from './prices.schema';
import * as ctrl from './prices.controller';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission('prices.read'), ctrl.list);
router.post('/', requirePermission('prices.create'), validate(createPriceSchema), ctrl.create);
router.patch('/:id', requirePermission('prices.update'), validate(updatePriceSchema), ctrl.update);
router.delete('/:id', requirePermission('prices.delete'), ctrl.remove);

export default router;
