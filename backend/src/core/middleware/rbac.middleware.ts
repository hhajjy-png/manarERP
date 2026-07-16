import { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/AppError';
import { ROLES } from '../../config/constants';

/**
 * فحص الصلاحيات (RBAC).
 * يُستخدم بعد authenticate. يتحقق أن المستخدم يملك صلاحية واحدة على الأقل
 * من الصلاحيات المطلوبة. مدير النظام يتجاوز الفحص دائمًا.
 *
 * مثال: router.post('/', authenticate, requirePermission('invoices.create'), ...)
 */
export function requirePermission(...required: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(AppError.unauthorized());

    // مدير النظام لديه كل الصلاحيات
    if (req.user.roleName === ROLES.SYSTEM_ADMIN) return next();

    const granted = req.permissions ?? [];
    const allowed = required.some((perm) => granted.includes(perm));

    if (!allowed) {
      return next(AppError.forbidden('ليست لديك صلاحية لتنفيذ هذا الإجراء'));
    }
    next();
  };
}

/**
 * فحص صلاحية فردي، بمعزل عن middleware المسار — لحالات لا يُعرف فيها اسم
 * الصلاحية المطلوبة إلا وقت التشغيل (مثلاً صلاحية تعتمد على entityType من الطلب،
 * كما في وحدتي attachments وapproval)، فلا يمكن استخدام requirePermission
 * الثابتة وقت تعريف المسار. نفس قاعدة مدير النظام: يتجاوز الفحص دائمًا.
 */
export function hasRolePermission(
  roleName: string,
  permissions: string[] | undefined,
  perm: string,
): boolean {
  if (roleName === ROLES.SYSTEM_ADMIN) return true;
  return (permissions ?? []).includes(perm);
}

/** يقيّد المسار على أدوار محددة بالاسم. */
export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(AppError.unauthorized());
    if (req.user.roleName === ROLES.SYSTEM_ADMIN) return next();
    if (!roles.includes(req.user.roleName)) {
      return next(AppError.forbidden());
    }
    next();
  };
}
