import { Router, Request, Response } from 'express';
import { authenticate } from '@core/middleware/auth.middleware';
import { asyncHandler } from '@core/utils/asyncHandler';
import { ok } from '@core/utils/response';
import { searchService } from './search.service';

const router = Router();
router.use(authenticate);

/**
 * GET /api/search?q=…
 *
 * لا `requirePermission` هنا عمدًا: البحث ليس وحدة بذاتها، بل **إسقاط لما يملك المستخدم
 * قراءته أصلًا**. الحجب داخل الخدمة، لكل كيان بمفتاحه (`customers.read` …). مستخدم بلا أي
 * صلاحية قراءة يحصل على نتيجة فارغة — لا 403 مضلّلة عن وجود بيانات.
 *
 * ولا تدقيق: نص البحث قد يحوي اسم عميل أو رقم فاتورة، وتسجيله يُراكم بيانات بلا قيمة
 * تدقيقية. فتح السجل نفسه (فاتورة، موظف) يُدقَّق في مساره الخاص كما هو.
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const results = await searchService.search(q, {
      roleName: req.user!.roleName,
      permissions: req.permissions ?? [],
    });
    ok(res, results);
  }),
);

export default router;
