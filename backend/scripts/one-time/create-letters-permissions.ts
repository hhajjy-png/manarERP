/**
 * One-time repair — create the `letters.*` Permission rows.
 *
 * WHY THIS EXISTS
 * The Letter Engine's permission keys were declared correctly in `config/constants.ts`
 * and in `prisma/seed.ts` when P1 landed, but the seed was never re-run against the
 * live database — the same deployment gap that left P1's migration unapplied and
 * produced the HTTP 400. The keys therefore existed in code and nowhere else.
 *
 * The consequence was invisible to an administrator: `SYSTEM_ADMIN` bypasses RBAC
 * entirely, so the module worked for the only person likely to test it, while no other
 * role could ever be granted access and the roles screen offered no letters checkboxes
 * to tick.
 *
 * WHY NOT JUST RUN `npm run db:seed`
 * The seed does much more than permissions — including upserting the default
 * administrator — and running all of it against a live database with real business
 * data to obtain seven rows is a far wider blast radius than the repair needs.
 *
 * WHAT THIS DOES AND DOES NOT DO
 * Creates the seven Permission rows, using the same `upsert` the seed uses, so running
 * it twice is harmless. It grants them to NO role, exactly as `seed.ts` does not: which
 * role should send official correspondence is an administrative decision, not a
 * migration's to make. Nothing is updated and nothing is deleted.
 *
 * The action list below is the one in `prisma/seed.ts` and must stay identical to it;
 * it matches the seven routes in `modules/letters/letters.routes.ts` one for one.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const MODULE = 'letters';
const ACTIONS: Readonly<Record<string, string>> = {
  read: 'عرض',
  create: 'إضافة',
  update: 'تعديل',
  delete: 'حذف',
  register: 'تسجيل',
  archive: 'أرشفة',
  cancel: 'إلغاء',
};

async function main() {
  const before = await prisma.permission.count({ where: { key: { startsWith: `${MODULE}.` } } });
  console.log(`letters.* rows before: ${before}`);

  for (const [action, labelAr] of Object.entries(ACTIONS)) {
    const key = `${MODULE}.${action}`;
    await prisma.permission.upsert({
      where: { key },
      update: {}, // never overwrite an existing row
      create: { key, module: MODULE, action, description: `${labelAr} - ${MODULE}` },
    });
    console.log(`  ✓ ${key}`);
  }

  const after = await prisma.permission.findMany({
    where: { key: { startsWith: `${MODULE}.` } },
    select: { key: true },
    orderBy: { key: 'asc' },
  });
  console.log(`letters.* rows after: ${after.length} — ${after.map((p) => p.key).join(', ')}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
