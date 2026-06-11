import { Router } from 'express';
import { authenticate } from '@core/middleware/auth.middleware';
import { requirePermission } from '@core/middleware/rbac.middleware';
import { validate } from '@core/middleware/validate.middleware';
import { createPriceSchema, updatePriceSchema, lookupPriceSchema } from './prices.schema';
import * as ctrl from './prices.controller';

const router = Router();

router.use(authenticate);

// ملاحظة: /lookup يجب أن يسبق /:id لتجنب تفسير "lookup" كـ id رقمي
router.get('/lookup', requirePermission('prices.read'), validate(lookupPriceSchema), ctrl.lookup);
router.get('/', requirePermission('prices.read'), ctrl.list);
router.post('/', requirePermission('prices.create'), validate(createPriceSchema), ctrl.create);
router.patch('/:id', requirePermission('prices.update'), validate(updatePriceSchema), ctrl.update);
router.delete('/:id', requirePermission('prices.delete'), ctrl.remove);

export default router;
