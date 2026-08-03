/**
 * Letter Engine — the six document sections.
 *
 * The document is an ordered list of INDEPENDENT sections, each owning its own
 * formatting. There is no single free editor anywhere in this file, and the sections
 * do not share a text model: the date is a date, the recipient is three fields, the
 * subject is one line, and only the content is a paragraph list.
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
import DateInput from '../DateInput';
import { Icon } from '../explorer/ExplorerKit';
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

/** CSS for one paragraph, from its own block attributes. */
export function blockStyle(block: Block, indentStepMm: number): CSSProperties {
  const marks = block.spans[0]?.marks ?? [];
  return {
    fontFamily: letterFontStack(block.attributes.fontId),
    fontSize: `${block.attributes.sizePt}pt`,
    lineHeight: 1.35,
    textAlign: block.attributes.alignment === 'start' ? 'start' : block.attributes.alignment,
    fontWeight: marks.includes('bold') ? 700 : 400,
    textDecoration: marks.includes('underline') ? 'underline' : 'none',
    marginInlineStart: `${block.attributes.indentLevel * indentStepMm}mm`,
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

/* ── 1. Date ───────────────────────────────────────────────────────────── */

export function DateSection({
  value,
  onChange,
  preset,
  readOnly,
  active,
  severity,
  onFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  preset: TypographyPreset;
  readOnly: boolean;
  active: boolean;
  severity?: ValidationSeverity | null;
  onFocus: () => void;
}) {
  return (
    <SectionShell label="التاريخ" active={active} severity={severity} onFocusCapture={onFocus}>
      <div className="ls-date" style={presetStyle(preset)}>
        <span className="ls-date-prefix">التاريخ:</span>
        {readOnly ? (
          <span>{value}</span>
        ) : (
          <DateInput value={value} onChange={onChange} ariaLabel="تاريخ الخطاب" className="ls-date-input" />
        )}
      </div>
    </SectionShell>
  );
}

/* ── 2. Recipient — structured, never one free line ────────────────────── */

export interface RecipientValue {
  name: string;
  title: string;
  organisation: string;
}

export function RecipientSection({
  value,
  onChange,
  preset,
  readOnly,
  active,
  severity,
  onFocus,
}: {
  value: RecipientValue;
  onChange: (patch: Partial<RecipientValue>) => void;
  preset: TypographyPreset;
  readOnly: boolean;
  active: boolean;
  severity?: ValidationSeverity | null;
  onFocus: () => void;
}) {
  // Three fields rather than one free line: a structured recipient is searchable, is
  // reusable by a future multi-recipient section, and never has to be re-parsed out of
  // prose. Every field is optional — not every letter names a person.
  const fields: { key: keyof RecipientValue; label: string; placeholder: string }[] = [
    { key: 'name', label: 'الاسم', placeholder: 'السادة / …' },
    { key: 'title', label: 'الصفة', placeholder: 'المحترم / مدير الإدارة' },
    { key: 'organisation', label: 'الجهة', placeholder: 'وزارة الأشغال العامة' },
  ];

  return (
    <SectionShell label="الجهة المرسل إليها" active={active} severity={severity} onFocusCapture={onFocus}>
      <div className="ls-recipient" style={presetStyle(preset)}>
        {fields.map((field) =>
          readOnly ? (
            value[field.key] ? <div key={field.key}>{value[field.key]}</div> : null
          ) : (
            <input
              key={field.key}
              className="ls-line-input"
              value={value[field.key]}
              onChange={(e) => onChange({ [field.key]: e.target.value })}
              placeholder={field.placeholder}
              aria-label={`الجهة المرسل إليها — ${field.label}`}
              style={{ font: 'inherit', textAlign: 'inherit' }}
            />
          ),
        )}
      </div>
    </SectionShell>
  );
}

/* ── 3. Subject ────────────────────────────────────────────────────────── */

export function SubjectSection({
  value,
  onChange,
  preset,
  readOnly,
  active,
  severity,
  onFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  preset: TypographyPreset;
  readOnly: boolean;
  active: boolean;
  severity?: ValidationSeverity | null;
  onFocus: () => void;
}) {
  return (
    <SectionShell label="الموضوع" active={active} severity={severity} onFocusCapture={onFocus}>
      <div className="ls-subject" style={presetStyle(preset)}>
        <span className="ls-subject-prefix">الموضوع:</span>
        {readOnly ? (
          <span>{value}</span>
        ) : (
          <input
            className="ls-line-input ls-subject-input"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="موضوع الخطاب"
            aria-label="موضوع الخطاب"
            style={{ font: 'inherit', textAlign: 'inherit' }}
          />
        )}
      </div>
    </SectionShell>
  );
}

/* ── 4. Content — the paragraph editor ─────────────────────────────────── */

export interface ParagraphHandlers {
  onTextChange: (blockId: string, text: string) => void;
  onEnter: (blockId: string, caretOffset: number) => void;
  onBackspaceAtStart: (blockId: string) => void;
  onFocusBlock: (blockId: string) => void;
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
}>(function Paragraph({ block, indentStepMm, readOnly, handlers }, ref) {
  const text = blockText(block);

  if (readOnly) {
    return (
      <p className="ls-paragraph ls-paragraph--ro" style={blockStyle(block, indentStepMm)}>
        {text || ' '}
      </p>
    );
  }

  return (
    <textarea
      ref={ref}
      className="ls-paragraph"
      data-block-id={block.id}
      style={blockStyle(block, indentStepMm)}
      value={text}
      rows={1}
      aria-label="فقرة"
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
}: {
  document: BlockDocument;
  indentStepMm: number;
  readOnly: boolean;
  active: boolean;
  severity?: ValidationSeverity | null;
  handlers: ParagraphHandlers;
  registerRef: (blockId: string, el: HTMLTextAreaElement | null) => void;
  onFocus: () => void;
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
          />
        ))}
      </div>
    </SectionShell>
  );
}

/* ── 5 & 6. Signature, stamp and barcode ─────────────────────────────────── */

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
