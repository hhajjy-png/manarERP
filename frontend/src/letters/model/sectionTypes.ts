/**
 * Letter Engine — document sections.
 *
 * A document is an ORDERED LIST OF SECTIONS, not one large editor. Each section owns
 * its own formatting and its own rules. That decomposition is what makes the engine
 * metadata-driven: a template declares which sections it has and in what order, and
 * the renderer resolves each through a component registry (P5) rather than through a
 * fixed JSX tree.
 *
 * TWO SHAPES, DELIBERATELY DISTINCT
 * ─────────────────────────────────
 *   · `SectionSpec`     — TEMPLATE side. "An Official Letter HAS a subject, it is
 *                          required, it lives on the first page, it uses the subject
 *                          typography role."
 *   · `SectionInstance` — DOCUMENT side. "THIS letter's subject is «طلب تمديد عقد»."
 *
 * Collapsing them would put per-document data in the registry or per-type rules in
 * every document — and the second is what makes a template change silently rewrite
 * history, which INV-9 forbids.
 */

import { type TypographyRole } from '../registry/typographyPresets';
import { type BlockDocument } from './blockTypes';

/**
 * The kinds of section the engine knows. Closed in v1 at the six approved for
 * Official Letter.
 *
 * A genuinely new kind — Circular's multi-recipient block, an Administrative
 * Decision's articles — is a new entry here PLUS a new registered component. That
 * pairing is the §5.2 boundary: metadata may select and parameterise behaviour, but
 * it can never introduce a new kind of behaviour on its own.
 */
export type SectionKind = 'date' | 'recipient' | 'subject' | 'content' | 'signature' | 'barcode';

export const SECTION_KINDS: readonly SectionKind[] = [
  'date',
  'recipient',
  'subject',
  'content',
  'signature',
  'barcode',
];

/**
 * Where a section may appear once the document paginates.
 *
 * `firstPage` — page 1 only. Date, recipient and subject identify the document and
 *               would be meaningless repeated.
 * `flow`      — flows across as many pages as it needs. Only the content does this.
 * `lastPage`  — last page only. The signature and barcode authorise the document as a
 *               whole; repeating them per page would make every sheet independently
 *               authoritative, which is exactly wrong for a multi-page letter.
 */
export type SectionPageScope = 'firstPage' | 'flow' | 'lastPage';

export const SECTION_PAGE_SCOPES: readonly SectionPageScope[] = ['firstPage', 'flow', 'lastPage'];

/**
 * A section as the TEMPLATE declares it.
 */
export interface SectionSpec {
  readonly kind: SectionKind;
  /** A document cannot be registered without a required section's content. */
  readonly required: boolean;
  /**
   * Whether the user types into it.
   *
   * `false` for the signature and barcode: both are composed by the engine from the
   * branding system and the registration snapshot, and are NEVER inserted into the
   * editor by hand. That is the approved rule and the reason neither appears in the
   * toolbar.
   */
  readonly editable: boolean;
  readonly pageScope: SectionPageScope;
  /** Which typography role this section renders with. Never a font id. */
  readonly typographyRole: TypographyRole;
}

/* ── Document-side section content ────────────────────────────────────────
   One payload shape per kind. Discriminated by `kind` so a renderer narrows
   without casting. */

/** The issue date. Held as an ISO `yyyy-MM-dd` string; display format is the renderer's. */
export interface DateSectionContent {
  readonly kind: 'date';
  readonly issueDate: string;
}

/**
 * The addressee.
 *
 * Structured rather than a single free line — every field optional. A structured
 * recipient is searchable, is reusable by a future multi-recipient section, and does
 * not have to be re-parsed out of prose later. Rendering the fields into lines is the
 * section component's job (P5).
 */
export interface RecipientSectionContent {
  readonly kind: 'recipient';
  readonly name?: string;
  readonly title?: string;
  readonly organisation?: string;
}

/** The subject line. Plain text — pasted formatting is stripped. */
export interface SubjectSectionContent {
  readonly kind: 'subject';
  readonly subject: string;
}

/** The body. The only section carrying a block document. */
export interface ContentSectionContent {
  readonly kind: 'content';
  readonly body: BlockDocument;
}

/**
 * The company's signature and stamp.
 *
 * Only SELECTIONS are stored — asset identifiers owned by the existing company
 * branding system, never image data. INV-12 forbids a second signature-management
 * system, so this section never stores, uploads, crops or manages an asset; it names
 * one. P6 binds these identifiers to the existing branding hooks.
 */
export interface SignatureSectionContent {
  readonly kind: 'signature';
  readonly showSignature: boolean;
  readonly showStamp: boolean;
  readonly signatureAssetId?: string;
  readonly stampAssetId?: string;
}

/**
 * The barcode.
 *
 * Carries no payload and no image. The payload is built at render time from the
 * registration snapshot by the builder registered for the document's barcode version
 * (P6), so a reprint years later reproduces the code exactly. Storing a rendered
 * payload here would create a second copy that could drift from the snapshot.
 */
export interface BarcodeSectionContent {
  readonly kind: 'barcode';
}

export type SectionContent =
  | DateSectionContent
  | RecipientSectionContent
  | SubjectSectionContent
  | ContentSectionContent
  | SignatureSectionContent
  | BarcodeSectionContent;

/** A section as it exists in a DOCUMENT: the spec's kind, plus this letter's content. */
export interface SectionInstance {
  readonly kind: SectionKind;
  readonly content: SectionContent;
}

/* ── Queries ────────────────────────────────────────────────────────────── */

export function isSectionKind(value: unknown): value is SectionKind {
  return typeof value === 'string' && (SECTION_KINDS as readonly string[]).includes(value);
}

export function isSectionPageScope(value: unknown): value is SectionPageScope {
  return typeof value === 'string' && (SECTION_PAGE_SCOPES as readonly string[]).includes(value);
}

/** The spec for a kind within an ordered spec list, if the template declares it. */
export function findSectionSpec(
  specs: readonly SectionSpec[],
  kind: SectionKind,
): SectionSpec | undefined {
  return specs.find((s) => s.kind === kind);
}

/** This document's instance of a section kind, if present. */
export function findSectionInstance(
  sections: readonly SectionInstance[],
  kind: SectionKind,
): SectionInstance | undefined {
  return sections.find((s) => s.kind === kind);
}

/**
 * Does a section instance's content payload match its declared kind?
 *
 * A cheap guard that catches the one mistake this two-shape design invites — a
 * section labelled `subject` carrying a `date` payload — before a renderer narrows on
 * `kind` and reads a field that is not there.
 */
export function sectionInstanceIsConsistent(instance: SectionInstance): boolean {
  return instance.kind === instance.content.kind;
}
