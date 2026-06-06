import { NextFunction, Request, Response } from 'express';
import { AnyZodObject, ZodError } from 'zod';

/**
 * التحقق من مدخلات الطلب باستخدام مخطط Zod.
 * يتحقق من body / query / params حسب المخطط الممرّر، ويستبدل القيم بالنسخة المُنقّاة.
 */
export function validate(schema: AnyZodObject) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      if (parsed.body) req.body = parsed.body;
      // query و params للقراءة فقط في بعض إصدارات Express؛ نكتفي بالتحقق منها.
      next();
    } catch (err) {
      if (err instanceof ZodError) return next(err);
      next(err);
    }
  };
}
