import { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * يغلّف معالجات الـ controller غير المتزامنة لتمرير أي خطأ تلقائيًا
 * إلى معالج الأخطاء المركزي دون الحاجة لـ try/catch في كل دالة.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
