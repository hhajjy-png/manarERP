import type { Request, Response } from 'express';
import { approvalEngine } from '@shared/services/approval.service';
import { ok } from '@core/utils/response';

export const approvalController = {
  async getHistory(req: Request, res: Response): Promise<void> {
    const { entityType, entityId } = req.params;
    const id = Number(entityId);
    if (!entityType || !id || Number.isNaN(id)) {
      res.status(400).json({ success: false, error: 'entityType و entityId مطلوبان' });
      return;
    }
    const history = await approvalEngine.getHistory(entityType, id);
    ok(res, history);
  },
};
