import { Request, Response } from 'express';
import { ok } from '../../core/utils/response';
import { receiptsQueryService } from './receipts.service';
import { receiptFiltersSchema, receiptListSchema } from './receipts.schema';

/**
 * معالِجات رفيعة: تحقّق من المدخل ← استدعاء الخدمة ← استجابة موحّدة.
 *
 * التحقّق يجري هنا لا عبر `validate()` لأن العقد كلّه على `req.query`، والوسيط
 * المشترك لا يستبدل `query` (للقراءة فقط في Express 4) — فالتحليل في مكان
 * الاستهلاك هو ما يضمن أن الخدمة تستقبل قيمًا مُنقّاة فعلًا. نفس نمط
 * `collectionAnalysis.controller.ts`.
 */
export const receiptsController = {
  async list(req: Request, res: Response): Promise<void> {
    ok(res, await receiptsQueryService.list(receiptListSchema.parse(req.query)));
  },

  async summary(req: Request, res: Response): Promise<void> {
    ok(res, await receiptsQueryService.summary(receiptFiltersSchema.parse(req.query)));
  },
};
