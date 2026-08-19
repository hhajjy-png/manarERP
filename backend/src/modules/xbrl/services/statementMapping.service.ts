/**
 * ربط بنود القوائم المالية المستقبلية بمفاهيم XBRL.
 *
 * طبقة **منفصلة تمامًا** عن ربط الحسابات وعن القوائم المالية القائمة في النظام:
 * `financial.service` لا يقرأ هذا الجدول ولا يعرف بوجوده، فما يُكتب هنا لا يغيّر
 * سطرًا واحدًا في ميزان المراجعة أو المركز المالي أو الأرباح والخسائر المعروضة اليوم.
 */
import { Request } from 'express';
import { prisma } from '../../../config/database';
import { AppError } from '../../../core/errors/AppError';
import { recordAudit } from '../../../core/middleware/audit';

export interface StatementMappingInput {
  taxonomyId: number;
  statementType: string;
  lineCode: string;
  lineLabelAr: string;
  lineLabelEn?: string | null;
  parentLineCode?: string | null;
  conceptId?: number | null;
  displayOrder?: number;
  isTotal?: boolean;
  isEnabled?: boolean;
  accountFilterJson?: string | null;
  notes?: string | null;
}

const AUDIT_MODULE = 'xbrl';

const SELECT = {
  id: true,
  taxonomyId: true,
  statementType: true,
  lineCode: true,
  lineLabelAr: true,
  lineLabelEn: true,
  parentLineCode: true,
  conceptId: true,
  displayOrder: true,
  isTotal: true,
  isEnabled: true,
  accountFilterJson: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  concept: { select: { id: true, conceptCode: true, labelAr: true, taxonomyId: true } },
} as const;

export class StatementMappingService {
  async list(filters: { taxonomyId?: number; statementType?: string } = {}) {
    return prisma.xbrlStatementMapping.findMany({
      where: {
        ...(filters.taxonomyId && { taxonomyId: filters.taxonomyId }),
        ...(filters.statementType && { statementType: filters.statementType }),
      },
      select: SELECT,
      orderBy: [{ statementType: 'asc' }, { displayOrder: 'asc' }, { lineCode: 'asc' }],
    });
  }

  async getById(id: number) {
    const line = await prisma.xbrlStatementMapping.findUnique({ where: { id }, select: SELECT });
    if (!line) throw AppError.notFound('بند القائمة غير موجود');
    return line;
  }

  /** المفهوم — إن وُجد — يجب أن ينتمي إلى التصنيف نفسه. */
  private async assertConceptInTaxonomy(taxonomyId: number, conceptId: number | null | undefined) {
    if (conceptId == null) return;
    const concept = await prisma.xbrlConcept.findUnique({ where: { id: conceptId }, select: { taxonomyId: true } });
    if (!concept) throw AppError.notFound('المفهوم غير موجود');
    if (concept.taxonomyId !== taxonomyId) throw AppError.badRequest('المفهوم لا ينتمي إلى التصنيف المحدَّد');
  }

  async create(req: Request, input: StatementMappingInput) {
    const taxonomy = await prisma.xbrlTaxonomy.count({ where: { id: input.taxonomyId } });
    if (!taxonomy) throw AppError.notFound('التصنيف غير موجود');
    await this.assertConceptInTaxonomy(input.taxonomyId, input.conceptId);

    const duplicate = await prisma.xbrlStatementMapping.findUnique({
      where: {
        taxonomyId_statementType_lineCode: {
          taxonomyId: input.taxonomyId,
          statementType: input.statementType,
          lineCode: input.lineCode,
        },
      },
      select: { id: true },
    });
    if (duplicate) throw AppError.conflict(`بند القائمة «${input.lineCode}» موجود بالفعل`);

    const created = await prisma.xbrlStatementMapping.create({
      data: {
        taxonomyId: input.taxonomyId,
        statementType: input.statementType,
        lineCode: input.lineCode,
        lineLabelAr: input.lineLabelAr,
        lineLabelEn: input.lineLabelEn ?? null,
        parentLineCode: input.parentLineCode ?? null,
        conceptId: input.conceptId ?? null,
        displayOrder: input.displayOrder ?? 0,
        isTotal: input.isTotal ?? false,
        isEnabled: input.isEnabled ?? true,
        accountFilterJson: input.accountFilterJson ?? null,
        notes: input.notes ?? null,
      },
      select: SELECT,
    });

    await recordAudit({ req, action: 'CREATE', module: AUDIT_MODULE, entityId: `statementLine:${created.id}`, newValue: created });
    return created;
  }

  async update(req: Request, id: number, input: Partial<Omit<StatementMappingInput, 'taxonomyId'>>) {
    const before = await this.getById(id);
    await this.assertConceptInTaxonomy(before.taxonomyId, input.conceptId);

    const updated = await prisma.xbrlStatementMapping.update({
      where: { id },
      data: {
        ...(input.statementType !== undefined && { statementType: input.statementType }),
        ...(input.lineCode !== undefined && { lineCode: input.lineCode }),
        ...(input.lineLabelAr !== undefined && { lineLabelAr: input.lineLabelAr }),
        ...(input.lineLabelEn !== undefined && { lineLabelEn: input.lineLabelEn }),
        ...(input.parentLineCode !== undefined && { parentLineCode: input.parentLineCode }),
        ...(input.conceptId !== undefined && { conceptId: input.conceptId }),
        ...(input.displayOrder !== undefined && { displayOrder: input.displayOrder }),
        ...(input.isTotal !== undefined && { isTotal: input.isTotal }),
        ...(input.isEnabled !== undefined && { isEnabled: input.isEnabled }),
        ...(input.accountFilterJson !== undefined && { accountFilterJson: input.accountFilterJson }),
        ...(input.notes !== undefined && { notes: input.notes }),
      },
      select: SELECT,
    });

    await recordAudit({ req, action: 'UPDATE', module: AUDIT_MODULE, entityId: `statementLine:${id}`, oldValue: before, newValue: updated });
    return updated;
  }

  async remove(req: Request, id: number) {
    const before = await this.getById(id);
    await prisma.xbrlStatementMapping.delete({ where: { id } });
    await recordAudit({ req, action: 'DELETE', module: AUDIT_MODULE, entityId: `statementLine:${id}`, oldValue: before });
  }
}

export const statementMappingService = new StatementMappingService();
