/**
 * Letter Engine — the Layout Object model (Document Layout Designer v1).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A SECOND LAYER, NOT A REPLACEMENT. THE FLOW SECTIONS STILL FLOW.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The Official Letter now has TWO kinds of content, and the distinction is the whole
 * architecture of this pack:
 *
 *   · FLOW CONTENT — the six sections (date, recipient, subject, body, signature,
 *     barcode). Measured by the hidden mirror, placed by the paginator, guaranteed by
 *     construction never to enter a reserved zone. Unchanged by this pack.
 *
 *   · LAYOUT OBJECTS — this file. Absolutely positioned in millimetres on a NAMED
 *     PAGE, freely moved, resized, rotated and stacked.
 *
 * ── WHY THE TWO CANNOT BE MERGED ─────────────────────────────────────────
 * `PROHIBITED_TOOLBAR_COMMANDS` records the reason `insertTextBox` was forbidden:
 * "Absolutely-positioned content cannot be pagination-validated, so it can silently
 * enter a reserved zone." That is still true, and no measurement trick answers it — an
 * absolutely-positioned rotated box does not flow, so the paginator has nothing to
 * measure. Making the body draggable would mean retiring pagination for it, and with
 * pagination goes the guarantee that INV-2 exists to provide.
 *
 * So the prohibition is not lifted. It is ANSWERED, by a different mechanism:
 *
 *   1. A layout object declares its own rectangle, so its geometry is KNOWN rather
 *      than measured — the thing the paginator could not do for it, it does itself.
 *   2. `E16_objectInReservedZone` is a BLOCKING rule. An object overlapping the
 *      pre-printed letterhead refuses the print, with no override and no template
 *      downgrade, exactly as `E4_reservedZoneOverlap` does for flow content.
 *
 * The freedom is real and the guarantee is intact, because the guarantee was never
 * "content cannot be positioned" — it was "content cannot silently reach the reserved
 * zone". Silently is the word that mattered.
 *
 * ── WHAT IS DELIBERATELY NOT A LAYOUT OBJECT ─────────────────────────────
 * Header, logo and footer. They are PHYSICALLY PRE-PRINTED on the stock, and the
 * engine prints nothing there by design (`header`/`footer` remain prohibited). They
 * appear in the Layers panel as locked, non-selectable entries so the document's
 * structure is honest, and they can never be moved, because moving them would move
 * nothing — the ink is already on the paper.
 *
 * ── MILLIMETRES, ALWAYS ──────────────────────────────────────────────────
 * Every coordinate here is a millimetre measured from the SHEET's top-left corner —
 * the same origin the rulers measure from and the same one every geometry value in the
 * registry resolves against. Never a pixel, never a percentage, never a viewport unit:
 * a layout expressed in pixels would mean a different document at a different zoom.
 */

import { type FontId } from '../../styles/fontRegistry';
// INV-4: the Geometry Registry is the single home of a millimetre, whatever it
// measures. Every default size, padding and rule weight below is re-exported from
// there rather than declared here — `noHardcodedGeometry.test.ts` enforces it.
import {
  DEFAULT_DIVIDER_THICKNESS_MM,
  DEFAULT_OBJECT_SIZE_MM as OBJECT_SIZES_MM,
  DEFAULT_TABLE_BORDER_MM,
  DEFAULT_TEXT_PADDING_MM,
  MIN_OBJECT_SIZE_MM as MIN_SIZE_MM,
  ORIGIN_MM,
} from '../registry/geometryRegistry';
import { type TextAlignment } from '../registry/typographyPresets';
import { type InlineMark } from './blockTypes';

/**
 * The kinds of object the designer can place.
 *
 * A closed union, extended by adding a member here plus a renderer branch — which is
 * what "future elements must be easy to add" means in a model that stays typed.
 *
 * ── ON THE THREE THAT WERE PROHIBITED ────────────────────────────────────
 * `image`, `table` and `textBlock` correspond to `insertImage`, `insertTable` and
 * `insertTextBox`. Their prohibitions concerned FLOW content — an image the paginator
 * must place, a table it must fragment across a safe-zone band. As layout objects they
 * raise neither question: they declare their own rectangle and never fragment, because
 * an object belongs to exactly one page. A table that would not fit is a table the
 * author resizes, not one the engine has to break.
 */
export type LayoutObjectKind =
  | 'textBlock'
  | 'image'
  | 'divider'
  | 'table'
  | 'qrCode';

export const LAYOUT_OBJECT_KINDS: readonly LayoutObjectKind[] = [
  'textBlock',
  'image',
  'divider',
  'table',
  'qrCode',
];

export const LAYOUT_OBJECT_LABELS_AR: Readonly<Record<LayoutObjectKind, string>> = {
  textBlock: 'مربّع نص',
  image: 'صورة',
  divider: 'فاصل',
  table: 'جدول',
  qrCode: 'رمز QR',
};

/**
 * A rectangle on a sheet, in millimetres from the sheet's top-left corner.
 *
 * The frame is the object's UNROTATED box. Rotation is stored separately and applied
 * about the frame's centre, so rotating never changes the stored rectangle — which is
 * what lets a rotation be undone exactly and what keeps "width" meaning the object's
 * own width rather than its bounding box's.
 */
export interface LayoutFrame {
  readonly xMm: number;
  readonly yMm: number;
  readonly widthMm: number;
  readonly heightMm: number;
}

/** Smallest object the designer will produce. Declared in the Geometry Registry. */
export { MIN_SIZE_MM as MIN_OBJECT_SIZE_MM };

/** Text carried by a `textBlock`. Plain text and whole-box formatting, as everywhere. */
export interface LayoutTextPayload {
  readonly text: string;
  readonly fontId: FontId;
  readonly sizePt: number;
  readonly alignment: TextAlignment;
  readonly lineHeight: number;
  readonly marks: readonly InlineMark[];
  /** Inner padding, in millimetres, between the frame and the text. */
  readonly paddingMm: number;
}

/** An image or logo the author placed. `imageUrl` is a data URL or an app asset URL. */
export interface LayoutImagePayload {
  readonly imageUrl: string;
  /** Alternative text. Required for the accessibility tree; may be empty for decoration. */
  readonly alt: string;
  /** `contain` never crops; `cover` fills the frame. `fill` is deliberately absent —
   *  it distorts, and a distorted company mark is a defect rather than a style. */
  readonly fit: 'contain' | 'cover';
}

/** A rule. Horizontal or vertical follows from the frame's aspect, not from a flag. */
export interface LayoutDividerPayload {
  readonly thicknessMm: number;
  readonly style: 'solid' | 'dashed' | 'dotted';
}

/**
 * A simple grid of text cells.
 *
 * Fixed rows and columns with no merging and no fragmentation: the table occupies its
 * frame on one page and never breaks across a boundary. That constraint is what makes
 * a table possible here at all — "table pagination across a fixed safe-zone band",
 * the reason the flow version stayed prohibited, simply does not arise.
 */
export interface LayoutTablePayload {
  readonly rows: number;
  readonly columns: number;
  /** Row-major, `rows * columns` entries. */
  readonly cells: readonly string[];
  readonly fontId: FontId;
  readonly sizePt: number;
  readonly borderMm: number;
  /** Whether the first row is rendered as a header. */
  readonly headerRow: boolean;
}

/**
 * An author-placed QR code.
 *
 * SEPARATE FROM THE LETTER'S OWN BARCODE, which is engine-composed, `editable: false`,
 * and frozen into the registration snapshot so a reprint reproduces the code that was
 * issued. That one is not a layout object and cannot be moved, duplicated or deleted —
 * duplicating it would produce a document carrying two different claims about its own
 * identity. This is an ADDITIONAL code the author places deliberately, carrying
 * whatever payload they choose.
 */
export interface LayoutQrPayload {
  readonly payload: string;
  /** Shown beneath the symbol. Empty for none. */
  readonly caption: string;
}

/** The payload union, discriminated by the object's `kind`. */
export type LayoutPayload =
  | { readonly kind: 'textBlock'; readonly text: LayoutTextPayload }
  | { readonly kind: 'image'; readonly image: LayoutImagePayload }
  | { readonly kind: 'divider'; readonly divider: LayoutDividerPayload }
  | { readonly kind: 'table'; readonly table: LayoutTablePayload }
  | { readonly kind: 'qrCode'; readonly qr: LayoutQrPayload };

/**
 * One positioned object.
 *
 * `zIndex` is stored rather than derived from array order because the Layers panel
 * reorders by DRAG, and an array reorder would renumber every sibling on every move —
 * making a one-object change touch the whole document and defeating the structural
 * sharing the undo stack depends on.
 */
export interface LayoutObject {
  readonly id: string;
  readonly kind: LayoutObjectKind;
  /** What the Layers panel and the Outline show. Renameable; never empty. */
  readonly name: string;
  /** Zero-based sheet this object belongs to. An object lives on exactly one page. */
  readonly pageIndex: number;
  readonly frame: LayoutFrame;
  /** Degrees clockwise about the frame's centre. Normalised to [0, 360). */
  readonly rotationDeg: number;
  /** 0…1. */
  readonly opacity: number;
  readonly locked: boolean;
  readonly hidden: boolean;
  /** Id of the containing group, or `null` at the top level. */
  readonly groupId: string | null;
  /** Higher paints later. Unique among objects is NOT required — ties break by id. */
  readonly zIndex: number;
  readonly payload: LayoutPayload;
}

/**
 * A group of objects.
 *
 * Groups nest, so `parentGroupId` forms a tree. The tree is validated for cycles by
 * `layoutIntegrity` rather than prevented by the type, because a cycle can only arrive
 * from stored data and a runtime check reports WHICH group is at fault.
 */
export interface LayoutGroup {
  readonly id: string;
  readonly name: string;
  readonly parentGroupId: string | null;
  readonly collapsed: boolean;
  /** A locked group locks every descendant; the descendants' own flags are unchanged. */
  readonly locked: boolean;
  /** A hidden group hides every descendant, likewise without rewriting them. */
  readonly hidden: boolean;
}

/**
 * An author-placed guide line.
 *
 * Guides are a VIEW aid that lives with the document, not with the user: two people
 * opening the same letter should see the same guides, because a guide records a
 * design decision ("this column starts here") rather than a preference.
 */
export interface LayoutGuide {
  readonly id: string;
  readonly axis: 'horizontal' | 'vertical';
  /** Millimetres from the sheet's top edge (horizontal) or start edge (vertical). */
  readonly positionMm: number;
  readonly locked: boolean;
}

/**
 * The complete layout layer, stored inside the document alongside the blocks.
 *
 * Optional throughout: a letter with no objects carries no layout layer at all, which
 * is what makes content-model version 3 a purely additive widening of version 2 and
 * therefore a re-stamp migration rather than a rewrite.
 */
export interface DocumentLayout {
  readonly objects: readonly LayoutObject[];
  readonly groups: readonly LayoutGroup[];
  readonly guides: readonly LayoutGuide[];
}

export const EMPTY_LAYOUT: DocumentLayout = { objects: [], groups: [], guides: [] };

/* ── Type guards ────────────────────────────────────────────────────────── */

export function isLayoutObjectKind(value: unknown): value is LayoutObjectKind {
  return typeof value === 'string' && (LAYOUT_OBJECT_KINDS as readonly string[]).includes(value);
}

/** Does this object carry editable text? Drives which inspector fields appear. */
export function hasTextPayload(object: LayoutObject): boolean {
  return object.payload.kind === 'textBlock' || object.payload.kind === 'table';
}

/* ── Construction ───────────────────────────────────────────────────────── */

/** Default sizes for a newly placed object of each kind. From the Geometry Registry. */
export { OBJECT_SIZES_MM as DEFAULT_OBJECT_SIZE_MM };

/**
 * A default payload for a kind.
 *
 * Typography defaults are supplied by the CALLER rather than read from a registry
 * here, for the same reason `createBlock` requires attributes: a default chosen in the
 * model would silently decide a document's typography, and typography is the
 * template's decision.
 */
export function defaultPayload(
  kind: LayoutObjectKind,
  typography: { fontId: FontId; sizePt: number },
): LayoutPayload {
  switch (kind) {
    case 'textBlock':
      return {
        kind: 'textBlock',
        text: {
          text: '',
          fontId: typography.fontId,
          sizePt: typography.sizePt,
          alignment: 'start',
          lineHeight: 1.35,
          marks: [],
          paddingMm: DEFAULT_TEXT_PADDING_MM,
        },
      };
    case 'image':
      return { kind: 'image', image: { imageUrl: '', alt: '', fit: 'contain' } };
    case 'divider':
      return { kind: 'divider', divider: { thicknessMm: DEFAULT_DIVIDER_THICKNESS_MM, style: 'solid' } };
    case 'table':
      return {
        kind: 'table',
        table: {
          rows: 3,
          columns: 3,
          cells: Array.from({ length: 9 }, () => ''),
          fontId: typography.fontId,
          sizePt: typography.sizePt,
          borderMm: DEFAULT_TABLE_BORDER_MM,
          headerRow: true,
        },
      };
    case 'qrCode':
      return { kind: 'qrCode', qr: { payload: '', caption: '' } };
  }
}
