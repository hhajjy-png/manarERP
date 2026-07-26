import { prisma } from './src/config/database';

async function main() {
  const logs = await prisma.auditLog.findMany({ where: { action: 'BACKFILL', module: 'cheques' } });
  const ids = logs.map((l) => Number(l.entityId)).sort((a, b) => a - b);
  const cheques = await prisma.cheque.findMany({ where: { id: { in: ids } }, orderBy: { id: 'asc' } });

  console.log('Total backfilled cheques:', cheques.length);
  const pvSet = new Set<string>();
  let allPrinted = true;
  for (const c of cheques) {
    if (c.status !== 'PRINTED') allPrinted = false;
    if (c.paymentVoucherNumber) pvSet.add(c.paymentVoucherNumber);
    console.log(JSON.stringify({ id: c.id, chequeNumber: c.chequeNumber, beneficiaryName: c.beneficiaryName, bankName: c.bankName, amount: c.amount, chequeDate: c.chequeDate, status: c.status, paymentVoucherNumber: c.paymentVoucherNumber }));
  }
  console.log('All PRINTED:', allPrinted);
  console.log('Distinct PV numbers:', pvSet.size, '(expected 26)');
  console.log('PV range:', Math.min(...[...pvSet].map((p) => parseInt(p.replace('PV-', ''), 10))), '-', Math.max(...[...pvSet].map((p) => parseInt(p.replace('PV-', ''), 10))));

  const total = await prisma.cheque.count();
  const distinctNumbers = new Set((await prisma.cheque.findMany({ select: { chequeNumber: true } })).map((c) => c.chequeNumber)).size;
  console.log('Total cheques in DB:', total, ' Distinct chequeNumbers overall:', distinctNumbers, '(no duplicates if equal)');

  const testCheque = await prisma.cheque.findUnique({ where: { id: 19 } });
  console.log('Test cheque id=19:', JSON.stringify(testCheque));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
