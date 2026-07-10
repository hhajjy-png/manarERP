import { recordAudit } from '../../core/middleware/audit';
import { getRequestActor } from '../../core/context/requestContext';
import type { Request } from 'express';

/** إجراء Audit للمعاملات المؤرَّخة في سنة مالية سابقة. */
export const HISTORICAL_AUDIT_ACTION = 'HISTORICAL_ENTRY';

export type EntrySource = 'MANUAL' | 'IMPORT';

/**
 * هل التاريخ يقع في سنة مالية سابقة للسنة الجارية؟
 * السنة المالية = السنة الميلادية في هذا النظام (لا توجد سنة مالية مزاحة).
 */
export function isHistoricalDate(date: Date, now: Date = new Date()): boolean {
  return date.getFullYear() < now.getFullYear();
}

export interface HistoricalEntryInput {
  req: Request;
  /** الوحدة: invoices | expenses | payments | payroll | accounting | cheques */
  module: string;
  /** نوع السجل بالعربية للعرض: 'فاتورة مبيعات'، 'مصروف'... */
  recordType: string;
  /** المعرّف الرقمي للسجل. */
  entityId: string | number;
  /** الرقم المستندي المقروء (INV-2024-00012)، إن وُجد. */
  documentNumber?: string | null;
  /** تاريخ العملية المحاسبي — لا تاريخ الإنشاء. */
  transactionDate: Date;
  /** سبب الإدخال المتأخر كما أدخله المستخدم. */
  lateEntryReason?: string | null;
  source?: EntrySource;
}

/**
 * يسجّل إدخال معاملة تخصّ سنة مالية سابقة.
 *
 * لا ينشئ نظام تدقيق جديدًا: يكتب في `AuditLog` القائم عبر `recordAudit`،
 * الذي يُسَلسِل `newValue` إلى JSON — فلا حاجة لأي Migration.
 * لا يفعل شيئًا إذا كان التاريخ ضمن السنة الجارية، حتى لا يتضخّم السجل.
 *
 * `overrodePeriodLock` لا يُحسب هنا: تجاوز القفل يُسجَّل مستقلًا وذرّيًا
 * داخل معاملة الترحيل بواسطة `assertPeriodOpen`.
 */
export async function recordHistoricalEntry(input: HistoricalEntryInput): Promise<void> {
  if (!isHistoricalDate(input.transactionDate)) return;

  const actor = getRequestActor();

  await recordAudit({
    req: input.req,
    action: HISTORICAL_AUDIT_ACTION,
    module: input.module,
    entityId: input.entityId,
    newValue: {
      recordType: input.recordType,
      documentNumber: input.documentNumber ?? null,
      transactionDate: input.transactionDate.toISOString(),
      fiscalYear: input.transactionDate.getFullYear(),
      enteredAt: new Date().toISOString(),
      enteredByUserId: actor?.userId ?? null,
      lateEntryReason: input.lateEntryReason ?? null,
      source: input.source ?? 'MANUAL',
    },
  });
}
