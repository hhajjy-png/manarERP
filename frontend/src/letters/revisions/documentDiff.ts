/**
 * Letter Engine — document diff (Professional Document Automation v1).
 *
 * PURE. Two documents in, a list of changes out. No React, no DOM, no clock.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  BLOCKS ARE MATCHED BY ID, NOT BY POSITION OR BY CONTENT.
 * ══════════════════════════════════════════════════════════════════════════
 * This is the decision the whole diff rests on, and it is only available because the
 * block model gives every block a stable id that survives every edit. A positional
 * diff would report "paragraph 3 changed" after a paragraph was inserted above it — a
 * cascade of false changes that makes review useless. A content diff would lose the
 * identity of a paragraph that was rewritten entirely.
 *
 * With ids the four cases are exact:
 *
 *   · in NEW only        → inserted
 *   · in BASE only       → deleted
 *   · in both, text ≠    → text changed  (word-level, below)
 *   · in both, attrs ≠   → format changed
 *
 * …plus a fifth that ids also make exact: same set, different order → moved.
 *
 * ── TEXT IS DIFFED BY WORD, NOT BY CHARACTER ─────────────────────────────
 * A character diff of Arabic produces unreadable fragments — it will happily report
 * that «كتب» became «كتبت» by inserting a ت between two letters of a word, which is
 * true and useless. Words are the unit a reviewer thinks in, and the unit an
 * accept/reject decision applies to.
 *
 * ── A DIFF DESCRIBES; IT NEVER MUTATES ───────────────────────────────────
 * Nothing here writes to a document. Accepting and rejecting are separate pure
 * functions (`applyChange`), so a review session can compute its changes once and
 * apply them one at a time without re-diffing.
 */

import {
  type Block,
  type BlockDocument,
} from '../model/blockTypes';
import { type LayoutObject } from '../model/layoutTypes';
import { blockText } from '../editor/blockCommands';

/** What kind of change a reviewer is looking at. */
export type ChangeKind =
  | 'blockInserted'
  | 'blockDeleted'
  | 'blockTextChanged'
  | 'blockFormatChanged'
  | 'blockMoved'
  | 'objectInserted'
  | 'objectDeleted'
  | 'objectMoved'
  | 'objectChanged'
  | 'sectionChanged';

export const CHANGE_KIND_LABELS_AR: Readonly<Record<ChangeKind, string>> = {
  blockInserted: 'فقرة مضافة',
  blockDeleted: 'فقرة محذوفة',
  blockTextChanged: 'تعديل نص',
  blockFormatChanged: 'تعديل تنسيق',
  blockMoved: 'نقل فقرة',
  objectInserted: 'عنصر مضاف',
  objectDeleted: 'عنصر محذوف',
  objectMoved: 'نقل عنصر',
  objectChanged: 'تعديل عنصر',
  sectionChanged: 'تعديل حقل',
};

/** The three families the review filter offers. */
export type ChangeCategory = 'text' | 'format' | 'object';

export const CHANGE_CATEGORY_OF: Readonly<Record<ChangeKind, ChangeCategory>> = {
  blockInserted: 'text',
  blockDeleted: 'text',
  blockTextChanged: 'text',
  sectionChanged: 'text',
  blockFormatChanged: 'format',
  blockMoved: 'format',
  objectInserted: 'object',
  objectDeleted: 'object',
  objectMoved: 'object',
  objectChanged: 'object',
};

/** One run in a word-level text diff. */
export interface WordRun {
  readonly kind: 'same' | 'added' | 'removed';
  readonly text: string;
}

/** One reviewable change. */
export interface DocumentChange {
  /** Stable within one diff — `kind:targetId`, so a list can key on it. */
  readonly id: string;
  readonly kind: ChangeKind;
  /** Block id, object id, or section name. */
  readonly targetId: string;
  /** A one-line description, in Arabic, for the review list. */
  readonly summary: string;
  /** Word runs, for a text change only. */
  readonly runs?: readonly WordRun[];
  /** What changed, for a format or object change. */
  readonly details?: readonly string[];
}

/* ── Word diff ──────────────────────────────────────────────────────────── */

/**
 * Split into words while KEEPING the separators.
 *
 * Separators are kept as their own tokens so that reassembling the runs reproduces the
 * original string exactly — a diff that loses whitespace cannot be used to rebuild
 * text, and accepting a change has to rebuild text.
 */
function tokenise(text: string): string[] {
  if (text.length === 0) return [];
  return text.split(/(\s+)/).filter((token) => token.length > 0);
}

/**
 * Longest common subsequence over word tokens.
 *
 * Classic dynamic programme. Bounded below by a guard: two very long paragraphs would
 * otherwise allocate an n×m table, and a review panel is not worth a hundred megabytes.
 * Beyond the bound the change is reported as a whole-paragraph replacement, which is
 * both honest and what a reviewer would conclude anyway.
 */
const MAX_DIFF_TOKENS = 1200;

export function diffWords(before: string, after: string): WordRun[] {
  const a = tokenise(before);
  const b = tokenise(after);

  if (a.length === 0 && b.length === 0) return [];
  if (a.length === 0) return [{ kind: 'added', text: after }];
  if (b.length === 0) return [{ kind: 'removed', text: before }];

  if (a.length > MAX_DIFF_TOKENS || b.length > MAX_DIFF_TOKENS) {
    return [
      { kind: 'removed', text: before },
      { kind: 'added', text: after },
    ];
  }

  // table[i][j] = LCS length of a[i…] and b[j…]
  const table: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const runs: WordRun[] = [];
  /** Append to the previous run when it is the same kind — one run per stretch. */
  const push = (kind: WordRun['kind'], text: string) => {
    const last = runs[runs.length - 1];
    if (last && last.kind === kind) runs[runs.length - 1] = { kind, text: last.text + text };
    else runs.push({ kind, text });
  };

  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push('same', a[i]);
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      push('removed', a[i]);
      i += 1;
    } else {
      push('added', b[j]);
      j += 1;
    }
  }
  while (i < a.length) {
    push('removed', a[i]);
    i += 1;
  }
  while (j < b.length) {
    push('added', b[j]);
    j += 1;
  }

  return runs;
}

/** A short preview of what changed, for the review list. */
function summariseRuns(runs: readonly WordRun[]): string {
  const added = runs.filter((r) => r.kind === 'added').map((r) => r.text.trim()).filter(Boolean);
  const removed = runs.filter((r) => r.kind === 'removed').map((r) => r.text.trim()).filter(Boolean);
  const clip = (parts: string[]) => {
    const joined = parts.join(' ');
    return joined.length > 40 ? `${joined.slice(0, 39)}…` : joined;
  };
  if (added.length > 0 && removed.length > 0) return `«${clip(removed)}» ← «${clip(added)}»`;
  if (added.length > 0) return `أُضيف: «${clip(added)}»`;
  if (removed.length > 0) return `حُذف: «${clip(removed)}»`;
  return 'بلا تغيير نصي';
}

/* ── Attribute diff ─────────────────────────────────────────────────────── */

/** The attributes a reviewer is shown, with their Arabic names. */
const ATTRIBUTE_LABELS: Readonly<Record<string, string>> = {
  fontId: 'الخط',
  sizePt: 'المقاس',
  alignment: 'المحاذاة',
  indentLevel: 'الإزاحة',
  lineHeight: 'تباعد الأسطر',
  paragraphSpacingPt: 'تباعد الفقرات',
  letterSpacingPt: 'تباعد الأحرف',
  firstLineIndentMm: 'إزاحة السطر الأول',
  hangingIndentMm: 'إزاحة معلّقة',
  headingLevel: 'مستوى العنوان',
  listType: 'نوع القائمة',
};

function attributeChanges(before: Block, after: Block): string[] {
  const details: string[] = [];

  if (before.kind !== after.kind) details.push(`النوع: ${before.kind} ← ${after.kind}`);

  for (const [key, label] of Object.entries(ATTRIBUTE_LABELS)) {
    // Through `unknown`: `BlockAttributes` is a closed record with no index
    // signature, which is exactly the property that makes it safe elsewhere.
    const a = (before.attributes as unknown as Record<string, unknown>)[key];
    const b = (after.attributes as unknown as Record<string, unknown>)[key];
    if (a === b) continue;
    details.push(`${label}: ${a ?? '—'} ← ${b ?? '—'}`);
  }

  const marksBefore = [...(before.spans[0]?.marks ?? [])].sort().join(',');
  const marksAfter = [...(after.spans[0]?.marks ?? [])].sort().join(',');
  if (marksBefore !== marksAfter) details.push(`التنسيق: ${marksBefore || '—'} ← ${marksAfter || '—'}`);

  // A condition is a formatting-class change: it alters whether the block appears,
  // not what it says.
  const conditionBefore = JSON.stringify(before.attributes.condition ?? null);
  const conditionAfter = JSON.stringify(after.attributes.condition ?? null);
  if (conditionBefore !== conditionAfter) details.push('شرط الظهور تغيّر');

  return details;
}

function objectChanges(before: LayoutObject, after: LayoutObject): string[] {
  const details: string[] = [];
  const round = (n: number) => Math.round(n * 10) / 10;

  if (before.frame.xMm !== after.frame.xMm || before.frame.yMm !== after.frame.yMm) {
    details.push(`الموضع: ${round(before.frame.xMm)},${round(before.frame.yMm)} ← ${round(after.frame.xMm)},${round(after.frame.yMm)}`);
  }
  if (before.frame.widthMm !== after.frame.widthMm || before.frame.heightMm !== after.frame.heightMm) {
    details.push(`الحجم: ${round(before.frame.widthMm)}×${round(before.frame.heightMm)} ← ${round(after.frame.widthMm)}×${round(after.frame.heightMm)}`);
  }
  if (before.rotationDeg !== after.rotationDeg) details.push(`الدوران: ${before.rotationDeg}° ← ${after.rotationDeg}°`);
  if (before.opacity !== after.opacity) details.push(`الشفافية: ${Math.round(before.opacity * 100)}٪ ← ${Math.round(after.opacity * 100)}٪`);
  if (before.pageIndex !== after.pageIndex) details.push(`الصفحة: ${before.pageIndex + 1} ← ${after.pageIndex + 1}`);
  if (before.name !== after.name) details.push(`الاسم: ${before.name} ← ${after.name}`);
  if (JSON.stringify(before.payload) !== JSON.stringify(after.payload)) details.push('المحتوى تغيّر');

  return details;
}

/* ── The diff ───────────────────────────────────────────────────────────── */

/** The section values, which live outside the block model. */
export interface DiffSections {
  readonly subject: string;
  readonly issueDate: string;
  readonly recipientName: string;
  readonly recipientTitle: string;
  readonly recipientOrganisation: string;
}

const SECTION_LABELS: Readonly<Record<keyof DiffSections, string>> = {
  subject: 'الموضوع',
  issueDate: 'التاريخ',
  recipientName: 'اسم الجهة',
  recipientTitle: 'صفة الجهة',
  recipientOrganisation: 'الجهة',
};

/**
 * Compare two documents.
 *
 * `base` is the version being reviewed AGAINST — a saved version, or the last
 * registered state. `next` is what the author has now.
 */
export function diffDocuments(
  base: BlockDocument,
  next: BlockDocument,
  baseSections?: DiffSections,
  nextSections?: DiffSections,
): DocumentChange[] {
  const changes: DocumentChange[] = [];

  /* ── Sections ─────────────────────────────────────────────────────────── */
  if (baseSections && nextSections) {
    for (const key of Object.keys(SECTION_LABELS) as (keyof DiffSections)[]) {
      const before = baseSections[key] ?? '';
      const after = nextSections[key] ?? '';
      if (before === after) continue;
      changes.push({
        id: `sectionChanged:${key}`,
        kind: 'sectionChanged',
        targetId: key,
        summary: `${SECTION_LABELS[key]}: «${before || '—'}» ← «${after || '—'}»`,
        runs: diffWords(before, after),
      });
    }
  }

  /* ── Blocks ───────────────────────────────────────────────────────────── */
  const baseBlocks = new Map(base.blocks.map((block) => [block.id, block]));
  const nextBlocks = new Map(next.blocks.map((block) => [block.id, block]));

  for (const block of next.blocks) {
    if (baseBlocks.has(block.id)) continue;
    const text = blockText(block).trim();
    changes.push({
      id: `blockInserted:${block.id}`,
      kind: 'blockInserted',
      targetId: block.id,
      summary: text.length > 0 ? `فقرة جديدة: «${text.slice(0, 40)}»` : 'فقرة فارغة جديدة',
      runs: [{ kind: 'added', text: blockText(block) }],
    });
  }

  for (const block of base.blocks) {
    if (nextBlocks.has(block.id)) continue;
    const text = blockText(block).trim();
    changes.push({
      id: `blockDeleted:${block.id}`,
      kind: 'blockDeleted',
      targetId: block.id,
      summary: text.length > 0 ? `فقرة محذوفة: «${text.slice(0, 40)}»` : 'فقرة فارغة محذوفة',
      runs: [{ kind: 'removed', text: blockText(block) }],
    });
  }

  for (const block of next.blocks) {
    const before = baseBlocks.get(block.id);
    if (!before) continue;

    const beforeText = blockText(before);
    const afterText = blockText(block);
    if (beforeText !== afterText) {
      const runs = diffWords(beforeText, afterText);
      changes.push({
        id: `blockTextChanged:${block.id}`,
        kind: 'blockTextChanged',
        targetId: block.id,
        summary: summariseRuns(runs),
        runs,
      });
    }

    const details = attributeChanges(before, block);
    if (details.length > 0) {
      changes.push({
        id: `blockFormatChanged:${block.id}`,
        kind: 'blockFormatChanged',
        targetId: block.id,
        summary: details.join(' · '),
        details,
      });
    }
  }

  // Order, judged only over the blocks BOTH documents hold. Comparing raw indices
  // would report every block after an insertion as moved, which is the positional
  // failure mode ids exist to avoid.
  const commonBase = base.blocks.filter((b) => nextBlocks.has(b.id)).map((b) => b.id);
  const commonNext = next.blocks.filter((b) => baseBlocks.has(b.id)).map((b) => b.id);
  for (let i = 0; i < commonNext.length; i += 1) {
    if (commonBase[i] === commonNext[i]) continue;
    const id = commonNext[i];
    changes.push({
      id: `blockMoved:${id}`,
      kind: 'blockMoved',
      targetId: id,
      summary: `نُقلت الفقرة من الموضع ${commonBase.indexOf(id) + 1} إلى ${i + 1}`,
    });
  }

  /* ── Layout objects ───────────────────────────────────────────────────── */
  const baseObjects = new Map((base.layout?.objects ?? []).map((object) => [object.id, object]));
  const nextObjects = new Map((next.layout?.objects ?? []).map((object) => [object.id, object]));

  for (const [id, object] of nextObjects) {
    if (baseObjects.has(id)) continue;
    changes.push({
      id: `objectInserted:${id}`,
      kind: 'objectInserted',
      targetId: id,
      summary: `عنصر جديد: «${object.name}»`,
    });
  }

  for (const [id, object] of baseObjects) {
    if (nextObjects.has(id)) continue;
    changes.push({
      id: `objectDeleted:${id}`,
      kind: 'objectDeleted',
      targetId: id,
      summary: `عنصر محذوف: «${object.name}»`,
    });
  }

  for (const [id, object] of nextObjects) {
    const before = baseObjects.get(id);
    if (!before) continue;
    const details = objectChanges(before, object);
    if (details.length === 0) continue;

    // A pure position change is reported as a MOVE rather than as a generic edit —
    // "the logo moved" and "the logo's text changed" are different things to review.
    const movedOnly = details.every((detail) => detail.startsWith('الموضع') || detail.startsWith('الصفحة'));
    changes.push({
      id: `${movedOnly ? 'objectMoved' : 'objectChanged'}:${id}`,
      kind: movedOnly ? 'objectMoved' : 'objectChanged',
      targetId: id,
      summary: `«${object.name}» — ${details.join(' · ')}`,
      details,
    });
  }

  return changes;
}

/* ── Accepting and rejecting ────────────────────────────────────────────── */

/**
 * Reject a change: return the document with that one change undone.
 *
 * ACCEPTING IS A NO-OP AND HAS NO FUNCTION HERE, deliberately. The author's document
 * already contains every change; accepting one means agreeing with what is already
 * there. Only rejection alters anything, and it alters exactly one target — which is
 * what makes reviewing a document change by change possible without re-diffing after
 * each decision.
 */
export function rejectChange(
  current: BlockDocument,
  base: BlockDocument,
  change: DocumentChange,
): BlockDocument {
  switch (change.kind) {
    case 'blockInserted':
      // Never leave the document with no blocks — the editor would have nothing to
      // type into and no attributes to inherit from.
      if (current.blocks.length <= 1) return current;
      return { ...current, blocks: current.blocks.filter((block) => block.id !== change.targetId) };

    case 'blockDeleted': {
      const restored = base.blocks.find((block) => block.id === change.targetId);
      if (!restored) return current;
      // Re-inserted at the position it held in the base document, clamped — putting it
      // back at the end would be a second, unrequested change.
      const baseIndex = base.blocks.findIndex((block) => block.id === change.targetId);
      const blocks = [...current.blocks];
      blocks.splice(Math.min(baseIndex, blocks.length), 0, restored);
      return { ...current, blocks };
    }

    case 'blockTextChanged':
    case 'blockFormatChanged':
    case 'blockMoved': {
      const original = base.blocks.find((block) => block.id === change.targetId);
      if (!original) return current;
      return {
        ...current,
        blocks: current.blocks.map((block) => (block.id === change.targetId ? original : block)),
      };
    }

    case 'objectInserted': {
      const layout = current.layout;
      if (!layout) return current;
      return {
        ...current,
        layout: { ...layout, objects: layout.objects.filter((object) => object.id !== change.targetId) },
      };
    }

    case 'objectDeleted': {
      const restored = (base.layout?.objects ?? []).find((object) => object.id === change.targetId);
      if (!restored) return current;
      const layout = current.layout ?? { objects: [], groups: [], guides: [] };
      return { ...current, layout: { ...layout, objects: [...layout.objects, restored] } };
    }

    case 'objectMoved':
    case 'objectChanged': {
      const original = (base.layout?.objects ?? []).find((object) => object.id === change.targetId);
      const layout = current.layout;
      if (!original || !layout) return current;
      return {
        ...current,
        layout: {
          ...layout,
          objects: layout.objects.map((object) => (object.id === change.targetId ? original : object)),
        },
      };
    }

    case 'sectionChanged':
      // Section values live outside the block model; the composer restores them from
      // the base version's own fields. Nothing to do to the document itself.
      return current;
  }
}

/** Counts per category, for the review panel's filter chips. */
export function changeCounts(changes: readonly DocumentChange[]): Record<ChangeCategory, number> {
  const counts: Record<ChangeCategory, number> = { text: 0, format: 0, object: 0 };
  for (const change of changes) counts[CHANGE_CATEGORY_OF[change.kind]] += 1;
  return counts;
}
