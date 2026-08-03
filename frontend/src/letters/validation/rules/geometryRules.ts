/**
 * Letter Engine — safe-zone and page-boundary rules.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  EVERY MEASUREMENT COMES FROM THE GEOMETRY REGISTRY. NOT ONE IS WRITTEN HERE.
 * ══════════════════════════════════════════════════════════════════════════
 * These rules call `usableBandMm`, `reservedZonesMm`, `contentTopForPageMm`,
 * `textBandBottomMm`, `sideMarginMm` and `pageSizeOf` — the same functions the
 * paginator and the renderer call. There is one implementation of every dimension in
 * the engine, so a rule can never disagree with the layout it is judging.
 *
 * ── WHERE AN OVERLAP CAN STILL COME FROM ─────────────────────────────────
 * The paginator already breaks a page before content would cross the band, so under
 * normal editing an overlap is impossible. Exactly one thing defeats it: an item
 * TALLER THAN A WHOLE BAND, which cannot be placed anywhere and is therefore placed
 * over the boundary. That is why the reserved-zone rule reads the layout's own
 * `usedMm` against its own `availableMm` rather than re-deriving positions — it catches
 * precisely the case the flow could not solve, and it cannot drift from the flow.
 *
 * ── THESE RULES REPORT. THEY DO NOT BLOCK, AND THEY DO NOT FIX. ──────────
 * Severity is stamped by the runner from the catalogue; refusing output belongs to a
 * later pack. Nothing here rewrites, splits or moves a thing.
 */

import {
  contentTopForPageMm,
  pageSizeOf,
  reservedZonesMm,
  sideMarginMm,
  textBandBottomMm,
  usableBandMm,
} from '../../registry/geometryRegistry';
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
 * E11 — content past the physical edge of the sheet.
 *
 * A step beyond an overlap: not merely printing on the letterhead, but printing off
 * the paper. Checked against the sheet's own height so it stays true for any profile.
 */
export const contentOutsidePageRule: ValidationRuleImplementation = {
  ruleId: 'E11_contentOutsidePage',
  dependsOn: ['pagination', 'geometry'],
  evaluate: (context) => {
    const findings: ValidationFinding[] = [];
    const sheetHeight = pageSizeOf(context.geometry).heightMm;

    for (const page of context.pagination.pages) {
      const bottom = contentTopForPageMm(context.geometry, page.pageIndex) + page.usedMm;
      if (bottom <= sheetHeight) continue;

      findings.push({
        ruleId: 'E11_contentOutsidePage',
        message: `المحتوى في الصفحة ${page.pageIndex + 1} يتجاوز حافة الورقة نفسها بمقدار ${mm(bottom - sheetHeight)} — أي خارج حدود الورق لا داخل المنطقة المحجوزة فقط.`,
        suggestion: 'قصِّر المحتوى؛ لا يمكن طباعة ما يقع خارج الورقة.',
        location: { pageIndex: page.pageIndex, overshootMm: Math.round((bottom - sheetHeight) * 10) / 10 },
      });
    }
    return findings;
  },
};

/**
 * E12 — a negative computed position.
 *
 * Not a content problem: a print profile whose numbers cannot describe a real sheet.
 * Reported against the document because that is where the user meets it.
 */
export const negativePositionRule: ValidationRuleImplementation = {
  ruleId: 'E12_negativePosition',
  dependsOn: ['geometry'],
  evaluate: (context) => {
    const findings: ValidationFinding[] = [];
    const geometry = context.geometry;

    const offsets: { label: string; value: number }[] = [
      { label: 'الهامش الجانبي', value: sideMarginMm(geometry) },
      { label: 'بداية المحتوى في الصفحة الأولى', value: contentTopForPageMm(geometry, 0) },
      { label: 'بداية المحتوى في صفحات المتابعة', value: contentTopForPageMm(geometry, 1) },
      { label: 'نهاية منطقة الكتابة', value: textBandBottomMm(geometry) },
    ];

    for (const offset of offsets) {
      if (offset.value >= 0) continue;
      findings.push({
        ruleId: 'E12_negativePosition',
        message: `قياس صفحة غير صالح: «${offset.label}» يساوي ${mm(offset.value)}، وهو موضع سالب لا يقع على الورقة.`,
        suggestion: 'راجع ملف الورق المستخدم في سجل الهندسة — القياسات لا تصف ورقة حقيقية.',
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
