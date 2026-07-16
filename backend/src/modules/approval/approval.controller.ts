import type { Request, Response } from 'express';
import { approvalEngine } from '@shared/services/approval.service';
import { ok } from '@core/utils/response';
import { hasRolePermission } from '@core/middleware/rbac.middleware';

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
    // (hasRolePermission — SYSTEM_ADMIN always bypasses, same dispatch shared
    // with the attachments module instead of a second, separately-maintained copy)
    const historyPermission = approvalEngine.getHistoryPermission(entityType);
    if (historyPermission && !hasRolePermission(req.user!.roleName, req.permissions, historyPermission)) {
      res.status(403).json({ success: false, error: 'ليس لديك صلاحية عرض سجل الاعتماد' });
      return;
    }

    const history = await approvalEngine.getHistory(entityType, id);
    ok(res, history);
  },
};
