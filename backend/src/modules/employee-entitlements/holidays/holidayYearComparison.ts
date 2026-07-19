import type { HolidayCandidate } from './holidayCandidate';
import type { HolidayOrigin, HolidayStatus } from '../models/Holiday';

/** فئة مقارنة بند واحد بين خطة التوليد والعطل المسجَّلة بالفعل (Part 5). */
export type HolidayComparisonCategory = 'NEW' | 'EXISTING' | 'CHANGED' | 'SKIPPED' | 'CONFLICT';

export interface HolidayComparisonEntry {
  date: Date;
  category: HolidayComparisonCategory;
  /** اسم المرشَّح المُولَّد (غير متوفر لبند EXISTING بحت بلا مرشَّح مطابق). */
  candidateName?: string;
  /** الاسم المسجَّل بالفعل في قاعدة البيانات لنفس التاريخ (إن وُجد). */
  existingName?: string;
  origin?: HolidayOrigin;
  status?: HolidayStatus;
  /** سبب مقروء للفئة (مفيد خصوصًا لـ CHANGED/CONFLICT/SKIPPED). */
  reason?: string;
}

export interface HolidayYearComparison {
  year: number;
  entries: HolidayComparisonEntry[];
  summary: Record<HolidayComparisonCategory, number>;
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function emptySummary(): Record<HolidayComparisonCategory, number> {
  return { NEW: 0, EXISTING: 0, CHANGED: 0, SKIPPED: 0, CONFLICT: 0 };
}

/**
 * يقارن خطة عطل مُولَّدة (مرشَّحون من كل مزوِّدي المصادر) بما هو مسجَّل بالفعل في قاعدة
 * البيانات لنفس السنة، وينتج تصنيفًا واضحًا لكل بند (Part 5). خوارزمية واحدة تُغطّي
 * أيضًا اكتشاف التعارض الداخلي بين المرشَّحين أنفسهم (Part 4 — تواريخ/أسماء مكرَّرة،
 * تداخل مُولَّد) حتى لا يتكرر منطق المقارنة في مكان آخر (Part 8).
 *
 * الترتيب:
 * 1) تجميع المرشَّحين حسب اليوم — يوم فيه أكثر من مرشَّح بنفس الاسم: الأول NEW/لاحق
 *    SKIPPED (تكرار داخلي بسيط)؛ يوم فيه مرشَّحون بأسماء مختلفة: الكل CONFLICT (تداخل
 *    مُولَّد حقيقي يحتاج تدخّلاً يدويًا — لا يُطبَّق تلقائيًا).
 * 2) لكل يوم فريد متبقٍّ: لا يوجد صف موجود لنفس التاريخ → NEW؛ يوجد صف بنفس الاسم
 *    تمامًا → EXISTING (لا شيء لفعله)؛ يوجد صف باسم مختلف → CHANGED (تنبيه فقط، لا
 *    يُعدَّل تلقائيًا — التعديل يدوي دومًا).
 */
export function compareHolidayYear(
  candidates: readonly HolidayCandidate[],
  existing: readonly { date: Date; name: string }[],
): HolidayYearComparison {
  const year = candidates[0]?.date.getUTCFullYear() ?? existing[0]?.date.getUTCFullYear() ?? new Date().getUTCFullYear();
  const existingByDay = new Map(existing.map((h) => [dayKey(h.date), h.name]));

  const byDay = new Map<string, HolidayCandidate[]>();
  for (const c of candidates) {
    const key = dayKey(c.date);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(c);
    else byDay.set(key, [c]);
  }

  const entries: HolidayComparisonEntry[] = [];
  const summary = emptySummary();

  const push = (entry: HolidayComparisonEntry) => {
    entries.push(entry);
    summary[entry.category] += 1;
  };

  for (const [, dayCandidates] of byDay) {
    const distinctNames = new Set(dayCandidates.map((c) => c.name));

    if (distinctNames.size > 1) {
      // تداخل مُولَّد حقيقي — أكثر من مصدر يقترح نفس اليوم بأسماء مختلفة.
      for (const c of dayCandidates) {
        push({ date: c.date, category: 'CONFLICT', candidateName: c.name, origin: c.origin, status: c.status, reason: 'أكثر من مصدر يقترح هذا اليوم بأسماء مختلفة' });
      }
      continue;
    }

    // كل المرشَّحين في هذا اليوم بنفس الاسم — الأول يُعتمَد، والباقي (إن وُجد) يُتخطَّى.
    const [primary, ...rest] = dayCandidates;
    for (const dup of rest) {
      push({ date: dup.date, category: 'SKIPPED', candidateName: dup.name, origin: dup.origin, status: dup.status, reason: 'مكرَّر ضمن نفس خطة التوليد' });
    }

    const existingName = existingByDay.get(dayKey(primary.date));
    if (existingName === undefined) {
      push({ date: primary.date, category: 'NEW', candidateName: primary.name, origin: primary.origin, status: primary.status });
    } else if (existingName === primary.name) {
      push({ date: primary.date, category: 'EXISTING', candidateName: primary.name, existingName, origin: primary.origin, status: primary.status });
    } else {
      push({
        date: primary.date,
        category: 'CHANGED',
        candidateName: primary.name,
        existingName,
        origin: primary.origin,
        status: primary.status,
        reason: `الاسم المسجَّل «${existingName}» يختلف عن اسم المرشَّح «${primary.name}»`,
      });
    }
  }

  entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { year, entries, summary };
}
