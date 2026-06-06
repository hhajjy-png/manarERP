import { Request, Response } from 'express';
import { z } from 'zod';
import { rolesService } from './roles.service';
import { ok } from '../../core/utils/response';

const setPermsSchema = z.object({
  permissionIds: z.array(z.coerce.number().int().positive()),
});

export const rolesController = {
  async list(_req: Request, res: Response) {
    ok(res, await rolesService.listRoles());
  },
  async getById(req: Request, res: Response) {
    ok(res, await rolesService.getRole(Number(req.params.id)));
  },
  async permissions(_req: Request, res: Response) {
    ok(res, await rolesService.listPermissions());
  },
  async setPermissions(req: Request, res: Response) {
    const { permissionIds } = setPermsSchema.parse(req.body);
    ok(res, await rolesService.setRolePermissions(Number(req.params.id), permissionIds, req), 'تم تحديث الصلاحيات');
  },
};
