import { Prisma } from '@prisma/client';
import { prisma } from '@config/database';
import { AppError } from '@core/errors/AppError';
import { buildOrderBy, SortWhitelist } from '@core/utils/sort';
import { calcTotals } from './workAnalysis.calc';
import type { CreateWorkAnalysisInput, UpdateWorkAnalysisInput, WorkAnalysisLineInput } from './workAnalysis.schema';

/**
 * خدمة «تحليل الشغل والعمولة».
 *
 * ═══ عقد العزل (يُقرأ قبل أي تعديل على هذا الملف) ═══
 * كل استدعاء كتابة في هذا الملف يستهدف `prisma.workAnalysis` أو
 * `prisma.workAnalysisLine` حصرًا. لا يوجد — ولا يجوز أن يوجد — أي
 * `create/update/delete/upsert` على أي جدول آخر: لا فواتير، لا مصروفات، لا دفعات،
 * لا حركات، لا قيود يومية، لا أرصدة عملاء، لا مخزون، لا رواتب.
 *
 * القراءات الخارجية الوحيدة المسموحة (قراءة بحتة، لا تغيّر حالة):
 *   • `prisma.equipment.findMany` — لاقتراحات أسماء المُلاك فقط.
 * أسعار العميل لا تُقرأ هنا إطلاقًا: تصل من الواجهة كلقطة مجمَّدة عبر
 * `GET /api/prices/for-invoice` القائم (لا منطق تسعير مكرَّر، ولا قراءة حيّة تكسر
 * تجميد اللقطة).
 *
 * ملاحظة مقصودة على التدقيق: لا يُستدعى `recordAudit` من هذه الوحدة — فهو يكتب في
 * جدول `audit_logs`، وعقد الميزة يحصر الكتابة في جدوليها. أداة تحليل داخلية لا
 * تُنتج أثرًا محاسبيًا لا تحتاج أثرًا تدقيقيًا محاسبيًا.
 */

const WORK_ANALYSIS_SORTABLE: SortWhitelist = {
  analysisDate: 'analysisDate',
  customerName: 'customerName',
  ownerName: 'ownerName',
  status: 'status',
  createdAt: 'createdAt',
};

const lineSelect = {
  id: true,
  priceId: true,
  priceAgreementName: true,
  itemLabel: true,
  unit: true,
  customerPrice: true,
  quantity: true,
  ownerPrice: true,
  sortOrder: true,
} as const;

/** يحوّل بنود الطلب إلى صفوف قابلة للإنشاء — الترتيب يُشتق من الفهرس حين لا يُرسَل. */
function toLineRows(lines: readonly WorkAnalysisLineInput[]) {
  return lines.map((line, index) => ({
    priceId: line.priceId ?? null,
    priceAgreementName: line.priceAgreementName,
    itemLabel: line.itemLabel,
    unit: line.unit,
    customerPrice: line.customerPrice,
    quantity: line.quantity,
    ownerPrice: line.ownerPrice,
    sortOrder: line.sortOrder ?? index,
  }));
}

export async function listWorkAnalyses(params: {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  customerId?: number;
  ownerName?: string;
  sortBy?: string;
  sortDir?: string;
}) {
  const { page, pageSize, search, status, customerId, ownerName } = params;
  const skip = (page - 1) * pageSize;

  const where: Prisma.WorkAnalysisWhereInput = {
    ...(status ? { status } : {}),
    ...(customerId ? { customerId } : {}),
    ...(ownerName ? { ownerName: { contains: ownerName } } : {}),
    ...(search
      ? {
          OR: [
            { customerName: { contains: search } },
            { ownerName: { contains: search } },
            { contractName: { contains: search } },
            { asphaltPlant: { contains: search } },
            { notes: { contains: search } },
          ],
        }
      : {}),
  };

  const orderBy = buildOrderBy(
    params,
    WORK_ANALYSIS_SORTABLE,
    [{ analysisDate: 'desc' }],
    [{ id: 'desc' }],
  ) as Prisma.WorkAnalysisOrderByWithRelationInput[];

  const [rows, total] = await Promise.all([
    prisma.workAnalysis.findMany({
      where,
      skip,
      take: pageSize,
      orderBy,
      include: { lines: { select: lineSelect, orderBy: { sortOrder: 'asc' } } },
    }),
    prisma.workAnalysis.count({ where }),
  ]);

  // الإجماليات مشتقّة عند القراءة من اللقطات المخزّنة — لا عمود مجموع محفوظ يمكن
  // أن يتعارض مع بنوده.
  const data = rows.map((row) => ({ ...row, totals: calcTotals(row.lines) }));

  return { data, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
}

export async function getWorkAnalysis(id: number) {
  const analysis = await prisma.workAnalysis.findUnique({
    where: { id },
    include: { lines: { select: lineSelect, orderBy: { sortOrder: 'asc' } } },
  });
  if (!analysis) throw AppError.notFound('التحليل غير موجود');
  return { ...analysis, totals: calcTotals(analysis.lines) };
}

export async function createWorkAnalysis(
  input: CreateWorkAnalysisInput,
  actor: { id?: number; name?: string },
) {
  const { lines, ...header } = input;
  return prisma.workAnalysis.create({
    data: {
      analysisDate: header.analysisDate,
      status: header.status ?? 'DRAFT',
      customerId: header.customerId ?? null,
      customerName: header.customerName,
      contractId: header.contractId ?? null,
      contractName: header.contractName ?? null,
      asphaltPlant: header.asphaltPlant ?? null,
      ownerName: header.ownerName,
      notes: header.notes ?? null,
      createdById: actor.id ?? null,
      createdByName: actor.name ?? null,
      lines: { create: toLineRows(lines) },
    },
    include: { lines: { select: lineSelect, orderBy: { sortOrder: 'asc' } } },
  });
}

export async function updateWorkAnalysis(id: number, input: UpdateWorkAnalysisInput) {
  const existing = await prisma.workAnalysis.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!existing) throw AppError.notFound('التحليل غير موجود');
  // التحليل المؤرشف مجمَّد المحتوى، لكن **إخراجه من الأرشفة يجب أن يبقى ممكنًا**.
  // منع كل تحديث كان سيجعل الأرشفة طريقًا بلا عودة ورسالة الخطأ تعليمة مستحيلة
  // التنفيذ: لا سبيل لتغيير الحالة إلا عبر هذا المسار نفسه. لذا يُرفض الطلب فقط
  // حين لا يحمل نيّة الخروج من الأرشفة.
  if (existing.status === 'ARCHIVED' && (input.status === undefined || input.status === 'ARCHIVED')) {
    throw AppError.conflict('التحليل مؤرشف — أعِد حالته إلى «مسودة» أولًا ثم عدّله');
  }

  const { lines, ...header } = input;

  const data: Prisma.WorkAnalysisUpdateInput = {
    ...(header.analysisDate !== undefined ? { analysisDate: header.analysisDate } : {}),
    ...(header.status !== undefined ? { status: header.status } : {}),
    ...(header.customerId !== undefined ? { customerId: header.customerId ?? null } : {}),
    ...(header.customerName !== undefined ? { customerName: header.customerName } : {}),
    ...(header.contractId !== undefined ? { contractId: header.contractId ?? null } : {}),
    ...(header.contractName !== undefined ? { contractName: header.contractName ?? null } : {}),
    ...(header.asphaltPlant !== undefined ? { asphaltPlant: header.asphaltPlant ?? null } : {}),
    ...(header.ownerName !== undefined ? { ownerName: header.ownerName } : {}),
    ...(header.notes !== undefined ? { notes: header.notes ?? null } : {}),
  };

  // استبدال كامل للبنود داخل معاملة واحدة: البنود مجموعة لقطات متماسكة، فالتحديث
  // الجزئي بالمعرّف يفتح باب حالة نصفية (بنود جديدة بلا حذف القديمة) عند أي فشل.
  return prisma.$transaction(async (tx) => {
    if (lines) {
      await tx.workAnalysisLine.deleteMany({ where: { analysisId: id } });
      await tx.workAnalysisLine.createMany({
        data: toLineRows(lines).map((line) => ({ ...line, analysisId: id })),
      });
    }
    await tx.workAnalysis.update({ where: { id }, data });
    return tx.workAnalysis.findUniqueOrThrow({
      where: { id },
      include: { lines: { select: lineSelect, orderBy: { sortOrder: 'asc' } } },
    });
  });
}

/** أرشفة — تغيير حالة لا حذف، فلا يفقد المستخدم تحليلًا بضغطة واحدة. */
export async function archiveWorkAnalysis(id: number) {
  const existing = await prisma.workAnalysis.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw AppError.notFound('التحليل غير موجود');
  return prisma.workAnalysis.update({ where: { id }, data: { status: 'ARCHIVED' } });
}

/** حذف نهائي — البنود تُحذف تتاليًا عبر onDelete: Cascade على العلاقة الداخلية. */
export async function deleteWorkAnalysis(id: number) {
  const existing = await prisma.workAnalysis.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw AppError.notFound('التحليل غير موجود');
  await prisma.workAnalysis.delete({ where: { id } });
  return { deleted: true };
}

/**
 * اقتراحات «صاحب المعدة»: أسماء المُلاك المميّزة من سجل المعدات ∪ الأسماء المستخدمة
 * في تحليلات سابقة. قراءة بحتة (استعلاما `distinct` فقط، بلا حلقات ولا N+1).
 * الاقتراح لا يقيّد الإدخال — الحقل يقبل أي نص حر.
 */
export async function getOwnerSuggestions(): Promise<string[]> {
  const [equipmentOwners, analysisOwners] = await Promise.all([
    prisma.equipment.findMany({
      where: { ownerName: { not: null } },
      select: { ownerName: true },
      distinct: ['ownerName'],
    }),
    prisma.workAnalysis.findMany({
      select: { ownerName: true },
      distinct: ['ownerName'],
    }),
  ]);

  const unique = new Set<string>();
  for (const row of equipmentOwners) {
    const name = row.ownerName?.trim();
    if (name) unique.add(name);
  }
  for (const row of analysisOwners) {
    const name = row.ownerName.trim();
    if (name) unique.add(name);
  }

  return Array.from(unique).sort((a, b) => a.localeCompare(b, 'ar'));
}

/** إحصاءات الترويسة — تُشتق من اللقطات المخزّنة، لا من أي جدول محاسبي. */
export async function getWorkAnalysisStats() {
  const rows = await prisma.workAnalysis.findMany({
    where: { status: { not: 'ARCHIVED' } },
    select: { id: true, status: true, lines: { select: { customerPrice: true, ownerPrice: true, quantity: true } } },
  });

  const totals = calcTotals(rows.flatMap((row) => row.lines));

  return {
    count: rows.length,
    draftCount: rows.filter((row) => row.status === 'DRAFT').length,
    completedCount: rows.filter((row) => row.status === 'COMPLETED').length,
    totalCustomerValue: totals.totalCustomerValue,
    totalOwnerCost: totals.totalOwnerCost,
    totalCommission: totals.totalCommission,
    grossMarginPct: totals.grossMarginPct,
  };
}
