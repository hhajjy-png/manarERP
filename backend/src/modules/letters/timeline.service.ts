/**
 * Letter Engine — the document timeline.
 *
 * One event per status transition, plus one per archive and unarchive. Structure only
 * in this pack: events are WRITTEN, and nothing reads them yet — no endpoint, no UI.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THIS EXISTS WHEN THE COLUMNS ALREADY HOLD THE SAME DATA
 * ══════════════════════════════════════════════════════════════════════════
 * `registeredAt`, `archivedAt` and `cancelledAt` hold the CURRENT state: who did it
 * last, and when. The timeline holds the HISTORY. A letter archived, unarchived, then
 * archived again is three events but only one surviving pair of columns — and
 * unarchiving CLEARS that pair, so without the timeline the earlier archiving would
 * vanish without trace.
 *
 * That is the whole justification, and it is why the writes below are not optional
 * decoration: they are the only durable record that a reversible action ever happened.
 *
 * ── EVENTS ARE WRITTEN INSIDE THE CALLER'S TRANSACTION ───────────────────
 * Every recorder takes a Prisma client, so the caller can pass its transaction. An
 * event written outside the transaction that caused it could survive a rollback and
 * describe something that never happened.
 */

import type { Prisma, PrismaClient } from '@prisma/client';
import type { LetterStatus } from './lifecycle';

/**
 * The kinds of event the timeline records.
 *
 * `PRINTED` and `SUPERSEDED` are declared but never written by this pack — the
 * transitions that produce them belong to later packs. Declaring them now means those
 * packs add a call, not a new event vocabulary.
 */
export const TIMELINE_EVENT_TYPES = [
  'CREATED',
  'REGISTERED',
  /**
   * The NUMBER's own event, recorded alongside `REGISTERED`.
   *
   * Deliberately separate rather than folded into it. `REGISTERED` is a status
   * transition of the document; `REFERENCE_ASSIGNED` is the moment a permanent number
   * left the register and became unusable by anything else. They coincide today, and a
   * future scheme that pre-allocates or re-issues would break that coincidence — at
   * which point a register audit that had been reading `REGISTERED` would be reading
   * the wrong event. Recording both now costs one row and keeps the number's history
   * legible on its own terms.
   */
  'REFERENCE_ASSIGNED',
  'PRINTED',
  'SUPERSEDED',
  'CANCELLED',
  'ARCHIVED',
  'UNARCHIVED',
  /**
   * Signature and stamp are REVERSIBLE selections, which is exactly why they need
   * timeline rows: the letter carries only the current choice, so without these the
   * fact that a different signature was once selected would vanish silently — the same
   * reasoning that justifies ARCHIVED/UNARCHIVED above.
   */
  'SIGNATURE_ADDED',
  'SIGNATURE_REMOVED',
  'STAMP_ADDED',
  'STAMP_REMOVED',
] as const;

export type TimelineEventType = (typeof TIMELINE_EVENT_TYPES)[number];

export const TIMELINE_EVENT_LABELS_AR: Readonly<Record<TimelineEventType, string>> = {
  CREATED: 'إنشاء المسودة',
  REGISTERED: 'تسجيل وإصدار رقم مرجعي',
  REFERENCE_ASSIGNED: 'تخصيص رقم مرجعي',
  PRINTED: 'طباعة',
  SUPERSEDED: 'استبدال',
  CANCELLED: 'إلغاء',
  ARCHIVED: 'أرشفة',
  UNARCHIVED: 'إلغاء الأرشفة',
  SIGNATURE_ADDED: 'إضافة توقيع',
  SIGNATURE_REMOVED: 'إزالة توقيع',
  STAMP_ADDED: 'إضافة ختم',
  STAMP_REMOVED: 'إزالة ختم',
};

export function isTimelineEventType(value: unknown): value is TimelineEventType {
  return typeof value === 'string' && (TIMELINE_EVENT_TYPES as readonly string[]).includes(value);
}

/** Who acted — a text snapshot, never a foreign key. */
export interface TimelineActor {
  readonly id?: number | null;
  readonly name?: string | null;
}

export interface RecordEventInput {
  readonly letterId: number;
  readonly eventType: TimelineEventType;
  /** Both null for archive/unarchive — those change a flag, not the status. */
  readonly fromStatus?: LetterStatus | null;
  readonly toStatus?: LetterStatus | null;
  /** The reference at the time of the event, where one exists. */
  readonly reference?: string | null;
  /** Mandatory for cancellation; absent otherwise. */
  readonly reason?: string | null;
  readonly actor?: TimelineActor;
  readonly occurredAt?: Date;
}

/** Any client that can write the table — the shared Prisma client or a transaction. */
type TimelineClient = PrismaClient | Prisma.TransactionClient;

/**
 * Append one event.
 *
 * Append-only by construction: this module exposes no update and no delete. Timeline
 * rows are removed only by the letter's own cascade, and the only deletable letter is
 * an unnumbered draft.
 */
export async function recordEvent(client: TimelineClient, input: RecordEventInput): Promise<void> {
  await client.letterTimelineEvent.create({
    data: {
      letterId: input.letterId,
      eventType: input.eventType,
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus ?? null,
      reference: input.reference ?? null,
      reason: input.reason ?? null,
      actorId: input.actor?.id ?? null,
      actorName: input.actor?.name ?? null,
      ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
    },
  });
}

/**
 * A letter's events, oldest first.
 *
 * No route exposes this in the current pack — it exists so the structure is complete
 * and testable, and so a later pack adds a controller rather than a data layer.
 */
export async function listEvents(client: TimelineClient, letterId: number) {
  return client.letterTimelineEvent.findMany({
    where: { letterId },
    orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
  });
}
