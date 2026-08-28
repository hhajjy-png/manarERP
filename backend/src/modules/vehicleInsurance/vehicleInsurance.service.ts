import { Request } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';
import { recordAudit } from '../../core/middleware/audit';
import { buildExcel } from '../../shared/services/reportEngine/excel.service';
import type { ReportColumn } from '../../shared/services/reportEngine/excel.service';
import { formatDisplayDate } from '../../shared/utils/dateDisplay';
import { roundMoney } from '../../shared/utils/money';
import {
  CreateAccidentInput,
  CreatePolicyInput,
  PolicyFilters,
  UpdateAccidentInput,
  UpdatePolicyInput,
} from './vehicleInsurance.schema';
import {
  coverageTypeAr,
  daysUntilExpiry,
  INSURANCE_STATUS_AR,
  INSURANCE_URGENCY_AR,
  insuranceStatusOf,
  insuranceUrgency,
  type InsuranceStatus,
  type InsuranceUrgency,
} from './vehicleInsurance.status';

/**
 * تأمين المركبات — الخدمة (Vehicle Insurance Management v1).
 *
 * ═══ حدود الوحدة ═══
 * تكتب حصرًا في `vehicle_insurance_policies` و`vehicle_accidents`. لا تنشئ قيدًا محاسبيًا
 * ولا مصروفًا ولا سجل صيانة، ولا تلمس جدول المعدات — لا قراءةً ولا كتابةً — عدا قراءة
 * بيانات تعريفية للعرض. الحقل القديم `equipment.insuranceExpiry` مهجور ولا تكتب فيه.
 *
 * ═══ المصدر الرسمي ═══
 * `endDate` للوثيقة الحالية هنا هو **المصدر الرسمي الوحيد** لانتهاء تأمين المركبة، ويقرأه
 * «مركز انتهاء الوثائق» عبر `listCurrentExpiries()` بدل الحقل القديم (Single Source of
 * Truth Audit v1، 2026-08-28).
 *
 * ═══ لا حذف ═══
 * التجديد يُنشئ وثيقة جديدة ولا يعدّل القديمة، والحوادث سجل تاريخي دائم. لا تعرض هذه
 * الخدمة أي دالة حذف لأيٍّ من الجدولين.
 */

const EQUIPMENT_BRIEF = { id: true, code: true, name: true, plateNumber: true } as const;

export interface EquipmentBrief {
  id: number;
  code: string;
  name: string | null;
  plateNumber: string | null;
}

/** انتهاء تأمين المركبة الحالي — الشكل المصغّر الذي يستهلكه مركز انتهاء الوثائق. */
export interface CurrentInsuranceExpiry {
  equipmentId: number;
  equipmentCode: string;
  equipmentName: string | null;
  /** `endDate` للوثيقة الحالية كما هو مخزَّن (منتصف ليل UTC). */
  endDate: Date;
}

export interface PolicyRecord {
  id: number;
  equipmentId: number;
  equipment: EquipmentBrief | null;
  policyNumber: string;
  insurerName: string;
  coverageType: string;
  startDate: string;
  endDate: string;
  cost: number;
  notes: string | null;
  daysRemaining: number;
  urgency: InsuranceUrgency;
  status: InsuranceStatus;
  createdAt: string;
  updatedAt: string;
}

export interface InsuranceSummary {
  /** عدد المركبات التي تملك وثيقة تأمين واحدة على الأقل. */
  insuredVehicles: number;
  expired: number;
  expiringSoon: number;
  /** تفصيل نطاقات التنبيه (7 / 15 / 30) — مجموعها هو `expiringSoon`. */
  due7: number;
  due15: number;
  due30: number;
  /** إجمالي تكلفة الوثائق الحالية (وثيقة واحدة لكل مركبة) — د.ك. */
  totalCost: number;
  /** إجمالي تكلفة كل الوثائق المحفوظة تاريخيًا — د.ك. */
  totalCostAllPolicies: number;
  totalPolicies: number;
  totalAccidents: number;
}

/** ترتيب «أحدث وثيقة أولًا» — مصدر واحد يمنع تباعد الجدول الرئيسي عن السجل. */
const LATEST_FIRST: Prisma.VehicleInsurancePolicyOrderByWithRelationInput[] = [
  { endDate: 'desc' },
  { startDate: 'desc' },
  { id: 'desc' },
];

const iso = (d: Date): string => d.toISOString();
const dateOnly = (d: Date): string => d.toISOString().slice(0, 10);

async function assertEquipment(equipmentId: number): Promise<void> {
  const eq = await prisma.equipment.findUnique({ where: { id: equipmentId }, select: { id: true } });
  if (!eq) throw AppError.badRequest('المعدة المحددة غير موجودة');
}

type PolicyRow = Prisma.VehicleInsurancePolicyGetPayload<{
  include: { equipment: { select: typeof EQUIPMENT_BRIEF } };
}>;

function toPolicyRecord(p: PolicyRow, now: Date): PolicyRecord {
  const daysRemaining = daysUntilExpiry(p.endDate, now);
  const urgency = insuranceUrgency(daysRemaining);
  return {
    id: p.id,
    equipmentId: p.equipmentId,
    equipment: p.equipment ?? null,
    policyNumber: p.policyNumber,
    insurerName: p.insurerName,
    coverageType: p.coverageType,
    // تواريخ DATE-ONLY تعود كـ YYYY-MM-DD كي يبقى الفرز المعجمي في الواجهة صحيحًا.
    startDate: dateOnly(p.startDate),
    endDate: dateOnly(p.endDate),
    cost: p.cost,
    notes: p.notes,
    daysRemaining,
    urgency,
    status: insuranceStatusOf(urgency),
    createdAt: iso(p.createdAt),
    updatedAt: iso(p.updatedAt),
  };
}

export class VehicleInsuranceService {
  // ═════════════════ قائمة المركبات + وثيقتها الحالية ═════════════════

  /**
   * الجدول الرئيسي: صف واحد لكل مركبة مؤمَّن عليها، يحمل أحدث وثيقة لها.
   *
   * «أحدث» = أبعد تاريخ انتهاء، ثم أبعد تاريخ بدء، ثم أعلى معرّف. الاختيار يجري في
   * الذاكرة لا في SQL: لا نوافذ (window functions) متاحة عبر Prisma على SQLite هنا،
   * والمجموعة بحجم أسطول المعدات — عشرات الصفوف لا ملايين.
   */
  private async latestPolicyRows(): Promise<PolicyRow[]> {
    const all = await prisma.vehicleInsurancePolicy.findMany({
      orderBy: LATEST_FIRST,
      include: { equipment: { select: EQUIPMENT_BRIEF } },
    });

    const latestByEquipment = new Map<number, PolicyRow>();
    for (const p of all) {
      if (!latestByEquipment.has(p.equipmentId)) latestByEquipment.set(p.equipmentId, p);
    }
    return [...latestByEquipment.values()];
  }

  async listCurrentPolicies(filters: PolicyFilters = { status: 'all' }): Promise<PolicyRecord[]> {
    const now = new Date();
    let rows = (await this.latestPolicyRows()).map((p) => toPolicyRecord(p, now));

    if (filters.insurer) {
      const insurer = filters.insurer.toLowerCase();
      rows = rows.filter((r) => r.insurerName.toLowerCase() === insurer);
    }
    if (filters.status && filters.status !== 'all') {
      rows = rows.filter((r) => r.status === filters.status);
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      rows = rows.filter(
        (r) =>
          (r.equipment?.code ?? '').toLowerCase().includes(q) ||
          (r.equipment?.name ?? '').toLowerCase().includes(q) ||
          (r.equipment?.plateNumber ?? '').toLowerCase().includes(q) ||
          r.policyNumber.toLowerCase().includes(q) ||
          r.insurerName.toLowerCase().includes(q),
      );
    }

    // الأقرب انتهاءً أولًا — المنتهية والحرجة تتصدّر الشاشة بلا حاجة إلى فرز يدوي.
    return rows.sort((a, b) => a.daysRemaining - b.daysRemaining);
  }

  /**
   * تاريخ انتهاء التأمين الحالي لكل مركبة — **المصدر الرسمي الوحيد** لهذه المعلومة.
   *
   * يستهلكه «مركز انتهاء الوثائق» بدل الحقل القديم `equipment.insuranceExpiry` (المهجور)،
   * فيبقى تعريف «الوثيقة الحالية» — الأحدث بترتيب `LATEST_FIRST` — معرَّفًا مرة واحدة هنا
   * ولا يتباعد بين شاشة التأمين ومركز الوثائق. التاريخ يعود كـ `Date` كما هو مخزَّن، بلا
   * أي حساب أيام: العدّ يخصّ المستهلك ويجري بالعقد المشترك `daysUntil`.
   */
  async listCurrentExpiries(): Promise<CurrentInsuranceExpiry[]> {
    return (await this.latestPolicyRows()).map((p) => ({
      equipmentId: p.equipmentId,
      equipmentCode: p.equipment?.code ?? String(p.equipmentId),
      equipmentName: p.equipment?.name ?? null,
      endDate: p.endDate,
    }));
  }

  /** سجل التأمين الكامل — كل وثائق مركبة واحدة، أو كل الوثائق عند غياب المعرّف. */
  async listPolicies(equipmentId?: number): Promise<PolicyRecord[]> {
    const now = new Date();
    const rows = await prisma.vehicleInsurancePolicy.findMany({
      where: equipmentId ? { equipmentId } : undefined,
      orderBy: LATEST_FIRST,
      include: { equipment: { select: EQUIPMENT_BRIEF } },
    });
    return rows.map((p) => toPolicyRecord(p, now));
  }

  /** أسماء شركات التأمين المستخدمة فعلًا — تغذّي قائمة التصفية بلا جدول إعدادات. */
  async listInsurers(): Promise<string[]> {
    const rows = await prisma.vehicleInsurancePolicy.findMany({
      distinct: ['insurerName'],
      select: { insurerName: true },
      orderBy: { insurerName: 'asc' },
    });
    return rows.map((r) => r.insurerName);
  }

  /**
   * خيارات المعدات لقوائم النماذج.
   *
   * نقطة نهاية مستقلة يحرسها `vehicleInsurance.read` بدل استهلاك `/api/equipment`:
   * من يملك صلاحية هذه الوحدة يجب أن تعمل شاشته كاملة دون أن يُمنح `equipment.read`.
   */
  async listEquipmentOptions(): Promise<EquipmentBrief[]> {
    return prisma.equipment.findMany({ orderBy: { code: 'asc' }, select: EQUIPMENT_BRIEF });
  }

  // ═════════════════ المؤشرات ═════════════════

  async summary(): Promise<InsuranceSummary> {
    const current = await this.listCurrentPolicies({ status: 'all' });
    const [aggAll, totalAccidents] = await Promise.all([
      prisma.vehicleInsurancePolicy.aggregate({ _sum: { cost: true }, _count: { _all: true } }),
      prisma.vehicleAccident.count(),
    ]);

    const s: InsuranceSummary = {
      insuredVehicles: current.length,
      expired: 0,
      expiringSoon: 0,
      due7: 0,
      due15: 0,
      due30: 0,
      totalCost: 0,
      totalCostAllPolicies: roundMoney(aggAll._sum.cost ?? 0),
      totalPolicies: aggAll._count._all,
      totalAccidents,
    };

    let costSum = 0;
    for (const r of current) {
      costSum += r.cost;
      if (r.status === 'EXPIRED') s.expired++;
      else if (r.status === 'EXPIRING_SOON') s.expiringSoon++;
      if (r.urgency === 'DUE_7') s.due7++;
      else if (r.urgency === 'DUE_15') s.due15++;
      else if (r.urgency === 'DUE_30') s.due30++;
    }
    s.totalCost = roundMoney(costSum);
    return s;
  }

  // ═════════════════ الوثائق: إنشاء / تجديد / تصحيح ═════════════════

  /**
   * إنشاء وثيقة — وهو نفس مسار التجديد. لا تعديل على أي وثيقة سابقة ولا إلغاء لها:
   * السجل التاريخي كامل، والوثيقة الحالية تُشتقّ بالترتيب لا بعلامة «نشطة» مخزَّنة.
   */
  async createPolicy(input: CreatePolicyInput, req: Request): Promise<PolicyRecord> {
    await assertEquipment(input.equipmentId);
    const created = await prisma.vehicleInsurancePolicy.create({
      data: {
        equipmentId: input.equipmentId,
        policyNumber: input.policyNumber,
        insurerName: input.insurerName,
        coverageType: input.coverageType,
        startDate: input.startDate,
        endDate: input.endDate,
        cost: roundMoney(input.cost),
        notes: input.notes ?? null,
      },
      include: { equipment: { select: EQUIPMENT_BRIEF } },
    });
    await recordAudit({
      req,
      action: 'CREATE',
      module: 'vehicleInsurance',
      entityId: created.id,
      newValue: {
        equipmentId: created.equipmentId,
        policyNumber: created.policyNumber,
        insurerName: created.insurerName,
        endDate: dateOnly(created.endDate),
        cost: created.cost,
      },
    });
    return toPolicyRecord(created, new Date());
  }

  /** تصحيح كتابي لوثيقة قائمة. المعدة غير قابلة للتغيير — انظر `updatePolicySchema`. */
  async updatePolicy(id: number, input: UpdatePolicyInput, req: Request): Promise<PolicyRecord> {
    const old = await prisma.vehicleInsurancePolicy.findUnique({ where: { id } });
    if (!old) throw AppError.notFound('وثيقة التأمين غير موجودة');

    // الفحص الجزئي: تاريخ واحد مُرسَل مقابل الآخر المحفوظ. المخطط يغطي حالة إرسالهما معًا.
    const startDate = input.startDate ?? old.startDate;
    const endDate = input.endDate ?? old.endDate;
    if (endDate.getTime() < startDate.getTime()) {
      throw AppError.badRequest('تاريخ انتهاء التأمين يجب أن يكون في أو بعد تاريخ البدء');
    }

    const data: Prisma.VehicleInsurancePolicyUpdateInput = {};
    if (input.policyNumber !== undefined) data.policyNumber = input.policyNumber;
    if (input.insurerName !== undefined) data.insurerName = input.insurerName;
    if (input.coverageType !== undefined) data.coverageType = input.coverageType;
    if (input.startDate !== undefined) data.startDate = input.startDate;
    if (input.endDate !== undefined) data.endDate = input.endDate;
    if (input.cost !== undefined) data.cost = roundMoney(input.cost);
    if (input.notes !== undefined) data.notes = input.notes;

    const updated = await prisma.vehicleInsurancePolicy.update({
      where: { id },
      data,
      include: { equipment: { select: EQUIPMENT_BRIEF } },
    });
    await recordAudit({
      req,
      action: 'UPDATE',
      module: 'vehicleInsurance',
      entityId: id,
      oldValue: {
        policyNumber: old.policyNumber,
        insurerName: old.insurerName,
        coverageType: old.coverageType,
        startDate: dateOnly(old.startDate),
        endDate: dateOnly(old.endDate),
        cost: old.cost,
        notes: old.notes,
      },
      newValue: input,
    });
    return toPolicyRecord(updated, new Date());
  }

  // ═════════════════ سجل الحوادث ═════════════════

  async listAccidents(equipmentId?: number) {
    return prisma.vehicleAccident.findMany({
      where: equipmentId ? { equipmentId } : undefined,
      orderBy: [{ accidentDate: 'desc' }, { id: 'desc' }],
      include: { equipment: { select: EQUIPMENT_BRIEF } },
    });
  }

  async createAccident(input: CreateAccidentInput, req: Request) {
    await assertEquipment(input.equipmentId);
    const created = await prisma.vehicleAccident.create({
      data: {
        equipmentId: input.equipmentId,
        accidentDate: input.accidentDate,
        description: input.description,
        repairCost: input.repairCost === undefined ? null : roundMoney(input.repairCost),
        notes: input.notes ?? null,
      },
      include: { equipment: { select: EQUIPMENT_BRIEF } },
    });
    await recordAudit({
      req,
      action: 'CREATE',
      module: 'vehicleInsurance',
      entityId: created.id,
      newValue: {
        accident: true,
        equipmentId: created.equipmentId,
        accidentDate: dateOnly(created.accidentDate),
        repairCost: created.repairCost,
      },
    });
    return created;
  }

  async updateAccident(id: number, input: UpdateAccidentInput, req: Request) {
    const old = await prisma.vehicleAccident.findUnique({ where: { id } });
    if (!old) throw AppError.notFound('سجل الحادث غير موجود');

    const data: Prisma.VehicleAccidentUpdateInput = {};
    if (input.accidentDate !== undefined) data.accidentDate = input.accidentDate;
    if (input.description !== undefined) data.description = input.description;
    if (input.repairCost !== undefined) {
      data.repairCost = input.repairCost === null ? null : roundMoney(input.repairCost);
    }
    if (input.notes !== undefined) data.notes = input.notes;

    const updated = await prisma.vehicleAccident.update({
      where: { id },
      data,
      include: { equipment: { select: EQUIPMENT_BRIEF } },
    });
    await recordAudit({
      req,
      action: 'UPDATE',
      module: 'vehicleInsurance',
      entityId: id,
      oldValue: {
        accidentDate: dateOnly(old.accidentDate),
        description: old.description,
        repairCost: old.repairCost,
        notes: old.notes,
      },
      newValue: input,
    });
    return updated;
  }

  // ═════════════════ تصدير Excel لنتائج الشاشة الحالية ═════════════════

  async exportExcel(filters: PolicyFilters): Promise<Buffer> {
    const rows = await this.listCurrentPolicies(filters);
    const columns: ReportColumn[] = [
      { header: 'رقم المعدة', key: 'equipmentCode', width: 14 },
      { header: 'اسم المعدة', key: 'equipmentName', width: 24 },
      { header: 'رقم اللوحة', key: 'plateNumber', width: 16 },
      { header: 'رقم الوثيقة', key: 'policyNumber', width: 20 },
      { header: 'شركة التأمين', key: 'insurerName', width: 24 },
      { header: 'نوع التأمين', key: 'coverageType', width: 14 },
      { header: 'بداية التأمين', key: 'startDate', width: 14 },
      { header: 'انتهاء التأمين', key: 'endDate', width: 14 },
      { header: 'الأيام المتبقية', key: 'daysRemaining', width: 14, type: 'number' },
      { header: 'التكلفة', key: 'cost', width: 16, format: 'currency', type: 'currency' },
      { header: 'الحالة', key: 'status', width: 16 },
      { header: 'التنبيه', key: 'urgency', width: 20 },
      { header: 'ملاحظات', key: 'notes', width: 30 },
    ];
    return buildExcel({
      title: 'تقرير تأمين المركبات',
      subtitle: `عدد المركبات المؤمَّن عليها: ${rows.length}`,
      sheetName: 'تأمين المركبات',
      columns,
      rows: rows.map((r) => ({
        equipmentCode: r.equipment?.code ?? String(r.equipmentId),
        equipmentName: r.equipment?.name ?? '',
        plateNumber: r.equipment?.plateNumber ?? '',
        policyNumber: r.policyNumber,
        insurerName: r.insurerName,
        coverageType: coverageTypeAr(r.coverageType),
        startDate: formatDisplayDate(r.startDate),
        endDate: formatDisplayDate(r.endDate),
        daysRemaining: r.daysRemaining,
        cost: r.cost,
        status: INSURANCE_STATUS_AR[r.status],
        urgency: INSURANCE_URGENCY_AR[r.urgency],
        notes: r.notes ?? '',
      })),
      totalsRow: {
        equipmentCode: 'الإجمالي',
        cost: roundMoney(rows.reduce((sum, r) => sum + r.cost, 0)),
      },
    });
  }
}

export const vehicleInsuranceService = new VehicleInsuranceService();
