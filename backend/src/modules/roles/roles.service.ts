import { Request } from 'express';
import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';
import { recordAudit } from '../../core/middleware/audit';

export class RolesService {
  /** قائمة الأدوار مع عدد الصلاحيات والمستخدمين. */
  async listRoles() {
    return prisma.role.findMany({
      orderBy: { id: 'asc' },
      include: {
        _count: { select: { users: true, rolePermissions: true } },
      },
    });
  }

  /** دور واحد مع صلاحياته. */
  async getRole(id: number) {
    const role = await prisma.role.findUnique({
      where: { id },
      include: { rolePermissions: { include: { permission: true } } },
    });
    if (!role) throw AppError.notFound('الدور غير موجود');
    return {
      ...role,
      permissionKeys: role.rolePermissions.map((rp) => rp.permission.key),
    };
  }

  /** كل الصلاحيات المتاحة مجمّعة حسب الوحدة. */
  async listPermissions() {
    const perms = await prisma.permission.findMany({ orderBy: [{ module: 'asc' }, { action: 'asc' }] });
    const grouped: Record<string, typeof perms> = {};
    for (const p of perms) {
      (grouped[p.module] ??= []).push(p);
    }
    return { all: perms, grouped };
  }

  /** تحديث صلاحيات دور معيّن (استبدال كامل). */
  async setRolePermissions(roleId: number, permissionIds: number[], req: Request) {
    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw AppError.notFound('الدور غير موجود');

    await prisma.$transaction([
      prisma.rolePermission.deleteMany({ where: { roleId } }),
      prisma.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
      }),
    ]);

    await recordAudit({ req, action: 'UPDATE', module: 'roles', entityId: roleId, newValue: { permissionIds } });
    return this.getRole(roleId);
  }
}

export const rolesService = new RolesService();
