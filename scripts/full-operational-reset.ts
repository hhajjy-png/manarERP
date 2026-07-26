/**
 * scripts/full-operational-reset.ts
 *
 * One-time full operational data reset for manarERP.
 *
 * PRESERVES: users, roles, permissions, role_permissions,
 *            settings, audit_logs, backups, accounts
 *
 * CLEARS: all business/operational data (customers, contracts, invoices,
 *         expenses, employees, payroll, equipment, inventory, cheques,
 *         project_prices, transactions, journal_entries, suppliers, ...)
 *
 * Run from project root:
 *   cd backend && npx tsx ../scripts/full-operational-reset.ts
 *
 * PREREQUISITE: pre-reset backup must exist in backend/data/backups/
 *               before this script is invoked.
 */

import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

// ── Environment ─────────────────────────────────────────────────────────────
// Run from backend/ so dotenv.config() picks up backend/.env automatically
dotenv.config();

const PROJECT_ROOT = path.resolve(process.cwd(), '..');
const BACKUP_DIR = path.join(process.cwd(), 'data', 'backups');
const DB_PATH = path.join(process.cwd(), 'data', 'manar.db');
const PRE_RESET_BACKUP_NAME = 'manar_PRE_FULL_RESET_20260613_051931.db';

const PRESERVED_TABLES = [
  'users',
  'roles',
  'permissions',
  'role_permissions',
  'settings',
  'audit_logs',
  'backups',
  'accounts',
];

const CLEARED_TABLES = [
  'journal_entry_lines',
  'journal_entries',
  'transactions',
  'payments',
  'invoice_items',
  'invoices',
  'expenses',
  'material_issue_items',
  'material_issues',
  'goods_receipt_items',
  'goods_receipts',
  'purchase_order_items',
  'purchase_orders',
  'contract_documents',
  'contracts',
  'customers',
  'suppliers',
  'materials',
  'material_categories',
  'equipment',
  'employees',
  'salary_payments',
  'cheques',
  'project_prices',
];

// Prisma model delegate names (camelCase) mapped from DB table names
const TABLE_TO_MODEL: Record<string, string> = {
  journal_entry_lines: 'journalEntryLine',
  journal_entries: 'journalEntry',
  transactions: 'transaction',
  payments: 'payment',
  invoice_items: 'invoiceItem',
  invoices: 'invoice',
  expenses: 'expense',
  material_issue_items: 'materialIssueItem',
  material_issues: 'materialIssue',
  goods_receipt_items: 'goodsReceiptItem',
  goods_receipts: 'goodsReceipt',
  purchase_order_items: 'purchaseOrderItem',
  purchase_orders: 'purchaseOrder',
  contract_documents: 'contractDocument',
  contracts: 'contract',
  customers: 'customer',
  suppliers: 'supplier',
  materials: 'material',
  material_categories: 'materialCategory',
  equipment: 'equipment',
  employees: 'employee',
  salary_payments: 'salaryPayment',
  cheques: 'cheque',
  project_prices: 'projectPrice',
  users: 'user',
  roles: 'role',
  permissions: 'permission',
  role_permissions: 'rolePermission',
  settings: 'setting',
  audit_logs: 'auditLog',
  backups: 'backup',
  accounts: 'account',
};

const prisma = new PrismaClient();

// ── Helpers ──────────────────────────────────────────────────────────────────

function tsNow(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
}

function fmt(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function countModel(model: string): Promise<number> {
  try {
    return await (prisma as any)[model].count();
  } catch {
    return -1;
  }
}

async function countAll(): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const [table, model] of Object.entries(TABLE_TO_MODEL)) {
    result[table] = await countModel(model);
  }
  return result;
}

// ── Pre-flight ────────────────────────────────────────────────────────────────

function preflight(): void {
  console.log('\n── Pre-flight checks ─────────────────────────────────────────');

  if (!fs.existsSync(DB_PATH)) {
    console.error(`✖ Database not found: ${DB_PATH}`);
    process.exit(1);
  }

  const preBackupPath = path.join(BACKUP_DIR, PRE_RESET_BACKUP_NAME);
  if (!fs.existsSync(preBackupPath)) {
    console.error(`✖ Pre-reset backup not found: ${preBackupPath}`);
    console.error('  Create backup before running this script.');
    process.exit(1);
  }

  const backupStat = fs.statSync(preBackupPath);
  const dbStat = fs.statSync(DB_PATH);

  if (backupStat.size === 0) {
    console.error(`✖ Pre-reset backup is zero bytes — aborting.`);
    process.exit(1);
  }

  const diffPct = (Math.abs(backupStat.size - dbStat.size) / dbStat.size) * 100;
  if (diffPct > 10) {
    console.warn(
      `⚠  Backup size (${fmt(backupStat.size)}) differs from DB (${fmt(dbStat.size)}) by ${diffPct.toFixed(1)}%.`,
    );
    console.warn('   Verify backup is current before proceeding.');
  }

  console.log(`  ✓ Database:         ${DB_PATH} (${fmt(dbStat.size)})`);
  console.log(`  ✓ Pre-reset backup: ${PRE_RESET_BACKUP_NAME} (${fmt(backupStat.size)})`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║         FULL OPERATIONAL RESET — manarERP                    ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`  Started: ${new Date().toISOString()}`);

  // ── Step 1: Pre-flight ─────────────────────────────────────────────────────
  preflight();

  // ── Step 2: Count before ───────────────────────────────────────────────────
  console.log('\n── Row counts BEFORE reset ───────────────────────────────────');
  const before = await countAll();
  for (const [table, count] of Object.entries(before)) {
    const tag = CLEARED_TABLES.includes(table) ? 'CLEAR' : 'KEEP ';
    console.log(`  [${tag}] ${table.padEnd(32)} ${String(count).padStart(6)}`);
  }

  // ── Step 3: Execute reset ──────────────────────────────────────────────────
  console.log('\n── Executing reset transaction ───────────────────────────────');

  await prisma.$transaction(
    async (tx) => {
      // Pre-step: unlink users from employees before employees are deleted
      // (users are preserved; User.employeeId FK to Employee has no onDelete)
      const unlinked = await tx.user.updateMany({
        where: { employeeId: { not: null } },
        data: { employeeId: null },
      });
      if (unlinked.count > 0) {
        console.log(`  · Unlinked ${unlinked.count} user(s) from employee records`);
      }

      // Block 1 — Accounting entries
      await tx.journalEntryLine.deleteMany();
      await tx.journalEntry.deleteMany();
      await tx.transaction.deleteMany();
      console.log('  · Block 1: accounting entries cleared');

      // Block 2 — Invoices
      await tx.payment.deleteMany();
      await tx.invoiceItem.deleteMany();
      await tx.invoice.deleteMany();
      console.log('  · Block 2: invoices + payments cleared');

      // Block 3 — Expenses
      await tx.expense.deleteMany();
      console.log('  · Block 3: expenses cleared');

      // Block 4 — Inventory operations
      await tx.materialIssueItem.deleteMany();
      await tx.materialIssue.deleteMany();
      await tx.goodsReceiptItem.deleteMany();
      await tx.goodsReceipt.deleteMany();
      await tx.purchaseOrderItem.deleteMany();
      await tx.purchaseOrder.deleteMany();
      console.log('  · Block 4: inventory operations cleared');

      // Block 5 — Contracts (contract_documents cascade)
      await tx.contractDocument.deleteMany();
      await tx.contract.deleteMany();
      console.log('  · Block 5: contracts cleared');

      // Block 6 — Customers + Suppliers
      await tx.customer.deleteMany();
      await tx.supplier.deleteMany();
      console.log('  · Block 6: customers + suppliers cleared');

      // Block 7 — Inventory master data
      await tx.material.deleteMany();
      await tx.materialCategory.deleteMany();
      console.log('  · Block 7: inventory master data cleared');

      // Block 8 — Equipment (cascades: maintenance_records, fuel_logs, breakdowns, spare_part_usage)
      await tx.equipment.deleteMany();
      console.log('  · Block 8: equipment + maintenance records cleared');

      // Block 9 — Employees (cascades: attendance, leaves, deductions, bonuses, payroll,
      //            payroll_lines, employee_allowances, employee_recurring_deductions,
      //            payroll_advances, performance_reviews)
      await tx.employee.deleteMany();
      console.log('  · Block 9: employees + all HR/payroll records cleared');

      // Block 10 — Standalone tables
      await tx.salaryPayment.deleteMany();
      await tx.cheque.deleteMany();
      await tx.projectPrice.deleteMany();
      console.log('  · Block 10: salary_payments, cheques, project_prices cleared');
    },
    { timeout: 60_000 }, // 60s — generous timeout for larger datasets
  );

  console.log('  ✓ Transaction committed');

  // ── Step 4: Count after ────────────────────────────────────────────────────
  console.log('\n── Row counts AFTER reset ────────────────────────────────────');
  const after = await countAll();
  let allZero = true;

  for (const [table, count] of Object.entries(after)) {
    const shouldClear = CLEARED_TABLES.includes(table);
    const tag = shouldClear ? 'CLEAR' : 'KEEP ';
    let status = '';
    if (shouldClear) {
      if (count === 0) status = '✓';
      else { status = '✖ ROWS REMAIN'; allZero = false; }
    } else {
      status = `preserved (${before[table]} rows)`;
    }
    console.log(`  [${tag}] ${table.padEnd(32)} ${String(count).padStart(6)}  ${status}`);
  }

  if (!allZero) {
    console.error('\n✖ Some cleared tables still have rows — aborting post-reset steps.');
    process.exit(1);
  }

  // ── Step 5: Audit log ──────────────────────────────────────────────────────
  console.log('\n── Inserting audit log entry ─────────────────────────────────');
  await prisma.auditLog.create({
    data: {
      userId: null,
      action: 'FULL_OPERATIONAL_RESET',
      module: 'system',
      entityId: null,
      oldValue: JSON.stringify({
        countsBefore: Object.fromEntries(CLEARED_TABLES.map((t) => [t, before[t]])),
      }),
      newValue: JSON.stringify({
        resetType: 'FULL_OPERATIONAL_RESET',
        timestamp: new Date().toISOString(),
        preResetBackup: PRE_RESET_BACKUP_NAME,
        preservedTables: PRESERVED_TABLES,
        clearedTables: CLEARED_TABLES,
        preservedCounts: Object.fromEntries(PRESERVED_TABLES.map((t) => [t, after[t]])),
        clearedToZero: allZero,
      }),
    },
  });
  console.log('  ✓ Audit log entry inserted (action: FULL_OPERATIONAL_RESET)');

  // ── Step 6: Post-reset backup ──────────────────────────────────────────────
  console.log('\n── Creating post-reset backup ────────────────────────────────');
  await prisma.$disconnect();

  const postName = `manar_POST_FULL_RESET_${tsNow()}.db`;
  const postPath = path.join(BACKUP_DIR, postName);
  fs.copyFileSync(DB_PATH, postPath);
  const postSize = fs.statSync(postPath).size;
  console.log(`  ✓ Post-reset backup: ${postName} (${fmt(postSize)})`);

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    RESET COMPLETE                            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`  Pre-reset backup:  ${PRE_RESET_BACKUP_NAME}`);
  console.log(`  Post-reset backup: ${postName}`);
  console.log(`  Tables cleared:    ${CLEARED_TABLES.length}`);
  console.log(`  Tables preserved:  ${PRESERVED_TABLES.length}`);
  console.log(`  Completed:         ${new Date().toISOString()}`);
  console.log('\n  Next steps:');
  console.log('    npm test  (from backend/)');
  console.log('    npx tsc --noEmit  (from backend/ and frontend/)');
  console.log('    npm run build:back && npm run build:front');
  console.log('    npm run db:seed  (not required — seed tables are preserved)');
}

main()
  .catch((e) => {
    console.error('\n✖ Reset failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect().catch(() => {}));
