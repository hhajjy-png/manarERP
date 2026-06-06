import { Request, Response } from 'express';
import { authService } from './auth.service';
import { ok } from '../../core/utils/response';
import { recordAudit } from '../../core/middleware/audit';

export const authController = {
  async login(req: Request, res: Response) {
    const result = await authService.login(req.body, req);
    ok(res, result, 'تم تسجيل الدخول بنجاح');
  },

  async me(req: Request, res: Response) {
    const result = await authService.me(req.user!.userId);
    ok(res, result);
  },

  async changePassword(req: Request, res: Response) {
    const result = await authService.changePassword(req.user!.userId, req.body, req);
    ok(res, result, 'تم تغيير كلمة المرور بنجاح');
  },

  async logout(req: Request, res: Response) {
    // الجلسة بلا حالة (Stateless JWT)؛ نكتفي بتسجيل العملية. الواجهة تحذف الرمز.
    await recordAudit({ req, action: 'LOGOUT', module: 'auth', entityId: req.user!.userId });
    ok(res, { loggedOut: true }, 'تم تسجيل الخروج');
  },
};
