/**
 * إقرار دين موظف — اشتقاق حالة المستند من مدخلاته.
 *
 * يربط بين حاسبة الأقساط الخالصة (`debtAcknowledgmentSchedule`) وبين حقول المستند
 * (`debtAcknowledgmentModel`). وُضع في وحدة مستقلة لأن ثلاثة مستهلكين يحتاجونه ولا
 * يجوز أن يشتقّ كلٌّ منهم بطريقته: شاشة النموذج، ومقياس هندسة الطباعة، والاختبارات.
 */
import { formatNumber } from '../../lib/format/currency';
import { MAX_INSTALLMENTS } from './constants';
import type { DebtAckData } from './debtAcknowledgmentModel';
import { buildInstallmentSchedule, type InstallmentRow } from './debtAcknowledgmentSchedule';

/**
 * حقول البند 4 مشتقّة من الجدول لا مُدخَلة بمعزل عنه: قيمة القسط، والقسط الأخير
 * وتاريخه، ويوم الاستحقاق الشهري. فلا يمكن أن يعلن المستند قيمة قسط تخالف الجدول
 * المطبوع تحته في الملحق.
 *
 * المبالغ عبر `formatNumber` — نفس المُنسِّق الذي يطبع به الملحق أرقامه، فيخرج الرقم
 * نفسه في الموضعين بالشكل نفسه.
 */
export function derivedInstallmentFields(
  rows: readonly InstallmentRow[],
  firstDate: string,
): Partial<DebtAckData> {
  if (rows.length === 0) {
    return { installmentAmount: '', finalInstallmentAmount: '', finalInstallmentDate: '', monthlyDueDay: '' };
  }
  const last = rows[rows.length - 1];
  const day = /^\d{4}-\d{2}-(\d{2})$/.exec(firstDate)?.[1];
  return {
    installmentAmount: formatNumber(rows[0].amount),
    finalInstallmentAmount: formatNumber(last.amount),
    finalInstallmentDate: last.dueDate,
    monthlyDueDay: day ? String(Number(day)) : '',
  };
}

/**
 * المبلغ الذي **تُقسَّط عليه** الأقساط: الرصيد القائم عند التوقيع.
 *
 * ═══ لماذا الرصيد لا أصل الدين ═══
 * البند 1 يعلن المبلغ المستلَم، والبند 3 يعلن ما بقي في ذمّة المدين **يوم توقيع
 * الإقرار**. والمقسَّط هو الثاني: من استلم ألفًا وسدّد مئتين قبل التوقيع يوقّع على
 * جدول مجموعه ثمانمئة، لا ألف. وفي السلفة الجديدة القيمتان متساويتان، فلا فرق.
 *
 * كان الجدول يُشتقّ من `amountFigures` دائمًا — وهو ما سُجِّل وقتها في `F-10` بوصفه
 * قرارًا لمالك المنتج. وقد قرّره: الرصيد هو الأساس.
 *
 * والرصيد الفارغ يعود إلى أصل الدين بدل أن يُعطّل الجدول: مستندٌ لم يُملأ فيه الرصيد
 * بعد هو مستند سلفةٍ جديدة، لا مستند دَينٍ بصفر.
 */
export function scheduleBaseAmount(data: DebtAckData): number {
  const balance = Number(data.balanceFigures);
  if (data.balanceFigures.trim() !== '' && Number.isFinite(balance)) return balance;
  return Number(data.amountFigures);
}

/**
 * يعيد توليد الجدول والحقول المشتقّة من المدخلات الثلاثة.
 *
 * مدخلات غير صالحة (مبلغ ≤ 0، عدد غير صحيح أو خارج الحدّ، تاريخ ناقص) تُنتج جدولًا
 * فارغًا وحقولًا مشتقّة فارغة — لا جدولًا نصفَ صحيح. الخلل نفسه يُعرض للمستخدم عبر
 * `validateSchedule`، فلا يمرّ صامتًا.
 */
export function regenerateSchedule(data: DebtAckData): DebtAckData {
  const debtAmount = scheduleBaseAmount(data);
  const count = Number(data.installmentsCount);
  const usable =
    Number.isFinite(debtAmount) &&
    debtAmount > 0 &&
    Number.isInteger(count) &&
    count >= 1 &&
    count <= MAX_INSTALLMENTS &&
    Boolean(data.firstInstallmentDate);

  const rows = usable ? buildInstallmentSchedule({ debtAmount, count, firstDate: data.firstInstallmentDate }) : [];
  return {
    ...data,
    schedule: rows,
    scheduleManual: false,
    ...derivedInstallmentFields(rows, data.firstInstallmentDate),
  };
}
