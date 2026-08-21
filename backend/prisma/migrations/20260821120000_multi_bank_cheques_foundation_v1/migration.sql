-- Multi-Bank Cheques Foundation v1
--
-- يحوّل هوية البنك في وحدة الشيكات من نص حر إلى بنية حقيقية:
--     Bank → BankAccount → Cheque
--
-- ما يفعله هذا الـmigration، بالترتيب:
--   1. إنشاء جدولَي `banks` و`bank_accounts`.
--   2. إعادة بناء `cheques` لإضافة `bankAccountId` ونقل تفرّد رقم الشيك من
--      «عالمي» إلى «لكل حساب بنكي».
--   3. بذر البنوك الكويتية العشرة (بمعرّفات code ثابتة غير عربية).
--   4. Bootstrap بنك الخليج: حساب «الحساب الرئيسي» + ربط شيكاته القديمة به.
--   5. مزامنة مفاتيح الصلاحيات الجديدة `banks.read` / `banks.manage` ومنحها
--      للأدوار المعنية — عبر الـmigration لا عبر إعادة بذر يدوية، لأن
--      `prisma migrate deploy` يعمل تلقائيًا عند بدء الخدمة في الإنتاج
--      (backend/src/core/utils/migrate.ts) فهو المسار المضمون الوحيد.
--
-- ما لا يفعله، صراحةً:
--   • لا يحذف أي شيك، ولا يغيّر أي `chequeNumber`، ولا يمسّ أي مبلغ أو تاريخ
--     أو حالة أو سجل طباعة أو رقم سند صرف.
--   • لا يخمّن بنك أي قيمة `bankName` غير معروفة — تلك الشيكات تبقى
--     `bankAccountId = NULL` وتُعرض في تقرير «شيكات بلا حساب بنكي».
--   • لا يمنح أي حساب غير حساب بنك الخليج الرئيسي قالب طباعة.
--   • لا يلمس المحاسبة العامة ولا دليل الحسابات ولا الحساب 1010.

-- ═══════════════════════════════════════════════════════════════════════
-- 1) الجداول الجديدة
-- ═══════════════════════════════════════════════════════════════════════

-- CreateTable
CREATE TABLE "banks" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "bankId" INTEGER NOT NULL,
    "accountName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "statementAccountKey" TEXT,
    "printProfileKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "bank_accounts_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "banks" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- ═══════════════════════════════════════════════════════════════════════
-- 2) إعادة بناء جدول الشيكات
--
--    إعادة البناء ضرورية في SQLite لسببين لا ثالث لهما: إسقاط قيد التفرّد
--    العالمي على `chequeNumber`، وإضافة مفتاح أجنبي. الـINSERT ... SELECT
--    أدناه ينسخ **كل عمود بالاسم صراحةً** ويحافظ على `id` لكل صف، فسجلات
--    الطباعة (`cheque_print_logs.chequeId`) تبقى مرتبطة بشيكاتها بعد
--    إعادة التسمية. `bankAccountId` يبدأ NULL للجميع ثم يُملأ في الخطوة 4.
-- ═══════════════════════════════════════════════════════════════════════

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_cheques" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "chequeNumber" TEXT NOT NULL,
    "chequeDate" DATETIME NOT NULL,
    "beneficiaryName" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KWD',
    "description" TEXT,
    "bankAccountId" INTEGER,
    "bankName" TEXT NOT NULL,
    "templateName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "printedAt" DATETIME,
    "cancelledAt" DATETIME,
    "notes" TEXT,
    "paymentVoucherNumber" TEXT,
    "printCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "cheques_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_cheques" ("amount", "bankName", "beneficiaryName", "cancelledAt", "chequeDate", "chequeNumber", "createdAt", "currency", "description", "id", "notes", "paymentVoucherNumber", "printCount", "printedAt", "status", "templateName", "updatedAt") SELECT "amount", "bankName", "beneficiaryName", "cancelledAt", "chequeDate", "chequeNumber", "createdAt", "currency", "description", "id", "notes", "paymentVoucherNumber", "printCount", "printedAt", "status", "templateName", "updatedAt" FROM "cheques";
DROP TABLE "cheques";
ALTER TABLE "new_cheques" RENAME TO "cheques";
CREATE UNIQUE INDEX "cheques_paymentVoucherNumber_key" ON "cheques"("paymentVoucherNumber");
CREATE INDEX "cheques_status_idx" ON "cheques"("status");
CREATE INDEX "cheques_chequeDate_idx" ON "cheques"("chequeDate");
CREATE INDEX "cheques_beneficiaryName_idx" ON "cheques"("beneficiaryName");
CREATE INDEX "cheques_bankAccountId_idx" ON "cheques"("bankAccountId");
CREATE UNIQUE INDEX "cheques_bankAccountId_chequeNumber_key" ON "cheques"("bankAccountId", "chequeNumber");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "banks_code_key" ON "banks"("code");

-- CreateIndex
CREATE INDEX "banks_isActive_idx" ON "banks"("isActive");

-- CreateIndex
CREATE INDEX "bank_accounts_bankId_idx" ON "bank_accounts"("bankId");

-- CreateIndex
CREATE INDEX "bank_accounts_isActive_idx" ON "bank_accounts"("isActive");

-- CreateIndex
CREATE INDEX "bank_accounts_statementAccountKey_idx" ON "bank_accounts"("statementAccountKey");

-- CreateIndex
CREATE UNIQUE INDEX "bank_accounts_bankId_accountName_key" ON "bank_accounts"("bankId", "accountName");

-- ═══════════════════════════════════════════════════════════════════════
-- 3) بذر البنوك الكويتية
--
--    `code` معرّف داخلي ثابت غير معتمد على الاسم العربي، ويطابق مفردات
--    استيراد كشوف البنوك (parser.ts) ليكون توحيد الوحدتين لاحقًا ربطًا لا
--    إعادة تسمية. `INSERT OR IGNORE` يجعل التنفيذ idempotent.
--
--    وجود البنك في القائمة **لا يعني** أنه مهيأ للطباعة: لا حساب له ولا
--    قالب، والشيكات لا تُسجَّل عليه حتى ينشئ المستخدم حسابًا.
-- ═══════════════════════════════════════════════════════════════════════

INSERT OR IGNORE INTO "banks" ("code", "nameAr", "nameEn", "isActive", "createdAt", "updatedAt") VALUES
  ('NBK',         'بنك الكويت الوطني',   'National Bank of Kuwait (NBK)', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('KFH',         'بيت التمويل الكويتي', 'Kuwait Finance House (KFH)',    true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('GULF_BANK',   'بنك الخليج',          'Gulf Bank',                     true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('CBK',         'البنك التجاري الكويتي', 'Commercial Bank of Kuwait',   true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('BURGAN',      'بنك برقان',           'Burgan Bank',                   true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('BOUBYAN',     'بنك بوبيان',          'Boubyan Bank',                  true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('WARBA',       'بنك وربة',            'Warba Bank',                    true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ABK',         'البنك الأهلي الكويتي', 'Al Ahli Bank of Kuwait',       true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('AHLI_UNITED', 'البنك الأهلي المتحد',  'Ahli United Bank',             true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('KIB',         'بنك الكويت الدولي',    'Kuwait International Bank',    true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- ═══════════════════════════════════════════════════════════════════════
-- 4) Gulf Bank legacy bootstrap
--
--    حساب واحد «الحساب الرئيسي» لبنك الخليج، وهو الحساب **الوحيد** في
--    النظام الذي يحمل قالب طباعة معتمدًا (`CLASSIC_GULF_V1`) — أي أن طباعة
--    بنك الخليج تستمر بالمسار Classic الحالي دون أي تغيير بصري أو هندسي،
--    بينما أي حساب/بنك جديد يبقى بلا قالب فتُمنع طباعته.
-- ═══════════════════════════════════════════════════════════════════════

INSERT OR IGNORE INTO "bank_accounts" ("bankId", "accountName", "isActive", "statementAccountKey", "printProfileKey", "createdAt", "updatedAt")
SELECT "id", 'الحساب الرئيسي', true, NULL, 'CLASSIC_GULF_V1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "banks" WHERE "code" = 'GULF_BANK';

-- ربط شيكات بنك الخليج القديمة بالحساب الرئيسي.
--
-- المطابقة **حرفية ومحصورة** بالقيمة 'بنك الخليج' — وهي القيمة الوحيدة التي
-- كانت الواجهة تكتبها (كان حقل البنك مثبّتًا ومعطّلًا عليها). أي قيمة أخرى لا
-- تُخمَّن ولا تُقارَب: تبقى NULL ويكشفها تقرير الشيكات غير المربوطة.
--
-- لا تعارض ممكن مع فهرس التفرّد الجديد: كل هذه الشيكات كانت تحت قيد تفرّد
-- عالمي على `chequeNumber` قبل هذا الـmigration، فأرقامها متمايزة بالضرورة.
UPDATE "cheques"
SET "bankAccountId" = (
  SELECT ba."id" FROM "bank_accounts" ba
  JOIN "banks" b ON b."id" = ba."bankId"
  WHERE b."code" = 'GULF_BANK' AND ba."accountName" = 'الحساب الرئيسي'
)
WHERE "bankName" = 'بنك الخليج' AND "bankAccountId" IS NULL;

-- ═══════════════════════════════════════════════════════════════════════
-- 5) مزامنة الصلاحيات الجديدة
--
--    مفتاحان فقط: `banks.read` (مطالعة البنوك والحسابات — يحتاجها أيضًا
--    منتقي الحساب في نموذج الشيك) و`banks.manage` (إنشاء/تعديل/تفعيل).
--
--    المنح: SYSTEM_ADMIN (يتجاوز RBAC أصلًا، ويُمنح للاتساق في شاشة الأدوار)،
--    GENERAL_MANAGER و ACCOUNTANT (مالك وحدة الشيكات). بقية الأدوار لا تُمنح
--    شيئًا هنا — تُمنح يدويًا من شاشة الأدوار عند الحاجة.
-- ═══════════════════════════════════════════════════════════════════════

INSERT OR IGNORE INTO "permissions" ("key", "module", "action", "description") VALUES
  ('banks.read',   'banks', 'read',   'عرض - banks'),
  ('banks.manage', 'banks', 'manage', 'إدارة - banks');

INSERT OR IGNORE INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE p."key" IN ('banks.read', 'banks.manage')
  AND r."name" IN ('SYSTEM_ADMIN', 'GENERAL_MANAGER', 'ACCOUNTANT');
