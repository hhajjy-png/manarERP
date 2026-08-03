/**
 * Letter Engine — the reference number allocator and the official register.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  REFERENCE NUMBERS ARE PERMANENT. SEQUENTIAL, NEVER REUSED, NEVER RECYCLED.
 *  A CANCELLED NUMBER STAYS RESERVED FOR EVER.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── WHERE THE GUARANTEE ACTUALLY LIVES ───────────────────────────────────
 * In the database, not here. `letter_references` carries two UNIQUE constraints —
 * on `reference`, and on `(templateKey, year, sequence)` — and those are what make a
 * duplicate number impossible. This module's job is to make the common path correct
 * and to turn a constraint violation into a retry rather than a crash.
 *
 * That distinction matters because application-level uniqueness checks are always
 * wrong under concurrency: any `SELECT MAX(sequence) + 1` has a window between the
 * read and the write in which a second caller reads the same maximum. So the counter
 * is advanced INSIDE a transaction, the insert is attempted, and if the database
 * rejects it the whole thing is retried against the new state.
 *
 * ── THE RESTORE HAZARD (the most dangerous failure mode in the engine) ────
 * The counter is not the source of truth; the register is. Restoring a backup taken
 * before letters 120–125 were issued would rewind `lastValue` to 119, and the next
 * five letters would reuse reference numbers already printed on paper delivered to
 * third parties. `reconcileSequences()` closes that hole by raising every counter to
 * the highest sequence actually present in the register. It runs at service startup
 * and must also run after any backup restore.
 *
 * ── GAPS ARE NORMAL AND MUST BE VISIBLE ──────────────────────────────────
 * A number allocated to a letter that is later cancelled stays allocated. In an
 * official register an unexplained gap is a finding; an explained gap is routine. So
 * cancellation records a reason and `listGaps()` reports every missing or cancelled
 * sequence rather than hiding it.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@config/database';
import { logger } from '@core/utils/logger';
import { AppError } from '@core/errors/AppError';
import { formatReference, referencePrefixFor } from './letterTemplates.constants';

/** Status values a register row may carry. */
export const REFERENCE_STATUSES = ['ALLOCATED', 'CANCELLED'] as const;
export type ReferenceStatus = (typeof REFERENCE_STATUSES)[number];

/** Who performed an allocation — a text snapshot, never a foreign key. */
export interface ActorRef {
  readonly id?: number | null;
  readonly name?: string | null;
}

export interface AllocatedReference {
  readonly reference: string;
  readonly templateKey: string;
  readonly year: number;
  readonly sequence: number;
}

/**
 * How many times an allocation is retried when the database rejects it.
 *
 * A retry happens only when two callers raced for the same sequence; the loser reads
 * the advanced counter and takes the next slot. Three attempts is generous for an
 * application with effectively one writer, and a bounded loop guarantees a failed
 * allocation surfaces as an error rather than spinning.
 */
const MAX_ALLOCATION_ATTEMPTS = 3;

/** Is this a unique-constraint violation from the database? */
function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * THE allocation. One implementation, used by both entry points below.
 *
 * Advances the counter and inserts the register row on whichever client it is given.
 * Kept single deliberately: two copies of this — one for standalone use and one for
 * joining a caller's transaction — could drift, and a drift in reference allocation is
 * the one bug in this module with no clean remedy after the fact.
 */
async function allocateOn(
  client: Prisma.TransactionClient,
  templateKey: string,
  year: number,
  letterId: number,
  actor: ActorRef,
): Promise<AllocatedReference> {
  const counter = await client.letterSequence.upsert({
    where: { templateKey_year: { templateKey, year } },
    update: { lastValue: { increment: 1 } },
    create: { templateKey, year, lastValue: 1 },
  });

  const sequence = counter.lastValue;
  const reference = formatReference(templateKey, year, sequence);

  // The insert the UNIQUE constraints guard. A P2002 here means the slot was taken
  // between the upsert and this line.
  await client.letterReference.create({
    data: {
      reference,
      templateKey,
      year,
      sequence,
      letterId,
      status: 'ALLOCATED',
      allocatedById: actor.id ?? null,
      allocatedByName: actor.name ?? null,
    },
  });

  return { reference, templateKey, year, sequence };
}

/**
 * Allocate within a transaction the CALLER already owns.
 *
 * No retry: the caller's transaction is doing more than allocating (binding the
 * number to a letter and freezing its snapshot), so a conflict must abort the whole
 * registration rather than silently take the next number and continue. The caller
 * retries the registration, not just the number.
 */
export async function allocateReferenceInTransaction(
  tx: Prisma.TransactionClient,
  templateKey: string,
  year: number,
  letterId: number,
  actor: ActorRef = {},
): Promise<AllocatedReference> {
  // Fails fast for an unknown template: the prefix is burned permanently into the
  // issued number, so there is no safe default.
  referencePrefixFor(templateKey);
  return allocateOn(tx, templateKey, year, letterId, actor);
}

/**
 * Allocate standalone, in its own transaction, retrying a lost race.
 *
 * Atomic: the counter advance and the register insert happen together, so a failure
 * cannot leave a consumed counter with no register row (silently skipping a number)
 * nor a register row with an unadvanced counter (handing the same number out twice).
 *
 * @param letterId the document the number is bound to. Recorded on the register row
 *                 for traceability, WITHOUT a foreign key — the register must outlive
 *                 the letter.
 */
export async function allocateReference(
  templateKey: string,
  year: number,
  letterId: number,
  actor: ActorRef = {},
): Promise<AllocatedReference> {
  referencePrefixFor(templateKey);

  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_ALLOCATION_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction((tx) => allocateOn(tx, templateKey, year, letterId, actor));
    } catch (error) {
      lastError = error;
      if (!isUniqueViolation(error)) throw error;
      logger.warn(
        `[LetterEngine] تعارض في تخصيص رقم مرجعي (${templateKey}/${year}) — إعادة المحاولة ${attempt}/${MAX_ALLOCATION_ATTEMPTS}.`,
      );
    }
  }

  logger.error('[LetterEngine] فشل تخصيص رقم مرجعي بعد استنفاد المحاولات:', lastError);
  throw AppError.conflict('تعذّر إصدار رقم مرجعي بسبب تعارض متزامن. أعد المحاولة.');
}

/**
 * Mark an allocated number cancelled. The number is NEVER returned to the pool.
 *
 * Idempotent-safe: cancelling an already-cancelled reference is refused rather than
 * silently overwriting the original reason and timestamp, which are audit evidence.
 */
export async function cancelReference(reference: string, reason: string, when: Date = new Date()): Promise<void> {
  const row = await prisma.letterReference.findUnique({ where: { reference } });
  if (!row) {
    throw AppError.notFound(`الرقم المرجعي «${reference}» غير موجود في سجل المراجع.`);
  }
  if (row.status === 'CANCELLED') {
    throw AppError.conflict(`الرقم المرجعي «${reference}» ملغى مسبقًا.`);
  }
  await prisma.letterReference.update({
    where: { reference },
    data: { status: 'CANCELLED', cancelReason: reason, cancelledAt: when },
  });
}

/** A register row, or `null`. Used to verify a stored reference really was issued. */
export async function findReference(reference: string) {
  return prisma.letterReference.findUnique({ where: { reference } });
}

/**
 * Raise every counter to the highest sequence actually recorded in the register.
 *
 * MUST run at service startup and after any backup restore. See the header: without
 * it, restoring an older backup silently re-issues reference numbers that are already
 * on delivered paper.
 *
 * Takes the MAXIMUM of the stored counter and the register's high-water mark, never
 * the register alone — a counter that is somehow ahead is still authoritative, because
 * lowering it is the one direction that can cause a collision.
 *
 * @returns the counters it had to correct, for logging and for tests.
 */
export async function reconcileSequences(): Promise<
  { templateKey: string; year: number; from: number; to: number }[]
> {
  const highWaterMarks = await prisma.letterReference.groupBy({
    by: ['templateKey', 'year'],
    _max: { sequence: true },
  });

  const corrections: { templateKey: string; year: number; from: number; to: number }[] = [];

  for (const mark of highWaterMarks) {
    const highest = mark._max.sequence ?? 0;
    const counter = await prisma.letterSequence.findUnique({
      where: { templateKey_year: { templateKey: mark.templateKey, year: mark.year } },
    });
    const current = counter?.lastValue ?? 0;
    if (current >= highest) continue;

    await prisma.letterSequence.upsert({
      where: { templateKey_year: { templateKey: mark.templateKey, year: mark.year } },
      update: { lastValue: highest },
      create: { templateKey: mark.templateKey, year: mark.year, lastValue: highest },
    });
    corrections.push({ templateKey: mark.templateKey, year: mark.year, from: current, to: highest });
  }

  if (corrections.length > 0) {
    logger.warn(
      `[LetterEngine] صُحِّحت ${corrections.length} عدّاد تسلسل بعد اكتشاف تراجعها خلف سجل المراجع ` +
        `(استعادة نسخة احتياطية على الأرجح): ` +
        corrections.map((c) => `${c.templateKey}/${c.year}: ${c.from}→${c.to}`).join('، '),
    );
  }
  return corrections;
}

/**
 * Startup wrapper for `reconcileSequences`.
 *
 * Never throws. Reconciliation is a safety net, and a net that prevents the service
 * from starting is worse than one that reports it could not run — the unique
 * constraints still stand behind it either way.
 */
export async function reconcileSequencesOnStartup(): Promise<void> {
  try {
    await reconcileSequences();
  } catch (error) {
    logger.error('[LetterEngine] تعذّرت مطابقة عدّادات التسلسل عند بدء التشغيل:', error);
  }
}

/** A missing or cancelled slot in a sequence, with the reason where one exists. */
export interface ReferenceGap {
  readonly sequence: number;
  readonly reference: string;
  readonly kind: 'MISSING' | 'CANCELLED';
  readonly reason: string | null;
}

/**
 * Every gap in a template-year's sequence.
 *
 * `MISSING`   — the slot has no register row at all. Should not occur under normal
 *               operation; its presence is worth investigating.
 * `CANCELLED` — allocated then withdrawn. Routine, and the reason explains it.
 */
export async function listGaps(templateKey: string, year: number): Promise<ReferenceGap[]> {
  const rows = await prisma.letterReference.findMany({
    where: { templateKey, year },
    orderBy: { sequence: 'asc' },
  });
  if (rows.length === 0) return [];

  const bySequence = new Map(rows.map((r) => [r.sequence, r]));
  const highest = rows[rows.length - 1].sequence;
  const gaps: ReferenceGap[] = [];

  for (let sequence = 1; sequence <= highest; sequence += 1) {
    const row = bySequence.get(sequence);
    if (!row) {
      gaps.push({
        sequence,
        reference: formatReference(templateKey, year, sequence),
        kind: 'MISSING',
        reason: null,
      });
    } else if (row.status === 'CANCELLED') {
      gaps.push({
        sequence,
        reference: row.reference,
        kind: 'CANCELLED',
        reason: row.cancelReason,
      });
    }
  }
  return gaps;
}
