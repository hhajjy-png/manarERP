# PROJECT_STATE Archive — 2026-08-19 → 2026-08-28

> Archived from [`PROJECT_STATE.md`](../../PROJECT_STATE.md) on **2026-09-10**, during the release of
> **Employee Debt Acknowledgment Administrative Form v1**, under the Rotation & Archive Policy defined in that
> file: the release log had reached **19** dated entries, past the **~15** trigger, so the oldest were moved
> here leaving the current release plus the **10** most recent `## Previous Release` entries live.
>
> Eight entries were moved. They are reproduced **verbatim** — not summarized, not rewritten, not reformatted.
>
> **On the date range in this file's name:** the three newest entries archived here carry an explicit
> `Release date` (2026-08-28, 2026-08-27, 2026-08-25). The five oldest — the cheque-template and financial
> accuracy releases — predate the convention of recording a release date in the table and carry none. The
> lower bound is therefore taken from the previous archive, which ends at **2026-08-19**
> ([`PROJECT_STATE_ARCHIVE_2026-08-01_to_2026-08-19.md`](PROJECT_STATE_ARCHIVE_2026-08-01_to_2026-08-19.md)),
> so this batch continues from exactly where that one stopped with no gap and no overlap.

---

## Previous Release — Expiration Center — Single Source of Truth & Data Integrity v1

| Field | Value |
|-------|-------|
| **Package** | **مركز انتهاء الوثائق** صار طبقة **قراءة/تجميع فقط** — كل نوع وثيقة يُقرأ من مصدره الرسمي الوحيد، وتعديل التاريخ في وحدته ينعكس فورًا بلا مزامنة ولا إدخال ثانٍ |
| **Release status** | **RELEASED** — **Expiration Center Single Source of Truth = RELEASED** |
| **Product Owner visual review** | **completed and approved** — المراجعة البصرية اليدوية تمت واعتُمدت قبل الدمج؛ لا ملاحظات بصرية مانعة |
| **Release date** | 2026-08-28 |
| **Fix commit** | `f919b65c` |
| **Merge** | `d64b1902` — `--no-ff` merge of `feature/expiration-center-single-source-v1` |
| **Tags** | `stable-expiration-center-single-source-v1` → `d64b1902` · `checkpoint-expiration-center-single-source-v1` → `c5e76ff1` (production HEAD قبل الدمج مباشرةً) |
| **السبب الجذري** | `EQUIPMENT_INSURANCE` كان يُقرأ من `equipment.insuranceExpiry` — نسخة ثانية **لا يكتب فيها أحد في النظام كله**: ليست في `createEquipmentSchema` ولا في نموذج المعدات ولا في مستورِد المعدات، ووحدة تأمين المركبات لا تلمسها بنص تصميمها. المستهلك الوحيد كان سطر القراءة في المركز — فتجديد وثيقة تأمين لم يكن ينعكس إطلاقًا، ويبقى المركز على قيمة مجمّدة |
| **الإصلاح** | `EQUIPMENT_INSURANCE` يُبنى من `endDate` للوثيقة الحالية في `vehicle_insurance_policies` عبر `vehicleInsuranceService.listCurrentExpiries()`، و`insuranceExpiry` أُزيل من `select` جدول المعدات فلم يعد يُقرأ من أي مكان. تعريف «الوثيقة الحالية» (`endDate desc → startDate desc → id desc`) استُخرج إلى `latestPolicyRows()` الخاصة تستدعيها `listCurrentPolicies` و`listCurrentExpiries` معًا — **مصدر واحد للقاعدة** |
| **خريطة المصادر** | `CANONICAL_SOURCE` مركزية: RESIDENCY/PASSPORT/DRIVING_LICENSE/VEHICLE_LICENSE → `employees` · REGISTRATION → `equipment` · INSURANCE → `vehicleInsurance` · CONTRACT → `contracts`. كل صف يحمل `sourceModule` مشتقًا منها آليًا، ويُعرض كـ**«المصدر الرسمي»** في لوحة التفاصيل ليتمكن المستخدم من فتح الشاشة المالكة والمقارنة يدويًا |
| **تصحيح KPI** | `summary.total` كان يعدّ الصفوف **غير السارية** وحدها (18) بينما يعرض الجدول تحت «الكل» **كل** الصفوف (137) — بطاقة وجدول بتعريفين مختلفين للمجموعة نفسها. صار `total` مجموع النطاقات الستة = عدد صفوف الجدول بلا فلاتر، وأُفرد `actionable` للمعنى القديم، وأُضيفت بطاقة «سارية» ليكتمل الجمع |
| **منع انحدار** | ودجة لوحة المعلومات `ExpirationWidget` كانت تُخفي نفسها بـ`total === 0`؛ بعد توسيع `total` صار شرطها `actionable === 0` وإلا لما اختفت أبدًا |
| **لم يُمس** | الأنواع الستة الأخرى (كانت تقرأ من مصادرها الرسمية أصلًا) · workflows الموظفين/المعدات/التأمين/العقود · الصلاحيات · سجلات التدقيق · عتبات الإنذار (7/30/60/90) · عقد `daysRemaining` المشترك |
| **النطاق** | طبقة قراءة خالصة — **صفر** جدول جديد، cache، sync engine، background job، نقطة نهاية، مفتاح صلاحية. حمولتا `/expirations` و`/expirations/summary` اكتسبتا حقولًا فقط (`sourceModule`، `ok`، `actionable`) |
| **`equipment.insuranceExpiry`** | **باقٍ في قاعدة البيانات موسومًا «مهجور»** — لا حذف ولا `migration`. تغيير `schema.prisma` **تعليقات `///` فقط، بلا SQL**. الحقل الآن بلا قارئ وبلا كاتب في النظام كله |
| **البيانات** | **لا backfill ولا تعديل بيانات**. قاعدة التطوير: صفر قيمة قديمة في `insuranceExpiry` وصفر وثيقة تأمين ⇒ **صفر تعارض**. بصمة `manar.db` قبل التحقق وبعده متطابقة |
| **اختبار جديد** | `expirations.sourceOfTruth.test.ts` (15 اختبارًا، 290 سطرًا، Prisma وخدمة التأمين مموّهتان بالكامل) — مصدر كل نوع · انعكاس تعديل المصدر بلا كتابة ثانية · فحص `select` فعليًا لإثبات غياب `insuranceExpiry` · حسم التعارض لصالح المصدر الرسمي · غياب التاريخ لا يولّد تاريخًا مصطنعًا · عقد `daysRemaining` (أمس ‎-1 · اليوم 0 · غدًا +1) على الأنواع السبعة · تطابق كل بطاقة مع صفوف الجدول تحت فلترها |
| **Sanity checks** | الاختبارات المستهدفة **54/54** ✅ (`expirations.sourceOfTruth` · `expirations.service` · `vehicleInsurance.service` · `vehicleInsurance.status`) · backend `tsc --noEmit` ✅ · frontend `tsc --noEmit` ✅ · frontend `npm run build` ✅ · data sanity على قاعدة التطوير: `rows=137` = `total=137` = مجموع النطاقات · `actionable=18` = الصفوف غير السارية · 0 مخالفة `sourceModule` · 0 مخالفة `daysRemaining` |
| **Baseline failures** | 5 فشل في `chequeDesignerTemplates.integration.contract.test.ts` — أُثبتت **PRE-EXISTING BASELINE FAILURE — NOT A REGRESSION** بتشغيلها في worktree نظيف من `origin/production`: نفس العدد ونفس الأسماء ونفس الأسباب (4× ENOENT لملف `chequeDesignerStore.ts` غير الموجود في Git + 1× AssertionError). لم تُلمس تلك الوحدة |
| **متروك لقرار مالك المنتج** | (1) حذف عمود `equipment.insuranceExpiry` نهائيًا — يحتاج `migration` وموافقة صريحة · (2) هل «رخصة المركبة» على الموظف و«دفتر المركبة» على المعدة وثيقة واقعية واحدة مسجلة مرتين؟ · (3) فلتر العقود `status IN (ACTIVE, RENEWING)` يُخفي العقود بحالات أخرى |
| **حدود التحقق** | قاعدة التطوير فيها **صفر وثيقة تأمين وصفر عقد**، فمساران (`EQUIPMENT_INSURANCE` و`CONTRACT_EXPIRY`) لم يُنفَّذا على بيانات حقيقية — إثباتهما يقوم على الاختبارات المموّهة والبنية. كذلك `listCurrentExpiries()` مغطّاة **بحكم مشاركتها** `latestPolicyRows()` مع `listCurrentPolicies` المختبَرة مباشرةً، لا باختبار يستدعيها هي |
| **الإصدار** | لا تغيير في `package.json` — **بلا إعادة بناء مثبّت**. `manar.exe` لم يُبنَ في هذه المهمة |

---

## Previous Release — Bank Salary Analytics — Western Digits Consistency v1

| Field | Value |
|-------|-------|
| **Package** | توحيد كل الأعداد الصحيحة في صفحة **تحليلات الرواتب البنكية** إلى أرقام لاتينية (`0-9`) عبر `formatInteger` المشتركة |
| **Release status** | **RELEASED** — **Bank Salary Analytics Western Digits = RELEASED** |
| **Product Owner visual review** | **completed and approved** — المراجعة البصرية اليدوية تمت واعتُمدت قبل الدمج؛ لا ملاحظات بصرية مانعة |
| **Release date** | 2026-08-27 |
| **Fix commit** | `f6da081d` |
| **Merge** | `efade9e7` — `--no-ff` merge of `fix/bank-salary-analytics-western-digits-v1` |
| **Tags** | `stable-bank-salary-analytics-western-digits-v1` → `efade9e7` · `checkpoint-bank-salary-analytics-western-digits-v1` → `ca28d0b2` (production HEAD قبل الدمج مباشرةً) |
| **السبب الجذري** | الصفحة كانت تُنسِّق أعدادها الصحيحة بـ`toLocaleString('ar-KW')` في **15 موضعًا**، وهذا الـlocale يُخرج أرقامًا هندية (١١/١٤/١٦/١٧)، بينما المبالغ والتواريخ تمر أصلًا عبر `lib/format` (locale `en-US`) — فاختلف شكل الرقم داخل الصف الواحد |
| **الإصلاح** | استبدال كل الاستدعاءات بـ`formatInteger` من `frontend/src/lib/format/currency.ts` — نفس مُنسِّق المبالغ. **لا formatter مكرر، ولا CSS hack، ولا locale جديد** |
| **المواضع** | جدول الملخص الشهري (عدد المعاملات/الموظفين) · جدول أعلى الموظفين (عدد المعاملات) · عدّاد صفوف جدول المعاملات · بطاقات KPI/Insights · شريط الملخص · تلميح الرسم البياني · إحصاءات درج الموظف |
| **حراسة `—`** | `txData?.meta.total … ?? '—'` و`m.employeeCount?… ?? '—'` حُوِّلا إلى شرط صريح، فـ`formatInteger(undefined)` كان سيطبع `0` بدل `—` |
| **لم يُمس** | العربية · RTL و`dir` · عناوين الأعمدة · القيم والمعادلات · **تنسيق KWD** (`fmt3`/`PrivateAmount`) · **التواريخ** (`formatDate`) · أي حساب أو رصيد |
| **النطاق** | ملف مصدر واحد `frontend/src/pages/BankSalaryAnalytics.tsx` (32 سطرًا: 16+/16−) — **صفر ملف مشترك، صفر صفحة أخرى، صفر refactor عام**، صفر ترحيل، صفر تغيير مخطط، صفر API، صفر مفتاح صلاحية |
| **اختبار جديد** | `bankSalaryAnalyticsWesternDigits.test.tsx` (4 اختبارات، 143 سطرًا) — يرسم الصفحة الحقيقية بـAPI مُموّه (11/14/16/17)، ويثبت ظهور الأرقام لاتينية، وخلوّ **كل** خلايا الجداول من النطاق `U+0660–U+0669`، وظهور `(17)`، وبقاء `dir="rtl"` والأسماء العربية |
| **إثبات عدم كونه اختبارًا فارغًا** | بإرجاع ملف الصفحة عبر `git stash` سقطت **3 من 4** اختبارات، ثم نجحت الأربعة بعد الإصلاح |
| **Sanity checks** | الاختبار المستهدف **4/4** ✅ · frontend `tsc --noEmit` ✅ · frontend `npm run build` ✅ (لم تُعَد أي مجموعة ضخمة ناجحة سابقًا) |
| **الإصدار** | لا تغيير في `package.json` — حزمة frontend، **بلا إعادة بناء مثبّت**. `manar.exe` لم يُبنَ في هذه المهمة |

---

## Previous Release — Production Release 2026.5.7 (Desktop Installer)

| Field | Value |
|-------|-------|
| **Package** | مثبِّت Windows جديد مكتفٍ ذاتيًا يجمع كل ما دُمج على `production` منذ مثبِّت 2026.5.6 — إصدار تغليف، بلا عمل ميزات جديد |
| **Release status** | **RELEASED** — Desktop/Installer |
| **Version** | `2026.5.6` → **`2026.5.7`** — `package.json` هو الملف الوحيد المتغيّر في commit الإصدار |
| **Release date** | 2026-08-25 |
| **Production source HEAD** | `f206103c` — النسخة مبنيّة من هذا الـHEAD وحده، بلا feature branch ولا stash ولا ملفات غير مُتتبَّعة |
| **Release commit** | `f206103c` — `chore(release): Production Release 2026.5.7` |
| **Tag** | `stable-production-release-2026.5.7` |
| **الحزم المشمولة** | كل ما على `production` حتى هذا الـHEAD، ومنها الخمس المدموجة منذ مثبِّت 2026.5.6: **Multi-Bank Cheques Foundation v1** (`a684c66a`) · **Financial Accuracy & KPI Integrity v1** (`ac7cb93d`) · **Gulf Bank A4 Cheque Template + Professional Calibration + Date Block v1** (`2ea4aae8`) · **Multi-Bank Cheque Profiles Readiness v1** (`0a015f95`) · **Simple Cheque Calibration Profiles + Persistent Default v1** (`ac05c45c`) — بما فيها بروفايلات المكتب/البيت/أخرى وتوافق Legacy Gulf → home والبروفايل الافتراضي الدائم |
| **Product Owner visual review** | **تمت واعتُمدت لكل حزمة في مرحلتها** قبل دمجها إلى `production`؛ هذا الإصدار تغليف لما اعتُمد سابقًا ولا يضيف عملًا يحتاج مراجعة بصرية جديدة |
| **Artifact — Installer** | `release/AlManarERP-Setup-2026.5.7.exe` — **138,478,346 بايت (132.06 ميغابايت)** · SHA-256 `89d4a8c6d10ff705073da2213c8ce43d0538c28848900b695d8d47a463800914` · NSIS · Windows 10/11 x64 · صفر متطلبات تشغيل خارجية |
| **Artifact — التطبيق** | `release/win-unpacked/Al Manar ERP.exe` — 180,192,256 بايت · FileVersion `2026.5.7` · ProductVersion `2026.5.7.0` · `win-unpacked` 3,384 ملفًا / 470,350,839 بايت · `app.asar` 688 مدخلًا |
| **أول مثبِّت يشحن** | الترحيل السبعين `20260821120000_multi_bank_cheques_foundation_v1` وجدولَي `banks` و`bank_accounts` ومفتاحَي `banks.read`/`banks.manage` — **70 ترحيلًا** مشحونًا |
| **عميل Prisma المُعبَّأ** | **87 نموذجًا**، مجموعة النماذج مطابقة حرفيًا لـ`backend/prisma/schema.prisma` — أكّدها حارس فشل-مغلق في `prepare-backend-deps.js` أثناء البناء |
| **قاعدة البيانات الذهبية** | SHA-256 `8ab608cc9416f098d5d510d825b7dfa48cbc26b78d57f4a9220592c6b4b6dc24` · 4,059,136 بايت · مطابقة حرفيًا للبيان `seed-data/golden-manifest.json` · لم تُشحن أي بيانات حالة من جهاز البناء (Data Safety Pack v2 — F-04) |
| **تدقيق نظافة الحزمة** | صفر `__livetest__`/`__probe__` · صفر `.ts`/`.d.ts` · صفر خرائط مصدر · صفر `.env`/`.bak` · صفر ملفات اختبار · قاعدة بيانات واحدة فقط |
| **Sanity checks** | git integrity (`production == origin/production`، شجرة نظيفة، صفر commits غير مدفوعة) ✅ · `prisma migrate status` = 70 ترحيلًا مطبَّقًا بلا معلّق ✅ · backend/frontend/electron `tsc --noEmit` ✅ · `npm run dist` ✅ · صفر متطلبات تشغيل خارجية في `runtime-requirements.json` ✅ |
| **Smoke test** | التطبيق المُعبَّأ يفتح · Electron main يبدأ بلا خطأ (5 عمليات) · الخدمة الخلفية تستمع على `127.0.0.1:48211` · `/api/health` يعيد `{"success":true,"status":"ok"}` · قاعدة البيانات تُفتح و«70 ترحيلًا مطبَّقًا، لا شيء معلَّق» · النافذة الرئيسية تُحمَّل بعنوانها العربي · `error.log` فارغ · رقم النسخة `2026.5.7` ظاهر في التطبيق قيد التشغيل |
| **ملاحظة بيئة البناء** | على جهاز البناء يفشل بدء أي نسخة مُعبَّأة بخروج `9` خلال ~1.1 ثانية ما لم تُمرَّر `--disable-gpu`؛ **النسخة المثبَّتة 2026.5.6 السابقة تفشل بالطريقة نفسها**، فالسبب بيئي (تهيئة GPU) ولا علاقة له بهذا الإصدار. أُجري الـSmoke test بـ`--no-sandbox --disable-gpu` ونجح بالكامل |
| **متطلب متابعة (لم يُنفَّذ في هذا الإصدار)** | `scripts/prepare-backend-deps.js` يُفضّل `backend/node_modules/.prisma` مصدرًا للعميل، لكنه يعيد كتابة `backend/node_modules` في نهاية كل تغليف — فيصير المصدر مخرَجَ التغليف السابق، بينما `prisma generate` يكتب إلى جذر الـworkspace المرفوع. جمّد ذلك المصدر على 85 نموذجًا وأوقف البناء (الحارس عمل كما صُمِّم). أُزيلت النسخة القديمة من `backend/node_modules` فسقط السكربت إلى مصدر الجذر الصحيح (87). **إصلاح السكربت نفسه مسجَّل كمتابعة مطلوبة ولم يُغيَّر داخل هذا الإصدار** — كما فعل إصدار 2026.5.2 مع العيب نفسه |

---

## Previous Release — Simple Cheque Calibration Profiles + Persistent Default v1

| Field | Value |
|-------|-------|
| **Package** | بروفايلات معايرة ثابتة لكل قالب شيك — المكتب / البيت / أخرى — مع توافق المعايرة القديمة إلى `home` وحفظ آخر بروفايل مختار كافتراضي دائم |
| **Release status** | **RELEASED** — **Simple Cheque Calibration Profiles = RELEASED** · **office / home / other profiles = RELEASED** · **Legacy Gulf calibration → home compatibility = RELEASED** · **Persistent default calibration profile = RELEASED** |
| **Product Owner visual review** | **completed and approved** — المراجعة البصرية اليدوية تمت واعتُمدت قبل الدمج؛ لا ملاحظات بصرية مانعة |
| **Pack commit** | `9db0051f` |
| **Merge** | `ac05c45c` — `--no-ff` merge of `feature/cheque-calibration-profiles-v1` |
| **Tags** | `stable-cheque-calibration-profiles-v1` → `ac05c45c` · `checkpoint-cheque-calibration-profiles-v1` → `0211cc23` (production HEAD قبل الدمج مباشرةً) |
| **Schema / migration** | **لا شيء** — صفر ترحيل، صفر تغيير مخطط، صفر جدول، صفر API جديد، صفر مفتاح صلاحية — تخزين عبر `settings` القائم و`PUT /settings` وحده |
| **البروفايلات** | ثلاثة ثابتة فقط: `office` = المكتب · `home` = البيت · `other` = أخرى. **لا إنشاء ولا حذف ولا تسمية مخصصة ولا ربط بطابعة ولا اكتشاف تلقائي ولا سجل تاريخي** |
| **الهوية** | `Bank Template + Calibration Profile` — تسعة صفوف مستقلة لثلاثة بنوك، كل زوج يقرأ صفّه ويكتب مفتاحه ويستعيد أساس بنكه |
| **مفاتيح المعايرة** | `cheque.calibration.<bank>-a4.<profile>.v1` — مركّبة من مفتاح القالب نفسه بإدراج معرّف البروفايل قبل لاحقة الإصدار |
| **بروفايل جديد** | يبدأ من **Factory Document الخاص ببنكه** — لا من تعديلات بروفايل آخر ولا من بنك آخر |
| **Legacy → home** | المعايرة المحفوظة قبل البروفايلات على `cheque.calibration.gulf-a4.v1` يرثها **`home`** لا `office` — فـ`office` يبدأ من أساس الخليج حتى يُعايَر بنفسه، و`other` كذلك |
| **أولوية Profile-specific** | مفتاح الزوج يُبحث أولاً دائماً؛ الوراثة fallback فقط. أي صفّ محفوظ لبروفايل يتغلّب على Legacy دائماً، وترتيب الصفوف لا يغيّر شيئاً |
| **المفتاح القديم** | **يُقرأ ولا يُكتب ولا يُحذف** — أول حفظ على `home` يكتب مفتاح البروفايل ويبقى الصفّ القديم في مكانه؛ لا migration |
| **الافتراضي الدائم** | `cheques.defaultCalibrationProfile` — صفّ واحد للتطبيق كله يحمل كلمة واحدة (`office`/`home`/`other`). آخر اختيار يبقى بعد إغلاق البرنامج وإعادة تشغيله حتى يغيّره المستخدم |
| **office كـfallback** | قيمة أول تشغيل فقط — وأي قيمة مفقودة أو فارغة أو غير صالحة ترجع إليه بدل أن تكسر المنتقي |
| **مصدر واحد** | صفحة الشيكات تملك الحالة، و`ChequeStudioOverlay` صار **controlled** يستقبل البروفايل ويبلّغ التغيير — فلا يمكن أن تختلف الصفحة والاستوديو |
| **Preview = Print** | المعاينة والطباعة الفعلية تشتقّان من **نفس الوثيقة** عبر `calibrationDocumentFor(...)` — لا إعداد معاينة منفصل |
| **لم يُمس** | أي Geometry أو إحداثيات حقول أو offsets أو Bank Profiles — `GULF_BANK` **APPROVED** · `KFH` **PROVISIONAL** · `NBK` **PROVISIONAL** كما هي، والطباعة الإنتاجية للقالبين ما زالت محجوبة تحت كل بروفايل |
| **حارس الدفعة المختلطة** | دفعة تجمع قوالب بنوك مختلفة **تُرفض صراحةً** بأرقام شيكاتها بدل أن تُطبع كلها بهندسة أول عنصر |
| **إعادة الاستخدام** | لا Print Engine ولا Calibration Engine ولا Runtime ولا Renderer ولا نظام تفضيلات جديد — ولا `localStorage` |
| **Validation** | frontend `tsc --noEmit` ✅ · `build:front` ✅ · المجموعة الكاملة **224** ملفاً / **4141** اختباراً ✅ · sanity مستهدف **149** اختباراً ✅ |
| **اختبارات جديدة** | `chequeCalibrationProfiles` (32) — الثلاثة فقط، استقلال الأزواج، Factory لكل بنك، Legacy→home، أولوية profile-specific · `chequeDefaultCalibrationProfile` (23) — fallback، حفظ، round-trip كامل، قيم فاسدة، تزامن الصفحة والاستوديو، عدم تغيّر الوثائق |
| **الإصدار** | لا تغيير في `package.json` — حزمة frontend، **بلا إعادة بناء مثبّت**. `manar.exe` لم يُبنَ في هذه المهمة |

---

## Previous Release — Multi-Bank Cheque Profiles Readiness v1

| Field | Value |
|-------|-------|
| **Package** | سجل قوالب شيكات متعدد البنوك: قالب لكل بنك، ومنتقٍ داخل استوديو المعايرة الاحترافي نفسه، وقالبان جديدان لبيت التمويل والوطني بإعداد افتراضي قابل للمعايرة فورًا |
| **Release status** | **RELEASED** — **Multi-Bank Cheque Profiles = RELEASED** · **KFH/NBK provisional profiles = RELEASED** |
| **Product Owner visual review** | **completed and approved** — المراجعة البصرية اليدوية تمت واعتُمدت قبل الدمج؛ لا ملاحظات بصرية مانعة |
| **Pack commit** | `972c5aca` |
| **Merge** | `0a015f95` — `--no-ff` merge of `feature/multi-bank-cheque-profiles-readiness-v1` |
| **Tags** | `stable-multi-bank-cheque-profiles-v1` → `0a015f95` · `checkpoint-multi-bank-cheque-profiles-v1` → `ce40ad09` (production HEAD قبل الدمج مباشرةً) |
| **Schema / migration** | **لا شيء** — صفر ترحيل، صفر تغيير مخطط، صفر مفتاح صلاحية، صفر API، صفر جدول، وصفر تعديل على أي سجل تاريخي |
| **السجل** | `GULF_BANK` **APPROVED** · `KFH` **PROVISIONAL** · `NBK` **PROVISIONAL** — الأكواد من سجل البنوك القائم، فلا Bank ولا BankAccount جديد ولا تغيير على منتقي الحساب |
| **قالب الخليج** | **بلا تغيير** — الهندسة والموضع وجدول الحقول وDate Block والصورة ومفتاح المعايرة وحالة APPROVED كما صدرت. التعديل الوحيد في وحدته تفويضٌ لتحويل mm→نسبة إلى المحوّل المشترك، ومجموعاته تثبت تطابق المخرَج حرفيًا |
| **KFH / NBK — الأساس** | مبذور من قياسات الخليج (الشيك الوحيد المقيس) ثم مكتوب كبيانات مستقلة في `PROVISIONAL_BASE_*` لا تقرأ قالب الخليج: شيك `180 × 90` · موضع `117 / 60` · المستفيد `8/23.5/108/7` · كتلة التاريخ `135/23/28/7` بخانات `0/9/18` · التفقيط `10/33/105/16` · المبلغ `132/40/38.5/8.5` |
| **الاستقلال بنيويًا** | كل قالب نسخة عميقة: لا مصفوفة حقول ولا حقل ولا هندسة ولا موضع مشترك بين الثلاثة. مثبَّت بتأكيدات هوية لكل زوج وباختبار تعديل في المكان لا يصل إلى غيره |
| **الصورة** | `previewBackground = null` للقالبين — **لا صورة شيك الخليج لهما**. أي صورة مستقبلية تبقى Preview only وغائبة بنيويًا عن شجرة الطباعة |
| **التاريخ** | كتلة واحدة بخانات داخلية لكل بنك — لا حقول `chequeDay`/`chequeMonth`/`chequeYear` منفصلة في أي قالب |
| **لماذا PROVISIONAL لا APPROVED** | الأرقام أساس عملي لا قياس لشيك KFH أو NBK، ولم تُطبع ورقة للتحقق. الحارس يفحص الحالة **قبل** الهندسة فلا تتجاوزه هندسة كاملة |
| **منع الطباعة الإنتاجية** | ثلاثة مواضع في صفحة الشيكات: تعطيل الزر، ورفض الطباعة المفردة، ورفض الدفعة كاملة بأرقام شيكاتها — برسالة «قالب هذا البنك إعداد افتراضي ولم يُطابَق بعد مع الشيك الأصلي…». **الطباعة التجريبية من الاستوديو تبقى متاحة** لأغراض المعايرة ولا تُسجَّل كطباعة شيك |
| **استوديو واحد للثلاثة** | منتقي القالب يقرأ `BANK_CHEQUE_PROFILES` (الغلاف بلا قائمة خاصة)، وكل قالب معايِر يفتح الاستوديو الكامل: المصمّم والسحب/التحجيم/التدوير/الأسهم وخطوط المحاذاة وUndo-Redo ولوحة الخصائص وربط البيانات والمعاينة الحية والحفظ واستعادة الافتراضي والطباعة التجريبية وإزاحتَي الورقة |
| **مفاتيح المعايرة** | `cheque.calibration.gulf-a4.v1` · `cheque.calibration.kfh-a4.v1` · `cheque.calibration.nbk-a4.v1` — كل قالب يقرأ صفّه ويكتب مفتاحه ويستعيد أساسه، ويُعاد تركيبه على `bankCode` فلا تسرّب تحرير |
| **إعادة الاستخدام** | لا محرك طباعة ولا Renderer ولا استوديو معايرة ولا نظام تخزين جديد: `Bank Profile → Runtime Engine → ChequeRenderSurface/ChequeA4Sheet → Professional Calibration Studio → ChequeTemplatePrintPage → Print IPC` القائم |
| **Validation** | frontend `tsc --noEmit` ✅ · Frontend **180** ملف اختبار ✅ · المجموعات المستهدفة (السجل + المنتقي + مجموعات الخليج الثلاث) **126** اختبارًا ✅ · `build:front` ✅ |
| **اختبارات جديدة** | `multiBankChequeProfiles` (السجل والحالات والاستقلال البنيوي وحارس الطباعة) · `chequeStudioTemplateSelector` (المنتقي، فتح الاستوديو الكامل للثلاثة، توجيه الحفظ لكل مفتاح، عدم اختلاط المعايرات) |
| **الإصدار** | لا تغيير في `package.json` — حزمة frontend، **بلا إعادة بناء مثبِّت** |
| **متبقٍ** | عند وصول شيك كل بنك: تُعدَّل `chequeGeometry` و`placement` و`previewBackground` و`fields` و`status: 'APPROVED'` داخل مدخل ذلك البنك وحده، ثم الضبط من الاستوديو — بلا لمس المحرك |

---

## Previous Release — Gulf Bank A4 Cheque Template + Professional Calibration + Date Block v1

| Field | Value |
|-------|-------|
| **Package** | «قالب شيك الخليج» — قالب طباعة الشيك المقيس (180 × 90 مم) على ورقة A4 أفقية، مدمجًا في استوديو المعايرة الاحترافي القائم، مع إعادة بناء حقل التاريخ ككتلة واحدة |
| **Release status** | **RELEASED** — ثلاث حزم مُصدَرة معًا: **Gulf Bank A4 cheque template = RELEASED** · **Professional calibration integration = RELEASED** · **Date Block rebuild = RELEASED** |
| **Product Owner visual review** | **completed and approved** — المراجعة البصرية اليدوية تمت واعتُمدت قبل الدمج، بما فيها إصلاح التاريخ ككتلة واحدة؛ لا ملاحظات بصرية مانعة |
| **Pack commit** | `7080d1ed` |
| **Merge** | `2ea4aae8` — `--no-ff` merge of `feature/gulf-a4-cheque-template-calibration-v1` |
| **Tags** | `stable-gulf-a4-cheque-template-v1` → `2ea4aae8` · `checkpoint-gulf-a4-cheque-template-v1` → `60b4ada8` (production HEAD قبل الدمج مباشرةً) |
| **Schema / migration** | **لا شيء** — صفر ترحيل، صفر تغيير مخطط، صفر مفتاح صلاحية جديد، وصفر تعديل على أي سجل تاريخي |
| **هندسة الصفحة** | A4 Landscape `297 × 210 mm` — landscape بالأبعاد لا بالتدوير، هوامش صفر، مقياس 100% |
| **منطقة الشيك على A4** | `X = 117.0` · `Y = 60.0` · `W = 180.0` · `H = 90.0` مم — الحافة اليمنى للشيك على الحافة اليمنى للورقة تمامًا، وتوسيط رأسي `(210 − 90) / 2` |
| **إحداثيات الحقول (محلية بالمليمتر)** | المستفيد `8.0 / 23.5 / 108.0 / 7.0` · **كتلة التاريخ** `135.0 / 23.0 / 28.0 / 7.0` · التفقيط `10.0 / 33.0 / 105.0 / 16.0` · المبلغ رقمًا `132.0 / 40.0 / 38.5 / 8.5`. الإحداثيات المخزَّنة محلية دائمًا؛ موضع A4 مشتق: `final = chequeArea + fieldLocal + calibration` |
| **كتلة التاريخ** | حقل **واحد** (`chequeDate`) وخاناته الثلاث Internal Slots عند `0 / 9 / 18` مم داخله — فتُطبع عند `135 / 144 / 153` مم كما كانت. الخانة تحمل إزاحة أفقية وعرضًا فقط (لا y ولا ارتفاع ولا خط)، فالأرقام على خط أفقي واحد بالبناء؛ لا تحديد ولا إطار ولا مقابض لأي خانة، ولم يبقَ أي مفهوم Group في النظام |
| **المعايرة الاحترافية** | القالب وثيقة تُسلَّم لاستوديو المصمّم القائم فيرث قدراته كاملة (سحب/تحجيم/تدوير/أسهم/خطوط محاذاة/Undo-Redo/لوحة الخصائص/ربط البيانات/معاينة حية/طباعة تجريبية) + إزاحتا الورقة العامتان اللتان تحرّكان منطقة الشيك ولا تعيدان كتابة أي إحداثي حقل |
| **التخزين** | صفّ واحد في `settings`: `cheque.calibration.gulf-a4.v1` (group `cheques`) عبر `PUT /settings` القائم — بلا جدول ولا endpoint ولا migration. الافتراضي `0 / 0` و«استعادة الافتراضي» تعود للهندسة المقيسة |
| **قالب واحد فقط** | أُزيلت من مسار عمل الشيكات: Classic · قالب 178×89 · قالب A4 العام · قوالب المصمّم في قاعدة البيانات · منتقي «طريقة الطباعة» ومفتاح `cheques.defaultPrintProvider`. المعاينة والمعايرة والطباعة تعمل مباشرة على «قالب شيك الخليج» |
| **البيانات التاريخية** | **لم تُمس** — لا migration ولا تعديل جماعي. صفوف `cheque.template.<bank>` وجدول `cheque_designer_templates` ونسخ القوالب ووحدات الخلفية باقية كما هي فتبقى الشيكات القديمة قابلة للقراءة؛ لا سطح شيكات يقرأها بعد الآن. `printProfileKey` بلا تغيير |
| **إعادة الاستخدام** | لا محرك طباعة جديد ولا Renderer ولا محرك معايرة ولا نظام تخزين: `Gulf profile → Runtime Engine → ChequeRenderSurface / ChequeA4Sheet → ChequeTemplatePrintPage → Print IPC` القائم. التفقيط `amountToWordsKWD` وتنسيق المال `fmtChequeAmount` (KWD 3 منازل) وصيغة `DD / MM / YYYY` كلها من `buildChequeRuntimeData` |
| **المطبوع فعليًا** | التاريخ والمستفيد والمبلغ رقمًا والتفقيط **فقط**. لا شعار ولا اسم بنك/شركة ولا `KD`/`د.ك` ولا رقم شيك ولا MICR ولا خطوط ولا guides. صورة الشيك **Preview only** — شجرة الطباعة لا تحتوي عنصر صورة إطلاقًا |
| **الحذف** | `ChequeCalibrator` + `components/calibrator/*` · `utils/chequeGeometry.ts` · `chequeDesignerStore.ts` · `modules/chequePrint/resolveTemplate.ts` · محرك Classic وطبقته المخفية في `Cheques.tsx` · 10 مجموعات اختبار لقوالب لم تعد موجودة |
| **Validation** | frontend `tsc --noEmit` ✅ · backend `tsc --noEmit` ✅ · Frontend **178** ملف اختبار ✅ · مجموعات الخليج الثلاث **70** اختبارًا ✅ · `build:front` + `build:back` ✅ |
| **اختبارات جديدة** | `gulfBankChequeA4Profile` (هندسة A4 والمنطقة والإحداثيات المحلية والمطبوع) · `gulfBankA4Calibration` (القالب داخل الاستوديو، الحفظ/التحميل، الاستقلال عن الصفوف التاريخية) · `gulfDateBlockCalibration` (كيان تاريخ واحد، خط أساس واحد، سحب/أسهم/خصائص تحرّك الكتلة) |
| **الإصدار** | لا تغيير في `package.json` — حزمة frontend، **بلا إعادة بناء مثبِّت** |
| **متبقٍ لاختبار الطابعة** | قيمتا الإزاحة `X/Y` بعد طباعة اختبار واقعية (تُدخلان في الاستوديو وتُحفظان، بلا تغيير كود) · قرار معلّق: علامتا `#` حول المبلغ الرقمي (`#1,250.750#`) من منسّق المال المشترك |

---

## Previous Release — Financial Accuracy & KPI Integrity v1

| Field | Value |
|-------|-------|
| **Package** | Financial Accuracy & KPI Integrity v1 — أربع حزم مجمّعة تصحّح قيمًا مالية مؤكَّدة الخطأ، وتوحّد دلالات مؤشرات الأداء وتسمياتها، وتضبط الفلاتر والفترات وحالات الفشل، وتوحّد دقة الدينار وحساب الأيام والعتبات |
| **Release status** | **RELEASED** — Product Owner manual visual review **completed and approved** prior to merge; no blocking visual findings |
| **Pack commits** | `e693b1e3` Pack 1 · `b9055f7a` Pack 2 · `d5cb128e` Pack 3 · `71b48b89` Pack 4 |
| **Merge** | `ac7cb93d` — `--no-ff` merge of `fix/financial-accuracy-unified-v1` |
| **Tags** | `stable-financial-accuracy-kpi-integrity-v1` → `ac7cb93d` · `checkpoint-financial-accuracy-kpi-integrity-v1` → `f5b0f14f` (production HEAD قبل الدمج مباشرةً) |
| **Schema / migration** | **لا شيء** — صفر ترحيل، صفر تغيير مخطط، صفر مفتاح صلاحية جديد، وصفر تعديل على أي سجل تاريخي |
| **Pack 1 — قيم خاطئة مؤكَّدة** | بطاقة «حرج +90 يوم» كانت تعرض `0.000` د.ك بينما `24,586.000` متقادمة فعلًا — الفلتر كان على `dueDate` وحده وكل الفواتير تحمل `dueDate = NULL` و Prisma لا يطابق NULL بـ`lt`؛ صار `dueDate ?? issueDate` بعُرف تقرير أعمار الذمم نفسه · إجماليات مساحة التسوية البنكية كانت تعرض أرقام الملف الكامل فوق قائمة تحوي الصفوف المُدرجة وحدها (استيراد #36: `81,939.400` مقابل `1,500.100`)؛ فُصل حقلا الملف عن حقول المخزَّن · التقرير الشهري للفواتير كان يجمع 70 من 113 فاتورة (`680,868.000` د.ك = 65% من القيمة) في صف واحد بلا فترة لأن `billingYear` فارغ في المستورَد تاريخيًا؛ صار يرجع إلى `issueDate` **للعرض فقط** · فلترا البحث والمبلغ في التسوية كانا يتحدان بـOR بدل AND · بحث الموظفين كان يفلتر `'active'` والمخزَّن `'ACTIVE'` فيعيد فراغًا دائمًا · تقريران من ثلاثة بلا تنفيذ خلفي اكتملا، والثالث (`invoices-by-customer`) بقي مخفيًّا بانتظار قرار منتج |
| **Pack 2 — دلالات وتسميات فقط** | **لا معادلة تغيّرت.** «نسبة التحصيل» كانت اسمًا واحدًا لأربع صيغ؛ صارت: كفاءة التحصيل (CEI) · النسبة التراكمية · النسبة ضمن النطاق · نسبة تحصيل الفترة · «إجمالي المصروفات» كان مفتاحًا واحدًا للمعتمَدة تشغيليًا ولكل الحالات في صفحة المصروفات؛ فُصلا · مركز دونات الإيرادات كان يسمّي مجموع أعلى 5 عملاء «إجمالي الإيرادات» · مركز التحليل المالي §4 صار يعرض «رصيد أول المدة» الموجود في الحمولة أصلًا فتصير معادلة الرصيد الختامي مقروءة · أُضيف `docs/financial-kpi-definitions.md` كعقد مكتوب واختبار تسميات يمنع عودة اسم واحد لمعادلتين |
| **Pack 3 — فلاتر وفترات وحالات فشل** | بحث المصروفات صار يصل إلى البطاقات كما يصل إلى الجدول · بطاقة «مدفوع» في الرواتب لم تعد تتجاوز فلتر المستخدم · كشوف الحسابات والصيانة انتقلت من منتصف ليل UTC إلى حدود اليوم المحلي (كانت تُسقط أول ثلاث ساعات ومعظم اليوم الأخير بتوقيت الكويت) · تقرير الأرباح والخسائر لم يعد يوسّع نطاقًا جزئيًا إلى الشهر كاملًا · الصيانة الملغاة خرجت من «المستحقة» · `UnavailableValue` يمنع عرض `0.000` د.ك عند فشل الطلب، والبطاقات لم تعد تحتفظ بأرقام الفلتر السابق |
| **Pack 4 — دقة وتوحيد** | خمس عائلات تقريب في الواجهة توحّدت في `lib/money` المطابق لسياسة الخلفية · وحدة الكشوف البنكية والرصيد الافتتاحي للكشوف انتقلت إلى `roundMoney` · مبلغ المصروف صار يُطبَّع عند الكتابة كالشيكات والفواتير · ثلاث طرق لحساب الأيام المتبقية توحّدت في `core/utils/daysRemaining` (أمس `-1`، اليوم `0` طوال اليوم المحلي في الكويت، غدًا `+1`) — **العتبات نفسها لم تُوحَّد** · العتبات المكرّرة نُقلت إلى `config/thresholds` بأسماء تصف الغرض وبقيم مطابقة · عدّ المستخدمين صار من `meta.total` وثلاث قوائم منسدلة صارت تستخدم `fetchAllRows` بدل الاقتطاع الصامت عند 200 |
| **العقود المالية الثمانية** | +90 ageing `24,586.000` · Receivables `128,068.300` · Revenue (تشغيلي ↔ GL) `1,040,319.700` · Expenses (تشغيلي ↔ GL) `698,219.000` · Collections `912,251.400` · Monthly invoices `1,040,319.700` مع صفر صف بلا فترة · Bank recon #36 مخزَّن `1,500.100` مقابل ملف `81,939.400` (مفصولان عمدًا) · KWD precision صفر صف بأكثر من 3 منازل — **الثمانية PASS** |
| **قرارات مؤجَّلة (لم تُغيَّر وظيفيًا)** | `OVERDUE` — لا اشتقاق من التاريخ؛ `dueDate = NULL` في كل الفواتير يجعل الاشتقاق من `issueDate` قرار سياسة استحقاق · Payroll Bank Export `APPROVED/PAID` — لم يُمَس؛ يلزم أولًا حسم «إعادة تصدير ملف تاريخي» مقابل «ملف تحويل جديد» · `POTENTIAL_DUPLICATE` في أرصدة الحسابات البنكية — دلالتها «غير محسوم» بالبناء، فلم تُغيَّر الأرقام والتحذير موثّق في الكود |
| **نطاق الإصدار** | **73 ملفًا فقط**، كلها منسوبة إلى Packs 1–4. العمل السابق غير المرتبط الذي كان مختلطًا على فرع التطوير (22 ملفًا كاملًا + مقاطع داخل 5 ملفات + سكربتات وprobes ولقطات) **ليس جزءًا من هذا الإصدار** وبقي محفوظًا على `fix/financial-accuracy-hotfix-v1` |
| **Validation** | backend `tsc --noEmit` ✅ · frontend `tsc --noEmit` ✅ · Backend **3613** اختبارًا / 232 ملفًا ✅ · Frontend **4157** اختبارًا / 227 ملفًا ✅ · `build:back` + `build:front` ✅ |
| **اختبارات جديدة** | 15 ملفًا / نحو 160 اختبارًا، منها عقود Regression دائمة: `kpiParity.contract` (تكافؤ البطاقة مع المصدر المرجعي للمؤشرات السبعة) · `moneyParity` · `daysRemaining` · `kpiLabelSemantics` · `loadingErrorIntegrity` |
| **الإصدار** | لا تغيير في `package.json` — حزمة backend/frontend، بلا إعادة بناء مثبِّت |

---

## Previous Release — Multi-Bank Cheques Foundation v1

| Field | Value |
|-------|-------|
| **Package** | Multi-Bank Cheques Foundation v1 — تحويل هوية البنك في وحدة الشيكات من نص حر (`Cheque.bankName`) إلى بنية حقيقية `Bank → BankAccount → Cheque` |
| **Release status** | **RELEASED** — Product Owner manual visual review **completed and approved** prior to merge; no blocking visual findings |
| **Feature commit** | `c2de9a12` — `feat(cheques): add multi-bank cheques foundation v1` |
| **Merge** | `a684c66a` — `--no-ff` merge of `feature/multi-bank-cheques-foundation-v1` |
| **Tags** | `stable-multi-bank-cheques-foundation-v1` → `a684c66a` · `checkpoint-multi-bank-cheques-foundation-v1` → `c40d14ef` (production HEAD قبل الدمج مباشرةً) |
| **Schema / migration** | جدولان جديدان `banks` و`bank_accounts` + عمود `cheques.bankAccountId`. ترحيل واحد `20260821120000_multi_bank_cheques_foundation_v1`. **70 مجلد ترحيل**، `migrate status`: «Database schema is up to date»، وانحراف المخطط (drift) = صفر |
| **تفرّد رقم الشيك** | انتقل من عالمي إلى **لكل حساب بنكي**: `@@unique([bankAccountId, chequeNumber])`. الرقم 123456 مشروع في بنكين مختلفين لأنهما شيكان مختلفان. SQLite يعدّ `NULL` متمايزة داخل الفهارس الفريدة، فشيكات Legacy غير المربوطة يحرسها فحص خدمي ضمن نطاق `bankAccountId: null` نفسه |
| **رقم الشيك يدوي 100%** | Cheque numbers remain **manually entered** from the physical pre-printed cheque. لا ترقيم تلقائي، لا اقتراح «الرقم التالي»، لا زيادة تلقائية، ولا كيان `ChequeBook` في أي مسار |
| **Backfill** | بذر البنوك الكويتية العشرة بمعرّفات `code` ثابتة غير عربية (`GULF_BANK`/`NBK`/…) + حساب «الحساب الرئيسي» لبنك الخليج، ثم ربط شيكاته القديمة بمطابقة **حرفية محصورة** على `'بنك الخليج'` — لا `LIKE`، لا تقريب، لا تخمين. النتيجة الفعلية: 56/56 شيك مربوط، صفر غير مربوط، وصفر تغيير في أي رقم شيك أو مبلغ أو تاريخ أو حالة أو سجل طباعة |
| **Legacy hardening gate** | شيك قديم بلا `bankAccountId` **لا يُطبع لمجرد غياب الحساب**: يُسمح فقط إذا كان اسم بنكه النصي يطابق بنكًا له فعلًا حساب بقالب طباعة معتمد. بنك Legacy مجهول لا يُخمَّن ولا يُطبع بقالب بنك آخر. المرجعية مشتقّة من السجل (`loadPrintableBankNames`) لا من اسم بنك مكتوب في الشيفرة، وتُحمَّل كسولًا فلا استعلام إضافي في قاعدة مُرحَّلة بالكامل |
| **Gulf Bank print contract** | **UNCHANGED** — نفس Classic provider، نفس الأبعاد والإحداثيات والمعايرة والمعاينة والطباعة والطباعة الجماعية. لا Regression على أي شيك قديم |
| **حبر فقط عند الطباعة** | المخرَج على ورقة الشيك الحقيقية يقتصر على التاريخ والمستفيد والمبلغ الرقمي والتفقيط. **ممنوع** طباعة صورة الشيك أو شعار البنك أو الخلفية أو أي تصميم ورقي؛ الصور مرجع بصري للمعاينة والمعايرة فقط. مثبَّت باختبار `chequePrintNoBackground.test.tsx` على المسارين (Classic و Designer) |
| **البنوك الجديدة** | **Record-ready but NOT print-enabled** — يمكن إنشاء البنك والحساب وتسجيل شيكاته وتعديلها وإلغاؤها، والطباعة/المعاينة ممنوعتان حتى توفير نموذج الشيك الحقيقي والأبعاد الفعلية واعتماد القالب. خمس بوابات مستقلة: حارس الخادم في `markPrinted`/`reprint`، زر طباعة معطّل، طبقة `.cheque-print-only` لا تُركَّب أصلًا، `currentTemplate = null` بدل السقوط على `DEFAULT_TEMPLATE`، ورفض صريح للدفعة يسمّي أرقام الشيكات. **لا fallback إلى صورة أو مقاسات أو إحداثيات بنك الخليج بأي مسار** |
| **Bank statement matching** | صار **واعيًا بالحساب البنكي**: مرشّح واحد ⇒ يُطابَق (سلوك Legacy محفوظ)؛ عدة مرشّحين مع `accountKey` معروف ⇒ يُحصر في الحساب؛ التباس حقيقي ⇒ **لا اختيار** ويُعاد `ambiguousChequeNumbers` كتحذير صريح. القاعدة 5 (الرقم داخل الوصف) خضعت للحارس نفسه — كانت تدفع مرشّحًا لكل شيك يحمل الرقم فينتهي الترتيب باختيار أحدهما اعتباطًا |
| **UI** | صفحة «البنوك والحسابات» (`/banks`، ExplorerKit، عربية RTL) + استبدال قائمة البنوك المعطّلة في نموذج الشيك بمنتقي **الحساب البنكي** يُحمَّل من البيانات الفعلية. العرض «اسم البنك — اسم الحساب» فقط: **لا رقم حساب ولا IBAN** في نموذج الشيك ولا في الـAPI. حساب نشط واحد ⇒ يُحدَّد تلقائيًا |
| **Permissions / Audit** | مفتاحان جديدان `banks.read` / `banks.manage` يُزامَنان **داخل الـmigration نفسه** (مسار `prisma migrate deploy` التلقائي عند بدء الخدمة) لا عبر إعادة بذر يدوية، ويُمنحان لـ`SYSTEM_ADMIN`/`GENERAL_MANAGER`/`ACCOUNTANT`. تدقيق كامل لإنشاء/تعديل/تفعيل/إيقاف البنوك والحسابات وتغيير الحساب البنكي المرتبط بشيك (`ACTIVATE`/`DEACTIVATE` كإجراءين مستقلين لا `UPDATE` عام) |
| **خارج النطاق صراحةً** | **No GL integration** (لا قيد، لا `journal_entry`، لا مساس بالحساب `1010`) · **No ChequeBook** · **No automatic cheque numbering** · **Multi-Bank Print Profiles = future phase** (لا معايرة ولا مصمّم متعدد البنوك، ولا أبعاد أو قوالب افتراضية لأي بنك جديد) · لا تنظيف لـ`PrintedCheque` أو `ProfessionalFormTemplate` · وحدة `bankAccounts` القائمة (`/api/bank-accounts`، عرض مشتق من كشوف البنوك) لم تُمسّ — السجل الجديد على `/api/banks/*` والجسر بينهما `statementAccountKey` الاختياري |
| **Validation** | backend `tsc --noEmit` ✅ · frontend `tsc --noEmit` ✅ · electron `tsc --noEmit` ✅ · `prisma validate` ✅ · `prisma migrate status` 70/70 مطبّقة، drift صفر ✅ · Backend **3512** اختبارًا / 218 ملفًا (2 متخطّى مسبقًا) ✅ · Frontend **4109** اختبارًا / 225 ملفًا ✅ · `build:back` + `build:front` ✅ |
| **اختبارات جديدة** | 41 اختبارًا: `cheques.multiBank` (27، شاملة Legacy hardening gate) · `banks.service` (17) · `banks.migration` (22 عقدًا على SQL الترحيل نفسه) · `chequeAccountSelection` (15) · `chequePrintNoBackground` (6) · 5 في المطابق متعدد البنوك. عقد Regression لبنك الخليج (`chequePrintDeterministicGeometry`, `chequePrintInkIsolation`, `chequeClassicBatchPrinting`) أخضر بلا إضعاف أي تأكيد |
| **الإصدار** | لا تغيير في `package.json` — حزمة backend/frontend، بلا إعادة بناء مثبِّت |
