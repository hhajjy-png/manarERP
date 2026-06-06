import { NextFunction, Request, Response } from 'express';
import { verifyToken } from '../utils/jwt';
import { AppError } from '../errors/AppError';
import { prisma } from '../../config/database';

/**
 * التحقق من الجلسة: يستخرج الرمز من ترويسة Authorization،
 * يتحقق منه، يحمّل صلاحيات المستخدم، ويضعها على الطلب.
 */
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw AppError.unauthorized('رمز الدخول مفقود');
    }

    const token = header.slice(7);
    const payload = verifyToken(token);

    // التأكد من أن المستخدم ما زال نشطًا
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        isActive: true,
        role: {
          select: {
            name: true,
            rolePermissions: { select: { permission: { select: { key: true } } } },
          },
        },
      },
    });

    if (!user || !user.isActive) {
      throw AppError.unauthorized('الحساب غير مفعّل أو محذوف');
    }

    req.user = payload;
    req.permissions = user.role.rolePermissions.map((rp) => rp.permission.key);
    next();
  } catch (err) {
    if (err instanceof AppError) return next(err);
    next(AppError.unauthorized('جلسة غير صالحة أو منتهية'));
  }
}
