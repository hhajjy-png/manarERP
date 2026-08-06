/**
 * Letter Engine — layout-object rules (Document Layout Designer v1).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THESE FOUR RULES ARE THE PRICE OF ADMISSION FOR FREE POSITIONING.
 * ══════════════════════════════════════════════════════════════════════════
 * `PROHIBITED_TOOLBAR_COMMANDS` forbade `insertTextBox` because "absolutely-positioned
 * content cannot be pagination-validated, so it can silently enter a reserved zone".
 * The paginator still cannot validate a positioned object — it never sees one. What
 * changed is that an object DECLARES its own rectangle, so the geometry the paginator
 * would have had to measure is already known, and E16 below reads it directly.
 *
 * The guarantee is therefore unchanged in strength and different in mechanism:
 *
 *   · Flow content   → E4, from the paginator's own overshoot.
 *   · Layout objects → E16, from the object's own corners.
 *
 * Both are `blocking`, neither can be downgraded by a template, and both refuse the
 * print rather than repairing the document.
 *
 * ── EVERY MEASUREMENT COMES FROM THE GEOMETRY REGISTRY ───────────────────
 * Same discipline as `geometryRules`: `reservedZonesMm`, `pageSizeOf`,
 * `contentTopForPageMm`, `textBandBottomMm` and `sideMarginMm` are called rather than
 * re-derived, so a rule can never disagree with the sheet it is judging.
 */

import {
  contentTopForPageMm,
  pageSizeOf,
  reservedZonesMm,
  sideMarginMm,
  textBandBottomMm,
} from '../../registry/geometryRegistry';
import {
  objectBounds,
  objectCorners,
  objectEntersBand,
  rectsOverlap,
} from '../../layout/layoutGeometry';
import { effectiveHidden, layoutOf } from '../../layout/layoutCommands';
import { type LayoutObject } from '../../model/layoutTypes';
import { type ValidationFinding, type ValidationRuleImplementation } from '../framework';
import { type LetterValidationContext } from '../context';

/** One decimal place — no printer resolves finer than a tenth of a millimetre. */
function mm(value: number): string {
  return `${Math.round(value * 10) / 10} مم`;
}

/**
 * The objects a rule should judge.
 *
 * HIDDEN OBJECTS ARE SKIPPED, deliberately: a hidden object does not print, so it
 * cannot reach the letterhead, and blocking a print over something invisible would be
 * an error the author cannot see to fix. Hiding is a legitimate way to park a draft
 * element — that is most of what the visibility toggle is for.
 *
 * LOCKED objects are NOT skipped. A lock prevents editing, not printing.
 */
function judgedObjects(context: LetterValidationContext): LayoutObject[] {
  const layout = layoutOf(context.content.layout);
  return layout.objects.filter((object) => !effectiveHidden(layout, object));
}

/**
 * E16 — no layout object may enter a reserved band.
 *
 * Judged on the object's TRUE ROTATED CORNERS via `objectEntersBand`, which is what
 * makes rotation count: a bar that clears the band flat can intrude once it is turned,
 * because turning it raises its topmost corner. Testing the UNROTATED frame would miss
 * exactly that, and the object would print over the letterhead with a clean bill.
 *
 * ── A NOTE ON BOUNDING BOXES, BECAUSE IT IS EASY TO OVERSTATE ────────────
 * For a band spanning the full width of the sheet, the corner test and the
 * axis-aligned bounding box give the SAME vertical extent — the box's top edge is by
 * definition the topmost corner. The two diverge only for a region bounded
 * horizontally as well, which is why `W9_objectOverlapsContent` (judged against the
 * text band, a real rectangle) uses `objectBounds` and over-reports slightly, and is
 * advisory for that reason among others. Using corners here is correct and costs
 * nothing; claiming it avoids false positives a box would produce would be wrong.
 */
export const objectInReservedZoneRule: ValidationRuleImplementation = {
  ruleId: 'E16_objectInReservedZone',
  dependsOn: ['content', 'geometry', 'pagination'],
  evaluate: (context) => {
    const findings: ValidationFinding[] = [];

    for (const object of judgedObjects(context)) {
      // An object parked beyond the document's last page cannot overlap anything that
      // will be printed; W10 reports it instead.
      if (object.pageIndex >= context.pagination.pageCount) continue;

      const [header, footer] = reservedZonesMm(context.geometry, object.pageIndex);

      for (const [zone, label] of [
        [header, 'الترويسة'],
        [footer, 'التذييل'],
      ] as const) {
        if (!objectEntersBand(object, zone.startMm, zone.endMm)) continue;

        findings.push({
          ruleId: 'E16_objectInReservedZone',
          message:
            `العنصر «${object.name}» في الصفحة ${object.pageIndex + 1} يدخل منطقة ${label} المحجوزة ` +
            `(من ${mm(zone.startMm)} إلى ${mm(zone.endMm)} من أعلى الورقة) — وهي منطقة مطبوعة مسبقًا على الورق.`,
          suggestion: 'انقل العنصر داخل منطقة الكتابة، أو صغِّره، أو أخفِه إن كان مسوّدة.',
          location: { pageIndex: object.pageIndex, objectId: object.id },
        });
      }
    }

    return findings;
  },
};

/**
 * E17 — an object hanging off the physical sheet.
 *
 * A step beyond an overlap: not printing on the letterhead, but printing off the
 * paper. Reported with the overshoot so the author knows how far to pull it back.
 */
export const objectOutsidePageRule: ValidationRuleImplementation = {
  ruleId: 'E17_objectOutsidePage',
  dependsOn: ['content', 'geometry', 'pagination'],
  evaluate: (context) => {
    const page = pageSizeOf(context.geometry);
    const findings: ValidationFinding[] = [];

    for (const object of judgedObjects(context)) {
      if (object.pageIndex >= context.pagination.pageCount) continue;

      const corners = objectCorners(object);
      const overshoot = Math.max(
        0,
        -Math.min(...corners.map((c) => c.xMm)),
        -Math.min(...corners.map((c) => c.yMm)),
        Math.max(...corners.map((c) => c.xMm)) - page.widthMm,
        Math.max(...corners.map((c) => c.yMm)) - page.heightMm,
      );
      if (overshoot <= 0) continue;

      findings.push({
        ruleId: 'E17_objectOutsidePage',
        message:
          `العنصر «${object.name}» في الصفحة ${object.pageIndex + 1} يتجاوز حافة الورقة بمقدار ${mm(overshoot)} ` +
          'ولن يُطبع الجزء الخارج.',
        suggestion: 'أعد العنصر داخل حدود الورقة.',
        location: { pageIndex: object.pageIndex, objectId: object.id },
      });
    }

    return findings;
  },
};

/**
 * W9 — an object covering the flowing text.
 *
 * ADVISORY, not blocking, and the distinction is a judgement about intent rather than
 * about safety. A margin note, a "مسودة" stamp across the measure, a rule under a
 * heading — all legitimately overlap the text band, and all are things an author does
 * on purpose. The engine has no way to tell those from an accident, so it points and
 * does not refuse.
 *
 * The reserved zones are different: nobody deliberately prints over pre-printed ink,
 * which is why E16 blocks and this does not.
 */
export const objectOverlapsContentRule: ValidationRuleImplementation = {
  ruleId: 'W9_objectOverlapsContent',
  dependsOn: ['content', 'geometry', 'pagination'],
  evaluate: (context) => {
    const findings: ValidationFinding[] = [];
    const margin = sideMarginMm(context.geometry);

    for (const object of judgedObjects(context)) {
      if (object.pageIndex >= context.pagination.pageCount) continue;

      const band = {
        xMm: margin,
        yMm: contentTopForPageMm(context.geometry, object.pageIndex),
        widthMm: context.geometry.contentWidthMm,
        heightMm:
          textBandBottomMm(context.geometry) - contentTopForPageMm(context.geometry, object.pageIndex),
      };

      // The page's flow items, not the band itself, would be the ideal test — but the
      // paginator reports heights rather than rectangles, and a band test is the same
      // answer wherever the page is full. On a nearly-empty page it over-reports, which
      // for an advisory rule is the safe direction.
      if (!rectsOverlap(band, objectBounds(object))) continue;

      findings.push({
        ruleId: 'W9_objectOverlapsContent',
        message: `العنصر «${object.name}» يتداخل مع منطقة النص في الصفحة ${object.pageIndex + 1}.`,
        suggestion: 'تأكّد أن التداخل مقصود — قد يحجب العنصر جزءًا من نص الخطاب عند الطباعة.',
        location: { pageIndex: object.pageIndex, objectId: object.id },
      });
    }

    return findings;
  },
};

/**
 * W10 — an object stranded past the last page.
 *
 * The content shortened after the object was placed. The object is not printed and is
 * NOT deleted: deleting it would destroy work because a paragraph was trimmed, and it
 * returns of its own accord when the document grows again. So this is a warning about
 * something invisible rather than an error about something wrong.
 */
export const objectOffPageRule: ValidationRuleImplementation = {
  ruleId: 'W10_objectOffPage',
  dependsOn: ['content', 'pagination'],
  evaluate: (context) => {
    const findings: ValidationFinding[] = [];

    for (const object of judgedObjects(context)) {
      if (object.pageIndex < context.pagination.pageCount) continue;

      findings.push({
        ruleId: 'W10_objectOffPage',
        message:
          `العنصر «${object.name}» موضوع على الصفحة ${object.pageIndex + 1}، والمستند يحتوي ` +
          `${context.pagination.pageCount} صفحة فقط — لن يظهر عند الطباعة.`,
        suggestion: 'انقل العنصر إلى صفحة موجودة، أو أضف محتوى حتى يبلغ المستند تلك الصفحة.',
        location: { objectId: object.id },
      });
    }

    return findings;
  },
};

export const LAYOUT_OBJECT_RULES: readonly ValidationRuleImplementation[] = [
  objectInReservedZoneRule,
  objectOutsidePageRule,
  objectOverlapsContentRule,
  objectOffPageRule,
];
