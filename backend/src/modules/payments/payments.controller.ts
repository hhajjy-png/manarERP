import { Request, Response } from 'express';
import { paymentsService } from './payments.service';
import { ok } from '../../core/utils/response';

export const paymentsController = {
  async correctCollectionDate(req: Request, res: Response) {
    // paymentId مُتحقَّق منه تصريحيًا في المخطط (params) عبر validate middleware.
    const paymentId = Number(req.params.paymentId);
    const result = await paymentsService.correctCollectionDate(paymentId, req.body, req);
    // نمرّر رسالة العمل من الخدمة (تصحيح فعلي أو "لا تغيير") لتظهر للمستخدم.
    ok(res, { changed: result.changed, payment: result.payment }, result.message);
  },
};
