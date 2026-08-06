/**
 * Letter Engine — the document outline (Document Studio Foundation v1).
 *
 * PURE. Builds a navigable table of contents from the document's own structure.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE OUTLINE IS DERIVED FROM STRUCTURE, NEVER GUESSED FROM TYPOGRAPHY.
 * ══════════════════════════════════════════════════════════════════════════
 * Two sources, both structural:
 *
 *   1. THE TEMPLATE'S SECTIONS — date, recipient, subject, content, signature,
 *      barcode. Every Official Letter has them, in that order, by definition. They are
 *      the outline's fixed skeleton and exist even in an empty draft.
 *   2. HEADING BLOCKS — `kind === 'heading'`, carrying an explicit `headingLevel`.
 *      Nested under the content section, in document order.
 *
 * A paragraph that merely happens to be 22 pt and bold is NOT an outline entry. That is
 * the difference between a real outline and a heuristic one, and it is why version 2
 * made `heading` a block kind rather than leaving headings to be inferred from size —
 * inference would list a bolded emphasis line as a section title and omit a heading the
 * author had made small on purpose.
 *
 * ── ENTRIES CARRY A PAGE, WHICH IS WHY PAGINATION IS AN ARGUMENT ─────────
 * Jumping to an entry means scrolling to a sheet, so each entry needs to know which one
 * it landed on. The page comes from the SAME `PaginationResult` the sheets were laid
 * out from — deriving it independently would let the outline disagree with the paper.
 */

import { type BlockDocument } from '../model/blockTypes';
import { type LayoutObject, LAYOUT_OBJECT_LABELS_AR } from '../model/layoutTypes';
import { type PaginationResult } from '../pagination/paginate';
import { blockText } from './blockCommands';

/** What an outline entry points at. */
export type OutlineTargetKind = 'section' | 'heading' | 'object' | 'group';

export interface OutlineEntry {
  /** Stable within one outline — the section kind, or the block id for a heading. */
  readonly id: string;
  readonly kind: OutlineTargetKind;
  /** Section kind for a section entry; the containing section for a heading. */
  readonly sectionKind: string;
  /** Block id, for a heading entry only. */
  readonly blockId?: string;
  /** Layout object id, for an object entry only. Distinct from `blockId` — see
   *  `ValidationLocation` for why the two id spaces are never shared. */
  readonly objectId?: string;
  /** 0 for a section, 1…6 for a heading — drives the indent in the panel. */
  readonly depth: number;
  /** What the panel shows. Never empty: an untitled entry gets its section's name. */
  readonly label: string;
  /** A short preview of the entry's own text, or `null` when it has none yet. */
  readonly preview: string | null;
  /** Zero-based page the entry sits on, or `null` when pagination has not placed it. */
  readonly pageIndex: number | null;
  /** True when the entry has no content — shown dimmed rather than hidden. */
  readonly empty: boolean;
}

/** The fixed skeleton, in the order `templateRegistry` declares the sections. */
const SECTION_LABELS: readonly { readonly kind: string; readonly label: string }[] = [
  { kind: 'date', label: 'التاريخ' },
  { kind: 'recipient', label: 'الجهة المرسل إليها' },
  { kind: 'subject', label: 'الموضوع' },
  { kind: 'content', label: 'المحتوى' },
  { kind: 'signature', label: 'التوقيع' },
  { kind: 'barcode', label: 'الباركود' },
];

/** The section values the block model does not hold, supplied by the composer. */
export interface OutlineSectionValues {
  readonly date: string;
  readonly recipient: string;
  readonly subject: string;
  readonly hasSignature: boolean;
  readonly reference: string | null;
}

/** Longest preview shown in the panel. Longer text is elided with an ellipsis. */
const PREVIEW_LIMIT = 48;

function preview(text: string): string | null {
  const trimmed = text.trim().replace(/\s+/gu, ' ');
  if (trimmed.length === 0) return null;
  return trimmed.length <= PREVIEW_LIMIT ? trimmed : `${trimmed.slice(0, PREVIEW_LIMIT - 1)}…`;
}

/** Which page the paginator placed an item on, or `null` if it placed none. */
function pageOf(pagination: PaginationResult | null, itemId: string): number | null {
  if (!pagination) return null;
  const index = pagination.pages.findIndex((page) => page.itemIds.includes(itemId));
  return index === -1 ? null : index;
}

/**
 * Build the outline.
 *
 * Sections always appear, including empty ones — an outline that hid the subject line
 * until it had text would be missing exactly the entry the author needs to click on to
 * go and write it. Empty entries are marked rather than dropped, and the panel dims
 * them.
 */
export function buildDocumentOutline(
  document: BlockDocument | null,
  values: OutlineSectionValues,
  pagination: PaginationResult | null,
): OutlineEntry[] {
  const entries: OutlineEntry[] = [];

  const sectionText: Readonly<Record<string, string>> = {
    date: values.date,
    recipient: values.recipient,
    subject: values.subject,
    content: '',
    signature: values.hasSignature ? 'موقَّع' : '',
    barcode: values.reference ?? '',
  };

  for (const section of SECTION_LABELS) {
    const own = sectionText[section.kind] ?? '';

    if (section.kind === 'content') {
      const blocks = (document?.blocks ?? []).filter((block) => block.kind !== 'pageBreak');
      const contentText = blocks.map(blockText).join(' ').trim();

      entries.push({
        id: 'content',
        kind: 'section',
        sectionKind: 'content',
        depth: 0,
        label: section.label,
        preview: preview(contentText),
        pageIndex: pageOf(pagination, blocks[0]?.id ?? ''),
        empty: contentText.length === 0,
      });

      // Headings nest under the content section, in document order and at their own
      // declared level — never at a level inferred from their position.
      for (const block of blocks) {
        if (block.kind !== 'heading') continue;
        const text = blockText(block);
        entries.push({
          id: block.id,
          kind: 'heading',
          sectionKind: 'content',
          blockId: block.id,
          depth: block.attributes.headingLevel ?? 1,
          label: preview(text) ?? `عنوان ${block.attributes.headingLevel ?? 1}`,
          preview: null,
          pageIndex: pageOf(pagination, block.id),
          empty: text.trim().length === 0,
        });
      }
      continue;
    }

    entries.push({
      id: section.kind,
      kind: 'section',
      sectionKind: section.kind,
      depth: 0,
      label: section.label,
      preview: preview(own),
      pageIndex: pageOf(pagination, section.kind),
      empty: own.trim().length === 0,
    });
  }

  /* ── The positioned layer ────────────────────────────────────────────────
     Listed AFTER the flow sections, under one heading of its own, because the two are
     genuinely different kinds of thing: the sections are the letter, the objects sit
     on top of it. Interleaving them by page would suggest an ordering relationship
     that does not exist — an object on page 1 is not "between" the subject and the
     body, it is over them. */
  const layout = document?.layout;
  if (layout && layout.objects.length > 0) {
    entries.push({
      id: '__objects__',
      kind: 'section',
      sectionKind: 'objects',
      depth: 0,
      label: 'عناصر التصميم',
      preview: `${layout.objects.length} عنصر`,
      pageIndex: null,
      empty: false,
    });

    // Grouped objects nest one level under their group; loose objects sit at depth 1.
    for (const group of layout.groups.filter((candidate) => candidate.parentGroupId === null)) {
      entries.push({
        id: group.id,
        kind: 'group',
        sectionKind: 'objects',
        depth: 1,
        label: group.name,
        preview: null,
        pageIndex: null,
        empty: false,
      });

      for (const object of layout.objects.filter((candidate) => candidate.groupId === group.id)) {
        entries.push(objectEntry(object, 2));
      }
    }

    for (const object of layout.objects.filter((candidate) => candidate.groupId === null)) {
      entries.push(objectEntry(object, 1));
    }
  }

  return entries;
}

/** One positioned object as an outline row. */
function objectEntry(object: LayoutObject, depth: number): OutlineEntry {
  return {
    id: object.id,
    kind: 'object',
    sectionKind: 'objects',
    objectId: object.id,
    depth,
    label: object.name,
    preview: `${LAYOUT_OBJECT_LABELS_AR[object.kind]} · صفحة ${object.pageIndex + 1}`,
    pageIndex: object.pageIndex,
    // A hidden object is dimmed rather than omitted, exactly as an empty section is:
    // it is precisely the row an author clicks to go and bring something back.
    empty: object.hidden,
  };
}
