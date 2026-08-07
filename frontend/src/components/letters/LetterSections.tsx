/**
 * Letter Engine — the document sections.
 *
 * The document is an ordered list of INDEPENDENT sections, each owning its own
 * formatting. There is no single free editor anywhere in this file.
 *
 * Form Editor UX Rebuild v2 removed the date, recipient and subject sections — the
 * document is generic now, and content is the only section an author writes into. Only
 * the composed sections remain: content, signature and barcode.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY EVERY EDITABLE SURFACE IS A `<textarea>` OR AN `<input>`
 * ══════════════════════════════════════════════════════════════════════════
 * Because formatting is per-paragraph, the text itself is PLAIN. A paragraph's font,
 * size, alignment and marks are attributes of the block, applied as CSS to the control
 * that holds it — so a plain textarea renders exactly what the paragraph is, and there
 * is nothing a rich-text surface would add.
 *
 * It also settles INV-6 by construction: there is no `contenteditable`, no HTML is
 * produced, none is parsed, and there is no path from rendered output back to the
 * document. The Block Model stays the only source of truth.
 *
 * ── SIGNATURE AND BARCODE ARE PLACEHOLDERS ───────────────────────────────
 * Both are reserved, measured, labelled — and rendered by nobody. No branding asset is
 * read and no code is generated; those are later packs. Drawing the space they will
 * occupy is what makes the page honest now.
 */

import { type CSSProperties, forwardRef } from 'react';
import { type Block, type BlockDocument } from '../../letters/model/blockTypes';
import LetterBarcode from './LetterBarcode';
import { blockText } from '../../letters/editor/blockCommands';
import { letterFontStack } from '../../letters/fonts/fontIntegration';
import { type TypographyPreset } from '../../letters/registry/typographyPresets';
import { type ValidationSeverity } from '../../letters/registry/validationRuleCatalog';
import { SectionValidationMarker } from './ValidationPanel';

/* ── Shared ────────────────────────────────────────────────────────────── */

/** CSS for a typography preset. `letterFontStack` is the one sanctioned path to a
 *  family string — nothing here writes a font name. */
export function presetStyle(preset: TypographyPreset): CSSProperties {
  return {
    fontFamily: letterFontStack(preset.fontId),
    fontSize: `${preset.sizePt}pt`,
    fontWeight: preset.weight,
    lineHeight: preset.lineHeight,
    textAlign: preset.alignment === 'start' ? 'start' : preset.alignment,
  };
}

/**
 * CSS for one paragraph, from its own block attributes.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  EVERY VERSION-2 ATTRIBUTE IS EXPRESSED HERE, AND THAT IS WHAT MAKES THEM SAFE.
 * ══════════════════════════════════════════════════════════════════════════
 * The hidden measurement mirror renders the SAME components through this same
 * function, so a line height, a paragraph spacing or a tracking value affects the
 * measured height exactly as it affects the painted one. The paginator never learns
 * that these attributes exist — it measures the result. That is the structural answer
 * to the original prohibition on all four as "unmodelled pagination inputs"
 * (see `LIFTED_TOOLBAR_PROHIBITIONS`).
 *
 * `undefined` falls back to the engine's historical value rather than to zero, because
 * throughout the model `undefined` means "historical behaviour", not "none".
 */
export function blockStyle(block: Block, indentStepMm: number): CSSProperties {
  const marks = block.spans[0]?.marks ?? [];
  const attributes = block.attributes;

  // Raised and lowered text is rendered by shifting the baseline rather than by
  // `vertical-align: super`, which browsers implement inconsistently against a `pt`
  // font size and which would therefore measure differently from what it paints.
  const shifted = marks.includes('superscript') || marks.includes('subscript');
  const shiftEm = marks.includes('superscript') ? '0.36em' : marks.includes('subscript') ? '-0.22em' : undefined;

  return {
    fontFamily: letterFontStack(attributes.fontId),
    // A raised or lowered run is set smaller, as type has always done it. The
    // reduction is applied to the RENDERED size only; `sizePt` in the model is
    // untouched, so the size ladder and the integrity checker still see a valid rung.
    fontSize: shifted ? `${attributes.sizePt * 0.72}pt` : `${attributes.sizePt}pt`,
    lineHeight: attributes.lineHeight ?? 1.35,
    letterSpacing: attributes.letterSpacingPt ? `${attributes.letterSpacingPt}pt` : undefined,
    textAlign: attributes.alignment === 'start' ? 'start' : attributes.alignment,
    fontWeight: marks.includes('bold') ? 700 : 400,
    textDecoration: marks.includes('underline') ? 'underline' : 'none',
    // A NEUTRAL GREY WASH, never a hue. Highlight was prohibited alongside text colour
    // because official letters are black on pre-printed stock; rendering the mark
    // without a colour keeps that rule intact while giving the author the emphasis.
    backgroundColor: marks.includes('highlight') ? 'rgba(15, 23, 42, 0.12)' : undefined,
    verticalAlign: shifted ? 'baseline' : undefined,
    position: shifted ? 'relative' : undefined,
    insetBlockEnd: shiftEm,
    marginInlineStart: `${attributes.indentLevel * indentStepMm}mm`,
    marginBlockEnd: attributes.paragraphSpacingPt ? `${attributes.paragraphSpacingPt}pt` : undefined,
    // A hanging indent is a first-line indent of the opposite sign against a padded
    // block — the standard construction, and the only one that survives justification.
    textIndent: attributes.hangingIndentMm
      ? `-${attributes.hangingIndentMm}mm`
      : attributes.firstLineIndentMm
        ? `${attributes.firstLineIndentMm}mm`
        : undefined,
    paddingInlineStart: attributes.hangingIndentMm ? `${attributes.hangingIndentMm}mm` : undefined,
  };
}

interface SectionShellProps {
  label: string;
  active: boolean;
  /** Most severe finding attached to this section, if any. */
  severity?: ValidationSeverity | null;
  children: React.ReactNode;
  onFocusCapture?: () => void;
}

/**
 * A section's frame: a label that appears on hover/focus, and nothing printable.
 *
 * A finding shows as a small badge ON THE LABEL — outside the band, in chrome that is
 * already there. Nothing about the text being written moves, reflows or gains a
 * decoration, which is the whole point of "subtle": editing must not be disturbed.
 */
function SectionShell({ label, active, severity, children, onFocusCapture }: SectionShellProps) {
  return (
    <section
      className={`ls-section${active ? ' is-active' : ''}${severity ? ` has-issue has-issue--${severity}` : ''}`}
      onFocusCapture={onFocusCapture}
    >
      <span className="no-print ls-section-label">
        {label}
        <SectionValidationMarker severity={severity ?? null} />
      </span>
      {children}
    </section>
  );
}

/* ── 1. Content — the paragraph editor ─────────────────────────────────── */

export interface ParagraphHandlers {
  onTextChange: (blockId: string, text: string) => void;
  onEnter: (blockId: string, caretOffset: number) => void;
  onBackspaceAtStart: (blockId: string) => void;
  onFocusBlock: (blockId: string) => void;
  /**
   * Caret moved or selection changed.
   *
   * Carries the control's CURRENT text as well as the offsets, so the composer can
   * compute line, column and selection size without reaching back into the document.
   * That is not a convenience: deriving the text from state would mean doing it inside
   * a state updater, and a side effect there runs twice under StrictMode.
   *
   * Optional, so the measurement mirror — which has nothing to report to — needs no stub.
   */
  onSelectionChange?: (blockId: string, text: string, selectionStart: number, selectionEnd: number) => void;
  /** Multi-paragraph plain-text paste, to be split into blocks by the composer. */
  onPasteMultiline?: (blockId: string, selectionStart: number, selectionEnd: number, text: string) => void;
}

/**
 * One paragraph.
 *
 * A textarea, auto-grown to its content so the paper shows the real number of lines.
 * `forwardRef` because the composer restores the caret after a split or a merge — the
 * two operations where the text moves between controls and the browser cannot know
 * where the user was.
 */
const Paragraph = forwardRef<HTMLTextAreaElement, {
  block: Block;
  indentStepMm: number;
  readOnly: boolean;
  handlers: ParagraphHandlers;
  /** Ordinal for a numbered list item, 1-based. Undefined for every other kind. */
  listOrdinal?: number;
  /**
   * Substitutes `{{Variable}}` tokens for their values.
   *
   * ══════════════════════════════════════════════════════════════════════════
   *  APPLIED TO THE READ-ONLY RENDERING ONLY, AND THAT ASYMMETRY IS THE DESIGN.
   * ══════════════════════════════════════════════════════════════════════════
   * The editable textarea shows the TOKEN, because an author must be able to edit the
   * variable they inserted — substituting there would make `{{Employee}}` unreachable
   * the instant it resolved, and there is no way back from "أحمد محمد" to the question
   * that produced it.
   *
   * Everything else — the measurement mirror, print mode, a registered letter, the
   * value preview — renders RESOLVED, because that is what reaches the paper. Measuring
   * the token instead would paginate the document against text nobody will ever see.
   */
  resolveText?: (text: string) => string;
}>(function Paragraph({ block, indentStepMm, readOnly, handlers, listOrdinal, resolveText }, ref) {
  const raw = blockText(block);
  const text = readOnly && resolveText ? resolveText(raw) : raw;
  const style = blockStyle(block, indentStepMm);

  // A list marker is CHROME AROUND the text, never part of it: putting "1. " into the
  // block's own text would make the number searchable, replaceable and countable as a
  // word, and renumbering the list would rewrite the document.
  const marker =
    block.kind === 'listItem'
      ? block.attributes.listType === 'numbered'
        ? `${listOrdinal ?? 1}.`
        : '•'
      : null;

  const kindClass =
    block.kind === 'heading'
      ? ` ls-paragraph--heading ls-paragraph--h${block.attributes.headingLevel ?? 1}`
      : block.kind === 'listItem'
        ? ' ls-paragraph--list'
        : '';

  const rowClass = `ls-para-row${marker ? ' ls-para-row--list' : ''}`;
  const markerNode = marker ? (
    <span className="ls-list-marker" style={style} aria-hidden="true">{marker}</span>
  ) : null;

  if (readOnly) {
    return (
      <div className={rowClass}>
      {markerNode}
      <p className={`ls-paragraph ls-paragraph--ro${kindClass}`} style={style}>
        {text || ' '}
      </p>
      </div>
    );
  }

  return (
    <div className={rowClass}>
    {markerNode}
    <textarea
      ref={ref}
      className={`ls-paragraph${kindClass}`}
      data-block-id={block.id}
      style={style}
      value={text}
      rows={1}
      aria-label={block.kind === 'heading' ? `عنوان مستوى ${block.attributes.headingLevel ?? 1}` : 'فقرة'}
      onChange={(e) => {
        handlers.onTextChange(block.id, e.target.value);
        // Auto-grow: the paper must show the real height of the paragraph, not a
        // fixed box with a scrollbar inside it.
        e.target.style.height = 'auto';
        e.target.style.height = `${e.target.scrollHeight}px`;
      }}
      onFocus={(e) => {
        handlers.onFocusBlock(block.id);
        e.target.style.height = 'auto';
        e.target.style.height = `${e.target.scrollHeight}px`;
        handlers.onSelectionChange?.(block.id, e.target.value, e.target.selectionStart, e.target.selectionEnd);
      }}
      // Caret and selection reporting for the status bar. `onSelect` fires for clicks,
      // drags and keyboard movement alike, which is why it is used instead of wiring
      // three separate handlers that would each have to agree with the others.
      onSelect={(e) => {
        const target = e.currentTarget;
        handlers.onSelectionChange?.(block.id, target.value, target.selectionStart, target.selectionEnd);
      }}
      // PASTE IS ALWAYS PLAIN — a textarea cannot receive HTML, so the sanitisation the
      // block model requires is free. What is NOT free is multi-paragraph text: pasting
      // three paragraphs would otherwise produce one block containing two newlines, a
      // shape the model has no way to express and the paginator no way to break.
      onPaste={(e) => {
        const pasted = e.clipboardData.getData('text/plain');
        if (!pasted.includes('\n') || !handlers.onPasteMultiline) return;
        e.preventDefault();
        const target = e.currentTarget;
        handlers.onPasteMultiline(block.id, target.selectionStart, target.selectionEnd, pasted);
      }}
      onKeyDown={(e) => {
        const target = e.currentTarget;
        if (e.key === 'Enter' && !e.shiftKey) {
          // Enter creates a paragraph. Shift+Enter is left to the browser as a soft
          // line break inside the same paragraph.
          e.preventDefault();
          handlers.onEnter(block.id, target.selectionStart);
          return;
        }
        if (e.key === 'Backspace' && target.selectionStart === 0 && target.selectionEnd === 0) {
          e.preventDefault();
          handlers.onBackspaceAtStart(block.id);
        }
      }}
    />
    </div>
  );
});

export function ContentSection({
  document,
  indentStepMm,
  readOnly,
  active,
  severity,
  handlers,
  registerRef,
  onFocus,
  listOrdinals,
  resolveText,
}: {
  document: BlockDocument;
  indentStepMm: number;
  readOnly: boolean;
  active: boolean;
  severity?: ValidationSeverity | null;
  handlers: ParagraphHandlers;
  registerRef: (blockId: string, el: HTMLTextAreaElement | null) => void;
  onFocus: () => void;
  /**
   * Numbered-list ordinals by block id, computed against the WHOLE document.
   *
   * Supplied rather than derived here because the composer renders this section one
   * block at a time — the paginator's unit is the block, so each paragraph arrives in
   * its own `ContentSection` with a single-block document. Counting locally would
   * restart every list at 1.
   */
  listOrdinals?: Readonly<Record<string, number>>;
  /** Substitutes variable tokens. Applied to the read-only rendering only. */
  resolveText?: (text: string) => string;
}) {
  return (
    <SectionShell label="المحتوى" active={active} severity={severity} onFocusCapture={onFocus}>
      <div className="ls-content">
        {document.blocks.map((block) => (
          <Paragraph
            key={block.id}
            ref={(el) => registerRef(block.id, el)}
            block={block}
            indentStepMm={indentStepMm}
            readOnly={readOnly}
            handlers={handlers}
            listOrdinal={listOrdinals?.[block.id]}
            resolveText={resolveText}
          />
        ))}
      </div>
    </SectionShell>
  );
}

/**
 * Numbered-list ordinals for a whole document.
 *
 * A run of consecutive numbered items shares a sequence; anything else — a paragraph, a
 * heading, a bulleted item — ends the run and the next numbered item starts again at 1.
 * That is what "consecutive" means to a reader, and deriving it from adjacency rather
 * than from a stored counter means the numbering can never disagree with the page.
 */
export function computeListOrdinals(document: BlockDocument): Record<string, number> {
  const ordinals: Record<string, number> = {};
  let run = 0;

  for (const block of document.blocks) {
    if (block.kind === 'listItem' && block.attributes.listType === 'numbered') {
      run += 1;
      ordinals[block.id] = run;
    } else {
      run = 0;
    }
  }

  return ordinals;
}

/* ── 2 & 3. Signature, stamp and barcode ─────────────────────────────────── */

/**
 * The signature block — signature, stamp, or neither.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE IMAGES COME FROM THE COMPANY BRANDING REGISTRY. NOTHING IS DUPLICATED.
 * ══════════════════════════════════════════════════════════════════════════
 * `print-templates/branding` already owns the company's signature and stamp assets —
 * uploaded in Settings, stored in the `Setting` table, and read by every other printed
 * document in the ERP. This component receives resolved assets and renders them. It
 * does not fetch, upload, store, or know where they live, so a letter can never drift
 * from the signature the rest of the system uses.
 *
 * The letter stores only an ASSET ID. What was actually printed is frozen separately
 * into the registration snapshot, so re-uploading a signature updates every draft
 * without rewriting a single issued letter.
 *
 * ── ALL THREE STATES ARE LEGITIMATE ──────────────────────────────────────
 * No signature · signature · signature and stamp. None is an error and none is a
 * default the user must undo — an official letter is often issued unsigned, and the
 * validation engine treats an absent signature as information, never a blocker.
 */
export interface RenderedBrandingAsset {
  readonly assetId: string;
  readonly name: string;
  readonly imageUrl: string;
}

export interface SignatureBlockProps {
  active: boolean;
  severity?: ValidationSeverity | null;
  onFocus: () => void;
  signature: RenderedBrandingAsset | null;
  stamp: RenderedBrandingAsset | null;
  /** Height of the signature image in millimetres — from the Geometry Registry. */
  signatureHeightMm: number;
  /** Height of the stamp image in millimetres — from the Geometry Registry. */
  stampHeightMm: number;
}

export function SignatureBlock({
  active,
  severity,
  onFocus,
  signature,
  stamp,
  signatureHeightMm,
  stampHeightMm,
}: SignatureBlockProps) {
  const empty = !signature && !stamp;

  return (
    <SectionShell label="التوقيع" active={active} severity={severity} onFocusCapture={onFocus}>
      {empty ? (
        // Reserved space rather than a collapsed block: the page must stay an honest
        // picture of the finished letter, and a signature area that appears only once
        // something is chosen would change the pagination when it does.
        <div className="ls-signature ls-signature--empty" aria-label="بلا توقيع">
          <span className="ls-signature-hint">بلا توقيع</span>
        </div>
      ) : (
        <div className="ls-signature">
          {signature && (
            <figure className="ls-signature-item">
              <img
                className="ls-signature-image"
                src={signature.imageUrl}
                alt={`توقيع ${signature.name}`}
                style={{ height: `${signatureHeightMm}mm` }}
              />
              {signature.name && <figcaption className="ls-signature-name">{signature.name}</figcaption>}
            </figure>
          )}
          {stamp && (
            <figure className="ls-signature-item ls-signature-item--stamp">
              <img
                className="ls-signature-image"
                src={stamp.imageUrl}
                alt={`ختم ${stamp.name}`}
                style={{ height: `${stampHeightMm}mm` }}
              />
            </figure>
          )}
        </div>
      )}
    </SectionShell>
  );
}

export interface BarcodeBlockProps {
  active: boolean;
  severity?: ValidationSeverity | null;
  onFocus: () => void;
  /** The finished payload, or `''` before a reference exists. */
  payload: string;
  reference: string | null;
  /** Symbol edge length in millimetres — from the Geometry Registry. */
  sizeMm: number;
}

/**
 * The barcode block.
 *
 * A draft has no reference, so there is nothing to encode and nothing to caption —
 * the space is reserved and labelled instead. That is not a placeholder standing in
 * for unbuilt work: it is the correct rendering of a document that has not yet been
 * registered, and it occupies the same millimetres the real symbol will.
 */
export function BarcodeBlock({ active, severity, onFocus, payload, reference, sizeMm }: BarcodeBlockProps) {
  return (
    <SectionShell label="الباركود" active={active} severity={severity} onFocusCapture={onFocus}>
      {reference && payload ? (
        <div className="ls-barcode">
          <LetterBarcode payload={payload} reference={reference} sizeMm={sizeMm} />
        </div>
      ) : (
        <div className="ls-barcode ls-barcode--pending">
          <div className="ls-barcode-reserved" style={{ width: `${sizeMm}mm`, height: `${sizeMm}mm` }} aria-hidden="true" />
          <span className="ls-barcode-hint">يُصدَر الرمز والرقم المرجعي عند التسجيل</span>
        </div>
      )}
    </SectionShell>
  );
}
