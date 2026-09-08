# PROJECT_STATE.md — Release-Log Archive

**Archived from:** `PROJECT_STATE.md` (repo root), release-log section
**Rotated on:** 2026-09-08 — *PROJECT_STATE Documentation Rotation & Maintenance v1*
**Date range covered:** `2026-08-19` → `2026-08-01`  (newest first, exactly as it appeared in the live file)
**Release entries in this file:** 51 (of which 4 carry no explicit date field)
**First entry in file:** Previous Release — Production Release 2026.5.6
**Last entry in file:** Previous Release — Dark Mode Color Consistency Pack v1

> **Verbatim.** Every section below was MOVED, not rewritten: heading, tables, code blocks and prose
> are byte-identical to the live file before rotation. Nothing was summarised, reformatted or dropped.
> Two entries in this archive still carry a `## Latest Release —` heading; that is how they existed in
> `PROJECT_STATE.md` (they were never demoted to `## Previous Release` by the release that followed
> them). They were preserved exactly rather than silently corrected — see `ROTATION_MANIFEST_V1.md`.

See `docs/history/README.md` for the full archive index.

---
## Previous Release — Production Release 2026.5.6

| Field | Value |
|-------|-------|
| **Package** | Production Release 2026.5.6 — إصدار تغليف. يجمع في مثبِّت Windows جديد مكتفٍ ذاتيًا كل ما دُمج على `production` منذ مثبِّت 2026.5.5. لا عمل ميزات جديد في الإصدار نفسه |
| **Release status** | RELEASED — Product Owner manual visual & functional review **completed and approved** prior to release authorization; not re-performed during release |
| **Release commit** | `bac75a32` — `chore(release): Production Release 2026.5.6` (`package.json` `2026.5.5` → `2026.5.6`، الملف الوحيد المتغيّر) |
| **Merge** | `0d33b9ea` — `--no-ff` merge of `feature/production-release-2026.5.6` |
| **Tags** | `stable-production-release-2026.5.6` → `0d33b9ea` · `checkpoint-production-release-2026.5.6` → `788c8fe0` (production HEAD قبل الإصدار مباشرةً) |
| **Contents (first time in an installer)** | **C-1 Critical Accounting Fix Pack v1** (`ffa03704`، merge `1963201a`، tag `stable-c1-critical-accounting-fix-pack-v1`) · **Packaging Hardening Pack v1** (`3feb15e3`، merge `788c8fe0`، tag `stable-packaging-hardening-pack-v1`) |
| **C-1 — ما أُغلق** | `PUT /invoices/:id` كان يسمح بتغيير `paymentMethod` لفاتورة شراء بعد ترحيلها. الحقل يقود مُخرجَين بدورتَي حياة مختلفتين: حساب الدائن في القيد (يُعاد اشتقاقه عند كل `repostInvoiceToGL`) وحالة السداد `paidAmount`/`status` (تُشتقّ مرة واحدة عند الإنشاء فقط). فالتعديل كان يحرّك الأول ويجمّد الثاني: الأستاذ يُدائن الصندوق بينما الفاتورة تبقى `UNPAID`، فيمرّ حارس `addPayment` ويُدائن الصندوق مرة ثانية ويترك الذمم الدائنة برصيد **مدين**. الحارس الجديد يرفض بـ400 قبل أي عمل على القاعدة، ويقارن على **الحساب الدائن الفعّال** فيمرّ التعديل المكافئ (`null` ⇄ `ACCOUNTS_PAYABLE`) |
| **Packaging — ما أُغلق** | (١) **تقادم عميل Prisma صامتًا — أُصلح جذريًا:** مصدر النسخ صار `backend/node_modules` (حيث يكتب `prisma generate` فعلًا) لا جذر المستودع الذي كان يتجمّد بلا إشارة (75 نموذجًا مقابل 85 في 2026.5.5)، وأُضيف `verifyPackagedPrismaSchema()` — حارس فشل-مغلق يقارن **مجموعة** أسماء النماذج ويُفشل البناء عند أي فرق. **عمل فعلًا في هذا البناء وسجّل: «تحقّق مجموعة نماذج Prisma: 85 نموذجًا مطابقًا للمخطط القانوني ✓»**. الحل اليدوي الإلزامي في كل إصدار سابق لم يعد ضروريًا. (٢) **تسريب كود تطويري:** `__livetest__/liveTest.js` كان مشحونًا فعليًا داخل مثبِّت 2026.5.5؛ أُغلق بحاجزين مستقلين (استثناء `backend/tsconfig.json` + مرشِّح `electron-builder.yml`) |
| **Scope** | لا تغيير مخطط، لا ترحيل جديد، لا مفتاح صلاحية جديد، لا اعتمادية جديدة، لا تغيير واجهة. 69 مجلد ترحيل و`migrate status`: «Database schema is up to date» |
| **Golden Database** | SHA-256 `03fb8e5e18cef47e04a19c7d80e06359779aefd6c402d9d821ffd5249690f880`، 3,870,720 بايت، `integrity_check = ok`، 0 مخالفة مفتاح أجنبي، 86 جدولًا (85 نموذجًا + `_prisma_migrations`)، 69 ترحيلًا مطبَّقًا (آخرها `20260819120000_add_xbrl_readiness_foundation`) — مطابقة بايتًا ببايت في **أربعة** مواضع: المصدر · `win-unpacked` · مستخرَجة من داخل `Setup.exe` · `seed-data/golden-manifest.json`. فُحصت السلامة على **نسخة** مطابقة لا على الملف المشحون، ولا ملف journal ساخن بجوار المصدر وقت التغليف |
| **Golden Manifest** | `{ sha256: 03fb8e5e…f880, sizeBytes: 3870720, dataModifiedAt: 2026-08-20T11:54:54.330Z, packagedAt: 2026-08-20T12:00:34.718Z }` — مطابق في `build/seed-data` و`win-unpacked` وداخل `Setup.exe`، و`sha256`/`sizeBytes` مطابقان للقاعدة المشحونة فعليًا |
| **Installer** | `AlManarERP-Setup-2026.5.6.exe`، 138,436,813 بايت (132.02 MiB)، SHA-256 `2b44d5a677f7f29a78d15f6eac373204d56cc928d967fd5f8285e8388bb6e44e`. `win-unpacked`: 3,376 ملفًا / 470,059,994 بايت (448.3 MiB). صفر متطلبات تشغيل خارجية على وندوز 10/11 نظيف |
| **Packaging audit** | 4,107 مدخلًا في `Setup.exe` + 686 مدخلًا في `app.asar` — **صفر** في كل فئة ممنوعة: source maps · `__tests__` · `*.test.*`/`*.spec.*` · `.ts`/`.tsx`/`.d.ts` · `.env` · `.bak` · journals (`-wal`/`-shm`/`journal`) · `.pem`/`.key`/`.pfx`/`.crt` · بقايا محرّك Prisma المؤقتة · محرّكات Prisma لغير وندوز · **و`__livetest__`/`__probe__`**. ملف `.db` واحد فقط (`resources\backend\data\manar.db`). 69 ملف `migration.sql` = 69 مجلدًا في المستودع. مجلد Prisma المشحون يحوي `schema.prisma` و`migrations/` حصرًا. **مطابقة `.env` الإيجابية الكاذبة التي لازمت كل إصدار سابق اختفت** — المرشِّح صار يشترط بداية مقطع مسار |
| **Prisma client inside the installer** | مستخرَج من داخل `Setup.exe` ومقارَن بـ**مجموعة** الأسماء لا العدد: **85 نموذجًا، صفر ناقص وصفر زائد** مقابل `backend/prisma/schema.prisma` |
| **Validation** | `prisma generate` ✅ · `prisma validate` ✅ · `migrate status` 69/69 ✅ · Backend/Frontend/Electron `tsc --noEmit` ✅ · `npm run dist` ✅ (خرج 0) · Backend **215 ملفًا / 3434 اختبارًا** ✅ (اختباران متخطَّيان عمدًا) · Frontend **223 ملفًا / 4088 اختبارًا** ✅ · Electron **27 ملفًا / 502 اختبارًا** ✅ |
| **Regression analysis** | لا انحدار. Backend 3418 → **3434** (+16 = اختبارات C-1 بالضبط) · Electron 499 → **502** (+3 = اختبارات `readModelSet` بالضبط) · Frontend ثابت عند **4088**. صفر فشل في الأساس. حجم المثبِّت و`win-unpacked` شبه ثابتين مقابل 2026.5.5 (‎−193 بايت و‎−1,268 بايت) رغم إسقاط ملفات الفحص — فرق متوقّع لتغيّر محتوى القاعدة الذهبية |
| **الشرط التشغيلي المطبَّق** | التطبيق كان قيد التشغيل عند بدء الإصدار (خادم خلفي على `48211` وVite على `5173`)، ما أفشل `prisma generate` بـ`EPERM` على محرّك Prisma وكان سيلتقط القاعدة الذهبية وهي حيّة. أُوقف الإصدار وأغلق Product Owner التطبيق قبل المتابعة — تطبيقٌ للسياسة الموثّقة «أغلق التطبيق قبل أي إصدار» |
| **خارج هذا الإصدار عمدًا** | حزمة التدقيق الهندسي الشامل المتبقية (27 ملفًا) **ما زالت غير مُرحَّلة** بقرار صريح من Product Owner لهذا الإصدار: أُدخلت منها ملفات التغليف الأربعة فقط. تنتظر أمر إصدار مستقلًا |
| **Branches** | جميع فروع الميزات محفوظة — لم يُحذف أي فرع |

---

## Previous Release — C-1 Critical Accounting Fix Pack v1

| Field | Value |
|-------|-------|
| **Package** | C-1 Critical Accounting Fix Pack v1 — إغلاق ثغرة محاسبية حرجة في مسار تعديل فاتورة الشراء. **Source-only release** — لا installer، ولا `npm run dist`، ولا رفع لرقم الإصدار: `package.json` يبقى `2026.5.5` |
| **Release status** | RELEASED — Product Owner manual visual & functional review **completed and approved** prior to release authorization; not re-performed during release |
| **Feature commit** | `ffa03704` — `fix(invoices): close C-1 — block paymentMethod change on posted purchase invoices` (3 ملفات، ‎+261/−2) |
| **Merge** | `1963201a` — `--no-ff` merge of `feature/c1-critical-accounting-fix-pack-v1` |
| **Tags** | `stable-c1-critical-accounting-fix-pack-v1` → `1963201a` · `checkpoint/pre-c1-critical-accounting-fix-pack-v1` → `b2c48029` (production HEAD قبل الدمج مباشرةً) |
| **الثغرة (C-1)** | `PUT /invoices/:id` كان يسمح بتغيير `paymentMethod` بعد الترحيل المحاسبي. الحقل يقود **مُخرجَين بدورتَي حياة مختلفتين**: حساب الدائن في القيد — يُعاد اشتقاقه عند **كل** `repostInvoiceToGL` لأن `buildInvoiceGLPosting` يقرأ الحقل من الصف في كل مرة — وحالة السداد `paidAmount`/`status` التي تُشتقّ منه **مرة واحدة عند الإنشاء فقط** عبر `isImmediatelySettledPurchase`. فالتعديل كان يحرّك الأول ويترك الثاني متجمّدًا: الأستاذ العام يُدائن الصندوق (سُدِّدت) بينما الفاتورة تبقى `UNPAID`، فيمرّ حارس `addPayment` — وهو سليم منطقيًا لكنه يقرأ `paidAmount` الذي صار كاذبًا — ويُدائن الصندوق **مرة ثانية** ويترك الذمم الدائنة برصيد **مدين** (التزام سالب مستحيل محاسبيًا). وفي الحالة الجزئية (`PARTIAL`) يقع الفساد **فورًا** بلا دفعة إضافية أصلًا |
| **الإصلاح** | الخيار (ب) من تقرير التدقيق: حارس رفض مبكر في `update()` **قبل أي عمل على قاعدة البيانات** (قبل `assertPeriodOpen` وقبل فتح المعاملة) يرمي 400 إذا كان التعديل سيغيّر المعالجة المحاسبية. المقارنة على **الحساب الدائن الفعّال** لا على النص الخام عبر `effectivePurchaseGlMethod` التي تطبّع `null` إلى `ACCOUNTS_PAYABLE` — نفس افتراضي بانِي القيد — فالتعديل المكافئ (`null` ⇄ `ACCOUNTS_PAYABLE`) يمرّ وأي انتقال يغيّر حساب الدائن يُرفض. الشرط على **الاتجاه النهائي** `PURCHASE` يغلق أيضًا الباب الثاني للثغرة: تحويل `SALES → PURCHASE` مع طريقة نقدية في الطلب نفسه (كان يمرّ لأن حارس الجهة والاتجاه القائم لا يعمل عند `paidAmount = 0`). وُحِّد كذلك تعبير دمج `paymentMethod`: القيمة المفحوصة هي عينها المكتوبة في الصف |
| **الملفات (3)** | `backend/src/modules/invoices/invoices.calc.ts` (‎+33 — `effectivePurchaseGlMethod` و`purchaseGlTreatmentWouldChange`، دالتان نقيّتان) · `backend/src/modules/invoices/invoices.service.ts` (‎+26/−2 — الحارس) · `backend/src/modules/invoices/__tests__/invoices.c1PaymentMethodGuard.test.ts` (جديد، 16 اختبارًا) |
| **Scope** | لم يُمسّ: `invoices.accounting.ts` · `gl.service.ts` · `create()` · `addPayment()` · `postInvoiceToGL`/`repostInvoiceToGL` · حساب `paidAmount` · حساب `status` · `schema.prisma` · أي مهاجرة · أي مفتاح صلاحية · أي شاشة أو واجهة · أي نقطة API جديدة · `package.json` |
| **التعرّض الفعلي** | **صفر فاتورة شراء** و**صفر قيد مشتريات** في قاعدة البيانات (كل الفواتير الـ113 مبيعات بـ`paymentMethod = null`) ⇒ لا بيانات مُتضررة، والعيب لم يُطلَق ولو مرة. ولا شاشة ترسل الحقل (`CreateInvoice`/`EditInvoice`/`invoiceFastEntry` — واختبار قائم يؤكد الإغفال)، ولا مسار الاستيراد يربطه ⇒ الحقل قابل للضبط عبر استدعاء API مباشر فقط |
| **Validation** | `prisma validate` ✅ · Backend `tsc --noEmit` ✅ · `npm run build:back` ✅ · الفواتير + المحاسبة + المصاريف **25 ملفًا / 320 اختبارًا** ✅ · حزمة الخلفية الكاملة **213 ملفًا / 3434 اختبارًا** ✅ (اختباران متخطَّيان عمدًا). كل الفحوص أُجريت **معزولةً** فوق `production` بلا أي تعديل آخر في شجرة العمل |
| **Regression analysis** | لا انحدار. خط الأساس 3418 + 16 اختبار الحزمة = **3434** بالضبط. `invoices.governance.test.ts` (5/5) و`invoices.purchasing`/`purchase-payment`/`accounting` خضراء بلا تعديل. الحارس رمي مبكر خالص: لا فرع كتابة جديد ولا استعلام إضافي ولا أثر جانبي — المسار الوحيد الذي يتغيّر سلوكه هو المسار الذي كان يُفسد الأستاذ العام |
| **عمل لاحق مسجَّل** | بما أن الإصلاح **يمنع** العملية بدل أن يصححها، فأي نية لاحقة لكشف «طريقة الدفع» في شاشة فاتورة الشراء تحتاج مسار تصحيح صريحًا على غرار `amend` في المصاريف (فُكّ الترحيل ← عدّل ← أعد الاعتماد). حزمة مستقلة، وليست شرطًا لهذه |
| **Branches** | جميع فروع الميزات محفوظة — لم يُحذف أي فرع |

---

## Previous Release — Production Release 2026.5.5

| Field | Value |
|-------|-------|
| **Package** | Production Release 2026.5.5 — إصدار تغليف. يجمع كل Feature Releases المدموجة على `production` منذ مثبِّت 2026.5.4 في مثبِّت Windows جديد مكتفٍ ذاتيًا. لا عمل ميزات جديد في هذا الإصدار نفسه |
| **Release status** | RELEASED — Product Owner manual visual & functional review **completed and approved** prior to release authorization; not re-performed during release |
| **Release commit** | `90f6f0bf` — `chore(release): Production Release 2026.5.5` (`package.json` `2026.5.4` → `2026.5.5`، الملف الوحيد المتغيّر) |
| **Merge** | `95f67a9c` — `--no-ff` merge of `feature/production-release-2026.5.5` |
| **Tags** | `stable-production-release-2026.5.5` → `95f67a9c` · `checkpoint-production-release-2026.5.5` → `460a45dc` (production HEAD قبل الإصدار مباشرةً) |
| **Contents (first time in an installer)** | **Employee Compensation — Batch Printing v1** (`78cbab4b`، merge `876f0ff8`) · **Migration History Reconciliation v1** (`99b89c68`، merge `bd15959f`) · **XBRL Readiness Foundation v1** (`2d221663`، merge `66f03cf7`) · **Vehicle Insurance Management v1** (`b80b8c4b`، merge `581ad7ee`) |
| **Scope** | لا تغيير مخطط، لا ترحيل جديد، لا مفتاح صلاحية جديد، لا اعتمادية جديدة. 69 مجلد ترحيل و`migrate status`: «Database schema is up to date» |
| **Prisma packaging defect — recurred and neutralised** | عميل Prisma في جذر `node_modules` كان متأخّرًا عند **75 نموذجًا** مقابل **85** في المخطط. `prepare-backend-deps.js` ينسخ نسخة الجذر إلى الحزمة بينما `prisma generate` يكتب في `backend/node_modules/.prisma`، فتتوقّف نسخة الجذر عن التتبّع صامتةً. طُبِّق الحل الإلزامي: `npm run db:generate` ثم نسخ `.prisma` و`@prisma/client` فوق نظيريهما في الجذر **قبل** `npm run dist`. العميل المشحون تُحقِّق منه: **85 نموذجًا ومجموعة نماذج مطابقة تمامًا للمخطط — صفر ناقص وصفر زائد**، في `win-unpacked` وبالاستخراج من داخل `Setup.exe`. **السبب الجذري ما زال قائمًا في المصدر** ويبقى عملًا لاحقًا مطلوبًا |
| **Golden Database** | SHA-256 `f62a08a874f40baf7a600732605ea4e276a1a8621472b400f27c2a13e52e041c`، 3,866,624 بايت، `integrity_check = ok`، 0 مخالفة مفتاح أجنبي، 86 جدولًا (85 نموذجًا + `_prisma_migrations`، وكلّ الـ85 مُثبَت وجودها)، 69 ترحيلًا مطبَّقًا (آخرها `20260819120000_add_xbrl_readiness_foundation`) — مطابقة بايتًا ببايت في **أربعة** مواضع: المصدر · `win-unpacked` · مستخرجة من داخل `Setup.exe` (`cmp` خرج 0) · و`seed-data/golden-manifest.json`. لا ملف journal ساخن بجوار المصدر وقت التغليف، وهاش المصدر لم يتغيّر بعد البناء الكامل |
| **Golden Manifest** | `{ sha256: f62a08a8…e041c, sizeBytes: 3866624, dataModifiedAt: 2026-08-19T13:57:47.120Z, packagedAt: 2026-08-19T14:10:23.647Z }` — مطابق في `build/seed-data` و`win-unpacked` وداخل `Setup.exe` |
| **Installer** | `AlManarERP-Setup-2026.5.5.exe`، 138,437,006 بايت (132.02 MiB)، SHA-256 `706e79e7e3ac239f336e3aebf3b3c5c1ad34b4b4932179ba7c22876bed636a2c`. `win-unpacked`: 3,376 ملفًا / 470,061,262 بايت (448.3 MiB). صفر متطلبات تشغيل خارجية على وندوز 10/11 نظيف |
| **Packaging audit** | 4,108 مدخلًا في `Setup.exe` + 686 مدخلًا في `app.asar` — صفر source maps، صفر `__tests__`، صفر `*.test.*`/`*.spec.*`، صفر `.ts`/`.tsx`/`.d.ts`، صفر `.pem`/`.key`/`.pfx`/`.crt`، صفر journals، صفر `.bak`، صفر محرّكات Prisma أصلية لغير وندوز، صفر ملفات حالة من جهاز البناء. ملف `.db` واحد فقط. مطابقة `.env` وحيدة فُحصت وهي إيجابية كاذبة (`@dabh/diagnostics/adapters/process.env.js`) |
| **Validation** | Backend/Frontend/Electron `tsc --noEmit` ✅ · `prisma validate` ✅ · `migrate status` 69/69 ✅ · `npm run dist` ✅ (خرج 0) · Backend **212 ملفًا / 3418 اختبارًا** ✅ (اختباران متخطَّيان عمدًا) · Frontend **223 ملفًا / 4088 اختبارًا** ✅ · Electron **26 ملفًا / 499 اختبارًا** ✅ (أُعيد تشغيلها بعد رفع الإصدار للتحقّق من عقد الإصدار في اختبار التغليف) |
| **Regression analysis** | لا انحدار. عدد الاختبارات ارتفع من 3230→**3418** (خلفية) و4024→**4088** (واجهة) منذ 2026.5.3، وElectron ثابت عند 499؛ صفر فشل في الأساس. لا ملف مصدر عُدِّل في هذا الإصدار عدا `package.json` |
| **Branches** | جميع فروع الميزات محفوظة — لم يُحذف أي فرع |

---

## Previous Release — Vehicle Insurance Management v1

| Field | Value |
|-------|-------|
| **Package** | Vehicle Insurance Management v1 — تأمين المركبات. وحدة تشغيلية مستقلة: وثائق التأمين، سجل الحوادث، حالة الوثيقة المشتقّة من تاريخ الانتهاء، تقرير داخل مركز التقارير، وتصدير Excel. **Source-only release** — لا installer، `package.json` يبقى `2026.5.4` |
| **Release status** | RELEASED — Product Owner manual visual & functional review **completed and approved**، بلا ملاحظات حاجبة |
| **Merge** | `581ad7ee` — `feature/vehicle-insurance-recovery-v1` (feature commit `b80b8c4b`، 24 ملفًا: 12 جديدًا و12 معدَّلًا) |
| **Tags** | `stable-vehicle-insurance-management-v1` → `581ad7ee` · `checkpoint/pre-vehicle-insurance-v1` → `13f5ee47` (production HEAD قبل الدمج مباشرةً؛ هدفه السابق محفوظ في `checkpoint/pre-vehicle-insurance-v1-original-attempt-2026-08-18`) |
| **استعادة لا تنفيذ جديد** | نُفِّذت الحزمة في `353e71d0` على `feature/vehicle-insurance-v1` بتاريخ 2026-08-19 ولم تصل production قط: فرع «الطباعة الجماعية» أُنشئ فوقها فورث commitيها، ثم أُعيد بناؤه عند الإصدار بـ`rebase --onto production` فسقطا من خطّ العمل — تضييق نطاق مقصود ومسجَّل وقتها. **الكود لم يُحذف قط**: لا يوجد في المستودع commit حذف واحد لأي من ملفات الحزمة. الاستعادة تمّت بـ`merge --squash` من الفرع الأصلي كمصدر وحيد، والملفات الاثنا عشر المملوكة للحزمة **مطابقة بايتًا** لنسختها فيه |
| **Scope** | جدولان جديدان فقط (`vehicle_insurance_policies`، `vehicle_accidents`) بمفتاح أجنبي إلى `equipment` بـ`onDelete: Cascade`. **لا قيود محاسبية ولا مصروفات ولا صيانة ولا تعويضات.** `equipment.insuranceExpiry` الذي يقرأه «مركز انتهاء الوثائق» **لم يُمسّ** — لا تكتب فيه الوحدة ولا تقرأ منه. التجديد يُنشئ وثيقة جديدة ولا يعدّل القديمة، والحوادث سجل تاريخي دائم: لا مسار حذف في الخدمة ولا مفتاح صلاحية `delete` |
| **Migration** | **لا ترحيل جديد.** `20260818120000_add_vehicle_insurance` مطبَّق مسبقًا وموجود على production منذ **Migration History Reconciliation v1**؛ لم يُمسّ. 69 مجلد ترحيل، و`migrate status`: «Database schema is up to date» |
| **Prisma** | `VehicleInsurancePolicy` و`VehicleAccident` كانا معلنَين على production كنماذج بنيوية منذ حزمة المواءمة، فلم يُكرَّرا — نُقلا إلى قسمهما الأصلي وحُدِّثت ترويسة كتلة المواءمة فلم تعد تصف الوحدة بأنها غير مُفعَّلة. المخطط **85 نموذجًا** كما هو |
| **Permissions** | `vehicleInsurance.read` · `.create` · `.update` · `.export` — أربعة تحرس مسارات وأربعة مبذورة، تطابق تام. `EQUIPMENT_MANAGER` صلاحية كاملة (مالك الوحدة)، `ACCOUNTANT` قراءة وتصدير فقط. لا `delete` ولا `approve` بالتصميم |
| **Integration** | Route `/vehicle-insurance` + lazy import · عنصر قائمة `nav.vehicle_insurance` تحت `vehicleInsurance.read` · راوتر `/api/vehicle-insurance` · تقرير `vehicle-insurance` داخل مركز التقارير · 154 مفتاح i18n · `exportFilename` |
| **Conflicts resolved (7)** | `constants.ts` (2) · `app.ts` (2) · `seed.ts` (1) · `schema.prisma` (3، تعليقات فقط) · `routerFutureFlags.test.tsx` (1). كلها «كلا الطرفين أضاف في المكان نفسه» وحُلّت بالاحتفاظ بالطرفين. **لم يُستبدل أي سطر من production بنسخة أقدم**: السطران الوحيدان المحذوفان وظيفيًا هما صلاحيات `EQUIPMENT_MANAGER` (استُبدلت بنسخة تشملها + `vehicleInsurance`) وعدّاد المسارات الكسولة؛ كل ما عداهما تعليقات |
| **Pre-existing issue fixed in passing** | تأكيد `routerFutureFlags.test.tsx` كان `64` بينما الفعلي على production **65** — تأكيد متجاوَز كان مسجَّلًا في `AI_CONTEXT.md` ضمن العمل المعلَّق. صُحِّح إلى **66** بعدّ فعليّ من `App.tsx` بعد إضافة المسار |
| **Integrity checks** | 76 مسارًا · 35 عنصر قائمة · 66 استيرادًا كسولًا — **صفر تكرار، صفر عنصر قائمة بلا مسار، صفر استيراد مكسور، صفر مفتاح صلاحية يحرس مسارًا بلا بذر، صفر ملف يتيم** · 51 mount لـAPI بلا تكرار · 43 وحدة في MODULES بلا تكرار |
| **Validation** | `prisma generate` ✅ (نجح نظيفًا بعد إغلاق تطبيق Electron الذي كان يقفل محرّك Prisma) · `prisma validate` ✅ · `migrate status` 69/69 ✅ · Backend/Frontend/Electron `tsc --noEmit` ✅ · `build:back` ✅ · `build:front` ✅ · Backend **212 ملفًا / 3418 اختبارًا** ✅ · Frontend **223 ملفًا / 4088 اختبارًا** ✅ · Electron **25 ملفًا / 488 اختبارًا** ✅ — كلها بعد الدمج على `production` |

---

## Previous Release — XBRL Readiness Foundation v1

| Field | Value |
|-------|-------|
| **Package** | XBRL Readiness Foundation v1 — جاهزية XBRL. طبقة تحضيرية مستقلة فوق النظام المحاسبي، تجعل إضافة Taxonomy الكويتية (QAYD) لاحقًا ممكنةً بلا إعادة تصميم أي شيء محاسبي. **Source-only release** — لا installer، `package.json` يبقى `2026.5.4` |
| **Release status** | RELEASED — Product Owner manual visual review **completed and approved** للتبويبات الخمسة (نظرة عامة · ربط الحسابات · ربط القوائم · التحقق · اللقطات)، بلا ملاحظات حاجبة |
| **Merge** | `66f03cf7` — `feature/xbrl-readiness-foundation-v1` (feature commit `2d221663`, 43 files) |
| **Merged on top of** | `bd15959f` — **Migration History Reconciliation v1** (`99b89c68`, 5 files) — دخلت `production` أولًا كي تبقى migration history متسقة قبل إضافة ترحيل XBRL |
| **Tags** | `stable-xbrl-readiness-foundation-v1` → `66f03cf7` · `checkpoint-xbrl-readiness-foundation-v1` → `bd15959f` (production HEAD قبل دمج XBRL مباشرةً) |
| **⚠ Compliance claim** | **النظام XBRL-ready فقط، وليس QAYD-certified.** لا توجد Taxonomy كويتية/QAYD رسمية مثبَّتة (`isOfficial` غير قابل للكتابة من أي مسار API في v1)، ولا API حكومي مفترض (لا عميل HTTP واحد في الوحدة)، ولا وسم أو namespace رسمي مكتوب في الشفرة، ولا مستند XBRL رسمي يُنتَج. أقصى حالة معروضة: `READY_PENDING_TAXONOMY` («جاهز — بانتظار تصنيف رسمي»). **لا وجود لحالة `QAYD_READY`** — يحرسه اختبار ثابت على شفرة الوحدة ومفاتيح الترجمة معًا |
| **Migration** | `20260819120000_add_xbrl_readiness_foundation` — **إضافي بحت**: ستة جداول `xbrl_*` جديدة، صفر `ALTER` على أي جدول قائم، صفر سطر بيانات يُقرأ أو يُعدَّل أو يُعاد تفسيره. التراجع المنطقي = إسقاط الجداول الستة بترتيب عكسي. `Account` يكتسب علاقة عكسية واحدة فقط (لا عمود جديد على `accounts`) |
| **Models** | `XbrlTaxonomy` · `XbrlConcept` · `XbrlAccountMapping` · `XbrlStatementMapping` · `XbrlReportingContext` · `XbrlSnapshot` — المخطط 79 → **85 model**، والترحيلات 65 → **69** (4 منها من حزمة المواءمة) |
| **Accounting isolation** | تكتب **حصرًا** في جداول `xbrl_*`. الأرصدة تُقرأ من `financialService.getTrialBalance` القائم — نفس ميزان المراجعة الذي يعرضه المركز المالي، بلا استعلام محاسبي موازٍ. لا استدعاء لأي خدمة GL، ولا مساس بقفل الفترة، ولا أثر على Payroll / Employee Compensation / Cheques / Inventory. يفرضه `__tests__/accounting.isolation.test.ts`: فحص ثابت على كل ملف مصدر في الوحدة يُسقط أي كتابة محاسبية أو استدعاء GL أو عميل HTTP يُضاف لاحقًا |
| **Validation engine** | 15 قاعدة بأكواد **ثابتة للأبد** (`ACC-001`…`ACC-004`, `RPT-001`…`RPT-004`, `MAP-001`…`MAP-006`, `EXP-001`) بشدّة ERROR/WARNING/INFO. دوال صافية على بنية في الذاكرة — بلا Prisma وبلا ساعة داخل القواعد. **النتيجة تقرير لا قفل**: `ERROR` هنا لا يمنع ترحيل قيد ولا اعتماد فاتورة ولا صرف راتب |
| **Snapshots** | غير قابلة للتعديل بنيويًا: الخدمة تكشف `create`/`list`/`getById` فقط، والراوتر بلا `PATCH`/`PUT`/`DELETE` على `/snapshots`. تجمّد بيانات الشركة والسياق وميزان المراجعة وربط الحسابات وبنود القوائم ورمز التصنيف ونسخته وحالة رسميته ونتائج التحقق ومؤشر الجاهزية وبصمة SHA-256 للمصدر. **لا تقفل السنة المالية ولا أي فترة** |
| **Export** | `FinancialReportingExporter` + مُصدِّران. `InternalPreviewExporter` يُنتج مجموعة بيانات موحَّدة موسومة صراحةً `isOfficial: false` مع تنويه عربي. `XbrlExporter` **حاجز مقصود** يرفض دائمًا في v1 بالرسالة المتفق عليها حرفيًا، ويتحقق منها اختبار بنصّها |
| **Permissions** | ثلاثة مفاتيح جديدة فقط: `xbrl.read` · `xbrl.manage` · `xbrl.snapshot` — مستقلة عن `transactions.*` و`finreports.*`. تُبذَر لـ`SYSTEM_ADMIN` و`GENERAL_MANAGER` و`ACCOUNTANT`. فعلان جديدان في `ACTIONS` (`manage`, `snapshot`) ووحدة واحدة في `MODULES` (`xbrl`) |
| **UI** | `/xbrl-readiness` — خمسة تبويبات، عربية RTL على ExplorerKit. **خارج الشريط الجانبي عمدًا**؛ تُفتح من زرّ في رأس صفحة «المحاسبة» كما تُفتح بقية الشاشات التحليلية الداخلية. 144 مفتاح i18n لكل لغة |
| **Tests** | 8 ملفات جديدة / **131 اختبارًا** ✅ (خلفية 7/113 · واجهة 1/18 — عقد نصّي يُسقط أي سلسلة أو مفتاح ترجمة يدّعي توافقًا رسميًا). فحوصات ما بعد الدمج على `production`: XBRL + migration + accounting **12 ملفًا / 153 اختبارًا** ✅ · واجهة XBRL 18 ✅ · Backend/Frontend `tsc --noEmit` ✅ · `prisma validate` ✅ |
| **Migration drift** | **صفر.** `migrate status`: «69 migrations found · Database schema is up to date». `migrate diff` فارغ في الاتجاهين (ترحيلات ← مخطط، ومخطط ← قاعدة التطوير) |
| **Scope guard** | **لا feature code من `professional-forms-designer-wip` ولا من `vehicle-insurance-v1`**: حزمة المواءمة أدخلت ملفات الترحيلات والنماذج البنيوية فقط. لا service ولا route ولا صلاحية ولا شاشة تقرأ من `professional_form_templates` / `printed_cheques` / `vehicle_insurance_policies` / `vehicle_accidents`؛ الميزتان تبقيان غير مدموجتين على فرعيهما |
| **Phase 2 (pending official spec)** | أكواد المفاهيم الرسمية والـnamespaces · قواعد التحقق التي تفرضها الجهة · بنية حزمة التقديم وصيغتها · آلية التقديم (رفع ملف أم API) · متطلبات التوقيع الإلكتروني · الخريطة المرجعية بين دليل حسابات المقاولات ومفاهيم التصنيف — **كلها غير مُخمَّنة عمدًا**. نقطة الاستئناف: `backend/src/modules/xbrl/export/exporter.ts` → `XbrlExporter.unavailableReason` |
| **Docs** | `docs/XBRL_READINESS_FOUNDATION_V1.md` (النطاق والحدود وعقد المرحلة الثانية) · `backend/src/modules/xbrl/README.md` (البنية وجدول القواعد ونقاط التوسعة) |

---

## Previous Release — Employee Compensation — Batch Printing v1

| Field | Value |
|-------|-------|
| **Package** | Employee Compensation — Batch Printing v1 — طباعة جماعية لكشوف المستحقات الشهرية وسندات صرفها لسنة كاملة، في أمر طباعة واحد ومعاينة واحدة. **Source-only release — no installer build**; `package.json` version untouched at `2026.5.4` |
| **Release status** | RELEASED — Product Owner manual visual review **completed** and explicitly confirmed prior to release authorization; not re-performed during this release |
| **Release date** | 2026-08-19 |
| **Application version** | `2026.5.4` — **unchanged**. This release ships source only; the next installer build will carry it |
| **Feature branch** | `feature/employee-compensation-batch-printing-v1` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `d73dcd25` (Production Release 2026.5.4 + its hash-closure commit) |
| **Checkpoint tag** | `checkpoint/pre-employee-compensation-batch-printing-v1` → `d73dcd25` (annotated) |
| **Feature commit** | `78cbab4b` (18 files: 12 modified, 6 new) |
| **Production merge commit** | `876f0ff8` |
| **Stable tag** | `stable-employee-compensation-batch-printing-v1` → merge `876f0ff8` (annotated) |
| **Release scope — deliberately narrowed** | The work was developed on top of `feature/vehicle-insurance-v1`, whose two commits (`353e71d0` feature + `4e4e26a5` docs — **Vehicle Insurance Management v1**) were **not** in `production` and are **not** part of this package. Merging the working branch as-is would have released that feature too, outside the approved review scope. The feature commit was therefore rebased `--onto production`, so this release contains **exactly one commit** and `git log production..feature` is empty. Vehicle Insurance Management v1 remains unreleased on its own branch, awaiting its own release |
| **What it does** | Adds a «طباعة جماعية» button on the Employee Monthly Entitlements list (behind the module's existing `employeeCompensation.print`). A dialog offers the employee, then **only the years that employee actually has statements in**; the year select stays disabled until an employee is chosen and resets when it changes, and «طباعة» stays disabled until both are set. Printing renders every existing statement for that year in ascending month order, each immediately followed by its own cash payment voucher: كشف يناير ← سند يناير ← كشف فبراير ← سند فبراير … Months with no calculation are simply absent — no artificial padding to twelve, and no duplicate document |
| **Aggregation only — the whole point** | This is a **collection and ordering of existing documents, not a new document**. No calculation is re-run, no approval is touched, no snapshot is written, and no payroll, accounting or general-ledger row is created or read. Every backend path added is read-only; a test asserts the page's source contains no `api.post`/`api.put`/`api.delete` and imports nothing from the payroll or accounting modules |
| **Identity with individual printing — structural, not by discipline** | **Data**: the new `GET /employees/:employeeId/years/:year/statements` builds each statement with the **same** `getStatementData` the individual statement route calls — there is no second data path and no parallel formula. **Templates**: `StatementTemplate` and `CashPaymentVoucherTemplate` are reused unmodified. **References and QR**: `voucherReference`, `buildVoucherQrLines` and `buildStatementQrLines` are imported from their original sources, so no reference is re-derived. **The page itself**: `FormPage` was extracted from `FormLayout` so the printable `.form-page` node is now **one component shared by both print paths** and cannot drift |
| **`FormPage` extraction (included in this package)** | `FormLayout`'s inline printable-page JSX moved verbatim into `forms/shared/FormPage.tsx` — same elements, same order, same inline styles, same classes — and `FormLayout` now renders it with identical values. Header and approval block are passed in as `ReactNode`, so profile and branding decisions stay in `FormLayout` and the extracted page owns no screen chrome. The rendered DOM of all fourteen administrative forms is unchanged; two existing tests were updated for the moved locator, not for changed behaviour |
| **Month with no cash entitlement** | A month whose derived `cashNet <= 0` has no voucher — **the same condition** the individual voucher screen already uses to refuse printing, not a second parallel rule. Its statement still prints; a blocking notice names those months (e.g. «أبريل 2026») and both print buttons stay disabled until the user explicitly acknowledges. **No voucher is created or modified**, and the notice is `.no-print` so it never reaches paper |
| **Page geometry — batch only** | Every page in the batch prints on the `letterhead` profile regardless of what the document uses individually (a batch is drawn on one stack of pre-printed company paper). Content start measured from the sheet edge: **statement 50mm**, **voucher 30mm** — absolute values in a single `BATCH_CONTENT_TOP` table from which the CSS rules are generated, so a document kind cannot exist without a defined offset. Sides and bottom come from `PRINT_PROFILES.letterhead` with no value duplicated. Margins are applied as **padding on the page with `@page` zeroed** — the same "page margin → page padding" model `FormLayout` already uses for the `ready-paper` profile — so the clearance is identical in physical print, Save PDF and the accurate preview |
| **Permissions / schema impact** | **None.** No new permission key (both new routes sit behind the module's existing `employeeCompensation.print`), no Prisma model, no migration, no column, no new dependency. `constants.ts` untouched |
| **Files** | 18 (12 modified, 6 new). New: `frontend/src/pages/EmployeeCompensationBatchPrint.tsx` · `.css` · `frontend/src/employee-compensation/BatchPrintDialog.tsx` · `frontend/src/forms/shared/FormPage.tsx` · `frontend/src/__tests__/employeeCompensationBatchPrint.test.tsx` · `backend/src/modules/employee-compensation/__tests__/batchPrintIndex.test.ts`. Modified: the compensation `controller`/`routes`/`service`, `frontend/src/App.tsx`, `employee-compensation/api.ts` · `types.ts`, `forms/shared/FormLayout.tsx`, `lib/i18n.ts`, `pages/EmployeeCompensation.tsx` · `.css`, and two existing test files |
| **Validation** | Backend `tsc --noEmit` ✅ · Frontend `tsc --noEmit` ✅ · `build:back` ✅ · `build:front` ✅ · Frontend **221 files / 4058 tests** ✅ · Backend employee-compensation module **11 files / 282 tests** ✅. All re-run on the rebased tree — the base changed from the vehicle-insurance branch to `production`, so these are genuinely new results, not a replay. 33 new tests: 27 frontend (ordering · no fabricated months · no duplicates · the cashless-month path · reference identity with individual printing · the print CSS · isolation of the 50mm/30mm offsets from individual printing) + 6 backend (print index and year statements as pure reads) |
| **Regression analysis** | Zero new regressions. The two updated existing tests changed assertion values only — the lazy-route counter (63 → 64 for the one new route) and the printable-root locator after the `FormPage` extraction. No pre-existing test moved from pass to fail and no new skip appeared |
| **Not verified in this environment** | Physical print output. No desktop session is available here, so every statement about rendered appearance rests on the Product Owner's completed visual review. Two geometry notes were recorded for that review: the statement's usable height in the batch is 227mm (297 − 50 − 20), roughly 10mm tighter than individual printing, so a month with an unusually long line list is where it would tip to a second page; and the voucher's 30mm start sits **above** the `letterhead` profile's 40mm clearance, which is a property of the physical pre-printed paper rather than of the code |
| **Remote sync** | `origin/production` — pushed with this release (feature commit `78cbab4b` + merge `876f0ff8` + documentation commit + tags `stable-employee-compensation-batch-printing-v1`, `checkpoint/pre-employee-compensation-batch-printing-v1` + branch `feature/employee-compensation-batch-printing-v1`, kept per standing policy) |
| **Excluded from this release** | The same pre-existing untracked items excluded from every recent release (`backend/src/__probe__/` · `backend/src/__livetest__/` · `zzprobe.test.ts` · `zz-probe.test.tsx` · `backend/mkfixture.mts` · `backend/delfixture.mts` · two unreferenced fonts under `frontend/src/assets/fonts/نموذج كتاب رسمي خطوط/`), the visual-review screenshots (`voucher-*.png` · `cash-*.png` · `ecmp-*.png` · `09-`/`10-*.png`) and the two import-source `docs/*.xlsx` files — all still untracked in the working tree, none staged |

## Previous Release — Production Release 2026.5.4

| Field | Value |
|-------|-------|
| **Package** | Production Release 2026.5.4 — **Comprehensive Reports — Monthly Employee Entitlements Report Pack v1**, packaged into a new self-contained Windows installer. Adds «تقرير مستحقات الموظفين الشهرية» **inside** the Comprehensive Reports centre (`Reports.tsx`) — no standalone page, no new route, no new sidebar entry |
| **Release status** | RELEASED — Product Owner manual visual **and functional** review **completed** and explicitly confirmed prior to release authorization; not re-performed during this release |
| **Release date** | 2026-08-18 |
| **Application version** | `2026.5.3` → `2026.5.4` — new installer build |
| **Feature branch** | `feature/production-release-2026.5.4` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `b018f0fc` (previous release's hash-closure commit) |
| **Checkpoint tag** | `checkpoint-production-release-2026.5.4` → `b018f0fc` (annotated) |
| **Feature commit** | `91fa744d` (the report pack — 8 files) |
| **Release commit** | `86b1b130` (version bump only) |
| **Production merge commit** | `b875f9eb` |
| **Stable tag** | `stable-production-release-2026.5.4` → merge `b875f9eb` (annotated) |
| **Data source — the whole point** | The report reads **only** the Employee Monthly Entitlements module (`EmployeeCompensationCalculation` + its earning/deduction lines). No `Payroll`, no `JournalEntry`, no general-ledger row, no bank statement — asserted by a test that mocks `payroll.findMany` and `journalEntry.findMany` and proves neither is ever called. Every amount comes from the **stored per-month totals** (`totalOvertimeAmount` · `totalOtherEarnings` · `totalDeductions` · `netAmount`) and the **employee snapshot** written at save time (`basicSalarySnapshot` and siblings), never from the live employee file and never recomputed — a historical statement therefore reports what was actually approved for that month, not what today's engine would produce. **No calculation logic in the entitlements module was touched** |
| **Columns (16)** | الرقم الوظيفي · اسم الموظف · المسمى الوظيفي · القسم · السنة · الشهر · الراتب الأساسي · العمل الإضافي · المكافآت · البدلات · استحقاقات أخرى · الاستقطاعات · الديون المسددة · صافي المستحق · حالة الكشف · تاريخ الاعتماد. Zero technical/internal columns (`id`, `employeeId`, `calculationId`, `hourlyRateSnapshot`, `legalRulesVersion`, `createdAt`, `updatedAt` all asserted absent). All eight monetary columns are `format: 'currency'` with `numFmt '#,##0.000'` |
| **Earnings classification — derived by subtraction, deliberately** | The module stores six earning types. The report maps them to the module's own Arabic labels (`employee-compensation/labels.ts`): **المكافآت** = `BONUS`\|`GRANT`\|`INCENTIVE`, **البدلات** = `ALLOWANCE`. **استحقاقات أخرى is derived by SUBTRACTION** from the stored `totalOtherEarnings` rather than by summing an enumerated list — so a future earning type surfaces in that column instead of silently vanishing from the table. Consequence: the row equation `basic + overtime + bonuses + allowances + other − deductions = net` **always closes**, verified over all **395 statements** in the development database with **zero mismatches**. In the current data every earning line is `CUSTOM`, so all extra entitlements correctly land in «استحقاقات أخرى» |
| **«الديون المسددة» is explanatory, not additive** | `DEBT_REPAYMENT` lines are already **inside** `totalDeductions`; the column shows how much of the deduction was debt repayment and is never subtracted a second time. Disclosed in the department section's note and in the deductions KPI hint |
| **Filters** | السنة · الشهر · الموظف · القسم · حالة الكشف (DRAFT/APPROVED), with "all employees or one" being the natural absence/presence of the employee filter. Department filters on **`departmentSnapshot`** — the statement's own snapshot, not the live employee file — asserted by test. No filter means "all": no implicit date range and no silent row cap. All five translate into a single explicit Prisma `where` |
| **Permissions — no new key** | Reuses the module's existing `employeeCompensation.read`, added to `REPORT_EXTRA_PERMISSION` in `reports.routes.ts` following the `payroll: 'payroll.read'` precedent, so the reports centre cannot become a back door to payroll-grade data for a user who holds `reports.read` alone. `SYSTEM_ADMIN` bypasses as always. **Zero new permission keys; `constants.ts` untouched** |
| **Zero impact on existing reports** | Table tooling (column sort · quick search · coloured status chips) is **opt-in per report** via the new optional `tableTools`/`statusColumnKey`/`totalsLabelKey` fields; a report that does not declare them renders exactly the markup it rendered before — no tools bar, no clickable headers, server `totalsRow` verbatim. Pinned by a dedicated regression test asserting `.rcx-table-tools`, `.rcx-sort-btn` and `.rcx-table--tools` are all absent for an existing report. Every new CSS rule is scoped under those same two classes |
| **Honest totals under quick search** | While a quick-search query is active the totals row is **recomputed from the visible rows** for currency columns and relabelled «إجمالي نتائج البحث», rather than showing server totals over a filtered set. With no query the server's row renders verbatim |
| **Print / PDF / Excel** | All three go through the **untouched** shared report engine. Print: A4 landscape (the report emits analytical sections, which is what selects landscape in `ReportPrint.tsx`), repeating column headers via `thead`/`table-header-group`, page counter `صفحة X من Y`, title, period line and all final totals. The period line also carries the **date and time of issue** — injected into this report's own subtitle via an explicit `generatedAt` passed by the service, so the shared print header (used by 17 other reports) was **not** modified. PDF: same HTML path through Electron `printToPDF`. Excel: 3 sheets (main + «حسب القسم» + «حسب الحالة») preserving column order, 3-decimal KWD formatting and the totals row |
| **Schema impact** | **None.** No Prisma model, no migration, no column, no new permission key, no new dependency. `migrate status` stays 64/64; the installer ships the same 64 migrations and 75 models as 2026.5.3 |
| **Validation** | Backend `tsc --noEmit` ✅ · Frontend `tsc --noEmit` ✅ · Electron `tsc --noEmit` ✅ · `prisma validate` ✅ · `migrate status` 64/64 applied ✅ · Backend 201 files/3257 tests ✅ (2 intentionally-skipped leftover diagnostic stubs, pre-existing) · Frontend 220 files/4030 tests ✅ · Electron 26 files/499 tests ✅ · `build:back`/`build:front`/`electron:build`/`npm run dist` ✅ (exit 0). Every check re-run on `production` after the merge; the merged tree is byte-identical to the reviewed branch tree (`git diff feature..production` empty) |
| **Regression analysis** | Zero new regressions. Against the 2026.5.3 baseline (Backend 3230 · Frontend 4024 · Electron 499) the suites grew to Backend 3257 (+27) · Frontend 4030 (+6) · Electron 499 (unchanged) — the deltas match the two new test files **exactly** (27 backend, 6 frontend), so no pre-existing test changed state, none moved from pass to fail, and no new skip appeared. The 2 backend skips are the same pre-existing untracked diagnostic stubs |
| **Packaging verification** | `app.asar` listed directly (679 entries) · `win-unpacked` walked (3,350 files / 469,399,374 bytes) · all **4,072** entries of `Setup.exe` enumerated via `7za l -slt`. Zero source maps, zero `__tests__`, zero `*.test.*`/`*.spec.*`, zero `.ts`/`.d.ts`/`.tsx`, zero `.env`/`.pem`/`.key`/`.pfx`/`.crt`, zero SQLite journals, zero `.bak`/backup databases, zero non-Windows Prisma engines, and zero build-machine state files (`gdrive-token.dat`/`device-identity.json`/`sync-metadata.json`/`gdrive-account.json`/`security.json`). Exactly **one** `.db` file ships (`resources\backend\data\manar.db`). Present and confirmed: 64 Prisma migrations, `schema.prisma`, `backend/dist/server.js`, `app.asar`, `gdrive-oauth-client.json`, `runtime-requirements.json` (reporting zero external prerequisites), `seed-data/golden-manifest.json`. One `.env`-pattern hit was inspected and is a false positive — `@dabh/diagnostics/adapters/process.env.js`, a normal JS module of a winston dependency; zero actual dotenv files ship |
| **Packaged Prisma client freshness (mandatory check)** | **PASS.** The known `prepare-backend-deps.js` defect — it overlays the **repo-root** generated client, which `prisma generate` stops refreshing once `backend/node_modules` exists — **did not bite this release**: with no schema change since 2026.5.3 both the repo-root and the `backend/node_modules` clients were already at 75 models and byte-identical to each other, and `prisma generate` refreshed the repo-root copy that packaging consumes. Verified after packaging by extracting `resources\backend\node_modules\.prisma\client\schema.prisma` from inside `AlManarERP-Setup-2026.5.4.exe`: **118,928 bytes, 75 models**, semantically identical to `backend/prisma/schema.prisma` (the 121,203-byte source differs only by the generator's whitespace re-alignment and CRLF line endings — same 2,341 lines, same models, same fields). `prepare-backend-deps.js` was again deliberately left unchanged — a source fix outside this release's reviewed scope, still recorded as required follow-up |
| **Golden Database — refreshed this release** | SHA-256 `8ecaa3988d8171c6f861468177943fedb9be3427c3f4ef51a219cc4a0f51b585`, 3,686,400 bytes, `integrity_check = ok`, 0 foreign-key violations, 64/64 applied migrations (latest `20260817150000_add_earning_line_hours_rate`), 395 entitlement calculations. **Replaces** 2026.5.3's `add54d68…`/4,243,456 bytes — the Product Owner confirmed the current development database as the approved one for this release. 78 tables against 2026.5.3's 79: the schema-completeness check proves **all 75 schema models have their tables present** (78 = 75 models + `_prisma_migrations` + 2 legacy non-schema tables `professional_form_templates` and `printed_cheques`), so nothing the application needs is missing. Verified byte-identical in **four** places: source `backend/data/manar.db` · `release/win-unpacked/resources/backend/data/manar.db` · extracted directly from inside `AlManarERP-Setup-2026.5.4.exe` via `7za` (`cmp` exit 0) · and `seed-data/golden-manifest.json`, which records the identical hash and size in `build/`, in `win-unpacked` and inside `Setup.exe`. No hot journal (`-wal`/`-shm`/`-journal`) existed beside the source at packaging time, and the source hash was unchanged after the full build. Integrity was checked on a byte-identical copy so the shipped file was never opened by a writer |
| **Installer artifact** | `AlManarERP-Setup-2026.5.4.exe` — 138,339,925 bytes (131.93 MiB), SHA-256 `3f79dae177b809d92733f8015f797ba0d98a6314f0e8e92c65152256edbe1aca`, Windows 10/11 x64, per-user install, zero external runtime prerequisites. `release/win-unpacked` 3,350 files / 469,399,374 bytes (447.7 MiB) |
| **GUI/install-flow verification** | Not driven interactively — no desktop session available in this environment. Covered by the Product Owner's completed manual visual and functional review, confirmed prior to this release authorization |
| **Files** | 9 (6 modified, 3 new): `backend/src/modules/reports/employeeEntitlementsReport.ts` (new) · `backend/src/modules/reports/__tests__/reports.employeeEntitlements.test.ts` (new) · `frontend/src/pages/__tests__/reportsEntitlementsTable.test.tsx` (new) · `backend/src/modules/reports/reports.service.ts` · `backend/src/modules/reports/reports.routes.ts` · `frontend/src/pages/Reports.tsx` · `frontend/src/pages/Reports.css` · `frontend/src/lib/i18n.ts` · `package.json` |
| **Note — dev environment was live at start** | The dev app was running when this release began (backend on `:48211`, Vite on `:5173`), holding `backend/data/manar.db` open for write. The Product Owner closed it on request; the database was then confirmed lock-free, sidecar-free and unchanged both before and after packaging |
| **Known non-blocking limits (documented, not defects introduced here)** | (1) The report returns **all** matching rows with no server-side pagination — 395 statements today; sort and quick search are client-side. Revisit if statement volume reaches several thousand. (2) Print is A4 landscape **because** the report emits analytical sections; removing those sections in a future change would silently return it to portrait, where 16 columns do not fit. (3) The report requires `employeeCompensation.read` in addition to `reports.read` — roles that should see it must hold that key |
| **Required follow-up (not in this release)** | (1) `scripts/prepare-backend-deps.js` still sources the generated Prisma client from the repo root — until it generates the client as part of `npm run dist` (or prefers `backend/node_modules/.prisma`), every future installer must have its packaged client freshness re-verified by hand, as was done here. (2) `package-lock.json`'s `version` field is stale at `2026.4.0`; it was not touched here and the released tree is byte-identical to the reviewed and packaged tree. (3) Both `lint` scripts invoke `eslint`, which is neither installed nor declared in `backend/package.json` or `frontend/package.json`, so `npm run lint` fails with "not recognized" in both workspaces — pre-existing and outside this release's documented validation set |
| **Excluded from this release** | Same pre-existing untracked items excluded from every recent release (`backend/src/__probe__/` · `backend/src/__livetest__/` · `zzprobe.test.ts` · `zz-probe.test.tsx` · `backend/mkfixture.mts` · `backend/delfixture.mts` · two unreferenced fonts under `frontend/src/assets/fonts/نموذج كتاب رسمي خطوط/`), plus the visual-review screenshots (`voucher-*.png` · `cash-*.png` · `ecmp-*.png` · `09-`/`10-*.png`) and the two import-source `docs/*.xlsx` files |

## Previous Release — Production Release 2026.5.3

| Field | Value |
|-------|-------|
| **Package** | Production Release 2026.5.3 — packages into a new self-contained Windows installer the three Employee Compensation packs already merged onto `production` since the 2026.5.2 installer: **Daily Overtime Ledger & Legal Compliance Engine v1**, **Hourly Detail + Cash Entitlement Statement + KD/hour Display v1**, and **Cash Payment Voucher v1** — each already merged, tagged and documented in its own entry below. `package.json` version `2026.5.2` → `2026.5.3` is the only tracked-file change |
| **Release status** | RELEASED — Product Owner manual visual **and functional** review **completed** and explicitly confirmed prior to release authorization; not re-performed during this release |
| **Release date** | 2026-08-17 |
| **Application version** | `2026.5.2` → `2026.5.3` — new installer build |
| **Feature branch** | `feature/production-release-2026.5.3` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `2745f97d` (previous release's hash-closure commit) |
| **Checkpoint tag** | `checkpoint-production-release-2026.5.3` → `2745f97d` (annotated) |
| **Release commit** | `cf54b383` (version bump only) |
| **Production merge commit** | `b109cfae` |
| **Stable tag** | `stable-production-release-2026.5.3` → merge `b109cfae` (annotated) |
| **What is new in this installer** | First installer to ship migrations `20260816120000_add_overtime_day_entry` and `20260817150000_add_earning_line_hours_rate`, the `OvertimeDayEntry` model (75th model), and the `CompensationEarningLine.hours`/`.rate` columns. The 2026.5.2 installer shipped 62 migrations and 74 models; this one ships **64 migrations and 75 models** |
| **Validation** | Backend `tsc --noEmit` ✅ · Frontend `tsc --noEmit` ✅ · Electron `tsc --noEmit` ✅ · `prisma validate` ✅ · `migrate status` 64/64 applied ✅ · Backend 200 files/3230 tests ✅ (2 intentionally-skipped leftover diagnostic stubs, pre-existing) · Frontend 219 files/4024 tests ✅ · Electron 26 files/499 tests ✅ · `build:back`/`build:front`/`electron:build`/`npm run dist` ✅ (exit 0). Every check re-run on `production` after the merge; the merged tree is byte-identical to the reviewed branch tree (`git diff feature..production` empty) |
| **Regression analysis** | Zero new regressions. Against the 2026.5.2 baseline (Backend 3132 · Frontend 3959 · Electron 499) the suites grew to Backend 3230 (+98) · Frontend 4024 (+65) · Electron 499 (unchanged), with no test moving from pass to fail and no new skip. The 2 backend skips are the same pre-existing untracked diagnostic stubs |
| **Packaging verification** | `app.asar` listed directly (679 entries) · `win-unpacked` walked (3,349 files / 469,929,987 bytes) · all 4,070 entries of `Setup.exe` enumerated via `7za l -slt`. Zero source maps, zero `__tests__`, zero `*.test.*`/`*.spec.*`, zero `.ts`/`.d.ts`/`.tsx`, zero `.env`/`.pem`/`.key`/`.pfx`/`.crt`, zero SQLite journals, zero `.bak`/backup databases, zero non-Windows Prisma engines, zero Prisma engine `.tmp` leftovers, and zero build-machine state files (`gdrive-token.dat`/`device-identity.json`/`sync-metadata.json`/`gdrive-account.json`/`security.json`). Exactly **one** `.db` file ships, in both `win-unpacked` and `Setup.exe`. Present and confirmed: 64 Prisma migrations, `schema.prisma`, `backend/dist/server.js`, `app.asar`, `gdrive-oauth-client.json`, `runtime-requirements.json` (reporting zero external prerequisites) |
| **Packaged Prisma client freshness (mandatory check)** | **PASS.** The known defect in `scripts/prepare-backend-deps.js` — it overlays the **repo-root** generated client, which `prisma generate` stops refreshing once `backend/node_modules` exists — reproduced again in this release: the root client was stale at **74 models** (dated 2026-08-16) while the freshly generated `backend/node_modules` client carried **75**. The documented workaround was applied before packaging (regenerate, then copy `backend/node_modules/.prisma` and `@prisma/client` over their repo-root counterparts). Verified after packaging by extracting `resources\backend\node_modules\.prisma\client\schema.prisma` from inside `AlManarERP-Setup-2026.5.3.exe`: **118,928 bytes, 75 models, matching `backend/prisma/schema.prisma` exactly**, with `OvertimeDayEntry` present. `prepare-backend-deps.js` was again deliberately left unchanged — a source fix outside this release's reviewed scope, still recorded as required follow-up |
| **Golden Database** | SHA-256 `add54d689e0abab964640e6f5ff893a16130d2502dd59202244010fce3930d08`, 4,243,456 bytes, `integrity_check = ok`, 0 foreign-key violations, 79 tables, 64 applied migrations (latest `20260817150000_add_earning_line_hours_rate`) — the latest approved development database, verified byte-identical in **four** places: source `backend/data/manar.db` · `release/win-unpacked/resources/backend/data/manar.db` · extracted directly from inside `AlManarERP-Setup-2026.5.3.exe` via `7za` (`cmp` exit 0) · and `seed-data/golden-manifest.json`, which records the identical hash and size. No hot journal (`-wal`/`-shm`/`-journal`) file existed beside the source at packaging time, and the source hash was unchanged after the full build. Integrity was checked on a byte-identical copy so the shipped file was never opened by a writer |
| **Installer artifact** | `AlManarERP-Setup-2026.5.3.exe` — 138,367,645 bytes (131.96 MiB), SHA-256 `204c3e4cb54cfe1aed8553b6dbd64729b7d5502e7b071a8de1094eb96f1f9937`, Windows 10/11 x64, per-user install, zero external runtime prerequisites. `release/win-unpacked` 3,349 files / 469,929,987 bytes (448.2 MiB) |
| **GUI/install-flow verification** | Not driven interactively — no desktop session available in this environment. Covered by the Product Owner's completed manual visual and functional review, confirmed prior to this release authorization |
| **Schema impact** | None introduced by this release — no schema change, no migration, no new permission key. The 64 migrations shipped are those already applied and documented in their own release entries |
| **Files** | 1 (`package.json`) |
| **Note — dev environment was live at start** | The dev app was running when this release began (backend on `:48211`, Vite on `:5173`), holding `backend/data/manar.db` open for write and causing `prisma generate` to fail. The Product Owner closed it on request; the database was then confirmed lock-free, sidecar-free and unchanged before packaging |
| **Required follow-up (not in this release)** | (1) `scripts/prepare-backend-deps.js` still sources the generated Prisma client from the repo root — until it generates the client as part of `npm run dist` (or prefers `backend/node_modules/.prisma`), every future installer must have its packaged client freshness re-verified by hand, as was done here. (2) `package-lock.json`'s `version` field is stale at `2026.4.0`; `npm install` rewrites it to the current version, so the working tree dirties on every install. Deliberately reverted here to keep the released tree byte-identical to the reviewed and packaged tree. (3) Both `lint` scripts invoke `eslint`, which is neither installed nor declared in `backend/package.json` or `frontend/package.json`, so `npm run lint` fails with "not recognized" in both workspaces — pre-existing and outside this release's documented validation set |
| **Excluded from this release** | Same pre-existing untracked items excluded from every recent release (`backend/src/__probe__/` · `backend/src/__livetest__/` · `zzprobe.test.ts` · `zz-probe.test.tsx` · `backend/mkfixture.mts` · `backend/delfixture.mts` · two unreferenced fonts under `frontend/src/assets/fonts/نموذج كتاب رسمي خطوط/`), plus the visual-review screenshots (`voucher-*.png` · `cash-*.png` · `ecmp-*.png` · `09-`/`10-*.png`) and the two import-source `docs/*.xlsx` files |

## Previous Release — Employee Compensation — Cash Payment Voucher v1

| Field | Value |
|-------|-------|
| **Package** | Employee Compensation — Cash Payment Voucher / سند صرف نقدي v1 — زر «طباعة سند صرف» بجانب «طباعة الكشف»، يُخرج **سند استلام نقدي** على ورق الشركة الرسمي بكل بياناته من الحسبة الشهرية نفسها بلا إدخال يدوي |
| **Release status** | RELEASED — Product Owner manual visual review **completed** and explicitly confirmed prior to release authorization |
| **Release date** | 2026-08-17 |
| **Application version** | `2026.5.2` (unchanged — frontend-only pack, no installer rebuild) |
| **Feature branch** | `feature/ecmp-cash-payment-voucher-v1` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `714d0cc3` (previous release's hash-closure commit) |
| **Checkpoint tag** | `checkpoint-ecmp-cash-payment-voucher-v1` → `714d0cc3` (annotated) |
| **Feature commit** | `41550bdc` |
| **Production merge commit** | `bd9d5b47` |
| **Stable tag** | `stable-ecmp-cash-payment-voucher-v1` → merge `bd9d5b47` (annotated) |
| **1 — Button beside the statement, same data source** | «طباعة سند صرف» في مجموعة أزرار شاشة الشهر نفسها إلى جانب «طباعة الكشف»، بنفس نظام التصميم بلا إعادة تصميم شريط. السند يقرأ **الحسبة الشهرية نفسها** عبر مسار `statement` القائم: لا نموذج إدخال، ولا إعادة كتابة للموظف أو الشهر أو المبالغ أو البنود |
| **2 — Voucher amount = cash, not the stored net** | `Voucher Cash Amount = netAmount − basicSalarySnapshot` عبر `deriveCashEntitlement` نفسها التي يستعملها الكشف والتقرير ورمز التحقق — **لا منطق ثانٍ في القالب** (محروس باختبار يمنع أي عملية طرح داخله). الراتب الأساسي يظهر للمعلومية ومعه `تم تحويله إلى البنك / Transferred to Bank`، ولا يدخل المبلغ المصروف: ورقةٌ يوقّعها الموظف باستلام نقد لا يجوز أن تحمل راتبًا وصل حسابه البنكي قبل أيام. أمثلة مثبَّتة: ١٥٠ أساسي/٢٥٠ مخزَّن ⇒ ١٠٠ · سليمان ٤٥٠/٥٧٠ ⇒ ١٢٠ · مع خصم ٢٠ ⇒ ٨٠ (الأساسي يُطرح مرة واحدة) |
| **3 — Cloned from the administrative voucher, which was not touched** | استُنسخت اللغة البصرية لـ`forms/PaymentVoucherTemplate.tsx`: لون الهوية `#2b2e83` · صندوق العنوان · خلايا التسمية الزرقاء · حدود `1.2px #b9bccd` · صندوق المبلغ الأخضر · الخطوط المنقّطة. القالب الإداري **لم يُعدَّل بحرف** — تعميمه ليخدم مستندين كان يعني حشوه بأعلام شرطية تغيّر سلوك مستند مطبوع قائم. ثلاثة اختبارات تحرس بقاءه كما هو |
| **4 — A4 · one page · 40mm top · ≥20mm bottom** | ملف تعريف «ورق الشركة الرسمي» هو المواصفة نفسها (٤٠مم أعلى · ٢٠مم أسفل)، فلا فاصل علوي إضافي. القياس الفعلي: النطاق ٢٣٦٫٩مم · المستخدَم ٢٢٧٫٩مم · فائض ٩٫٠مم؛ وشهرٌ بأربعة بنود — الأكثر في البيانات — يبقى صفحة واحدة، وبندٌ خامس يبقى ضمن الميزانية (١٩٣٫٨ من ١٩٩٫١مم). بلغ ذلك بتقليص المساحات الفارغة وحدها: **لا حقل حُذف ولا خطّ صُغّر إلى ما دون القراءة** |
| **5 — No electronic header or footer** | الورقة تحمل ترويسة الشركة وتذييلها مطبوعين، فلا يرسم النظام شيئًا منهما: `blankHeader` + `hideFormNumber` + `hideApprovalSection` + العلم الجديد `hideTitleRule`. لا رقم صفحة، ولا «أُنشئ بواسطة»، ولا عنوان URL |
| **6 — Tafqeet reused, applied to the cash amount alone** | `lib/tafqeet.amountToWordsKWD` — **نفس** مُفقِّط سند الصرف الإداري والشيكات، بالعربية والإنجليزية، ولا نظام تفقيط جديد. المُفقَّط هو الصافي النقدي وحده: محروس باختبار يثبت أن تفقيط الصافي المخزَّن والراتب الأساسي **لا يظهر** |
| **7 — Deterministic QR with no print date or time** | خمسة أسطر ثابتة: مرجع السند · اسم الموظف · الرقم الوظيفي · الشهر/الفترة · صافي المبلغ المصروف نقدًا. إعادة الطباعة تُنتج المحتوى نفسه بايتًا ببايت — سندٌ يتغيّر رمزه بإعادة طبعه يفقد قيمته إثباتًا. محروس باختبار يرفض أي نمط تاريخ أو وقت أو `printDate`/`printedAt`/`timestamp`/`generatedAt`، والقالب لا يستدعي ساعة الجهاز إطلاقًا |
| **8 — Signature block simplified by owner decision** | «المستلم / Received By» متمركز وتحته فراغ للتوقيع اليدوي — بلا حقول «الاسم/التوقيع» وبلا كتلة «مسؤول الصرف»: الاسم مطبوع أعلى السند والإقرار فوقه يقول ما يوقَّع عليه. **تاريخ الاستلام لا يُختلق** ولا يُطبع تاريخ اليوم مكانه: لا سجل سداد محفوظ يُقرأ منه |
| **9 — Zero cash blocks the voucher structurally** | عند `cashNet ≤ 0` تُحجب الطباعة **قبل** تركيب `FormLayout` أصلًا — لا مجرد إخفاء زر — ويُعرض «لا يوجد مبلغ نقدي مستحق للصرف لهذا الشهر / There is no cash entitlement to pay for this month». وزر الشهر معطَّل في الحالة نفسها. سندُ صفرٍ ورقةٌ يوقّع فيها الموظف باستلام لا شيء |
| **10 — Read-only print, no payment model** | الطباعة لا تعني `APPROVED` ولا `PAID` ولا استلامًا ولا ترحيلًا محاسبيًا، ولا تغيّر الحسبة. **لا جدول جديد** ولا حالة دفع ولا دفتر صرّاف ولا حقل تاريخ سداد ولا تأكيد استلام في قاعدة البيانات — السند الورقي يصير إثبات الاستلام بعد توقيع الموظف |
| **Schema impact** | **لا شيء** — لا Prisma model، ولا هجرة، ولا مفتاح صلاحية جديد. `migrate status` يبقى 64/64 |
| **Shared-file change (additive, opt-in)** | علم واحد على `FormLayout`: `hideTitleRule` (افتراضيًا `false`) لإزالة الخط الزخرفي تحت العنوان — لم يكن ممكنًا إخفاؤه من خارج المكوّن. سند الصرف الإداري يمرّر `title=""` أيضًا لكنه **لا** يفعّل العلم، فمخرجه المطبوع كما هو؛ محروس باختبار |
| **Validation** | Frontend `tsc --noEmit` ✅ · Backend `tsc --noEmit` ✅ · `prisma validate` ✅ · `migrate status` 64/64 ✅ · سند الصرف النقدي 28 اختبارًا جديدًا ✅ · الاختبارات المتأثرة 10 ملفات/174 اختبارًا ✅ (تشمل حارسَي سند الصرف الإداري وحارسَي الاكتمال) · Frontend الكامل 219 ملفًا/4024 اختبارًا ✅ · Backend 3230 ✅ (بلا تغيير) · `build:front` ✅. أُعيدت الفحوص المتأثّرة على `production` بعد الدمج |
| **Files** | 9 (6 modified, 3 new) — **كلها frontend**، ولا ملف backend واحد |
| **Excluded from this release** | نفس البنود غير المتتبَّعة المستبعَدة من كل إصدار حديث (`backend/src/__probe__/` · `backend/src/__livetest__/` · `zzprobe.test.ts` · `zz-probe.test.tsx` · `backend/mkfixture.mts` · `backend/delfixture.mts` · خطّان تحت `frontend/src/assets/fonts/نموذج كتاب رسمي خطوط/`)، إضافةً إلى لقطات المراجعة البصرية (`voucher-*.png` · `cash-*.png` · `ecmp-*.png`) وملفّي مصدر الاستيراد `docs/*.xlsx` |

## Previous Release — Employee Compensation — Hourly Detail + Cash Entitlement Statement + KD/hour Display v1

| Field | Value |
|-------|-------|
| **Package** | Employee Compensation — Hourly Detail + Cash Entitlement Statement + KD/hour Display v1 — سطر الاستحقاق صار يحمل **الساعات وسعر الساعة** في حقلين مطبوعين بدل نصّ حرّ، والكشف صار يعكس **مساري السداد الفعليين** (الأساسي إلى البنك · الإضافي نقدًا)، وتوحّدت وحدات العرض داخل الوحدة إلى `KD` و`hour` |
| **Release status** | RELEASED — Product Owner manual visual review **completed** and explicitly confirmed prior to release authorization |
| **Release date** | 2026-08-17 |
| **Application version** | `2026.5.2` (unchanged — backend/frontend feature pack, no installer rebuild) |
| **Feature branch** | `feature/ecmp-statement-cash-net-v1` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `e6378a43` (previous release's hash-closure commit) |
| **Checkpoint tag** | `checkpoint-ecmp-hourly-detail-cash-statement-v1` → `e6378a43` (annotated) |
| **Feature commit** | `84ad54ad` |
| **Production merge commit** | `3f6d0132` |
| **Stable tag** | `stable-ecmp-hourly-detail-cash-statement-v1` → merge `3f6d0132` (annotated) |
| **1 — Earning lines carry hours + rate as typed columns** | عمودان جديدان nullable على `CompensationEarningLine`: `hours Float?` و`rate Float?`. «٧ ساعات × ٤٫٠٠٠» رقمان لا جملة — يُعرضان في عمودين، ويُجمعان، ويُفحص حاصل ضربهما. تخزينهما داخل `notes` كان سيفرض على كل قارئ (شاشة · كشف · تقرير · اختبار) إعادة تحليل نصّ حرّ، وأول تعديل في الصياغة يكسر الجميع صامتًا |
| **2 — hours × rate = amount is an engine invariant** | `resolveHourlyDetail` في `engine/compensationTotals.ts` يفرض ثلاث قواعد على كل مستدعٍ (واجهة · API · سكربت): كلاهما معًا أو لا أحدهما · كلاهما موجب · `roundMoney(hours × rate) === roundMoney(amount)`. التقريب على الطرفين لا على أحدهما، فلا يُرفض `٣ × ٤٫٣٣٥` رفضًا كاذبًا. بندٌ مالي بحت (مصروف/مكافأة) يبقى `NULL`/`NULL` — لا صفر يُقرأ قياسًا |
| **3 — These hours never enter the legal compliance engine** | مصدر الحقيقة لساعات العمل الإضافي يبقى `OvertimeDayEntry` بتواريخه وحده. سطرٌ بـ«٢٠٠ ساعة» في تفصيل بند مالي **لا يولّد تحذيرًا ولا يدخل** حدود المادة ٦٦ (ساعتان يوميًا · ٣ أيام أسبوعيًا · ٩٠ يومًا · ١٨٠ ساعة سنويًا) — أرقام بلا تواريخ لا تصنع «التزامًا»، وهو بالضبط ما وُجد السجل اليومي ليمنعه. محروس باختبارَي محرّك وباختبار بنيوي على شاشة الشهر |
| **4 — ComplianceBar no longer claims «✓ ضمن الحدود» over nothing** | عند `OvertimeDayEntry = 0` وسطور إضافي = 0 يُعرض نصّ محايد **«لا توجد ساعات إضافية يومية مسجلة للتحقق»** بلا شارة خضراء وبلا لون إنذار. السبب عملي: الشهر قد يحمل بندًا بعنوان «إضافي عادي» وفي تفصيله ٧ ساعات، فتقرأ الشارة الخضراء فوقه تصديقًا قانونيًا على ساعات لم تُفحص ولا يمكن أن تُفحص. عند وجود ساعات فعلية يعود الشريط الطبيعي كما هو |
| **5 — Net Cash Entitlement replaces the stored net on the statement** | السداد مساران لا مسار واحد: الراتب الأساسي **يُحوَّل إلى البنك** والمستحقات الإضافية **تُسلَّم نقدًا**. `deriveCashEntitlement` (دالة واحدة يستدعيها الكشف والتقرير ورمز التحقق) تشتقّ `cashNet = netAmount − basicSalarySnapshot` و`additional = grossEntitlements − basicSalarySnapshot`. الأساسي يُطرح **مرة واحدة**: الاستقطاعات محسومة أصلًا داخل `netAmount`، فطرحها ثانيةً كان سينقص المبلغ النقدي مرتين |
| **6 — Basic salary shown for information only** | سطر الراتب في الكشف والتقرير يحمل تحته `تم تحويله إلى البنك / Transferred to Bank` بحجم أصغر ولون رمادي — على السطر نفسه لا حاشية، فيقرأ الموظف الرقم ومساره معًا عند التوقيع بالاستلام. التسميات النهائية: `إجمالي المستحقات الإضافية / Total Additional Entitlements` و`صافي المستحق نقدًا / Net Cash Entitlement` |
| **7 — No stored gross/net is shown to the user anywhere** | الإجمالي والصافي المخزَّنان (الشاملان للأساسي) لا يظهران في الكشف ولا التقرير التفصيلي ولا الطباعة/PDF — ولا حتى بحجم أصغر بوصفهما «مرجعًا». مستندٌ يحمل رقمين كبيرين أحدهما يشمل راتبًا وصل البنك يفتح بابًا لقراءته على أنه مستحقّ في اليد. المخزَّن يبقى في قاعدة البيانات كما هو ويُقرأ من هناك عند التدقيق. محروس باختبار صريح |
| **8 — QR payload follows the paper** | رمز التحقق صار يحمل `صافي المستحق نقدًا` لا الصافي المخزَّن. لو حمل المخزَّن لأعطى ماسحَ الرمز رقمًا أكبر من الذي وقّع الموظف باستلامه — وهو أسوأ من ألّا يوجد رمز |
| **9 — Display units unified to KD and hour** | `28.000 د.ك` → `28.000 KD` · `150.000 KWD` → `150.000 KD` · `7 ساعة × 4.000 د.ك` → `7 hour × 4.000 KD` · `4 ساعات` → `4 hour`. نُفِّذ عبر `employee-compensation/units.ts` الذي **يلفّ** المُنسّق المشترك ويستبدل اللاحقة وحدها — `forms/shared/formStyles` و`lib/format` و`config/modules` لم تُمسّ، فبقية النظام (الفواتير · الشيكات · المحاسبة · الرواتب · النماذج الإدارية الـ١٤) ما زالت على `KWD`/`د.ك`؛ محروس باختبار. عملة المشروع تبقى `KWD`: التخزين · الدقة الثلاثية · المبالغ · الأسعار · المعادلات · حمولات الـAPI · أسماء الحقول (`hourlyRate`/`hours`/`amount`/`netAmount`) بلا تغيير |
| **10 — Presentation only, no data mutation** | صفر تغيير في `basicSalarySnapshot` · `netAmount` · `grossEntitlements` · مبالغ البنود · الحالة · `approvedAt` · `createdByName` · ملف الموظف. لا كتابة في الرواتب ولا المحاسبة ولا دفتر الأستاذ ولا القيود ولا المصروفات ولا الشيكات ولا التصدير البنكي — حارس العزل المصدري للوحدة يمرّ 14/14 |
| **Schema impact** | عمودان nullable. الهجرة `20260817150000_add_earning_line_hours_rate` — **إضافية بحتة**: عبارتا `ALTER TABLE … ADD COLUMN` فقط، بلا `DROP`/`DELETE`/`TRUNCATE`/`RENAME`/`UPDATE`/`NOT NULL`/`ALTER COLUMN`، بلا إعادة بناء جدول وبلا Backfill. كل صفّ قائم يبقى `NULL` على العمودين. لا مفتاح صلاحية جديد |
| **Historical backfill (data, not code)** | عُبّئ `hours`/`rate` على **529 سطرًا** من دفعة `ONE_TIME_ECMP_IMPORT_2024_2026_V1` من ملف السيناريو المعتمد (395 إضافي عادي @4.000 · 97 راحة أسبوعية @6.000 · 37 عطلة رسمية @8.000)، و**432 سطرًا** ماليًا بحتًا بقيت `NULL`/`NULL`. الإجماليات لم تتحرك: 395 حسبة · 961 سطرًا · extra `37,995.000` · gross `104,445.000` · net `104,445.000` · DRAFT 395/395 · `OvertimeLine`/`OvertimeDayEntry` = 0. السكربت خارج المستودع (`backend/data/` المُتجاهَل) ولم يدخل الإصدار |
| **Validation** | Backend `tsc --noEmit` ✅ · Frontend `tsc --noEmit` ✅ · `prisma validate` ✅ · `migrate status` 64/64 applied ✅ · Employee Compensation backend 10 files/276 tests ✅ (منها 13 جديدة لتفصيل الساعة) · Frontend compensation 5 files/101 tests ✅ (منها 20 جديدة للمبلغ النقدي والوحدات + 15 لتفصيل الساعة) · module-isolation guard 14/14 ✅ · `build:back`/`build:front` ✅. أُعيدت الفحوص المتأثّرة على `production` بعد الدمج |
| **Files** | 26 (20 modified, 6 new): backend 6 (منها الهجرة واختبار جديد)، frontend 20 (منها `cashEntitlement.ts` · `units.ts` واختباران جديدان) |
| **Excluded from this release** | نفس البنود غير المتتبَّعة المستبعَدة من كل إصدار حديث (`backend/src/__probe__/` · `backend/src/modules/employees/__tests__/zzprobe.test.ts` · `frontend/src/components/explorer/__tests__/zz-probe.test.tsx` · خطّان غير مستعملَين تحت `frontend/src/assets/fonts/نموذج كتاب رسمي خطوط/` · `backend/src/__livetest__/` · `backend/mkfixture.mts` · `backend/delfixture.mts`)، إضافةً إلى لقطات المراجعة البصرية لهذه الجلسة (`cash-*.png` · `ecmp-*.png` في جذر المستودع) وملفّي مصدر الاستيراد `docs/خطة_المستحقات_الشهرية_المقترحة.xlsx` و`docs/خطة_تفاصيل_السيناريوهات_الشهرية.xlsx` |
| **Known pre-existing item (not in scope, not fixed)** | التقرير التفصيلي ما زال يعرض في «ملخص الالتزام القانوني» سطر `درجة التحقّق: كامل` لشهر بلا أيام إضافي، مع سطر صادق تحته يقول `سجل شهري قديم — بدون تفاصيل يومية · الحدود اليومية والأسبوعية غير مفحوصة لهذا الشهر`. أُثبت أنه سابق لهذه الحزمة (`verification=FULL` كان قائمًا على النسخة الاحتياطية قبل التفكيك) — طلب المالك عالج `ComplianceBar` في الشاشة تحديدًا وقد نُفِّذ؛ نصّ التقرير عنصر منفصل يستحق قرارًا مستقلًّا |

## Previous Release — Employee Compensation — Daily Overtime Ledger & Legal Compliance Engine v1

| Field | Value |
|-------|-------|
| **Package** | Employee Compensation — Daily Overtime Ledger & Legal Compliance Engine v1 — نقل احتساب العمل الإضافي من إجماليات شهرية بلا تواريخ إلى **سجل يومي مؤرَّخ** هو مصدر الحقيقة للحسبات الجديدة، فصارت حدود المادة ٦٦ الأربعة مفحوصة فعليًا بدل الإفصاح عنها وحده |
| **Release status** | RELEASED — Product Owner manual visual **and functional** review **completed** and explicitly confirmed prior to release authorization |
| **Release date** | 2026-08-16 |
| **Application version** | `2026.5.2` (unchanged — backend/frontend feature pack, no installer rebuild) |
| **Feature branch** | `feature/employee-compensation-daily-overtime-ledger-v1` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `e3b97313` (previous release's hash-closure commit) |
| **Checkpoint tag** | `checkpoint-employee-compensation-daily-overtime-ledger-v1` → `1c4426de` (annotated) |
| **Feature commit** | `1c4426de` |
| **Production merge commit** | `0a3fbd55` |
| **Stable tag** | `stable-employee-compensation-daily-overtime-ledger-v1` → merge `0a3fbd55` (annotated) |
| **1 — Daily Overtime Ledger is the Source of Truth** | جدول جديد `OvertimeDayEntry` (`employee_compensation_overtime_day_entries`) يحمل تاريخ كل ساعة إضافية ونوعها. `OvertimeLine` يبقى حامل المال ولقطة الأسعار، لكن ساعاته تُعاد كتابتها من `Σ` الأيام **داخل المعاملة نفسها**، فلا يمكن أن يتباعد المجموع عن تفاصيله. `date` مخزَّن نصًّا `YYYY-MM-DD` لا `DateTime` عمدًا: التحويل إلى UTC كان يزيح يوم العمل الكويتي (UTC+3) يومًا كاملًا عند منتصف الليل، فينتقل بين أسبوعين بل بين شهرين على حافة الشهر وتنهار كل حسبة أسبوعية وسنوية |
| **2 — Legacy months preserved with no fabricated backfill** | الأشهر المحفوظة قبل الحزمة تبقى كما هي حرفيًا. لا عمود حالة ولا وسم: «قديم» تعريفه **غياب الأيام** نفسه. الهجرة إضافية بحتة بلا Backfill، ولا يولّد النظام أي تاريخ من عنده — تحويل شهر قديم إجراء صريح بتأكيد، مع شريط مطابقة يعرض الفارق بين ساعات السجل المحفوظ ومجموع الأيام المُدخلة لكل نوع |
| **3 — Legacy REGULAR hours count toward the annual 180-hour limit** | العدّاد السنوي كان يقرأ الأيام المؤرَّخة وحدها، فكانت ساعات الأشهر القديمة **تختفي منه**: موظف بـ١٧٠ ساعة بالطريقة القديمة + ٢٠ ساعة بالسجل اليومي كان يُعرض له «٢٠ من ١٨٠» ويُعتمد شهره، ورصيده الحقيقي ١٩٠ — تجاوزٌ قانوني يمرّ لأن النظام نسي ما يعرفه. صارت ساعات الأشهر المجمّعة تدخل الحد السنوي، والجزء الآتي منها معروض صراحةً |
| **4 — PARTIAL verification for years with incomplete daily data** | `verification: FULL \| PARTIAL` **منفصل عن `compliant`** ولا يُخلط به: الأول يجيب «هل كانت البيانات كافية للفحص؟» والثاني «هل ثبتت مخالفة؟». سنة فيها أشهر مجمّعة تُعرض `PARTIAL` مع إفصاح يسمّي الأشهر ويفرّق بين ما بقي مفحوصًا (١٨٠ ساعة سنويًا) وما سقط (٩٠ يومًا سنويًا · ٣ أيام أسبوعيًا). شارة الواجهة تكتسب حالة ثالثة «تحقّق غير مكتمل» بدل «✓ ضمن الحدود» — فذلك ادّعاء فحصٍ لم يقع |
| **5 — Daily / Weekly / Annual compliance** | محرّك خالص جديد `engine/overtimeComplianceEngine.ts` (بلا Prisma ولا تاريخ نظام) يفحص: ساعتان يوميًا · ٣ أيام أسبوعيًا · ٩٠ يومًا سنويًا · ١٨٠ ساعة سنويًا. أسبوع العمل يبدأ الأحد إعادةً لاستعمال عُرف المشروع الموثَّق في `HolidayEngine` (عطلة الجمعة والسبت). الأسبوع يُفحص كاملًا عبر حدّ الشهر وحدّ السنة معًا: استعلام واحد يجلب `year-1-12-25 → year+1-01-07`، فالأيام داخل السنة تغذّي العدّادات والمتاخمة تغذّي الأسابيع وحدها. أرقام الحدود والمعاملات **لم تتغيّر** |
| **6 — Same-day double classification prevented** | كان النموذج يقبل تصنيف اليوم الواحد بـ`REGULAR` و`WEEKLY_REST` و`OFFICIAL_HOLIDAY` معًا — أي احتساب أجرين بمعاملين مختلفين لساعات اليوم نفسه. صار مرفوضًا: التاريخ الواحد حالة واحدة لا حالتان |
| **7 — WEEKLY_REST + OFFICIAL_HOLIDAY remains a documented Legal Ambiguity** | وقوع العطلة الرسمية في يوم الراحة الأسبوعية **لا تحسمه** المادتان ٦٧ و٦٨ ولا القرار الوزاري ١٨٨/ع لسنة ٢٠١٠: لا نصّ على جمع المعاملين، ولا على ترجيح أحدهما، ولا على عدد أيام الراحة البديلة. النظام **لا يجمعهما تلقائيًا ولا يرجّح**؛ يرفض التصنيف المزدوج ويوسمه `legalAmbiguity` بوصفه قرارًا يحتاج قرارًا موثَّقًا من إدارة الشركة |
| **8 — Compensatory Rest tracking** | `compensatoryRestStatus` (`PENDING`/`SCHEDULED`/`TAKEN`) و`compensatoryRestDate` على مستوى اليوم، و`NULL` إجباريًا على `REGULAR` لأن المادة ٦٦ لا تُنشئ هذا الاستحقاق أصلًا. العدّ يقع **عبر السنة** لا الشهر المفتوح، فلا يضيع استحقاق مارس بفتح أبريل. **لا مهلة زمنية مخترَعة** — النصّ المعتمد لا يذكر أجلًا |
| **9 — Reverse Calculator creates no fabricated dates or hours** | الساعات تُشتقّ من الأيام التي اختارها المستخدم فعليًا؛ بيانات الحسبة العكسية (المبلغ المستهدف · الساعات قبل التقريب) تُحفظ للتدقيق وحده. اقتراح بـ١٣ ساعة مع ٤ ساعات أيام مختارة يحفظ **٤**. مساعد التوزيع يعمل على الأيام المختارة وحدها ولا ينشئ تاريخًا |
| **10 — No Payroll / Accounting / GL integration** | لا كتابة في الرواتب ولا المحاسبة ولا قيود اليومية ولا المصروفات ولا دفتر الأستاذ. حارس العزل المصدري وسّع قائمة النماذج المحظورة لتشمل `attendance` و`holiday` و`leave` — لأن سجلًّا يوميًا هو بالضبط ما يغري تعديلًا لاحقًا بقراءة الحضور أو تصنيف يوم عطلةً رسمية تلقائيًا (ممنوع: المستخدم هو من يصنّف) |
| **11 — Compliance evaluated during editing, not only on save** | `preview` (قراءة فقط، صفر أثر تخزيني) صار يعيد `compliance` و`dayErrors`، فيرى المستخدم تجاوز «ساعتين في اليوم» لحظة إدخاله لا بعد الحفظ |
| **Save ≠ Approve** | المسودة تُحفظ دائمًا مهما كانت المخالفة، والمخالفة تبقى مصنَّفة `STATUTORY` ولا تُخفَّض إلى تحذير. الاعتماد وحده ممنوع عند مخالفة مؤكَّدة، ورسالة المنع تسرد الأسباب بتواريخها |
| **Legal review** | روجع القرار الوزاري ١٨٨/ع لسنة ٢٠١٠ مقابل المطبَّق: **لم يتغيّر أي حدّ ولا معامل**. تعذّر تنزيل النصّ الرسمي من موقع الهيئة العامة للقوى العاملة وقت المراجعة (خطأ خادم)، والتأكيد مستند إلى مصدرين ثانويين متطابقين. وُثّقت في `legal/kuwaitLabourLaw.ts` ثلاثة متطلبات قائمة **خارج قدرة الوحدة**: الأمر الكتابي من صاحب العمل (م.٦٦/القرار ١٨٨) · المادة ٦٥ (٥ ساعات متصلة بحد أدنى ساعة راحة — لا أوقات بداية/نهاية مسجَّلة) · مجموع ٤٨ ساعة أسبوعيًا (م.٦٤ — الوحدة تسجّل الإضافي وحده) |
| **Schema impact** | جدول واحد جديد. الهجرة `20260816120000_add_overtime_day_entry` — **إضافية بحتة**: `CREATE TABLE` واحد + ٣ فهارس، بلا `ALTER`/`DROP`/`DELETE`/`UPDATE`/`INSERT` وبلا Backfill. فريد على `(calculationId, date, overtimeType)`، وفهارس على `calculationId` و`date`. لا مفتاح صلاحية جديد |
| **Validation** | Backend `tsc --noEmit` ✅ · Frontend `tsc --noEmit` ✅ · `prisma validate` ✅ · `migrate status` 63/63 applied ✅ · Employee Compensation backend 9 files/263 tests ✅ (منها 61 لمحرّك الالتزام) · Frontend compensation 2 files/37 tests ✅ · module-isolation guard 14/14 ✅ · `build:back`/`build:front` ✅. أُعيدت الفحوص المتأثّرة على `production` بعد الدمج |
| **Files** | 23 (17 modified, 6 new): backend 15 (منها الهجرة ومحرّكان جديدان)، frontend 8 |
| **Excluded from this release** | نفس البنود غير المتتبَّعة المستبعَدة من كل إصدار حديث (`backend/src/__probe__/probe.test.ts` · `backend/src/modules/employees/__tests__/zzprobe.test.ts` · `frontend/src/components/explorer/__tests__/zz-probe.test.tsx` · خطّان غير مستعملَين تحت `frontend/src/assets/fonts/نموذج كتاب رسمي خطوط/`)، إضافةً إلى أدوات تحقّق مؤقّتة من هذه الجلسة بقيت غير متتبَّعة لتعذّر حذفها بصلاحيات الأدوات: `backend/src/__livetest__/` · `backend/data/live-test.db` · `backend/mkfixture.mts` · `backend/delfixture.mts` · لقطتا الطباعة في جذر المستودع |
| **Known pre-existing defect (not in scope, not fixed)** | في التقرير التفصيلي، عمود «النوع» في جدول **تفاصيل العمل الإضافي** (الجدول القائم قبل هذه الحزمة) ينكمش إلى ~٤٨px فينكسر المرجع القانوني حرفًا في كل سطر ويرتفع الصفّ إلى ~٢٨٠px. أُثبت أنه سابق لهذه الحزمة (التعديل على الملف ١٣٣ إضافة و**صفر حذف**، ويتكرّر على شهر قديم بلا جدول أيام). يستحق إصلاحًا مستقلًّا |

## Previous Release — Production Release 2026.5.2

| Field | Value |
|-------|-------|
| **Package** | Production Release 2026.5.2 — Full Pre-Production Audit & Polish v1, packaged into a new self-contained Windows installer. Three fix commits closing backend transactional/audit findings, Electron production runtime-lifecycle findings, and frontend invoice-total/UI-target findings, plus the `package.json` version bump |
| **Release status** | RELEASED — Product Owner manual visual **and functional** review **completed** and explicitly confirmed prior to release authorization |
| **Release date** | 2026-08-16 |
| **Application version** | `2026.5.1` → `2026.5.2` — new installer build |
| **Feature branch** | `feature/full-pre-production-audit-polish-v1` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `13b37e78` (previous release's hash-closure commit) |
| **Checkpoint tag** | `checkpoint-production-release-2026.5.2` → `13b37e78` (annotated) |
| **Feature commits** | `506bd582` (backend) · `aadf4b15` (electron) · `f6cc574e` (frontend) |
| **Release commit** | `3e5c3d1a` (version bump only) |
| **Production merge commit** | `74a946c2` |
| **Stable tag** | `stable-production-release-2026.5.2` → merge `74a946c2` (annotated) |
| **1 — Backend: payment concurrency** | `invoices.addPayment` read the invoice and computed its over-payment guard **before** opening the transaction, then wrote `paidAmount` as an absolute value derived from that stale read. Two concurrent submissions both read the same balance, both created a payment row and a journal entry, and one single total was written — a permanent divergence between `Σ payments.amount` and `invoice.paidAmount`. The read and the validation now happen inside the transaction. 3 new concurrency regression tests |
| **2 — Backend: two smaller findings** | The cheque-number conflict message rendered an English weekday with no year — `String(Date).slice(0, 10)` applied to a DateTime column — now `toLocalDateString`. The forms print-log stored the request body verbatim in the audit log with **no schema at all**; a strict Zod schema now clips the payload to known fields and bounds their lengths |
| **3 — Electron: restart leaked the backend** | `app:restart` called `app.exit(0)` directly, bypassing `before-quit` entirely so the backend child was never stopped — and on Windows the parent's exit does not kill the child, so port 48211 stayed held and the relaunched instance failed with `EADDRINUSE`. This is the path the backup-restore flow invokes every single time. The backend is now stopped with its exit awaited, and the runtime lock released, before `relaunch` |
| **4 — Electron: unquittable app** | `before-quit` calls `preventDefault`, and its only exit was at the end of an unguarded chain — any throw while creating the progress window or inside `finish()` left the app open forever with no dialog and no log. The whole sequence is now in try/finally with the exit in `finally`, and shutdown waits for real process exit. An `uncaughtException`/`unhandledRejection` safety net was added to the main process, which previously had one only in the backend |
| **5 — Electron: backups that failed silently** | `backupScheduler.postToInternal` resolved on any response **and** on network error, so it never rejected and its `catch` was dead code: a 500, a 401 rejection, or a backend that was not listening were all logged as «تم تنفيذ النسخ التلقائي». The status code and `data.status === 'FAILED'` are now both checked and a failure is logged as a failure |
| **6 — Frontend: invoice totals disagreed with the server** | The create/edit/fast-entry invoice screens computed totals with a second formula that diverged from the server in two places: no per-line rounding, and no tax cap at all. Three lines of 3 × 0.3335 displayed 3.002 while the server stored 3.003, and any invoice with tax > 0 (created by import or API) showed a total in the edit screen contradicting the stored value and every report — on an invoice the user never touched. New `computeInvoiceTotals` mirrors `invoices.calc.ts` and is used by all three screens; `invoiceLineTotal` now rounds. 7 new regression tests pin the frontend formula to the server's |
| **7 — Frontend: three broken UI targets** | The payslip printed the raw enum value (`DRAFT`) inside a formal Arabic document despite `payroll.status.*` keys existing. Three AI-assistant navigation targets pointed at `/dashboard`, an undefined route (the dashboard is at `/`), surviving only by accident through the catch-all. Global Search guarded «المركز المالي» with `financial.read` — a key present neither in `constants.ts` nor in the seed — so the entry never appeared for **any** user; the route's real key is `statements.read`, as in the sidebar |
| **8 — Packaging defect found and fixed during this release (pre-existing)** | The generated Prisma client shipped inside the installer was **stale**. `scripts/prepare-backend-deps.js` overlays the **repo-root** `node_modules/.prisma` into the package, but once `backend/node_modules` exists — itself created by a previous `npm run dist` — `prisma generate` resolves to *that* copy and the root one is never refreshed. Proven pre-existing, not caused by this release, by extracting `resources\backend\node_modules\.prisma\client\schema.prisma` from the already-shipped `AlManarERP-Setup-2026.5.1.exe`: 104,359 bytes, missing `EntitlementsBankStatement`, `expectedReturnDate` and `companyOvertimeBaseRateSnapshot` — the 2026.5.1 installer would have failed at runtime on the Monthly Entitlements Bank Statement, the leave expected-return-date field, and the company overtime rate. The root client was regenerated and the installer rebuilt; the shipped client is now 111,539 bytes carrying **74 models, matching `backend/prisma/schema.prisma` exactly**, verified both in `win-unpacked` and by extraction from inside `Setup.exe`. **`prepare-backend-deps.js` itself was deliberately not changed** — that is a source fix outside this release's reviewed scope, recorded below as required follow-up |
| **Validation** | Backend `tsc --noEmit` ✅ · Frontend `tsc --noEmit` ✅ · Electron `tsc --noEmit` ✅ · `prisma validate` ✅ · `migrate status` 62/62 applied ✅ · Backend 198 files/3132 tests ✅ (2 intentionally-skipped leftover diagnostic stubs, pre-existing) · Frontend 216 files/3959 tests ✅ · Electron 26 files/499 tests ✅ · `build:back`/`build:front`/`electron:build`/`npm run dist` ✅ (exit 0). Every check re-run on `production` after the merge and after the Prisma client refresh; the merged tree is byte-identical to the reviewed branch tree (`git diff feature..production` empty) |
| **Packaging verification** | `app.asar` listed directly (676 entries) and `extraResources` walked (3,272 files), plus all 4,062 entries of `Setup.exe` itself enumerated via `7za l -slt`. Zero source maps, zero `__tests__`, zero `*.test.*`/`*.spec.*`, zero `.ts`/`.d.ts`, zero `.env`/`.pem`/`.key`/secret files, zero SQLite journals, zero stray `.db`, zero non-Windows Prisma engines. Present and confirmed: 62 Prisma migrations, `schema.prisma`, `electron-dist/main.js`, `electron-dist/preload.js`, `frontend/dist/index.html`, 49 bundled font files, `backend/assets` (Cairo font + NBK export template), `gdrive-oauth-client.json`, `runtime-requirements.json` (reporting zero external prerequisites) |
| **Golden Database** | SHA-256 `77a9243ab3ecef3f157739eb94247c4b1d23b9cb50569a3cb4a0601af1967b73`, 3,321,856 bytes, `integrity_check = ok`, 0 foreign-key violations, 78 tables, 62 applied migrations (latest `20260816120000_add_company_overtime_rate`) — the latest approved development database, verified byte-identical in **four** places: source `backend/data/manar.db` (hashed independently before packaging) · `release/win-unpacked/resources/backend/data/manar.db` · extracted directly from inside `AlManarERP-Setup-2026.5.2.exe` via `7za` · and `seed-data/golden-manifest.json`, which records the identical hash, size and packaging timestamp. No hot journal (`-wal`/`-shm`/`-journal`) files existed beside the source at packaging time |
| **Installer artifact** | `AlManarERP-Setup-2026.5.2.exe` — 138,258,420 bytes (131.85 MiB), SHA-256 `8590e7ed356064d5ee701cfcbb6bc4e8168c329e95b761bfa83ff047835c9ed1`, Windows 10/11 x64, per-user install, zero external runtime prerequisites. `release/win-unpacked` 3,344 files / 468,823,768 bytes (447.1 MiB) |
| **GUI/install-flow verification** | Not driven interactively — no desktop session available in this environment. Covered by the Product Owner's completed manual visual and functional review, confirmed prior to this release authorization |
| **Schema impact** | None — no schema change, no migration, no new permission key. The 62 migrations shipped are those already applied and documented in their own release entries |
| **Files** | 20 (17 modified, 3 new): backend 6, electron 3, frontend 10, plus `package.json` |
| **Required follow-up (not in this release)** | `scripts/prepare-backend-deps.js` sources the generated Prisma client from the repo root, which `prisma generate` stops updating as soon as `backend/node_modules` exists. Until it is changed to generate the client as part of `npm run dist` (or to prefer `backend/node_modules/.prisma`), every future installer must have its packaged client freshness re-verified by hand, as was done here |
| **Excluded from this release** | Same pre-existing untracked items excluded from every recent release: the leftover diagnostic probes `backend/src/__probe__/probe.test.ts` and `backend/src/modules/employees/__tests__/zzprobe.test.ts`, the debug probe `frontend/src/components/explorer/__tests__/zz-probe.test.tsx`, and two unreferenced fonts under `frontend/src/assets/fonts/نموذج كتاب رسمي خطوط/` |

## Previous Release — Employee Compensation — Configurable Company Overtime Rate Pack v1

| Field | Value |
|-------|-------|
| **Package** | Employee Compensation — Configurable Company Overtime Rate Pack v1 — lets Employee Compensation choose the company overtime hourly rate from the system instead of it being fixed in code, while the Kuwait Labour Law engine stays the single source of legal minimums |
| **Release status** | RELEASED — Product Owner manual visual review **completed** and explicitly confirmed prior to release authorization |
| **Release date** | 2026-08-16 |
| **Application version** | `2026.5.1` (unchanged — backend/frontend feature pack, no installer rebuild) |
| **Feature branch** | `feature/employee-compensation-configurable-overtime-rate-v1` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `33d582db` (previous release's hash-closure commit) |
| **Checkpoint tag** | `checkpoint-employee-compensation-configurable-overtime-rate-v1` → `33d582db` (annotated) |
| **Feature commit** | `4ec8803b` |
| **Production merge commit** | `310fcaa7` |
| **Stable tag** | `stable-employee-compensation-configurable-overtime-rate-v1` → merge `310fcaa7` (annotated) |
| **1 — Two concepts, kept structurally separate** | `legal/kuwaitLabourLaw.ts` remains the sole source of legal multipliers (Art. 66/67/68 ×1.25/×1.50/×2.00, `LEGAL_RULES_VERSION = KW-LL-6/2010-v2`) and is untouched by this pack. New `policy/companyOvertimePolicy.ts` derives per-type company rates (`REGULAR` ×1.00 · `WEEKLY_REST` ×1.50 · `OFFICIAL_HOLIDAY` ×2.00) from one administrative base rate, versioned independently as `COMPANY_OVERTIME_POLICY_VERSION = MANAR-COP-v1`. A dedicated isolation test asserts the law file contains no reference to the company concept and the policy file never redefines the legal multiplier or version |
| **2 — Statutory floor protection is structural** | `engine/effectiveOvertimeRate.ts` is the single point that resolves `effectiveRate = max(statutoryMinimumRate, companyDerivedRate)` for every overtime type; no other code path can produce a lower rate — swept across 30 rate/type combinations by test. A below-floor company choice is accepted, floored, and surfaced as an explicit `COMPANY_OVERTIME_RATE_BELOW_STATUTORY` warning naming both figures — never a silent cut, never a rejected request |
| **3 — Two levels of rate, one storage mechanism** | The company-wide **default** lives in the existing `Setting` table (key `employeeCompensation.companyOvertimeBaseRate`, group `employeeCompensation`) — no new settings table or mechanism — editable from a compact dialog shared by the module's employee list header and the month editor, with 3.000/4.000/5.000 د.ك quick presets plus free entry. A per-**month override** is editable even after approval, matching every other field in this module. Changing the default issues **zero** writes to any saved calculation |
| **4 — Historical snapshot protection** | Each calculation snapshots `companyOvertimeBaseRateSnapshot` + `companyOvertimePolicyVersion`; every overtime line snapshots `statutoryMinimumRate`/`companyBaseRate`/`companyDerivedRate`/`effectiveRate`/`rateSource`. `NULL` means "saved before this pack" and is computed with the exact pre-pack formula (`hours × hourlyRate × multiplier`, one final rounding) byte-for-byte — proven live against a seeded pre-pack calculation (100 h × 2.163 × 1.25 = 270.375 unchanged after re-save), not merely asserted by unit test |
| **5 — Reverse overtime and copy-previous** | Reverse overtime derives hours from the *effective* rate of the selected overtime type, so the amount it promises is the amount that gets stored. Copying a previous month follows the *current* default, not the copied month's snapshot — a deliberate choice since the rate is a live administrative decision, not a template field — and reports the difference explicitly when the two disagree |
| **6 — Printing stays split exactly as before** | The short official statement exposes no rate, source, or policy version — verified both by the backend never sending those fields and by a new source-scanning frontend test asserting the template and the `StatementData` type itself carry none of them. The internal detailed report shows the statutory minimum, the company-derived rate, and the effective rate side by side for every overtime line, with the winning source labelled |
| **7 — Isolation unchanged** | No Payroll/Accounting/GL/Expense write and no Employee mutation — the module's pre-existing source-scanning isolation test now also requires every `prisma.setting` access to route through the new centralized `COMPANY_OVERTIME_RATE_SETTING_KEY` constant |
| **Live verification** | Run end-to-end against an isolated database/backend copy (port 48299, scratch SQLite file seeded from a snapshot of `manar.db`, a throwaway test employee and credentials): set default 4.000 → create a month with no explicit rate (inherits 4.000) → change default to 5.000 → confirm the existing month unchanged → create a new month (inherits 5.000) → override that month to 3.500 → approve it → edit the rate of the approved month to 6.000 with recalculation → copy it into the next month (starts from the *current* default 5.000, not the 6.000 snapshot) → statutory floor check on a high salary with a 1.000 company rate → reject invalid rates (0, −1, 4000). Every check passed. Post-test, `payrollLines`/`payrollAdvances`/`deductions`/`bonuses`/`employeeAllowances`/`journalEntries`/`transactions`/`expenses`/`cheques` all counted 0 and the test employee's salary was unchanged — isolation confirmed on live data, not mocks alone. The isolated database copy and its backend instance were both discarded after the run; the shared development database was never targeted by test traffic |
| **Validation** | Backend `tsc --noEmit` ✅ · Frontend `tsc --noEmit` ✅ · Electron `tsc --noEmit` ✅ · `prisma validate` ✅ · `migrate status` 62/62 applied ✅ · Backend 3129 tests ✅ (36 new) · Frontend 3952 tests ✅ · production builds (`build:back`, `build:front`) ✅. Re-verified post-merge on `production`: `tsc --noEmit` ×3, `prisma validate`/`migrate status`, and the module's own 178 backend + 37 frontend tests, all green |
| **Tests added** | `companyOvertimeRate.test.ts` (36 tests: global default persistence/read, per-month override without touching the default, snapshot immutability across a default change, all nine base-rate→per-type derivations, statutory-floor enforcement swept across rate/type combinations, reverse-overtime by type, copy-previous using the current default, statement/detailed-report isolation, input validation) plus extensions to the module's existing `moduleIsolation.test.ts` (Setting-key isolation, legal/policy version separation) and the frontend's `employeeCompensationUiIntegrity.test.tsx`/`employeeCompensationStatementIsolation.test.tsx` guard suites |
| **Schema impact** | Additive migration `20260816120000_add_company_overtime_rate` — 7 nullable columns across `employee_compensation_calculations` (2) and `employee_compensation_overtime_lines` (5); zero existing table rebuilt, zero column altered, zero data backfilled |
| **Permission impact** | None — no new permission key. The rate-settings routes reuse `employeeCompensation.read` (read) and `employeeCompensation.update` (write), per this module's existing key namespace |
| **Calculation impact** | Extends (not replaces) the overtime calculation: when no company rate is set — the state of every calculation saved before this pack — the amount is produced by the exact pre-pack formula; when a company rate is set, the amount is `hours × max(statutoryMinimumRate, companyDerivedRate)`, never below what the pre-pack formula would have paid |
| **Files** | 27 (22 modified, 5 new); backend + frontend. No Electron change |
| **Excluded from this release** | Same pre-existing untracked items excluded from every recent release: the leftover diagnostic probes `backend/src/__probe__/probe.test.ts` and `backend/src/modules/employees/__tests__/zzprobe.test.ts`, the debug probe `frontend/src/components/explorer/__tests__/zz-probe.test.tsx`, and two unreferenced fonts under `frontend/src/assets/fonts/نموذج كتاب رسمي خطوط/` |

## Previous Release — Production Release 2026.5.1

| Field | Value |
|-------|-------|
| **Package** | Production Release 2026.5.1 — packages a new self-contained Windows installer including everything merged onto `production` since the 2026.5.0 installer: Employee Entitlements Bilingual One-Page Statement Pack v1, Monthly Entitlements Bank Statement Pack v1, Employee Entitlements Leave Management Pack v1, and Privacy Toggle Tier A v1. All four were already merged, tagged, and documented individually; this release's only tracked-file change is the `package.json` version bump |
| **Release status** | RELEASED — Product Owner manual visual **and functional** review **completed** and explicitly confirmed prior to release authorization |
| **Release date** | 2026-08-15 |
| **Application version** | `2026.5.0` → `2026.5.1` — new installer build |
| **Feature branch** | `feature/production-release-2026.5.1` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `62dd982d` (previous release's hash-closure commit) |
| **Checkpoint tag** | `checkpoint-production-release-2026.5.1` → `62dd982d` (annotated) |
| **Feature commit** | `478cedf` |
| **Production merge commit** | `e8fea376` |
| **Stable tag** | `stable-production-release-2026.5.1` → merge `e8fea376` (annotated) |
| **Bundled packs** | (1) Employee Entitlements Bilingual One-Page Statement Pack v1 — presentation-only bilingual statement rebuild, no schema/permission change. (2) Monthly Entitlements Bank Statement Pack v1 — second bank transfer statement, additive migration `20260814120000_add_entitlements_bank_statement`, two new tables, no existing table/column altered. (3) Employee Entitlements Leave Management Pack v1 — wires pre-existing Leave CRUD into the UI, print-leave-form shortcut, `reason`/`expectedReturnDate` capture (additive migration `20260815090000_add_leave_expected_return_date`), and legally-correct `asOf`-clipped annual-leave balance consumption. (4) Privacy Toggle Tier A v1 — makes `MoneyText`/`MoneyCell` privacy-aware, closing the coverage gap behind the top-bar lock button on ~60 call sites, presentation-only. Full detail for each: their own `## Previous Release —` entries below and `PROJECT_MASTER_STATUS.md`'s release history |
| **Validation before packaging** | Backend/Frontend/Electron `tsc --noEmit` ✅ · `prisma validate` ✅ · `prisma migrate status` 61/61 applied ✅ · Backend 196 files/3087 tests ✅ (2 intentionally-skipped leftover diagnostic stubs, pre-existing) · Frontend 215 files/3943 tests ✅ · Electron 26 files/499 tests ✅. The merged tree is byte-identical to the reviewed branch tree (`git diff feature..production` empty), so these pre-merge results carry to `production` verbatim |
| **Packaging verification** | `app.asar` and `extraResources` content inspected directly (`npx asar list`, filesystem walk) for leaked dev/test/source-map/`.env`/secret files — none found, matches `electron-builder.yml`'s declared exclusion filters exactly. 61 Prisma migrations present in the packaged `backend/prisma/migrations`. `electron-dist/main.js`, `preload.js`, `frontend/dist/index.html`, and all bundled fonts/assets confirmed present |
| **Golden Database** | SHA-256 `da769b8c70f372c0ab56cc2d5670e3316f27af6781c48bbd65074005b7bfdf24`, 3,358,720 bytes, 61 applied migrations — verified byte-identical in three places: source `backend/data/manar.db` (computed independently before packaging) · `release/win-unpacked/resources/backend/data/manar.db` · extracted directly from inside `AlManarERP-Setup-2026.5.1.exe` via `7za` (`node_modules/7zip-bin`). `seed-data/golden-manifest.json` records the identical hash, size, and packaging timestamp |
| **Installer artifact** | `AlManarERP-Setup-2026.5.1.exe` — 138,282,665 bytes (131.87 MiB), SHA-256 `e95021e4735572f9bb493c7b87e09d7edbd9a94bea481eb55a40e0ab5d831931`, Windows 10/11 x64, per-user install, zero external runtime prerequisites (`runtime-requirements.json` reports none) |
| **GUI/install-flow verification** | Not driven interactively — no desktop session available in this environment. Covered by the Product Owner's completed manual visual and functional review of the underlying feature packs, confirmed prior to this release authorization |
| **Schema impact** | None new in this release itself — the two additive migrations it packages (`20260814120000_add_entitlements_bank_statement`, `20260815090000_add_leave_expected_return_date`) were already applied to the dev database and documented in their own release entries; this release is the first installer to ship them |
| **Files** | 1 (`package.json` version bump only); the four bundled packs' own file counts are documented in their individual release entries below |
| **Excluded from this release** | Same pre-existing untracked items excluded from every recent release: the leftover diagnostic probes `backend/src/__probe__/probe.test.ts` and `backend/src/modules/employees/__tests__/zzprobe.test.ts`, the debug probe `frontend/src/components/explorer/__tests__/zz-probe.test.tsx`, and two unreferenced fonts under `frontend/src/assets/fonts/نموذج كتاب رسمي خطوط/` |

## Previous Release — Privacy Toggle Tier A v1

| Field | Value |
|-------|-------|
| **Package** | Privacy Toggle Tier A v1 — audit + fix of the top-bar lock button's "hide/show financial numbers" feature. Makes the two shared money-display components (`MoneyText`, `MoneyCell`) privacy-aware |
| **Release status** | RELEASED — Product Owner manual visual review **completed** and explicitly confirmed prior to release authorization |
| **Release date** | 2026-08-15 |
| **Application version** | `2026.5.0` (unchanged — frontend-only presentation fix, no installer rebuild) |
| **Feature branch** | `feature/privacy-toggle-tier-a-v1` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `d875be34` (previous release's hash-closure commit) |
| **Checkpoint tag** | `checkpoint-privacy-toggle-tier-a-v1` → `d875be34` (annotated) |
| **Feature commit** | `4d774537` |
| **Production merge commit** | `7cb1c738` |
| **Stable tag** | `stable-privacy-toggle-tier-a-v1` → merge `7cb1c738` (annotated) |
| **Root cause** | The lock button itself was never broken: `togglePrivacy()` in `uiStore.ts` is a plain boolean flip with no stale closures, memoization, or localStorage desync, and the button calls it directly on every click. The actual defect was coverage — `privacyMode`/`usePrivacyMode()` was read in only 3 files (`Layout.tsx`, `uiStore.ts`, `PrivateAmount.tsx`) out of roughly 90 files that display financial numbers app-wide. The overwhelming majority went through separate helpers (`money()`, `MoneyText`, `MoneyCell`, `fcCurrency()`, chart tooltip/axis formatters, print templates) that never consulted the privacy store, so real amounts stayed visible regardless of the lock's state — explaining the "the button does nothing" symptom on most screens |
| **1 — `MoneyText`/`MoneyCell` privacy-aware** | Both components in `config/modules.tsx` now call `usePrivacyMode()` and render through the same `pm-mask`/`pm-real` dual-span pattern `PrivateAmount` already used, reusing its exported `buildLevel1Mask()` instead of duplicating the masking algorithm — one shared mechanism, no parallel system. Fixes every existing `<MoneyText>`/`<MoneyCell>` call site (~60, across Accounting, Invoices, Salaries, FinancialCenter, BankAccountExplorer, Expenses, Inventory, Maintenance, Prices, and the Collection Analysis tables) with **zero call-site changes** |
| **2 — Print output unaffected** | `pm-real` is forced visible under `@media print` regardless of the on-screen mask state, via the pre-existing `privacy.css` contract — financial documents print with real values exactly as before |
| **3 — Edge case: "—" never masked** | `MoneyCell`'s not-applicable placeholder (`—`) is not a financial figure and is never wrapped in the mask/real spans, so it stays visually distinct from a genuinely masked amount |
| **Validation** | `tsc --noEmit` ✅ · `npm run build` (frontend production build) ✅ · Frontend 215 files/**3943/3943** tests ✅ (3930 pre-existing + 13 new). The merged tree is byte-identical to the reviewed branch tree (`git diff feature..production` empty), so these pre-merge results carry to `production` verbatim; a post-merge `tsc --noEmit` re-check on `production` also passed |
| **Tests added** | `privacyMoneyComponents.test.tsx` (`PrivateAmount`/`MoneyText`/`MoneyCell`: default masked, immediate unmask on store toggle with no remount, repeated Hide→Show→Hide cycling, multiple amounts on one screen share one toggle, the "—" edge case is never masked) and `privacyToggleLayout.test.tsx` (the lock button itself inside the real `Layout`: default locked state, exactly one button rendered, click toggles immediately with no refresh, 4-click Hide→Show→Hide→Show sequence, and state/rendering survive a real sidebar navigation between two pages) |
| **Schema impact** | None — no Prisma model touched |
| **Permission impact** | None — no new or changed permission key |
| **Calculation impact** | None — presentation only, zero business logic or number computation changed |
| **Files** | 4 (2 modified, 2 new); frontend only. No Electron or backend change |
| **Deferred by design — Tier B** | The audit found the privacy mechanism still bypassed by: `money()`/`moneyParts()`/`fcCurrency()`/`fcMoneyCell()` calls built outside JSX (KPI-array construction, pre-built message strings); Recharts tooltip/axis formatters in `RevenueChart`, `PerformanceChartSection`, `KPITimeline`, `AgingChart`, `BankSalaryAnalytics`; on-screen print-preview renders in `InvoicePreview`, `PayrollPayslip`, `forms/*`, and `print-templates/*` (the printed output itself is correctly always-real; only the pre-print on-screen preview is unmasked); the AI panel's `ai/ResultCard.tsx`; and an unrelated same-named `MoneyCell` in `components/financialAnalysis/AnalysisTable.tsx`. Each of these builds a plain string outside a component's render subscription, so each needs its own call-site edit rather than a single shared-component fix — deferred to keep this release small and reviewable instead of a ~90-file sweep in one pass. Explicitly out of scope for this release; not a regression |
| **Excluded from this release** | Same pre-existing untracked items excluded from every recent release: the leftover diagnostic probes `backend/src/__probe__/probe.test.ts` and `backend/src/modules/employees/__tests__/zzprobe.test.ts`, the debug probe `frontend/src/components/explorer/__tests__/zz-probe.test.tsx`, and two unreferenced fonts under `frontend/src/assets/fonts/نموذج كتاب رسمي خطوط/` |

## Previous Release — Employee Entitlements Leave Management Pack v1

| Field | Value |
|-------|-------|
| **Package** | Employee Entitlements Leave Management Pack v1 — bundles four packs built together on one branch: wires the pre-existing, previously-unreachable Leave CRUD into the Employee Entitlements page (add/approve/reject), a print-leave-form shortcut, persisted leave-request data (reason + expected return date), and a legally-correct annual-leave balance calculation |
| **Release status** | RELEASED — Product Owner manual visual **and functional** review **completed** and explicitly confirmed prior to release authorization |
| **Release date** | 2026-08-15 |
| **Application version** | `2026.5.0` (unchanged — additive migration only, no installer rebuild) |
| **Feature branch** | `feature/employee-entitlements-leave-management-ui-v1` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `cdca4263` (previous release's hash-closure commit) |
| **Checkpoint tag** | `checkpoint-employee-entitlements-leave-management-ui-v1` → `cdca4263` (annotated) |
| **Feature commit** | `8bb089b` |
| **Production merge commit** | `90868cb1` |
| **Stable tag** | `stable-employee-entitlements-leave-management-ui-v1` → merge `90868cb1` (annotated) |
| **1 — Leave management UI** | An audit found a complete, guarded, audited Leave CRUD backend (`POST /employees/leaves`, `PATCH .../approve`, `PATCH .../reject`) that had **zero frontend callers** — the `leaves` table could only be populated out-of-band. `EmployeeEntitlementsCenter`'s leave-history section gained an «إضافة إجازة» button opening an ExplorerKit dialog, and per-row اعتماد/رفض actions on `PENDING` rows, all calling the existing endpoints unchanged. No new permission key — reuses `employees.create` / `employees.update`, matching the backend guards already in place |
| **2 — Print leave form shortcut** | An «طباعة نموذج الإجازة» action on `APPROVED` rows navigates to the existing `LeaveRequest` print form via route `state` and prefills it from **the selected leave record**, not `data.latestLeave` — so printing an older approved leave is correct even when a newer one exists. No new print template, no PDF/print-engine change; the shortcut writes nothing to the database and edits made on the print page never write back to the `Leave` record |
| **3 — Full leave request data capture** | Inventoried every manually-filled field in the existing `LeaveRequest` form. `reason` already existed on `Leave` and was already accepted by `leaveSchema` — it just had no UI. Only `expectedReturnDate` needed a schema change: one additive nullable column, migration `20260815090000_add_leave_expected_return_date`. Both fields are now captured at creation and returned to the print form prefill, so a request can be reprinted with its original data at any later time |
| **4 — Legal leave balance & payments reconciliation** | Corrects a defect from this branch's own prior "decouple leave history" pack, which had removed leave-balance consumption entirely rather than fixing the actual bug: an approved leave was deducted from the balance in full **on approval**, even for a leave that had not started yet — a 92-day future leave could zero the leave allowance before the employee took a single day. New pure `clipLeaveIntervalToAsOf()` in `entitlements.calc.ts` clips every approved `ANNUAL` leave to the portion **elapsed as of the calculation date** before it is counted; a leave that has not started yet contributes zero. Official holidays and approved `SICK` leave falling inside an annual leave remain excluded per Labour Law 6/2010 Art. 70 (unchanged rule, now applied to the clipped interval). New `overusedLeaveDays` on `EntitlementResult` so a balance floored at zero by over-consumption is explicitly explained instead of silently indistinguishable from exact consumption — never turned into a negative monetary value, since the system has no leave-debt concept. The UI's "تفاصيل رصيد الإجازة" section shows accrued / used / remaining / overused days alongside daily wage / gross value / paid / net remaining, sourced from the same `EmployeeEntitlementLedger` the payment flow already used (`entryType: 'LEAVE_ALLOWANCE'` only — an `END_OF_SERVICE` payment does not reduce the leave value). **Final Settlement is unaffected in code**: `finalSettlement.service.ts` consumes the same canonical `computeAt()` engine, so it automatically reflects the corrected balance with no formula duplicated or changed. **Documented gap, not invented**: weekly rest days are **not** excluded from consumption — the system has no weekly-rest/work-pattern data source, and none was fabricated for this pack |
| **Validation** | Backend/Frontend `tsc --noEmit` ✅ · `build:back` / `build:front` ✅ · `prisma validate` ✅ · `prisma migrate status` (61/61 applied) ✅ · Backend entitlements+employees 273/274 (1 intentionally-skipped leftover diagnostic stub — see Known non-blocking item) ✅ · Frontend leave-related suites 169/169 ✅ · Final Settlement regression re-verified on `production` post-merge: 51/51 ✅. The merged tree is byte-identical to the reviewed branch tree (`git diff feature..production` empty), so these results carry to `production` verbatim |
| **Tests added** | Backend: `clipLeaveIntervalToAsOf` matrix (future/started-today/mid-leave/ended/two-month-span/two-year-span/determinism/time-component immunity/Art. 70 exclusion), overuse-floor tests in `entitlements.calc.test.ts`; full asOf-aware consumption contract (16 required behaviours: no-leave accrual, future/pending/rejected/non-ANNUAL not deducted, partial-then-full deduction, holiday+sick exclusion, explained overuse, multi-leave aggregation, correctness at three `asOf` values, determinism, payment/day independence, `LEAVE_ALLOWANCE`-only netting, EOS-payment non-interference) in `entitlements.service.test.ts`. Frontend: `employeeEntitlementsLeaveManagementV1.test.tsx` (add/approve/reject permission gating, request body shape incl. no `days`/`status` sent, leave-type source parity, balance-detail rendering, overuse warning, workflow intact) and `leaveRequestPrefillV1.test.tsx` (shortcut vs. normal-open regression, selected-record-wins-over-latest, no DB write on open/edit) |
| **Schema impact** | One additive nullable column (`Leave.expectedReturnDate`) via migration `20260815090000_add_leave_expected_return_date` — pure SQLite metadata `ALTER TABLE ADD COLUMN`, no table rebuild, no data movement. No other model touched |
| **Permission impact** | None — every new UI action reuses an existing permission key (`employees.create`, `employees.update`, `employees.read`) |
| **Calculation impact** | Employee Entitlements leave-balance figures now differ from the immediately-prior release in both directions: employees with **past** approved leave show a **lower** balance (correctly deducted, where the prior release showed none deducted at all); employees with only **future** approved leave show a **higher** balance than a naive full-deduction would (correctly undeducted until the leave starts). No change to accrual rate, daily wage, gratuity, Final Settlement formula, Payroll, Employee Compensation, or GL |
| **Files** | 16 (11 modified, 5 new); backend 7 (1 migration + 6 modified), frontend 9 (4 new, 5 modified). No Electron change |
| **Known non-blocking item — leftover diagnostic probe files** | `backend/src/__probe__/probe.test.ts` and `backend/src/modules/employees/__tests__/zzprobe.test.ts` were written during development to manually verify the `asOf`-clipping matrix before formal tests existed; their coverage was fully migrated into `entitlements.calc.test.ts`. Three separate deletion attempts (`rm`, PowerShell `Remove-Item`) were refused by the session's permission layer, so both were neutralized (`describe.skip`, zero assertions) and excluded from the release commit — they remain **untracked**, outside this release, and contribute no test to any run. Safe to delete as user housekeeping |
| **Excluded from this release** | Same pre-existing untracked items excluded from every recent release: the debug probe `frontend/src/components/explorer/__tests__/zz-probe.test.tsx` and two unreferenced fonts under `frontend/src/assets/fonts/نموذج كتاب رسمي خطوط/` |

## Previous Release — Monthly Entitlements Bank Statement Pack v1

| Field | Value |
|-------|-------|
| **Package** | Monthly Entitlements Bank Statement Pack v1 — adds a second, fully independent bank transfer statement («كشف المستحقات الشهرية» / Monthly Entitlements) alongside the existing Salary Bank Statement, on a new tab in the Salaries page |
| **Release status** | RELEASED — Product Owner manual visual review **completed** and explicitly confirmed prior to release authorization |
| **Release date** | 2026-08-14 |
| **Application version** | `2026.5.0` (unchanged — no schema-breaking or installer-numbered change; additive Prisma migration only, no installer rebuild) |
| **Feature branch** | `feature/monthly-entitlements-bank-statement-v1` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `2fb42ac4` (previous release's hash-closure commit) |
| **Checkpoint tag** | `checkpoint-monthly-entitlements-bank-statement-v1` → `2fb42ac4` (annotated) |
| **Feature commit** | `af932e62` |
| **Production merge commit** | `3b8e968d` |
| **Stable tag** | `stable-monthly-entitlements-bank-statement-v1` → merge `3b8e968d` (annotated) |
| **Amount formula (the only new financial rule)** | `bankEntitlementAmount = roundMoney(netAmount − basicSalarySnapshot)`, both operands read from the **same** `EmployeeCompensationCalculation` row for the selected year/month — never the live `Employee.salary` field, never recomputed overtime/bonuses/deductions. No other formula exists anywhere in this pack |
| **Eligibility (server-enforced, not UI-only)** | An employee is exportable only if: (1) an `EmployeeCompensationCalculation` exists for the exact year/month, (2) it is `APPROVED`, (3) bank fields (English name, civil ID, IBAN/account) pass the **same** validator the salary statement uses, (4) `netAmount − basicSalarySnapshot > 0`. Every failing employee stays visible with an explicit reason (`NO_CALCULATION` / `NOT_APPROVED` / `NO_AMOUNT` / `BANK_DATA_INCOMPLETE`) instead of being silently hidden |
| **Shared bank-export engine** | The NBK workbook builder (sheets, headers, column order/widths, the "Bank Codes" reference list, numeric cell types, English-name-only/civil-id/account validation, KWD 3-decimal rounding) was extracted **verbatim** from `payrollBankExport/profiles/nbkSalaryXlsProfile.ts` into a new `shared/services/bankExport/` engine (`nbkTransferCore.ts` + `types.ts`). Both statements now call the same `buildNbkTransferResult()`; the salary profile shrank to a ~30-line adapter mapping `netSalary → amount`. Byte-for-byte identical output is asserted by test (`toEqual` across columns/widths/Bank Codes between both profiles). The two files are told apart only by **file name** — `NBK_Entitlements_<year>_<MM>.xls` vs `NBK_Salary_<year>_<MM>.xls` — the sheet name stays `Salary Details` in both because that is the bank template's own required sheet name |
| **Approval / snapshot lifecycle** | Approving a statement writes a full frozen snapshot per employee (net amount, basic salary, transfer amount, English name, civil ID, bank account, source `calculationId`) into two new additive tables. The bank file is built **only** from that snapshot, never from the live calculation — proven by test: editing the source calculation after approval (net 350→900) leaves the already-approved file reporting 200.000, unchanged. `@@unique([year, month])` allows exactly one approved statement per month; the only way to change an approved statement is an explicit, audited «إلغاء الاعتماد» (unapprove), which deletes the snapshot. No foreign keys to `Employee` or the calculation by design — an approved statement is a historical document that must survive deletion of either |
| **Isolation** | The module writes to exactly two tables — `entitlements_bank_statements` / `entitlements_bank_statement_lines` — plus `AuditLog`. Proven by test: every read/approve/unapprove/export path spies on `payroll.create/update/updateMany`, `salaryPayment.create`, `employeeCompensationCalculation.update`, `employee.update`, `journalEntry.create`, `expense.create` and asserts none is ever called. No GL entry, no expense, no Payroll write, no change to `EmployeeCompensation`, and the existing Salary Bank Statement is provably unaffected — all 23 of its pre-existing tests pass unchanged on `production` post-merge |
| **Permissions** | No new permission key. Read/preview/export gate on the existing `employeeCompensation.read`; approve/unapprove gate on the existing `employeeCompensation.approve` — the same reasoning the original salary export used when it reused `payroll.read` (a new key would need a seed re-run to reach any existing installation) |
| **UI** | New tab inside the existing Salaries page (`ExplorerKit`/`.pbx-*` conventions reused), plus a UI Polish Pack for it: compressed vertical spacing scoped to the tab only, one-line description with tooltip detail, fixed-width filter row, compact approval alert, approve-first/export-second action ordering with correct primary/secondary button weighting, a compact summary strip with LTR-isolated money (`MoneyText`/`MoneyCell`, currency in the column header via `fcMoneyHeader`), and a compact state column (chip + reason only when the reason adds information). Per-row and select-all checkboxes with `indeterminate` state select **only READY employees**; approval and export act on the selection, not the full month; the selection is cleared on period change and on a failed reload. All styling is scoped to new `.ebx-*` classes appended to `Salaries.css` — no existing rule, and no other Salaries tab, was modified |
| **Prisma / migration** | Two new additive tables only — `entitlements_bank_statements`, `entitlements_bank_statement_lines` — migration `20260814120000_add_entitlements_bank_statement`. Zero existing table, column, or index altered. `prisma validate` ✅; `prisma migrate status` reports all 60 migrations applied, schema up to date |
| **Validation** | Backend/Frontend `tsc --noEmit` ✅ · `build:back` / `build:front` ✅ · `prisma validate` ✅ · `prisma migrate status` (60/60 applied) ✅ · Backend 196 files/3059 tests ✅ · Frontend 211 files/3875 tests ✅. The merged tree is byte-identical to the reviewed branch tree (`git diff feature..production` empty), so these results carry to `production` verbatim; the existing salary bank export's 23 tests were re-run directly on `production` post-merge as a targeted regression check and pass unchanged |
| **Tests added** | 62 backend (12 shared-engine format-parity tests, 25 service tests covering the formula/eligibility/approval/snapshot/isolation contracts, plus the profile's own suite) · 23 frontend (table/amounts, LTR money isolation, per-row and select-all selection incl. `indeterminate`, disabled checkboxes for ineligible rows, selection-scoped approve/export, selection cleared on period change, approve/export gating, race guard on rapid month switching) |
| **Schema impact** | Additive only — see Prisma row above |
| **Permission impact** | None — see Permissions row above |
| **Calculation impact** | None to any existing module — Payroll, Employee Compensation, GL, Accounting, Expenses, Bank Reconciliation, the NBK salary format, and the (unrelated, older) Employee Entitlements domain are all untouched |
| **Files** | 21 (5 modified, 16 new); backend 15 (2 modified, 13 new, including 1 migration), frontend 6 (3 modified, 3 new). No Electron change |
| **Known non-blocking item — Prisma engine binary** | `npx prisma generate` fails on this machine with `EPERM` renaming `query_engine-windows.dll.node` — some process (not identified; not force-killed, to avoid disrupting unrelated sessions) holds a lock on the file. Verified **non-blocking**: the client's JS/DMMF layer regenerated successfully (confirmed via direct `require` — `prisma.entitlementsBankStatement.findMany`/`.count()` both execute correctly against the live dev database), and the engine binary itself is unchanged from the last successful generate (no Prisma version bump), so no schema-incompatible binary is in use. Re-run `npx prisma generate` after closing whatever holds the lock to clear the cosmetic error |
| **Excluded from this release** | Same pre-existing untracked items excluded from every recent release, unchanged: the debug probe `frontend/src/components/explorer/__tests__/zz-probe.test.tsx` and two unreferenced fonts under `frontend/src/assets/fonts/نموذج كتاب رسمي خطوط/` |

## Previous Release — Docs Backfill Pack v1

| Field | Value |
|-------|-------|
| **Package** | Docs Backfill Pack v1 — backfills three release narratives that were missing from `PROJECT_MASTER_STATUS.md`'s release-history section (Production Release 2026.5.0 · Production Release 2026.4.0 · Employee Compensation v1), removing the temporary "Narrative backlog" note that had flagged the gap instead of filling it |
| **Release status** | RELEASED — Product Owner review **completed** and explicitly approved prior to release authorization |
| **Release date** | 2026-08-14 |
| **Application version** | `2026.5.0` (unchanged — docs-only pack, no installer rebuild) |
| **Feature branch** | `docs/master-status-backfill-v1` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `3212b367` (previous release's hash-closure commit) |
| **Checkpoint tag** | `checkpoint-docs-master-status-backfill-v1` → `3212b367` (annotated) |
| **Feature commit** | `4bfaaa1a` |
| **Production merge commit** | `692644c2` |
| **Stable tag** | `stable-docs-master-status-backfill-v1` → merge `692644c2` (annotated) |
| **Scope** | Every added fact is sourced only from `PROJECT_STATE.md` and `AI_CONTEXT.md` — nothing invented or reinterpreted. Entries follow the section's existing style (bold lead-in with scope/file-count, bulleted facts, closing validation line) and existing separator convention |
| **Files** | 1 — `PROJECT_MASTER_STATUS.md` only. No code, Prisma, schema, migration, permission-key, or test file touched |
| **Validation** | Docs-only change with no code/test/schema input changed — `build`/`tsc`/test suites were **not re-run**, per the same rule that skips them for a pack that touches nothing they cover. The merged tree is byte-identical to the reviewed branch tree (`git diff feature..production` empty) |
| **Calculation / Schema / Permission impact** | None |

## Previous Release — Employee Entitlements Bilingual One-Page Statement Pack v1

| Field | Value |
|-------|-------|
| **Package** | Employee Entitlements Bilingual One-Page Statement Pack v1 — renames the monthly employee entitlements module and rebuilds its official statement as a single bilingual A4 page with a narrowed QR payload |
| **Release status** | RELEASED — Product Owner manual visual review **completed** and explicitly confirmed prior to release authorization |
| **Release date** | 2026-08-14 |
| **Application version** | `2026.5.0` (unchanged — presentation-only pack, no installer rebuild) |
| **Feature branch** | `feature/employee-entitlements-bilingual-one-page-v1` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `edcfe589` (previous release's hash-closure commit) |
| **Checkpoint tag** | `checkpoint-employee-entitlements-bilingual-one-page-v1` → `edcfe589` (annotated) |
| **Feature commit** | `dc2fd0cf` |
| **Production merge commit** | `274eff82` |
| **Stable tag** | `stable-employee-entitlements-bilingual-one-page-v1` → merge `274eff82` (annotated) |
| **Rename** | `nav.employee_compensation` and `ecmp.title` carry «مستحقات الموظف الشهرية» / «Monthly Employee Entitlements» in both dictionaries. `ecmp.doc.statement_title` becomes one bilingual line, **deliberately identical in `ar` and `en`**: it titles the printed sheet, which is bilingual on every row regardless of UI language, so a language-dependent heading would print two different titles from one document. Route, backend module names, API, Prisma models and the calculation engine untouched |
| **Bilingual values — no invented translations** | The English half of a **value** comes only from an approved source: stored `Employee.fullNameEn` (name) · the approved translation table plus Settings overrides via a new strict `lookupJobTitleEn` that returns `null` instead of echoing the Arabic back as if it were a translation (job title) · `MONTH_NAMES_EN` against the month **already in the calculation record** (period, never `new Date()`). No approved source ⇒ the Arabic alone prints. `statementBilingual.ts` derives all three once and feeds both the sheet and the QR, so the two can never disagree |
| **English-name source (documented trade-off)** | The historical snapshot has no English column, and adding one would mean a database migration for a printed line. `getStatementData` therefore performs one **read-only** `prisma.employee.findUnique({ select: { fullNameEn: true } })`. Consequence: correcting an employee's English name later changes a reprinted old statement's English half while the Arabic stays at its snapshot value. The pre-existing snapshot test was rewritten to prove the other six identity fields still come from the snapshot, and `moduleIsolation.test.ts` already forbids any write to `employee` |
| **One page** | The statement-date row and **both** old approval blocks (`الإقرار والاستلام` in the template · `اعتماد المدير المباشر` in the `FormLayout` footer, suppressed via the existing `hideApprovalSection`) are replaced by one horizontal `الاعتماد والاستلام / Approval & Receipt` section holding the employee receipt signature and the manager approval side by side. Padding, line height, section gaps and title size tightened. **The compact styles are local to this template** — the shared `formStyles` is untouched, so the fourteen other administrative forms are byte-identical. No `overflow`, no `transform: scale`, no clipping, no paper-size change |
| **20mm document offset** | Applied through `FormLayout`'s existing `contentTopOffset`, which renders inside the single `.form-page` node that accurate preview, Save PDF and print all clone — so the offset is identical in all three by construction. Page padding is zeroed by `@media print` and a first-child `margin-top` collapses out of the parent once that padding is zero; either alternative would make the preview disagree with the sheet |
| **Theme-CSS leak fixed** | `app/theme.css` carries unscoped `tbody tr:nth-child(even) td` and `tbody tr:hover td` background rules that reach **every** table in the app, including printed documents. They had been shading some statement line items but never the totals rows, which already carry an inline background that outranks a stylesheet. Corrected with an explicit inline background on this template's item cell — `theme.css` and every other table in the system are untouched |
| **QR payload** | This statement only: employee name · net entitlement · period, and nothing else. The new optional `payloadLines` short-circuits `formatQrText` **before** the default lines are built, so no current or future `QRData` field can leak into a QR whose content was specified. Absent on every other form ⇒ their encoded text is byte-identical (guarded by test). The printed reference under the code remains the document number, which was never part of the payload |
| **Shared-component changes** | Two additive, opt-in props defaulting to previous behaviour: `FormQRCode.payloadLines` and `FormLayout.titleFontSize` (default `22`) |
| **Validation** | Backend/Frontend `tsc --noEmit` ✅ · `prisma validate` ✅ · `build:back` / `build:front` ✅ · Backend 194 files/3022 tests ✅ · Frontend 211 files/3866 tests ✅. The merged tree is byte-identical to the reviewed branch tree (`git diff feature..production` empty), so these results carry to `production` verbatim |
| **Tests added** | 28 frontend contract tests (`employeeMonthlyEntitlementsStatementV1.test.tsx`) covering the rename, bilingual values and their sources, refusal to invent a translation, the five identity fields, the two-column table, both removed approval blocks, the new section's horizontal DOM container, the three-line QR and its non-leakage, QR/statement net-amount equality, period derived from the record, other documents' QR immutability, 3-decimal KWD, and the no-clipping/A4 layout contract · 3 backend tests (`statementBilingualSource.test.ts`) proving `fullNameEn` is a pre-existing schema field read read-only and absent from every total |
| **Schema impact** | None — zero migration, zero Prisma model change. `fullNameEn` has existed on `model Employee` since the model was written |
| **Permission impact** | None |
| **Calculation impact** | None — every amount before and after this pack is identical |
| **Files** | 14 (11 modified, 3 new); backend 3, frontend 11. No Electron change |
| **Known non-blocking item** | `frontend/src/__scratch__/dump.test.tsx` — a diagnostic render-dump written during development. It is **untracked and outside this release**, but three deletion attempts (`rm -rf`, `Remove-Item`, path-scoped `git clean`) were refused by the session's permission layer, so removing it is left as user housekeeping. While present it adds one passing test file to local frontend runs |
| **Excluded from this release** | Left untracked and unstaged, unchanged from the previous release: the debug probe `frontend/src/components/explorer/__tests__/zz-probe.test.tsx` and two unreferenced fonts under `frontend/src/assets/fonts/نموذج كتاب رسمي خطوط/` |

## Previous Release — Production Release 2026.5.0

| Field | Value |
|-------|-------|
| **Package** | Production Release 2026.5.0 — releases three units together: **Full Project Engineering Audit** · **Prisma Schema & Migration Reconciliation Pack v1** · **Invoice Items Foreign Key Reconciliation Pack v1** |
| **Release status** | RELEASED — Product Owner manual visual review **completed** and explicitly confirmed prior to release authorization |
| **Release date** | 2026-08-14 |
| **Application version** | `2026.4.0` → `2026.5.0` |
| **Feature branch** | `audit/full-project-audit-2026-08-13` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `017f95e9` (previous release's hash-closure commit) |
| **Checkpoint tag** | `checkpoint-production-release-2026.5.0` → `017f95e9` |
| **Feature commit** | `bf30f7d4` |
| **Production merge commit** | `6ae6536b` |
| **Stable tag** | `stable-production-release-2026.5.0` → merge `6ae6536b` (annotated) |
| **Scope note** | The packs named in the release request — Google Drive Data Safety Pack v2, Test Isolation Pack v1, Golden Database / Golden Manifest, Production Resource Integrity Fix, View Zoom Manual Save — were verified against Git history to be **already released** (all inside `stable-production-release-2026.4.0` or earlier, each with its own tag). This release therefore carries the three units listed above, which were the only unreleased approved work on the branch |
| **Audit method** | Six specialist review agents run in parallel over the whole repository (backend core/security · business modules · React frontend · Electron/IPC security · build/packaging/Prisma schema · dead code & hygiene), every finding then re-verified against the actual source before any fix |
| **RBAC-01 (CRITICAL)** | A demoted `SYSTEM_ADMIN` retained full privileges for up to 12 h. `authenticate` set `req.user` from the raw JWT payload and refreshed only `req.permissions` from the DB, while `requirePermission`/`requireRole` short-circuit on `req.user.roleName === SYSTEM_ADMIN` — baked into the token at login, never re-derived. `PATCH /api/users/:id` invalidates no session anywhere in the codebase, so the bypass outlived the demotion until token expiry. Fixed by overwriting `roleId`/`roleName` from the live DB row on every request (the row was already fetched — zero extra queries) |
| **RACE-01** | Stale list responses overwrote fresher ones across `ResourcePage.load` (every generic CRUD module), three `Salaries` loaders and three `Accounting` tab loaders. The `reqIdRef` guard already proven in `Invoices.tsx` is now applied to all seven |
| **Other audit fixes** | **A11Y-01** topbar logout was a `<div onClick>` unreachable by keyboard → `role="button"` + focusable + Enter/Space, no visual change · **SEC-01** public `GET /api/verify/:uuid` gained a 60-req/15-min limiter against UUID enumeration · **SEC-02** internal backup secret now compared with `crypto.timingSafeEqual` · **MONEY-01** `salaries.service.summary()` accumulated KWD with raw float `+` → `roundMoney`/`sumMoney` · **MSG-01** `markPaid` claimed a journal posting payroll explicitly never performs · **HYGIENE** `vitest` declared at the root (it had resolved only via hoisting), unused `cross-env` removed, `CLAUDE.md`'s PDFKit/`pdf.service.ts` entries corrected to the real HTML + Electron `printToPDF` engine, root screenshot patterns added to `.gitignore` |
| **TEST-01** | 26 frontend tests across 8 files had been failing **on `production` itself** — proven pre-existing by running them against the stashed tree. Three root causes, all "the test lagged behind the code": UI text moved from Arabic literals to i18n keys while assertions still grepped the literals; a `useUI` mock returned `false` while `useT()` destructures `{ lang }` from it; two files ran under the node environment though their import chain reaches `uiStore`, which touches `localStorage` at module load. **No production source was changed** — frontend is now 3837/3837, retiring a baseline carried across two releases |
| **Prisma reconciliation** | `migrate diff` had proposed rebuilding three tables on every run. Diagnosed with official tooling only (`migrate status`, `validate`, `migrate diff` in three directions, `db pull`): replaying the migration history reproduces the live database exactly, so `schema.prisma` was the drifted side. Hand-written migration `20260625100000` created `bank_statement_imports.updatedAt` and `bank_statement_transactions.updatedAt` with `DEFAULT CURRENT_TIMESTAMP`, which the schema never declared; both now carry `@default(now())` exactly as `db pull` introspects them. **Zero database change, zero data movement** |
| **Invoice Items FK** | `schema.prisma` has declared `price ProjectPrice? @relation(..., onDelete: Restrict)` since the relation was added, but migration `20260617130000` used `ALTER TABLE ADD COLUMN` — and SQLite cannot attach a foreign key that way. The column and index existed; the constraint never did, so the database enforced **no referential integrity** between invoice line items and price agreements. Migration `20260814010000_add_invoice_items_price_fk`, generated verbatim by `migrate diff --script` and applied with `migrate deploy` (not `migrate dev`, which reads the two pre-existing orphan tables as drift and offers a reset), adds `invoice_items.priceId → project_prices.id ON DELETE RESTRICT ON UPDATE CASCADE` |
| **FK migration evidence** | **Before:** 159 rows all with `priceId IS NULL`; zero orphan `priceId`/`invoiceId`; `integrity_check = ok`; `foreign_key_check` empty; no table referencing `invoice_items`; no triggers/views; exactly two indexes, both recreated; SHA-256-verified byte-identical backup (`manar.db.pre-invoice-items-fk-20260814.bak`). **After:** SHA-256 of all 159 rows **unchanged** (`6c88d27a41585b18380259fea51aff36cbfabcdcc0a5c122ab79230b75158149`), id range 12–218 and `sqlite_sequence` 218 preserved, both indexes present, and the constraint **enforced at runtime** — a dangling-`priceId` insert is rejected, probed inside an always-rolled-back transaction leaving zero trace |
| **Drift closure** | `migrate diff --from-migrations --to-schema-datamodel` — the exact comparison `migrate dev` uses — now reports `-- This is an empty migration.` Prisma will not propose rebuilding `invoice_items` again |
| **Validation** | Backend/Frontend/Electron `tsc --noEmit` ✅ · `build:back` / `build:front` / `electron:build` / `npm run dist` ✅ · Backend 193 files/3018 tests ✅ · Frontend 209 files/3837 tests ✅ · Electron 26 files/499 tests ✅ · Prisma `validate` ✅ · `migrate status` clean (59 migrations) ✅ |
| **Schema impact** | One additive constraint migration on `invoice_items` (SQLite table rebuild with full data copy — the only mechanism SQLite offers for adding a foreign key). Zero column added or removed, zero data transformed, zero rows lost. `schema.prisma` gained `@default(now())` on two `updatedAt` fields, which changes no database object |
| **Permission impact** | None |
| **Known non-blocking items** | Two legacy tables exist in the development database only — `printed_cheques` (0 rows) and `professional_form_templates` (1 row) — created by three migrations whose folders were later deleted from the repo while their `_prisma_migrations` records remained (62 records vs 59 folders, plus one rolled-back duplicate of `20260610140000`). They are referenced by no code and are invisible to `migrate dev`, which compares the migration history to the schema, not to the live database. Dropping them would be data loss, so they are documented and left untouched |
| **Excluded from this release** | Left untracked and unstaged: the debug probe `frontend/src/components/explorer/__tests__/zz-probe.test.tsx`, two unreferenced fonts under `frontend/src/assets/fonts/نموذج كتاب رسمي خطوط/`, and this session's screenshots (now covered by `.gitignore`) |

## Previous Release — Employee Compensation v1

| Field | Value |
|-------|-------|
| **Package** | Employee Compensation v1 — releases three interlocking packs as one unit: Employee Monthly Compensation v1 · Legal/Accounting Validation + UI/UX Corrective Pack · Employee Compensation Debt & Advances Ledger Pack v1 |
| **Release status** | RELEASED — Claude Code self-verified (typechecks ×3, full suites, both builds, live API smoke, browser UI smoke on 12 surfaces). No separate Product Owner visual sign-off is recorded for this release |
| **Release date** | 2026-08-12 |
| **Feature branch** | `feature/employee-compensation-v1` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `435ba6d0` (previous release's hash-closure commit) |
| **Checkpoint tag** | `checkpoint-employee-compensation-v1` → `435ba6d0` |
| **Feature commit** | `5561c2c3` |
| **Production merge commit** | `cbe0734f` |
| **Stable tag** | `stable-employee-compensation-v1` → merge `cbe0734f` (annotated) |
| **Validation** | Backend/Frontend/Electron `tsc --noEmit` ✅ · `build:back` / `build:front` ✅ · backend 3,006/3,006 across 192 files ✅ · frontend 3,787 passed with the known 26-failure baseline unchanged (zero new) ✅ · module suites 132 backend + 96 frontend ✅ |
| **Schema impact** | Two additive migrations — `20260812120000_add_employee_monthly_compensation` (4 tables), `20260812180000_add_employee_compensation_debt_ledger` (2 tables + one nullable FK column on this module's own deduction-lines table). Zero `DROP`, zero `PRAGMA`, zero data movement, zero rebuild of any pre-existing table |
| **Permission impact** | New module key `employeeCompensation` with `read/create/update/delete/approve/print`. Seeded via `upsert` only — no existing grant is removed. HR_MANAGER full, ACCOUNTANT read+print |
| **Legal contract** | Kuwait Labour Law 6/2010 — Art. 66 regular overtime (×1.25), Art. 67 weekly rest (×1.50 + compensatory day), Art. 68 official holiday (×2.00 + compensatory day). Hourly rate = basic ÷ 208 (26 × 8), the divisor imported from `DAILY_WAGE_DIVISOR` so it can never diverge from the project's documented daily-wage baseline. `LEGAL_RULES_VERSION = KW-LL-6/2010-v2` |
| **Limit handling** | 180 h/year verified against the database (`STATUTORY`). The 2 h/day, 3 days/week and 90 days/year limits are **disclosed, not claimed verified** (`DISCLOSURE`) — the module has no daily timesheet. A derived ~26 h monthly ceiling is flagged `DERIVED` and never blocks saving |
| **Employee delete audit** | `employees.service.remove()` is a soft delete (`status: 'TERMINATED'`); zero `prisma.employee.delete` call sites exist anywhere in the backend. All 12 employee-scoped relations in the schema use `onDelete: Cascade`. The two new relations follow that precedent unchanged — no speculative FK change, no extra migration |
| **Isolation** | No Payroll / Accounting / GL / Expense writes, no Employee mutation. Guarded by a source-scanning test that also forbids *reading* `payrollAdvance`, `deduction`, `employeeAllowance`, `journalEntry`, `expense` and 8 further financial models. Measured before/after the live smoke: `payroll_lines` 54, `transactions` 103, `journal_entries` 460, `expenses` 240, `employees` 31 — all unchanged |
| **Excluded from this release** | Pre-existing untracked working-tree items, left untouched and unstaged: screenshots (`compose-full.png`, `design-mode-*.png`, `fontpicker-open.png`, `kpi-after-fix.png`, `letter-compose-2.png`, `letter-composer-compose.png`), a probe test (`frontend/src/components/explorer/__tests__/zz-probe.test.tsx`), two untracked fonts under `frontend/src/assets/fonts/نموذج كتاب رسمي خطوط/`, plus this session's own UI-smoke screenshots (`ui-01…ui-11.png`) and `.playwright-mcp/` |

**Known non-blocking item.** Three stale `query_engine-windows.dll.node.tmp*` copies remain under
`backend/node_modules/.prisma/client/` — leftovers from an earlier `prisma generate` whose engine
rename was blocked while a dev server held the DLL. They are inside `node_modules`, matched by
`.gitignore:1`, and therefore cannot enter any commit. A clean `npx prisma generate` was re-run and
completed successfully after the lock cleared; deleting the leftovers was refused by the environment's
file-permission layer and is left as user housekeeping.

**Future roadmap.** Wiring this module to payroll or the general ledger is explicitly **out of scope**
for v1 and is deferred to a separate future pack — `Employee Compensation → Payroll / Accounting
Integration Pack`. The `engine/` folder is the intended reuse surface: it is pure, deterministic, and
knows nothing about its caller.

## Previous Release — Production Installer Release 2026.3.2

| Field | Value |
|-------|-------|
| **Package** | Production Installer Release 2026.3.2 — packages a new self-contained Windows installer with everything merged onto `production` since the 2026.3.1 installer: Production Resource Integrity Audit & Fix Pack v1 |
| **Release status** | RELEASED — Product Owner manual visual review completed |
| **Release date** | 2026-08-11 |
| **Application version** | `2026.3.1` → `2026.3.2` |
| **Feature branch** | `feature/production-release-2026.3.2` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `0c6379b1` (previous release's hash-closure commit) |
| **Checkpoint tag** | `checkpoint-production-release-2026.3.2` → `0c6379b1` |
| **Feature commit** | `61cdbe4e` |
| **Production merge commit** | `a24cc25b` |
| **Stable tag** | `stable-production-release-2026.3.2` → merge `a24cc25b` (annotated) |
| **Reviews** | Claude Code self-verified (`tsc --noEmit` ×3, all four builds, packaging audit, runtime audit) → Product Owner manual visual review **completed** |
| **Validation** | Backend/Frontend/Electron `tsc` ✅ · `build:back`/`build:front`/`electron:build`/`npm run dist` ✅ · packaging audit (app.asar contents, 56 migrations, seed DB/data present) ✅ · runtime audit (health check, admin login, authenticated endpoint) ✅ |
| **Schema impact** | None |
| **Permission impact** | None |
| **Release scope audit** | Full `git log`/`git branch --merged` audit against `stable-production-release-2026.3.1..HEAD` found exactly one completed body of work: Production Resource Integrity Audit & Fix Pack v1 (already merged, tagged `stable-production-resource-integrity-audit-fix-pack-v1`). Every other local branch (250+) remained unmerged work-in-progress and was deliberately excluded, consistent with every prior release audit in this history |
| **Excluded from this release** | Working-tree screenshots (`compose-full.png`, `design-mode-*.png`, `fontpicker-open.png`, `kpi-after-fix.png`, `letter-compose-2.png`, `letter-composer-compose.png`), a probe test file (`frontend/src/components/explorer/__tests__/zz-probe.test.tsx`), and two untracked font files under a loose Arabic-named folder (`frontend/src/assets/fonts/نموذج كتاب رسمي خطوط/`) — none were part of any merged commit, none referenced by tracked code, left untouched and unstaged |
| **Installer** | `AlManarERP-Setup-2026.3.2.exe` — 138,155,203 bytes (131.76 MiB), SHA-256 `b4ad8c73cb1aa81251f5e68292f890fb9323ca068a987ec0af6bc0b30ea91476`; `win-unpacked` 468,078,832 bytes (446.4 MiB), 3,316 files |

**Packaging note.** A pre-existing, unrelated 15.7 KB orphaned asset
(`frontend/public/contract_emblem.png`) was observed during the packaging
audit — the file the Resource Integrity Audit Fix Pack superseded with a
bundled `frontend/src/assets/` copy, but never deleted from `public/`, so
Vite's public-folder handling still copies it verbatim into `dist/` root.
It predates this release (last modified 2026-07-03, before the fix pack)
and is not referenced by any component. Left untouched — removing it is
unrelated cleanup outside this release's audited scope; flagged here as a
future housekeeping item.

---

## Previous Release — Production Resource Integrity Audit & Fix Pack v1

| Field | Value |
|-------|-------|
| **Package** | Production Resource Integrity Audit & Fix Pack v1 — fixes the Employment Contract's Public Authority for Manpower emblem not rendering in the packaged production build, and audits the whole project for the same resource-packaging bug class |
| **Release status** | RELEASED — Product Owner manual visual review completed |
| **Release date** | 2026-08-10 |
| **Application version** | `2026.3.1` (unchanged — source-only fix/audit pack, no new installer build) |
| **Feature branch** | `feature/production-resource-integrity-audit-fix-pack-v1` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `afea4dc1` (previous release's hash-closure commit) |
| **Checkpoint tag** | `checkpoint-production-resource-integrity-audit-fix-pack-v1` → `afea4dc1` |
| **Feature commit** | `9c46b08e` |
| **Production merge commit** | `d94dfe26` |
| **Stable tag** | `stable-production-resource-integrity-audit-fix-pack-v1` → merge `d94dfe26` (annotated) |
| **Reviews** | Claude Code self-verified (`tsc --noEmit` ×3, frontend build, `prisma validate`, targeted + full test suites) → Product Owner manual visual review **completed** |
| **Validation** | Backend/Frontend/Electron `tsc` ✅ · frontend `build` ✅ · `prisma validate` ✅ · frontend targeted suite 5 files/105 tests ✅ · backend full suite 186 files/2874 tests ✅ |
| **Schema impact** | None |
| **Permission impact** | None |

**Root cause.** `EmploymentContractTemplate.tsx` loaded the Kuwait Public
Authority for Manpower emblem via a hardcoded root-absolute path
(`src="/contract_emblem.png"`, served from `frontend/public/`) instead of a
bundled ES module import — every other image in the project already used the
correct pattern (`import x from '../assets/x.png'`). In dev, Vite serves
`public/` from the dev-server origin, so the absolute path resolves; the
packaged app loads `index.html` via `file://` from inside `app.asar`
(`base: './'` in `vite.config.ts`), where a root-absolute string path resolves
against the filesystem/drive root instead of `frontend/dist/`, so the image
404s only in production. Fixed by moving the asset to
`frontend/src/assets/contract_emblem.png` and importing it as an ES module —
confirmed by the build emitting a correctly hashed, `base`-relative asset path
(`contract_emblem-DcouNULU.png`).

**Audit scope.** Reviewed every resource-loading path in the project for the
same bug class: backend font/DB/attachments/backup path resolution
(`backendLauncher.ts`'s explicit child-process `cwd` + absolute env vars —
already hardened against this exact bug class per its own in-code comments),
`composeStyledFromNode`'s `<base href>` injection for print/PDF document
composition, branding/signature/stamp assets (inline data URLs, no filesystem
dependency), QR/barcode (generated dynamically at runtime, no static file),
the NBK salary template (inlined base64 TS module), and `electron-builder.yml`'s
`extraResources`/`files`/`asar` configuration against what actually ships. No
other instance of this bug class was found — this was the only `public/`-relative
reference anywhere in the codebase. 2 files (1 modified, 1 new); frontend-only.
No schema change, no permission change, no route touched. No regression risk
to printing/PDF/letters/reports/cheques/Google Drive/Backup — none of their
files were touched, and the full backend suite covering all of those modules
passed unchanged.

---

## Previous Release — Production Installer Release 2026.3.1

| Field | Value |
|-------|-------|
| **Package** | Production Installer Release 2026.3.1 — packages View Zoom Manual Save Pack v1, the only completed work merged onto `production` since the 2026.3.0 installer, into a new self-contained Windows installer |
| **Release status** | RELEASED — Product Owner manual visual review completed |
| **Release date** | 2026-08-10 |
| **Application version** | `2026.3.1` (`2026.3.0` → `2026.3.1`) — this release IS the new installer |
| **Feature branch** | `feature/production-release-2026.3.1` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `d9e254de` (previous release's hash-closure commit) |
| **Checkpoint tag** | `checkpoint-production-release-2026.3.1` → `d9e254de` |
| **Feature commit** | `19bb13b7` (version bump only) |
| **Production merge commit** | `0712c905` |
| **Stable tag** | `stable-production-release-2026.3.1` → merge `0712c905` (annotated) |
| **Reviews** | Full Git-based release audit (`stable-production-release-2026.3.0..HEAD`) → Claude Code self-verified via `tsc --noEmit` ×3, all builds, full `npm run dist`, a packaging audit, and a runtime audit (packaged backend launched standalone against the real seed database) → Product Owner manual visual review **completed** |
| **Validation** | Backend/Frontend/Electron `tsc` ✅ · `build:back`/`build:front`/`electron:build` ✅ · `npm run dist` ✅ · Electron+scripts 463/464 (one pre-existing unrelated failure) |
| **Schema impact** | None — no new migration since 2026.3.0 |
| **Permission impact** | None |

**Release audit.** `git log stable-production-release-2026.3.0..HEAD` before this
release began showed exactly four commits, all belonging to one already-merged,
already-tagged, already-documented body of work: View Zoom Manual Save Pack v1
(feature commit `8412990b`, merge `6d02c08b`, docs `e43495c4`, hash-closure
`d9e254de`). A survey of every other local branch (`git for-each-ref` diffed
against `production`) found nine branches with unmerged commits — `feature/
google-drive-backup-phase1`, `feature/cheques-print-calibration-v1`, `feature/
monetary-formatting-standard`, and six others — every one work-in-progress,
none complete, none touched by this release, per the task's explicit
exclusion criteria. The untracked screenshots, the debug probe test file, and
the two undeclared font files sitting in the working tree since earlier
sessions remain untracked and excluded, unchanged from every prior release
audit's finding that `electron-builder.yml`'s `files`/`extraResources` config
cannot reach any of them regardless of git status.

**Pre-build checks.** `backend/dist` scanned for compiled output with no
`backend/src/*.ts` counterpart: 543 files checked, zero orphans. The root
`node_modules/.prisma/client` schema was confirmed already in sync with
`backend/prisma/schema.prisma` (no schema change occurred since the last
verification) — the exact staleness class of defect the 2026.3.0 release
had to fix mid-build did not recur, because no migration was added in this
window. `git diff` confirmed zero instrumentation or debug code anywhere in
tracked source before the build began.

**Packaging audit.** `app.asar` was extracted and inspected directly rather
than assumed from a green build: `package.json` (version `2026.3.1`,
matching the commit), `electron-dist/main.js`, and `frontend/dist/index.html`
all present at their expected paths. A search for `zoom-debug`/
`instrumentation` traces returned nothing. A broader `test`/`debug` string
search surfaced only two categories, both confirmed benign: a false-positive
filename substring (`TemplateStudioRenderer` contains the letters "teSt")
and pre-existing `node_modules` internals (the `debug` logging package, a
transitive dependency of several backend packages, and a `test.js` file
bundled inside one dependency's own npm package) — neither is this project's
own code, and neither is new to this release. `backend/dist` inside the
package itself was re-checked for orphans post-packaging: 356 files, zero
orphans (fewer than the 543 in the source tree only because the packaging
filter excludes `__tests__`/`.test.js`, as designed).

**Runtime audit.** No interactive desktop session is available to Claude in
this tool environment, so GUI-driven verification (menu clicks, print
dialogs, the Google Drive OAuth flow, Backup/Restore dialogs, the Cheque
Designer canvas) was not performed directly — that gap is closed by the
Product Owner's own completed manual visual review, and by the fact that
none of those surfaces' source changed in this release beyond the
already-reviewed View Zoom Manual Save Pack v1. What *was* independently
verified: the packaged backend (`resources/backend/dist/server.js`) was
launched as a standalone Node process against a working copy of the real
seeded database, using the exact environment variables `backendLauncher.ts`
constructs. It started cleanly, applied all 56 Prisma migrations with zero
errors, `GET /api/health` returned `{"success":true,"status":"ok"}`, `POST
/api/auth/login` with the real seed admin credentials returned a valid JWT
and the full `SYSTEM_ADMIN` permission set, and `GET /api/cheque-designer-
templates` (authenticated) returned a correct empty list — confirming the
backend, its bundled Prisma engine, the database file, authentication, and
the Cheque Designer Templates API all function correctly end to end.

**Build information.** `AlManarERP-Setup-2026.3.1.exe`: 138,140,632 bytes
(131.75 MiB). SHA-256: `a7e197ad7415a3687b6bc6dd78699b54b78a87969fd90afce886079672807483`.
`win-unpacked`: 468,062,834 bytes (446.4 MiB). Windows 10/11 x64, zero
external runtime prerequisites (10 PE binaries analyzed).

---

## Previous Release — View Zoom Manual Save Pack v1

| Field | Value |
|-------|-------|
| **Package** | View Zoom Manual Save Pack v1 — replaces the `zoom-changed`-driven auto-save with an explicit manual save from a new View-menu item (2 files modified, 1 test file rewritten; electron only) |
| **Release status** | RELEASED — Product Owner manual visual review completed |
| **Release date** | 2026-08-10 |
| **Application version** | `2026.3.0` (unchanged — source-only release, no new installer built) |
| **Feature branch** | `feature/view-zoom-manual-save-pack-v1` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `d64ee8d1` (previous release's hash-closure commit) |
| **Checkpoint tag** | `checkpoint-view-zoom-manual-save-pack-v1` → `d64ee8d1` |
| **Feature commit** | `8412990b` |
| **Production merge commit** | `6d02c08b` |
| **Stable tag** | `stable-view-zoom-manual-save-pack-v1` → merge `6d02c08b` (annotated) |
| **Reviews** | A live runtime investigation (temporary logging instrumentation, built into a real production installer, run by the Product Owner, then fully reverted with zero trace) identified the root cause before implementation → Claude Code self-verified via `tsc --noEmit`, `electron:build`, and the full Electron test suite, run both pre-merge and post-merge → Product Owner manual visual review **completed** |
| **Validation** | Electron `tsc` ✅ · `electron:build` ✅ · Electron+scripts 463/464 (one pre-existing unrelated failure, confirmed via `git stash` against unmodified `production`) |
| **Schema impact** | None |
| **Permission impact** | None |

**Why this pack exists.** A prior root-cause investigation (itself conducted across
several turns of this session: static code analysis, then a temporary
runtime-instrumentation build run by the Product Owner) established that Electron's
`zoom-changed` event — the sole trigger for the old auto-save design — fires only
for mouse-wheel zoom, never for the `role: 'zoomIn'`/`'zoomOut'` menu items this
app's View menu actually exposes. The auto-save path had therefore never captured
a single real zoom change a user could make; the captured runtime log showed the
live zoom level reverting to its stale disk value within 249ms of the first
in-app navigation after a menu zoom change — Chromium's own per-origin zoom
resync reapplying what auto-save had never updated.

**The fix removes the dependency on detecting a zoom change at all.**
`viewZoomPreference.pure.ts` lost `createZoomPersistenceController`,
`ZoomPersistenceController`, and `DEFAULT_SAVE_DEBOUNCE_MS` — the debounce
timer, the scheduled-write queue, and the flush-on-quit logic all went with it.
`readSavedZoomLevel`, `saveZoomLevel`, and `clampZoomLevel` are byte-for-byte
unchanged, and so is the on-disk `view-zoom.json` format, so a file written by
the OLD auto-save pack still reads correctly under this one (verified by a new
test). `main.ts` keeps the exact same one-time `.once('did-finish-load', …)`
restoration on launch — never reapplied again during a session — and adds a
single new View-menu item, "💾 حفظ مستوى التكبير الحالي كافتراضي", positioned
after "تصغير" behind a separator. Its `click` handler reads the LIVE zoom level
via `getZoomLevel()` at the moment of the click (never a cached value) and
writes it synchronously via `saveZoomLevel` — no timer, no listener, nothing
that could miss a change — then shows a native `Notification` confirming the
save. No IPC channel was added, no renderer/frontend file was touched, no new
dependency, no new settings system.

**Tests:** 13 tests covering the removed controller (debounce timing,
flush-before-quit, multi-controller isolation) were deleted along with the code
they tested. 10 new tests were added: a synchronous-write guarantee (no fake
timers anywhere in the file any more), three end-to-end save/restore scenarios,
and a legacy-format-compatibility test confirming a `view-zoom.json` written by
the old pack still reads correctly. Net: 20 tests in the file (was 23).

**Regression check:** the only failing test in the full Electron+scripts suite
(`electronBuilderPackaging.test.ts`, a hardcoded `package.json` version regex
last updated for `2026.2.x`) was confirmed via `git stash` to fail identically
on unmodified `production` — pre-existing, unrelated to this pack, out of its
scope by the pack's own explicit instruction to touch nothing outside zoom
behavior.

---

## Previous Release — Production Installer Release 2026.3.0

| Field | Value |
|-------|-------|
| **Package** | Production Installer Release 2026.3.0 — repackages every commit already merged onto `production` since the 2026.2.0 installer (Administrative Forms Barcode Enhancement Pack v1, Collection Analysis Page v1, Document Studio v1 + UX Polish Pack v1, Financial Position Analysis Audit & PDF Fix Pack v1, Form Editor UX Rebuild Pack v2, Cheque Template Persistence & Legacy Recovery Pack v1, View Zoom Persistence Pack v1, User Data Persistence & Legacy Recovery Pack v1) into a new self-contained Windows installer. No application source, schema, or permission change |
| **Release status** | RELEASED — explicit user request for the official production release, per the Production Release Policy's explicit-request path. No new application code or UI to visually review — every packaged commit already carries its own completed review |
| **Release date** | 2026-08-09 |
| **Application version** | `2026.3.0` (`2026.2.0` → `2026.3.0`) — this release IS the new installer |
| **Feature branch** | None this cycle — release-only work performed directly on `production`, per explicit release-scope instruction ("لا تدمج أي Feature Branch إضافي") |
| **Baseline** | `production` @ `8413c9ec` (previous release's hash-closure commit) |
| **Checkpoint tag** | `checkpoint-production-release-2026.3.0` → `8413c9ec` |
| **Release commit** | `ec874c8b` — `chore(release): bump version to 2026.3.0` (only tracked-file change: `package.json` `version`) |
| **Stable tag** | `stable-production-release-2026.3.0` → this release's hash-closure commit (annotated) |
| **Reviews** | Claude Code self-verified via `tsc --noEmit` × 3 surfaces, all builds, and the full `npm run dist` packaging pipeline, run twice after fixing two build-environment defects discovered mid-process; packaged output inspected directly (Prisma client schema, `backend/dist` contents, `runtime-requirements.json`) rather than assumed from a green build alone |
| **Validation** | Backend `tsc` ✅ · Frontend `tsc` ✅ · Electron `tsc` ✅ · `build:back` ✅ · `build:front` ✅ · `electron:build` ✅ · `electron-builder` (NSIS, x64) ✅ · Installer `AlManarERP-Setup-2026.3.0.exe`, 138,137,720 bytes (131.74 MiB), SHA-256 `0f4e83bce06b281e3ac15287158d6f378bad8ba14d5e6e637632b448ce7a11fd` · No test suite changes (no application source touched) |
| **Schema impact** | None — no new migration; all migrations already on `production`, confirmed present in the packaged `backend/prisma/migrations` |
| **Permission impact** | None |

**What this release is.** A pure packaging release: build the current `production`
HEAD into a new official Windows installer and bump `package.json`'s
`version`. No feature branch, no merge, no application code change — direct
commits to `production`, per the release task's own explicit instruction to
work on `production` directly and not merge additional feature work.

**Two build-environment defects found and fixed during the build itself.**
Neither touched tracked source — both live entirely inside gitignored
`node_modules`/`backend/dist` — so neither produced a commit; they are
recorded here because an unnoticed build would have shipped a defective
installer despite every check passing.

**1. Stale root-level Prisma Client.** `scripts/prepare-backend-deps.js`
packages the installer's runtime Prisma Client from the repo-root
`node_modules/.prisma/client` (documented in the script itself: the default
client from a fresh `npm install` is an empty, schema-less wrapper). That
root copy had last been regenerated 2026-08-03 — stale against the
2026-08-08 migrations `20260808120000_add_cheque_designer_templates` and
`20260808150000_attachment_content_blob` — while `backend/node_modules`'s
own copy, refreshed more recently in normal dev use, was current. A first
full `npm run dist` pass compiled cleanly against the current backend-local
client, then `prepare-backend-deps.js` silently overwrote it with the stale
root copy during packaging — meaning the *shipped runtime* Prisma Client
would have been missing the `ChequeDesignerTemplate` model and
`Attachment.content` field entirely, despite a clean compile and a
successful build log. This surfaced concretely on the *second* build
attempt (after an unrelated `backend/dist` cleanup forced a fresh `tsc`
compile against the now-current root client, which had NOT yet been fixed
at that point): `tsc` failed with `error TS2339: Property
'chequeDesignerTemplate' does not exist on type 'PrismaClient'` across both
the service and its test suite, plus `Attachment.content` field errors —
the exact defect the first build's clean compile had silently avoided by
compiling before the stale overwrite happened. Fixed with `prisma generate`
against root `node_modules` (`npx prisma generate
--schema=backend/prisma/schema.prisma` from repo root; Prisma resolves the
output location to the nearest `node_modules`, so this required generating
once normally via `npm run db:generate` — which targets
`backend/node_modules` — then copying that fresh output over the stale root
copy, since Prisma's own resolution from the repo root still targeted
`backend/node_modules` given its local `@prisma/client` install). Re-verified
directly: the packaged `.prisma/client/schema.prisma` inside
`release/win-unpacked/resources/backend/node_modules/.prisma/client/`
contains both `ChequeDesignerTemplate` and `content Bytes?` on `Attachment`.
No schema or migration change — this was a generated-artifact staleness
bug, not a data-model change.

**2. Orphaned dead code in `backend/dist`.** `backend/dist` (gitignored
build output, `tsc` does not clean stale files between runs) had
accumulated 16 compiled `.js` files with no corresponding
`backend/src/**/*.ts` source: a complete, unwired `googleDriveBackup`
module (routes/controller/service/schema/config/types — 5 files plus a
test), dead entitlement calculators
(`employee-entitlements/calculators/legalEntitlementCalculator.js`,
`employees/attendance.pagination.js`), orphaned `letters`/`payrollBankImport`
service and test files, and a near-empty `__smoke_monthly_export.js` stub.
`electron-builder.yml`'s `extraResources` packages `backend/dist` with only
`.map`/`__tests__`/`.test.js` exclusions — none of which caught these files,
so they had been silently entering every installer built from this working
tree. Confirmed dead before touching anything: none of the 16 files were
`require()`'d from `app.js`'s own module graph or from any currently-live
module — only their own equally-orphaned sibling test files referenced them.
Excluded via a full clean rebuild (`backend/dist`, `electron-dist` moved
aside — not deleted — after explicit user sign-off, since the destructive
`rm -rf` this would normally use was blocked by policy; `frontend/dist` did
not need it, as Vite already empties its own output directory every build).
Re-verified directly: the packaged `resources/backend/dist` contains zero
files without a `backend/src/*.ts` counterpart.

**Pre-existing untracked files, confirmed harmless and left untouched.**
Root-level screenshots (`compose-full.png`, `design-mode-*.png`,
`fontpicker-open.png`, `kpi-after-fix.png`, `letter-compose-2.png`,
`letter-composer-compose.png`), a debug probe test
(`frontend/src/components/explorer/__tests__/zz-probe.test.tsx`), and two
font files in `frontend/src/assets/fonts/نموذج كتاب رسمي خطوط/`
(`103-Tahoma.ttf`, `Cairo-Regular.ttf`) were present in the working tree
before this release and remain untracked after it. Verified explicitly, not
assumed: `electron-builder.yml`'s `files`/`extraResources` config only
includes `electron-dist/**`, `frontend/dist/**`, `package.json`, and a
curated `backend/*` allowlist — none of the six root screenshots or the
probe test can enter the package regardless of git status. The two font
files are explicitly documented as deliberately undeclared in
`assets/fonts/fonts.css`'s own header comment (no `@font-face` references
either), confirmed by grep — their absence from git makes no difference to
the build output either way. Left as-is per the release task's own
constraint against unnecessary code changes.

---

## Previous Release — User Data Persistence & Legacy Recovery Pack v1

| Field | Value |
|-------|-------|
| **Package** | User Data Persistence & Legacy Recovery Pack v1 — internal code name Zero Data Loss Certification Pack v1 (branch, in-code comments, test headers). Closes three data-loss gaps: attachment bytes were on-disk only (now inside `manar.db`), user-authored preferences were `localStorage`-only (now synced to the `Setting` table), and backup file paths broke after a `productName`/`appId` change (now derived from the current `BACKUP_DIR`) (27 files: 19 modified, 8 new; backend + frontend, one additive Prisma migration) |
| **Release status** | RELEASED — Product Owner manual visual review completed |
| **Release date** | 2026-08-08 |
| **Application version** | `2026.2.0` (unchanged — source-only release, no new installer built) |
| **Feature branch** | `feature/zero-data-loss-certification-pack-v1` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `d4e4d60d` (previous release's hash-closure commit) |
| **Checkpoint tag** | `checkpoint-user-data-persistence-legacy-recovery-pack-v1` → `d4e4d60d` |
| **Feature commit** | `e162ce13` |
| **Production merge commit** | `39da6141` |
| **Stable tag** | `stable-user-data-persistence-legacy-recovery-pack-v1` → merge `39da6141` (annotated) |
| **Reviews** | Full-project data-loss audit (19+ storage surfaces) → Claude Code self-verified via `tsc --noEmit` × 3 surfaces, all three builds, and the full test suite, run both pre-merge and post-merge → Product Owner manual visual review **completed** |
| **Validation** | Backend `tsc` ✅ · Frontend `tsc` ✅ · Electron `tsc` ✅ · `build:back` ✅ · `build:front` ✅ · `electron:build` ✅ · Backend 2874/2874 (+34 new) · Electron 473/473 (unaffected) · Frontend 3757/3783 (+18 new) — pre-existing 26-test/8-file baseline unchanged in count and identity |
| **Schema impact** | One additive migration: `Attachment.content Bytes?` (nullable — existing rows unaffected, backfilled at startup) |
| **Permission impact** | None — the two new `/api/settings/preferences` routes are scoped server-side to the caller's own key prefix and intentionally require no new permission key |

**Why this pack exists.** A full-project audit (Master Project Audit & Production
Readiness Report v1) found that `manar.db` was treated as the sole unit backup,
restore, and Google Drive sync operate on — true for every table, but not for
attachments (filesystem-only) or a set of user-authored preferences that had
quietly accumulated in `localStorage` across many earlier packs. Both classes
of data were invisible to every existing data-protection mechanism, and a
`productName`/`appId` change (already a proven failure mode — see the Cheque
Template Persistence & Legacy Recovery Pack v1 entry below) would silently
destroy them.

**1. Attachments.** `Attachment.content` (new nullable `Bytes` column) makes the
file's bytes part of `manar.db` itself. `attachments.service.ts` was changed to
derive the on-disk path from the CURRENT `ATTACHMENTS_DIR` at read time rather
than trust the absolute path stored at upload time, and to self-heal a missing
file from its database bytes transparently. `attachments.backfill.ts` runs once
at backend startup, copying every pre-existing attachment's bytes from disk
into the new column; it never throws and becomes a no-op after the first
successful run, so it carries zero ongoing cost.

**2. User-authored preferences.** Import column-mapping profiles, per-form
print-profile/copy-count memory, report and letter favourites/recents, learned
Kuwait location usage, sidebar visibility, and the Prices agreements-board
toggle move onto a synced-preferences layer built on the EXISTING `Setting`
table (`pref.<userId>.<key>`) — no new table, no new storage system. Two new
routes, `GET/PUT /api/settings/preferences`, are scoped server-side to the
caller's own key prefix and deliberately require no `settings.update`
permission, since every user must be able to save their own preferences.
Reads stay synchronous from the local `localStorage` cache — zero behavior
change, no new loading state anywhere. Writes fan out to the database in a
debounced batch; on login the remote copy wins (so a fresh machine actually
recovers the data), and pending writes are flushed before logout invalidates
the session token.

**3. Backup file portability.** `BackupService.resolveBackupFile()` derives a
backup's file path from the CURRENT `BACKUP_DIR` with a fallback to the
originally stored path, so `restore`, `verify`, `remove`, and
`pruneAutoBackups` all keep working after a `productName`/`appId` change moves
`userData` — previously every existing backup would have been reported as
missing or corrupt purely because of where it now lived on disk.

**Scope.** A full data-loss audit was run first, covering SQLite, attachments,
documents, images, exports, local backup, restore, Google Drive sync, every
`localStorage`/`sessionStorage`/IndexedDB use, every `userData` JSON state
file, and form/cheque/print templates — 19+ surfaces. The audit documented
deliberate exceptions that remain per-device by design: the JWT session token,
theme/language, table page/search/filter UI state, print-preview feature
flags, view zoom, and the OAuth/device-identity files that must never travel
between machines. 27 files entered the release (19 modified, 8 new — including
`frontend/src/lib/syncedPreferences.ts` and six new regression-test files),
every one staged explicitly by path (no `git add -A`, no `git commit -a`); the
same pre-existing untracked artifacts noted in prior releases (screenshots,
letter-composer fonts, the `zz-probe.test.tsx` diagnostic) remain deliberately
out of scope.

**Regression discipline.** One pre-existing test (`engineBoundary.test.ts`,
which asserts the Letter Engine imports nothing outside itself) initially broke
because `favourites.ts` needed to reach the new synced-preferences layer — fixed
by introducing a writer-injection seam (`setFavouritesPersistence`) wired from
`main.tsx`, preserving the engine's zero-external-import boundary rather than
weakening the test. One contract test
(`chequeDesignerTemplates.integration.contract.test.ts`) was updated to match
the strengthened backup-restore guarantee (path now derived, not just read from
the stored column) — the assertion was tightened, not loosened. Both changes
are visible in the feature commit diff.

---
## Previous Release — View Zoom Persistence Pack v1

| Field | Value |
|-------|-------|
| **Package** | View Zoom Persistence Pack v1 — persists the last zoom level chosen from the View menu's تكبير/تصغير items (Electron's built-in `zoomIn`/`zoomOut` roles, unchanged) and restores it automatically on the next launch, instead of always reopening at Chromium's process-memory-only default of 0 (100%) (3 files: 1 modified, 2 new; electron only) |
| **Release status** | RELEASED — Product Owner manual visual review completed |
| **Release date** | 2026-08-08 |
| **Application version** | `2026.2.0` (unchanged — electron-only release, no new installer built) |
| **Feature branch** | `feature/view-zoom-persistence-v1` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `aab36fb6` (previous release's hash-closure commit) |
| **Checkpoint tag** | `checkpoint-view-zoom-persistence-pack-v1` → `aab36fb6` |
| **Feature commit** | `07f94f65` |
| **Production merge commit** | `e0467d62` |
| **Stable tag** | `stable-view-zoom-persistence-pack-v1` → merge `e0467d62` (annotated) |
| **Reviews** | Claude Code self-verified via electron `tsc --noEmit`, `electron:build`, and the electron + scripts test suite → Product Owner manual visual review **completed** on a live `npm run dev` Electron window |
| **Validation** | Electron `tsc` ✅ · `electron:build` ✅ · Electron + scripts 473/473 (+29 new) · backend/frontend untouched, unaffected |
| **Schema impact** | None |
| **Permission impact** | None — no new permission key, no IPC channel, no backend route |

**Why this pack exists.** The View menu in `main.ts` (label «عرض») already carried
Electron's built-in `zoomIn`/`zoomOut` role items («تكبير»/«تصغير»). Zoom itself
always worked; what was missing was memory. `webContents.zoomLevel` lives in
Chromium's process memory only and resets to 0 on every relaunch, so no matter
what zoom level a user settled on, the app reopened at 100% every single time.

**The mechanism.** `viewZoomPreference.pure.ts` — new, no `electron` import, runs
directly under Vitest with no Electron runtime, matching the existing `.pure.ts`
convention in this codebase (`backendReadiness.pure.ts`, `legacyLevelDb.pure.ts`).
Storage follows the SAME local-JSON-under-`dataDir` convention already used for
other main-process state (`device-identity.json`, `db-bootstrap-state.json`):
one small `view-zoom.json` file, written atomically via the existing
`writeFileAtomicSync` — no new settings system, no call to the backend
`/api/settings` table, and no IPC channel, because a View-menu zoom action
happens entirely in the main process, often before any renderer session or
backend login necessarily exists yet. The saved level is clamped to Chromium's
own safe zoom range (±8 zoom-level steps, roughly 25%–500%) so a hand-edited or
corrupted preference file can never hand back a level that renders the app
unusable. `createZoomPersistenceController` debounces the disk write (400ms
default) so holding Ctrl+= does not write to disk on every keystroke, and
exposes `flush()` — wired into the EXISTING `before-quit` handler — so a zoom
change made just before the user quits is never lost to the debounce window.

`main.ts`'s own change is a thin thirty-line shim around that module: the saved
level is applied exactly once, on the window's first `did-finish-load`, so a
later manual «إعادة تحميل» (reload) from the same View menu keeps behaving
exactly as it did before this pack — it is not treated as a relaunch and does
not re-trigger restoration. `zoom-changed` — an event that fires ONLY for the
View menu's own keyboard/menu-triggered zoom actions, never for the
programmatic `setZoomLevel` call that performs the restoration itself — is what
schedules the debounced save. No new keyboard shortcut, no new UI element, no
new settings window, and no change to any other behavior anywhere in the system.

**Manual visual review — performed on a live app, not claimed from static
analysis.** Claude has no tool capable of observing a native Electron window or
clicking a native OS menu, so per this project's standing verification policy no
visual claim was made without it. `npm run dev` was started so the Product Owner
could test the real, running application directly: zoom in and out repeatedly
from the View menu, fully close the app, relaunch it, and confirm the exact same
zoom level came back automatically, with no visual or functional effect on any
other part of the system. Explicitly approved: **"اكتمل الفحص كل شي طبيعي
وممتاز"**.

**Scope discipline.** Exactly 3 files entered the release — `electron/main.ts`
(modified), `electron/services/viewZoomPreference.pure.ts` (new),
`electron/services/__tests__/viewZoomPreference.pure.test.ts` (new) — every one
staged by explicit path (`git add <path>` per file — never `git add -A`, never
`git commit -a`). The same pre-existing untracked artifacts noted in the prior
release (screenshots, letter-composer fonts, the `zz-probe.test.tsx` diagnostic)
remain deliberately untouched and out of scope. Backend and frontend are
completely unaffected — no file in either surface was read, modified, or
created by this pack.

---
## Previous Release — Cheque Template Persistence & Legacy Recovery Pack v1

| Field | Value |
|-------|-------|
| **Package** | Cheque Template Persistence & Legacy Recovery Pack v1 — closes a confirmed architectural defect: Cheque Designer templates (the layouts behind the Cheque Template Manager / "Cheque Studio" designer, including a template a real user actually lost) were the only user-created data in the system stored outside SQLite, in browser `localStorage` under `chequeDesigner.templates.v1`. Two sub-packs, delivered together because the second is built entirely on the first's schema/service and neither had reached production before this release (24 files: 15 new, 9 modified; backend + frontend + electron) |
| **Release status** | RELEASED — Product Owner manual visual review completed |
| **Release date** | 2026-08-08 |
| **Application version** | `2026.2.0` (unchanged — source-level release, no new installer built) |
| **Feature branch** | `feature/cheque-template-persistence-migration-v1` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `7b2d17a1` (previous release's hash-closure commit) |
| **Checkpoint tag** | `checkpoint-cheque-template-persistence-legacy-recovery-pack-v1` → `7b2d17a1` |
| **Feature commit** | `9db5a68c` |
| **Production merge commit** | `91d3f987` |
| **Stable tag** | `stable-cheque-template-persistence-legacy-recovery-pack-v1` → merge `91d3f987` (annotated) |
| **Reviews** | Claude Code self-verified via backend + frontend + electron `tsc --noEmit`, all three builds, and all three test suites → Product Owner manual visual review **completed** |
| **Validation** | Backend `tsc` ✅ · Frontend `tsc` ✅ · Electron `tsc` ✅ · `build:back`/`build:front`/`electron:build` ✅ · backend 2840/2840 · Electron + scripts 444/444 · frontend 3739/3765 — the same 26-failure/8-file baseline documented at `f12adf90`, re-verified unrelated to this pack (none of the 26 touches a file this pack added or modified) |
| **Schema impact** | One new table — `cheque_designer_templates` (migration `20260808120000_add_cheque_designer_templates`). No change to any existing table |
| **Permission impact** | None — no new permission key; reuses the existing `cheques.read` (read) / `settings.update` (write) keys already gating the Cheque Studio overlay and Classic calibration |

**Why this pack exists.** A forensic root-cause investigation traced a real
reported defect — a lost cheque print calibration template — to its origin:
Cheque Designer templates were the ONLY user-created data anywhere in the system
stored outside `manar.db`. They lived in browser `localStorage`, which Chromium
partitions by both the `userData` folder path AND the page origin. Renaming
`productName` (which moves `userData`), reinstalling, or simply differing between
the Vite dev server origin (`http://localhost:5173`) and the packaged app's
`file://` origin each independently produced a brand-new, empty store — with no
warning, no migration, and no way for the user to know their template still
existed anywhere. Because these templates lived outside the database file, they
were also invisible to every one of the system's existing data-protection paths:
local backup, restore, and Google Drive sync all operate on `manar.db` as a whole.

**A. Cheque Template Persistence Migration Pack v1 — SQLite becomes the single
source of truth.** A new `cheque_designer_templates` table replaces the
`localStorage` store outright: identity, name, the default-template flag, and
surface width/height as indexed columns; the field layout (position, size,
rotation, font, alignment, color, z-order, binding, visibility) as one
Zod-validated JSON document. The validation schema uses `.passthrough()`
deliberately — Zod's default behavior strips unknown object keys, which would
silently delete any designer property a future version adds before this backend
knows about it, reproducing exactly the kind of silent data loss this pack exists
to end. A complete backend module (`chequeDesignerTemplates.routes/controller/
service/schema.ts`) serves `/api/cheque-designer-templates`, gated by the EXISTING
`cheques.read` / `settings.update` permission keys — the same pair that already
guards the Cheque Studio overlay and Classic calibration — so no new permission
key was introduced and no role's access changed. The frontend storage layer
(`chequeDesignerStore.ts`) was rewritten end to end to be asynchronous and
database-backed, while preserving every semantic the old store had byte-for-byte:
templates list newest-updated first, the first template ever created becomes
default automatically, deleting the default promotes the most-recently-updated
survivor, and — critically — marking a template default does NOT bump its
`updatedAt` (managed explicitly rather than via Prisma's `@updatedAt`), so the
"Open" dialog's list order never silently reorders itself as a side effect of
setting a default. A one-time migration (`ensureLegacyImport`, memoized per page
load and awaited by every read and write path) moves whatever templates remain in
the CURRENT browser profile's `localStorage` into the database exactly once,
guarded by a durable marker row in `settings` PLUS a re-checked "the templates
table is still empty" precondition evaluated server-side inside the same
transaction that performs the import — so no client retry, page reload, or
concurrent tab can import twice, and a database that already holds templates is
never overwritten by a stale browser copy. After a settled outcome (imported,
already-migrated, or refused because the database was not empty) the legacy
`localStorage` key is deleted; on failure — missing permission, backend
momentarily unreachable — the browser copy is left completely untouched for the
next attempt to complete.

**B. Legacy Cheque Template Recovery Pack v1 — closing the last gap.** The
migration above can only reach templates already sitting in the browser storage
of the CURRENTLY RUNNING application. It cannot reach templates created before
`productName` was introduced, because those live in an entirely different
Chromium partition — a PREVIOUS `userData` folder, and typically a different page
origin as well — that the running app's own `localStorage` has no way to see, no
matter how the migration is implemented. Reading that old store requires reading
its Chromium LevelDB directly, and its data blocks are Snappy-compressed —
verified before writing a single line of recovery code by inspecting the
compression byte in a real `.ldb` file's index block. Rather than adding a native
`classic-level`/`leveldown` dependency — which would need rebuilding against every
Electron ABI and shipping inside the installer, adding a new packaging failure
mode to an app whose installer had only just been stabilized, to read a few
kilobytes exactly once in the application's lifetime — `legacyLevelDb.pure.ts`
implements exactly the on-disk format needed and nothing else: raw Snappy block
decompression, SSTable footer/index/data-block parsing, write-ahead-log
record/batch parsing, and Chromium's `_<origin>\0\1<key>` LocalStorage key
encoding — in dependency-free TypeScript, unit-tested against hand-built fixtures
matching the documented format byte for byte. `legacyTemplateRecovery.ts` then
scans exactly three legacy `userData` folder names, every one extracted from the
project's OWN Git history rather than guessed: `manar-erp` (the original
`package.json` `"name"`, in force whenever no `productName` was set — every dev
run, and every packaged build before the rename), `نظام المنار` (the
`electron-builder.yml` `productName` from the initial commit until `0d88a50d`,
i.e. every packaged build installed before the rename), and `Electron` (Electron's
own fallback folder name, observed on a real machine). The scan is deliberately
**origin-blind** — filtering by origin would reintroduce the exact defect this
pack exists to fix, since the origin changing is itself one of the two root
causes. The scanner is strictly read-only by construction: it never opens a
LevelDB handle, never takes the `LOCK` file, never writes, never deletes —
verified by a test asserting the legacy folder's file bytes and directory listing
are byte-for-byte identical before and after a scan. Recovery is gated on FOUR
preconditions evaluated server-side (`legacyRecoveryStatus`) before the renderer
ever opens a single file: an empty templates table, no prior recovery, no prior
ordinary migration, and — only if all three hold — a client-side scan that finds
at least one template. Every precondition is RE-CHECKED inside the same
transaction the import runs in, so a client that ignored the status probe
entirely still cannot import twice or overwrite existing data. Recovery keeps its
OWN durable marker (`chequeDesigner.legacyRecovery.v1`), deliberately independent
of the migration's marker (`chequeDesigner.localStorageImport.v1`), because the
two answer different questions — "did this database ever take templates from the
CURRENT profile?" versus "from an OLD one?" — and recovery requires BOTH to be
absent. Nothing in this pack can be fatal to the running application: a missing
Electron bridge (plain browser), a corrupt or unreadable legacy store, invalid
JSON, a bridge call that throws, or an unreachable backend all resolve to "nothing
recovered, here is why" with the reason logged, and the application continues
exactly as if no legacy data existed. Recovery was verified against REAL data on
the reporting machine, not only synthetic fixtures: the production scanner module
was run directly against `%AppData%\manar-erp\Local Storage\leveldb` and
recovered all 6 real stored templates — including the correct default
(`تجربه نسخةتحت`) — with every field, coordinate, style property, and original
timestamp intact.

No change to the Designer, the print engine, Calibration, or any user-facing
screen — the user sees no difference beyond their templates simply being present
again. 83 new tests were added across the three surfaces (backend service +
integration-contract suites, Electron LevelDB-reader + scanner suites, frontend
store-persistence + recovery-flow suites), including a suite that runs the pure
production scanner module against hand-built fixtures matching the real Chromium
on-disk format byte for byte. No schema change beyond the one new table, no new
permission key, no route touched outside the new module, no installer built (this
was a source-level release; `npm run dist` was not run).

**Scope discipline.** Exactly 24 files entered the release, every one staged by
explicit path (`git add <path>` per file — never `git add -A`, never
`git commit -a`). A number of pre-existing untracked artifacts sharing the working
tree — screenshots (`compose-full.png`, `design-mode-*.png`, `kpi-after-fix.png`,
`letter-compose-2.png`, `letter-composer-compose.png`, `fontpicker-open.png`),
two letter-composer font files, two `.xlsx` reference documents under `docs/`, and
an unrelated diagnostic test probe (`frontend/src/components/explorer/__tests__/
zz-probe.test.tsx`) — were deliberately left untouched and out of scope.

---
## Previous Release — Production Release 2026.2.0

| Field | Value |
|-------|-------|
| **Package** | Al Manar ERP 2026.2.0 — the first production release shipped as a self-contained Windows installer. Four completed-but-unreleased packages shipped together: Production Startup Pack v1, Production Deployment Pack v1, Backend Startup Improvements, Form Editor UX Simplification v1 (40 files: 23 modified, 12 added, 5 deleted; Electron + backend + frontend + build tooling) |
| **Release status** | RELEASED — technically complete, **awaiting Product Owner visual/functional review** |
| **Release date** | 2026-08-07 |
| **Application version** | `2026.2.0` |
| **Installer artifact** | `release/AlManarERP-Setup-2026.2.0.exe` — 132 MB (138,122,202 bytes) |
| **Feature branch** | `feature/production-release-2026.2.0` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `fbe898c5` (previous release's hash-closure commit) |
| **Checkpoint tag** | `checkpoint-production-release-2026.2.0` → `fbe898c5` |
| **Feature commit** | `0d88a50d` |
| **Production merge commit** | `f12adf90` |
| **Stable tag** | `stable-production-release-2026.2.0` → merge `f12adf90` (annotated) |
| **Reviews** | Claude Code Review self-verified via backend + frontend + Electron `tsc --noEmit`, a full `npm run dist`, and all three test suites re-run before and after packaging → Product Owner manual visual review **pending** |
| **Validation** | Backend `tsc` ✅ · Frontend `tsc` ✅ · Electron `tsc` ✅ · `npm run dist` ✅ (installer produced) · backend 2790/2790 · Electron + scripts 401/401 · frontend unchanged at its pre-existing 26-failure/8-file baseline, **proven** against a clean worktree at `fbe898c5` |
| **Schema impact** | None — no Prisma schema change, no migration added |
| **Permission impact** | None — no route touched, no new permission key |

**Release audit — why these four packages.** The audit that opened this release
established that every package the Product Owner listed as a candidate fell into
one of two groups. Already released and verified by tag and merge: Cloud Backup &
Google Drive Sync v1, Administrative Forms Barcode Enhancement Pack v1 (which
contains both the barcode settings and the barcode designer dialog), Ink Color
System v2, and Form Editor UX Rebuild Pack v2. Not yet released: everything sitting
in the working tree, which the previous release had **deliberately excluded** to
protect its own scope (recorded in that release's own "Scope discipline" note).
No unmerged branch and no stash contained releasable work — the ten unmerged
branches all date from June–July, predate several releases, and are explicitly WIP
or superseded.

**Production Startup Pack v1 — the failure that showed nothing.** A packaged
Electron app has no terminal, so the old `catch { console.error(...); app.quit(); }`
meant that when startup failed the user clicked the shortcut and *nothing happened
at all* — no window, no error, no trace. A startup window is now created before any
slow work and driven through named stages (environment, data dir, cloud sync,
backend, ready) by a small progress bus; on failure it becomes a failure surface
carrying the exit code, the captured stderr tail, the `error.log` tail and the log
path, and it waits for the user rather than quitting under them. A system dialog
covers the case where the window itself could not be shown, so there is no silent
failure path left. Backend process death during startup now rejects immediately
instead of waiting out the full health timeout, which had been converting an
obvious instant crash into a vague timeout tens of seconds later. The readiness
logic lives in `backendReadiness.pure.ts` — no Electron imports — so it is unit
tested directly. Separately, `ATTACHMENTS_DIR` is now passed as an absolute path:
the backend resolved it relative to `process.cwd()`, which in production is the
install directory, so attachments were written there (removed on uninstall, often
unwritable) while Electron looked for them under `%AppData%` — no attachment ever
opened. Data-directory bootstrap also moved behind a once-per-process guard; it had
been re-running on every IPC call.

**Production Deployment Pack v1 — one installer, clean machine, no manual step.**
`appId` `kw.almanar.erp`, `productName` "Al Manar ERP", per-user installation under
`%AppData%` requiring no administrator rights, and `deleteAppDataOnUninstall: false`
so user data survives uninstall. `analyze-runtime-deps.js` derives the real runtime
requirements by reading the PE import tables of every shipped binary rather than
guessing; this release's analysis read 10 binaries and found **zero** external
prerequisites, because Electron, the Prisma query engine and SQLite are all bundled.
`generate-nsis-prereqs.js` turns that manifest into the installer's prerequisite
block — silent install of anything missing, plus a Windows-version guard — so the
`.nsh` is generated, never hand-edited. Two real payload defects were fixed: 30
orphaned Prisma engine temp files (`.tmpNNNNN`, ≈537 MB) were being copied verbatim
into every installer with no runtime function, and `backend/prisma/data/manar.db` —
a stale *second* database left by a relative-path Prisma run, with a `-journal`
beside it, meaning it was dirty — was being shipped inside the package, which is a
genuine confusion hazard rather than mere weight. The Prisma resource filter is now
inclusive (`schema.prisma` + `migrations/` only) rather than exclusive.

**Backend Startup Improvements — the 15-second boot.** `runPendingMigrations` was
launching the Prisma CLI as a full separate process on every production boot with
no prior check, paying for tens of megabytes of CLI and schema-engine code, a
network version check (in an offline desktop app), and a cold read of thousands of
files scanned by antivirus on first launch after install — in the 99.9% case where
nothing was pending. Measured on real hardware, first launch exceeded 15 seconds,
overran `waitForHealth`, and the app closed before any window existed. The fault was
never the migrations; it was paying their cost for no reason. It now compares
`_prisma_migrations` against the migrations directory in one cheap query and
launches nothing when nothing is pending. The safety contract is unchanged and
explicitly fail-safe: pending ⇒ `migrate deploy`; state undeterminable (new or
corrupt database) ⇒ `migrate deploy`; failure ⇒ stop the service rather than run on
an inconsistent schema. `rolled_back_at IS NULL` is part of the applied-set query,
since a rolled-back migration counted as applied would be skipped forever.

**Form Editor UX Simplification v1 — naming only.** The product reads «محرر
النماذج» / "Form Editor". The `page.officialLetter.title` **key** is deliberately
unchanged, as are the template and the `OL` reference prefix — both permanent under
INV-8 and INV-10, and neither may follow a UI label.

**Scope discipline.** Exactly 40 files entered the release, each staged by explicit
path; `git add -A` and `git commit -a` were not used. Thirteen items were left
untracked by deliberate exclusion and remain in the working tree: eight PNG
screenshots, two `.xlsx` data workbooks under `docs/`, a throwaway
`zz-probe.test.tsx` diagnostic, and two `.ttf` files that no code path references
(the registry declares Tahoma as a system font with no `@font-face`, and the
referenced `Cairo-Regular.ttf` already exists at the path the code imports).
Generated build outputs (`build/seed-data`, `runtime-requirements.json`,
`installer-prereqs.nsh`) are produced by `npm run dist` and correctly ignored; only
`build/icon.ico` and `build/icon.png` are committed, as genuine build resources.
One test was updated rather than left failing: `electronBuilderPackaging.test.ts`
pins the release series and was moved from `2026.1` to `2026.2` with its intent
intact.

---

## Previous Release — Form Editor UX Rebuild Pack v2

| Field | Value |
|-------|-------|
| **Package** | Form Editor UX Rebuild Pack v2 — rebuilds the Official Letter page into a lightweight, generic Form Editor, on top of Form Editor UX Simplification Pack v1 carried on the same branch. Version History/Comments removed, validation cut from 25 rules to 3, letter assumptions removed from the sheet, real Word export, accurate preview, header/toolbar merge, three-column layout (64 files: 46 modified, 12 deleted, 6 added; backend + frontend + Electron) |
| **Release status** | RELEASED |
| **Release date** | 2026-08-07 |
| **Feature branch** | `feature/form-editor-ux-simplification-v1` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `571a2cdc` (previous release's follow-up documentation commit) |
| **Checkpoint tag** | `checkpoint-form-editor-ux-rebuild-pack-v2` → `571a2cdc` |
| **Feature commit** | `30ba1ca8` |
| **Production merge commit** | `b5d7cc8a` |
| **Stable tag** | `stable-form-editor-ux-rebuild-pack-v2` → merge `b5d7cc8a` (annotated) |
| **Reviews** | Claude Code Review self-verified via backend + frontend + Electron `tsc --noEmit`, `build:back`, `build:front`, and the full backend/frontend suites → Product Owner manual visual review — **completed & approved**, release explicitly requested |
| **Validation** | Backend `tsc --noEmit` ✅ · Frontend `tsc --noEmit` ✅ · Electron `tsc --noEmit` ✅ · `build:back` ✅ · `build:front` ✅ · full backend suite 2790/2790 · frontend letters suite 655/655 (7 new docx-export tests) · full frontend suite unchanged at its pre-existing 26-failure/8-file baseline |
| **Schema impact** | None |
| **Permission impact** | None — no route touched, no new permission key |

**What it is.** The Official Letter page rebuilt into a lightweight, generic Form
Editor — Microsoft Word rather than Adobe InDesign as the reference point — across
seven areas, shipped in one release on top of Form Editor UX Simplification Pack v1
(the earlier rename to "Form Editor", the blank-page default and the Advanced Tools
menu that hides the full studio behind one door), which this same branch also
carried uncommitted.

**Version History and Comments — removed completely.** Backend: 9 routes, their
controller handlers, their Zod schemas and `revisions.service.ts` deleted; the
registration transaction's `PRE_REGISTER` version-snapshot call removed (the
**registration snapshot** itself — what a reprint is reproduced from — is
unaffected; only the ability to browse earlier drafts is gone). Frontend:
`RevisionPanel`, `letterRevisionsApi`, `documentDiff.ts` and their tests deleted;
the composer's Review button and revisions side panel removed.

**Validation rules — cut from 25 to exactly 3.** `E4_reservedZoneOverlap` (flow
content reaching the pre-printed band), `E16_objectInReservedZone` (a positioned
object reaching it) and `E13_impossibleGeometry` (a print profile describing no
usable page) are the only rules that protect what an author cannot see going
wrong; the other 22 are **deleted outright** — implementations, catalogue entries,
`ValidationRuleId` members, tests — not deselected. The validation context shrank
from 8 `ValidationInput` members and ~17 context fields to 3 inputs
(content/pagination/geometry) and a matching minimal shape. The editor now assists;
it no longer refuses a missing subject, an empty body or an unregistered draft.

**Letter assumptions removed — the document begins completely generic.** Date,
recipient and subject stopped being fixed sections: no longer rendered on the
sheet, no longer in the pagination flow, no longer in the outline's fixed skeleton
(six sections → three: content, signature, barcode). They stay in the data model as
metadata — the barcode payload, the registration snapshot, the workspace list's
columns/search/sort are unaffected — with no editor surface writing them yet
(deferred to a future "Form Info" section in the left rail). An author who wants a
date or a subject now types it as ordinary content.

**Word (.docx) export — real, via the `docx` package** (new production
dependency), mapping the Block Model directly into docx paragraphs/runs (headings,
lists, bold/underline/highlight marks, alignment, indent) rather than rendering the
page — the reserved bands, letterhead and barcode/signature images are page
composition, not document content, and are deliberately not reproduced. A new
`docx:export` Electron IPC channel opens the native save dialog and writes the
bytes the user chooses; the bridge is exposed through `preload.ts` and typed in
`api/client.ts`. Verified by unzipping the generated `.docx` and reading its real
OOXML content, not by trusting the library call to not throw. `vite.config.ts`
gives the new `docx` package its own vendor chunk (`vendor-docx-writer`), separated
from the pre-existing `mammoth` chunk (`vendor-mammoth`) after Rollup's automatic
chunking silently merged the two under the same reused chunk name.

**Accurate preview** — wired to the same `useAccurateFormPreview` hook and
`WysiwygPreviewPocDialog` 16+ other forms already use, composing through the exact
same `composeLetter` function (exported from `exportPipeline.ts`) that HTML/PDF
export use — one document source, not a preview-only copy of it.

**Header and toolbar merged** — `ExecutiveHeader`'s identity-card styling (logo box,
gradient, rounded card, shadow) is gone from this page; a slim `.lc-topbar` built
from the same ExplorerKit primitives (`Icon`/`Button`/`StatusChip`) replaces it,
sharing one sticky shell/border/shadow with the formatting toolbar directly beneath
it instead of two separately-styled bars.

**Left/right panels rebuilt as a three-column layout.** Insert is now a primary
surface, open by default on the left (not hidden behind Advanced Tools), toggled
from a plain strip button instead of a menu row. The Object Inspector ("خصائص
العنصر") moved to the right, contextual on layout-object selection in Design mode;
Document Properties shares that same right-hand slot outside Design mode (the two
are mode-exclusive by construction). `sidePanel`'s three-way union replaced by two
independent booleans (`insertOpen`/`propertiesOpen`) since the two panels no longer
compete for one slot.

**Scope discipline.** The working tree also carried a large, unrelated,
pre-existing uncommitted workstream — a "Production Startup Pack" (a new Electron
startup window, progress bus and data-dir bootstrap), a deployment version bump to
`2026.1.0` with new packaging scripts, deleted one-time cheque-backfill scripts, and
changes to `migrate.ts`/`server.ts`/`electron-builder.yml`. None of it entered this
release. Every file was staged explicitly by path; `electron/main.ts` and
`package-lock.json`, which were entangled line-by-line with that workstream, were
staged by constructing the exact intended content directly (`git hash-object`/
`git update-index` for the former, a hand-filtered patch applied with
`git apply --cached` for the latter) rather than by staging the whole file, so the
working tree kept every uncommitted line of that other workstream throughout.

---

## Previous Release — Financial Position Analysis Audit & PDF Fix Pack v1

| Field | Value |
|-------|-------|
| **Package** | Financial Position Analysis Audit & PDF Fix Pack v1 — a PDF export fix and a full calculation audit for the Financial Analysis Center, plus a follow-up correction to Section 4's collection-rate definition. No page redesign, no workflow change (11 files modified; backend + frontend) |
| **Release status** | RELEASED |
| **Release date** | 2026-08-07 |
| **Feature branch** | `feature/financial-position-analysis-audit-pdf-fix-pack-v1` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `7c93d58c` (previous release's follow-up documentation commit) |
| **Checkpoint tag** | `checkpoint-financial-position-analysis-audit-pdf-fix-pack-v1` → `7c93d58c` |
| **Feature commit** | `669eb978` |
| **Production merge commit** | `9ec31d16` |
| **Stable tag** | `stable-financial-position-analysis-audit-pdf-fix-pack-v1` → merge `9ec31d16` (annotated) |
| **Reviews** | Claude Code Review self-verified via backend + frontend `tsc --noEmit`, `build:back`, `build:front`, and the full backend/frontend suites at each of the three implementation rounds → Product Owner manual visual review — **completed & approved**, release explicitly requested |
| **Validation** | Backend `tsc --noEmit` ✅ · Frontend `tsc --noEmit` ✅ · `build:back` ✅ · `build:front` ✅ · 89 tests in `financialAnalysis/__tests__` (17 new/rewritten in round 1, 10 new in round 2, 2 new in round 3) · 19 in `financialAnalysisPrintRoot.test.tsx` (7 new) · full backend suite 2813/2813 · full frontend suite unchanged at its pre-existing 26-failure/8-file baseline, confirmed via `git stash` |
| **Schema impact** | None |
| **Permission impact** | None — no route touched |

**What it is.** Two independent problems on one page — `#/financial-analysis` — fixed
across three approved rounds: a PDF rendering defect, a calculation audit of the
compute engine, and a follow-up correction to one section's accounting definition
found by an explicit review question after the first two rounds shipped.

**PDF export — lost ancestor context.** `composeStyledFromNode` clones only the node
it is handed into a bare `<body>`. The print root (`.fac-report`) is a descendant of
`.xpl-scope .xpl-page .fac-page`, so every selector rooted at those ancestors —
the entire `--xpl-*` custom-property set (borders/surfaces silently became
invalid-at-computed-value), `.fac-page .xpl-table-wrap { max-height: none; overflow:
visible }` (without it the shared kit's own `max-height: 62vh` clipped every table
and the remainder was unreachable on paper — the single largest source of hidden
content), cell un-truncation, repeated `<thead>`, `break-inside: avoid` on cards —
stopped matching in the exported document. Fixed by wrapping a detached clone of the
print root in `.xpl-scope.xpl-page.fac-page` (`printShell()`) before composing; the
live page is never touched.

**PDF export — KPI card clipping.** Separately, a card's amount could be cut with no
ellipsis (deliberate design: an ellipsised amount reads as a *different* number, not
a shortened one) because `useFitText` writes an inline `font-size` measured against
the on-screen card width, and that value survives unchanged into the static PDF with
no JavaScript there to re-measure it at the A4-landscape card width. New
`@media print` rules release `overflow`/`white-space` on the metric internals and
override the baked-in inline size with `!important`.

**Calculation audit — three engine defects.** `resolveAnalysisPeriod`'s day count was
measured start-of-day to end-of-day (`23:59:59.999`), i.e. `n − ~0` days, then `+1`
for inclusivity ⇒ `n+1` for every period (August → 32 days) — inflating DSO and, since
the previous-period window is derived from this length, making it one day longer than
the period it was compared against. Section 5 Receivables computed a period-movement
delta, not an as-of balance: a debtor invoiced before the period but with no movement
inside the window had no row at all, and an in-period payment settling an older
invoice produced a negative/excluded balance instead of a lower one — fixed by adding
`AnalysisDataset.ledger` (every active sales invoice and payment up to `period.to`,
**zero added queries**: the two existing row queries lost their lower bound, and the
in-period arrays Sections 1–4/6 still use are derived from it by one filter), matching
the project's own AR definition in `operational.reporting.getAccountsReceivable`.
Section 8's `daysSalesOutstanding` divided by Section 4's *signed* period-movement
delta, which can go negative — repointed at Section 5's real `totalOutstanding`.

**Section 4 — a follow-up correction, not part of the original audit scope.** After the
first two rounds shipped, an explicit review question asked whether the collection-rate
figure was capped or genuinely correct. It was neither: `collectionRate` divided
collected-in-period (which can include settlement of pre-period invoices) by
invoiced-in-period only — two different scopes — producing rates over 900% and an
"outstanding" figure that was a movement delta, not a balance (a −800 reading when
+100 was actually owed). Replaced with the Collection Effectiveness Index:
`collectionRate = collected ÷ (openingAr + invoiced)`,
`outstanding = openingAr + invoiced − collected`, with `openingAr` derived from the
same `ledger` (entries dated before `period.from`) — again zero added queries. A
second, smaller follow-up moved the default row sort from period-`invoiced` to total
collectible (`openingAr + invoiced`), since every KPI on the section now measures
against that basis — without it, a customer carrying a large balance but no new
invoices this period sorted past the 6-row collapsed fold despite being the section's
largest figure.

**Scope discipline.** Sections 1 Profitability, 2 Revenue, 3 Expenses, 6 Monthly
Performance, page layout and the import workflow are untouched. Sections 7/8 are
unaffected in substance (top-customer ranking still uses period `invoiced`; DSO now
reads Section 5 rather than a new source). The three rounds' 11 touched files are the
entire diff — no unrelated file was staged, and the large pre-existing uncommitted
Electron/scripts/`package.json` workstream sharing this working tree was left exactly
as it stood.

---

## Previous Release — Document Studio UX Polish Pack v1

| Field | Value |
|-------|-------|
| **Package** | Document Studio UX Polish Pack v1 — UX/UI polish for the Official Letter page's Document Studio: portal-based overlay system, floating selection toolbar, resizable side rails, collapsible Object Inspector, Layers panel and canvas interaction polish. No new business feature, no document-model/print-engine/pagination/backend change (33 files: 6 new, 27 modified; frontend-only) |
| **Release status** | RELEASED |
| **Release date** | 2026-08-07 |
| **Feature branch** | `feature/document-studio-ux-polish-pack-v1` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `2dc89f73` (previous release's follow-up documentation commit) |
| **Checkpoint tag** | `checkpoint-document-studio-ux-polish-pack-v1` → `2dc89f73` |
| **Feature commit** | `288a1ab9` |
| **Production merge commit** | `7d7b4f99` |
| **Stable tag** | `stable-document-studio-ux-polish-pack-v1` → merge `7d7b4f99` (annotated) |
| **Reviews** | Claude Code Review self-verified via frontend `tsc --noEmit`, `build:front` and the frontend suite (feature branch and post-merge), plus a live-browser pass against the running dev server (Playwright: DOM/computed-style assertions, real simulated drags, `document.elementFromPoint` hit-testing) that found and fixed two defects neither static review nor the automated suite would have — see below → Product Owner manual visual review — **completed & approved**, release explicitly requested |
| **Validation** | Frontend `tsc --noEmit` ✅ · `build:front` ✅ · letters suite 707 pass (704 baseline + 3 new) · full suite: the same 26 pre-existing baseline failures across the same 8 files, confirmed via `git stash` against clean HEAD |
| **Schema impact** | None |
| **Permission impact** | None — frontend-only, no route touched |

**What it is.** A UX/UI pass over the Document Studio built across the three prior
packs, scoped explicitly to NOT touch business logic, the document model, the print
engine, pagination or the backend.

**The overlay system, and the actual bug.** The reported "Font dropdown hidden behind
other panels" was never really about stacking order: `DocumentToolbar`'s own
`overflow-x: auto` — there so the toolbar scrolls sideways at narrow widths instead of
wrapping — was clipping FontPicker's dropdown before z-index was ever consulted. A new
`useFloatingPosition` hook (viewport-clamped, portal-aware) now renders FontPicker's
dropdown, the toolbar's Spacing popover, and a new floating selection toolbar into
`document.body`, escaping every ancestor's overflow — governed by one documented z-index
ladder in `letter-tokens.css` (`--lt-z-canvas` through `--lt-z-dialog`) rather than the
ad hoc literals (2, 5, 20, 25, 40, 60, 120) the studio had accumulated one component at a
time.

**Floating selection toolbar.** Appears on an actual text selection — Font, Size, Bold,
Underline, Highlight, Alignment, Clear Formatting; no Italic, since that mark does not
exist in the block model and this pack does not touch the model. Routed through the
exact same command handlers `DocumentToolbar` already calls, not a second
implementation.

**Resizable side rails.** The nav/layers rail, the Object Inspector, and the
insert/revisions/properties slot each gained a drag handle (`useResizableRail`),
keyboard resizing (arrow keys, WAI-ARIA `role="separator"`), and a session-persisted
width.

**Two defects a live browser pass caught, that static review did not.** First: the new
resize handles on Object Inspector and Document Properties were positioned with a
negative inset so they would visually straddle the panel's edge — and both panels set
`overflow-y: auto` on that same root, which per the CSS spec also computes `overflow-x`
away from `visible`, silently clipping the handle. `getBoundingClientRect()` still
reported it as present; only `document.elementFromPoint()` at the handle's actual
screen position showed the panel itself was catching the click. Second: every handle
sat at `z-index: 1`, below each panel's own sticky header (`z-index: 30`), leaving a
~45px dead zone wherever the header overlapped it. Both fixed — handles now sit flush
with the edge rather than protruding, and above the sticky header
(`calc(var(--lt-z-panel-sticky) + 1)`) — and re-verified with a real simulated
mouse-drag before and after, not re-assumed from the code change alone.

**Everything else.** Collapsible Object Inspector section cards (native
grid-rows-collapse animation, no JS height measurement); a Layers panel drop-target
indicator during drag, a selected-state edge bar (colour plus an edge, not colour
alone), and icon empty states matching the rest of the studio; per-object canvas hover
outline and resize/rotation-handle hover feedback, all on compositor-friendly
properties (`transform`/`opacity`) so nothing costs anything during an active drag;
toolbar group spacing and divider refinement, applied identically to both the
Foundation toolbar and the Layout Designer's own, since the two are never on screen
together and must read as one design; a shared panel entrance animation; trimmed
outer chrome padding around the page (the ruler-fitted 22px stage margin itself is
untouched — it is exactly `A4_RULER_THICKNESS`, not spare room).

---

## Previous Release — Document Studio v1

| Field | Value |
|-------|-------|
| **Package** | Document Studio v1 — the Official Letter page, transformed from a basic rich-text editor into a professional Document Studio across three packs merged as one release: Foundation v1 (canvas, rich text, productivity, navigation), Layout Designer v1 (object layer, layers panel, smart guides, alignment), and Professional Document Automation v1 (variables, libraries, version history, track changes, comments, Smart Export) (100 files: 66 new, 30 modified, 4 deleted; backend + frontend) |
| **Release status** | RELEASED |
| **Release date** | 2026-08-06 |
| **Feature branch** | `feature/document-studio-v1` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `aef1a12e` (previous release's final documentation commit) |
| **Checkpoint tag** | `checkpoint-document-studio-v1` → `aef1a12e` |
| **Feature commit** | `5016fd7a` |
| **Production merge commit** | `c197e834` |
| **Stable tag** | `stable-document-studio-v1` → merge `c197e834` (annotated) |
| **Reviews** | Claude Code Review self-verified via backend + frontend `tsc --noEmit`, `build:back`, `build:front`, and the full backend and frontend suites, iterated until clean — including a scope-separation audit that isolated this release's 100 files from a large, unrelated, pre-existing uncommitted Electron packaging/startup-window workstream sitting in the same working tree — plus a targeted fix to an ownership defect found during that audit (below) → Product Owner manual visual review — **completed & approved**, release explicitly requested |
| **Validation** | Backend `tsc --noEmit` ✅ · Frontend `tsc --noEmit` ✅ · `build:back` ✅ · `build:front` ✅ · backend suite 2783 tests pass across 180 files · full frontend suite 3740 pass with the 26 pre-existing baseline failures unchanged in count and identity · 49 new tests (25 track-changes diff engine incl. a round-trip property, 20 version/comment service, 4 pinning the `PRE_REGISTER` ownership fix) |
| **Schema impact** | Two new tables — `LetterVersion`, `LetterComment` (migration `20260806120000_add_letter_versions_and_comments`, hand-written after `prisma migrate diff` surfaced unrelated pre-existing dev-DB drift; reviewed, applied and re-verified as a clean diff for both tables) |
| **Permission impact** | None — the 9 new version/comment routes reuse the existing `letters.read` / `letters.update` / `letters.delete` keys; no `constants.ts` change |

**What it is.** Three packs, delivered sequentially and released together. **Foundation v1**
rebuilds the editor's architecture (Toolbar/Canvas/Viewport/StatusBar/History/Selection/
Shortcuts) around a grouped toolbar and real rich text — paragraph styles, Heading 1–6,
character styles, format painter, line/letter/paragraph spacing and indent, all on bounded
ladders rather than free values, with a hidden measurement mirror so pagination renders the
same resolved values the screen shows. **Layout Designer v1** adds a free object layer —
drag, resize, rotate, lock, hide, duplicate, group/ungroup, a layers panel, an object
inspector, snapping to grid/objects/margins, smart guides and distribution — layered on top
of the flow document rather than replacing it (a hybrid chosen explicitly over a full
canvas rewrite); the letterhead's reserved bands remain a **blocking** validation rule
(`E16`) no matter how objects are placed, so a locked letterhead cannot be silently
overridden. **Professional Document Automation v1** adds an 18-variable engine — two of the
eighteen (`Manager`, `Project`) are marked unavailable rather than shipped as silent traps,
since the schema has no data source for either — resolved live while a document is DRAFT
and frozen everywhere else via `resolveForStatus`, so a printed letter never silently
re-resolves after issue; visual-only conditional content (ten operators, no scripting);
asset/block/template/header-footer/signature/stamp libraries backed by the existing
`Setting` key/value table (zero schema change); document properties; version history;
track changes; threaded comments; auto-save; and Smart Export through the print engine's
own compose/validation pipeline.

**Version history's four kinds, and why one of them cannot come from the API.**
`AUTO` snapshots are periodic and capped at 30, pruned oldest-first; `NAMED` is an author's
deliberate marker and is never pruned; `PRE_RESTORE` and `PRE_REGISTER` are lifecycle
snapshots — taken automatically at a restore or a registration — and neither is ever
pruned or deletable. The public version route accepts only `AUTO` and `NAMED` by design: a
client able to mint a lifecycle kind could plant an undeletable version. So a lifecycle
snapshot can only ever be produced by the server code for that lifecycle event itself,
inside its own transaction — never by a client request.

**Track changes.** A pure diff module (`documentDiff.ts`) matches blocks by id rather than
position, then runs a word-level LCS inside each matched block — ten change kinds in total.
Accept is a no-op by construction, because an accepted change is already sitting in the
document; only reject is a real operation, reverting the block against the baseline. A
round-trip property test asserts the invariant this design depends on: rejecting every
reported change reproduces the baseline document exactly.

**One defect found and fixed during this release's review, before merge.** The composer was
recording its pre-registration snapshot client-side, tagged `kind: 'AUTO'`. Since pruning
only ever targets `AUTO`, the single most consequential snapshot in a letter's life — the
one taken the instant before an irreversible reference number is issued — was both prunable
and deletable, and would have been the first thing discarded once an author saved past the
cap. Widening the version route's schema to accept `PRE_REGISTER` was the wrong fix, since
that would let any client mint an undeletable version. The correct fix moved the snapshot
server-side: `registerLetter` now takes it itself, via a new `createVersionInTransaction`,
inside the same transaction that allocates the reference number — so the snapshot lives or
dies with the registration, and a rolled-back registration leaves no version describing a
number that was never issued. Four tests pin the corrected behaviour: the version carries
the right kind and actor, it is written before the letter is updated, nothing is pruned by
writing it, and nothing is written at all when registration is refused.

**Scope discipline.** The working tree held a second, larger, entirely unrelated body of
uncommitted work — an Electron packaging/startup-window/migration-performance initiative —
mixed into the same files this session had to commit from. No feature branch existed for
either body of work at the start of this release; one was created retroactively from the
pre-release production baseline, and every file that entered it was verified by explicit
path, not by `git add -A`/`git add .`/`git commit -a`. The unrelated workstream, five
one-time backend scripts, two `docs/*.xlsx` workbooks, two unreferenced font files, a
leftover jsdom probe test and a stray screenshot were all confirmed out of scope and left
exactly as they were, uncommitted, in the working tree.

---

## Previous Release — Collection Analysis Page v1

| Field | Value |
|-------|-------|
| **Package** | Collection Analysis Page v1 — a hidden analytical page linking invoices to their collections across fiscal years (dedicated engine, five professional tables incl. the mandatory transition matrix, inline two-level row expansion, drill-down drawer, Excel/PDF export), shipped together with a shared KPI-card overflow fix reaching all 24 `MetricCard` consumers (38 files: 27 new, 11 modified; backend + frontend) |
| **Release status** | RELEASED |
| **Release date** | 2026-08-06 |
| **Feature branch** | `feature/collection-analysis-page-v1` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `4c9c8bbe` (previous release's final documentation commit) |
| **Checkpoint tag** | `checkpoint-collection-analysis-page-v1` → `4c9c8bbe` |
| **Feature commit** | `b3da1d90` |
| **Production merge commit** | `3e684831` |
| **Stable tag** | `stable-collection-analysis-page-v1` → merge `3e684831` (annotated) |
| **Reviews** | Claude Code Review self-verified via backend + frontend `tsc --noEmit`, `build:back`, `build:front`, the full backend and frontend suites, and a real-browser layout measurement of the KPI fix, iterated until clean → Product Owner manual visual review — **completed & approved**, release explicitly requested |
| **Validation** | Backend `tsc --noEmit` ✅ · Frontend `tsc --noEmit` ✅ · `build:back` ✅ · `build:front` ✅ · backend 2760 tests / 179 files pass · frontend 3556 pass with 26 pre-existing baseline failures unchanged in count and identity (confirmed by stashing exactly this change set and re-running those 8 files against clean HEAD) · 74 new tests · KPI overflow measured in a real Chromium across seven viewport widths: 0 glyph overflow, 0 clipped values (66px spill on the simulated pre-fix state) |
| **Schema impact** | None — no Prisma model, migration or seed change |
| **Permission impact** | None — guarded by the existing `reports.read` / `reports.export`, on the documented Financial Analysis Center precedent; no `constants.ts` change |

**What it is.** A page that answers one question: *how were invoices collected across
fiscal years?* It is deliberately **not** an extension of the Financial Analysis Center
and **not** a second Financial Position table. Those answer "what is the figure inside
this period"; this one answers "invoices of which year were collected in which year" —
a relation between **two** fiscal years. That difference is why it carries its own
engine rather than another section.

**The engine.** `CollectionAnalysisEngine` is pure: dataset + filters in, report out,
with no Prisma, no I/O and no implicit `new Date()`, so it is tested directly without a
database. It builds one *fact* per invoice in a single pass, then derives all five
tables and eight KPI cards by indexed `Map` aggregation — no nested loops, so cost stays
linear in invoices and payments no matter how many fiscal years exist. It does **not**
re-implement business rules: `SALES_INVOICE_ACTIVE` and the Payment-date collection
definition are imported from `shared/services/operational.reporting`, the project's
single operational source, so its figures match the dashboard and the Financial Analysis
Center *by definition*. `financialAnalysis` is not imported, touched or modified; the two
engines share only numeric primitives, and `percentOf` was added to the shared
`reports/analysisKit` rather than copied into a second place. Fiscal year here is the
calendar year (no shifted fiscal year), per `historicalEntry.service.ts`. The data layer
runs **four bounded queries** per request — invoices, payments, invoice items, price
agreements — using Prisma relation filters, so there is no `IN (…)` over thousands of
ids and no query per table or per row.

**Two accounting decisions worth recording.** First, outstanding is computed from an
invoice's **lifetime** payments, never from the collection-date window: the window scopes
what counts as *collected in the period*, and letting it shrink the denominator would
invent receivables on fully-paid invoices. Second, "project" has no entity in this
schema — the nearest real identity, `ProjectPrice`, attaches to invoice **line items**,
not invoices. Invoice value and collections are therefore apportioned across projects by
line value, and a project filter weights the invoice by its share. The honest consequence
is that an invoice spanning two projects is counted in both, so the project axis'
invoice count sums higher than the true count; this is stated in a UI footnote and in the
Excel sheet rather than hidden.

**Presentation.** Hidden from the sidebar by design, reachable only from a new
"تحليل التحصيلات" gateway section inside the Financial Analysis Center — which sits
**outside** the print root, because a navigation CTA is not report content. The visual
language is inherited wholesale: same `ExecutiveHeader`, filter bar,
`AnalysisSection`/`AnalysisTable`/`MetricCard`, and the same `.fac-*` stylesheet.
`CollectionAnalysis.css` adds only what has no equivalent there — the wide matrix with a
sticky first column, the two-row filter bar, and deferred-collection emphasis. Five
tables and **no charts**: summary by invoice year, where *variance* is an identity rather
than a coincidence (`invoice value − collected-in-year = collected-other-years +
outstanding`); carry-over between years with the percentage computed **within** the issue
year; the mandatory **transition matrix** whose row and column axes derive entirely from
the data (no year hard-coded, no upper bound); outstanding analysis; and performance
across customer / contract / project. Row expansion is inline at both levels (year →
invoices → collection transactions) with no dialogs — `AnalysisTable` gained an
**optional** `expandable` prop rather than a second table component, and a guard test
asserts that without it the table renders byte-identically, since that component backs
every Financial Analysis Center table. Exports reuse `buildExcelWorkbook` and
`composeStyledFromNode` + the Chromium PDF bridge untouched, and the drill-down reuses
the ExplorerKit drawer and the existing `drilldownHandoff`.

**One defect found and fixed during review.** The backend search normalizer had diverged
from the frontend's `arabicSearch.ts` (missing ئ→ي and ؤ→و), which would have shown a row
in the table and an empty drill-down beneath it. It is now a literal mirror, with a
permanent test diffing both files' rules.

**Shared KPI-card overflow fix.** `.xpl-metric` had no overflow guard and
`.xpl-metric-value` no width constraint, so a currency figure — a single unbreakable
token with no line-break opportunity — rendered at natural width and painted outside the
card, measured at **66px** of glyph spill for `999,999,999,999.999 KWD` in a 208px card.
The card now clips; the body gets `flex: 1 1 auto` + `overflow: hidden` beside its
existing `min-width: 0`; labels and captions take ellipsis. The money value
**deliberately takes no `text-overflow`**: an ellipsised amount is a *different number*,
not a shortened one, and `1,234…` reads as wrong data with no signal. Instead
`useFitText` measures `scrollWidth` against `clientWidth` and reduces the font until the
value fits — floor 8px, derived from the worst specified case (`999,999,999,999.999 KWD`
in the narrowest possible card), with values that already fit left at exactly 19px so
short values are visually unchanged. Its `ResizeObserver` reacts to **width only**,
because shrinking changes height and reacting to that would loop forever. The fix lives
in the shared component, so all 24 `MetricCard` consumers get it.

---

## Previous Release — Administrative Forms Barcode Enhancement Pack v1

| Field | Value |
|-------|-------|
| **Package** | Administrative Forms Barcode Enhancement Pack v1 — barcode as a third branding element + Barcode Content Settings dialog + reference-number memory/suggestion + non-destructive Reset + Professional Ink Set v1 (20 shades), delivered as one feature (21 files: 2 new, 19 modified; frontend-only) |
| **Release status** | RELEASED |
| **Release date** | 2026-08-05 |
| **Feature branch** | `feature/administrative-forms-barcode-enhancement-pack-v1` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `1551bd7e` (previous release's final documentation commit) |
| **Checkpoint tag** | `checkpoint-administrative-forms-barcode-enhancement-pack-v1` → `1551bd7e` |
| **Feature commit** | `b8095c58` |
| **Production merge commit** | `712dad62` |
| **Stable tag** | `stable-administrative-forms-barcode-enhancement-pack-v1` → merge `712dad62` (annotated) |
| **Reviews** | Claude Code Review self-verified via `tsc --noEmit` (feature branch and post-merge) + `build:front` (feature branch and post-merge) + full frontend suite, iterated until clean → Product Owner manual visual review — **completed & approved**, release explicitly requested |
| **Validation** | Frontend `tsc --noEmit` ✅ · `build:front` ✅ (feature branch and post-merge) · full frontend suite 3552 tests: 3525 pass / 26 pre-existing baseline failures (count and identity unchanged, confirmed via `git stash` against clean HEAD) · 190 new/extended tests · no backend/electron files touched |

**What it is.** The Administrative Forms Barcode Designer request asked for a barcode
element on the Blank A4 free-print form, built entirely by reusing the existing
Multi-Signature & Stamp branding system rather than a parallel engine — the brief was
explicit that no `Barcode Engine`/`Service`/`Store`/`Manager`/`Designer`/`Context`/`Hook`
could be created. `useBrandingDesigner`'s `ElementType` union gained a third member,
`'barcode'`, and every function that already operated per-element (`patchDoc`, drag,
resize, rotate, align, reset, undo/redo, save) needed no branching to cover it — the
union member was the whole extension point. `DesignableBrandingImage` gained an optional
`children` prop so it can draw composed content (a QR code) instead of an `<img src>`,
while keeping the identical gesture handlers, outline, and `data-bd-type`/`data-designer-*`
hooks the print/PDF/preview export paths already select by. A host document declares
which elements it draws via an optional `elements` array on `useBrandingDesigner`'s
config; Blank A4 is the only caller that passes `['signature', 'stamp', 'barcode']` today,
so every other document's designer panel, reset buttons, and saved record shape are
byte-identical to before this release.

**Barcode Content Settings v1.** A follow-up request asked for the barcode to encode
operator-authored content instead of a system-generated number, reachable from a new
"⚙ إعدادات الباركود" button beside the existing branding picker. The dialog
(`BarcodeContentDialog.tsx`) is built from the same ExplorerKit `Dialog`/`DialogSection`/
`Button`/`xpl-field`/`xpl-input`/`xpl-textarea` primitives every other dialog in the
system uses — no new dialog chrome. Three fields — reference number, document subject,
free-text additional information — are appended to `FormQRCode.formatQrText`'s existing
line-building logic, each skipped when blank rather than printed as a dangling label; the
thirteen pre-existing `FormQRCode` call sites pass neither new field, so their encoded
text is verified byte-identical to before this release. The caption printed beneath the
QR code was previously a clock-derived `generateFormNumber()` value that resolved to no
real record — this release removes that generation entirely: the caption is now the
operator's reference verbatim, or no caption at all when the field is empty. Content
persists through three new plain-string `print.barcode.*` Settings rows, written via the
exact same `PUT /settings` call `useBrandingDesigner.save()` already makes — no new
endpoint, no new table.

**Reference memory + non-destructive Reset (a mid-conversation follow-up request).**
`nextReferenceNumber()` (`forms/shared/formNumber.ts`) is a pure function: it matches the
trailing digit run of a string, increments it, and pads back to the original width
(`MN-2026-00125` → `MN-2026-00126`; `REF0009` → `REF0010`), returning the input completely
unchanged when it has no trailing digit run (`قرار إداري` stays `قرار إداري`) rather than
guessing. `BigInt` arithmetic (not `Number`) keeps the increment exact past the 15-digit
safe-integer boundary. The dialog opens pre-seeded with this suggestion, while the subject
and details fields are recalled verbatim from their last saved value — nothing about them
is auto-generated or rewritten. A fourth settings key, `print.barcode.lastReference`,
holds the last NON-EMPTY reference independently of the currently-printed one: the
dialog's Reset button clears its own three fields (staged only — nothing is written until
Save) without touching this fourth value, so printing a sheet with no reference does not
reset the sequence the next suggestion counts from. A record saved before this key existed
(three keys, no fourth) is read correctly by falling back to the reference field itself.

**Professional Ink Set v1 (a further mid-conversation follow-up request).** Twenty
ballpoint-blue shades (`#0062D2` down to `#002650`, named `الحبر السماوي` through `الحبر
الأسود المزرق`) are appended to `NEW_INK_COLOR_IDS`/`INK_COLOR_HEX`/`INK_MODE_LABELS` in
`utils/inkFilter.ts` — appended after, never inserted before or interleaved with, the four
pre-existing shades, so a previously-saved `inkMode` value keeps resolving to the exact
same color and a returning operator's picker muscle-memory is undisturbed. No new
Color Picker component, no new color-application mechanism: every element that already
rendered `getInkFilterStyle`/`InkColorFilterDefs` (signature, stamp, and now the barcode)
gets all 24 shades automatically. A build-time test (`Set` cardinality over
`Object.values(INK_MODE_LABELS)`) enforces every label stays distinct, so a future
addition that repeats an existing name fails CI rather than silently producing two
indistinguishable swatches — the brief's explicit rule ("mismatch → append `(2)` to the
NEW name, never rename the old one") is a documented resolution path for a test failure,
not runtime logic, since no name collision exists in the shipped 24.

**Not changed.** Signature/stamp geometry, gestures, and saved layout shape for every
document besides Blank A4; the twelve other `FormQRCode` callers' printed/encoded output;
`generateFormNumber()` itself (still used by twelve other administrative forms —
Blank A4 alone stopped calling it); backend, Prisma, Electron, IPC, permission keys.

Scope note: the release staged exactly 21 files by explicit path. The one-time backend
probe scripts, the `.tmp-*.json` scratch files, the two `docs/*.xlsx` workbooks, the
unreferenced font files and a leftover measurement test were all deliberately left out of
the release and remain uncommitted in the working tree, unrelated to this package.

## Previous Release — Cloud Backup & Google Drive Sync v1

| Field | Value |
|-------|-------|
| **Package** | Cloud Backup & Google Drive Sync v1 — four packs merged as one feature (33 files: 18 new, 15 modified; Electron main process + backend + frontend) |
| **Release status** | RELEASED |
| **Release date** | 2026-08-05 |
| **Feature branch** | `feature/cloud-backup-google-drive-sync-v1` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `d6515f40` (previous release's final documentation commit) |
| **Checkpoint tag** | `checkpoint-cloud-backup-google-drive-sync-v1` → `d6515f40` |
| **Feature commit** | `52062358` |
| **Production merge commit** | `4941b2ca` |
| **Stable tag** | `stable-cloud-backup-google-drive-sync-v1` → merge `4941b2ca` (annotated) |
| **Reviews** | Deep architecture audit (pre-release, read-only) → Claude Code Review self-verified via `tsc --noEmit` × 3 targets + all three builds + all test suites, iterated until clean → Product Owner manual visual review — **completed & approved**, release explicitly requested |
| **Validation** | Backend/frontend/electron `tsc --noEmit` ✅ · `build:back` ✅ · `build:front` ✅ · `electron:build` ✅ (feature branch and post-merge) · electron 354 tests ✅ · backend 2697 tests ✅ · frontend 3484 pass / 26 pre-existing baseline failures (count and identity unchanged) |

**What it is.** The Google Drive sync engine existed before this release but was not
production-safe. The audit that opened this work found three blocking defects: a dead OAuth
grant was invisible and unrecoverable (`isAuthenticated()` answered "is there a string on
disk?", so the UI reported a healthy connection forever while every sync failed silently),
two devices could overwrite each other with no trace, and no Drive call had a timeout at all.
It also found that the decision engine — the ~40 lines that decide which copy of the database
lives — had zero test coverage. This release closes all of that and turns the backup page into
a diagnostics centre.

**Google Drive Deployment Pack v1.** The packaged app resolves its OAuth Desktop client from a
developer-provisioned `electron/resources/gdrive-oauth-client.json`, bundled by electron-builder
into `process.resourcesPath`. The end user never creates or copies a credentials file. The
resolution order (env → packaged → dev) lives in a pure, unit-tested policy module; the real
credentials file is git-ignored, and the `extraResources` entry is guarded by a test so a
drive-by edit cannot silently ship an installer that can never authorise.

**Cloud-Failure Local Backup Guarantee v1.** Any failed cloud operation now leaves a local
backup behind, unconditionally — including a network outage or an auth failure that never
reaches Drive. The preferred path is the backend's own backup service (recorded in the `Backup`
table under a new `RESCUE` type, so it appears in the backup centre); when the backend is
stopped — exactly the case during shutdown sync, the most common failure moment — a direct
`VACUUM INTO` snapshot writes to the same folder in the same `.db` format the restore screen
already understands. The two paths now use separate filename namespaces (`manar-rescue-` for
the recorded path, `manar-rescue-local-` for the direct one) so retention pruning can never
delete a backup that is restorable from inside the system.

**Production Hardening Pack v1 (P0).** Eleven items:
1. **Grant Recovery Engine** — `invalid_grant` / `unauthorized_client` / `access_denied` are
   classified as a distinct `GRANT_DEAD` state, not an error string. The dead token is deleted
   (so no further attempt can be built on it), the reason is persisted across restarts, and the
   UI shows a permanent banner with a reconnect button and an explicit statement that the local
   database is intact.
2. **OAuth client binding** — stored tokens record the client id that issued them and are
   rejected locally, before any network call, when it changes. Tokens saved by earlier builds
   carry no binding and are treated as "unknown", not "mismatched", so upgrading never
   disconnects a working account.
3. **Central Google error translation** — one pure module maps every OAuth and Drive failure to
   a professional Arabic message. No raw Google text can reach the screen.
4. **Cloud sync mutex** — one lock serialises sync-now / upload / download / conflict check /
   conflict resolution / startup / shutdown. Concurrent calls are rejected immediately with a
   clear message rather than queued behind decisions that may already be stale.
5. **Real network timeouts** — every Drive call runs under an `AbortController` (30s metadata,
   180s transfer) and aborts for real, freeing the socket.
6. **Atomic state writes** — `sync-metadata.json` and `gdrive-token.dat` are written
   temp → fsync → rename. A truncated metadata file used to read back as "no sync history",
   which produced a false conflict.
7. **Lost-update protection** — uploads compare the remote file against the snapshot the
   decision was built on (which may be minutes old while a conflict dialog is open) and again
   immediately before writing. Any change becomes a conflict for the user to resolve instead of
   a silent overwrite.
8. **Rescue backup protection** — the namespace separation described above.
9. **Rate-limit handling** — Drive returns rate limits as 403, which was classified as fatal;
   it is now retryable and honours `Retry-After`, while `storageQuotaExceeded` stays correctly
   non-retryable.
10. **Decision engine tests** — the rules moved to a pure module covered for local-newer,
    remote-newer, same-hash, conflict, missing remote, missing local, empty database, seed
    database, startup and shutdown.
11. **Production UX** — Arabic messages, retry action, reconnect action.

**Production UX & Diagnostics Pack v1 (P1).** A Cloud Diagnostics Centre at the top of the
backup page: sixteen status items (account, email, grant, refresh token, access token, internet,
Drive, storage, last sync/upload/download, local and cloud revisions, last conflict check,
mutex, system status), a 0-100 health score graded Excellent/Good/Warning/Critical, smart
actions, a copyable diagnostics report and a short support block. The passive read performs
**zero network calls** — every value comes from disk, local computation, or a probe cache filled
by operations that ran for another reason. Only the explicit "test connection" action touches
Google, and it walks the whole trust chain so a successful Drive query *proves* the grant is
alive rather than inferring it from a file on disk.

**Production Polish Pack v1.** Operation durations are measured and shown; each log row opens a
details drawer with start, end, duration, failure reason and a suggested action derived from the
entry itself (a dead grant suggests reconnecting, not retrying). A six-row diagnostics history
answers "when did each of these last happen". One-click self repair composes the existing
disconnect → relink → verify steps into a single button and only reports success after a real
Drive query succeeds. Health history records a point when the score *changes* — never on a timer
— so the card distinguishes a stable 70% from a 70% that dropped from 100% an hour ago. Engine
information, an official-template PDF report and a single-sheet Excel export complete the centre.

**Design language.** The entire diagnostics UI is composed from the existing ExplorerKit
primitives inside `.xpl-scope` — zero new CSS classes and zero colours outside the system tokens,
so RTL and dark mode work by inheritance rather than special-casing. The only exception is the
print root, which is never rendered on screen.

**Security.** The diagnostics snapshot type carries no field for any secret — no access token, no
refresh token, no client secret — so the report and the support block cannot leak what they
cannot see. Access-token validity is represented by an expiry timestamp only. Both properties are
covered by tests.

**Known operational prerequisite (not code).** The Google Cloud OAuth consent screen must be set
to **In production**. While it remains in *Testing*, Google expires refresh tokens after 7 days,
which is the most likely origin of the `invalid_grant` incident that opened this work. This
release makes that failure **visible and recoverable in one click**; it does not prevent it from
recurring.

---

## Previous Release — Financial Analysis Center v1

| Field | Value |
|-------|-------|
| **Package** | Financial Analysis Center v1 — three release packs merged as one feature (32 files: 20 new, 12 modified; backend + frontend, no Electron change) |
| **Release status** | RELEASED |
| **Release date** | 2026-08-04 |
| **Feature branch** | `feature/financial-analysis-center-v1` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `2fb01029` (previous release's final documentation commit) |
| **Checkpoint tag** | `checkpoint-financial-analysis-center-v1` → `2fb01029` |
| **Feature commit** | `9eb160d4` |
| **Production merge commit** | `4a672e70` |
| **Stable tag** | `stable-financial-analysis-center-v1` → merge `4a672e70` (annotated) |
| **Reviews** | Claude Code Review (self-verified via `tsc --noEmit` × 3 targets + all three builds + both test suites, iterated until clean) → Product Owner manual visual review — **completed & approved**, release explicitly requested |
| **Validation** | Backend/frontend/electron `tsc --noEmit` ✅ · `build:back` ✅ · `build:front` ✅ · `electron:build` ✅ (feature branch and post-merge) · backend 2697 tests ✅ · frontend 3484 pass / 26 pre-existing baseline failures (count and identity unchanged) |

**What it is.** A new read-only executive page at `#/financial-analysis` (sidebar: المالية → مركز التحليل المالي), guarded by `reports.read`. Eight numbered sections, one shared filter, one request per page load, **professional tables only — no charts**, per spec.

**Sections.** 1 الربحية · 2 الإيرادات · 3 المصروفات · 4 التحصيل · 5 الذمم المدينة · 6 الأداء الشهري · 7 أعلى القوائم · 8 المؤشرات المالية.

**Architecture — four layers, one data source.** New `backend/src/modules/financialAnalysis/` splits into `types` (the shared contract mirrored on the frontend), `dataset` (the only Prisma layer), `compute` (**pure** — no Prisma, no I/O, no `new Date()`, therefore unit-tested directly), and thin `service`/`controller`/`routes`. Business rules are **not redefined**: revenue, expenses, collections and P&L come from `shared/services/operational.reporting`, the project's single operational source, so every figure matches the dashboard, the P&L report and the Financial Centre by definition. One dataset load per request (3 row queries + 1 previous-period aggregate) feeds all eight sections; every section KPI is derived from its own table rows, so a card can never disagree with the column beneath it. No new permission key, no Prisma change, no migration.

**Tables UX, Alignment & Export Pack v1.** Header/body misalignment was fixed at its **root**, not cosmetically: the shared kit declares `.xpl-table th { text-align: start }` at specificity (0,1,1), which outranked the bare `.fac-al-*` class (0,1,0) on headers, while `.xpl-table td` declares no alignment at all — so headers sat start-aligned above end-aligned data in every column except the first, which matched the kit rule by coincidence. Alignment rules are now qualified with `th`/`td` together and header and cell share one rule. Horizontal scroll was removed by letting the single open-length text column absorb slack and ellipsise (`width:100% + max-width:0`) while numeric columns keep their full content width, with the full value exposed as a tooltip. The kit's per-table `max-height: 62vh` was dropped on this page — nested scrolling was also a clipping container that would have truncated PDF output. Excel and PDF export were added using the system's existing engines only.

**Export Enhancement Pack v1.** PDF is now **landscape**. Root cause: `theme.css` declares a document-wide `@page { margin: 1cm }`, which is always captured, making `composeStyledFromNode`'s `?? toPageCss(pageSpec)` fallback **unreachable in this app** — any requested page spec was silently ignored. An opt-in `forcePageSpec` flag now appends the spec's `@page` last so it wins the existing merge; default `false` keeps every current caller byte-identical (proven by test). A structural **print root** was introduced: report content lives in `.fac-report`, with the filter bar, export buttons and drill-down drawer outside it, so exclusion no longer depends on a `no-print` class alone. Declared print sections (`data-print-section`) drive page-break protection, table headers and totals repeat across pages, and truncation is lifted on paper. Excel gained a leading `الملخص` worksheet (period, generation time, exporting user, revenue, expenses, net profit, margin, table count) plus short house-standard sheet names.

**Receivables Analysis Table v1.** New section 5, placed directly after Collections because both sit on the customer axis and answer complementary questions (flow vs. outstanding balance and risk). Ageing is derived **purely from the already-loaded arrays** — no extra query, no new field: the oldest open invoice is found by applying a customer's payments to their invoices oldest-first (FIFO), the accounting convention for ageing. Six KPIs, five of which appear nowhere else; total receivables sums **positive balances only**, deliberately different from the net collections figure. Five-state risk badge, sortable and searchable table, row-level drill-down.

**Render-loop fix (folded in).** `useT()` returned a fresh object every render, making `t` an unstable dependency. With `t` in the load effect's dependency array this became an unbounded fetch loop — measured **119 commits / 79 requests and diverging** — and the filter bar visibly shook because the refresh button's busy indicator kept resizing the flex row. `useT()` is now memoised on `lang`, and the effects store an error *key* instead of a translated string so they no longer depend on `t` at all. Measured after: **4 commits, 1 request**. A permanent Profiler-based guard test locks this in.

**Exports.** Excel: 11 worksheets (`الملخص` + 9 data tables + indicators) via the shared `buildExcelWorkbook`, KWD `#,##0.000`, raw numbers, audited as `EXPORT`, guarded by `reports.export`. PDF: the page as the user sees it minus filters and buttons, landscape, multi-page, nothing clipped.

**Not changed:** `explorer-kit.css` / `ExplorerKit.tsx` (shared kit untouched), `excel.service.ts`, `pdf.ipc.ts`, `pageSpec.ts`, `styleCapture.ts`, `operational.reporting.ts`, `reports.service.ts`, `Invoices.tsx`, `Expenses.tsx`, `constants.ts`, `seed.ts`, `schema.prisma`, Electron.

**Known coupling, documented:** `lib/drilldownHandoff.ts` is the single, deliberate point that knows the Invoices/Expenses pages' persisted-filter storage keys — it exists so those pages needed **zero** modification, and it is covered by tests.

---

## Previous Release — Employee Table Column Optimization Pack v1

| Field | Value |
|-------|-------|
| **Package** | Employee Table Column Optimization Pack v1 (1 file modified, frontend-only) |
| **Release status** | RELEASED |
| **Release date** | 2026-08-04 |
| **Feature branch** | `feature/employee-table-column-optimization-pack-v1` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `15334e93` (previous release's final documentation commit) |
| **Checkpoint tag** | `checkpoint-employee-table-column-optimization-pack-v1` → `15334e93` |
| **Feature commit** | `ec357ed4` |
| **Production merge commit** | `7cb24752` |
| **Stable tag** | `stable-employee-table-column-optimization-pack-v1` → merge `7cb24752` (annotated) |
| **Reviews** | Claude Code Review (self-verified via `tsc --noEmit` + `build:front`, iterated until clean) → Product Owner manual visual review — **completed & approved**, confirmed the goal was achieved, release explicitly requested |
| **Validation** | Frontend `tsc --noEmit` ✅ · `build:front` ✅ (feature branch and post-merge) · backend `tsc --noEmit` ✅ (unaffected) |

**The goal.** The Employees table's "الجنسية" (nationality) column pushed "تاريخ انتهاء رخصة القيادة" (license expiry) — the 10th of 15 columns — far enough right that it required horizontal scroll to reach on the project's standard 1440×900 window.

**The arithmetic, disclosed before implementation.** At 1440px, the table's real available content width is ~1036–1070px after the 248px sidebar, page/card padding, and worst-case scrollbars. `licenseExpiry` started at x≈1259px — a ~320–355px shortfall. Narrowing `nationality` alone (104px, already one of the narrower columns) could free at most ~20–24px — nowhere near enough. This was computed and shown to the user before any code changed; they chose to widen scope to additional columns rather than accept a change that couldn't achieve the stated goal.

**What changed — 9 of 15 `employees.columns` entries in `modules.tsx`, width only:**
- `nationality`: 104px → 84px (the pack's named target).
- `fullName` (frozen), `fullNameEn`, `jobTitle`: trimmed more aggressively (230→180, 215→140, 132→100) — all three render through `NameCell`, which is ellipsis-protected (`employee-table.css`'s `.emp-name`), so long values truncate gracefully instead of breaking the row.
- `residencyExpiry`, `passportExpiry`, `licenseExpiry`: normalized 132px → 120px, matching the already-proven-safe `hireDate` column (identical `dd/mm/yyyy` format, no icon/badge chrome — `ToneCell` reuses the cell's own padding box, confirmed by reading the component).
- `civilId`, `passportNumber`: trimmed minimally (112px → 108px) — fixed-length numeric fields with no wrap/ellipsis protection, so left close to unchanged to avoid any risk of clipping.

**Mechanics confirmed safe.** Frozen-column sticky offsets are derived automatically from each frozen column's `width` (`ResourcePage.tsx`'s `frozenInsets` calc) — shrinking the frozen `fullName` column required no other code change. `employee-table.css`'s `.xpl-table--emp { min-width: 1420px }` floor did not need adjusting: the new total table width (~1806px) still exceeds it, same as before.

**Result.** Cumulative width through `licenseExpiry`'s right edge dropped from 1391px to ~1170px — a 209px reduction — bringing the column meaningfully closer to (and, per the user's own visual confirmation on their actual screen, within) the visible viewport at 1440×900.

**Not changed:** column order, keys, sortability, render functions, export values, data, sort/filter/search/selection logic, virtualization (none exists for this table), any other page's table (`DataTable.tsx` and its consumers untouched), backend, Prisma, Electron.

---

## Previous Release — Accounting Period Validation Pack v1

| Field | Value |
|-------|-------|
| **Package** | Accounting Period Validation Pack v1 (7 files — 4 modified, 3 added) |
| **Release status** | RELEASED |
| **Release date** | 2026-08-04 |
| **Feature branch** | `feature/accounting-period-validation-pack-v1` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `cba8f2e7` (previous release's final documentation commit) |
| **Checkpoint tag** | `checkpoint-accounting-period-validation-pack-v1` → `cba8f2e7` |
| **Feature commit** | `3d7a5788` |
| **Production merge commit** | `83ee6632` |
| **Stable tag** | `stable-accounting-period-validation-pack-v1` → merge `83ee6632` (annotated) |
| **Reviews** | Claude Code Review (self-verified via `tsc --noEmit` + full test suite, iterated until clean) → Product Owner manual visual review — **completed & approved**, release explicitly requested |
| **Validation** | Backend `tsc --noEmit` ✅ · frontend `tsc --noEmit` ✅ (unaffected) · backend `vitest run` **172/172 files, 2638/2638 passing** (feature branch and post-merge) · `build:back` ✅ |

**The gap.** Nothing enforced that an invoice's `issueDate` or an expense's `date` actually fell within the accounting period (`billingMonth`/`billingYear`) it was billed to. A document could be saved dated outside its own accounting period — on Create or Edit, via the UI or a direct API call — with no server-side check to catch it.

**One shared validator.** `backend/src/shared/validation/accountingPeriod.validation.ts` — `assertDateWithinBillingPeriod(date, billingMonth, billingYear)` throws `AppError.badRequest` (400) with the required user-facing message when the date falls outside the real calendar days of that month/year. Skips validation when `billingMonth`/`billingYear` are not both set (both are optional on `Invoice` and `Expense`) — no period to violate. Reuses `core/utils/dateOnly.ts`'s existing `daysInMonth()` (now exported) for real calendar-day math (28/29/30/31, leap years) — no hardcoded month lengths, no duplicated leap-year logic.

**Wired into both services, Create and Edit, before any database write.** `expenses.service.ts`'s `create()` validates the resolved date immediately; `update()` now computes `finalDate`/`finalBillingMonth`/`finalBillingYear` once (merging input with the current record) and both validates and persists from those same locals, replacing what had been a duplicated merge computation. `invoices.service.ts` follows the same pattern on `issueDate`, validated **before** `prisma.$transaction` is entered, so an invalid save never opens a transaction or touches the database. `Payment.date` (the collection date) is intentionally untouched — out of this pack's scope, and it already carries its own deliberate tolerance for preceding the invoice date.

**Enforcement is unconditional.** No Override, no Skip, no hidden flag, no admin-role bypass — enforced 100% at the service layer, so it holds even for a direct API call bypassing the UI entirely.

**Not changed:** journal entries, posting, balances, reports, Prisma schema/migrations, any other business logic.

**Tests.** New `accountingPeriod.validation.test.ts` (13 cases: first/last day of month, 28/30/31-day months, leap year 2028, non-leap Feb 29 rejected, before/after period, missing `billingMonth`/`billingYear` skips validation, 400 status code) plus 7 new integration cases across `expenses.service.test.ts` and the new `invoices.accountingPeriod.test.ts`, covering Create and Edit, blocked and allowed paths, for both modules.

**Scope discipline.** The working tree still contains the same unrelated, unfinished Google Drive / cloud-sync work carried at prior releases (`.gitignore`, `electron-builder.yml`, `electron/preload.ts`, `electron/services/googleDriveAuth.service.ts`, `electron/services/syncEngine.service.ts`, `backend/src/modules/backups/internal.routes.ts`, `backend/src/shared/services/backup.service.ts`, `frontend/src/api/client.ts`, `frontend/src/components/CloudSyncPanel.tsx`, `frontend/src/pages/Backup.tsx`, plus `electron/__tests__/`, `electron/resources/` and several Electron Drive service/test files), the AR-reconciliation scripts under `backend/scripts/one-time/`, two untracked `docs/*.xlsx` spreadsheets, the 2 duplicate font files, and five `.tmp-*.json` vitest report dumps. Also excluded: `backend/scripts/one-time/fix-expense-dates-2026-06-07.ts`, a separate one-time maintenance script (Expense Date Correction Tool v1) executed earlier in this session against dev data — not part of this pack's scope and never requested for release. All 7 pack files were staged explicitly by an exact path list; a `git diff --cached --name-only` scope check confirmed zero out-of-scope paths before commit.

---

## Previous Release — Bank Account Explorer Enterprise Audit, Filter Integrity & Export Pack v1

| Field | Value |
|-------|-------|
| **Package** | Bank Account Explorer — Enterprise Audit, Filter Integrity & Export Pack v1 (27 files — 14 modified, 13 added). Carries three earlier same-file packs validated in-session but never separately committed: Transaction Direction Logic Fix v1, Transaction Classification Enhancement v1, Transaction Classification Hardening Pack v1 |
| **Release status** | RELEASED |
| **Release date** | 2026-08-04 |
| **Feature branch** | `feature/bank-explorer-audit-filter-export-v1` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `0526abb6` (previous release's final documentation commit) |
| **Checkpoint tag** | `checkpoint-bank-explorer-audit-filter-export-v1` → `0526abb6` |
| **Feature commit** | `7fc821a3` |
| **Production merge commit** | `34e3b6a7` |
| **Stable tag** | `stable-bank-explorer-audit-filter-export-v1` → merge `34e3b6a7` (annotated) |
| **Reviews** | Four sequential in-session packs, each reported and approved before the next: Direction Logic Fix v1 → Classification Enhancement v1 → Classification Hardening Pack v1 → this forensic audit + filter integrity + export pack → Product Owner manual visual review — **completed & approved**, release explicitly requested |
| **Validation** | Frontend + backend + Electron `tsc --noEmit` ✅ · backend `vitest run` **170/170 files, 2612/2612 passing** · frontend 3438/3464 passing (26 pre-existing failures, unchanged signature) · `build:back` ✅ · `build:front` ✅ |

**The audit.** Every filter, search option, KPI and export path in the Bank Account Explorer was traced from the input control to the Prisma query and back. Seven surfaces were proven correct (date range, quick ranges, pagination, fixed ordering, pure-AND filter composition, the shared `where` object, filter clearing). Fourteen defects were proven from the code, five of them critical.

**Direction and Category are now two independent dimensions.** `bankTransactionDirection.ts` derives direction from the real financial impact only (`credit − debit`), and its input interface carries no document fields. `bankTransactionCategory.ts` derives the document category through a six-tier chain — matched entity type → reference prefix (`MN-INV-`/`INV-`/`PINV-`, `EXP-`, `JE-`, taken from the server's actual number generators) → `bankFeeType` → `chequeNumber` → system flag → anchored text as the last resort → `unclassified` — and its input interface carries no amount fields. Text rules can no longer run on a row that has any structural signal. `bankTransactionSeparation.test.ts` scans both module sources and fails the build on any cross-import or concept leak, so the separation is enforced by the build rather than by convention.

**The server no longer disagrees with the screen.** The direction filters used `credit > 0` / `debit > 0` while the UI used `credit − debit`, so a two-sided row appeared under both «إيداعات» and «سحوبات»; the filter is now an exact column-to-column comparison via Prisma field references (verified against SQLite before adoption). The `cheques`/`transfers`/`fees` filters matched two structural columns while the displayed category had grown to six tiers — hiding valid rows and returning false positives. Category filtering now runs through a 1:1 server port of the display rule, with count, pagination, totals and export all derived from the same set, and `classificationGolden.json` is a single 36-case fixture read by **both** test suites so the two implementations cannot drift apart silently.

**Search, amounts, validation.** Search covered description + reference only; it now also covers `chequeNumber`, `matchedRef` and `transactionId`, is neutral to Arabic letter forms (the alef/heh/yeh families map to a single-character LIKE wildcard — no storage, schema or index change), and strips user-typed `%`/`_` that were acting as unescaped wildcards. The amount range was asymmetric around zero (the upper bound required `gt: 0`, so widening it could shrink the result set); both bounds now treat zero alike. Inverted ranges (`from > to`, `min > max`) returned an empty list with no explanation — they are now rejected in Zod and surfaced inline under the offending field, and a negative amount is announced instead of being dropped silently.

**Honest numbers.** `filteredTotal` (debits + credits, displayed as «الإجمالي») is replaced by four explicit values — `totalDebits`, `totalCredits`, `netMovement` (credits − debits) and `turnover` — so no KPI label contradicts its own maths. Mixed-currency result sets are detected and warned about instead of being summed silently. Potential-duplicate rows are counted, disclosed and excludable with one click. The date range beside the result count is now the filtered set's own range, not the account-wide coverage.

**Export.** The button exported the current page (≤50 rows) while reading «تصدير CSV». A new server endpoint (`GET /timeline/:accountKey/export?format=xlsx|csv`) builds both formats from the same filter options, the same `TIMELINE_ORDER_BY` and the same classification, so the file equals the filtered set by construction; one column contract feeds Excel and CSV. Excel goes through the in-house report engine and therefore carries RTL, a frozen header, auto filter, column widths, KWD `#,##0.000` raw numeric cells, title, account, period, export timestamp, an applied-filter summary, a totals row and an audit footer.

**UX and performance.** The mixed single-select «النوع» control became a two-dimension bar (one direction × multi-select category, 15 categories), which makes queries like «شيكات صادرة» possible for the first time; plus an active-filter counter, a diagnostic empty state, a unified export menu that states its scope and row count before download, and duplicate/currency banners. Row view models are memoised once per result set instead of being re-derived for every row on every keystroke (previously ~900 regex executions per typed character at 50 rows), and the drawer's three models are memoised too.

**Not changed:** database, Prisma schema, migrations, balances, transactions, posting logic, accounting rules, the import pipeline, and every other module. Backend changes were confined to proven defects plus the new export endpoint, as the release scope required.

**Scope discipline.** The working tree still contains the same unrelated, unfinished Google Drive / cloud-sync work carried at the previous three releases (`.gitignore`, `electron-builder.yml`, `electron/preload.ts`, `electron/services/googleDriveAuth.service.ts`, `electron/services/syncEngine.service.ts`, `backend/src/modules/backups/internal.routes.ts`, `backend/src/shared/services/backup.service.ts`, `frontend/src/api/client.ts`, `frontend/src/components/CloudSyncPanel.tsx`, `frontend/src/pages/Backup.tsx`, plus `electron/__tests__/`, `electron/resources/` and several Electron Drive service/test files), the five unrelated AR-reconciliation scripts under `backend/scripts/one-time/`, two untracked `docs/*.xlsx` spreadsheets, and the 2 intentionally-unreferenced duplicate font files. Also excluded: five `.tmp-*.json` vitest report dumps and `backend/scripts/one-time/_fieldref_probe.ts` (the throwaway script used to verify Prisma field-reference support against SQLite before adopting it) — all created during this pack's work, none of them release content; deletion was attempted and denied by the environment, so they were left untracked and simply never staged. All 27 pack files were staged explicitly by an exact path list; a `git diff --cached --name-only` scope check confirmed zero out-of-scope paths before commit.

---

## Previous Release — Letter Engine Font Picker Dynamic Registry v1

| Field | Value |
|-------|-------|
| **Package** | Letter Engine Font Picker Dynamic Registry v1 — the Official Letter font picker's font pool made fully dynamic, plus the previously-validated Post-Release Hotfix v1 (9 files — 8 modified, 1 added) |
| **Release status** | RELEASED |
| **Release date** | 2026-08-04 |
| **Feature branch** | `feature/letter-engine-font-picker-dynamic-registry-v1` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `7b644ed8` (previous release's final documentation commit) |
| **Checkpoint tag** | `checkpoint-letter-engine-font-picker-dynamic-registry-v1` → `7b644ed8` |
| **Feature commit** | `baf74c23` |
| **Production merge commit** | `c45622b5` |
| **Stable tag** | `stable-letter-engine-font-picker-dynamic-registry-v1` → merge `c45622b5` (annotated) |
| **Reviews** | Implemented across a sequence of same-session hotfixes on top of Letter Engine v1 (Post-Release Hotfix v1; a font-pool investigation; three intermediate, unreleased font-pool policies — `category === 'Official'`, `recommendedFor` including `'letters'`, a named ten-family allow-list — each explicitly superseded before release; this final dynamic-registry policy) → Product Owner manual visual review — **completed & approved**, release explicitly requested |
| **Validation** | Frontend + backend + Electron `tsc --noEmit` ✅ (feature branch and post-merge) · backend `vitest run` **168/168 files, 2545/2545 tests passing** · frontend `vitest run` — Letter Engine suite 22/22 files, 520/520 tests passing; full suite 8/26 failures confirmed pre-existing, identical file/test signature to the prior release's documented baseline, re-verified post-merge with zero new failures · `build:back` ✅ · frontend production build (`vite build`) ✅ |

**What changed.** `letters/fonts/fontIntegration.ts`'s `getLetterFontPool()` is now exactly `getEnabledFonts()` from the shared Font Registry — no allow-list, no `category` filter, no `recommendedFor` filter, and no font-name literal anywhere in the selection path (still guarded by `fontRegistryEnforcement.test.ts`'s source scan). A font added to `FontRegistry` in the future and marked `enabled` appears in the letter composer's font picker automatically, with zero code changes to this file or any other; a font marked `enabled: false` disappears the same way. This is the fourth and final policy this function carried in-session — `category === 'Official'` (3 fonts) → `recommendedFor` including `'letters'` (5 fonts) → a named ten-family allow-list (10 fonts) → this dynamic no-filter policy (12 fonts, all currently-enabled registry fonts) — the first three were explored and validated but never released; only this one shipped. `components/common/FontPicker/FontPicker.css` keeps the dropdown-width and no-ellipsis improvements from the intermediate work: the popup grows to fit its widest entry (`width: max-content`, floored at the trigger's own width via `min-width: 100%`) instead of being pinned exactly to the trigger's width, and `.fpk-opt-name` no longer clips (`flex-shrink: 0`, no `text-overflow`) — full font names always render. Scoped to the popup/list only; `FontPicker`'s closed-trigger label (`.fpk-trigger-name`) is unchanged, and `FontPicker` has exactly one production consumer (`ComposerToolbar.tsx`), so no other dropdown in the system is affected.

**Also carries Post-Release Hotfix v1**, validated in the same working tree before this release and never separately shipped: a permanently-disabled "Export" placeholder button removed from `LetterWorkspace.tsx`'s toolbar; a print race fixed in `useLetterPrint.ts` where the barcode's asynchronously-generated `<img src>` (built via `QRCode.toDataURL()` in a `useEffect`) could still be loading when print fired — now waits on `document.fonts.ready` plus every `<img>.complete`, bounded by timeout, mirroring the existing pattern in `electron/services/renderReadiness.ts`; and the safe-writing-zone boundary outline in `letter-paper.css`, which faded to `opacity: 0` on `:focus-within`, is now an always-visible solid line (`--lt-band-boundary` token added to `letter-tokens.css`).

**Not changed:** the Font Registry itself (still 12 entries, still the sole record of what exists and what the browser can render), font files, `@font-face` declarations, Packaging, Electron, Vite, Geometry Registry values, pagination algorithm, validation rule logic, print pipeline stage order, reference-allocation transaction semantics, and every other pre-existing engine, form, report, or print surface — confirmed by full-suite re-run showing the exact pre-existing 8-file/26-test frontier and zero new failures. No Prisma schema or migration change.

**Scope discipline.** The working tree at release time still contained the same unrelated, unfinished Google Drive / cloud-sync work flagged at the previous two releases (`.gitignore`, `electron-builder.yml`, `electron/preload.ts`, `electron/services/googleDriveAuth.service.ts`, `electron/services/syncEngine.service.ts`, `backend/src/modules/backups/internal.routes.ts`, `backend/src/shared/services/backup.service.ts`, `frontend/src/api/client.ts`, `frontend/src/components/CloudSyncPanel.tsx`, `frontend/src/pages/Backup.tsx`, plus `electron/__tests__/`, `electron/resources/`, and several Electron Google-Drive service/test files), the five unrelated AR-reconciliation investigation scripts under `backend/scripts/one-time/`, two untracked `docs/*.xlsx` spreadsheets, and the 2 intentionally-unreferenced duplicate font files under `assets/fonts/نموذج كتاب رسمي خطوط/` (excluded at both prior releases for the same reason: `fonts.css` never references them). None of it belongs to this release. All 9 pack files were staged explicitly by an exact path list (never `git add -A`/`git add .`/`git commit -a`); a `git diff --cached --name-only` scope check confirmed zero out-of-scope paths before commit, and every WIP file was confirmed still present, unstaged/untracked, and unmodified after the merge.

---

## Previous Release — Letter Engine v1

| Field | Value |
|-------|-------|
| **Package** | Letter Engine v1 — Official Letter module (P0 Foundation → P7.5 UX polish, plus this final UI Reconstruction v2 production-polish pass; 110 files — 11 modified, 99 added, including full backend + frontend engine test suites) |
| **Release status** | RELEASED |
| **Release date** | 2026-08-03 |
| **Feature branch** | `feature/letter-engine-v1` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `5f19edea` (previous release's final documentation commit) |
| **Checkpoint tag** | `checkpoint-letter-engine-v1` → `5f19edea` |
| **Feature commit** | `19736afa` |
| **Production merge commit** | `765d2129` |
| **Stable tag** | `stable-letter-engine-v1` → merge `765d2129` (annotated) |
| **Reviews** | Implementation across ten packs in a single continuous session (P0 Foundation, P1 Identity & Lifecycle, P2 Workspace, P3 Composer, P4 Geometry & Pagination, P5 Validation Engine, P6 Printing Engine, a mid-stream production bug-fix pack, P7 Reference/Barcode/Signature, P7.5 UX polish, this final production-polish pack) → Product Owner manual visual review — **completed & approved**, release explicitly requested |
| **Validation** | Frontend + backend + Electron `tsc --noEmit` ✅ (feature branch and post-merge) · backend `vitest run` **168/168 files, 2545/2545 tests passing** · frontend `vitest run` — Letter Engine suite 21/21 files, 499/499 tests passing; full suite 8/26 failures confirmed pre-existing, identical file/test signature to the prior release's documented baseline, re-verified post-merge with zero new failures · `build:back` ✅ · frontend production build (`vite build`) ✅ |

**What changed.** A complete Official Letter module. **Reference registration** (`modules/letters/reference.service.ts`): a permanent sequential number is allocated only inside the registration transaction — never on draft creation, never editable, never reused or recycled — guarded by two database UNIQUE constraints (`reference`, and `(templateKey, year, sequence)`) rather than an application-level check, so a failed registration cannot consume a number. The rendered format (`OL-2026-000001`) sits behind a swappable formatter registry (`referenceFormat.ts`) so a future numbering scheme needs no change to the allocator. **The composer** (`pages/LetterComposer.tsx` + `letters/` engine): a Block Model (paragraph-level spans only — partial-word/mixed-font formatting is structurally unrepresentable), a Geometry Registry that is the sole holder of every millimetre, a pure paginator with DOM measurement kept outside the zoom transform, and a live local validation engine (16 rules — reference/reserved-zone/safe-margin/barcode-capacity/signature-placement checks) that blocks `readyForPrinting` while any selected rule is unimplemented, never merely "found nothing." **Printing** (`letters/printing/`) reuses the composer's own render path in a read-only view mode — no second renderer, no duplicated pagination — through a 4-stage pipeline (Prepare → Validate → Compose → Print) with structured, never-silent failures. **Barcode/signature/stamp**: the barcode payload carries exactly three fields (date, subject, reference — no recipient, body, or metadata) through the ERP's existing `qrcode` package (P0's approved spec, not a second symbol library); signature and stamp are asset-id references into the existing company branding registry (`print-templates/branding`), with the *image* frozen into the registration snapshot at registration time so a later re-upload cannot rewrite an already-issued letter. **Timeline**: 12 event types (added `REFERENCE_ASSIGNED`, `SIGNATURE_ADDED/REMOVED`, `STAMP_ADDED/REMOVED` to P1's original 7) recorded inside the same transactions that cause them.

**A mid-stream production bug found and fixed.** After P1, the module returned HTTP 400 on every request. Root-caused (not guessed): P1's migration had never been applied to the live database, producing a Prisma P2021 ("table does not exist") that the existing global error handler classified as a generic 400 — indistinguishable from a validation rejection, which sent the first diagnosis pass toward the Zod schemas (the one place the fault was not). Fixed in two parts, both carried into this release: the migration was applied via `prisma migrate deploy` (backed up first; confirmed purely additive, nothing dropped), and `errorHandler.ts` now classifies P2021/P2022 as 500 rather than 400 so a missing-schema fault can never again present as a rejected request.

**Not changed:** Geometry Registry values, pagination algorithm, validation rule *logic*, print pipeline stage order, reference-allocation transaction semantics, and every other pre-existing engine, form, report, or print surface in the ERP — confirmed by full-suite re-run showing the exact pre-existing 8-file/26-test frontier and zero new failures. The UI-reconstruction pass (canvas/paper/toolbar/validation-center visual treatment, default zoom-to-fit-width) touched CSS and one persisted view-state default only.

**Scope discipline.** The working tree at release time contained unrelated, unfinished Google Drive / cloud-sync work (10 tracked files + several untracked paths — `.gitignore`, `electron-builder.yml`, `electron/preload.ts`, `electron/services/googleDriveAuth.service.ts`, `electron/services/syncEngine.service.ts`, `backend/src/modules/backups/internal.routes.ts`, `backend/src/shared/services/backup.service.ts`, `frontend/src/api/client.ts`, `frontend/src/components/CloudSyncPanel.tsx`, `frontend/src/pages/Backup.tsx`, plus `electron/__tests__/`, `electron/resources/`, and several Electron Google-Drive service/test files) and five unrelated one-off AR-reconciliation investigation scripts under `backend/scripts/one-time/` (`_ar_trace.ts`, `_ar_trace2.ts`, `_audit_224520*.ts` — only that folder's `create-letters-permissions.ts` belongs to this release) and the 2 intentionally-unreferenced duplicate font files under `assets/fonts/نموذج كتاب رسمي خطوط/` first flagged in the previous release. None of it belongs to this release. All 110 pack files were staged explicitly by an exact path list (never `git add -A`/`git add .`/`git commit -a`); a `git diff --cached --name-only` scope check confirmed zero out-of-scope paths before commit, and every WIP file was confirmed still present, unstaged/untracked, and unmodified after the merge.

---

## Previous Release — Font Registry Enhancement Pack v2

| Field | Value |
|-------|-------|
| **Package** | Font Registry Enhancement Pack v2 (Font Registry metadata + `FontPicker` component + Arabic search helper; 32 files — 2 modified, 30 added, including 2 test files and 22 font/license assets) |
| **Release status** | RELEASED |
| **Release date** | 2026-08-03 |
| **Feature branch** | `feature/font-registry-enhancement-pack-v2` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `052ec70e` (previous release's final documentation commit) |
| **Checkpoint tag** | `checkpoint-font-registry-enhancement-pack-v2` → `052ec70e` |
| **Feature commit** | `886012fe` |
| **Production merge commit** | `fafd11ff` |
| **Stable tag** | `stable-font-registry-enhancement-pack-v2` → merge `fafd11ff` (annotated) |
| **Reviews** | Implementation (this session followed on from the earlier Foundation Pack v1 session) → Product Owner manual visual review — **completed & approved**, release explicitly requested |
| **Validation** | Frontend `tsc --noEmit` ✅ (feature branch and post-merge) · frontend `vitest run` — 51/51 new tests passing (`fontRegistryMetadata.test.ts` 26, `FontPicker.test.tsx` 25) · full suite 8/26 failures confirmed pre-existing, identical file/test signature to the prior release's documented baseline, re-verified post-merge with zero new failures · frontend production build (`build:front`) ✅ · no backend/Prisma/Electron change, so no backend `tsc`/`vitest`/`build:back` run |

**What changed.** `styles/fontRegistry.ts` grows from bare `family: string` entries into a full `FontMeta` record per font — `id`, `family`, `displayName`, `category` (`UI` | `Official` | `Modern` | `Classic` | `Decorative`), `aliases` (Arabic search synonyms), `recommendedFor`, `defaultSize`/`defaultLineHeight`, `supportsBold`/`supportsItalic`/`supportsUnderline`, `weights`, `direction`, `previewText`, `enabled` — covering all 12 registered fonts (`ibmPlexArabic`, `cairo`, `tajawal`, `tahoma`, `traditionalArabic`, `simplifiedArabic`, `amiri`, `scheherazade`, `droidNaskh`, `pdfDinArabic`, `sultan`, `ptBoldHeading`). `weights`/`supportsBold`/`supportsItalic` are **measured** from the actual `@font-face` rules in `assets/fonts/fonts.css` + `styles/fonts.css` (guarded by `fontRegistryMetadata.test.ts`, which parses both stylesheets and asserts the registry matches); `category`/`recommendedFor`/`defaultSize`/`defaultLineHeight` are editorial starting points that affect nothing today. New query API: `getFont`, `findFont` (tolerates unknown/removed ids without throwing — also closes a prototype-pollution gap where `findFont('constructor')` previously returned a function), `isFontId`, `getAllFonts`, `getEnabledFonts`, `getFontsByCategory`, `getOfficialFonts`, `getUIFonts`, `getFontsFor`, `getDefaultFontFor` (usage → font, explicit map not derived), `fontFamilyValue`, `fontStackFor`, `fontStackOf`, `searchFonts`/`fontMatchesQuery`. New `components/common/FontPicker` — a from-scratch searchable dropdown (not a `SearchableSelect` extension) where every row renders the font's own name plus a live preview in that font's real family/size/line-height, so a search for `"trad"` or `"اميري"` visually compares candidates rather than just naming them. The Arabic-normalization helper (diacritics/tatweel/hamza-forms) that both `FontPicker` and the pre-existing `SearchableSelect` need was extracted to `lib/arabicSearch.ts`; `SearchableSelect` now imports and re-exports it, so every existing caller of `normalizeSearch` from `SearchableSelect` is unaffected.

**Fonts shipped, not just declared.** `assets/fonts/fonts.css` declares `@font-face` for the 8 document font families that had files on disk but no CSS rule (`Amiri`, `Scheherazade New`, `PFDinTextArabic`, `Traditional Arabic`, `Simplified Arabic Fixed`, `Droid Arabic Naskh`, `Sultan`, `PT Bold Heading`) and is imported once from `main.tsx`. 21 font files + the Amiri/Scheherazade SIL OFL license text, all under `assets/fonts/نموذج كتاب رسمي خطوط/`, are now tracked in Git for the first time — closing a gap where a clean clone's build would have failed to resolve these `url()` references. Two files in that folder are deliberately excluded because `fonts.css` never references them: `103-Tahoma.ttf` (Tahoma stays the OS system font, not a bundled face) and a duplicate, truncated `Cairo-Regular.ttf` (Cairo is served by the existing `@fontsource/cairo` package).

**Not wired to anything.** `FontPicker` is imported by no screen; `getFont`/`searchFonts`/etc. are called by no screen. `grep`-confirmed before commit. No existing `font-family` value, form, report, print surface, or ExplorerKit component changed — `UI_FONT_STACK`, `DOC_FONT_STACK`, `CHART_FONT_STACK`, `MONO_FONT_STACK` and every page importing them are byte-identical to before this pack.

**Not changed:** every screen, form, report, print/PDF pipeline, and existing `font-family` usage; backend, Prisma schema, Electron/IPC.

**Scope discipline.** The working tree at release time contained unrelated, unfinished Google Drive / cloud-sync work (10 tracked files + several untracked paths — `.gitignore`, `electron-builder.yml`, `electron/preload.ts`, `electron/services/googleDriveAuth.service.ts`, `electron/services/syncEngine.service.ts`, `backend/src/modules/backups/internal.routes.ts`, `backend/src/shared/services/backup.service.ts`, `frontend/src/api/client.ts`, `frontend/src/components/CloudSyncPanel.tsx`, `frontend/src/pages/Backup.tsx`, plus `backend/scripts/one-time/`, `electron/__tests__/`, `electron/resources/`, and several Electron Google-Drive service/test files). None of it belongs to this release. All 32 pack files were staged explicitly by path (never `git add -A`/`git add .`/`git commit -a`); a `git diff --cached --name-only` scope check confirmed zero out-of-scope paths before commit, and every WIP file plus the 2 intentionally-excluded font files were confirmed still present, unstaged/untracked, and unmodified after the merge.

---

## Previous Release — Equipment Owner Default Price v1

| Field | Value |
|-------|-------|
| **Package** | Equipment Owner Default Price v1 (Price Agreements + Job & Commission Analysis; 34 files — 11 modified, 23 added, including 2 test files) |
| **Release status** | RELEASED |
| **Release date** | 2026-08-02 |
| **Feature branch** | `feature/equipment-owner-default-price-v1` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `f96d759d` (previous release's final documentation commit) |
| **Checkpoint tag** | none created — proceeded directly per this pass's implementation → Product-Owner-approved-release flow |
| **Feature commit** | `f298dffb` |
| **Production merge commit** | `96a970a8` |
| **Stable tag** | `stable-equipment-owner-default-price-v1` → merge `96a970a8` (annotated) |
| **Reviews** | Implementation → Product Owner manual visual review — **completed & approved**, release explicitly requested |
| **Validation** | Backend + frontend `tsc --noEmit` ✅ (feature branch and post-merge) · backend `vitest run` 158/158 files, 2291/2291 tests · frontend 8/26 failures confirmed pre-existing (identical signature to the prior release's documented baseline) · production build (`build:back` + `build:front`) ✅ · both migrations applied via `prisma migrate deploy` against the real dev database, verified read-only before and after: `migrate status` → "Database schema is up to date!", all 21 pre-existing `project_prices` rows intact, new tables present with the Product Owner's own review-session data (9 agreements given an owner price, 1 Work Analysis created) |

**What changed.** `ProjectPrice` gains one new field, `equipmentOwnerPrice` (`Float @default(0)`), stored beside the existing customer `unitPrice`. The Prices page gains a matching column, drawer field, and form input — an unset value renders "—", not "0.000", so an unrecorded default never reads as free work. `GET /prices/for-invoice` now returns the field; `POST`/`PATCH /prices` accept it as optional. This is also the **first release of the Job & Commission Analysis module** (`work_analyses` / `work_analysis_lines`, backend `workAnalysis` module, frontend `WorkAnalysis` page) — built earlier in the same development effort but never previously merged, and a hard prerequisite for this pack since the auto-fill behavior targets that module's line editor. Selecting a price agreement line there now fills both Customer Price and Equipment Owner Price and immediately recomputes commission per unit, customer/owner totals, commission total, and margin % via a pure calc library mirrored (byte-identical test fixtures) between frontend and backend to prevent the two copies drifting apart.

**Isolation, by construction not convention.** `work_analyses`/`work_analysis_lines` carry no foreign key to `Customer`, `ProjectPrice`, `Contract`, `Invoice`, or any other existing model — the only relation is the new tables' own internal `WorkAnalysisLine → WorkAnalysis` link — so archiving or editing a price agreement can never be blocked or altered by an analysis that referenced it. The Work Analysis page issues **no write call to `/prices` at all**, so a manual owner-price override inside one analysis cannot propagate back to the agreement. Saved/reopened analyses rehydrate from their own stored snapshot columns and never re-query `/prices`, so editing an agreement afterward cannot change a historical analysis. `equipmentOwnerPrice` was grepped across the whole codebase: zero references in `modules/invoices`, `modules/accounting`, `modules/reports`, `modules/transactions`, or `modules/expenses`.

**Database.** Two additive migrations, both hand-verified against Prisma's own generated diff before being written: `20260802120000_add_work_analysis` (2 `CREATE TABLE` + 5 `CREATE INDEX`, zero `ALTER`) and `20260802140000_add_equipment_owner_price` (one `ALTER TABLE ADD COLUMN ... NOT NULL DEFAULT 0`, which SQLite back-fills in place without a table rewrite). Applied via `prisma migrate deploy` — no reset, no `migrate dev`. A pre-existing, unrelated migration-history divergence (three migrations recorded as applied in the database but present only on an unmerged WIP branch, plus one historical migration file with a stale checksum) was investigated read-only in a prior pass and confirmed **not** to block `deploy`, which — unlike `dev` — applies only pending migrations without drift/checksum detection.

**API.** No new endpoints. `for-invoice`'s existing invoice-side consumers (`InvoiceFastEntryDialog`, `useInvoicePartyPricing`) narrow the response to a fixed `PriceOption` shape and never see the added field, so invoice pricing behavior is unchanged.

**Not changed:** invoices, accounting, journals, reports, permissions, existing pricing logic/validation, Electron/IPC.

**Scope discipline.** The working tree at release time contained unrelated, unfinished Google Drive / cloud-sync work across 10 tracked files plus 14 untracked paths (including this session's own leftover investigation artifacts — two debug scripts, a probe test/payload pair, a one-time scripts folder, two imported spreadsheets, and a scratch markdown file). None of it belongs to this release. All 34 pack files were staged explicitly by path (never `git add -A`); every WIP and debug file was confirmed still present, unstaged, and unmodified after the merge.

---

## Previous Release — Collections Analysis Report Enhancement Pack v1

| Field | Value |
|-------|-------|
| **Package** | Collections Analysis Report Enhancement Pack v1 (Comprehensive Reports module, Collections Summary Report; 6 files — 4 modified, 2 added, including 2 new/updated regression-test files) |
| **Release status** | RELEASED |
| **Release date** | 2026-08-02 |
| **Feature branch** | `feature/collections-analysis-report-enhancement-pack-v1` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `cf753cbc` (previous release's final documentation commit) |
| **Checkpoint tag** | none created — proceeded directly per this pass's implementation → Product-Owner-approved-release flow |
| **Feature commit** | `9450504` |
| **Production merge commit** | `9a4ae9b1` |
| **Stable tag** | `stable-collections-analysis-report-enhancement-pack-v1` → merge `9a4ae9b1` (annotated) |
| **Reviews** | Implementation → Product Owner manual visual review — **completed & approved**, release explicitly requested |
| **Validation** | Backend + frontend `tsc --noEmit` ✅ (feature branch and post-merge) · backend `vitest run` 157/157 files, 2281/2281 tests · frontend 8/26 failures confirmed pre-existing (identical signature to the prior release's documented baseline; this pack touches zero frontend files) · production build (`build:back` + `build:front`) ✅ · Excel export (13 worksheets) and HTML/PDF export generated from a 240-row synthetic payload and inspected directly — every section's totals-row reconciles exactly to the report grand total |

**What changed.** The Collections Summary Report gains, above and after its existing table: eight executive KPI cards (total collections, transaction count, average collection, largest collection, customer count, fully-collected invoices, partially-collected invoices, collection rate against the invoice base); a Customer × Month Pivot Matrix that adapts to the selected period; a Monthly Analysis table; a ranked Collections-by-Payment-Method table with percentage of total and a matching Payment Method Distribution table; a ranked Collections-by-Customer table; a Top 20 Collections table; a Month Comparison summary (highest vs. lowest month, difference, %); a Historical Analysis table classifying collected cash by the **invoice's issue year** (not the payment date), so management can see how much of the period's cash belongs to prior fiscal years; a Collection Delay table bucketing every payment by days-since-issue (0-30 through 365+); a Collection Efficiency summary (average/fastest/slowest/median days to collect); and a Percentage Analysis table whose percentages sum to exactly 100.0%. All of it reaches preview, print, Excel export, and HTML/PDF export — the same three surfaces the base report always had.

**Why no second query, no duplicated aggregation.** `collectionsAnalysis.ts` is a pure function (no Prisma, no I/O) that derives every KPI and section from the **same** `payments` array `reports.service.ts`'s `collectionsSummary()` already fetches after every existing filter (date range on payment date, customer, non-cancelled sales invoices) is applied. The only backend change to the query itself is four additional scalar columns (`id`, `issueDate`, `total`, `paidAmount`) selected on the invoice relation that was already being joined — no new query, no N+1. The report's own `total` is passed in, not recomputed, so every section's grand total is the report total by construction. Percentages use largest-remainder (Hamilton) apportionment so they sum to exactly 100.0%, never 99.9%/100.1%.

**Shared analytical framework.** The month-axis / month-label / percentage-apportionment helpers the Expense Analysis pack introduced were extracted into a new `analysisKit.ts`, and both the expense and collections analytics modules now consume the same implementation — one analytical framework, not two that could quietly drift apart. `expenseAnalysis.ts` was refactored to use the shared kit with **zero behavioral change** (its existing 16-test suite passes unmodified, byte-identical output).

**Engine contract, reused unchanged.** No changes to `ReportInput`, the report engine, or any frontend file — the `kpis`/`sections` fields the Expense Analysis pack added are generic, and `Reports.tsx`/`ReportPrint.tsx` already render whatever any report sends. This pack is a pure backend analytics addition on an existing, already-generic contract.

**Not changed:** invoice/payroll/attendance/customer/expense/every other report type, invoice/payment creation, approval logic, accounting/posting rules, permissions, Electron/IPC, Prisma schema/migrations, any frontend file.

**Scope discipline.** The working tree at release time contained unrelated, unfinished Google Drive / cloud-sync work across 13 tracked files plus 8 untracked paths, plus this pass's own investigation-only debug artifact (`backend/__verify_collections.ts`, an ad-hoc Excel/HTML export verification script). None of it belongs to this release. All 6 pack files were staged explicitly by path (never `git add -A`); every WIP and debug file was confirmed still present, unstaged, and unmodified after the merge.

---

## Previous Release — Expense Analysis Report Enhancement Pack v1

| Field | Value |
|-------|-------|
| **Package** | Expense Analysis Report Enhancement Pack v1 (Comprehensive Reports module, Expenses Report; 13 files — 8 modified, 5 added, including 3 new regression-test files) |
| **Release status** | RELEASED |
| **Release date** | 2026-08-01 |
| **Feature branch** | `feature/expense-analysis-report-enhancement-pack-v1` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `a340e2d6` (previous release's final documentation commit) |
| **Checkpoint tag** | none created — proceeded directly per this pass's implementation → runtime investigation → Product-Owner-approved-release flow |
| **Feature commit** | `d507c698` |
| **Production merge commit** | `0398d8c2` |
| **Stable tag** | `stable-expense-analysis-report-enhancement-pack-v1` → merge `0398d8c2` (annotated) |
| **Reviews** | Implementation → a "report won't open" report from the user triggered a full runtime investigation (backend service, live API, React render, Playwright browser — all clean) escalated to a second-pass investigation **inside the actual Electron renderer** via Chrome DevTools Protocol, which found zero exceptions across preload bridge / network / console / render and confirmed the running instance was serving stale mid-edit HMR state, not a source defect → Product Owner manual review — **completed & approved**, release explicitly requested |
| **Validation** | Backend + frontend `tsc --noEmit` ✅ (feature branch and post-merge) · backend `vitest run` 156/156 files, 2261/2261 tests · frontend 8/26 failures confirmed pre-existing (identical signature to the prior release's documented baseline) · Excel/HTML/print export paths and the no-sections regression case verified live inside Electron via CDP with zero exceptions |

**What changed.** The Expenses Report gains, above and below its existing table: six executive KPI cards (total expenses, transaction count, average expense, highest spending month, highest spending category, category count); a Category × Month Pivot Matrix that adapts to the selected period; a Monthly Analysis table; a ranked Top Expense Categories table with percentage of total; a Top 20 Expenses table; a Month Comparison summary (highest vs. lowest month, difference, %); and a Percentage Analysis table whose percentages sum to exactly 100.0%. All of it reaches preview, print, Excel export, and HTML/PDF export — the same three surfaces the base report always had.

**Why no second query, no duplicated aggregation.** `expenseAnalysis.ts` is a pure function (no Prisma, no I/O) that derives every KPI and section from the **same** `rows` array `reports.service.ts`'s `expenses()` already fetches after every existing filter (date range, status, category, supplier, billing month/year) is applied. The report's own `total` is passed in, not recomputed, so every section's grand total is the report total by construction — not a parallel expression that could drift or round differently. Percentages use largest-remainder (Hamilton) apportionment specifically so they sum to exactly 100.0%, never 99.9%/100.1%.

**Engine contract, additive only.** `ReportInput` gains two optional fields, `kpis`/`sections`. Reports that don't set them (all 15 other report types) render byte-identical HTML/print/Excel output — verified by dedicated tests. Sections reuse the report engine's existing `buildTable` (HTML) and `renderSheet` (Excel) — no second visual language was introduced. Excel gets one worksheet per KPI block and per section (collision-safe naming, since two sections can share a title-derived sheet name) instead of extra rows in the main sheet, so the main sheet's row indexes, freeze pane, and autofilter are byte-identical to before this pack. The print route (`ReportPrint.tsx`) switches to A4 landscape only when a report actually carries `sections` — every other report keeps its existing A4 portrait layout unchanged.

**The "report won't open" investigation.** After implementation, the user reported the report no longer opened. A first investigation pass (backend service called directly against the dev DB, the live app's real HTTP API across every report type × format, a React render test against the exact live-captured payload, and a Playwright-driven real browser session) found the report rendering correctly everywhere, with zero exceptions — the only anomaly was a burst of `Unhandled error` log entries that, once clustered by timestamp, matched an identical pre-existing pattern recurring since 06:45 that morning, hours before this pack existed. The user correctly pushed back that browser ≠ Electron and asked for the investigation to continue **inside** the actual Electron renderer. A second pass launched the real dev topology (Electron forking its own backend, Vite dev server) and attached Chrome DevTools Protocol directly to the app's renderer process — not DevTools' own window, which the first attempt mistakenly attached to. Driving the exact click path found: 6 KPI cards, 6 analytical sections, 166 table rows, zero `Runtime.exceptionThrown` events, zero console errors. Print route, Excel export (`200`, valid `.xlsx`), and the HTML/PDF export path were all separately re-verified inside the same renderer. A stale runtime lock (`~/.manarERP/runtime.lock`) that had refused the investigation's first launch attempt identified that the user's own Electron instance was still holding the lock from an earlier session — consistent with the most likely mechanism: the renderer was showing mid-edit Hot Module Replacement state from when the four `Reports.tsx` edits landed while that window stayed open, not a defect in the released source. No code was changed as a result of either investigation pass.

**Not changed:** invoice/payroll/attendance/customer/every other report type, expense creation, expense approval, expense status transitions, backend business logic outside the additive analytics function, accounting/posting rules, permissions, Electron/IPC, Prisma schema/migrations.

**Scope discipline.** The working tree at release time contained unrelated, unfinished Google Drive / cloud-sync work across 13 tracked files plus 8 untracked paths, and this pass's own investigation-only debug artifacts (`backend/__probe_expenses.ts`, two ad-hoc test files, a captured JSON fixture, a Playwright snapshot). None of it belongs to this release. All 13 pack files were staged explicitly by path (never `git add -A`); every WIP and debug file was confirmed still present, unstaged, and unmodified after the merge.

---

## Previous Release — Visual Consistency Pack — Invoice List Date Columns v1

| Field | Value |
|-------|-------|
| **Package** | Visual Consistency Pack — Invoice List Date Columns v1 (invoice list presentation; 3 files — 1 backend read-model line-set, 1 page, 1 i18n) |
| **Release status** | RELEASED |
| **Release date** | 2026-08-01 |
| **Feature branch** | `feature/invoice-list-collection-date-column-v1` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `dfe2f678` (previous release's final documentation commit) |
| **Checkpoint tag** | none created — proceeded directly per this pass's read-model investigation → implementation → Product-Owner-approved-release flow |
| **Feature commit** | `ee56530` |
| **Production merge commit** | `631b94c1` |
| **Stable tag** | `stable-invoice-list-collection-date-column-v1` → merge `631b94c1` (annotated) |
| **Reviews** | Read-model investigation before implementation (located the list query, confirmed payments were absent from it, and identified `Payment.date` as the existing collection date) → implementation → Product Owner manual review — **completed & approved**, release explicitly requested |
| **Validation** | Backend + frontend `tsc --noEmit` ✅ (feature branch and post-merge) · backend `vitest run` 2236/2236 across 154 files · frontend 8/26 failures confirmed pre-existing by stash-and-rerun against the clean baseline |

**What changed.** The invoice list table's `التاريخ` column is now `تاريخ الفاتورة`, and a new `تاريخ التحصيل` column sits immediately after it showing the invoice's most recent payment date — for fully paid and partially paid invoices alike, and `—` when the invoice has no payments. Column order is now رقم الفاتورة → الجهة → نوع الفاتورة → الاتجاه → تاريخ الفاتورة → تاريخ التحصيل → الإجمالي → المسدّد → المتبقي → الحالة.

**Why a backend change was unavoidable.** The invoice list read model (`InvoicesService.list()`) returned invoice scalars plus `customer.name`/`supplier.name` only — **payments were not in it at all**. The invoice drawer had always lazily fetched `/invoices/:id` to obtain them. The column therefore could not be rendered from data the list already had. The extension is the minimum that satisfies this: the **existing** `payments` relation is loaded with `orderBy: { date: 'desc' }, take: 1` inside the **already-issued** `findMany`, then flattened to a scalar `lastPaymentDate`. That is one relation load per page — the same shape as the existing `customer`/`supplier` includes — with no extra query, no per-row query, and no full payment history loaded per row. Nothing is calculated: `Payment.date` is the system's existing official collection date, the same field the payment and collection-date-correction flows already write.

**Why the truncated array is not returned.** `Invoices.tsx` treats the presence of a `payments` array on a row as proof that the row is fully detailed, and skips its drawer enrichment fetch on that basis. Returning a one-element array would have silently hidden every payment but the newest in the drawer, so the service deliberately strips it and exposes only the scalar.

**API contract:** additive only. `GET /invoices` rows gain one nullable field, `lastPaymentDate`. Nothing removed, renamed, or retyped. The other consumer of this endpoint (`CustomerHub.tsx`) is unaffected.

**Why the new column is not sortable — a limit, not an omission.** Latest collection date is a `MAX()` over the to-many `payments` relation. Prisma's `orderBy` cannot express aggregates over to-many relations (only `_count`), so the server-side sort whitelist has no way to encode it; and sorting it in the frontend would sort only the visible 15 rows, which `core/utils/sort.ts` explicitly documents as misleading and forbids. Making it genuinely sortable would require raw SQL re-implementing every list filter — a duplicate query that was out of scope. The column therefore follows the precedent already set by `الجهة` and `المتبقي`, both derived and both non-sortable by design.

**Reported at review, accepted:** the Excel export gains the same column automatically, because the visible table and the export are built from one column array by design (Table/Excel Column Unification v1). Export logic itself was not touched; the alternative — an opt-out flag — would reintroduce exactly the table/export drift that unification was built to prevent.

**Not changed:** invoice creation, payments, GL posting, status transitions, invoice governance, filters, pagination, stats, `GET /invoices/:id`, reports (including the `/reports/*` invoices report), colors, spacing, typography, and design tokens. Electron and Prisma/schema/migrations untouched — no migration was required, because the feature reads an existing column through an existing relation.

**Scope discipline:** the working tree at release time contained unrelated, unfinished Google Drive / cloud-sync work across ~12 files plus untracked paths. None of it belongs to this release. `frontend/src/lib/i18n.ts` was modified by **both** efforts, so it could not simply be `git add`-ed; it was staged by restoring the committed baseline, re-applying only the 4 approved key lines, committing, and then restoring the full working copy — leaving the cloud-sync i18n keys intact and unstaged in the working tree. All other WIP files were confirmed still present, unstaged, and unmodified after the merge.

---

## Previous Release — Project-Wide UI Visual Polish Pack v1

| Field | Value |
|-------|-------|
| **Package** | Project-Wide UI Visual Polish Pack v1 (project-wide visual consistency pass — button/chip/input/toolbar geometry only; CSS only, 4 files) |
| **Release status** | RELEASED |
| **Release date** | 2026-08-01 |
| **Feature branch** | `feature/project-wide-ui-visual-polish-pack-v1` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `b7d4da3e` (previous release's final documentation commit) |
| **Checkpoint tag** | none created — proceeded directly per this pass's audit → implementation → Product-Owner-approved-release flow |
| **Feature commit** | `3bf9e5ab` |
| **Production merge commit** | `a84475f6` |
| **Stable tag** | `stable-project-wide-ui-visual-polish-pack-v1` → merge `a84475f6` (annotated) |
| **Reviews** | Cascade-level audit measuring the actual rendered geometry of each control family (not proposed blind) → IMPLEMENTATION (4 scoped CSS diffs) → Product Owner clarification round on the Bank Account Explorer values (confirmed 40px/10px are pre-existing standards, not newly chosen) → Product Owner manual visual review — **completed & approved**, release explicitly requested |
| **Validation** | Frontend `tsc --noEmit` ✅ (feature branch and post-merge) · `npm run build` ✅ (both passes) · `vitest run` 8/26 failures confirmed pre-existing by stash-and-rerun against the clean baseline |

**Root cause A — no baseline border reserved.** `.btn` declared `border: none` while its `.secondary` and `.ghost` variants add `border: 1px solid`, so every bordered variant rendered **2px taller and wider** than the `.btn`/`.danger` standing beside it. Flex *stretch* containers (`.modal-foot`, `.toolbar`) masked this; plain inline flow did not — the worst case being `.td-actions`, where the unequal borders also shifted the inline-flex **baselines**, so Edit (`secondary`) and Delete (`danger`) sat at different vertical offsets on **every row of every generic CRUD table**. The identical defect existed in `.xpl-chip`: of its six tones only `--neutral` draws a border, so a neutral chip was 2px larger than the tone chips beside it in an `.xpl-exec-chips` row. Fixed by reserving `border: 1px solid transparent` on both bases — the contract `.xpl-btn` (explorer-kit.css) already used and the legacy skin never adopted.

**Root cause B — Material Symbols icons never sized at button level.** The vendored `material-symbols/outlined.css` ships `.material-symbols-outlined` at `font-size: 24px; line-height: 1`, making the icon the tallest box inside a button, so **any icon button rendered ~6px taller than the text-only button next to it**. The repo already contained **163 separate CSS rules re-declaring that font-size across 228 icon selectors**, including two independent local patches on `.btn` itself (`.settings-center .btn` and `.ctm-toolbar .btn`, both 17px) — that duplication was the diagnosis. Normalized at the base: 18px for `.btn`, 16px for `.btn.sm`, 18px for `.export-btn`. Both local overrides still win (more specific; `.settings-center` also uses `!important`; and their stylesheets are injected after `theme.css` because they load from lazily-imported components), so their deliberately denser scales are preserved untouched.

**Files (4, CSS only):**
- **`app/theme.css`** — `.btn` takes the transparent baseline border plus `justify-content: center` (inert at content width; only bites on an explicitly sized button, which `Login.tsx` had already patched inline). Icon sizes normalized for `.btn` / `.btn.sm`.
- **`components/explorer/explorer-kit.css`** — `.xpl-chip` gains the same transparent baseline border, bringing it in line with `.xpl-id-chip`, which already declared its border on the base.
- **`styles/financial.css`** — `.export-btn` had only ever set icon *color*, so its icons kept the 24px default and made each export button the tallest control on `.fc-action-bar`; normalized to 18px, the size this file already used in `.fc-load-card-btn`. Added a shared `min-height: 36px` for the Load button, view toggles and export buttons, which were each sized purely by their own padding and font metrics (0.9rem vs 0.85rem, bordered vs borderless) and never landed on one value.
- **`pages/BankAccountExplorer.css`** — filter-bar normalization to values **already established** in this same file and in the explorer kit: `.bae-export-btn`/`.bae-reset-btn` 38px → 40px to match `.bae-search-wrap` and `.bae-clear-filters-inline` (both already 40px on the row they share); `.bae-icon-btn` squared to 40×40 like `.xpl-btn--icon`; `.bae-amount-input` given the 38px height of its sibling `.bae-date-input`; `.bae-date-input` radius 8px → 10px, the value used by `.xpl-input`, `.field input`, `.toolbar input` and by its own sibling. This page is the source the explorer kit was *extracted from* (see explorer-kit.css header), so its local `.bae-*` classes never got retro-fitted to the standard they produced.

**Known partial coverage — reported and accepted at review:** `.bae-reset-btn` is dead CSS (no `.tsx` usage), so that edit is inert; `.bae-amount-input` follows its 38px sibling rather than the 40px standard, leaving the page with a deliberate two-tier scale (40px action row / 38px filter-group panel); and `.bae-search-wrap` keeps its 8px radius, so the date input now matches its sibling and the project standard but not the search field above it.

**Deferred, not fixed** — each would change rendered color or exceed this pack's scope: undefined `.btn-secondary` on 10 buttons (`BankSalaryAnalytics` ×4, `BankStatementImport` ×6) rendering as primary blue, and undefined `.btn-primary` in `AttachmentsPanel` rendering as an unstyled native button; 35 unsized native checkboxes (only `.invx-check` sizes them); the remaining un-normalized icon sites; `.xpl-drawer`'s physical `right`/`border-left` instead of logical properties.

**Not changed:** colors, dark/light mode, design tokens, typography (no font-family/size/weight/line-height on any text — the only `font-size` changes are on the icon-font glyph box, which is geometry); business logic; routing; state; component architecture; print system; reports; PDF generation; backend; Electron; Prisma/schema/migrations. **No `.tsx`/`.ts` file was modified at all.**

**Scope discipline:** the working tree at release time again contained unrelated, unfinished Google Drive Deployment Pack v1 work (`electron/services/googleDriveAuth.service.ts`, `electron/services/googleDriveClientConfig.pure.ts` + its test, `electron/__tests__/`, `electron/resources/`, plus the `.gitignore`/`electron-builder.yml` entries wiring its bundled OAuth client resource). None of it belongs to this release; all of it was explicitly excluded from `git add` (staged file-by-file, not `git add -A`) and confirmed still present, unstaged, and unmodified in the working tree after the merge. All 5 pre-existing git stashes (English Localization, Financial Number/Date Presentation phase-d WIP ×2, font-cleanup WIP, Cheques Tafqeet phase 2) confirmed untouched.

---

## Previous Release — Visual Consistency Micro Polish Pack v1

| Field | Value |
|-------|-------|
| **Package** | Visual Consistency Micro Polish Pack v1 (three previously approved, isolated visual-polish fixes — Payroll alert card overflow, Bank Account Explorer badge width, Employee Financial Tab account-number masking) |
| **Release status** | RELEASED |
| **Release date** | 2026-08-01 |
| **Feature branch** | `feature/visual-consistency-micro-polish-pack-v1` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `b8337513` (previous release's final documentation commit) |
| **Checkpoint tag** | none created — proceeded directly per this pass's investigation → implementation → Product-Owner-approved-release flow |
| **Feature commit** | `9a33b982` |
| **Production merge commit** | `ab0128a4` |
| **Stable tag** | `stable-visual-consistency-micro-polish-pack-v1` → merge `ab0128a4` (annotated) |
| **Reviews** | Codebase investigation to locate the exact root cause of each of the three issues (not proposed blind) → IMPLEMENTATION (3 minimal, scoped diffs) → Product Owner manual visual review — **completed & approved**, release explicitly requested |
| **Validation** | Frontend `tsc --noEmit` ✅ (feature branch and post-merge) · `npm run build` ✅ (both passes) |

**1. Payroll (`pages/Salaries.tsx`, missing-payroll-employees alert card):** each employee was rendered as a `whiteSpace: nowrap` "Name (Code)" chip inside a plain block `<div>` with no wrap/containment strategy and no `max-width`/`overflow-wrap` safety net, so with many employees the row extended past the amber alert card. Fixed by giving the container `display: flex; flexWrap: wrap` with a `gap` (replacing the old per-chip `marginInlineEnd`), plus `overflowWrap: anywhere` as a fallback for a single pathologically long name. Each chip still keeps its own name+code pair together as one unit. Alert trigger condition (`missingPayrollCount`) and data source (`missingPayrollEmployees`) untouched.

**2. Bank Account Explorer (`pages/BankAccountExplorer.css`, Transaction Details drawer):** the transaction-type badge (e.g. "شيك") appeared wider than its text because its parent, `.bae-drawer-hero-body` (`flex-direction: column`, no `align-items` set), defaulted to `stretch` and forced the badge span to the width of its sibling amount text. Fixed by adding `align-items: flex-start` to the parent. The shared `.bae-tx-badge` rule itself was already correctly content-width and was left untouched, so its other two usages in this file (drawer header-sub row, timeline table) are unaffected — confirmed by inspecting both call sites before editing.

**3. Employee Financial Tab (`components/employee/EmployeeFinancialTab.tsx`):** `maskAccount()` unconditionally truncated the employee's real, already-client-side bank account number to `**** **** **** <last4>`, with no connection to the app's privacy-mode toggle — unlike every other financial value in the same component, which routes through `PrivateAmount`/`usePrivacyMode()`. Renamed to `formatAccount()` and removed the truncation; it now returns the stored value trimmed of stray whitespace only. The IBAN-vs-account-number label detection (a presentational classification, not masking) was preserved. This tab is read-only display only — no edit/save/validation logic exists here to touch.

**Not changed:** any layout, colors, typography, spacing, or hierarchy beyond the three fixes above; business logic; routing; state; the design system; backend; Electron; Prisma/schema/migrations.

**Scope discipline:** the working tree at release time also contained unrelated, unfinished Google Drive Deployment Pack v1 work (`electron/services/googleDriveAuth.service.ts`, `electron/services/googleDriveClientConfig.pure.ts` + its test, `electron/__tests__/`, `electron/resources/`, plus the `.gitignore`/`electron-builder.yml` entries wiring its bundled OAuth client resource). None of it belongs to this release; all of it was explicitly excluded from `git add` (staged file-by-file, not `git add -A`) and confirmed still present, unstaged, and unmodified in the working tree after the merge. All 5 pre-existing git stashes (English Localization, Financial Number/Date Presentation phase-d WIP ×2, font-cleanup WIP, Cheques Tafqeet phase 2) confirmed untouched.

---

## Previous Release — Dark Mode Color Consistency Pack v1

| Field | Value |
|-------|-------|
| **Package** | Dark Mode Color Consistency Pack v1 (project-wide audit and correction of dark-mode color contrast and theme-reactivity — text/background/icon/badge/table/dropdown/popover colors only) |
| **Release status** | RELEASED |
| **Release date** | 2026-08-01 |
| **Feature branch** | `feature/dark-mode-color-consistency-pack-v1` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `4dd5739d` (previous release's final documentation commit) |
| **Checkpoint tag** | none created — proceeded directly per this pass's audit → implementation → corrective follow-up → token-consolidation follow-up → Product-Owner-approved-release flow |
| **Feature commit** | `6e6b401d` |
| **Production merge commit** | `9b3c437b` |
| **Stable tag** | `stable-dark-mode-color-consistency-pack-v1` → merge `9b3c437b` (annotated) |
| **Reviews** | Static audit of all 73 stylesheets + every `.tsx` inline style (WCAG relative-luminance contrast computed against resolved dark-mode token values) → written audit report with severity/location/root-cause classification → IMPLEMENTATION (systemic fixes + ~50 leaf fixes) → design-token-architecture Q&A (self-identified 4 recurring hard-coded colors) → token-consolidation corrective pass → Product Owner manual visual review — **completed & approved**, release explicitly requested |
| **Validation** | Frontend `tsc --noEmit` ✅ (feature branch and post-merge) · `npm run build` ✅ (both passes) |

**Root causes fixed (systemic):**
- No `color-scheme: dark` on the dark root — native `<select>` popups and unstyled `input`/`textarea` placeholders rendered with light-mode chrome regardless of the app's theme. Added `color-scheme: dark` plus a global `::placeholder` rule reading `var(--text-muted)`.
- `--muted` referenced in ~90 declarations across `BankAccountExplorer.css`, `BankAccounts.tsx`, `TransactionIntelligencePanel.css`, `KpiStat.css`, `Salaries.css` and 4 Recharts `fill` props, but never declared — every one of those declarations silently dropped instead of following the theme. Aliased to `var(--text-muted)`.
- shadcn's `dark:` utilities (`ui/button.tsx`, `ui/calendar.tsx`) resolved via the OS `prefers-color-scheme` instead of this app's own `data-theme` toggle. Added a Tailwind v4 `@custom-variant dark` repointing it at `[data-theme="dark"]`.
- 3 files (`PrintCenter.css`, `BankSalaryAnalytics.css`, `calibrator-studio.css`) gated dark styling on `@media (prefers-color-scheme: dark)` instead of the in-app toggle, desyncing from the app's own theme state. Converted to `html[data-theme="dark"]`.
- `--text-muted` measured 4.07:1 (below WCAG AA 4.5:1) against `--surface-2` in dark mode — every table header and `.pill.gray` inherited the failure. Lightened the dark value from `#94a3b8` to `#a3b3c7` (4.85:1); light mode unchanged.
- 15 further undefined CSS variables (`--surface2`, `--bg-alt`, `--bg-subtle`, `--bg-card`, `--bg-header`, `--text-primary`, `--text-secondary`, `--color-brand`, `--success`, `--warning`, `--danger`, `--color-danger`, `--yellow-light`, `--amber-bg`, `--xpl-amber`) aliased to existing tokens — resolves every silently-broken call site without editing the component that reads it (`PayrollBankImport.tsx` needed zero direct edits).

**~50 leaf fixes** across `ai/ResultCard.css`, `pages/DataImport.css`, `pages/BankReconciliation.css`, `pages/BankSalaryAnalytics.css`, `pages/BankAccountExplorer.css`, `styles/financial.css`, `pages/Integrations.css`, `components/approval/*`, cheque template surfaces (`chequeTemplateManager.css`, `chequeTemplateDesigner.css`, `chequeStudioOverlay.css`, `chequeTemplatePrintPage.css`), `components/AttachmentsPanel.tsx`, `pages/BankStatementImport.tsx`, `pages/PayrollBankImport.tsx`, `pages/AIAssistant.css`, `pages/TransactionIntelligencePanel.css`, `styles/stitch-full.css`, `components/DateCalendarPicker.css`, `pages/FinancialOperationsDashboard.tsx` — dark text on translucent/theme-reactive tint backgrounds, opaque light badge surfaces that never flipped, an OS-preference-gated calendar day-hover using a foreign shadcn gray instead of the app's own surface-hover token, and Recharts axis/tooltip props missing a dark-aware `fill`/`background`.

**New semantic tokens:** `--violet`/`--violet-light` and `--teal`/`--teal-light`, added to the existing `--green`/`--red`/`--amber`/`--blue` (+`-light`) token family. Required because the affected UI — transfer/fee badges, AI capability chips, the `PAID`/`PARTIAL` approval statuses — was already violet/teal in the approved design; remapping to an existing hue would have changed what those elements visually mean, which was out of scope.

**Corrective follow-up (token consolidation):** a self-identified architecture gap — 4 colors (`#60a5fa`, `#f87171`, `#34d399`, `#fde68a`, used ~26 times across 6 files as brightened dark-mode text on translucent tint backgrounds) were left as repeated literals instead of tokens during the leaf-fix pass. Centralized into `--blue-bright`/`--red-bright`/`--green-bright`/`--amber-bright` (dark-root-only — every consuming rule is already gated under `html[data-theme="dark"]`). Values byte-identical to before; architecture-only, re-verified with `tsc`/build after the swap.

**Not changed:** any color value beyond the ones listed above, layout, spacing, typography, component hierarchy, business logic, routing, APIs, backend, Electron, Prisma/schema/migrations. `print-templates/`, `forms/`, and deliberate white-paper preview surfaces (invoice/payslip/report previews) were excluded from the audit as by-design light surfaces, not touched.

**Deferred, logged but not fixed (self-disclosed, out of the approved scope):** `.ai-rc-meta-chip--generation` in `ResultCard.css` (`var(--primary)` resolves near-black in dark mode); the same light-island badge pattern repeats at additional un-cited lines in `BankStatementImport.tsx` (dedup chips, success dialog, row highlighting) and `AttachmentsPanel.tsx` (row border, two link colors) beyond the lines explicitly fixed. `chequeTemplateDesigner.css`'s `.ctd-field-text { color: #000 }` was investigated and confirmed **not** a defect — it renders on the cheque's always-white paper canvas image, matching the print-template exclusion.

**Scope discipline:** the working tree at release time also contained unrelated, unfinished Google Drive Deployment Pack v1 work (`electron/services/googleDriveAuth.service.ts`, `electron/services/googleDriveClientConfig.pure.ts` + its test, `electron/__tests__/`, `electron/resources/`, plus the `.gitignore`/`electron-builder.yml` entries wiring its bundled OAuth client resource). None of it belongs to this release; all of it was explicitly excluded from `git add` (staged file-by-file, not `git add -A`) and confirmed still present, unstaged, and unmodified in the working tree after the merge. All 5 pre-existing git stashes (English Localization, Financial Number/Date Presentation phase-d WIP ×2, font-cleanup WIP, Cheques Tafqeet phase 2) confirmed untouched.

---
