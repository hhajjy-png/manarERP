/**
 * الملء التلقائي لإقرار دين موظف من سجل الموظف.
 *
 * ═══ قاعدتان صارمتان ═══
 * 1. **قراءة فقط.** لا شيء هنا يكتب في سجل الموظف. تعديل المستخدم لأي حقل بعد الملء
 *    يخصّ هذا المستند وحده، ولا يصل إلى قاعدة البيانات إطلاقًا — لا يوجد في هذه
 *    الحزمة أي استدعاء `PUT`/`PATCH` لوحدة الموظفين.
 * 2. **لا يدهس إدخالًا قائمًا.** `applyAutofill` تملأ الحقول **الفارغة** فقط، فإعادة
 *    الملء (أو وصول بيانات الموظف متأخرًا) لا تمحو ما كتبه المستخدم بيده.
 *
 * الحقول المملوءة هي فقط ما يقابل حقلًا موجودًا فعلًا في ملفات Word الثلاثة.
 */
import { COMPANY_NAME } from '../shared/formStyles';
import type { DebtAckData, FieldId } from './debtAcknowledgmentModel';

/** الشكل المطلوب من سجل الموظف — كل الحقول اختيارية كما في مخطط Prisma. */
export interface DebtAckEmployee {
  code?: string | null;
  fullName?: string | null;
  fullNameEn?: string | null;
  civilId?: string | null;
  jobTitle?: string | null;
  nationality?: string | null;
  passportNumber?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
}

const s = (v: string | null | undefined) => (v ?? '').trim();

/**
 * خريطة «سجل الموظف ← حقول المستند».
 *
 * `debtorContact` تجمع الهاتف والبريد في خانة واحدة لأن ملف Word يعرضهما في حقل
 * واحد («الهاتف والبريد الإلكتروني» / «Telephone and email»)، لا لأننا اخترنا دمجهما.
 */
export function buildDebtAckAutofill(employee: DebtAckEmployee | null | undefined): Partial<Record<FieldId, string>> {
  const contact = [s(employee?.phone), s(employee?.email)].filter(Boolean).join(' / ');
  return {
    creditorName: COMPANY_NAME,
    debtorFullName: s(employee?.fullName),
    debtorCivilId: s(employee?.civilId),
    debtorNationality: s(employee?.nationality),
    debtorPassportNo: s(employee?.passportNumber),
    debtorEmployeeNo: s(employee?.code),
    debtorJobTitle: s(employee?.jobTitle),
    debtorAddressKuwait: s(employee?.address),
    debtorContact: contact,
    debtorSignatoryName: s(employee?.fullName),
  };
}

/** يدمج الملء التلقائي في الحالة الحالية — **دون** استبدال أي حقل كتبه المستخدم. */
export function applyAutofill(current: DebtAckData, autofill: Partial<Record<FieldId, string>>): DebtAckData {
  const next = { ...current };
  for (const [id, value] of Object.entries(autofill) as [FieldId, string][]) {
    if (value && !next[id]) next[id] = value;
  }
  return next;
}
