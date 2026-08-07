/**
 * Letter Engine — the layout-object reserved-zone rule (Document Layout Designer v1).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  E16 IS THE PRICE OF ADMISSION FOR FREE POSITIONING.
 * ══════════════════════════════════════════════════════════════════════════
 * `PROHIBITED_TOOLBAR_COMMANDS` forbade `insertTextBox` because "absolutely-positioned
 * content cannot be pagination-validated, so it can silently enter a reserved zone".
 * The paginator still cannot validate a positioned object — it never sees one. What
 * changed is that an object DECLARES its own rectangle, so the geometry the paginator
 * would have had to measure is already known, and E16 below reads it directly.
 *
 * The guarantee is therefore unchanged in strength and different in mechanism:
 *
 *   · Flow content   → E4 (`geometryRules.ts`), from the paginator's own overshoot.
 *   · Layout objects → E16, from the object's own corners.
 *
 * Both are `blocking`, neither can be downgraded by a template, and both refuse the
 * print rather than repairing the document.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  FORM EDITOR UX REBUILD v2 — THE OTHER THREE WERE DELETED.
 * ══════════════════════════════════════════════════════════════════════════
 * `E17_objectOutsidePage`, `W9_objectOverlapsContent` and `W10_objectOffPage` protected
 * editing conventions an author can see and correct on the canvas — an object hanging
 * off the sheet, one sitting over the text, one parked past the last page. None of them
 * protected the pre-printed paper, so none of them survived the rebuild.
 *
 * ── EVERY MEASUREMENT COMES FROM THE GEOMETRY REGISTRY ───────────────────
 * Same discipline as `geometryRules`: `reservedZonesMm` is called rather than
 * re-derived, so this rule can never disagree with the sheet it is judging.
 */

import { reservedZonesMm } from '../../registry/geometryRegistry';
import { objectEntersBand } from '../../layout/layoutGeometry';
import { effectiveHidden, layoutOf } from '../../layout/layoutCommands';
import { type LayoutObject } from '../../model/layoutTypes';
import { type ValidationFinding, type ValidationRuleImplementation } from '../framework';
import { type LetterValidationContext } from '../context';

/** One decimal place — no printer resolves finer than a tenth of a millimetre. */
function mm(value: number): string {
  return `${Math.round(value * 10) / 10} مم`;
}

/**
 * The objects this rule should judge.
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
 */
export const objectInReservedZoneRule: ValidationRuleImplementation = {
  ruleId: 'E16_objectInReservedZone',
  dependsOn: ['content', 'geometry', 'pagination'],
  evaluate: (context) => {
    const findings: ValidationFinding[] = [];

    for (const object of judgedObjects(context)) {
      // An object parked beyond the document's last page cannot overlap anything that
      // will be printed.
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
