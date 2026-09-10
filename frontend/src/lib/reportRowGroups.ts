/**
 * مجموعات الصفوف المتجاورة في جداول التقارير — عرضٌ بحت.
 *
 * نظير `backend/src/shared/services/reportEngine/rowGroups.ts` حرفيًا (الواجهة والخادم
 * لا يتشاركان شيفرة). تقرير يُعلن `rowGroupKey` يحمل في كل صفّ معرّف مجموعة؛ كل كتلة
 * **متجاورة** من صفّين فأكثر بنفس المعرّف غير الفارغ تُلوَّن لونًا موحّدًا، وتُدمج
 * فيها أعمدة `mergeRowGroup` رأسيًا (rowspan).
 *
 * تُحسب من الصفوف **كما تُعرض الآن** — بعد الفرز والبحث السريع — فلا دمج عبر صفوف
 * غريبة، ولا عبر صفّ أخفاه البحث.
 */

export interface RowGroupCell {
  /** rowspan: طول الكتلة في أول صفّ منها، `0` في بقيّتها (لا خليّة)، `1` خارج أي كتلة. */
  span: number;
  /** الصفّ جزء من كتلة من صفّين فأكثر — يأخذ لون المجموعة. */
  grouped: boolean;
}

function groupIdOf(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  return value === null || value === undefined || value === '' ? null : String(value);
}

export function rowGroupLayout(rows: readonly Record<string, unknown>[], key: string): RowGroupCell[] {
  const ids = rows.map((row) => groupIdOf(row, key));
  const layout: RowGroupCell[] = [];

  let start = 0;
  while (start < ids.length) {
    let end = start + 1;
    while (ids[start] !== null && end < ids.length && ids[end] === ids[start]) end++;

    const size = end - start;
    if (size === 1) layout.push({ span: 1, grouped: false });
    else for (let i = 0; i < size; i++) layout.push({ span: i === 0 ? size : 0, grouped: true });

    start = end;
  }
  return layout;
}
