import { Router } from 'express';
import { z } from 'zod';
import { settingsService } from './settings.service';
import { authenticate } from '../../core/middleware/auth.middleware';
import { requirePermission } from '../../core/middleware/rbac.middleware';
import { asyncHandler } from '../../core/utils/asyncHandler';
import { ok } from '../../core/utils/response';
import { describeLock } from '../../shared/services/periodLock.service';

const router = Router();
router.use(authenticate);

const updateSchema = z.object({
  settings: z.array(z.object({ key: z.string().min(1), value: z.string(), group: z.string().optional() })).min(1),
});

router.get('/', requirePermission('settings.read'), asyncHandler(async (_req, res) => ok(res, await settingsService.getAll())));

// حالة قفل الفترة: يقرأها كل مستخدم مُصادَق عليه لأن نماذج الإدخال تحتاجها
// لتحذير المستخدم قبل الإرسال. تكشف تاريخًا واحدًا وصلاحية التجاوز — لا بيانات حساسة.
router.get('/period-lock', asyncHandler(async (_req, res) => ok(res, await describeLock())));

// ── تفضيلات المستخدم (Zero Data Loss Certification Pack v1) ──────────────────
//
// كانت هذه القيم تعيش في `localStorage` وحده: ملفات تعيين أعمدة الاستيراد التي
// يبنيها المستخدم، ملفات الطباعة المحفوظة لكل نموذج، مفضّلات التقارير والخطابات،
// عناصر القائمة المخفية. `localStorage` لا يدخل النسخ الاحتياطي ولا المزامنة، ولا
// ينتقل إلى جهاز جديد، ويُمحى عند تغيير `productName` (سابقة موثّقة: قوالب الشيكات
// التي احتاجت حزمة إنقاذ كاملة لاستعادتها). تخزينها في جدول `Setting` يضعها داخل
// `manar.db` فترثه في كل مسار حماية قائم.
//
// `authenticate` وحدها بلا `requirePermission`: تفضيلات المستخدم ملكه، ولا يجوز أن
// يعتمد حفظها على صلاحية `settings.update` الإدارية. الحماية أن الخادم يشتقّ هوية
// المالك من الجلسة ويُركّب بها البادئة، فلا يصل الطلب إلى مفتاح مستخدم آخر ولا إلى
// أي إعداد نظام مهما كان جسم الطلب.
const preferencesSchema = z.object({
  preferences: z
    .array(z.object({ key: z.string().min(1).max(200), value: z.string() }))
    .min(1)
    .max(200),
});

router.get(
  '/preferences',
  asyncHandler(async (req, res) => ok(res, await settingsService.getPreferences(req.user!.userId))),
);

router.put(
  '/preferences',
  asyncHandler(async (req, res) => {
    const { preferences } = preferencesSchema.parse(req.body);
    ok(res, await settingsService.setPreferences(req.user!.userId, preferences));
  }),
);

router.put(
  '/',
  requirePermission('settings.update'),
  asyncHandler(async (req, res) => {
    const { settings } = updateSchema.parse(req.body);
    ok(res, await settingsService.updateMany(settings, req), 'تم حفظ الإعدادات');
  }),
);

export default router;
