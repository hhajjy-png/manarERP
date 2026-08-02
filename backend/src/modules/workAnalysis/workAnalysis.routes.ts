import { Router } from 'express';
import { authenticate } from '@core/middleware/auth.middleware';
import { requirePermission } from '@core/middleware/rbac.middleware';
import { validate } from '@core/middleware/validate.middleware';
import { createWorkAnalysisSchema, updateWorkAnalysisSchema } from './workAnalysis.schema';
import * as ctrl from './workAnalysis.controller';

const router = Router();

// كل مسار خلف المصادقة ثم صلاحية صريحة — لا استثناء ولا مسار مفتوح.
router.use(authenticate);

router.get('/', requirePermission('workAnalysis.read'), ctrl.list);
router.get('/stats', requirePermission('workAnalysis.read'), ctrl.stats);
router.get('/owner-suggestions', requirePermission('workAnalysis.read'), ctrl.ownerSuggestions);
router.post('/', requirePermission('workAnalysis.create'), validate(createWorkAnalysisSchema), ctrl.create);
// المسارات ذات المعرّف بعد الثابتة، وإلا التقط `/:id` كلمة «stats» كمعرّف.
router.get('/:id', requirePermission('workAnalysis.read'), ctrl.getOne);
// تصدير قراءة بحت (Excel / HTML للـ PDF) — يبني المستند في الذاكرة، ولا يكتب شيئًا.
router.get('/:id/export', requirePermission('workAnalysis.export'), ctrl.exportOne);
router.patch('/:id', requirePermission('workAnalysis.update'), validate(updateWorkAnalysisSchema), ctrl.update);
router.post('/:id/archive', requirePermission('workAnalysis.update'), ctrl.archive);
router.delete('/:id', requirePermission('workAnalysis.delete'), ctrl.remove);

export default router;
