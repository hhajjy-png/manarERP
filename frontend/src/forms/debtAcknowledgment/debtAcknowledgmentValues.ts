/**
 * إقرار دين موظف — حلّ القيمة المعروضة لكل حقل، حسب لغة القالب.
 *
 * ═══ لماذا وحدة مستقلة ═══
 * القالب يعرض هذه القيم، والحارس اللغوي يفحصها. لو حلّ كلٌّ منهما القيمة بطريقته
 * لأمكن أن يفحص الحارسُ نصًّا ويطبعَ القالبُ نصًّا آخر — وهو بالضبط نوع الخطأ الذي
 * وُجد الحارس ليمنعه. المصدر هنا واحد، يستدعيه الاثنان.
 */
import { toWesternDigits } from '../../lib/dateInput';
import {
  latinTwinOf,
  LOCALIZABLE_FIELD_IDS,
  type DebtAckData,
  type DebtAckLang,
  type FieldId,
} from './debtAcknowledgmentModel';

/**
 * القيمة التي ستُطبع فعلًا لهذا الحقل في هذا القالب.
 *
 * · العربي: القيمة الأصلية.
 * · الإنجليزي والهندي: النظير اللاتيني **بلا سقوط إلى العربية** — النظير الفارغ يعني
 *   خانة غير معبّأة (يطبعها القالب كسلسلة نقاط)، لا نصًّا عربيًا يتسرّب.
 *
 * كل قيمة تمرّ من `toWesternDigits`، فرقمٌ كُتب بأرقام عربية-هندية (٠١٢…) يُطبع
 * غربيًا في القوالب الثلاثة — وهو المعيار المعتمد في المشروع للأرقام كلها.
 */
export function resolveFieldValue(data: DebtAckData, id: FieldId, lang: DebtAckLang): string {
  if (lang === 'ar') return toWesternDigits(data[id] ?? '');
  const twin = latinTwinOf(id);
  return toWesternDigits((twin ? data[twin] : data[id]) ?? '');
}

/**
 * كل القيم الديناميكية التي سيحملها المستند في هذا القالب، بمعرّفاتها الأصلية.
 *
 * تُستعمل للفحص لا للعرض: مفتاح الخريطة هو الحقل **المنطقي** (`debtorFullName`)
 * لا نظيره اللاتيني، كي تُعرض للمستخدم تسميةٌ يفهمها حين يُرفض القالب.
 *
 * `amountWords*` مُقصاة عمدًا من الحقول اللغوية العامة: لكل لغة خانتها الخاصة أصلًا،
 * وتُضاف هنا خانةُ اللغة المعنيّة وحدها.
 */
export function resolveDynamicValues(data: DebtAckData, lang: DebtAckLang): Record<string, string> {
  const out: Record<string, string> = {};

  for (const id of LOCALIZABLE_FIELD_IDS) {
    out[id] = resolveFieldValue(data, id, lang);
  }

  // حقول قيمتها واحدة في اللغات الثلاث (أرقام، هويات، مبالغ، مراجع بنكية): تُفحص
  // أيضًا — لا شيء يمنع مستخدمًا من كتابة ملاحظة عربية داخل خانة رقم شيك.
  for (const id of [
    'creditorCivilId',
    'creditorCommercialReg',
    'debtorCivilId',
    'debtorPassportNo',
    'debtorEmployeeNo',
    'amountFigures',
    'balanceFigures',
    'transferNo',
    'chequeNo',
    'cashReceiptNo',
    'installmentsCount',
    'installmentAmount',
    'monthlyDueDay',
    'finalInstallmentAmount',
    'creditorIban',
    'witness1CivilId',
    'witness2CivilId',
    'interpreterCivilId',
  ] as const) {
    out[id] = resolveFieldValue(data, id, lang);
  }

  // المبلغ/الرصيد بالحروف: خانة اللغة المعروضة وحدها.
  const suffix = lang === 'ar' ? 'Ar' : lang === 'en' ? 'En' : 'Hi';
  out.amountWords = toWesternDigits(data[`amountWords${suffix}` as FieldId] ?? '');
  out.balanceWords = toWesternDigits(data[`balanceWords${suffix}` as FieldId] ?? '');

  return out;
}
