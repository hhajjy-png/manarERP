import { PrismaClient } from '@prisma/client';

async function countAll(dbPath: string) {
  const prisma = new PrismaClient({ datasources: { db: { url: `file:${dbPath}` } } });
  const [cheques, settings, auditLogs, transactions, journalEntries, expenses, glEntries] = await Promise.all([
    prisma.cheque.count(),
    prisma.setting.count(),
    prisma.auditLog.count(),
    prisma.transaction.count().catch(() => -1),
    (prisma as any).journalEntry?.count().catch(() => -1) ?? -1,
    prisma.expense.count().catch(() => -1),
    (prisma as any).glEntry?.count().catch(() => -1) ?? -1,
  ]);
  await prisma.$disconnect();
  return { cheques, settings, auditLogs, transactions, journalEntries, expenses, glEntries };
}

async function main() {
  const before = await countAll('C:/Users/hhajj/Claude/Projects/manarERP/backend/data/manar.db.pre-cheque-backfill-20260726.bak');
  const after = await countAll('C:/Users/hhajj/Claude/Projects/manarERP/backend/data/manar.db');
  console.log('BEFORE:', before);
  console.log('AFTER: ', after);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
