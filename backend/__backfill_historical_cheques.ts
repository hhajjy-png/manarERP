/**
 * One-time historical backfill: adds the printed cheques recorded in
 * "كشف صرف الشيكات .xlsx" (Sheet1) to the existing Cheque table.
 *
 * Not a feature — no route, no UI, no persistent import mechanism. Run once via
 * `npx tsx __backfill_historical_cheques.ts` from backend/, then delete.
 *
 * Rules enforced:
 * - Idempotent: re-running skips any chequeNumber already present in the DB.
 * - Payment Voucher numbers reuse the exact production sequence
 *   (Setting "finance.paymentVoucher.lastSequence", format PV-000001) via the
 *   same read-increment-write transaction shape as
 *   ChequesService.getOrCreatePaymentVoucherNumber — never a new counter.
 * - No accounting/ledger/expense side effects: Cheque rows have no GL wiring
 *   (verified: no Prisma middleware, no service call in the write path).
 */
import ExcelJS from 'exceljs';
import { prisma } from './src/config/database';
import { roundMoney } from './src/shared/utils/money';

const SOURCE_FILE = 'C:\\Users\\hhajj\\Claude\\Projects\\manarERP\\frontend\\src\\assets\\كشف صرف الشيكات .xlsx';
const PV_SETTING_KEY = 'finance.paymentVoucher.lastSequence';

interface SourceRow {
  rowNumber: number;
  chequeNumber: string;
  beneficiaryName: string;
  bankName: string;
  amount: number;
  chequeDate: Date;
}

interface ResultRow extends SourceRow {
  outcome: 'INSERTED' | 'SKIPPED_DUPLICATE';
  chequeId?: number;
  paymentVoucherNumber?: string;
  existingId?: number;
  existingPaymentVoucherNumber?: string | null;
}

async function readSourceRows(): Promise<SourceRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(SOURCE_FILE);
  const sheet = wb.getWorksheet('Sheet1');
  if (!sheet) throw new Error('Sheet1 not found in source workbook');

  const rows: SourceRow[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const values = row.values as unknown[]; // index 0 unused, 1=A..5=E per header row
    const chequeNumberRaw = values[1];
    const beneficiaryRaw = values[2];
    const bankRaw = values[3];
    const amountRaw = values[4];
    const dateRaw = values[5];

    const isBlankRow = chequeNumberRaw == null && beneficiaryRaw == null && bankRaw == null && amountRaw == null && dateRaw == null;
    if (isBlankRow) continue;

    if (chequeNumberRaw == null || beneficiaryRaw == null || bankRaw == null || amountRaw == null || dateRaw == null) {
      throw new Error(`Row ${r}: incomplete data — chequeNumber=${chequeNumberRaw}, beneficiary=${beneficiaryRaw}, bank=${bankRaw}, amount=${amountRaw}, date=${dateRaw}`);
    }

    const chequeNumber = String(chequeNumberRaw).trim();
    const beneficiaryName = String(beneficiaryRaw).trim();
    const bankName = String(bankRaw).trim();
    const amount = typeof amountRaw === 'number' ? amountRaw : Number(amountRaw);
    const chequeDate = dateRaw instanceof Date ? dateRaw : new Date(String(dateRaw));

    if (!chequeNumber) throw new Error(`Row ${r}: empty cheque number`);
    if (!beneficiaryName) throw new Error(`Row ${r}: empty beneficiary name`);
    if (!bankName) throw new Error(`Row ${r}: empty bank name`);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error(`Row ${r}: invalid amount ${amountRaw}`);
    if (Number.isNaN(chequeDate.getTime())) throw new Error(`Row ${r}: invalid date ${dateRaw}`);

    rows.push({ rowNumber: r, chequeNumber, beneficiaryName, bankName, amount, chequeDate });
  }
  return rows;
}

async function backfillOne(row: SourceRow): Promise<ResultRow> {
  const existing = await prisma.cheque.findUnique({ where: { chequeNumber: row.chequeNumber } });
  if (existing) {
    return {
      ...row,
      outcome: 'SKIPPED_DUPLICATE',
      existingId: existing.id,
      existingPaymentVoucherNumber: existing.paymentVoucherNumber,
    };
  }

  const result = await prisma.$transaction(async (tx) => {
    // Re-check inside the transaction — mirrors ChequesService's own guard against
    // a race between the pre-check above and this write.
    const fresh = await tx.cheque.findUnique({ where: { chequeNumber: row.chequeNumber } });
    if (fresh) {
      return { alreadyExists: true as const, existing: fresh };
    }

    const setting = await tx.setting.findUnique({ where: { key: PV_SETTING_KEY } });
    const lastSeq = setting ? parseInt(setting.value, 10) : 0;
    const nextSeq = Number.isNaN(lastSeq) ? 1 : lastSeq + 1;
    const paymentVoucherNumber = `PV-${String(nextSeq).padStart(6, '0')}`;

    const cheque = await tx.cheque.create({
      data: {
        chequeNumber: row.chequeNumber,
        chequeDate: row.chequeDate,
        beneficiaryName: row.beneficiaryName,
        amount: roundMoney(row.amount),
        currency: 'KWD',
        bankName: row.bankName,
        status: 'PRINTED',
        // Historical prints predate this system; the cheque date is the best
        // available approximation of when it was actually printed/issued.
        printedAt: row.chequeDate,
        printCount: 1,
        paymentVoucherNumber,
      },
    });

    await tx.setting.upsert({
      where: { key: PV_SETTING_KEY },
      update: { value: String(nextSeq) },
      create: { key: PV_SETTING_KEY, value: String(nextSeq), group: 'finance' },
    });

    await tx.auditLog.create({
      data: {
        userId: null,
        action: 'BACKFILL',
        module: 'cheques',
        entityId: String(cheque.id),
        newValue: JSON.stringify({
          source: 'كشف صرف الشيكات .xlsx / Sheet1',
          sourceRow: row.rowNumber,
          chequeNumber: cheque.chequeNumber,
          beneficiaryName: cheque.beneficiaryName,
          bankName: cheque.bankName,
          amount: cheque.amount,
          chequeDate: cheque.chequeDate,
          status: cheque.status,
          paymentVoucherNumber: cheque.paymentVoucherNumber,
        }),
        ipAddress: null,
      },
    });

    return { alreadyExists: false as const, cheque, paymentVoucherNumber };
  });

  if (result.alreadyExists) {
    return {
      ...row,
      outcome: 'SKIPPED_DUPLICATE',
      existingId: result.existing.id,
      existingPaymentVoucherNumber: result.existing.paymentVoucherNumber,
    };
  }

  return {
    ...row,
    outcome: 'INSERTED',
    chequeId: result.cheque.id,
    paymentVoucherNumber: result.paymentVoucherNumber,
  };
}

async function main() {
  const sourceRows = await readSourceRows();

  // Chronological order (oldest first) so PV numbers increase with cheque date,
  // consistent with how they'd have been issued via the normal Print flow.
  sourceRows.sort((a, b) => a.chequeDate.getTime() - b.chequeDate.getTime() || a.rowNumber - b.rowNumber);

  const beforeSetting = await prisma.setting.findUnique({ where: { key: PV_SETTING_KEY } });
  const beforeSeq = beforeSetting ? parseInt(beforeSetting.value, 10) : 0;

  const results: ResultRow[] = [];
  for (const row of sourceRows) {
    // Sequential on purpose — the PV sequence must advance one at a time, no interleaving.
    const result = await backfillOne(row);
    results.push(result);
  }

  const afterSetting = await prisma.setting.findUnique({ where: { key: PV_SETTING_KEY } });
  const afterSeq = afterSetting ? parseInt(afterSetting.value, 10) : 0;

  const inserted = results.filter((r) => r.outcome === 'INSERTED');
  const skipped = results.filter((r) => r.outcome === 'SKIPPED_DUPLICATE');

  console.log('='.repeat(80));
  console.log('BACKFILL REPORT');
  console.log('='.repeat(80));
  console.log(`Source rows: ${sourceRows.length}`);
  console.log(`Inserted:    ${inserted.length}`);
  console.log(`Skipped:     ${skipped.length}`);
  console.log(`PV sequence before: ${beforeSeq}  after: ${afterSeq}`);
  console.log('');
  console.log('-- INSERTED --');
  for (const r of inserted) {
    console.log(`row=${r.rowNumber} chequeId=${r.chequeId} chequeNumber=${r.chequeNumber} beneficiary=${r.beneficiaryName} bank=${r.bankName} amount=${r.amount} date=${r.chequeDate.toISOString().slice(0, 10)} pv=${r.paymentVoucherNumber}`);
  }
  console.log('');
  console.log('-- SKIPPED (duplicate chequeNumber already in DB) --');
  for (const r of skipped) {
    console.log(`row=${r.rowNumber} chequeNumber=${r.chequeNumber} existingId=${r.existingId} existingPv=${r.existingPaymentVoucherNumber}`);
  }

  console.log('');
  console.log('JSON_RESULT_START');
  console.log(JSON.stringify({ sourceRows: sourceRows.length, inserted: inserted.length, skipped: skipped.length, beforeSeq, afterSeq, results }, null, 2));
  console.log('JSON_RESULT_END');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('BACKFILL FAILED:', e);
    process.exit(1);
  });
