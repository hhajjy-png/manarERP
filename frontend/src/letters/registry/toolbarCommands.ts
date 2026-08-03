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
 * NOTE ON SCOPE: this pack declares command IDENTITY only. No command has an
 * implementation; the editor is P7. A template's allow-list therefore describes the
 * approved specification of that document type, not what is currently executable —
 * P7 is responsible for intersecting the allow-list with commands that have
 * registered implementations, so its phase 1 can ship before phase 2's list and
 * indent commands exist.
 */

export type ToolbarCommandId =
  // ── inline marks ──────────────────────────────────────────────────────
  | 'bold'
  | 'underline'
  // ── block alignment (logical; see TextAlignment — no "left" exists) ───
  | 'alignJustify'
  | 'alignStart'
  | 'alignCenter'
  // ── block type ────────────────────────────────────────────────────────
  | 'fontFamily'
  | 'fontSize'
  | 'listNumbered'
  | 'listBulleted'
  | 'indent'
  | 'outdent'
  // ── document structure ────────────────────────────────────────────────
  | 'pageBreak'
  // ── history & reset ───────────────────────────────────────────────────
  | 'undo'
  | 'redo'
  | 'clearFormatting';

/** Grouping, used only to lay the toolbar out in one row. */
export type ToolbarCommandGroup = 'marks' | 'alignment' | 'blockType' | 'structure' | 'history';

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

  alignJustify: { id: 'alignJustify', group: 'alignment', labelAr: 'ضبط', labelEn: 'Justify', scope: 'block' },
  alignStart: { id: 'alignStart', group: 'alignment', labelAr: 'محاذاة للبداية', labelEn: 'Align to start', scope: 'block' },
  alignCenter: { id: 'alignCenter', group: 'alignment', labelAr: 'توسيط', labelEn: 'Centre', scope: 'block' },

  fontFamily: { id: 'fontFamily', group: 'blockType', labelAr: 'الخط', labelEn: 'Font', scope: 'block' },
  fontSize: { id: 'fontSize', group: 'blockType', labelAr: 'المقاس', labelEn: 'Size', scope: 'block' },
  listNumbered: { id: 'listNumbered', group: 'blockType', labelAr: 'قائمة مرقّمة', labelEn: 'Numbered list', scope: 'block' },
  listBulleted: { id: 'listBulleted', group: 'blockType', labelAr: 'قائمة نقطية', labelEn: 'Bulleted list', scope: 'block' },
  indent: { id: 'indent', group: 'blockType', labelAr: 'زيادة الإزاحة', labelEn: 'Indent', scope: 'block' },
  outdent: { id: 'outdent', group: 'blockType', labelAr: 'تقليل الإزاحة', labelEn: 'Outdent', scope: 'block' },

  pageBreak: { id: 'pageBreak', group: 'structure', labelAr: 'فاصل صفحة', labelEn: 'Page break', scope: 'document' },

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
  { id: 'highlight', reason: 'Same as textColor.' },
  { id: 'insertImage', reason: 'The paper already carries the letterhead. This is the rule the module exists to protect (INV-2).' },
  { id: 'insertTable', reason: 'Deferred beyond v1: table pagination across a fixed safe-zone band is a genuinely hard problem.' },
  { id: 'insertTextBox', reason: 'Absolutely-positioned content cannot be pagination-validated, so it can silently enter a reserved zone.' },
  { id: 'insertLink', reason: 'Meaningless on paper.' },
  { id: 'header', reason: 'The header physically exists on the paper; the engine never prints one.' },
  { id: 'footer', reason: 'The footer physically exists on the paper; the engine never prints one.' },
  { id: 'pageSetup', reason: 'Page size, orientation and margins are fixed by the physical stock and owned by the print profile.' },
  { id: 'lineHeight', reason: 'Locked by the typography preset. A free control is the fastest route to a safe-zone violation the user cannot explain.' },
  { id: 'paragraphSpacing', reason: 'Derived from line height; an independent control is another unmodelled pagination input.' },
  { id: 'watermark', reason: 'Would print over the letterhead.' },
  { id: 'background', reason: 'Would print over the letterhead.' },
  { id: 'borders', reason: 'Would print over the letterhead.' },
  { id: 'superscript', reason: 'No use case, and another metric the paginator would have to model.' },
  { id: 'subscript', reason: 'No use case, and another metric the paginator would have to model.' },
  { id: 'letterSpacing', reason: 'Unmodelled pagination input with no official-letter use case.' },
  { id: 'findReplace', reason: 'Unnecessary at letter length; revisit only if a much longer document type is added.' },
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

/** Descriptors for an allow-list, in catalogue order rather than declaration order. */
export function resolveToolbarCommands(
  allowed: readonly ToolbarCommandId[],
): ToolbarCommandDescriptor[] {
  const allowedSet = new Set<string>(allowed);
  return TOOLBAR_COMMAND_IDS.filter((id) => allowedSet.has(id)).map((id) => TOOLBAR_COMMANDS[id]);
}
