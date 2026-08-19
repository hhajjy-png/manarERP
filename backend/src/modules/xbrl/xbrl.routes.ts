/**
 * مسارات جاهزية XBRL.
 *
 * كل مسار خلف `authenticate` + `requirePermission('xbrl.*')`. ثلاثة مفاتيح لا أكثر:
 *   • `xbrl.read`     — كل القراءات.
 *   • `xbrl.manage`   — كل الكتابات على بيانات الإعداد (تصنيفات، مفاهيم، ربط، سياق).
 *   • `xbrl.snapshot` — إنشاء لقطة فقط.
 *
 * ⚠ **لا يوجد PATCH ولا PUT ولا DELETE على `/snapshots`** — ولا يجوز أن يوجد. اللقطة
 *   غير قابلة للتعديل، وغياب المسار هو ما يضمن ذلك فعليًا لا مجرد وثيقة.
 */
import { Router } from 'express';
import { authenticate } from '../../core/middleware/auth.middleware';
import { requirePermission } from '../../core/middleware/rbac.middleware';
import { validate } from '../../core/middleware/validate.middleware';
import { asyncHandler } from '../../core/utils/asyncHandler';
import {
  accountMappingController,
  conceptController,
  contextController,
  exportController,
  readinessController,
  snapshotController,
  statementMappingController,
  taxonomyController,
} from './xbrl.controller';
import {
  createAccountMappingSchema,
  createConceptSchema,
  createContextSchema,
  createSnapshotSchema,
  createStatementMappingSchema,
  createTaxonomySchema,
  exportSchema,
  idParamsSchema,
  listAccountMappingsSchema,
  listConceptsSchema,
  listContextsSchema,
  listSnapshotsSchema,
  listStatementMappingsSchema,
  listTaxonomiesSchema,
  readinessQuerySchema,
  setTaxonomyStatusSchema,
  updateAccountMappingSchema,
  updateConceptSchema,
  updateContextSchema,
  updateStatementMappingSchema,
  updateTaxonomySchema,
} from './xbrl.schema';

const router = Router();
router.use(authenticate);

const READ = requirePermission('xbrl.read');
const MANAGE = requirePermission('xbrl.manage');
const SNAPSHOT = requirePermission('xbrl.snapshot');

// ── الجاهزية والتحقق ─────────────────────────────────────────────────────────
router.get('/readiness', READ, validate(readinessQuerySchema), asyncHandler(readinessController.getReport));
router.get('/validation', READ, validate(readinessQuerySchema), asyncHandler(readinessController.validate));

// ── التصنيفات ────────────────────────────────────────────────────────────────
router.get('/taxonomies', READ, validate(listTaxonomiesSchema), asyncHandler(taxonomyController.list));
router.get('/taxonomies/:id', READ, validate(idParamsSchema), asyncHandler(taxonomyController.getById));
router.post('/taxonomies', MANAGE, validate(createTaxonomySchema), asyncHandler(taxonomyController.create));
router.patch('/taxonomies/:id', MANAGE, validate(updateTaxonomySchema), asyncHandler(taxonomyController.update));
router.patch('/taxonomies/:id/status', MANAGE, validate(setTaxonomyStatusSchema), asyncHandler(taxonomyController.setStatus));
router.delete('/taxonomies/:id', MANAGE, validate(idParamsSchema), asyncHandler(taxonomyController.remove));

// ── المفاهيم ─────────────────────────────────────────────────────────────────
router.get('/concepts', READ, validate(listConceptsSchema), asyncHandler(conceptController.list));
router.get('/concepts/:id', READ, validate(idParamsSchema), asyncHandler(conceptController.getById));
router.post('/concepts', MANAGE, validate(createConceptSchema), asyncHandler(conceptController.create));
router.patch('/concepts/:id', MANAGE, validate(updateConceptSchema), asyncHandler(conceptController.update));
router.delete('/concepts/:id', MANAGE, validate(idParamsSchema), asyncHandler(conceptController.remove));

// ── ربط الحسابات ─────────────────────────────────────────────────────────────
router.get('/account-mappings', READ, validate(listAccountMappingsSchema), asyncHandler(accountMappingController.list));
router.post('/account-mappings', MANAGE, validate(createAccountMappingSchema), asyncHandler(accountMappingController.create));
router.patch('/account-mappings/:id', MANAGE, validate(updateAccountMappingSchema), asyncHandler(accountMappingController.update));
router.delete('/account-mappings/:id', MANAGE, validate(idParamsSchema), asyncHandler(accountMappingController.remove));

// ── ربط بنود القوائم المالية ─────────────────────────────────────────────────
router.get('/statement-mappings', READ, validate(listStatementMappingsSchema), asyncHandler(statementMappingController.list));
router.post('/statement-mappings', MANAGE, validate(createStatementMappingSchema), asyncHandler(statementMappingController.create));
router.patch('/statement-mappings/:id', MANAGE, validate(updateStatementMappingSchema), asyncHandler(statementMappingController.update));
router.delete('/statement-mappings/:id', MANAGE, validate(idParamsSchema), asyncHandler(statementMappingController.remove));

// ── سياق التقرير ─────────────────────────────────────────────────────────────
router.get('/contexts', READ, validate(listContextsSchema), asyncHandler(contextController.list));
router.get('/contexts/:id', READ, validate(idParamsSchema), asyncHandler(contextController.getById));
router.post('/contexts', MANAGE, validate(createContextSchema), asyncHandler(contextController.create));
router.patch('/contexts/:id', MANAGE, validate(updateContextSchema), asyncHandler(contextController.update));
router.delete('/contexts/:id', MANAGE, validate(idParamsSchema), asyncHandler(contextController.remove));

// ── اللقطات — إنشاء وقراءة فقط ───────────────────────────────────────────────
router.get('/snapshots', READ, validate(listSnapshotsSchema), asyncHandler(snapshotController.list));
router.get('/snapshots/:id', READ, validate(idParamsSchema), asyncHandler(snapshotController.getById));
router.post('/snapshots', SNAPSHOT, validate(createSnapshotSchema), asyncHandler(snapshotController.create));

// ── التصدير ──────────────────────────────────────────────────────────────────
// `xbrl.read` كافٍ: المخرَج الوحيد المتاح في v1 معاينة داخلية للقراءة، والمُصدِّر
// الرسمي يرفض قبل إنتاج أي بايت — فلا حاجة لمفتاح صلاحية يحرس بابًا مغلقًا.
router.post('/export', READ, validate(exportSchema), asyncHandler(exportController.run));

export default router;
