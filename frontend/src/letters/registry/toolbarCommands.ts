/**
 * Letter Engine — the toolbar command catalogue.
 *
 * WHAT THIS IS
 * ────────────
 * The complete vocabulary of editing commands the engine will ever expose, and — just
 * as importantly — an explicit list of the commands it must NEVER expose. A template
 * selects from `TOOLBAR_COMMANDS`; the toolbar itself has no built-in default set.
 * That is the toolbar layer of the metadata-driven architecture: adding a document
 * type with a smaller toolbar is a registry entry, not a component change.
 *
 * THE EDITOR'S GOVERNING IDEA
 * ───────────────────────────
 * This is not Word. Consistency outranks freedom. Each command below survived the
 * question "can this break the safe zones, the letterhead, or the official register?"
 * The ones that could not are in `PROHIBITED_TOOLBAR_COMMANDS`, which is not
 * documentation — `templateRegistry.test.ts` asserts no template's allow-list
 * intersects it, so a prohibited tool cannot be reintroduced by a later pack without
 * failing the build.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  DOCUMENT STUDIO FOUNDATION v1 — SEVEN PROHIBITIONS LIFTED, ON THE RECORD
 * ══════════════════════════════════════════════════════════════════════════
 * On the Product Owner's explicit instruction, seven ids moved OFF the prohibition
 * list and into the catalogue below:
 *
 *   highlight · superscript · subscript · lineHeight · paragraphSpacing ·
 *   letterSpacing · findReplace
 *
 * Six of the seven were prohibited for ONE shared reason: each is an unmodelled input
 * to pagination, so a free control could push content into a reserved zone with no
 * rule able to explain why. That reason is answered structurally rather than waived:
 *
 *   · Every one of the six is a BOUNDED LADDER, never a free number — see
 *     `LINE_HEIGHT_LADDER`, `PARAGRAPH_SPACING_LADDER_PT`, `LETTER_SPACING_LADDER_PT`
 *     below. A bounded set is a bounded validation surface, which is the same argument
 *     that put `FONT_SIZE_LADDER_PT` in the typography registry.
 *   · All six are BLOCK ATTRIBUTES (or, for the three marks, whole-paragraph marks),
 *     so they are carried by the block model, rendered by `blockStyle`, and therefore
 *     measured by the SAME hidden measurement mirror that already measures font size.
 *     The paginator does not need to model them — it measures the result.
 *   · The measurement mirror renders the identical component tree, so screen, measured
 *     height and printed page cannot disagree about any of them.
 *
 * `findReplace` was prohibited as "unnecessary at letter length", which is a
 * usefulness judgement rather than a safety one; it touches text, never geometry.
 *
 * WHAT REMAINS PROHIBITED IS UNCHANGED AND STILL ENFORCED. Italic (no Arabic face
 * ships one), colour, images, tables, text boxes, links, header, footer, page setup,
 * watermark, background and borders all keep their original reasons, and the two test
 * suites still assert no template may name one.
 *
 * NOTE ON SCOPE: this pack declares command IDENTITY only. No command has an
 * implementation; the editor is P7. A template's allow-list therefore describes the
 * approved specification of that document type, not what is currently executable —
 * P7 is responsible for intersecting the allow-list with commands that have
 * registered implementations, so its phase 1 can ship before phase 2's list and
 * indent commands exist.
 */

import {
  FIRST_LINE_INDENT_LADDER_MM as FIRST_LINE_INDENT_MM,
  HANGING_INDENT_LADDER_MM as HANGING_INDENT_MM,
} from './geometryRegistry';

export type ToolbarCommandId =
  // ── inline marks (whole-paragraph in this engine — see blockCommands) ─
  | 'bold'
  | 'underline'
  | 'highlight'
  | 'superscript'
  | 'subscript'
  // ── block alignment (logical; see TextAlignment — no "left" exists) ───
  | 'alignJustify'
  | 'alignStart'
  | 'alignCenter'
  // ── block type ────────────────────────────────────────────────────────
  | 'fontFamily'
  | 'fontSize'
  | 'paragraphStyle'
  | 'characterStyle'
  | 'listNumbered'
  | 'listBulleted'
  | 'indent'
  | 'outdent'
  // ── spacing & measure (all bounded ladders, never free numbers) ───────
  | 'lineHeight'
  | 'paragraphSpacing'
  | 'letterSpacing'
  | 'firstLineIndent'
  | 'hangingIndent'
  // ── clipboard ─────────────────────────────────────────────────────────
  | 'formatPainter'
  | 'pastePlain'
  // ── document structure ────────────────────────────────────────────────
  | 'pageBreak'
  // ── productivity ──────────────────────────────────────────────────────
  | 'findReplace'
  // ── history & reset ───────────────────────────────────────────────────
  | 'undo'
  | 'redo'
  | 'clearFormatting';

/** Grouping, used to lay the toolbar out in labelled sections. */
export type ToolbarCommandGroup =
  | 'marks'
  | 'alignment'
  | 'blockType'
  | 'spacing'
  | 'clipboard'
  | 'structure'
  | 'productivity'
  | 'history';

/**
 * Line heights the editor may set. A ladder, for the reason the header records: a
 * bounded set is a bounded validation surface, and every rung is measured rather than
 * modelled.
 */
export const LINE_HEIGHT_LADDER: readonly number[] = [1.15, 1.35, 1.5, 1.75, 2];

/** Space after a paragraph, in points. `0` is the engine's historical behaviour. */
export const PARAGRAPH_SPACING_LADDER_PT: readonly number[] = [0, 3, 6, 9, 12];

/**
 * Letter spacing (tracking), in points.
 *
 * Negative rungs are deliberately absent: tightening Arabic script below its designed
 * fit breaks joining behaviour, which is a legibility fault rather than a style.
 */
export const LETTER_SPACING_LADDER_PT: readonly number[] = [0, 0.25, 0.5, 0.75, 1];

/**
 * First-line and hanging indents, in millimetres.
 *
 * RE-EXPORTED, never declared here. INV-4 makes the Geometry Registry the single home
 * of a millimetre — including one that describes a paragraph's measure rather than the
 * sheet's bands — and `noHardcodedGeometry.test.ts` enforces that mechanically. The
 * re-export exists so the toolbar's five ladders can still be read as one set.
 *
 * The two are mutually exclusive on a block — a paragraph cannot both push and pull its
 * first line — and `blockCommands.setBlockIndentation` enforces that rather than
 * leaving the pair to contradict each other.
 */
export { FIRST_LINE_INDENT_MM as FIRST_LINE_INDENT_LADDER_MM, HANGING_INDENT_MM as HANGING_INDENT_LADDER_MM };

/** Is this a value the editor may set? One guard per ladder. */
export function isLadderLineHeight(value: number): boolean {
  return LINE_HEIGHT_LADDER.includes(value);
}
export function isLadderParagraphSpacingPt(value: number): boolean {
  return PARAGRAPH_SPACING_LADDER_PT.includes(value);
}
export function isLadderLetterSpacingPt(value: number): boolean {
  return LETTER_SPACING_LADDER_PT.includes(value);
}
export function isLadderFirstLineIndentMm(value: number): boolean {
  return FIRST_LINE_INDENT_MM.includes(value);
}
export function isLadderHangingIndentMm(value: number): boolean {
  return HANGING_INDENT_MM.includes(value);
}

export interface ToolbarCommandDescriptor {
  readonly id: ToolbarCommandId;
  readonly group: ToolbarCommandGroup;
  readonly labelAr: string;
  readonly labelEn: string;
  /**
   * Whether the command acts on the exact character range or on whole blocks.
   *
   * The asymmetry is deliberate: inline marks apply to a selection, block attributes
   * apply to entire blocks. A paragraph with three fonts in it is not an official
   * letter, and forbidding that removes a whole class of pagination surprise.
   */
  readonly scope: 'inline' | 'block' | 'document';
}

export const TOOLBAR_COMMANDS = {
  bold: { id: 'bold', group: 'marks', labelAr: 'عريض', labelEn: 'Bold', scope: 'inline' },
  underline: { id: 'underline', group: 'marks', labelAr: 'تسطير', labelEn: 'Underline', scope: 'inline' },
  highlight: { id: 'highlight', group: 'marks', labelAr: 'تظليل', labelEn: 'Highlight', scope: 'inline' },
  superscript: { id: 'superscript', group: 'marks', labelAr: 'رفع', labelEn: 'Superscript', scope: 'inline' },
  subscript: { id: 'subscript', group: 'marks', labelAr: 'خفض', labelEn: 'Subscript', scope: 'inline' },

  alignJustify: { id: 'alignJustify', group: 'alignment', labelAr: 'ضبط', labelEn: 'Justify', scope: 'block' },
  alignStart: { id: 'alignStart', group: 'alignment', labelAr: 'محاذاة للبداية', labelEn: 'Align to start', scope: 'block' },
  alignCenter: { id: 'alignCenter', group: 'alignment', labelAr: 'توسيط', labelEn: 'Centre', scope: 'block' },

  fontFamily: { id: 'fontFamily', group: 'blockType', labelAr: 'الخط', labelEn: 'Font', scope: 'block' },
  fontSize: { id: 'fontSize', group: 'blockType', labelAr: 'المقاس', labelEn: 'Size', scope: 'block' },
  paragraphStyle: { id: 'paragraphStyle', group: 'blockType', labelAr: 'نمط الفقرة', labelEn: 'Paragraph style', scope: 'block' },
  characterStyle: { id: 'characterStyle', group: 'blockType', labelAr: 'نمط الأحرف', labelEn: 'Character style', scope: 'block' },
  listNumbered: { id: 'listNumbered', group: 'blockType', labelAr: 'قائمة مرقّمة', labelEn: 'Numbered list', scope: 'block' },
  listBulleted: { id: 'listBulleted', group: 'blockType', labelAr: 'قائمة نقطية', labelEn: 'Bulleted list', scope: 'block' },
  indent: { id: 'indent', group: 'blockType', labelAr: 'زيادة الإزاحة', labelEn: 'Indent', scope: 'block' },
  outdent: { id: 'outdent', group: 'blockType', labelAr: 'تقليل الإزاحة', labelEn: 'Outdent', scope: 'block' },

  lineHeight: { id: 'lineHeight', group: 'spacing', labelAr: 'تباعد الأسطر', labelEn: 'Line height', scope: 'block' },
  paragraphSpacing: { id: 'paragraphSpacing', group: 'spacing', labelAr: 'تباعد الفقرات', labelEn: 'Paragraph spacing', scope: 'block' },
  letterSpacing: { id: 'letterSpacing', group: 'spacing', labelAr: 'تباعد الأحرف', labelEn: 'Letter spacing', scope: 'block' },
  firstLineIndent: { id: 'firstLineIndent', group: 'spacing', labelAr: 'إزاحة السطر الأول', labelEn: 'First-line indent', scope: 'block' },
  hangingIndent: { id: 'hangingIndent', group: 'spacing', labelAr: 'إزاحة معلّقة', labelEn: 'Hanging indent', scope: 'block' },

  formatPainter: { id: 'formatPainter', group: 'clipboard', labelAr: 'ناسخ التنسيق', labelEn: 'Format painter', scope: 'block' },
  pastePlain: { id: 'pastePlain', group: 'clipboard', labelAr: 'لصق كنص عادي', labelEn: 'Paste plain text', scope: 'block' },

  pageBreak: { id: 'pageBreak', group: 'structure', labelAr: 'فاصل صفحة', labelEn: 'Page break', scope: 'document' },

  findReplace: { id: 'findReplace', group: 'productivity', labelAr: 'بحث واستبدال', labelEn: 'Find and replace', scope: 'document' },

  undo: { id: 'undo', group: 'history', labelAr: 'تراجع', labelEn: 'Undo', scope: 'document' },
  redo: { id: 'redo', group: 'history', labelAr: 'إعادة', labelEn: 'Redo', scope: 'document' },
  clearFormatting: { id: 'clearFormatting', group: 'history', labelAr: 'إزالة التنسيق', labelEn: 'Clear formatting', scope: 'block' },
} as const satisfies Record<ToolbarCommandId, ToolbarCommandDescriptor>;

export const TOOLBAR_COMMAND_IDS = Object.keys(TOOLBAR_COMMANDS) as ToolbarCommandId[];

/**
 * Commands that must never exist in this engine, each with the reason.
 *
 * This list is enforced, not advisory. It is expressed as plain strings rather than
 * `ToolbarCommandId` precisely BECAUSE these ids must never enter that union — if one
 * ever did, this list would stop compiling and the omission would be visible.
 *
 * Twelve entries, down from nineteen. The seven that left are recorded in
 * `LIFTED_TOOLBAR_PROHIBITIONS` below rather than deleted without trace — a
 * prohibition that simply vanishes from a file is indistinguishable from one that was
 * never considered.
 */
export const PROHIBITED_TOOLBAR_COMMANDS: readonly { readonly id: string; readonly reason: string }[] = [
  {
    id: 'italic',
    reason:
      'Registry-driven: traditionalArabic, simplifiedArabic, droidNaskh, cairo, tajawal and ' +
      'ibmPlexArabic all declare supportsItalic: false. The browser would synthesise a slant, ' +
      'which on Arabic script is typographically wrong rather than merely ugly.',
  },
  { id: 'textColor', reason: 'Official letters are black on pre-printed stock; colour reads as unofficial.' },
  { id: 'insertImage', reason: 'The paper already carries the letterhead. This is the rule the module exists to protect (INV-2).' },
  { id: 'insertTable', reason: 'Deferred beyond v1: table pagination across a fixed safe-zone band is a genuinely hard problem.' },
  { id: 'insertTextBox', reason: 'Absolutely-positioned content cannot be pagination-validated, so it can silently enter a reserved zone.' },
  { id: 'insertLink', reason: 'Meaningless on paper.' },
  { id: 'header', reason: 'The header physically exists on the paper; the engine never prints one.' },
  { id: 'footer', reason: 'The footer physically exists on the paper; the engine never prints one.' },
  { id: 'pageSetup', reason: 'Page size, orientation and margins are fixed by the physical stock and owned by the print profile.' },
  { id: 'watermark', reason: 'Would print over the letterhead.' },
  { id: 'background', reason: 'Would print over the letterhead.' },
  { id: 'borders', reason: 'Would print over the letterhead.' },
];

/**
 * Prohibitions lifted in Document Studio Foundation v1, with the original reason and
 * what answers it now.
 *
 * Kept as data rather than as a comment so the decision is auditable and so a test can
 * assert the two lists never overlap — an id may be prohibited or lifted, never both.
 */
export const LIFTED_TOOLBAR_PROHIBITIONS: readonly {
  readonly id: ToolbarCommandId;
  readonly originalReason: string;
  readonly answeredBy: string;
}[] = [
  {
    id: 'highlight',
    originalReason: 'Same as textColor — official letters are black on pre-printed stock.',
    answeredBy:
      'Rendered as a neutral grey wash, not a colour: the mark carries no hue, so the ' +
      'black-on-stock rule is intact. textColor itself remains prohibited.',
  },
  {
    id: 'superscript',
    originalReason: 'No use case, and another metric the paginator would have to model.',
    answeredBy:
      'A whole-paragraph mark rendered by blockStyle, so the measurement mirror measures ' +
      'its real height. The paginator models nothing — it measures the result.',
  },
  {
    id: 'subscript',
    originalReason: 'No use case, and another metric the paginator would have to model.',
    answeredBy:
      'Same as superscript — a whole-paragraph mark rendered by blockStyle and measured ' +
      'by the mirror. The two are mutually exclusive by construction, so a paragraph ' +
      'can never be raised and lowered at once.',
  },
  {
    id: 'lineHeight',
    originalReason:
      'Locked by the typography preset. A free control is the fastest route to a ' +
      'safe-zone violation the user cannot explain.',
    answeredBy:
      'Not a free control: LINE_HEIGHT_LADDER is a five-rung bounded set, and the value ' +
      'is a block attribute the measurement mirror renders and measures.',
  },
  {
    id: 'paragraphSpacing',
    originalReason: 'Derived from line height; an independent control is another unmodelled pagination input.',
    answeredBy: 'Bounded by PARAGRAPH_SPACING_LADDER_PT and measured, not modelled.',
  },
  {
    id: 'letterSpacing',
    originalReason: 'Unmodelled pagination input with no official-letter use case.',
    answeredBy:
      'Bounded by LETTER_SPACING_LADDER_PT, which carries no negative rung — tightening ' +
      'Arabic below its designed fit breaks joining behaviour and is unrepresentable.',
  },
  {
    id: 'findReplace',
    originalReason: 'Unnecessary at letter length; revisit only if a much longer document type is added.',
    answeredBy:
      'A usefulness judgement rather than a safety one. Find and replace operate on ' +
      'block text through the pure commands; no geometry is touched.',
  },
];

/* ── Queries ────────────────────────────────────────────────────────────── */

/** A command known at compile time. */
export function getToolbarCommand(id: ToolbarCommandId): ToolbarCommandDescriptor {
  return TOOLBAR_COMMANDS[id];
}

/** Is this an id the catalogue declares? Guard for template metadata. */
export function isToolbarCommandId(id: string | null | undefined): id is ToolbarCommandId {
  if (!id) return false;
  return Object.prototype.hasOwnProperty.call(TOOLBAR_COMMANDS, id);
}

/** Is this id on the permanent prohibition list? */
export function isProhibitedToolbarCommand(id: string): boolean {
  return PROHIBITED_TOOLBAR_COMMANDS.some((c) => c.id === id);
}

/** Was this id prohibited and then lifted? Audit query — not a gate. */
export function isLiftedToolbarProhibition(id: string): boolean {
  return LIFTED_TOOLBAR_PROHIBITIONS.some((c) => c.id === id);
}

/** Descriptors for an allow-list, in catalogue order rather than declaration order. */
export function resolveToolbarCommands(
  allowed: readonly ToolbarCommandId[],
): ToolbarCommandDescriptor[] {
  const allowedSet = new Set<string>(allowed);
  return TOOLBAR_COMMAND_IDS.filter((id) => allowedSet.has(id)).map((id) => TOOLBAR_COMMANDS[id]);
}
