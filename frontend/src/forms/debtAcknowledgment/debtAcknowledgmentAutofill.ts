/**
 * الملء التلقائي لإقرار دين موظف من سجل الموظف، وتثبيت بيانات الدائن.
 *
 * ═══ ثلاث قواعد صارمة ═══
 * 1. **قراءة فقط.** لا شيء هنا يكتب في سجل الموظف. تعديل المستخدم لأي حقل بعد الملء
 *    يخصّ هذا المستند وحده، ولا يصل إلى قاعدة البيانات إطلاقًا — لا يوجد في هذه
 *    الحزمة أي استدعاء `PUT`/`PATCH` لوحدة الموظفين.
 * 2. **لا يدهس إدخالًا قائمًا.** `applyAutofill` تملأ الحقول **الفارغة** فقط، فإعادة
 *    الملء (أو وصول بيانات الموظف متأخرًا) لا تمحو ما كتبه المستخدم بيده.
 * 3. **لا نقل للعربية إلى الخانات اللاتينية.** النظير اللاتيني يُملأ من مصدر لاتيني
 *    حقيقي فقط: `fullNameEn` من سجل الموظف، أو الاسم الإنجليزي للشركة، أو قيمة
 *    لا تحمل حرفًا عربيًا أصلًا (هاتف، بريد، رقم). ما عدا ذلك يبقى فارغًا ليكتبه
 *    المستخدم — لا ترجمة آلية ولا نقل حرفي ولا تخمين.
 *
 * الحقول المملوءة هي فقط ما يقابل حقلًا موجودًا فعلًا في ملفات Word الثلاثة.
 */
import { containsArabicScript } from './arabicScript';
import {
  CREDITOR_COMMERCIAL_REGISTRATION_NO,
  CREDITOR_NAME_AR,
  CREDITOR_NAME_LATIN,
  CREDITOR_UNIFIED_NUMBER,
} from './constants';
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

/** القيمة نفسها إن كانت خالية من الحرف العربي، وإلا فراغ — أساس القاعدة (3) أعلاه. */
const latinOnly = (v: string) => (v && !containsArabicScript(v) ? v : '');

/**
 * بيانات الدائن **الثابتة** في هذا الإقرار: السجل التجاري والرقم الموحّد.
 *
 * تُفرض على كل حالة (بعد الملء التلقائي، وبعد تحميل مسودّة قديمة، وبعد مسح الحقول)
 * لا تُملأ مرة واحدة فقط — فلا يمكن لمستند أن يُطبع بسجل تجاري خاطئ أو ناقص. وهي
 * للقراءة في شاشة الإدخال، فلا يعدّلها المستخدم سهوًا.
 */
export function withFixedCreditorData(data: DebtAckData): DebtAckData {
  if (
    data.creditorCommercialReg === CREDITOR_COMMERCIAL_REGISTRATION_NO &&
    data.creditorCivilId === CREDITOR_UNIFIED_NUMBER
  ) {
    return data;
  }
  return {
    ...data,
    creditorCommercialReg: CREDITOR_COMMERCIAL_REGISTRATION_NO,
    creditorCivilId: CREDITOR_UNIFIED_NUMBER,
  };
}

/**
 * خريطة «سجل الموظف ← حقول المستند».
 *
 * `debtorContact` تجمع الهاتف والبريد في خانة واحدة لأن ملف Word يعرضهما في حقل
 * واحد («الهاتف والبريد الإلكتروني» / «Telephone and email»)، لا لأننا اخترنا دمجهما.
 */
export function buildDebtAckAutofill(employee: DebtAckEmployee | null | undefined): Partial<Record<FieldId, string>> {
  const fullName = s(employee?.fullName);
  const fullNameEn = s(employee?.fullNameEn);
  const nationality = s(employee?.nationality);
  const jobTitle = s(employee?.jobTitle);
  const address = s(employee?.address);
  const contact = [s(employee?.phone), s(employee?.email)].filter(Boolean).join(' / ');

  return {
    // ── القالب العربي ────────────────────────────────────────────────────────
    creditorName: CREDITOR_NAME_AR,
    debtorFullName: fullName,
    debtorCivilId: s(employee?.civilId),
    debtorNationality: nationality,
    debtorPassportNo: s(employee?.passportNumber),
    debtorEmployeeNo: s(employee?.code),
    debtorJobTitle: jobTitle,
    debtorAddressKuwait: address,
    debtorContact: contact,
    debtorSignatoryName: fullName,

    // ── النظائر اللاتينية (القالبان الإنجليزي والهندي) ────────────────────────
    // اسم الشركة الإنجليزي واسم الموظف الإنجليزي مصدران لاتينيان حقيقيان. البقية
    // تُنسخ **فقط** حين تكون القيمة خالية من العربية أصلًا (هاتف، بريد، أرقام) —
    // وإلا تُترك فارغة ليكتبها المستخدم في قسم «بيانات القالب الإنجليزي/الهندي».
    creditorNameLatin: CREDITOR_NAME_LATIN,
    debtorFullNameLatin: fullNameEn || latinOnly(fullName),
    debtorNationalityLatin: latinOnly(nationality),
    debtorJobTitleLatin: latinOnly(jobTitle),
    debtorAddressKuwaitLatin: latinOnly(address),
    debtorContactLatin: latinOnly(contact),
    debtorSignatoryNameLatin: fullNameEn || latinOnly(fullName),
  };
}

/** يدمج الملء التلقائي في الحالة الحالية — **دون** استبدال أي حقل كتبه المستخدم. */
export function applyAutofill(current: DebtAckData, autofill: Partial<Record<FieldId, string>>): DebtAckData {
  const next = { ...current };
  for (const [id, value] of Object.entries(autofill) as [FieldId, string][]) {
    if (value && !next[id]) next[id] = value;
  }
  return withFixedCreditorData(next);
}
