import { Request } from 'express';
import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';
import { hashPassword, verifyPassword } from '../../core/utils/password';
import { signToken } from '../../core/utils/jwt';
import { recordAudit } from '../../core/middleware/audit';
import { ChangePasswordInput, LoginInput } from './auth.schema';

export class AuthService {
  /** تسجيل الدخول: التحقق من بيانات الاعتماد وإصدار رمز جلسة. */
  async login(input: LoginInput, req: Request) {
    const user = await prisma.user.findUnique({
      where: { username: input.username },
      include: {
        role: {
          include: { rolePermissions: { include: { permission: true } } },
        },
      },
    });

    if (!user || !user.isActive) {
      throw AppError.unauthorized('اسم المستخدم أو كلمة المرور غير صحيحة');
    }

    const valid = await verifyPassword(input.password, user.passwordHash);
    if (!valid) {
      throw AppError.unauthorized('اسم المستخدم أو كلمة المرور غير صحيحة');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const token = signToken({
      userId: user.id,
      username: user.username,
      roleId: user.roleId,
      roleName: user.role.name,
    });

    await recordAudit({ req, action: 'LOGIN', module: 'auth', entityId: user.id });

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        role: { id: user.role.id, name: user.role.name, displayName: user.role.displayName },
        permissions: user.role.rolePermissions.map((rp) => rp.permission.key),
      },
    };
  }

  /** بيانات المستخدم الحالي + صلاحياته. */
  async me(userId: number) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: { include: { rolePermissions: { include: { permission: true } } } },
      },
    });
    if (!user) throw AppError.notFound('المستخدم غير موجود');

    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      role: { id: user.role.id, name: user.role.name, displayName: user.role.displayName },
      permissions: user.role.rolePermissions.map((rp) => rp.permission.key),
    };
  }

  /** تغيير كلمة المرور للمستخدم الحالي. */
  async changePassword(userId: number, input: ChangePasswordInput, req: Request) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw AppError.notFound('المستخدم غير موجود');

    const valid = await verifyPassword(input.currentPassword, user.passwordHash);
    if (!valid) throw AppError.badRequest('كلمة المرور الحالية غير صحيحة');

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(input.newPassword) },
    });

    await recordAudit({ req, action: 'UPDATE', module: 'auth', entityId: userId, newValue: { passwordChanged: true } });
    return { changed: true };
  }
}

export const authService = new AuthService();
