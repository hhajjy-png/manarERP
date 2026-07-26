/**
 * One-time correction: the previous historical backfill (see
 * __backfill_historical_cheques.ts) stored chequeNumber as the raw Excel value
 * (e.g. "59"), but the real cheque number format is 6 digits with leading
 * zeros (e.g. "000059"). This script zero-pads chequeNumber to 6 digits for
 * ONLY the 26 cheques created by that backfill — identified precisely via
 * their BACKFILL AuditLog entries, not by assuming an id range.
 *
 * Scope: chequeNumber field only. Nothing else (beneficiary, bank, amount,
 * date, status, paymentVoucherNumber) is touched. No new AuditLog/accounting
 * rows — this is a data-correction pass on the current session's own backfill.
 */
import { prisma } from './src/config/database';

async function main() {
  const backfillLogs = await prisma.auditLog.findMany({
    where: { action: 'BACKFILL', module: 'cheques' },
    orderBy: { entityId: 'asc' },
  });

  if (backfillLogs.length !== 26) {
    throw new Error(`Expected exactly 26 BACKFILL audit log entries for cheques, found ${backfillLogs.length}. Aborting — refusing to guess scope.`);
  }

  const targetIds = backfillLogs.map((l) => Number(l.entityId)).sort((a, b) => a - b);

  const cheques = await prisma.cheque.findMany({
    where: { id: { in: targetIds } },
    orderBy: { id: 'asc' },
  });

  if (cheques.length !== 26) {
    throw new Error(`Expected 26 cheques for the backfilled ids, found ${cheques.length}. Aborting.`);
  }

  const PAD_LEN = 6;
  const plan = cheques.map((c) => {
    const before = c.chequeNumber;
    const after = before.padStart(PAD_LEN, '0');
    return { id: c.id, before, after, unchanged: before === after };
  });

  // Sanity: the new value must actually be 6 digits (defends against a
  // longer-than-6 raw value slipping through unexpectedly).
  for (const p of plan) {
    if (p.after.length !== PAD_LEN) {
      throw new Error(`Cheque id=${p.id}: "${p.before}" -> "${p.after}" is not ${PAD_LEN} digits after padStart. Aborting — source data doesn't match the assumed 2-digit-raw / 6-digit-real invariant.`);
    }
  }

  // Collision check: the new (padded) chequeNumber must not already exist on
  // any OTHER cheque (including the untouched "1112" row and any other
  // pre-existing record).
  const collisions: { id: number; after: string; collidesWithId: number }[] = [];
  for (const p of plan) {
    if (p.unchanged) continue;
    const existing = await prisma.cheque.findUnique({ where: { chequeNumber: p.after } });
    if (existing && existing.id !== p.id) {
      collisions.push({ id: p.id, after: p.after, collidesWithId: existing.id });
    }
  }
  if (collisions.length > 0) {
    console.error('COLLISIONS DETECTED — aborting without writing:', collisions);
    process.exit(1);
  }

  // Also guard against collisions WITHIN the batch itself (two source rows
  // padding to the same 6-digit value).
  const afterValues = plan.map((p) => p.after);
  const dupWithinBatch = afterValues.filter((v, i) => afterValues.indexOf(v) !== i);
  if (dupWithinBatch.length > 0) {
    console.error('DUPLICATE target values within the batch — aborting:', dupWithinBatch);
    process.exit(1);
  }

  const results: { id: number; before: string; after: string; status: 'UPDATED' | 'SKIPPED_UNCHANGED' }[] = [];

  for (const p of plan) {
    if (p.unchanged) {
      results.push({ id: p.id, before: p.before, after: p.after, status: 'SKIPPED_UNCHANGED' });
      continue;
    }
    await prisma.$transaction(async (tx) => {
      // Re-check inside the transaction immediately before writing.
      const clash = await tx.cheque.findUnique({ where: { chequeNumber: p.after } });
      if (clash && clash.id !== p.id) {
        throw new Error(`Race: chequeNumber "${p.after}" now used by id=${clash.id} (target id=${p.id})`);
      }
      await tx.cheque.update({
        where: { id: p.id },
        data: { chequeNumber: p.after },
      });
    });
    results.push({ id: p.id, before: p.before, after: p.after, status: 'UPDATED' });
  }

  // ── Final verification ──────────────────────────────────────────────────
  const finalCheques = await prisma.cheque.findMany({
    where: { id: { in: targetIds } },
    orderBy: { id: 'asc' },
  });

  const allSixDigits = finalCheques.every((c) => /^\d{6}$/.test(c.chequeNumber));
  const distinctCount = new Set(finalCheques.map((c) => c.chequeNumber)).size;
  const totalChequeCount = await prisma.cheque.count();
  const untouchedTestCheque = await prisma.cheque.findUnique({ where: { id: 19 } });

  console.log('='.repeat(80));
  console.log('CHEQUE NUMBER CORRECTION REPORT');
  console.log('='.repeat(80));
  console.log(`Target cheques (from BACKFILL audit log): ${targetIds.length}`);
  console.log('');
  console.log('-- Before -> After --');
  for (const r of results) {
    console.log(`id=${r.id}  ${r.before.padEnd(6)} -> ${r.after}  [${r.status}]`);
  }
  console.log('');
  console.log(`All 26 now 6-digit numeric: ${allSixDigits}`);
  console.log(`Distinct chequeNumber values among the 26: ${distinctCount} (expected 26)`);
  console.log(`Total cheques in DB: ${totalChequeCount} (expected 27 — unchanged)`);
  console.log(`Test cheque id=19 chequeNumber (must stay "1112"): ${untouchedTestCheque?.chequeNumber}`);

  console.log('');
  console.log('JSON_RESULT_START');
  console.log(JSON.stringify({ results, allSixDigits, distinctCount, totalChequeCount, testChequeUnchanged: untouchedTestCheque?.chequeNumber === '1112' }, null, 2));
  console.log('JSON_RESULT_END');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('CORRECTION FAILED:', e);
    process.exit(1);
  });
