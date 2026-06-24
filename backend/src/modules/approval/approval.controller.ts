import type { Request, Response } from 'express';
import { approvalEngine } from '@shared/services/approval.service';
import { ok } from '@core/utils/response';
import { ROLES } from '@config/constants';

export const approvalController = {
  async getHistory(req: Request, res: Response): Promise<void> {
    const { entityType, entityId } = req.params;
    const id = Number(entityId);

    // Basic param validation
    if (!entityType || !id || Number.isNaN(id)) {
      res.status(400).json({ success: false, error: 'entityType و entityId مطلوبان' });
      return;
    }

    // Reject unregistered entity types
    if (!approvalEngine.hasModule(entityType)) {
      res.status(400).json({ success: false, error: 'نوع الكيان غير معروف' });
      return;
    }

    // Permission check: if the module declares historyPermission, enforce it
    // SYSTEM_ADMIN always bypasses
    const historyPermission = approvalEngine.getHistoryPermission(entityType);
    if (historyPermission) {
      const user = req.user!;
      const isAdmin = user.roleName === ROLES.SYSTEM_ADMIN;
      const hasPermission = Array.isArray(req.permissions) && req.permissions.includes(historyPermission);
      if (!isAdmin && !hasPermission) {
        res.status(403).json({ success: false, error: 'ليس لديك صلاحية عرض سجل الاعتماد' });
        return;
      }
    }

    const history = await approvalEngine.getHistory(entityType, id);
    ok(res, history);
  },
};
