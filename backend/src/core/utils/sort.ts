/**
 * أساس الفرز الموحّد (Enterprise Data Grid Foundation v1).
 *
 * الفرز خادمي بالكامل — الترقيم خادمي (15 صفًا/صفحة) ففرز الواجهة وحدها كان
 * سيرتّب الصفحة الظاهرة فقط ويضلّل المستخدم. النمط منسوخ من السابقة المجرّبة في
 * وحدة الرواتب (salaries.bankAnalytics): قائمة بيضاء لكل وحدة + اتجاه مُتحقَّق منه
 * + مفتاح كسر تعادل ثابت.
 *
 * القائمة البيضاء هي حدّ الأمان: أي `sortBy` غير مُدرج يعود بهدوء إلى الترتيب
 * الافتراضي للوحدة — علم الواجهة (`Column.sortable`) وحده لا يكفي أبدًا.
 */

export type SortDir = 'asc' | 'desc';

/**
 * تعريف عمود قابل للفرز في القائمة البيضاء:
 * - نص: اسم حقل Prisma عددي/نصي غير قابل لـ NULL — `'code'` → `{ code: dir }`.
 * - `{ field, nullable }`: حقل اختياري — يُفرز بـ `nulls: 'last'` كي لا تتصدّر
 *   الخلايا الفارغة أعلى القائمة عند الفرز التصاعدي (سلوك SQLite الافتراضي).
 * - دالة: حالات العلاقات/الأعمدة المشتقّة — `dir => ({ customer: { name: dir } })`.
 *   ملاحظة: `nulls` غير مدعومة على حقول العلاقات (خطأ P2009) فلا تُستخدم فيها.
 */
export type SortMapping =
  | string
  | { field: string; nullable: true }
  | ((dir: SortDir) => Record<string, unknown>);

export type SortWhitelist = Record<string, SortMapping>;

/** جزء orderBy واحد كما تتوقّعه Prisma (يُحدَّد نوعه بدقة عند موضع الاستدعاء). */
export type OrderByFragment = Record<string, unknown>;

/**
 * يبني مصفوفة `orderBy` من معطيات الاستعلام:
 * - بلا `sortBy` (أو غير مُدرج في القائمة البيضاء) → الترتيب الافتراضي **كما هو**.
 * - مع `sortBy` صالح → `[الفرز المطلوب, ...كاسر التعادل]` — كاسر التعادل يضمن
 *   ثبات ترقيم الصفحات عند تساوي القيم (skip/take بلا ترتيب حتمي يكرّر صفوفًا
 *   أو يُسقطها بين الصفحات).
 *
 * `hasOwnProperty` وليس وصولًا مباشرًا: مفاتيح مثل `__proto__`/`constructor`
 * موجودة على السلسلة النموذجية لأي كائن، والوصول المباشر كان سيقبلها كمُدخلات.
 */
export function buildOrderBy(
  query: { sortBy?: unknown; sortDir?: unknown },
  whitelist: SortWhitelist,
  defaultOrderBy: OrderByFragment[],
  tiebreaker: OrderByFragment[] = defaultOrderBy,
): OrderByFragment[] {
  const sortBy = typeof query.sortBy === 'string' ? query.sortBy : '';
  if (!sortBy || !Object.prototype.hasOwnProperty.call(whitelist, sortBy)) {
    return defaultOrderBy;
  }

  const mapping = whitelist[sortBy];
  const dir: SortDir = query.sortDir === 'asc' ? 'asc' : 'desc';

  const primary: OrderByFragment =
    typeof mapping === 'function'
      ? mapping(dir)
      : typeof mapping === 'string'
        ? { [mapping]: dir }
        : { [mapping.field]: { sort: dir, nulls: 'last' } };

  return [primary, ...tiebreaker];
}

// ─────────────────────────────────────────────────────────────────────────────

/** مستخرج قيمة عمود من صف نموذج قراءة (read model) في الذاكرة. */
export type RowValueGetter<T> = (row: T) => unknown;

const AR_COLLATOR = new Intl.Collator('ar', { numeric: true, sensitivity: 'base' });

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || v === '';
}

function compareValues(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  return AR_COLLATOR.compare(String(a), String(b));
}

/**
 * فرز صفوف نموذج قراءة **في الذاكرة** — للقوائم التي تُبنى خارج Prisma (مثل
 * الشبكة الموحّدة للرواتب: محسوب + مستورد ثم اقتطاع الصفحة). نفس عقد
 * `buildOrderBy` تمامًا: قائمة بيضاء إلزامية، اتجاه مُتحقَّق منه، فراغات آخرًا
 * في الاتجاهين (سياسة nulls: 'last')، وفرز مستقر — لا تنفيذ ثانٍ للمنطق في أي
 * وحدة.
 */
export function sortRowsInMemory<T>(
  rows: T[],
  query: { sortBy?: unknown; sortDir?: unknown },
  whitelist: Record<string, RowValueGetter<T>>,
): T[] {
  const sortBy = typeof query.sortBy === 'string' ? query.sortBy : '';
  if (!sortBy || !Object.prototype.hasOwnProperty.call(whitelist, sortBy)) return rows;

  const getValue = whitelist[sortBy];
  const sign: number = query.sortDir === 'asc' ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, value: getValue(row) }))
    .sort((x, y) => {
      const xBlank = isBlank(x.value);
      const yBlank = isBlank(y.value);
      if (xBlank || yBlank) {
        if (xBlank && yBlank) return x.index - y.index;
        return xBlank ? 1 : -1;
      }
      const cmp = compareValues(x.value, y.value) * sign;
      return cmp !== 0 ? cmp : x.index - y.index;
    })
    .map((e) => e.row);
}
