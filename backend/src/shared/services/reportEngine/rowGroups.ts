/**
 * مجموعات الصفوف المتجاورة — عرضٌ بحت.
 *
 * تقرير يُعلن `ReportInput.rowGroupKey` يحمل في كل صفّ معرّف مجموعة (مثل مفتاح
 * الشيك الموزَّع على عدّة فواتير). كل **كتلة متجاورة** من صفّين فأكثر بنفس المعرّف
 * غير الفارغ تُعرض مجموعةً واحدة: لون خلفية موحّد، وخلايا الأعمدة التي تُعلن
 * `mergeRowGroup` تُدمج رأسيًا (rowspan) فتظهر قيمتها مرّة واحدة.
 *
 * الكتل تُحسب من الصفوف **كما تُعرض** وبترتيبها: صفّان من المجموعة نفسها يفصلهما
 * صفّ آخر (بسبب الفرز) كتلتان مستقلّتان — لا دمج عبر صفوف غريبة، ولا إعادة فرز.
 */

export interface RowGroupCell {
  /** rowspan الخليّة المدمجة: طول الكتلة في أول صفّ منها، `0` في بقيّتها (لا خليّة)، `1` خارج أي كتلة. */
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
