import { Request, Response } from 'express';
import { chequeDesignerTemplatesService } from './chequeDesignerTemplates.service';
import { created, noContent, ok } from '../../core/utils/response';

/** Thin handlers: the service owns every rule; these only shape the HTTP surface. */
export const chequeDesignerTemplatesController = {
  async list(_req: Request, res: Response) {
    ok(res, await chequeDesignerTemplatesService.list());
  },

  async getDefault(_req: Request, res: Response) {
    ok(res, await chequeDesignerTemplatesService.getDefault());
  },

  async legacyImportStatus(_req: Request, res: Response) {
    ok(res, await chequeDesignerTemplatesService.legacyImportStatus());
  },

  async getById(req: Request, res: Response) {
    ok(res, await chequeDesignerTemplatesService.get(req.params.id));
  },

  async create(req: Request, res: Response) {
    created(res, await chequeDesignerTemplatesService.create(req.body, req), 'تم حفظ القالب');
  },

  async update(req: Request, res: Response) {
    ok(res, await chequeDesignerTemplatesService.update(req.params.id, req.body, req), 'تم الحفظ');
  },

  async rename(req: Request, res: Response) {
    ok(res, await chequeDesignerTemplatesService.rename(req.params.id, req.body.name, req), 'تمت إعادة التسمية');
  },

  async setDefault(req: Request, res: Response) {
    ok(res, await chequeDesignerTemplatesService.setDefault(req.params.id, req), 'تم تعيين القالب كافتراضي');
  },

  async remove(req: Request, res: Response) {
    await chequeDesignerTemplatesService.remove(req.params.id, req);
    noContent(res, 'تم حذف القالب');
  },

  async importLegacy(req: Request, res: Response) {
    ok(res, await chequeDesignerTemplatesService.importLegacy(req.body, req));
  },

  async legacyRecoveryStatus(_req: Request, res: Response) {
    ok(res, await chequeDesignerTemplatesService.legacyRecoveryStatus());
  },

  async recoverLegacy(req: Request, res: Response) {
    ok(res, await chequeDesignerTemplatesService.recoverLegacy(req.body, req));
  },
};
