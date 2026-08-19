/**
 * مفاهيم (Concepts) التصنيف.
 *
 * ⚠ لا يُملأ هذا الجدول بمفاهيم QAYD مفترضة. ما يدخله يدخله بإجراء صريح من المستخدم
 *   أو من مستورد تصنيف رسمي مستقبلي — لا من قائمة ثابتة مكتوبة في الكود على أساس
 *   تخمين لما ستطلبه الوزارة.
 */
import { Request } from 'express';
import { prisma } from '../../../config/database';
import { AppError } from '../../../core/errors/AppError';
import { recordAudit } from '../../../core/middleware/audit';

export interface ConceptInput {
  taxonomyId: number;
  conceptCode: string;
  namespace?: string | null;
  labelAr: string;
  labelEn?: string | null;
  dataType?: string;
  balanceType?: string;
  periodType?: string;
  statementType?: string;
  parentConceptId?: number | null;
  isRequired?: boolean;
  displayOrder?: number;
  metadataJson?: string | null;
}

const AUDIT_MODULE = 'xbrl';

const CONCEPT_SELECT = {
  id: true,
  taxonomyId: true,
  conceptCode: true,
  namespace: true,
  labelAr: true,
  labelEn: true,
  dataType: true,
  balanceType: true,
  periodType: true,
  statementType: true,
  parentConceptId: true,
  isRequired: true,
  displayOrder: true,
  metadataJson: true,
  createdAt: true,
  updatedAt: true,
} as const;

export class ConceptService {
  async list(filters: { taxonomyId?: number; statementType?: string; search?: string } = {}) {
    return prisma.xbrlConcept.findMany({
      where: {
        ...(filters.taxonomyId && { taxonomyId: filters.taxonomyId }),
        ...(filters.statementType && { statementType: filters.statementType }),
        ...(filters.search && {
          OR: [
            { conceptCode: { contains: filters.search } },
            { labelAr: { contains: filters.search } },
            { labelEn: { contains: filters.search } },
          ],
        }),
      },
      select: CONCEPT_SELECT,
      orderBy: [{ displayOrder: 'asc' }, { conceptCode: 'asc' }],
    });
  }

  async getById(id: number) {
    const concept = await prisma.xbrlConcept.findUnique({ where: { id }, select: CONCEPT_SELECT });
    if (!concept) throw AppError.notFound('المفهوم غير موجود');
    return concept;
  }

  private async assertTaxonomyExists(taxonomyId: number) {
    const exists = await prisma.xbrlTaxonomy.count({ where: { id: taxonomyId } });
    if (!exists) throw AppError.notFound('التصنيف غير موجود');
  }

  /** المفهوم الأب يجب أن يكون داخل التصنيف نفسه — وإلا انكسرت شجرة المفاهيم عبر تصنيفين. */
  private async assertParentInSameTaxonomy(taxonomyId: number, parentConceptId: number | null | undefined) {
    if (parentConceptId == null) return;
    const parent = await prisma.xbrlConcept.findUnique({
      where: { id: parentConceptId },
      select: { taxonomyId: true },
    });
    if (!parent) throw AppError.notFound('المفهوم الأب غير موجود');
    if (parent.taxonomyId !== taxonomyId) {
      throw AppError.badRequest('المفهوم الأب يجب أن ينتمي إلى التصنيف نفسه');
    }
  }

  async create(req: Request, input: ConceptInput) {
    await this.assertTaxonomyExists(input.taxonomyId);
    await this.assertParentInSameTaxonomy(input.taxonomyId, input.parentConceptId);

    const duplicate = await prisma.xbrlConcept.findUnique({
      where: { taxonomyId_conceptCode: { taxonomyId: input.taxonomyId, conceptCode: input.conceptCode } },
      select: { id: true },
    });
    if (duplicate) throw AppError.conflict(`المفهوم «${input.conceptCode}» موجود بالفعل في هذا التصنيف`);

    const created = await prisma.xbrlConcept.create({
      data: {
        taxonomyId: input.taxonomyId,
        conceptCode: input.conceptCode,
        namespace: input.namespace ?? null,
        labelAr: input.labelAr,
        labelEn: input.labelEn ?? null,
        dataType: input.dataType ?? 'MONETARY',
        balanceType: input.balanceType ?? 'NONE',
        periodType: input.periodType ?? 'DURATION',
        statementType: input.statementType ?? 'NONE',
        parentConceptId: input.parentConceptId ?? null,
        isRequired: input.isRequired ?? false,
        displayOrder: input.displayOrder ?? 0,
        metadataJson: input.metadataJson ?? null,
      },
      select: CONCEPT_SELECT,
    });

    await recordAudit({ req, action: 'CREATE', module: AUDIT_MODULE, entityId: `concept:${created.id}`, newValue: created });
    return created;
  }

  async update(req: Request, id: number, input: Partial<Omit<ConceptInput, 'taxonomyId'>>) {
    const before = await this.getById(id);
    await this.assertParentInSameTaxonomy(before.taxonomyId, input.parentConceptId);
    if (input.parentConceptId === id) throw AppError.badRequest('لا يمكن أن يكون المفهوم أبًا لنفسه');

    const updated = await prisma.xbrlConcept.update({
      where: { id },
      data: {
        ...(input.conceptCode !== undefined && { conceptCode: input.conceptCode }),
        ...(input.namespace !== undefined && { namespace: input.namespace }),
        ...(input.labelAr !== undefined && { labelAr: input.labelAr }),
        ...(input.labelEn !== undefined && { labelEn: input.labelEn }),
        ...(input.dataType !== undefined && { dataType: input.dataType }),
        ...(input.balanceType !== undefined && { balanceType: input.balanceType }),
        ...(input.periodType !== undefined && { periodType: input.periodType }),
        ...(input.statementType !== undefined && { statementType: input.statementType }),
        ...(input.parentConceptId !== undefined && { parentConceptId: input.parentConceptId }),
        ...(input.isRequired !== undefined && { isRequired: input.isRequired }),
        ...(input.displayOrder !== undefined && { displayOrder: input.displayOrder }),
        ...(input.metadataJson !== undefined && { metadataJson: input.metadataJson }),
      },
      select: CONCEPT_SELECT,
    });

    await recordAudit({ req, action: 'UPDATE', module: AUDIT_MODULE, entityId: `concept:${id}`, oldValue: before, newValue: updated });
    return updated;
  }

  async remove(req: Request, id: number) {
    const before = await this.getById(id);
    const usage = await prisma.xbrlAccountMapping.count({ where: { conceptId: id } });
    if (usage > 0) {
      throw AppError.conflict(`لا يمكن حذف المفهوم: مرتبط بـ${usage} حساب. أزل الربط أولًا.`);
    }
    await prisma.xbrlConcept.delete({ where: { id } });
    await recordAudit({ req, action: 'DELETE', module: AUDIT_MODULE, entityId: `concept:${id}`, oldValue: before });
  }
}

export const conceptService = new ConceptService();
