/**
 * Letter Engine — typed API client for the workspace.
 *
 * The one place the workspace talks to the backend. Every list parameter is sent to
 * the server and NONE of the returned rows are filtered, sorted or paginated in the
 * browser: the server owns all four, so what the pager says is the size of the real
 * result set rather than the size of whatever happened to be downloaded.
 *
 * The row shape mirrors the backend's response deliberately. It is NOT the P0
 * `LetterDocument` model — that is the editing model, carrying sections and a block
 * document, and the workspace has no editor and never loads one. Conflating them would
 * pull the whole document model into a list screen that needs eleven columns.
 */

import { api } from './client';

/** Status vocabulary — mirrors the backend lifecycle. Archiving is NOT a member. */
export const LETTER_STATUSES = ['DRAFT', 'REGISTERED', 'PRINTED', 'SUPERSEDED', 'CANCELLED'] as const;
export type LetterStatus = (typeof LETTER_STATUSES)[number];

export const LETTER_STATUS_LABEL_AR: Readonly<Record<LetterStatus, string>> = {
  DRAFT: 'مسودة',
  REGISTERED: 'مُسجّل',
  PRINTED: 'مطبوع',
  SUPERSEDED: 'مُستبدَل',
  CANCELLED: 'ملغى',
};

/** Chip colour per status — read by the workspace, defined once here. */
export const LETTER_STATUS_TONE: Readonly<Record<LetterStatus, 'neutral' | 'blue' | 'green' | 'orange' | 'red'>> = {
  DRAFT: 'neutral',
  REGISTERED: 'blue',
  PRINTED: 'green',
  SUPERSEDED: 'orange',
  CANCELLED: 'red',
};

export interface ActorRef {
  id: number | null;
  name: string | null;
}

/** One row as the list returns it. */
export interface LetterListItem {
  id: number;
  templateKey: string;
  status: LetterStatus;
  isArchived: boolean;
  reference: string | null;
  issueDate: string;
  recipient: { name: string | null; title: string | null; organisation: string | null };
  subject: string;
  createdBy: ActorRef;
  registeredBy: ActorRef;
  registeredAt: string | null;
  archivedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PageMetaDto {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface LetterListResponse {
  items: LetterListItem[];
  meta: PageMetaDto;
}

/**
 * Everything the list can be narrowed by.
 *
 * A single flat object so it can be persisted and restored wholesale — which is what
 * "remember filters" in the workspace amounts to.
 */
export interface LetterListQuery {
  search?: string;
  /** Multiple statuses are OR-ed by the server. */
  statuses?: LetterStatus[];
  /** `undefined` ⇒ both archived and unarchived. */
  isArchived?: boolean;
  registrationState?: 'registered' | 'unregistered';
  issueDateFrom?: string;
  issueDateTo?: string;
  createdFrom?: string;
  createdTo?: string;
  createdBy?: string;
  registeredBy?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

/**
 * Serialise the query.
 *
 * Empty values are OMITTED rather than sent blank, so the request URL says exactly
 * what is being asked and an unfiltered list is a bare request.
 */
export function toQueryParams(query: LetterListQuery): Record<string, string> {
  const params: Record<string, string> = {};
  const put = (key: string, value: string | undefined) => {
    if (value !== undefined && value !== '') params[key] = value;
  };

  put('search', query.search?.trim());
  if (query.statuses && query.statuses.length > 0) params.status = query.statuses.join(',');
  if (query.isArchived !== undefined) params.isArchived = String(query.isArchived);
  put('registrationState', query.registrationState);
  put('issueDateFrom', query.issueDateFrom);
  put('issueDateTo', query.issueDateTo);
  put('createdFrom', query.createdFrom);
  put('createdTo', query.createdTo);
  put('createdBy', query.createdBy?.trim());
  put('registeredBy', query.registeredBy?.trim());
  put('sortBy', query.sortBy);
  put('sortDir', query.sortDir);
  if (query.page) params.page = String(query.page);
  if (query.pageSize) params.pageSize = String(query.pageSize);

  return params;
}

export async function listLetters(query: LetterListQuery): Promise<LetterListResponse> {
  const { data } = await api.get('/letters', { params: toQueryParams(query) });
  return data.data as LetterListResponse;
}

export async function createDraft(): Promise<LetterListItem> {
  const { data } = await api.post('/letters', {});
  return data.data as LetterListItem;
}

/**
 * The registration snapshot the server freezes.
 *
 * Assembled by the composer, because only the renderer knows these values. The shape
 * mirrors `backend/src/modules/letters/snapshot.ts`, which validates it strictly and
 * rejects any unrecognised key.
 */
export interface RegistrationSnapshotPayload {
  blockTypography: Record<string, { fontId: string; sizePt: number; weight: number; lineHeight: number }>;
  issueDate: string;
  subject: string;
  barcodePayload: string;
  geometryMm: Record<string, number>;
  pageCount: number;
  signature: { assetId: string; name: string; imageUrl: string } | null;
  stamp: { assetId: string; name: string; imageUrl: string } | null;
}

/**
 * Placeholder the payload carries where the reference will go.
 *
 * Registration is the moment the number is created, so the client cannot know it while
 * building the snapshot. The server rewrites this token with the number it allocates,
 * inside the same transaction — which is the only place that can be done correctly,
 * and the reason the client must not invent a number of its own.
 */
export const PENDING_REFERENCE = '__PENDING__';

/**
 * Register a draft: issue its permanent reference and freeze its snapshot.
 *
 * One call to the existing endpoint. No allocation logic lives on the client.
 */
export async function registerLetter(
  id: number,
  snapshot: RegistrationSnapshotPayload,
): Promise<LetterListItem & { reference: string | null }> {
  const { data } = await api.post(`/letters/${id}/register`, { snapshot });
  return data.data;
}

export async function archiveLetter(id: number): Promise<void> {
  await api.post(`/letters/${id}/archive`, {});
}

export async function unarchiveLetter(id: number): Promise<void> {
  await api.post(`/letters/${id}/unarchive`, {});
}

export async function cancelLetter(id: number, reason: string): Promise<void> {
  await api.post(`/letters/${id}/cancel`, { reason });
}

export async function deleteDraft(id: number): Promise<void> {
  await api.delete(`/letters/${id}`);
}

/** One letter's outcome in a bulk request — the server reports each individually. */
export interface BulkOutcome {
  id: number;
  ok: boolean;
  reason?: string;
}

export interface BulkResult {
  succeeded: number[];
  failed: BulkOutcome[];
}

export async function bulkArchive(ids: number[]): Promise<BulkResult> {
  const { data } = await api.post('/letters/bulk-archive', { ids });
  return data.data as BulkResult;
}

export async function bulkUnarchive(ids: number[]): Promise<BulkResult> {
  const { data } = await api.post('/letters/bulk-unarchive', { ids });
  return data.data as BulkResult;
}

/* ── Row capability rules (mirrors of the backend lifecycle) ───────────────
   The server is the authority and refuses anything illegal regardless of what the
   UI shows. These exist so an action the server WOULD refuse is never offered in the
   first place — a disabled-looking menu the user cannot explain is worse than an
   absent one. They must stay in step with `backend/src/modules/letters/lifecycle.ts`. */

export function canOpen(): boolean {
  return true;
}

/** Draft only — a registered document has consumed a permanent number. */
export function canDeleteDraft(row: LetterListItem): boolean {
  return row.status === 'DRAFT';
}

/** Anything not cancelled, in whichever direction the flag is not already pointing. */
export function canArchive(row: LetterListItem): boolean {
  return row.status !== 'CANCELLED' && !row.isArchived;
}

export function canUnarchive(row: LetterListItem): boolean {
  return row.status !== 'CANCELLED' && row.isArchived;
}

/** Every non-draft state — a draft holds no number, so there is nothing to withdraw. */
export function canCancel(row: LetterListItem): boolean {
  return row.status !== 'DRAFT' && row.status !== 'CANCELLED';
}
