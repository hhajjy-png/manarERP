# خطر: الاستيراد التاريخي لا يُرحَّل محاسبيًا

> الحالة: **خطر موثَّق ومقبول عمدًا** — لا يُعالَج في `Historical Financial Data Readiness Pack v1`.
> التاريخ: 2026-07-10
> القرار: إبقاء السلوك الحالي المانع للترحيل المزدوج، وإضافة إفصاح صريح فقط.

---

## 1. الحقيقة المؤكَّدة من الكود

مسارات الاستيراد تكتب المستندات مباشرةً عبر Prisma ولا تستدعي طبقة الترحيل المحاسبي إطلاقًا.

| الكيان | موضع الإنشاء | ترحيل GL؟ | الحالة الابتدائية |
|---|---|---|---|
| الفواتير | `import.service.ts` → `tx.invoice.create` | ❌ لا | حسب الملف |
| المصروفات | `import.service.ts` → `tx.expense.create` | ❌ لا | `PENDING` |
| كشوف الرواتب | `import.service.ts` → `tx.payroll.create` | ❌ لا | `DRAFT` |
| العملاء/الموردون/الموظفون/العقود/المعدات/الأسعار | `tx.<model>.create` | — | غير مالية |

تعليق قائم في الكود يوثّق القرار:

> `// Import-specific path: create invoice without postJournal to avoid double-counting accounting entries for historically imported data.`

مسارات أخرى للتأكيد:
- `payrollBankImport/service.ts` → `tx.salaryPayment.create` — سجل تحويل بنكي، لا مستند محاسبي.
- `bankStatementImport/service.ts` → جدول تسوية مرحلي (staging)؛ يقترح قيودًا ولا يرحّلها.
- `backend/scripts/import-data.ts` و`import-employees.ts` → `upsert` خام، بلا GL.

## 2. لماذا هذا خطر

المستخدم يرى **«تم استيراد 240 فاتورة»** فيستنتج أن دفاتر 2024 صارت مكتملة. الواقع:

- الفواتير والمصروفات المستوردة **تظهر** في شاشات القوائم وتقارير التشغيل.
- ولا تظهر إطلاقًا في **قائمة الدخل**، ولا **ميزان المراجعة**، ولا **دفتر الأستاذ**، ولا **كشوف الحسابات** المبنية على GL.
- تقرير أعمار الديون **يظهرها** (لأنه مبني على `Invoice`/`Payment` لا على GL) — فينشأ **تناقض بين تقريرين** يقرأهما نفس المستخدم في نفس اليوم.

هذا التناقض هو الخطر الحقيقي: ليس نقص بيانات، بل **بيانات متعارضة تبدو صحيحة**.

## 3. لماذا لا نصلحه الآن

الترحيل التلقائي عند الاستيراد يفتح ثلاث مشاكل دفعةً واحدة:

1. **الترحيل المزدوج.** لا توجد حاليًا آلية idempotency على مستوى الدفعة. إعادة تشغيل استيراد فاشل جزئيًا تُنشئ قيودًا مكررة. الحارس الحالي `@@unique([referenceType, referenceId])` يحمي المستند الواحد لا الدفعة.
2. **الأرصدة الافتتاحية.** ترحيل فواتير 2024 دون قيد رصيد افتتاحي مقابل يجعل ميزان المراجعة غير متوازن، لأن الطرف المقابل (نقد/بنك/حقوق ملكية) لم يُستورد.
3. **تجاوز الاعتماد.** المصروفات تُستورد `PENDING` والرواتب `DRAFT` عمدًا. الترحيل التلقائي يتخطى مسار الاعتماد ويلغي ضوابط الحوكمة القائمة.

أيٌّ من الثلاثة تغيير سلوكي كبير يستحق حزمة مستقلة بمراجعة أمنية ومحاسبية.

## 4. ما نُفِّذ فعلًا الآن (منع التضليل فقط)

- `ExecuteSummary.accountingPosted: false` — حقل صريح في استجابة الاستيراد.
- `ExecuteSummary.accountingNotice` — نص تحذيري عربي يُبنى للأنواع المالية الثلاثة فقط، ويذكر العدد المستورد صراحةً.
- توثيق القيد في `import.types.ts` بجانب الحقل نفسه.

**لم يتغيّر أي سلوك ترحيل.** لا قيود جديدة، ولا تغيير في الحالات الابتدائية.

---

## 5. تصميم مقترح للحزمة اللاحقة

### `Historical Import Batch Review & Posting Pack`

المسار: `Import → Review → Validate → Explicit Batch Posting → Reconciliation`

> تصميم فقط. لا يُنفَّذ ضمن الحزمة الحالية.

#### 5.1 نموذج بيانات (يتطلب Migration)

```prisma
model ImportBatch {
  id             Int      @id @default(autoincrement())
  entityType     String   // invoices | expenses | payroll
  fiscalYear     Int
  status         String   @default("IMPORTED")
  // IMPORTED → REVIEWED → VALIDATED → POSTED → RECONCILED | REVERSED
  importedAt     DateTime @default(now())
  importedById   Int
  postedAt       DateTime?
  postedById     Int?
  journalEntryId Int?     // القيد الإجمالي الواحد، إن اختير النمط الإجمالي
  notes          String?
  items          ImportBatchItem[]
  @@index([status])
  @@index([fiscalYear])
}

model ImportBatchItem {
  id            Int    @id @default(autoincrement())
  batchId       Int
  entityId      Int    // معرّف الفاتورة/المصروف/الراتب
  postedEntryId Int?   // قيد اليومية الناتج، إن كان الترحيل تفصيليًا
  batch         ImportBatch @relation(fields: [batchId], references: [id], onDelete: Cascade)
  @@unique([batchId, entityId])   // حارس الترحيل المزدوج على مستوى الدفعة
}
```

`@@unique([batchId, entityId])` هو المفتاح: يجعل إعادة تشغيل الترحيل idempotent.

#### 5.2 المراحل

**Import** — كما هو اليوم، لكن ينشئ `ImportBatch` بحالة `IMPORTED` ويربط كل سجل بـ `ImportBatchItem`.

**Review** — شاشة تعرض الدفعة: عدد المستندات، مدى التواريخ، الإجماليات لكل حساب، والفروق المتوقعة على ميزان المراجعة. لا كتابة.

**Validate** — فحوصات آلية تمنع الانتقال إلى الترحيل:
- كل التواريخ داخل السنة المالية المعلنة للدفعة.
- لا تاريخ يقع قبل `finance.lockBeforeDate` (إلا بصلاحية `financial.overrideLock`).
- كل مستند له حساب مقابل قابل للاشتقاق.
- محاكاة القيد المجمَّع تُنتج ميزانًا متوازنًا؛ الفرق يُعرض كـ **رصيد افتتاحي مطلوب**.
- لا سجل في الدفعة مُرحَّل مسبقًا (فحص `ImportBatchItem.postedEntryId`).

**Explicit Batch Posting** — إجراء واحد صريح خلف صلاحية جديدة `import.post`، داخل معاملة واحدة:
- ينشئ قيد الرصيد الافتتاحي إن لزم (`referenceType: 'OPENING_BALANCE'`).
- يرحّل المستندات عبر `createBalancedJournal` نفسها — فيرث حارس قفل الفترة وترقيم القيد من تاريخ المستند تلقائيًا (مكاسب الحزمة الحالية).
- يملأ `postedEntryId` لكل عنصر، ويضبط `status = 'POSTED'`.
- يكتب `AuditLog` بإجراء `IMPORT_BATCH_POSTED`.

**Reconciliation** — مقارنة بعدية: مجموع مستندات الدفعة مقابل حركة الحسابات الناتجة. أي فرق يمنع `RECONCILED` ويعرض التفصيل.

**Reverse** — عكس دفعة كاملة يستخدم `reverseGL` بتاريخ القيد الأصلي (سلوك الحزمة الحالية)، ويضبط `status = 'REVERSED'`.

#### 5.3 قرارات مفتوحة تحتاج حسمًا قبل التنفيذ

1. **قيد إجمالي واحد للدفعة أم قيد لكل مستند؟** الإجمالي أخف على SQLite وأوضح في دفتر الأستاذ؛ التفصيلي يحافظ على تتبّع المستند ويسمح بعكس مستند واحد. الترجيح: **تفصيلي**، اتساقًا مع بقية النظام الذي يربط `referenceType/referenceId` بكل مستند.
2. **الأرصدة الافتتاحية:** تُستورد كملف مستقل، أم تُشتق كفرق موازِن؟ الاشتقاق مريح لكنه يخفي أخطاء المصدر.
3. **علاقة الترحيل بمسار الاعتماد:** هل يقفز ترحيل الدفعة فوق `PENDING`/`DRAFT`، أم يعتمد المستندات ضمنيًا ويسجّل ذلك؟

#### 5.4 أثر متوقع

- Migration واحدة (جدولان).
- صلاحية جديدة `import.post`.
- لا تغيير على `createBalancedJournal` — يُعاد استخدامها كما هي.
