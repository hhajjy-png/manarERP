/**
 * سجلّ التصنيفات (Taxonomy Registry).
 *
 * ═══ القيد المركزي: `isOfficial` لا يُضبط من هنا ═══
 * لا دالة في هذا الملف — ولا في أي ملف تصله مدخلات المستخدم — تكتب `isOfficial`.
 * الحقل يبقى `false` على كل تصنيف يُنشأ في v1، مهما كان اسمه أو نطاقه أو ما يكتبه
 * المستخدم في `source`. تسمية تصنيف «KW-QAYD-2027» لا تجعله رسميًا، وتفعيله لا
 * يجعله رسميًا: الرسمية تأتي حصرًا من مستورد تصنيف موثّق لم يُكتب بعد.
 *
 * هذا هو الفرق بين نظام «جاهز لـXBRL» ونظام «يدّعي توافق QAYD».
 */
import { Request } from 'express';
import { prisma } from '../../../config/database';
import { AppError } from '../../../core/errors/AppError';
import { recordAudit } from '../../../core/middleware/audit';
import type { TaxonomySnapshot } from '../xbrl.types';

export interface TaxonomyInput {
  code: string;
  nameAr: string;
  nameEn?: string | null;
  jurisdiction: string;
  version: string;
  effectiveFrom?: Date | null;
  effectiveTo?: Date | null;
  source?: string | null;
  metadataJson?: string | null;
}

const AUDIT_MODULE = 'xbrl';

/** الحقول التي تُعرض للعميل — `isOfficial` ضمنها للقراءة، وليست قابلة للكتابة. */
const TAXONOMY_SELECT = {
  id: true,
  code: true,
  nameAr: true,
  nameEn: true,
  jurisdiction: true,
  version: true,
  status: true,
  isOfficial: true,
  effectiveFrom: true,
  effectiveTo: true,
  source: true,
  metadataJson: true,
  createdAt: true,
  updatedAt: true,
} as const;

function toSnapshot(t: {
  id: number; code: string; nameAr: string; nameEn: string | null; jurisdiction: string;
  version: string; status: string; isOfficial: boolean;
  effectiveFrom: Date | null; effectiveTo: Date | null;
}): TaxonomySnapshot {
  return {
    id: t.id,
    code: t.code,
    nameAr: t.nameAr,
    nameEn: t.nameEn,
    jurisdiction: t.jurisdiction,
    version: t.version,
    status: t.status,
    isOfficial: t.isOfficial,
    effectiveFrom: t.effectiveFrom?.toISOString() ?? null,
    effectiveTo: t.effectiveTo?.toISOString() ?? null,
  };
}

export class TaxonomyService {
  async list(filters: { status?: string; jurisdiction?: string } = {}) {
    return prisma.xbrlTaxonomy.findMany({
      where: {
        ...(filters.status && { status: filters.status }),
        ...(filters.jurisdiction && { jurisdiction: filters.jurisdiction }),
      },
      select: { ...TAXONOMY_SELECT, _count: { select: { concepts: true, accountMappings: true } } },
      orderBy: [{ isOfficial: 'desc' }, { code: 'asc' }],
    });
  }

  async getById(id: number) {
    const taxonomy = await prisma.xbrlTaxonomy.findUnique({ where: { id }, select: TAXONOMY_SELECT });
    if (!taxonomy) throw AppError.notFound('التصنيف غير موجود');
    return taxonomy;
  }

  /** التصنيف المفعَّل حاليًا — واحد على الأكثر (يُفرض في `setStatus`). */
  async getActive(): Promise<TaxonomySnapshot | null> {
    const active = await prisma.xbrlTaxonomy.findFirst({
      where: { status: 'ACTIVE' },
      select: TAXONOMY_SELECT,
      orderBy: { id: 'asc' },
    });
    return active ? toSnapshot(active) : null;
  }

  /** هل يوجد أي تصنيف رسمي مثبَّت؟ في v1 الجواب `false` دائمًا — والتحقق فعلي لا مفترض. */
  async hasOfficialTaxonomy(): Promise<boolean> {
    return (await prisma.xbrlTaxonomy.count({ where: { isOfficial: true } })) > 0;
  }

  async create(req: Request, input: TaxonomyInput) {
    const existing = await prisma.xbrlTaxonomy.findUnique({ where: { code: input.code }, select: { id: true } });
    if (existing) throw AppError.conflict(`رمز التصنيف «${input.code}» مستخدم بالفعل`);

    const created = await prisma.xbrlTaxonomy.create({
      data: {
        code: input.code,
        nameAr: input.nameAr,
        nameEn: input.nameEn ?? null,
        jurisdiction: input.jurisdiction,
        version: input.version,
        effectiveFrom: input.effectiveFrom ?? null,
        effectiveTo: input.effectiveTo ?? null,
        source: input.source ?? null,
        metadataJson: input.metadataJson ?? null,
        // `status` و `isOfficial` لا يأتيان من المدخلات إطلاقًا: التصنيف يولد مسودة
        // غير رسمية، ويُفعَّل بإجراء صريح مسجَّل، ولا يصير رسميًا بأي مسار في v1.
        status: 'DRAFT',
        isOfficial: false,
      },
      select: TAXONOMY_SELECT,
    });

    await recordAudit({ req, action: 'CREATE', module: AUDIT_MODULE, entityId: `taxonomy:${created.id}`, newValue: created });
    return created;
  }

  async update(req: Request, id: number, input: Partial<TaxonomyInput>) {
    const before = await this.getById(id);

    const updated = await prisma.xbrlTaxonomy.update({
      where: { id },
      data: {
        ...(input.nameAr !== undefined && { nameAr: input.nameAr }),
        ...(input.nameEn !== undefined && { nameEn: input.nameEn }),
        ...(input.jurisdiction !== undefined && { jurisdiction: input.jurisdiction }),
        ...(input.version !== undefined && { version: input.version }),
        ...(input.effectiveFrom !== undefined && { effectiveFrom: input.effectiveFrom }),
        ...(input.effectiveTo !== undefined && { effectiveTo: input.effectiveTo }),
        ...(input.source !== undefined && { source: input.source }),
        ...(input.metadataJson !== undefined && { metadataJson: input.metadataJson }),
        // لا `code` (هوية ثابتة يُشار إليها في اللقطات)، ولا `status` (إجراء مستقل)،
        // ولا `isOfficial` (لا مسار كتابة في v1).
      },
      select: TAXONOMY_SELECT,
    });

    await recordAudit({ req, action: 'UPDATE', module: AUDIT_MODULE, entityId: `taxonomy:${id}`, oldValue: before, newValue: updated });
    return updated;
  }

  /**
   * تفعيل/تعطيل تصنيف.
   *
   * تصنيف مفعَّل واحد على الأكثر: التفعيل يُعطِّل ما عداه داخل معاملة واحدة. لحظة
   * وجود تصنيفين مفعَّلين تعني أن الجاهزية تُحتسب على مرجع مفاهيم غير محدَّد.
   */
  async setStatus(req: Request, id: number, status: 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'ARCHIVED') {
    const before = await this.getById(id);

    const updated = await prisma.$transaction(async (tx) => {
      if (status === 'ACTIVE') {
        await tx.xbrlTaxonomy.updateMany({
          where: { status: 'ACTIVE', id: { not: id } },
          data: { status: 'INACTIVE' },
        });
      }
      return tx.xbrlTaxonomy.update({ where: { id }, data: { status }, select: TAXONOMY_SELECT });
    });

    await recordAudit({
      req,
      action: status === 'ACTIVE' ? 'ACTIVATE' : 'DEACTIVATE',
      module: AUDIT_MODULE,
      entityId: `taxonomy:${id}`,
      oldValue: { status: before.status },
      newValue: { status: updated.status },
    });
    return updated;
  }

  /**
   * حذف تصنيف.
   * المفاهيم والربط وبنود القوائم التابعة تُحذف بالتتالي (Cascade) — كلها بيانات
   * إعداد داخل جداول `xbrl_*`. **اللقطات لا تتأثر**: هوية التصنيف مخزَّنة فيها نصًّا.
   */
  async remove(req: Request, id: number) {
    const before = await this.getById(id);
    if (before.isOfficial) {
      throw AppError.badRequest('لا يمكن حذف تصنيف رسمي معتمد');
    }
    await prisma.xbrlTaxonomy.delete({ where: { id } });
    await recordAudit({ req, action: 'DELETE', module: AUDIT_MODULE, entityId: `taxonomy:${id}`, oldValue: before });
  }
}

export const taxonomyService = new TaxonomyService();
