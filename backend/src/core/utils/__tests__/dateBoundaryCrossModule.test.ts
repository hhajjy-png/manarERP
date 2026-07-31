import { describe, it, expect, vi } from 'vitest';

/**
 * Backend Date-Boundary Unification Pack v1 — الثابت (A): نفس المدى = نفس الحدود.
 *
 * هذا هو الاختبار الذي كان سيمنع العيب أصلًا. لم تكن المشكلة أن وحدة بعينها
 * أخطأت، بل أن كل وحدة كانت تحلّل `from`/`to` بنفسها: بعضها منتصف ليل محلي،
 * وبعضها منتصف ليل UTC، وبعضها بلا `endOfDay` إطلاقًا. فكان اختيار الفترة
 * الواحد من PeriodControl يعيد صفوفًا مختلفة حسب الشاشة.
 *
 * هنا نجمع بُناة الشروط **النقية** من وحدات مختلفة ونؤكّد أنها تشتقّ لحظة
 * واحدة بعينها لنفس المدخل. لا يهم شكل الشرط ولا اسم العمود — تُقارَن اللحظات.
 */

vi.mock('@config/database.js', () => ({ prisma: {} }));
vi.mock('../../../config/database', () => ({ prisma: {} }));

import { localDateRange } from '../dateWindows';
import { resolvePeriod } from '../periodFilter';
import { buildChequeFilterWhere } from '../../../modules/cheques/cheques.service';
import { buildAttendanceWhere } from '../../../modules/employees/attendance.filters';
import { buildTimelineWhere } from '../../../modules/bankStatementImport/service';
import { expectLocalRange } from './localDayMatchers';

const FROM = '2026-08-01';
const TO = '2026-08-31';

/** يستخرج {gte,lte} من أي شرط Prisma مهما كان اسم عمود التاريخ فيه. */
function bounds(range: unknown): { gte: number; lte: number } {
  const r = range as { gte?: Date; lte?: Date };
  return { gte: r.gte!.getTime(), lte: r.lte!.getTime() };
}

describe('الثابت A — نفس from/to ⇒ نفس اللحظتين عبر كل الوحدات', () => {
  it('Cheques / Attendance / Bank Timeline / resolvePeriod / localDateRange متطابقة', () => {
    const canonical = localDateRange(FROM, TO)!;

    const cheques = buildChequeFilterWhere({ from: FROM, to: TO }).chequeDate;
    const attendance = buildAttendanceWhere({ from: FROM, to: TO }).date;
    const timeline = buildTimelineWhere('A', { fromDate: FROM, toDate: TO }).statementDate;
    const period = resolvePeriod({ fromDate: FROM, toDate: TO }).flow;

    const expected = bounds(canonical);
    expect(bounds(cheques)).toEqual(expected);
    expect(bounds(attendance)).toEqual(expected);
    expect(bounds(timeline)).toEqual(expected);
    expect(bounds(period)).toEqual(expected);
  });

  it('وكلها تعبّر عن المدى التقويمي المحلي الكامل شامل الطرفين', () => {
    expectLocalRange(buildChequeFilterWhere({ from: FROM, to: TO }).chequeDate, FROM, TO);
    expectLocalRange(buildAttendanceWhere({ from: FROM, to: TO }).date, FROM, TO);
    expectLocalRange(buildTimelineWhere('A', { fromDate: FROM, toDate: TO }).statementDate, FROM, TO);
    expectLocalRange(resolvePeriod({ fromDate: FROM, toDate: TO }).flow, FROM, TO);
  });

  it('يوم واحد: كل الوحدات تغطّي اليوم بأكمله', () => {
    const D = '2026-08-02';
    expectLocalRange(buildChequeFilterWhere({ from: D, to: D }).chequeDate, D, D);
    expectLocalRange(buildAttendanceWhere({ from: D, to: D }).date, D, D);
    expectLocalRange(buildTimelineWhere('A', { fromDate: D, toDate: D }).statementDate, D, D);
    expectLocalRange(resolvePeriod({ fromDate: D, toDate: D }).flow, D, D);
  });

  it('بلا حدود: كل الوحدات تترك الاستعلام بلا قيد زمني (كل الفترات)', () => {
    expect(buildChequeFilterWhere({}).chequeDate).toBeUndefined();
    expect(buildAttendanceWhere({}).date).toBeUndefined();
    expect(buildTimelineWhere('A', {}).statementDate).toBeUndefined();
    expect(resolvePeriod({}).hasRange).toBe(false);
  });
});
