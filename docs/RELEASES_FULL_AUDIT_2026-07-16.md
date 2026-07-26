# التقرير الشامل لجميع إصدارات نظام المنار (manarERP)
### من بداية المشروع (2026-06-06) حتى أحدث إصدار (2026-07-16)

---

## 1) المنهجية — كيف بُني هذا التقرير

هذا التقرير **لا يعتمد على أي تقرير سابق أو على الذاكرة**. بُني بالكامل من فحص مباشر للمشروع نفسه، عبر:

1. **Git كمصدر الحقيقة النهائي**: تفريغ كامل لكل الوسوم (449 tag)، الفروع (المحلية والبعيدة)، وسجل الـ commits (1132 commit)، مرتّبة زمنيًا، مع فحص أي فرع لم يُدمج في `production` (`git branch --no-merged production`) وأي وسم `pre-*`/`checkpoint*` لا يقابله وسم `stable-*` — لتحديد الأعمال المهجورة/المعلّقة فعليًا بدل الاعتماد على الوصف النصي فقط.
2. **`PROJECT_STATE.md`** (جذر المشروع، 2579 سطر) — سجل التطوير التفصيلي، قُرئ بالكامل واستُخرجت منه كل الإصدارات مع الهدف/المنفَّذ/غير المنفَّذ/الملاحظات المتبقية.
3. **`PROJECT_MASTER_STATUS.md`** (جذر المشروع، 703 سطر) — وثيقة "مصدر الحقيقة الرسمي" المُعاد بناؤها مباشرة من Git بتاريخ 2026-07-01 (تغطي 220 من أصل 303 وسم مستقر)، تحتوي تصنيفًا موضوعيًا دقيقًا ومطابقة استدلال حالة كل ميزة (منفَّذ/جزئي/مستقبلي/مُلغى) — استُخدمت كمرجع تحقّق أساسي لأنها تُقارن صراحة الوثائق بالكود.
4. **`docs/PROJECT_HISTORY_FULL.md`** (820 سطر) — للتحقق من الإصدارات الأولى (الأيام الثلاثة الأولى 2026-06-06 إلى 2026-06-10).
5. **47 ملف خطة** في `docs/superpowers/plans/` — قُرئت جميعها لاستخراج الهدف المعلن ونطاق الاستثناء/التأجيل لكل خطة.
6. **4 ملفات مراجعة Gemini** في `docs/gemini-review/`، وملف roadmap واحد (`SmartTransactionPresentationEngine-Phase1.md`)، ووثيقة سير العمل (`MULTI_AGENT_WORKFLOW.md`).
7. **12 وثيقة تدقيق/مراجعة جذرية** في `docs/` (مراجعة معمارية شاملة، جرد النماذج المطبوعة، تدقيق التسعير، تدقيق الصيانة، تدقيق إعادة تصميم الواجهة، تدقيق حدود الأخطاء، جاهزية مستكشف البنك التاريخية، مخاطر ترحيل البيانات التاريخية، اختبار الدخان بعد الدمج، قرار معماري ADR-001، معمارية المساعد الذكي، تقرير اختبار قبول المستخدم).

كل بند "معلَّق/مؤجَّل/ملغى" أدناه تم **التحقق منه في الكود أو في Git مباشرة** وليس فقط نقله من نص الوثائق (مثال: تأكدنا عبر `git merge-base --is-ancestor` أن فرع النسخ الاحتياطي إلى Google Drive لم يُدمج فعليًا في `production`، وتأكدنا أن ملف `Documents.tsx` غير موجود في `production` حاليًا رغم وجود commit يضيفه).

---

## 2) لمحة عامة على المشروع

| المقياس | القيمة |
|---|---|
| نافذة التطوير | 2026-06-06 → 2026-07-16 (**~40 يومًا**) |
| إجمالي الـ commits على كل الفروع | **1,132** |
| إجمالي الوسوم (tags) | **449** |
| وسوم **stable-*** (إصدارات مكتملة فعليًا) | **303** |
| وسوم **pre-*** / **checkpoint*** (نقاط تفتيش قبل البدء) | **126 + 19** |
| الفروع غير المدموجة في `production` حاليًا | **6** (انظر القسم 4) |
| معدّل إكمال دورة "نقطة تفتيش → إصدار مستقر" | **~100%** — كل نقطة تفتيش تقريبًا انتهت بوسم `stable-*` مطابق (تم فحص 19 حالة بدت "يتيمة" ظاهريًا؛ تبيّن أن جميعها انتهت بإصدار فعلي تحت اسم مختلف عند الدمج، باستثناء الحالات الموثّقة في القسم 4) |
| نمط سير العمل المتّبع بانضباط طوال المشروع | فرع ميزة → وسم `pre-*` (نقطة رجوع) → تنفيذ → تحقّق (`tsc`×3 + `prisma validate` + `vitest` + builds×3) → مراجعة Gemini → دمج `--no-ff` → وسم `stable-*` → تحديث `PROJECT_STATE.md` |

**الخلاصة الأهم من فحص Git المباشر:** هذا مشروع **عالي الانضباط** — كل عمل بدأ فعليًا (نقطة تفتيش) انتهى بإصدار مُدمج، ما عدا 4-5 استثناءات موثّقة صراحة في القسم 4 (ولاء من نوع "أُلغي عمدًا" وليس "نُسي"). لا توجد فروع "معلّقة منسية" بالمعنى السلبي — كل حالة معلّقة موثّقة بسبب واضح في كود المشروع نفسه أو في `PROJECT_MASTER_STATUS.md`.

---

## 3) الإصدارات — مصنّفة حسب المحور الوظيفي (Epic)، بالترتيب الزمني داخل كل محور

> **ملاحظة على الحالة:** كل وسم أدناه له مقابل `stable-*` في Git ما لم يُذكر خلاف ذلك صراحة، وبالتالي حالته الافتراضية **"مُصدَر/Released"**. الرمز ⬛ يعني "استُبدل لاحقًا بمرحلة أحدث ضمن نفس السلسلة" (تراكمي وليس فشلًا). أي حالة أخرى (معلّق/جزئي) مذكورة صراحة.

### 3.1 الأساس والمنصة (Platform / Foundation)

| التاج | التاريخ | الوصف |
|---|---|---|
| `stable-dashboard-electron` ⬛ | 2026-06-07 | أول تشغيل ناجح لـ Electron + إصلاح مُشغّل بدء التشغيل |
| `stable-manarerp-v1` ⬛ | 2026-06-07 | إعداد Prettier — خط الأساس الأول للمشروع |
| `stable-dev-backend-watch` | 2026-06-07 | Hot-reload للباك-إند في وضع التطوير داخل Electron |
| `stable-test-coverage-foundation-v1` | 2026-06-10 | تأسيس تغطية اختبارات TDD (payroll, accounting, tafqeet) |
| `stable-full-operational-reset-v1` | 2026-06-13 | إعادة ضبط كاملة لقاعدة البيانات التشغيلية (مع الحفاظ على إعدادات النظام ودليل الحسابات) |
| `stable-stability-performance-pack-v1` | 2026-07-02 | `RootErrorBoundary` (مستوى التطبيق+الصفحة، تعافٍ تلقائي عند التنقل) + تقسيم ~55 مسار عبر `React.lazy` — تقليل حجم JS الابتدائي من 3.25MB إلى ~356KB (−89%) |
| `stable-test-console-hygiene-v1` | 2026-07-12 | إزالة قمع `console.warn` كان يُخفي تحذيرات React عن الاختبارات؛ تحذيرات `act()` من 46 إلى 0 |
| `stable-react-router-relative-splat-readiness-v1` | 2026-07-12 | تفعيل علم `v7_relativeSplatPath` (المشروع لا يستخدم تنقلاً نسبيًا، فالتأثير معدوم فعليًا) |
| `stable-recharts-initial-dimension-stabilization-v1` | 2026-07-12 | إصلاح تحذير أبعاد Recharts الأولية (`{width:-1,height:-1}`) على 15 حاوية رسم بياني |
| `stable-react-router-start-transition-readiness-v1` | 2026-07-12 | تفعيل `v7_startTransition` — تقليل وميض `PageLoader` عند التنقل؛ وصلت كل التحذيرات المعروفة إلى صفر |
| `stable-core-runtime-completion-roadmap-reconciliation-v1` | 2026-07-12 | **إصدار تصالح شامل** عبر 6 مسارات عمل: تفعيل محرك الموافقات الخامل، تفعيل البحث الشامل (كان شكليًا)، مطابقة بطاقات "قريبًا" مع الواقع الفعلي، إغلاق الفجوة الأخيرة في قفل الفترة المالية، إغلاق مسارات تصدير PDF المتبقية ذات "الإطار الأسود" |
| `stable-agents-governance-alignment-v1` | 2026-07-15 | توثيق معمارية التنسيق (Vanilla CSS أساسي، Tailwind محصور بـ shadcn)؛ إدخال سياسة "تجاوز موافقة Gemini" الصريحة داخل المحادثة |

### 3.2 المحاسبة والمالية (Accounting & Finance)

| التاج | التاريخ | الوصف |
|---|---|---|
| `stable-accounting-v1` ⬛ | 2026-06-07 | دليل الحسابات + القيود اليومية (أول نسخة) |
| `stable-accounting-v2-f7d8dda` | 2026-06-07 | إصلاح مسار قاعدة بيانات الإنتاج + توحيد تواريخ الحضور |
| `stable-financial-safety-tests-phase1-v1` | 2026-06-14 | اختبارات أمان مالي للفواتير والمخزون |
| `stable-accounting-integration-phase1-v1` | 2026-06-16 | ربط فواتير الشراء بالترحيل المحاسبي (كانت تتجاوز الترحيل بصمت) |
| `stable-accounting-integration-phase2-expenses-v1` | 2026-06-17 | ترحيل المصروفات المعتمدة إلى دفتر الأستاذ (قيد مزدوج) مع الإلغاء والعكس |
| `stable-financial-integrity-pack-v1` | 2026-06-17 | حزمة سلامة مالية |
| `stable-unified-financial-completion-pack-v1` | 2026-06-17 | حزمة إكمال مالي موحّدة |
| `stable-financial-receivables-phase1-v1` | 2026-06-21 | كشف حساب العميل، أعمار الذمم، أرصدة العملاء، ملخص التحصيلات |
| `stable-contract-profitability-phase1-v1` | 2026-06-21 | لوحة ربحية العقود (إيراد/مصروف/ربحية لكل عقد) |
| `stable-accounting-completeness-h1-v1` | 2026-06-23 | ترحيل دفعات فواتير الشراء لدفتر الأستاذ (مدين ذمم/دائن نقد أو بنك) مع العكس |
| `stable-statement-center-phase1-v1` | 2026-06-24 | محرك كشوف حساب مشترك للعملاء والموردين |
| `stable-financial-center-phase2-v1` | 2026-06-24 | تقرير الأستاذ العام، ميزان المراجعة، تقرير الأعمار، دفتر اليومية، لوحة مالية موحّدة |
| `stable-financial-workflow-suite-phase2-v1` | 2026-06-27 | حفظ تلقائي للشيك + سند دفع/قبض عديم الحالة (ترقيم تسلسلي ذري) + إصلاحات تزامن بعد مراجعة Gemini |
| `stable-critical-financial-bugs-c1-c4-v1` | 2026-07-03 | **إصلاح 4 أخطاء مالية حرجة**: C1 ازدواج تسوية فواتير الشراء النقدية، C2 ساعات إضافية وهمية عند التأخير، C3 خصم السلف عبر كل الرواتب المفتوحة، C4 عكس المصروف يمسح المعاملة القديمة |
| `stable-financial-center-professional-refresh-v1` | 2026-07-10 | تحديث احترافي لواجهة المركز المالي |
| `stable-historical-financial-readiness-v1` | 2026-07-10 | تمكين ترحيلات بتاريخ سابق (2024/2025) دون تلويث أرقام السنة الحالية؛ قفل فترة من جانب الخادم |
| `stable-money-rounding-invariant-hardening-v1` | 2026-07-13 | توحيد 14 دالة تقريب متضاربة في `money.ts` واحدة؛ تشديد قاعدة توازن القيد المحاسبي |

### 3.3 التقارير (Reports)

| التاج | التاريخ | الوصف |
|---|---|---|
| `stable-reports-center-v1` ⬛ | 2026-06-07 | 9 أنواع تقارير، تصدير ExcelJS/PDFKit |
| `stable-export-standardization-pack-v1` | 2026-06-17 | توحيد أزرار وأعمدة تصدير Excel |
| `stable-unified-report-engine-phase3-v1` | 2026-06-25 | تفكيك `html.service.ts` إلى 7 وحدات قوالب نقية، أنواع Watermark/Branding |
| `stable-reports-center-phase7-v1` | 2026-06-28 | تحديث واجهة مركز التقارير |
| `stable-universal-export-file-naming-v1` | 2026-07-07 | معيار تسمية ملفات موحّد `manarERP_<التقرير>_<المعرّف>_<التاريخ>` عبر ~25 موقع تصدير |
| `stable-unified-excel-export-professional-standard-v1` | 2026-07-08 | محرك Excel احترافي مشترك (~25 تصدير تمت ترقيته دون تغيير الاستدعاء) |
| `stable-invoice-report-presentation-refinement-v1` | 2026-07-14 | تحسين عرض تقرير الفواتير |
| `stable-pl-report-monthly-summary-alignment-v1` | 2026-07-14 | محاذاة الملخص الشهري لتقرير الأرباح والخسائر |

### 3.4 لوحة التحكم التنفيذية (Dashboard / Executive)

| التاج | التاريخ | الوصف |
|---|---|---|
| `stable-executive-dashboard-v2` ⬛ | 2026-06-07 | نقطة نهاية موحّدة `/dashboard/executive`، بطاقات KPI، رسوم Recharts |
| `stable-executive-dashboard-v3a-lite-v1` ⬛ | 2026-06-12 | تحسين لوحة تنفيذية v3a خفيفة |
| `stable-dashboard-flicker-hotfix-v1` | 2026-06-21 | إصلاح وميض اللوحة |
| `stable-executive-intelligence-bundle-phase1-v1` | 2026-06-21 | بطاقات KPI تنفيذية، تنبيهات، توقّع مالي |
| `stable-executive-intelligence-bundle-phase2-v1` | 2026-06-21 | لوحة ذكاء تنفيذي V2 (مقارنة KPI، اتجاه الإيراد الشهري، متتبّع صحة العقود) |
| `stable-executive-decision-center-phase1-v1` | 2026-06-22 | مركز القرار التنفيذي: 8 KPI، 8 بطاقات قرار، تنبيهات V3، نقاط صحة الشركة (0-100) |
| `stable-dashboard-financial-fix-v1` | 2026-06-27 | إصلاح خطأ HTTP 400 في تبويب "مالي" (أسماء جداول SQLite خاطئة في `$queryRaw`) |
| `stable-executive-dashboard-polish-phase1-v1` | 2026-07-01 | شريط "ملخص اليوم" التنفيذي |
| `stable-executive-command-center-dashboard-v1` | 2026-07-04 | إعادة تصميم اللوحة الرئيسية كـ "مركز قيادة تنفيذي" قائم على سجل أقسام (registry) |
| `stable-executive-command-center-evolution-v1` | 2026-07-08 | إصلاح جذري: "يناير مفقود" (تحيّز 6 أشهر متتالية)، التوقّع=صفر، توزيع الإيراد فارغ، تباين الوضع الفاتح |
| `stable-dashboard-executive-polish-v1` | 2026-07-09 | إصلاح صياغة YTD، تسميات الأشهر بالعربية، تباين خطوط الشبكة |
| `stable-executive-dashboard-cohesion-v1` | 2026-07-10 | حزمة تماسك بصري للوحة التنفيذية |
| `stable-kpi-cards-typography-overflow-v1` | 2026-07-14 | تقليص خط بطاقات القيم المالية الكبرى، توسيع عرض الأعمدة (الجذر الحقيقي للمشكلة كان حجم الشبكة لا الخط) |
| `stable-dashboard-retry-loader-v1` (الأحدث) | 2026-07-16 | استبدال زر إعادة المحاولة برأس اللوحة بمؤشر تحميل SVG |

### 3.5 الأمان / RBAC / النسخ الاحتياطي / التدقيق (Security / RBAC / Backup / Audit)

| التاج | التاريخ | الوصف |
|---|---|---|
| `stable-backup-restore-v1` | 2026-06-07 | نسخ احتياطي/استعادة عبر IPC، جدولة node-cron |
| `stable-roles-permissions-v1` | 2026-06-07 | RBAC كامل: 7 أدوار، ~100 صلاحية، تجاوز SYSTEM_ADMIN |
| `stable-audit-log-viewer-v1` ⬛ | 2026-06-09 | عارض سجل التدقيق (أول نسخة) |
| `stable-auto-backup-phase1-v1` | 2026-06-14 | نسخ احتياطي تلقائي يومي (node-cron)، سياسة احتفاظ، تعويض عند بدء التشغيل |
| `stable-auto-backup-enhancements-phase1-v1` | 2026-06-14 | إعدادات نسخ احتياطي قابلة للتهيئة + تتبّع الحالة |
| `stable-jwt-secret-hardening-v1` | 2026-06-14 | تحصين إدارة مفتاح JWT السرّي |
| `stable-audit-log-viewer-phase1-v1` | 2026-06-15 | تحسين عارض سجل التدقيق (بحث، فلترة مستخدم، ملخص) |
| `stable-critical-hardening-sprint1-v1` | 2026-06-21 | سبرنت تحصين أمني/استقرار شامل |
| `stable-stabilization-audit-sprint1-v1` | 2026-06-21 | 20 إصلاحًا حرجًا/عاليًا/متوسطًا عبر وحدات متعددة |

### 3.6 الرواتب / الحضور (Payroll / Salaries / Attendance)

| التاج | التاريخ | الوصف |
|---|---|---|
| `stable-payroll-system-v1` | 2026-06-08 | نظام رواتب متكامل: توليد شهري، بدلات، خصومات، سلف، موافقة، صرف، قسيمة راتب |
| `stable-attendance-ui-completion-v1` | 2026-06-10 | واجهة حضور كاملة (CRUD، بحث، فلاتر) |
| `stable-attendance-pagination-v1` | 2026-06-11 | ترقيم صفحات من جانب الخادم للحضور |
| `stable-employee-financial-payroll-tab-v1` | 2026-07-06 | تبويب "المالية" في درج الموظف — للقراءة فقط |
| `stable-historical-salary-transfer-register-fix-v1` | 2026-07-11 | عرض تحويلات الرواتب التاريخية المستوردة ضمن عرض شهر الرواتب |
| `stable-salaries-correctness-fix-pack-v1` | 2026-07-09 | إزالة طرق دفع غير مدعومة (شيك/تحويل) كانت تسبب فشل Zod صامت + نقطة نهاية جديدة لإحصاءات صحيحة زمنيًا |

### 3.7 المعدات / الصيانة / المخزون (Equipment / Maintenance / Inventory)

| التاج | التاريخ | الوصف |
|---|---|---|
| `stable-inventory-phase-a-v1` ⬛ | 2026-06-08 | أساس المواد والفئات |
| `stable-inventory-phase-b-v1` ⬛ | 2026-06-08 | أوامر الشراء وسندات الاستلام |
| `stable-inventory-phase-c-v1` ⬛ | 2026-06-08 | سندات صرف المواد |
| `stable-inventory-system-v1` | 2026-06-08 | الواجهة الكاملة للمخزون (تجميع المراحل A/B/C) |
| `stable-equipment-maintenance-ui-v1` | 2026-06-10 | واجهة إدارة صيانة المعدات |
| `stable-maintenance-completion-v1` | 2026-06-10 | إكمال وحدة الصيانة (CRUD كامل، بحث، فلاتر) |
| `stable-equipment-plate-integration-phase1-v1` | 2026-06-12 | ربط لوحة المعدة |
| `stable-equipment-force-delete-phase1a-v1` | 2026-06-13 | حذف قسري بصلاحية SYSTEM_ADMIN |

### 3.8 العملاء / الموردون / العقود / الأسعار (Customers / Suppliers / Contracts / Prices)

| التاج | التاريخ | الوصف |
|---|---|---|
| `stable-contract-unit-price-company-v1` | 2026-06-10 | حقول اسم الوحدة/السعر/اسم الشركة في العقد |
| `stable-project-prices-phase1-v1` | 2026-06-10 | وحدة أسعار المشاريع الجديدة (قاعدة بيانات تسعير مستقلة) |
| `stable-project-prices-phase2a-v1` | 2026-06-11 | منع اقتطاع منتقي السعر |
| `stable-project-prices-phase2b-v1` | 2026-06-11 | نقطة نهاية بحث الأسعار |
| `stable-project-prices-phase2c-v1` | 2026-06-12 | تحسين تدفّق منتقي سعر الفاتورة |
| `stable-project-prices-phase3-v1` | 2026-06-12 | تعبئة تلقائية ذكية لسعر الفاتورة |
| `stable-prices-lookup-cleanup-v1` | 2026-06-12 | إزالة نقطة نهاية بحث غير مستخدمة |
| `stable-contracts-price-binding-v1` | 2026-06-12 | ربط السعر بالعقد وظهوره للعميل |
| `stable-archive-override-phase1a-v1` | 2026-06-12 | خيار أرشفة عند منع حذف سجلات مرتبطة |
| `stable-customer-force-delete-phase1b-v1` | 2026-06-13 | حذف قسري للعملاء (SYSTEM_ADMIN) |
| `stable-suppliers-force-delete-phase2a-v1` | 2026-06-13 | حذف قسري للموردين بحماية ثلاثية |
| `stable-contracts-force-delete-phase2b-v1` | 2026-06-13 | حذف قسري للعقود مع حماية الفواتير |
| `stable-prices-force-delete-phase2c-v1` | 2026-06-13 | حذف قسري للأسعار |
| `stable-agreements-refactor-phase1-v1` | 2026-06-16 | إعادة تسمية واجهة العقود إلى "الاتفاقيات" + إعادة ترتيب التنقل + لوحة إحصاءات |
| `stable-agreements-refactor-phase2-v1` | 2026-06-17 | ربط بند الفاتورة بسعر المشروع للتتبع الفعلي للاستخدام |
| `stable-customer-quality-pack-v1` | 2026-06-17 | تنظيف الخادم + فهرس مركّب لقاعدة البيانات |
| `stable-pricing-unit-mualajat-v1` | 2026-07-08 | إضافة وحدة تسعير "معالجات" |
| `stable-project-prices-force-delete-phase2c` | (مضمّن أعلاه) | — |

### 3.9 الفواتير والمصروفات (Invoices & Expenses)

| التاج | التاريخ | الوصف |
|---|---|---|
| `stable-invoice-unit-options-custom-v1` | 2026-06-15 | وحدات فاتورة مخصصة |
| `stable-invoice-date-billing-month-v1` | 2026-06-15 | تاريخ الفاتورة، فترة الفوترة، قائمة بادئة قابلة للتحرير |
| `stable-invoice-edit-delete-v1` | 2026-06-15 | تحرير وحذف الفاتورة |
| `stable-invoice-preview-print-page-v1` | 2026-06-15 | صفحة معاينة وطباعة الفاتورة |
| `stable-invoice-preview-print-hotfix-v1` | 2026-06-15 | إصلاح عاجل لصفحة طباعة فارغة ثانية |
| `stable-invoice-preview-cleanup-v1` | 2026-06-15 | تبسيط تخطيط معاينة الطباعة |
| `stable-invoice-force-delete-v1` | 2026-06-15 | تدفّق حذف قسري للفاتورة |
| `stable-invoice-ux-improvements-v1` | 2026-06-16 | 6 إصلاحات مستهدفة: فلترة السعر حسب العميل، تنظيف الأزرار |
| `stable-invoice-conflict-hotfix-v1` | 2026-06-16 | حل تعارض P2002 الوهمي عند إنشاء الفاتورة |
| `stable-invoice-journal-entry-collision-hotfix-v1` | 2026-06-16 | إصلاح تصادم رقم القيد |
| `stable-legacy-transaction-entry-number-hotfix-v1` | 2026-06-16 | إصلاح ترقيم المعاملة القديمة |
| `stable-invoice-ux-enhancement-phase2-v1` | 2026-06-16 | تحسين تجربة استخدام الفاتورة — المرحلة 2 |
| `stable-kuwait-locations-recent-usage-v1` | 2026-06-16 | كتالوج مواقع الكويت + إكمال تلقائي للاستخدام الأخير |
| `stable-invoice-customer-price-filter-v1` | 2026-06-17 | فلترة السعر حسب العميل |
| `stable-expenses-enhancement-phase-a-v1` | 2026-06-17 | حزمة جودة/تجربة استخدام للمصروفات — المرحلة A |
| `stable-invoice-collection-print-cheque-image-pack-v1` | 2026-06-18 | طباعة تحصيل الفاتورة + صورة الشيك |
| `stable-invoice-expenses-operations-pack-v1` | 2026-06-23 | رسائل تعارض FK غنية، بطاقات إحصاء فترة للمصروفات |
| `stable-expenses-reliability-usability-v1` | 2026-07-07 | إصلاح تصادم كود المصروف (كان يستخدم `count()` بدل أعلى تسلسل) |
| `stable-expenses-operations-enhancement-v1` | 2026-07-07 | حذف قسري SYSTEM_ADMIN للمصروفات + إدخال شهري سريع |
| `stable-invoice-fast-entry-mode-v1` | 2026-07-07 | وضع "إدخال سريع" لإصدار فواتير متتالية (عميل واحد/عملاء متعددون) |
| `stable-expenses-governance-classification-v1` | 2026-07-09 | تعديل آمن للمصروف المعتمد مع أثر تدقيق `EXPENSE_REVERSAL` |
| `stable-invoice-governance-collection-date-safety-v1` | 2026-07-09 | منع تعديل الفاتورة المدفوعة من جانب الخادم؛ إجراء منفصل لتعديل تاريخ التحصيل |
| `stable-invoice-collection-date-v1` | 2026-07-08 | تاريخ تحصيل الفاتورة (اعتماد `Payment.date` الموجود بدل عمود جديد) |
| `stable-collection-date-correction-v1` | 2026-07-08 | تصحيح تاريخ التحصيل التاريخي (SYSTEM_ADMIN فقط) + شيك كطريقة افتراضية |
| `stable-invoice-editor-consolidation-v1` (الأحدث) | 2026-07-16 | إعادة هيكلة: `Invoices.tsx` من 1694 إلى 597 سطرًا، توحيد محرري بنود الفاتورة المكررين |

### 3.10 الشيكات (Cheques)

| التاج | التاريخ | الوصف |
|---|---|---|
| `stable-cheques-management-v1` ⬛ | 2026-06-08 | إنشاء/طباعة/إلغاء الشيكات (أول نسخة) |
| `stable-cheques-management-v1.1` | 2026-06-08 | إصلاح قبول الحقول الاختيارية |
| `stable-cheques-enhancement-phase1-v1` | 2026-06-09 | حارس الطباعة + آلة حالة الشيك + تدقيق |
| `stable-cheques-tafqeet-v1` | 2026-06-09 | تحويل المبلغ الرقمي إلى تفقيط عربي (متطلب قانوني للشيكات الكويتية) |
| `stable-cheques-improvements-v1` | 2026-06-09 | تحقّق Zod للعملة/التاريخ/الرقم + 10 بنوك كويتية كقائمة منسدلة |
| `stable-cheques-print-output-v1` | 2026-06-09 | طباعة على ورق بنك الخليج الفعلي (**المعايرة الفيزيائية أُجّلت — كانت تحتاج ورق شيك حقيقي**) |
| `stable-gulf-bank-cheque-calibration-v1` | 2026-06-11 | معايرة طباعة الشيك على قالب بنك الخليج |
| `stable-cheques-professional-calibration-pack-v1` | 2026-06-18 | حزمة معايرة احترافية |
| `stable-cheques-calibration-ux-phase2-v1` | 2026-06-18 | تكبير/تصغير، أسهم، خطوط إرشادية، تصدير/استيراد |
| `stable-cheques-force-delete-print-fix-v1` | 2026-07-02 | إصلاح صفحة طباعة فارغة ثانية + حذف قسري SYSTEM_ADMIN |
| `stable-cheques-preview-presentation-refinement-v1` | 2026-07-10 | تنقيح عرض معاينة الشيك |
| `stable-cheque-professional-reliability-calibration-studio-v1` | 2026-07-10 | استوديو معايرة احترافي: مساعد قياس، تراكب شبح، درجة ثقة، معالج معايرة |
| `stable-cheque-calibration-edge-ruler-v1` | 2026-07-11 | مسطرة رباعية الحواف + مرساة حافة التغذية + علامة مركز (إصلاح جذر: المخطط كان يُرسم من الحافة الخاطئة) |
| `stable-cheque-calibration-geometry-response-hardening-v1` | 2026-07-12 | إصلاح قبول مصفوفة فارغة `[]` كهندسة صالحة (تسبب بقيم NaN في 9 خصائص SVG) |
| `stable-cheque-calibration-test-preview-overlay-v1` | 2026-07-13 | معاينة داخل التطبيق قبل طباعة ورقة اختبار المعايرة (بدل الطباعة الفورية) |

### 3.11 النماذج ووثائق الموارد البشرية (Forms / HR Documents)

| التاج | التاريخ | الوصف |
|---|---|---|
| `stable-forms-phase1a-salary-certificate-v1` | 2026-06-13 | شهادة راتب |
| `stable-forms-phase1b-v1` | 2026-06-13 | نماذج رسمية إضافية |
| `stable-forms-print-layout-hotfix-v1` | 2026-06-14 | إصلاح تخطيط طباعة A4 |
| `stable-forms-single-page-print-hotfix-v1` | 2026-06-14 | تقييد الطباعة بصفحة A4 واحدة |
| `stable-forms-header-footer-cleanup-v1` | 2026-06-15 | تنظيف الترويسة/التذييل |
| `stable-employment-contract-form-v1` | 2026-06-18 | عقد عمل ثنائي اللغة (16 مادة، صفحتان) لهيئة القوى العاملة الكويتية |
| `stable-employment-contract-article7-print-fix-v1` | 2026-06-19 | إبقاء المادة 7 كاملة في الصفحة الثانية |
| `stable-employment-contract-two-page-layout-v1` | 2026-06-19 | تخطيط طباعة صريح من صفحتين |
| `stable-print-profiles-forms-completion-v1` | 2026-06-19 | سجل ملفات طباعة (`plain-a4`, `letterhead`) لـ 8 نماذج موارد بشرية |
| `stable-forms-completion-pack-phase1-v1` | 2026-06-19 | حقول إنجليزية لعقد العمل، حقول طباعة لسلفة الراتب |
| `stable-forms-polish-pack-v2` | 2026-06-20 | مسودة طباعة، سجل طباعة، أزرار ترجمة |
| `stable-forms-operations-polish-v3` | 2026-06-20 | نموذج عرض سعر وطلب شراء مستقلان، تحسينات على 8 نماذج |
| `stable-company-letterhead-two-page-print-v1` | 2026-07-06 | إصلاح انسكاب ورق الترويسة الرسمية إلى صفحة ثانية |
| `stable-employment-contract-new-employee-print-only-v1` | 2026-07-12 | استعادة زر طباعة كان معطّلاً بالخطأ حتى اختيار موظف |
| `stable-forms-pdf-standalone-export-v1` | 2026-07-03 | تصدير PDF كمستند HTML مستقل (إصلاح إطار أسود كان يظهر بسبب واجهة العمل الحية) |

### 3.12 محرك الطباعة / استوديو القوالب / مصمم القوالب (Print Engine / Template Studio / Designer)

هذا أضخم محور في المشروع — **أكثر من 60 إصدارًا** عبر سلسلتين متتاليتين: (أ) محرك القوالب التفاعلي (Phases 1→7A، Designer 5A→6.1C)، ثم (ب) سلسلة "المعاينة الدقيقة" الكاملة (Print Center → Universal Preview → True Chromium WYSIWYG).

| التاج | التاريخ | الوصف |
|---|---|---|
| `stable-print-templates-cairo-font-v1` | 2026-06-20 | استعادة خط Cairo لكل قوالب الطباعة |
| `stable-print-template-engine-phase1-v1` | 2026-06-21 | أساس محرك قوالب React، 26 قالبًا مرجعيًا، 53 اختبار |
| `stable-print-engine-invoice-phase2a-v1` | 2026-06-21 | ربط المحرك بمعاينة الفاتورة الحقيقية |
| `stable-print-engine-quotation-phase2b-v1` / `-v1.1` | 2026-06-21 | 10 قوالب عرض سعر جديدة، 61 اختبار |
| `stable-print-document-suite-phase1-v1` | 2026-06-22 | توقيع رقمي وختم شركة (base64) عبر كل القوالب |
| `stable-print-document-suite-phase2-v1` | 2026-06-22 | تخصيص توقيع/ختم لكل طباعة (جلسة فقط) |
| `stable-print-document-suite-phase3-v1` | 2026-06-22 | تصدير PDF أصلي عبر `webContents.printToPDF` |
| `stable-print-document-suite-phase4-v1` | 2026-06-22 | مصمم موضع التوقيع/الختم البصري (سحب وإفلات) |
| `stable-print-designer-phase5a-v1` | 2026-06-22 | مصمم WYSIWYG داخل المستند مباشرة |
| `stable-print-designer-phase5a1-v1` | 2026-06-22 | 14 تحسين تجربة استخدام احترافي |
| `stable-print-designer-phase5b-v1` | 2026-06-22 | أدوات تنسيق نص (حجم/عائلة/وزن/لون/محاذاة) |
| `stable-print-designer-phase5c-v1` | 2026-06-22 | أساس المصمم الموحّد (`DesignerElement`) |
| `stable-print-designer-phase5d1-v1` | 2026-06-22 | تحرير نص ثابت بالنقر المزدوج |
| `stable-print-designer-phase5d2-v1` | 2026-06-23 | سحب/تحجيم/دوران/اختيار متعدد/استيراد وتصدير JSON |
| `stable-print-designer-phase6-v1` | 2026-06-23 | استوديو قوالب WYSIWYG شامل (8 أنواع عناصر)، معطّل افتراضيًا |
| `stable-print-designer-phase6-1a-v1` | 2026-06-23 | نوع عنصر جدول بنود ديناميكي |
| `stable-print-designer-phase6-1b-v1` | 2026-06-23 | إجماليات المستند وربطها |
| `stable-print-designer-phase6-1c-v1` | 2026-06-23 | تلميع الاستوديو وتوحيد إجماليات عرض السعر |
| `stable-arabic-pdf-chromium-fix-v1` | 2026-06-25 | إصلاح نص عربي مشوّه في PDF عبر خط أنابيب Chromium HTML→PDF |
| `stable-print-polish-batch1-v1` | 2026-06-25 | أساس التحقق عبر QR للفاتورة |
| `stable-print-designer-phase7a-docx-import-v1` | 2026-06-25 | استيراد قوالب DOCX (mammoth+jszip)، معالج من 4 خطوات، 31 اختبار |
| `stable-print-native-bridge-routing-v1` | 2026-07-01 | توجيه كل إجراءات الطباعة عبر جسر Electron الأصلي |
| `stable-print-profile-toggle-voucher-isolation-v1` | 2026-07-01 | عزل ملفات طباعة السندات عن باقي النماذج |
| `stable-print-workspace-ux-phase1-v1` | 2026-07-01 | مساحة عمل معاينة طباعة بأسلوب Acrobat/Word |
| `stable-print-templates-cleanup-phase1-v1` | 2026-07-02 | تكبير/تصغير افتراضي 75%، إزالة تكرار كتلة التوقيع |
| `stable-invoice-report-print-refresh-v1` | 2026-07-05 | تحسين استغلال ورقة A4 وتصغير الخط ~20% |
| `stable-print-center-phase2a-preview-v1` | 2026-07-11 | عقد `PrintJob` نمطي، سجل `PageSpec`، منصة معاينة عالمية مدعومة بـ PDF |
| `stable-universal-print-preview-v1` | 2026-07-12 | معاينة شاملة (أعلام مطفأة افتراضيًا) — قرار معماري: نطاق أضيق "تراكب معاينة، مسار الطباعة القديم كما هو" |
| `stable-quotation-legacy-preview-bridge-v1` | 2026-07-12 | جسر معاينة عرض السعر القديم |
| `stable-universal-legacy-print-preview-rollout-phase1-v1` | 2026-07-12 | ربط 10 نماذج FormLayout بالمعاينة |
| `stable-universal-legacy-print-preview-rollout-phase2-v1` | 2026-07-12 | ربط عقد العمل وقسيمة الراتب (**تراجع كامل داخل نفس الإصدار** عن ميزة فصل الصفحات لأنها أنتجت حدودًا خاطئة بثقة) |
| `stable-universal-print-preview-controlled-enablement-phase-a-v1` | 2026-07-12 | تفعيل المعاينة افتراضيًا للفاتورة/عرض السعر/عقد العمل/قسيمة الراتب |
| `stable-universal-print-preview-full-controlled-enablement-v1` | 2026-07-12 | تفعيل كل الأعلام التسعة افتراضيًا — 15 مستندًا مغطّى بالكامل |
| `stable-true-chromium-wysiwyg-preview-poc-v1` | 2026-07-13 | إثبات مفهوم لمعاينة Chromium حقيقية (تصفّح فعلي) — تجريبي، معطّل |
| `stable-pdfium-viewer-hardening-v1` | 2026-07-13 | إغلاق 3 ثغرات تجاوز في عارض PDFium (شريط أدوات أصلي، Ctrl+P/S) |
| `stable-invoice-wysiwyg-enablement-zoom-v1` | 2026-07-13 | تفعيل معاينة الفاتورة الدقيقة افتراضيًا + شريط تكبير مملوك للمشروع |
| `stable-additive-universal-true-chromium-preview-v1` | 2026-07-13 | توسيع المعاينة الدقيقة لـ 14 نموذجًا إضافيًا |

> **إعلان رسمي داخل `PROJECT_STATE.md`:** "نظام الطباعة يُعتبر **مغلقًا** اعتبارًا من 2026-07-16 — لا ينبغي فتح جيل طباعة جديد دون مبرر قوي" (74 إصدارًا طباعيًا، كل الـ15 مستندًا مفعّلة بالمعاينة، PDFKit متقاعد من مسار التقارير).

### 3.13 استيراد البيانات (Data Import)

| التاج | التاريخ | الوصف |
|---|---|---|
| `stable-data-import-phase1-v1` | 2026-06-08 | أساس استيراد Excel |
| `stable-employee-import-extended-fields-v1` | 2026-06-08 | حقول موظف موسّعة + دعم رؤوس عربية |
| `stable-data-import-export-expansion-v1` | 2026-06-12 | تصدير Excel للوحدات التشغيلية |
| `stable-dynamic-import-tabs-phase1-v1` | 2026-06-13 | تبويبات استيراد مُوجَّهة بالإعداد |
| `stable-data-import-phase3-contracts-expenses-v1` | 2026-06-14 | استيراد العقود والمصروفات |
| `stable-xlsx-import-hardening-v1` | 2026-06-14 | تحصين اختيار ملف Excel |
| `stable-data-import-phase3c-invoices-v1` | 2026-06-15 | استيراد رؤوس الفواتير فقط |
| `stable-smart-import-validation-phase1-v1` | 2026-07-04 | تحذيرات استشارية غير حاجبة في معاينة الاستيراد |
| `stable-smart-import-assistant-phase2-v1` | 2026-07-04 | ذكاء تعيين الرؤوس، درجة جودة الاستيراد، كشف تكرار داخل الملف |

### 3.14 التدويل ونظام الواجهة الشامل (i18n / UI System / Cross-cutting UX)

| التاج | التاريخ | الوصف |
|---|---|---|
| `stable-i18n-phase1-v1` → `phase5-v1` | 2026-06-08 | 5 مراحل تدويل كاملة في يوم واحد: أساس → تغطية موسّعة → صفحات أعمال → توحيد واجهة → **تغطية كاملة** (+1800 مفتاح ترجمة، تبديل RTL/LTR ديناميكي) |
| `stable-page-level-improvements-v1` | 2026-06-09 | فلاتر حالة/نوع عبر 6 وحدات |
| `stable-ui-adoption-phase1-v1` → `phase3b-v1` ⬛ | 2026-06-09/10 | تبنّي نظام تصميم اللوحة على 3 مراحل (استُبدلت لاحقًا بـ ExplorerKit) |
| `stable-stitch-full-ui-rewrite-v1` ⬛ | 2026-06-10 | إعادة كتابة واجهة كاملة مستوردة من Stitch (استُبدلت لاحقًا بـ ExplorerKit) |
| `stable-ui-datatables-enhancement-phase1-v1` | 2026-06-12 | تحسين جداول البيانات |
| `stable-ui-page-headers-standardization-v1` | 2026-06-12 | توحيد ترويسات الصفحات |
| `stable-global-copy-context-menu-v1` | 2026-06-12 | قائمة سياق نسخ عامة |
| `stable-ui-consistency-phase1-buttons-v1` → `phase4-micro-ux-v1` | 2026-06-17/18 | 4 حزم توحيد: أزرار → جداول → نماذج/حوارات → تحسينات دقيقة |
| `stable-ui-typography-refresh-v1` | 2026-06-20 | خط IBM Plex Sans Arabic أساسيًا، Tajawal احتياطيًا |
| `stable-ux-polish-pack-v4` | 2026-06-23 | نظام ConfirmModal، إشعارات Toast، فخ تركيز موحّد |
| `stable-global-monetary-formatting-v1` + `-production-v1` | 2026-07-05 | تنسيق نقدي موحّد (KWD، 3 عشرية، فاصلة آلاف) عبر ~74 ملفًا — **كان قد طُوّر مسبقًا على فرع لم يُدمج قط، ثم أُعيد ترقيته للإنتاج في هذا الإصدار** |
| `stable-global-date-presentation-standardization-v1` | 2026-07-07 | توحيد ~14 صفحة على منسّق `formatDate` مشترك |
| `stable-global-date-input-standardization-v1` | 2026-07-11 | مكوّن `DateInput` موحّد (قناع DD/MM/YYYY) عبر ~30 نموذجًا |
| `stable-financial-number-date-presentation-standardization-v1` | 2026-07-14 | إصلاح انعكاس BiDi للأرقام المالية، PDF كان يُسقط الأصفار الزائدة |
| `stable-presentation-settings-compliance-v1` | 2026-07-07 | إعداد لغة عرض العملة (إنجليزي/عربي) |
| `stable-collapsible-sidebar-workspace-pack-v1` | 2026-07-14 | شريط جانبي قابل للطي (248px⇄72px) |
| `stable-drawer-actions-consistency-v1` | 2026-07-15 | توحيد إجراءات الأدراج في شريط علوي واحد |
| `stable-shadcn-calendar-datepicker-v1` | 2026-07-15 | استبدال منتقي التاريخ الأصلي بتقويم shadcn |
| `stable-dark-mode-company-logo-v1` | 2026-07-12 | شعار شفاف للوضع الداكن |

### 3.15 حزم التحسين التشغيلي الشاملة (Operational Polish Packs)

سلسلة طويلة من الحزم متعددة الوحدات (9 حزم رئيسية عبر المشروع): `operational-ux-phase1a..phase2a` (2026-06-11/12)، `operational-stabilization-phase1/2` (2026-06-12)، `business-alignment-pack-v1` (2026-06-16)، `operations-workflow-pack-v1` (2026-06-17)، `operations-polish-pack-v1` + `professional-polish-pack-phase2-v1` + `ultimate-professional-ux-pack-v1` (2026-06-19)، `final-polish-suite-phase2-v1` (2026-06-27، تضمّن وضع الخصوصية `PrivateAmount`)، `operational-polish-suite-phase3-v1` (~أواخر يونيو)، `operational-polish-suite-phase4-v1` (2026-06-28)، `ops-management-suite-phase1-v1` (2026-06-26، مركز انتهاء الوثائق + المرفقات + التحقق من النسخ الاحتياطي + لوحة العمليات المالية).

> ملاحظة توثيق مهمة: كل من `stable-operational-polish-suite-phase4-v1` و`stable-financial-workflow-suite-phase2-v1` كانا موصوفَين في `PROJECT_STATE.md` كـ"معلَّق/pending" في وقت الكتابة، لكن **التحقق المباشر من Git يؤكد أن كليهما لهما وسم `stable-*` فعلي ومدموج في `production`** — أي أن التوثيق كان متأخرًا عن الواقع لحظيًا فقط، وليسا فعليًا معلَّقين.

### 3.16 سير عمل الموافقات (Approval Workflow)

| التاج | التاريخ | الوصف |
|---|---|---|
| `stable-approval-workflow-pack-v1-phase-a` | 2026-06-24 | **أساس محرك موافقات عام** — نموذج `ApprovalHistory`، محرك `ApprovalEngine`، 4 مكوّنات واجهة جاهزة **لكن غير مفعّلة** (لم يُسجَّل أي محرك حتى نقطة نهاية التاريخ كانت تُرجع 400 لكل طلب) |
| — تفعيل لاحق | 2026-07-12 | فُعِّل المحرك فعليًا ضمن `stable-core-runtime-completion-roadmap-reconciliation-v1` (تسجيل المصروفات/الفواتير/الرواتب) |

### 3.17 البنوك (Banking) — استيراد الكشوف والمطابقة والمستكشف

محور ضخم آخر (~35 إصدارًا) بُني حول قرار معماري ADR-001 (الجدول الزمني الموحّد للحساب البنكي كالكيان الأساسي بدل دفعة الاستيراد).

| التاج | التاريخ | الوصف |
|---|---|---|
| `stable-payroll-bank-import-v1` ⬛ | 2026-06-18 | استيراد كشف بنكي للرواتب (أول نسخة) |
| `stable-payroll-bank-import-all-transactions-v1` | 2026-06-18 | دعم تنسيق "All_Transactions" |
| `stable-payroll-bank-import-date-month-fix-v1` | 2026-06-18 | إصلاح تحليل تاريخ الشهر من Excel |
| `stable-payroll-bank-analytics-v1` + `-ux-filters-v1` | 2026-06-18/19 | تحليلات بنكية للرواتب (بطاقات، رسم شهري، بحث موظف) |
| `stable-payroll-bank-import-phase1-v1` | 2026-06-25 | حزمة مؤسسية: سجل 6 بنوك، محرك مطابقة 4 مستويات |
| `stable-bank-statement-import-phase1-v1` | 2026-06-25 | استيراد كشف بنكي ومطابقة ذكية (سجل 7 بنوك، 8 استراتيجيات مطابقة) |
| `stable-bank-statement-headerless-fix-v1` + `preamble-fix-v1` | 2026-06-28 | إصلاح تحليل الكشوف بلا رأس/بمقدّمة |
| `stable-bank-import-validation-polish-v1` | 2026-06-28 | 9 قواعد تحقّق |
| `stable-bank-statement-explorer-phase5c-v1` | 2026-06-28 | تصدير موثّق، حذف متعدد، بطاقات KPI |
| `stable-payroll-analytics-explorer-phase6-v1` | 2026-06-28 | مستكشف تحليلات رواتب |
| `stable-bank-statement-incremental-import-v2` | 2026-06-29 | كشف تكرار بصمة SHA-256 عبر دفعات الاستيراد |
| `stable-bank-unified-timeline-architecture-v1` (ADR-001) | 2026-06-29 | **قرار معماري**: الجدول الزمني للحساب هو الكيان الأساسي، لا دفعة الاستيراد |
| `stable-bank-statement-import-phase-a-v1` | 2026-06-29 | تحليل التغطية وتلميع Gemini |
| `stable-bank-account-explorer-phase-b-v1` → `phase-e-v1` | 2026-06-30 | 4 مراحل: الاستقرار → التنفيذي البصري → التجربة التنفيذية النهائية |
| `stable-bank-account-explorer-polish-phase1-v1` | 2026-06-30 | تلميع مستكشف الحساب البنكي |
| `stable-bank-account-explorer-default-sort-v1` | 2026-07-05 | إصلاح ترتيب افتراضي (كان غير حتمي في الترقيم) |
| `stable-payroll-bank-import-transaction-details-format-v1` | 2026-07-06 | مسار تحليل لتنسيق تقرير بنكي جديد |
| `stable-bank-account-explorer-visual-refresh-v2` | 2026-07-07 | رأس تنفيذي، بطاقة رصيد مركزية، درج مبوّب، محلّل وصف `describeTransaction()` |
| `stable-smart-transaction-presentation-engine-v1` | 2026-07-07 | **بديل أكثر أمانًا** لمحلّل الوصف — إزالة مستخرج الاسم بالأحرف الكبيرة كليًا (خصوصية) |
| `stable-payroll-bank-import-legacy-retirement-phase1-v1` | 2026-07-04 | تقاعد مسار استيراد قديم مضمّن في الرواتب |
| `stable-payroll-bank-import-assistant-v1` | 2026-07-04 | مساعد استيراد إضافي (تحقّق IBAN، كشف شذوذ راتب ±30%) |
| `stable-payroll-bank-export-nbk-salary-xls-v1` | 2026-07-09 | مولّد ملف راتب بنكي جاهز (تنسيق NBK الرسمي `.xls`) |

### 3.18 نظام الواجهة الموحّد ExplorerKit (Unified Explorer UI)

| التاج | التاريخ | الوصف |
|---|---|---|
| `stable-unified-explorer-ui-bundle-phase1-v1` | 2026-06-30 | نظام تصميم `ExplorerKit.tsx` جديد — التقارير، انتهاء الوثائق، استيراد البيانات |
| `stable-unified-explorer-ui-phase2-v1` | 2026-06-30 | المحاسبة، المصروفات، الوحدات القائمة على ResourcePage |
| `stable-unified-explorer-ui-phase3a-v1` → `phase3e-v1` | 2026-06-30 | العقود/المستخدمون → الرواتب/الأسعار/الحضور → المخزون/الصيانة → الشيكات → الفواتير |
| `stable-settings-center-refresh-v1` | 2026-07-01 | تحديث مركز الإعدادات بـ ExplorerKit |
| `stable-explorer-dialog-focus-stack-fix-v1` | 2026-07-01 | إبقاء نوافذ التأكيد فوق حوارات ExplorerKit |
| `stable-explorerkit-information-hub-phase1-v1` | 2026-07-07 | عناصر "مركز معلومات" أولية (رأس KPI، إجراءات سريعة) على العميل/المعدة/الفاتورة |
| `stable-explorerkit-professional-modernization-v1` | 2026-07-09 | تحديث احترافي عبر التلميحات والمحاذاة الرقمية |
| `stable-explorerkit-metrics-consistency-filter-ux-v1` | 2026-07-09 | إصلاح فلتر الشيكات، إجمالي مفلتر ديناميكي |

### 3.19 التكاملات والمساعد الذكي (Integrations & AI Assistant)

| التاج | التاريخ | الوصف |
|---|---|---|
| `stable-integrations-center-phase1-v1` | 2026-06-25 | سجل تكاملات ثابت، طبقة إعدادات، تشغيل يُرجع دائمًا "غير منفَّذ" في المرحلة 1 |
| `stable-integrations-center-phase2-v1` | 2026-06-28 | تحديث واجهة مركز التكاملات |
| `stable-ai-assistant-phase-ai-1.5-v1` | 2026-06-28 | واجهة مساعد ذكي أولية — محادثة مؤقتة حتمية، بلا LLM/SQL/RAG |
| `stable-ai-assistant-phase-ai-2-v1` | 2026-06-29 | موجّه كلمات مفتاحية حتمي (27 قاعدة، 6 مهارات)، بلا LLM |
| `stable-ai-assistant-phase-ai-2.1-v1` | 2026-06-29 | إصلاح عاجل لتجاوز حد الصفحة في مهارة الكشف البنكي |
| `stable-ai-assistant-business-skills-v1` (AI-2.5) | 2026-06-29 | محرك جودة، توسيع 6 مهارات أعمال |

> **حقيقة مهمة موثّقة رسميًا:** طبقة الذكاء الاصطناعي **حتمية 100% وبلا اتصال بالإنترنت بالكامل — لا يوجد أي LLM في المشروع** (بحث شامل عن `openai|anthropic|gpt|gemini|langchain` في الكود أعاد 0 نتيجة). أي تطوير مستقبلي لـ LLM محلي (Ollama) اختياري فقط.

---

## 4) الإصدارات الملغاة / المهجورة / المُستبدلة فعليًا

هذه القائمة الوحيدة في التقرير التي تحتوي عناصر **لم تُشحن إلى الإنتاج فعليًا** (بخلاف كل ما سبق). تم التحقق من كل بند مباشرة عبر Git (`git branch --no-merged production`, `git merge-base --is-ancestor`) وعبر فحص وجود الملفات في `production` الحالي، وليس فقط من النص التوثيقي.

| البند | الحالة | الدليل |
|---|---|---|
| **وحدة المستندات (Documents Module)** | **مُلغاة** — أُنشئت في commit `4e7bf9e` (2026-06-06) ووُصفت بأنها "مستقرة ومُختبرة وقت التشغيل"، ثم أُزيلت بالكامل في اليوم التالي عبر commit `1bbb936` ("استعادة Dashboard الحديث بدون وحدة المستندات") | تأكيد مباشر: `frontend/src/pages/Documents.tsx` **غير موجود** في `production` الحالي. الفرع `backup-before-documents-rollback` (نقطة أمان قبل التراجع) ما يزال موجودًا وغير مدموج |
| **النسخ الاحتياطي إلى Google Drive (Phase 1)** | **مهجورة/معلّقة فعليًا — لم تُدمج قط** | تأكيد مباشر بأمر `git merge-base --is-ancestor 874ce1c production` → **لا**. الفرع `feature/google-drive-backup-phase1` (commit `874ce1c` "feat(backup): add Google Drive backup integration phase 1"، بتاريخ 2026-07-05) ما يزال موجودًا وغير مدموج. **مؤكَّد أيضًا في `PROJECT_MASTER_STATUS.md` صراحة**: "Cloud Backup (OneDrive/Google Drive) — explicitly removed; its Integrations card was deleted. No code ever existed [in production]; the branch was abandoned and never merged." — تم حذف بطاقتها من واجهة مركز التكاملات لاحقًا |
| **معايرة طباعة الشيك — المحاولة الأولى (`feature/cheques-print-calibration-v1`)** | **مُستبدلة قبل الدمج** — تحتوي commits حقيقية (`fa861ff`, `7e42898`) و`DESIGN.md` من 814 سطر لم يُدمج أيٌّ منها | الفرع غير مدموج في `production`. أُعيد بناء المعايرة لاحقًا من الصفر بنهج مختلف تمامًا عبر `stable-gulf-bank-cheque-calibration-v1` (2026-06-11) ثم استوديو المعايرة الكامل (2026-07-10/11) |
| **منتقي بادئة رقم الفاتورة المستقل (`feature/invoice-prefix-selector`)** | **مُستبدلة قبل الدمج** — commit واحد (`f4ec56b`، 2026-06-15) لم يُدمج | استُبدلت في نفس الأسبوع بميزة أشمل `stable-invoice-date-billing-month-v1` التي تضمّنت "قائمة بادئة قابلة للتحرير" ضمن نطاقها |
| **سياسة "إصدار Git" التلقائية الكاملة (`docs/token-efficiency-policy-v1`)** | **معلّقة قيد المراجعة حاليًا (لم تُدمج بعد)** | فرع نشط بتاريخ 2026-07-16 (نفس يوم آخر إصدار)، يضيف بند "Git Release Policy" إلى `CLAUDE.md` يسمح بتنفيذ دورة commit→push→merge→tag كاملة دون توقف بعد اعتماد المراجعة. **`CLAUDE.md` الحالي في `production` لا يحتوي هذا البند بعد** — لا يزال يتضمن "NEVER: Commit/Push/Merge automatically" |
| **إعادة التسمية/الإصدارات "اليتيمة" ظاهريًا (19 حالة `pre-*` فُحصت)** | **جميعها انتهت فعليًا إلى إصدار مُدمج تحت اسم مختلف** (وليست إصدارات مفقودة) | تم التحقق بفحص السياق الزمني لكل وسم — مثال: `pre-print-center-foundation-v1` انتهى فعليًا إلى `stable-print-center-phase2a-preview-v1` (دُمج ضمن حزمة أوسع) |

**ملاحظات إضافية موثّقة رسميًا كـ"أُزيلت من خارطة الطريق بقرار" (وليست إخفاقات):**
- تصدير PDF موقّع تشفيريًا (Cryptographically signed PDF export)
- طبقة LLM محلية / RAG / OCR / Document AI الكاملة (كانت مراحل AI-3…AI-6 المخطَّطة)
- تطبيق مرافق للجوال (Mobile Companion App)
- "جيل سادس" من نظام الطباعة — أُعلن نظام الطباعة "مغلقًا" رسميًا

---

## 5) Remaining Roadmap & Pending Items
### القائمة المستقلة الموحّدة لكل الملاحظات المتبقية — بدون تكرار، مرتّبة حسب الأولوية

> مصادر هذه القائمة: `PROJECT_MASTER_STATUS.md` (القائمة الرسمية المُتحقَّق منها بالكود، بتاريخ تصالح 2026-07-12)، `PROJECT_STATE.md`، 47 ملف خطة، 4 مراجعات Gemini، 12 وثيقة تدقيق جذرية. تم استبعاد أي بند تبيّن أنه **شُحن لاحقًا** في إصدار أحدث (مثال: تنسيق العملة الموحّد كان "معلّقًا" في مراجعات يوليو المبكرة ثم شُحن فعليًا في `stable-global-monetary-formatting-production-v1`).

### 🔴 أولوية عالية

1. **معايرة الفتح/الإغلاق الدورية لمستكشف الحساب البنكي (Bank Explorer period Opening/Closing Balance)** — مصمَّمة بالكامل في `docs/BANK_EXPLORER_HISTORICAL_READINESS.md` (استعلام Prisma جاهز)، غير مبنية. يتطلب قرار تصميم/تجربة مستخدم مفتوحًا: ماذا يعني "الرصيد الافتتاحي" عند عدم وجود معاملة سابقة لأول فترة على الإطلاق (صفر أم أول صف ناقص الحركة؟).
2. **استيراد قوالب PDF إلى مصمم الطباعة (Print Designer Phase 7B)** — يحتاج قرار استراتيجية تحليل عبر pdf.js أولاً.
3. **تدفّق مراجعة وترحيل دفعات الاستيراد التاريخي إلى دفتر الأستاذ (Historical Import Batch Review & Posting Pack)** — الفواتير/المصروفات/الرواتب المستوردة تاريخيًا **لا تُرحَّل إلى دفتر الأستاذ أبدًا** (قرار متعمّد لتفادي الترحيل المزدوج)، ما يخلق تناقضًا فعليًا بين تقرير أعمار الذمم (مبني على الفواتير) وتقارير دفتر الأستاذ (قائمة الدخل/ميزان المراجعة) لنفس اليوم. مصمَّم بالكامل (نماذج `ImportBatch`/`ImportBatchItem`) لكن غير مبني. 3 قرارات تصميم مفتوحة: قيد واحد إجمالي لكل دفعة أم قيد لكل مستند؛ الرصيد الافتتاحي كملف منفصل أم فرق موازنة مُشتق؛ هل ترحيل الدفعة يتجاوز حالة PENDING/DRAFT ضمنيًا.

### 🟡 أولوية متوسطة

4. **محرك استيراد الصفوف المجمّعة (Data Import Phase 4)** لأوامر الشراء/سندات الاستلام/سندات الصرف — نماذج Prisma السبعة موجودة بالفعل، الناقص هو مدقّقات الاستيراد فقط.
5. **الترحيل التلقائي لدفتر الأستاذ من مساحة عمل المطابقة البنكية** — يتعارض مع سياسة "عدم الترحيل التلقائي أبدًا" القائمة؛ يجب حسم هذه السياسة صراحة قبل جدولة أي عمل هنا.
6. **اختيار الموقّع لكل نوع مستند (Per-document signer selection)** — التخزين والموضعة موجودان، خريطة وقت الطباعة غير موجودة.
7. **مرحلة القوالب المتقدّمة لطباعة النماذج الإدارية** (`letterhead-en`)، **اختيار قالب فاتورة (`templateId`)**، **قالب طباعة حراري 80mm للفاتورة** — كلها بنود مؤجَّلة موثّقة صراحة كـ"مستقبل" في `docs/invoice-templates/README.md`.
8. **توحيد بيانات التواصل الرسمية للشركة** (رقم الفاكس، حالة الأحرف في البريد الإلكتروني) بين `companyData.ts` وملفات `docs/html` والنماذج المولَّدة السبعة — أعلى أولوية في `FORMS_INVENTORY_REPORT.md` لأنها تمس كل مستند مطبوع، لم تُنفَّذ بعد.
9. **توحيد الخط عبر كل النماذج** (Cairo مقابل Tajawal في قوالب عرض السعر المرجعية؛ Times New Roman مقابل Cairo للنص الإنجليزي في النماذج المولَّدة) — لم يُنفَّذ.
10. **إزالة رقم هاتف تجريبي (`99887766`)** من `frontend/src/pages/index.html` (ملف نموذج أولي).
11. **ترحيل الجيل الثاني من "مركز مستكشف" مستقبلي** حسب توصيات ADR-001 v3.1: جعل الجدول الزمني نقطة الدخول الأساسية بدل قائمة الدفعات، نموذج سجل `BankAccount` خفيف مستقل، نقاط تفتيش رصيد متراكم لكل حساب، أداة تحليلات عبر كل الحسابات، مؤشرات صحة الجدول الزمني (فجوات تواريخ).
12. **تقارير مالية إضافية معروضة حاليًا كبطاقات "قريبًا" معطّلة** في تبويب التقارير المالية: الميزانية العمومية، التدفقات النقدية، مقارنة الميزانية (الأرباح والخسائر أُنجز فعليًا ولم يعد معلّقًا).
13. **مرحلة B لمحرك الموافقات لبعض التدفقات المتبقية** (تفاصيل تسجيل أدق حسب `approval.registry.ts`) — الجزء الأكبر شُحن ضمن `stable-core-runtime-completion-roadmap-reconciliation-v1` لكن تُوجد ملاحظات دقيقة متبقية حول عدم توجيه بعض الموافقات عبر `transition()` تفاديًا لازدواج التدقيق.
14. **حزمة تحسين بصري لتقويم shadcn الجديد (Calendar UX & Visual Polish)** — تباعد/تناسب — مؤجَّلة عمدًا من إصدار دمج shadcn.
15. **حارس تجربة استخدام للرواتب التاريخية (Historical Payroll UX Guard v1)** — تعطيل/توضيح إجراء "توليد" للفترات المستوردة/المُقفلة — مؤجَّل من إصدار سجل تحويل الرواتب التاريخي.
16. **متابعة "تدقيق صفحة الرواتب"** — طلب مستخدم صريح بعد إصدار محرك تصدير NBK البنكي، لم يُنفَّذ بعد.

### 🟢 أولوية منخفضة / تحسينات تقنية

17. **توحيد 6 مكوّنات `ForceDelete*Modal`** شبه المكرّرة في مكوّن واحد قائم على الإعداد.
18. **تفكيك الملفات الضخمة**: `i18n.ts` (2,450 سطر)، `Invoices.tsx` (كان 1,755 — صار 597 بعد `stable-invoice-editor-consolidation-v1`)، `Inventory.tsx` (1,097)، `Maintenance.tsx` (1,027)، `executive.service.ts` (941).
19. **مركزة منطق الترحيل المحاسبي** في واجهة `postingService` موحّدة بدل توزّعه بين الفواتير/المصروفات/الرواتب.
20. **توحيد تجميع التحليلات** المتداخل بين خدمات executive/dashboard/financial في وحدة مشتركة.
21. **فواتير متكررة/مجدولة (Recurring invoices)** — غير موجودة في الكود إطلاقًا.
22. **تقرير جاهز لإقرار ضريبة القيمة المضافة (VAT report)** — غير موجود.
23. **استحقاق مكافأة نهاية الخدمة (End-of-service indemnity accrual)** حسب قانون العمل الكويتي — غير موجود.
24. **قص ملفات CSV الكبيرة أثناء الاستيراد + ضبط `PRAGMA busy_timeout`** لتفادي قفل قاعدة البيانات.
25. **تدقيق إمكانية الوصول (Accessibility)**: `htmlFor`/`id`، خاصية `required` HTML، أزرار مسح البحث — مؤجَّلة صراحة من عدة مراحل توحيد واجهة متتالية إلى "تمريرة منفصلة".
26. **نظافة المستودع**: إزالة ملف zip بناء تم رفعه بالخطأ، نقل صور PNG متفرقة إلى `docs/`.
27. **صيانة سجل التدقيق (AuditLog retention/purge)** — لا يوجد مسار تنظيف؛ اعتُبر غير عاجل لتطبيق محلي بمستخدم واحد؛ يُعاد النظر فقط إذا أصبح نمو قاعدة البيانات ملحوظًا فعليًا.
28. **تحذير Recharts ثابت** (`width(-1)/height(-1)`) على حاويات نسبية مزدوجة — موثّق كمعروف ومؤجَّل رغم إصلاح 15 حاوية أخرى.
29. **اختبارَا `printWorkspace.test.tsx` الفاشلان بشكل متكرر** — عبر عشرات الإصدارات، تم التحقق مرارًا أنهما سابقان لكل تغيير ولا علاقة لهما به، لم يُصلَحا بعد.
30. **ثغرة توفّر ESLint** غير مثبَّت في بيئة التطوير عبر إصدارات كثيرة — يُفصَح عنها في كل مرة بدل تجاهلها صامتًا.
31. **فجوة بناء إنتاجي محتملة**: مسارات alias الخلفية (`@shared/@core/@config/@modules`، 46 ملفًا) تُصرَّف إلى `require('@shared/...')` حرفيًا تحت `tsc` عادي بدون `tsc-alias`/مُحلِّل وقت تشغيل — ما يناقض ادّعاء `CLAUDE.md` بأن خطوة البناء تعيد كتابة المسارات؛ يحتاج إما أداة بناء (`tsc-alias`) أو تصحيح التوثيق.
32. **إمكانية فصل `title` عن `documentLabel`** في حوار المعاينة المشترك — ملاحظة مستقبلية منخفضة الأولوية غير حاجبة.
33. **إعادة تنظيم أصول الخطوط** إلى مجلدات فرعية (`ibm-plex-sans-arabic/`, `cairo/`, `tajawal/`) واستخراج ملفات Cairo woff2 من `node_modules` بدل الاعتماد على حزمة npm — مؤجَّلة كتنظيف مستقبلي.
34. **قوالب طباعة الشيكات** ما تزال على حزمة خط Cairo فقط دون تحديث الخط الجديد — بانتظار تأكيد عدم تأثّر أبعاد طباعة الشيك.
35. **استضافة أيقونات Material Symbols محليًا** بدل الاعتماد على CDN (متبقٍّ من محاولة إعادة تصميم Stitch المبكرة قبل استبدالها بـ ExplorerKit) — كانت محظورة للاستخدام دون اتصال، أصبحت غير ذات صلة عمليًا بعد استبدال الواجهة بالكامل لاحقًا.
36. **حزمة "المساعد التنفيذي الذكي" الأعمق (Executive AI)** ونظام تكامل موصل عام (Connector SDK) ومساعد مطابقة (Reconciliation Assistant) — "لا تزال متصوَّرة، غير مجدولة" رسميًا.

### ⚪️ رُوجعت وتقرَّر رسميًا عدم تنفيذها (لا تُعاد كأولوية إلا بطلب صريح من المالك)

- **ترحيل الأعمدة النقدية من `Float` إلى `Decimal`** — رُوجعت بالدليل (SQLite يخزّن DECIMAL كـ REAL أصلًا) وتقرَّر الإبقاء على الوضع الحالي رسميًا. لا تُجدوَل إلا عند خطأ محاسبي فعلي قابل لإعادة الإنتاج.
- **إبطال/تدوير جلسات JWT (Token revocation)** وتحصين أمني على مستوى المؤسسات (Electron `sandbox:true`، رفع تكلفة bcrypt) — غير ذات أولوية لتطبيق محلي أحادي المستخدم.
- **تشفير النسخ الاحتياطية محليًا** — اعتبار مستقبلي اختياري فقط، وليس التزامًا.
- **النسخ الاحتياطي السحابي (Google Drive/OneDrive)** — أُزيل من خارطة الطريق نهائيًا (انظر القسم 4).
- **طبقة LLM/RAG/OCR/Document AI الكاملة** — المساعد الذكي يبقى حتميًا بالتصميم، وليس بسبب نقص.
- **تطبيق مرافق للجوال (Mobile Companion)** — غير مخطَّط له.
- **جيل سادس من نظام الطباعة** — أُعلن النظام مغلقًا رسميًا.

---

## ملحق: تصحيح توثيقي مهم لوحظ أثناء البحث

كشف الفحص المتقاطع بين `PROJECT_STATE.md` و`PROJECT_MASTER_STATUS.md` والـ Git المباشر عن **حالتين توثيقيتين متأخرتين لحظيًا** (وُصفتا كـ"معلّقتين" في نص PROJECT_STATE.md رغم وجود وسم `stable-*` فعلي مدموج في `production`):
- `stable-operational-polish-suite-phase4-v1`
- `stable-financial-workflow-suite-phase2-v1`

كلاهما **مُصدَران فعليًا ومكتملان** — الفجوة كانت في تحديث حقل الحالة النصي في الوثيقة وقت كتابتها، وليست في الواقع الفعلي للكود. هذا يؤكد توصية المستخدم الأصلية بعدم الاعتماد على تقرير واحد فقط، بل التحقق من المشروع نفسه — وهو ما اتُّبع في بناء هذا التقرير.

---

*نهاية التقرير — مبني بالكامل من فحص مباشر لـ Git (449 وسم، 1132 commit) و`PROJECT_STATE.md` (2579 سطر) و`PROJECT_MASTER_STATUS.md` (703 سطر) و`docs/PROJECT_HISTORY_FULL.md` (820 سطر) و47 ملف خطة و16 وثيقة مراجعة/تدقيق، بتاريخ 2026-07-16.*
