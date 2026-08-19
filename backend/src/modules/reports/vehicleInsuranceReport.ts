import { prisma } from '../../config/database';
import type { ReportInput } from '../../shared/services/reportEngine/excel.service';
import { formatCurrency } from '../../shared/utils/currency';
import { formatDisplayDate } from '../../shared/utils/dateDisplay';
import { roundMoney } from '../../shared/utils/money';
import {
  coverageTypeAr,
  daysUntilExpiry,
  INSURANCE_STATUS_AR,
  INSURANCE_URGENCY_AR,
  insuranceStatusOf,
  insuranceUrgency,
  type InsuranceStatus,
} from '../vehicleInsurance/vehicleInsurance.status';

/**
 * تقرير تأمين المركبات — Vehicle Insurance Management v1.
 *
 * يسكن داخل مركز التقارير القائم فيرث منه الطباعة وتصدير PDF وتصدير Excel بلا محرّك
 * جديد. حالة كل وثيقة تُحتسب بنفس دوال `vehicleInsurance.status.ts` التي تستخدمها
 * الشاشة، فلا يمكن أن يتباعد عمود الحالة في التقرير عن شارة الحالة في الجدول.
 *
 * يقرأ `vehicle_insurance_policies` وحده (مع لقطة مختصرة من `equipment` للعرض)، ولا
 * يكتب في أي جدول ولا يمسّ أي تقرير قائم.
 *
 * `status` هو الفلتر الوحيد: `all` (كل الوثائق) | `EXPIRED` (المنتهية) |
 * `EXPIRING_SOON` (التي تنتهي قريبًا) | `VALID` (السارية).
 */

const STATUS_TITLE: Record<string, string> = {
  all: 'تقرير تأمين المركبات — جميع الوثائق',
  VALID: 'تقرير تأمين المركبات — الوثائق السارية',
  EXPIRING_SOON: 'تقرير تأمين المركبات — الوثائق التي تنتهي قريبًا',
  EXPIRED: 'تقرير تأمين المركبات — الوثائق المنتهية',
};

function normalizeStatus(raw?: string): 'all' | InsuranceStatus {
  if (raw === 'VALID' || raw === 'EXPIRING_SOON' || raw === 'EXPIRED') return raw;
  return 'all';
}

export async function buildVehicleInsuranceReport(query: { status?: string }): Promise<ReportInput> {
  const status = normalizeStatus(query.status);
  const now = new Date();

  const policies = await prisma.vehicleInsurancePolicy.findMany({
    orderBy: [{ endDate: 'asc' }, { id: 'asc' }],
    include: { equipment: { select: { code: true, name: true, plateNumber: true } } },
  });

  const enriched = policies.map((p) => {
    const daysRemaining = daysUntilExpiry(p.endDate, now);
    const urgency = insuranceUrgency(daysRemaining);
    return { policy: p, daysRemaining, urgency, status: insuranceStatusOf(urgency) };
  });

  const rows = status === 'all' ? enriched : enriched.filter((r) => r.status === status);

  const totalCost = roundMoney(rows.reduce((sum, r) => sum + r.policy.cost, 0));
  const expiredCount = rows.filter((r) => r.status === 'EXPIRED').length;
  const expiringCount = rows.filter((r) => r.status === 'EXPIRING_SOON').length;
  const vehicleCount = new Set(rows.map((r) => r.policy.equipmentId)).size;

  return {
    title: STATUS_TITLE[status],
    subtitle:
      `عدد الوثائق: ${rows.length} · عدد المركبات: ${vehicleCount} · ` +
      `منتهية: ${expiredCount} · تنتهي قريبًا: ${expiringCount} · ` +
      `إجمالي تكلفة التأمين: ${formatCurrency(totalCost)}`,
    sheetName: 'تأمين المركبات',
    columns: [
      { header: 'رقم المعدة', key: 'equipmentCode', width: 14 },
      { header: 'اسم المعدة', key: 'equipmentName', width: 24 },
      { header: 'رقم اللوحة', key: 'plateNumber', width: 16 },
      { header: 'رقم الوثيقة', key: 'policyNumber', width: 20 },
      { header: 'شركة التأمين', key: 'insurerName', width: 24 },
      { header: 'نوع التأمين', key: 'coverageType', width: 14, align: 'center' },
      { header: 'بداية التأمين', key: 'startDate', width: 14, align: 'center' },
      { header: 'انتهاء التأمين', key: 'endDate', width: 14, align: 'center' },
      { header: 'الأيام المتبقية', key: 'daysRemaining', width: 14, type: 'number', align: 'center' },
      { header: 'التكلفة', key: 'cost', width: 16, format: 'currency', type: 'currency' },
      { header: 'الحالة', key: 'status', width: 14, align: 'center' },
      { header: 'التنبيه', key: 'urgency', width: 20, align: 'center' },
      { header: 'ملاحظات', key: 'notes', width: 28 },
    ],
    rows: rows.map((r) => ({
      equipmentCode: r.policy.equipment?.code ?? String(r.policy.equipmentId),
      equipmentName: r.policy.equipment?.name ?? '',
      plateNumber: r.policy.equipment?.plateNumber ?? '',
      policyNumber: r.policy.policyNumber,
      insurerName: r.policy.insurerName,
      coverageType: coverageTypeAr(r.policy.coverageType),
      startDate: formatDisplayDate(r.policy.startDate),
      endDate: formatDisplayDate(r.policy.endDate),
      daysRemaining: r.daysRemaining,
      cost: r.policy.cost,
      status: INSURANCE_STATUS_AR[r.status],
      urgency: INSURANCE_URGENCY_AR[r.urgency],
      notes: r.policy.notes ?? '',
    })),
    totalsRow: { equipmentCode: 'الإجمالي', cost: totalCost },
  };
}
