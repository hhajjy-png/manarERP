/**
 * أدوات تأكيد لحدود اليوم المحلي — Backend Date-Boundary Unification Pack v1.
 *
 * لماذا لا نقارن باللحظة المطلقة (`new Date('2026-01-01')` أو نص ISO)؟
 * لأن ذلك يثبّت **إزاحة منطقة زمنية بعينها** داخل الاختبار. اختبار كهذا ينجح في
 * الكويت ويسقط في نيويورك — أو أسوأ: ينجح في الاثنتين بينما المنطق نفسه يختار
 * اليوم الخطأ، لأن التأكيد لم ينظر إلى اليوم أصلًا (وهو ما كان يحدث فعلًا في
 * الحزمة السابقة: كانت تتحقق من `getHours() === 23` ولا تتحقق من التاريخ).
 *
 * هذه الأدوات تتحقق من **مكوّنات التقويم المحلي** فقط، فتبقى صحيحة في أي منطقة.
 */
import { expect } from 'vitest';

/** يفكّك `'YYYY-MM-DD'` إلى مكوّناته الرقمية. */
function ymd(dateStr: string): { y: number; m: number; d: number } {
  const [y, m, d] = dateStr.split('-').map(Number);
  return { y, m, d };
}

/** يؤكّد أن `actual` هو **أول لحظة** في اليوم التقويمي المحلي `dateStr`. */
export function expectLocalStartOfDay(actual: unknown, dateStr: string): void {
  expect(actual).toBeInstanceOf(Date);
  const d = actual as Date;
  const { y, m, d: day } = ymd(dateStr);
  expect({
    year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(),
    h: d.getHours(), min: d.getMinutes(), s: d.getSeconds(), ms: d.getMilliseconds(),
  }).toEqual({ year: y, month: m, day, h: 0, min: 0, s: 0, ms: 0 });
}

/** يؤكّد أن `actual` هو **آخر لحظة** في اليوم التقويمي المحلي `dateStr`. */
export function expectLocalEndOfDay(actual: unknown, dateStr: string): void {
  expect(actual).toBeInstanceOf(Date);
  const d = actual as Date;
  const { y, m, d: day } = ymd(dateStr);
  expect({
    year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(),
    h: d.getHours(), min: d.getMinutes(), s: d.getSeconds(), ms: d.getMilliseconds(),
  }).toEqual({ year: y, month: m, day, h: 23, min: 59, s: 59, ms: 999 });
}

/** يؤكّد أن فلتر `{ gte, lte }` يغطّي المدى التقويمي المحلي كاملًا وشاملًا الطرفين. */
export function expectLocalRange(range: unknown, from: string, to: string): void {
  const r = range as { gte?: Date; lte?: Date };
  expectLocalStartOfDay(r?.gte, from);
  expectLocalEndOfDay(r?.lte, to);
}
