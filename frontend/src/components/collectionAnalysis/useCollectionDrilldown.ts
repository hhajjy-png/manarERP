import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import type { CollectionDrilldownResult, CollectionFilters, DrilldownScope } from './collectionTypes';

/* ════════════════════════════════════════════════════════════════════════════
   تحميل فواتير خليّة بعينها — يخدم درج التفصيل **وتوسيع الصفوف داخل الجداول**
   معًا، فلا يوجد مساران للبيانات نفسها.

   ═══ لماذا مفتاح نصّي في مصفوفة الاعتماديات؟ ═══
   `filters` و`scope` كائنان يُعاد إنشاؤهما في كل رسم. وضعهما مباشرةً في
   الاعتماديات يُشعل حلقة جلب لا تنتهي — وهو عيب وقع فعليًا في مركز التحليل
   المالي وعولج هناك بالمبدأ نفسه. التسلسل إلى نصّ يجعل الاعتمادية **قيمة**
   مستقرّة: لا يُعاد الطلب إلا حين تتغيّر قيمة فلترٍ فعلًا.
   ════════════════════════════════════════════════════════════════════════════ */

/** فلاتر الصفحة + حصر الخليّة ⇒ معطيات استعلام مسطّحة، بلا مفاتيح فارغة. */
export function toDrilldownParams(
  filters: CollectionFilters,
  scope: DrilldownScope,
): Record<string, string | number | boolean> {
  const params: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries({ ...filters, ...scope })) {
    if (value === undefined || value === null || value === '') continue;
    params[key] = value as string | number | boolean;
  }
  return params;
}

export interface DrilldownState {
  data: CollectionDrilldownResult | null;
  loading: boolean;
  /** مفتاح رسالة الخطأ لا نصّها المترجَم — يُخرج `t` غير المستقرّة من التأثير. */
  errorKey: string;
}

export function useCollectionDrilldown(filters: CollectionFilters, scope: DrilldownScope): DrilldownState {
  const params = useMemo(() => toDrilldownParams(filters, scope), [filters, scope]);
  const paramsKey = JSON.stringify(params);

  const [state, setState] = useState<DrilldownState>({ data: null, loading: true, errorKey: '' });

  useEffect(() => {
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true, errorKey: '' }));
    api
      .get<{ data: CollectionDrilldownResult }>('/collection-analysis/drilldown', {
        signal: controller.signal,
        params: JSON.parse(paramsKey) as Record<string, string | number | boolean>,
      })
      .then((r) => setState({ data: r.data.data, loading: false, errorKey: '' }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ data: null, loading: false, errorKey: 'ca.drill.error' });
      });
    return () => controller.abort();
  }, [paramsKey]);

  return state;
}
