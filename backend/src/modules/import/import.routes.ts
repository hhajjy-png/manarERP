import { Router } from 'express';
import { authenticate } from '../../core/middleware/auth.middleware';
import { requirePermission } from '../../core/middleware/rbac.middleware';
import { validateImportBody, previewHandler, executeHandler } from './import.controller';

const router = Router();
router.use(authenticate);

router.post('/preview', requirePermission('import.read'), validateImportBody, previewHandler);
router.post('/execute', requirePermission('import.create'), validateImportBody, executeHandler);

export default router;
