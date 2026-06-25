import type { Request, Response } from 'express';
import { ok } from '@core/utils/response';
import { integrationsService } from './integrations.service';
import { UpdateIntegrationSettingsSchema } from './integrations.schema';

export const integrationsController = {
  async list(req: Request, res: Response): Promise<void> {
    const data = await integrationsService.list();
    ok(res, data);
  },

  async getById(req: Request, res: Response): Promise<void> {
    const card = await integrationsService.getById(req.params.id);
    if (!card) {
      res.status(404).json({ success: false, error: 'التكامل غير موجود' });
      return;
    }
    ok(res, card);
  },

  async updateSettings(req: Request, res: Response): Promise<void> {
    const card = await integrationsService.getById(req.params.id);
    if (!card) {
      res.status(404).json({ success: false, error: 'التكامل غير موجود' });
      return;
    }
    const input = UpdateIntegrationSettingsSchema.parse(req.body);
    const updated = await integrationsService.updateSettings(req.params.id, input, req);
    ok(res, updated, 'تم حفظ إعدادات التكامل');
  },

  async run(req: Request, res: Response): Promise<void> {
    const card = await integrationsService.getById(req.params.id);
    if (!card) {
      res.status(404).json({ success: false, error: 'التكامل غير موجود' });
      return;
    }
    const result = await integrationsService.run(req.params.id, req);
    ok(res, result);
  },
};
