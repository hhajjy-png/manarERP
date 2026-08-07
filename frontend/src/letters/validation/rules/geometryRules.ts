/**
 * Letter Engine — safe-zone and page-boundary rules.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  EVERY MEASUREMENT COMES FROM THE GEOMETRY REGISTRY. NOT ONE IS WRITTEN HERE.
 * ══════════════════════════════════════════════════════════════════════════
 * These rules call `usableBandMm`, `reservedZonesMm` and `pageSizeOf` — the same
 * functions the paginator and the renderer call. There is one implementation of every
 * dimension in the engine, so a rule can never disagree with the layout it is judging.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  FORM EDITOR UX REBUILD v2 — THE TWO RULES THAT REMAIN.
 * ══════════════════════════════════════════════════════════════════════════
 * The rebuild removed every other blocking rule: the editor assists, it does not
 * refuse, and an author is trusted to judge everything except the one thing they
 * cannot see coming — content landing on ink already printed on the paper. `E4` is
 * that guarantee for flowing content; `E16` (in `layoutObjectRules.ts`) is its
 * counterpart for positioned objects.
 *
 * `E13_impossibleGeometry` is not a document rule at all. It fires only when the
 * PROFILE's own numbers describe no usable page — pagination has nothing meaningful to
 * do at that point, and every other finding would be noise built on top of nonsense.
 *
 * `E11_contentOutsidePage` and `E12_negativePosition` were deleted rather than
 * deselected: both existed to catch a profile that could never happen once `E13`
 * already refuses one that cannot describe a page. They were declared blocking but
 * never selected the moment E13 covered the case, and the rebuild is what finally
 * removed the redundancy rather than carrying it forward as dead capability.
 *
 * ── THESE RULES REPORT. THEY DO NOT BLOCK, AND THEY DO NOT FIX. ──────────
 * Severity is stamped by the runner from the catalogue; refusing output belongs to a
 * later pack. Nothing here rewrites, splits or moves a thing.
 */

import { pageSizeOf, reservedZonesMm, usableBandMm } from '../../registry/geometryRegistry';
import { type ValidationFinding, type ValidationRuleImplementation } from '../framework';

/** One decimal place — a page break is not meaningfully finer than a tenth of a millimetre. */
function mm(value: number): string {
  return `${Math.round(value * 10) / 10} مم`;
}

/**
 * E4 — no content may enter the reserved header or footer band.
 *
 * Measured as the layout's own overshoot: a page that consumed more than the registry
 * allows has, by definition, pushed content past the band's bottom edge and into the
 * reserved footer.
 */
export const reservedZoneOverlapRule: ValidationRuleImplementation = {
  ruleId: 'E4_reservedZoneOverlap',
  dependsOn: ['pagination', 'geometry'],
  evaluate: (context) => {
    const findings: ValidationFinding[] = [];

    for (const page of context.pagination.pages) {
      const available = usableBandMm(context.geometry, page.pageIndex);
      if (page.usedMm <= available) continue;

      const overshoot = page.usedMm - available;
      const [, footer] = reservedZonesMm(context.geometry, page.pageIndex);
      findings.push({
        ruleId: 'E4_reservedZoneOverlap',
        // Naming the page AND the overshoot is what makes this actionable.
        message: `المحتوى يتجاوز حدود منطقة الكتابة في الصفحة ${page.pageIndex + 1} بمقدار ${mm(overshoot)} ويدخل منطقة التذييل المحجوزة (تبدأ عند ${mm(footer.startMm)} من أعلى الورقة).`,
        suggestion: 'قصِّر الفقرة الأطول في هذه الصفحة أو انقل جزءًا منها إلى فقرة جديدة.',
        location: { pageIndex: page.pageIndex, overshootMm: Math.round(overshoot * 10) / 10 },
      });
    }
    return findings;
  },
};

/**
 * E13 — geometry that leaves no usable page.
 *
 * Checked before anything else can be meaningful: with a non-positive band there is
 * nowhere for content to go, and every other geometric finding would be noise.
 */
export const impossibleGeometryRule: ValidationRuleImplementation = {
  ruleId: 'E13_impossibleGeometry',
  dependsOn: ['geometry'],
  evaluate: (context) => {
    const findings: ValidationFinding[] = [];
    const geometry = context.geometry;
    const sheet = pageSizeOf(geometry);

    const firstBand = usableBandMm(geometry, 0);
    const continuationBand = usableBandMm(geometry, 1);

    if (firstBand <= 0) {
      findings.push({
        ruleId: 'E13_impossibleGeometry',
        message: `لا توجد منطقة كتابة صالحة في الصفحة الأولى (الارتفاع المتاح ${mm(firstBand)}). المناطق المحجوزة تستهلك الورقة بالكامل.`,
        suggestion: 'راجع المناطق المحجوزة وبداية المحتوى في سجل الهندسة.',
        location: { pageIndex: 0 },
      });
    }
    if (continuationBand <= 0) {
      findings.push({
        ruleId: 'E13_impossibleGeometry',
        message: `لا توجد منطقة كتابة صالحة في صفحات المتابعة (الارتفاع المتاح ${mm(continuationBand)}).`,
        suggestion: 'راجع المناطق المحجوزة الخاصة بصفحات المتابعة في سجل الهندسة.',
        location: { pageIndex: 1 },
      });
    }
    if (geometry.contentWidthMm <= 0 || geometry.contentWidthMm > sheet.widthMm) {
      findings.push({
        ruleId: 'E13_impossibleGeometry',
        message: `عرض المحتوى (${mm(geometry.contentWidthMm)}) لا يقع ضمن عرض الورقة (${mm(sheet.widthMm)}).`,
        suggestion: 'راجع عرض المحتوى في سجل الهندسة.',
      });
    }
    return findings;
  },
};
