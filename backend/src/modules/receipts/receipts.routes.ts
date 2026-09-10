import { Router } from 'express';
import { authenticate } from '../../core/middleware/auth.middleware';
import { requirePermission } from '../../core/middleware/rbac.middleware';
import { asyncHandler } from '../../core/utils/asyncHandler';
import { receiptsController } from './receipts.controller';

/**
 * المقبوضات — قراءة فقط، بلا أي مسار كتابة.
 *
 * ═══ لماذا `invoices.read` ولا مفتاح صلاحية جديد ═══
 * البيانات المعروضة هي حرفيًا `Payment` لفواتير المبيعات — وهي مكشوفة أصلًا لكل
 * من يملك `invoices.read` عبر `GET /invoices/:id` (الدفعات ضمن `FULL_INCLUDE`)
 * وعبر عمود «المحصّل» في قائمة الفواتير. فالصفحة **لا تكشف بيانًا جديدًا**، وإنما
 * تعيد ترتيب بيان مكشوف.
 *
 * إنشاء `receipts.*` كان سيتطلّب تعديل `constants.ts` + `seed.ts` + إعادة توزيع
 * الصلاحيات على الأدوار في قواعد بيانات **منشورة أصلًا** — مخاطرة تشغيلية بلا
 * مقابل أمني. نفس السابقة ونفس التعليل المعتمدين في `collectionAnalysis.routes.ts`
 * (الذي أعاد استخدام `reports.read` للسبب ذاته).
 *
 * التصدير إلى Excel يجري في الواجهة من نفس نقطة القائمة (بلا نقطة تصدير خادمية
 * جديدة)، وتحرسه الواجهة بـ`reports.export` — نفس ما تفعله صفحة المصروفات.
 */
const router = Router();
router.use(authenticate);

router.get('/', requirePermission('invoices.read'), asyncHandler(receiptsController.list));
router.get('/summary', requirePermission('invoices.read'), asyncHandler(receiptsController.summary));

export default router;
