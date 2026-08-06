/**
 * Letter Engine — version history and comments API (Professional Document
 * Automation v1).
 *
 * Thin. Every function is one request and one unwrap; there is no caching, no
 * normalisation and no optimistic state here. The panels own their own loading, for
 * the same reason `useDocumentLibrary` does: a shared cache between two panels that
 * refresh at different moments is a source of disagreement about what is current, and
 * a version list that disagrees with the document is worse than one that reloads.
 */

import { api } from './client';

/* ── Versions ───────────────────────────────────────────────────────────── */

export type VersionKind = 'AUTO' | 'NAMED' | 'PRE_RESTORE' | 'PRE_REGISTER';

export const VERSION_KIND_LABELS_AR: Readonly<Record<VersionKind, string>> = {
  AUTO: 'تلقائية',
  NAMED: 'مسمّاة',
  PRE_RESTORE: 'قبل استعادة',
  PRE_REGISTER: 'قبل التسجيل',
};

/** A row in the list. Carries no content — see `listVersions` for why. */
export interface LetterVersionSummary {
  readonly id: number;
  readonly sequence: number;
  readonly kind: VersionKind;
  readonly name: string | null;
  readonly note: string | null;
  readonly subject: string;
  readonly wordCount: number;
  readonly pageCount: number;
  readonly createdByName: string | null;
  readonly createdAt: string;
  readonly contentModelVersion: number;
}

/** One version in full — content included, for restore and for compare. */
export interface LetterVersionDetail extends LetterVersionSummary {
  readonly contentJson: string;
  readonly issueDate: string;
  readonly recipientName: string | null;
  readonly recipientTitle: string | null;
  readonly recipientOrganisation: string | null;
}

/**
 * The version list, newest first.
 *
 * The server omits `contentJson` here deliberately: a letter with thirty versions
 * would otherwise send thirty copies of the document to draw a sidebar.
 */
export async function listVersions(letterId: number): Promise<LetterVersionSummary[]> {
  const { data } = await api.get(`/letters/${letterId}/versions`);
  return (data.data ?? []) as LetterVersionSummary[];
}

export async function getVersion(letterId: number, versionId: number): Promise<LetterVersionDetail> {
  const { data } = await api.get(`/letters/${letterId}/versions/${versionId}`);
  return data.data as LetterVersionDetail;
}

/**
 * Take a snapshot.
 *
 * The CONTENT is not sent: the server reads it from the letter inside the same
 * transaction. A client-supplied snapshot could disagree with what is stored, and a
 * history that records something the letter never contained is worse than none.
 *
 * `wordCount` and `pageCount` ARE sent, because only the renderer can compute them —
 * the backend never parses the block model.
 */
export async function createVersion(
  letterId: number,
  input: { kind?: 'AUTO' | 'NAMED'; name?: string | null; note?: string | null; wordCount?: number; pageCount?: number },
): Promise<LetterVersionSummary> {
  const { data } = await api.post(`/letters/${letterId}/versions`, input);
  return data.data as LetterVersionSummary;
}

/** Restore. Refused by the server on anything but a DRAFT. */
export async function restoreVersion(letterId: number, versionId: number): Promise<void> {
  await api.post(`/letters/${letterId}/versions/${versionId}/restore`, {});
}

export async function deleteVersion(letterId: number, versionId: number): Promise<void> {
  await api.delete(`/letters/${letterId}/versions/${versionId}`);
}

/* ── Comments ───────────────────────────────────────────────────────────── */

export type CommentAnchorKind = 'block' | 'object' | 'section' | 'document';

export interface LetterComment {
  readonly id: number;
  readonly parentId: number | null;
  readonly anchorKind: CommentAnchorKind;
  readonly anchorId: string | null;
  readonly body: string;
  /** Comma-separated on the wire — a text snapshot, never foreign keys. */
  readonly mentions: string;
  readonly resolved: boolean;
  readonly resolvedByName: string | null;
  readonly resolvedAt: string | null;
  readonly createdByName: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** An opening comment with its replies — the shape the sidebar draws. */
export interface CommentThread extends LetterComment {
  readonly replies: readonly LetterComment[];
}

export async function listComments(letterId: number): Promise<CommentThread[]> {
  const { data } = await api.get(`/letters/${letterId}/comments`);
  return (data.data ?? []) as CommentThread[];
}

export async function createComment(
  letterId: number,
  input: {
    parentId?: number | null;
    anchorKind?: CommentAnchorKind;
    anchorId?: string | null;
    body: string;
    mentions?: string[];
  },
): Promise<LetterComment> {
  const { data } = await api.post(`/letters/${letterId}/comments`, input);
  return data.data as LetterComment;
}

/** Resolve or reopen. Applied to the opening comment; the server refuses a reply. */
export async function setCommentResolved(
  letterId: number,
  commentId: number,
  resolved: boolean,
): Promise<LetterComment> {
  const { data } = await api.patch(`/letters/${letterId}/comments/${commentId}`, { resolved });
  return data.data as LetterComment;
}

export async function deleteComment(letterId: number, commentId: number): Promise<void> {
  await api.delete(`/letters/${letterId}/comments/${commentId}`);
}

/**
 * Names mentioned in a comment body.
 *
 * `@name` up to the next whitespace. Parsed on READ rather than trusted from the
 * stored `mentions` column, so a body edited by any means keeps its mentions accurate —
 * the column is a denormalised convenience for future notification work, not the
 * source of truth about what the text says.
 */
export function parseMentions(body: string): string[] {
  const found = body.match(/@([^\s@]+)/g) ?? [];
  return [...new Set(found.map((mention) => mention.slice(1)))];
}
