import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * عقد الـmigration — Multi-Bank Cheques Foundation v1.
 *
 * الـmigration هو المكان الوحيد الذي يلمس بيانات إنتاج قائمة، ولا يمكن التراجع
 * عنه بعد التشغيل. هذه المجموعة تثبّت ضماناته نصًّا، فأي تعديل مستقبلي يحوّله
 * إلى «تخمين» أو يجعله يمسّ بيانات مالية يسقط هنا قبل أن يصل قاعدة إنتاج.
 *
 * هذا اختبار عقد على SQL نفسه — لا يشغّل قاعدة بيانات ولا يعدّل شيئًا.
 */

const MIGRATION_SQL = readFileSync(
  join(__dirname, '../../../../prisma/migrations/20260821120000_multi_bank_cheques_foundation_v1/migration.sql'),
  'utf8',
);

/** السطور الفعلية بلا تعليقات — التعليقات تشرح النية، والـSQL هو ما يُنفَّذ. */
const STATEMENTS = MIGRATION_SQL
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

describe('Gulf Bank bootstrap', () => {
  it('seeds the bank registry with a non-Arabic internal code for Gulf Bank', () => {
    expect(STATEMENTS).toContain("'GULF_BANK'");
    expect(STATEMENTS).toMatch(/INSERT OR IGNORE INTO "banks"/);
  });

  it('creates the Gulf main account and gives it the legacy Classic print profile', () => {
    expect(STATEMENTS).toContain("'الحساب الرئيسي'");
    expect(STATEMENTS).toContain("'CLASSIC_GULF_V1'");
  });

  it('grants a print profile to Gulf Bank ONLY — no other account is configured', () => {
    const profileMentions = STATEMENTS.match(/CLASSIC_GULF_V1/g) ?? [];
    expect(profileMentions).toHaveLength(1);
    // القيمة الوحيدة المكتوبة في العمود ترتبط بصف بنك الخليج وحده.
    expect(STATEMENTS).toMatch(/'CLASSIC_GULF_V1'[\s\S]*?FROM "banks" WHERE "code" = 'GULF_BANK'/);
  });

  it('is idempotent — every data bootstrap insert ignores an existing row', () => {
    // `INSERT INTO "new_cheques"` مستثنى: هو نسخ إعادة بناء الجدول في SQLite،
    // لا بذر بيانات، ويعمل مرة واحدة على جدول أُنشئ لتوّه في نفس الـmigration.
    const plainInserts = (STATEMENTS.match(/INSERT INTO "(\w+)"/g) ?? [])
      .filter((s) => !s.includes('new_cheques'));
    expect(plainInserts).toHaveLength(0);
    expect(STATEMENTS).toMatch(/INSERT OR IGNORE INTO "banks"/);
    expect(STATEMENTS).toMatch(/INSERT OR IGNORE INTO "bank_accounts"/);
    expect(STATEMENTS).toMatch(/INSERT OR IGNORE INTO "permissions"/);
    expect(STATEMENTS).toMatch(/INSERT OR IGNORE INTO "role_permissions"/);
  });
});

describe('legacy backfill safety', () => {
  it('links legacy cheques by an EXACT bankName match, never a fuzzy one', () => {
    expect(STATEMENTS).toMatch(/WHERE "bankName" = 'بنك الخليج' AND "bankAccountId" IS NULL/);
    // لا LIKE ولا مطابقة جزئية على اسم البنك في أي مكان.
    expect(STATEMENTS).not.toMatch(/"bankName"\s+LIKE/i);
  });

  it('only ever fills a bankAccountId that is still empty', () => {
    const chequeUpdates = STATEMENTS.match(/UPDATE "cheques"[\s\S]*?;/g) ?? [];
    expect(chequeUpdates).toHaveLength(1);
    expect(chequeUpdates[0]).toContain('"bankAccountId" IS NULL');
  });

  it('never deletes a cheque', () => {
    expect(STATEMENTS).not.toMatch(/DELETE\s+FROM\s+"cheques"/i);
  });

  it('never rewrites a cheque number, amount, date, status or voucher number', () => {
    const [chequeUpdate] = STATEMENTS.match(/UPDATE "cheques"[\s\S]*?;/g) ?? [];
    for (const protectedColumn of [
      'chequeNumber', 'amount', 'chequeDate', 'status',
      'printedAt', 'printCount', 'paymentVoucherNumber', 'beneficiaryName',
    ]) {
      expect(chequeUpdate, protectedColumn).not.toMatch(new RegExp(`SET[\\s\\S]*"${protectedColumn}"\\s*=`));
    }
  });

  it('preserves every cheque row and id through the table rebuild', () => {
    // النسخ بالاسم صراحةً، و`id` ضمن الأعمدة المنسوخة — فسجلات الطباعة تبقى
    // مرتبطة بشيكاتها بعد إعادة التسمية.
    expect(STATEMENTS).toMatch(/INSERT INTO "new_cheques" \([^)]*"id"[^)]*\) SELECT [^;]*"id"[^;]*FROM "cheques"/);
  });

  it('never touches the print log or the payment-voucher sequence', () => {
    expect(STATEMENTS).not.toMatch(/cheque_print_logs/i);
    expect(STATEMENTS).not.toMatch(/finance\.paymentVoucher/i);
  });
});

describe('cheque number uniqueness moves to the account scope', () => {
  it('creates the composite unique index', () => {
    expect(STATEMENTS).toMatch(
      /CREATE UNIQUE INDEX "cheques_bankAccountId_chequeNumber_key" ON "cheques"\("bankAccountId", "chequeNumber"\)/,
    );
  });

  it('drops the old global unique on chequeNumber', () => {
    expect(STATEMENTS).not.toMatch(/CREATE UNIQUE INDEX "cheques_chequeNumber_key"/);
  });

  it('keeps the payment-voucher number globally unique', () => {
    expect(STATEMENTS).toMatch(/CREATE UNIQUE INDEX "cheques_paymentVoucherNumber_key"/);
  });
});

describe('permission sync ships with the migration', () => {
  it('creates both new permission keys', () => {
    expect(STATEMENTS).toContain("'banks.read'");
    expect(STATEMENTS).toContain("'banks.manage'");
  });

  it('grants them to the roles that own cheques', () => {
    expect(STATEMENTS).toMatch(/INSERT OR IGNORE INTO "role_permissions"/);
    expect(STATEMENTS).toMatch(/'SYSTEM_ADMIN', 'GENERAL_MANAGER', 'ACCOUNTANT'/);
  });
});

describe('out of scope for this pack', () => {
  it('performs no GL integration', () => {
    for (const forbidden of ['journal_entries', 'journal_entry_lines', 'accounts', 'transactions']) {
      expect(STATEMENTS, forbidden).not.toMatch(new RegExp(`(INSERT|UPDATE|DELETE)[\\s\\S]{0,40}"${forbidden}"`, 'i'));
    }
  });

  it('creates no cheque book table', () => {
    expect(STATEMENTS).not.toMatch(/cheque_books/i);
  });

  it('leaves the Classic template system and its versions untouched', () => {
    expect(STATEMENTS).not.toMatch(/cheque_template_versions/i);
    expect(STATEMENTS).not.toMatch(/cheque_designer_templates/i);
    expect(STATEMENTS).not.toMatch(/printed_cheques/i);
    expect(STATEMENTS).not.toMatch(/professional_form_templates/i);
  });

  it('stores no account number or IBAN column', () => {
    expect(STATEMENTS).not.toMatch(/"accountNumber"/);
    expect(STATEMENTS).not.toMatch(/"iban"/i);
  });
});
