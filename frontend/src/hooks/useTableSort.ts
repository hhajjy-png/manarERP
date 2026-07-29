import { usePersistedState } from './usePersistedState';

/**
 * أساس الفرز الموحّد للواجهة (Enterprise Data Grid Foundation v1).
 *
 * حالة فرز واحدة لكل وحدة، بدورة ثلاثية: افتراضي ← تصاعدي ← تنازلي ← افتراضي.
 * عمود نشط واحد فقط؛ النقر على عمود جديد يبدأ دورته من التصاعدي.
 * «الافتراضي» = ترتيب الخادم للوحدة، أو `ModuleConfig.defaultSort` إن حُدِّد.
 *
 * الحالة **حالة عرض مستقلة**: البحث والفلاتر والترقيم وفتح الـ Drawer لا تمسّها.
 * تُمسح فقط عند إكمال الدورة إلى الافتراضي أو عند «إعادة تعيين الفلاتر».
 *
 * تُحفظ لكل وحدة على حدة تحت `rp:<module>:sort` (نفس بنية page/search/filter)
 * فلا تتسرّب بين الوحدات، وتنجو من التنقّل وإعادة التحميل، وتُمسح عند الخروج
 * ضمن clearPersistedUIState (بادئة `rp:` مشمولة أصلًا).
 */

export type SortDir = 'asc' | 'desc';
export type SortHeaderState = SortDir | 'none';

interface SortState {
  by: string | null;
  dir: SortDir;
}

export interface TableSortController {
  /** العمود النشط (null = الترتيب الافتراضي للوحدة، لا تُرسل معطيات فرز). */
  sortBy: string | null;
  sortDir: SortDir;
  /** حالة عمود معيّن — لعرض مؤشر الفرز في الترويسة. */
  getState: (columnKey: string) => SortHeaderState;
  /** يقدّم دورة الفرز للعمود؛ عمود مختلف يبدأ من التصاعدي. */
  toggle: (columnKey: string) => void;
  /** عودة صريحة إلى الافتراضي (زر إعادة تعيين الفلاتر). */
  reset: () => void;
}

const NO_SORT: SortState = { by: null, dir: 'asc' };

export function useTableSort(
  moduleKey: string,
  /** يُستدعى بعد كل تغيير فرز — تستخدمه ResourcePage للعودة للصفحة الأولى (فرز جديد = استعلام جديد). */
  onChange?: () => void,
  /**
   * ترتيب افتراضي خاص بالوحدة (`ModuleConfig.defaultSort`). عند غيابه يبقى
   * الافتراضي كما كان: بلا معطيات فرز ⇒ ترتيب الخادم الافتراضي للوحدة.
   */
  defaultSort?: { by: string; dir: SortDir },
): TableSortController {
  const fallback: SortState = defaultSort ? { by: defaultSort.by, dir: defaultSort.dir } : NO_SORT;
  const [state, setState] = usePersistedState<SortState>(`rp:${moduleKey}:sort`, fallback);

  function toggle(columnKey: string) {
    setState((prev) => {
      if (prev.by !== columnKey) return { by: columnKey, dir: 'asc' };
      if (prev.dir === 'asc') return { by: columnKey, dir: 'desc' };
      return fallback;
    });
    onChange?.();
  }

  function reset() {
    setState(fallback);
    onChange?.();
  }

  return {
    sortBy: state.by,
    sortDir: state.dir,
    getState: (columnKey) => (state.by === columnKey ? state.dir : 'none'),
    toggle,
    reset,
  };
}
