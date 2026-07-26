# PROJECT_HISTORY_FULL.md — نظام المنار لإدارة الأعمال

> التاريخ الكامل للمشروع من أول Commit حتى Production HEAD الحالي.
> مصدر البيانات: git log، git tag، PROJECT_STATE.md، AGENTS.md، README.md، docs/*.

---

## Executive Summary

| الحقل | القيمة |
|-------|--------|
| **اسم المشروع** | نظام المنار لإدارة الأعمال (manarERP) |
| **اسم الشركة** | شركة المنار الدولية لإنشاء وصيانة الشوارع والأرصفة ومستلزمات الطرق ذ.م.م |
| **النوع** | نظام ERP محلي (Offline-First) لإدارة الأعمال — تطبيق سطح مكتب |
| **المنصة** | Windows — Electron Desktop Application |
| **قاعدة البيانات** | SQLite — ملف واحد، نسخ احتياطي تلقائي |
| **Stack الرئيسي** | Electron · React 18 · Vite · TypeScript · Express · Prisma · SQLite |
| **واجهة المستخدم** | عربية أولاً، RTL، دعم ثنائي اللغة (عربي / إنجليزي) |
| **العملة** | دينار كويتي (د.ك) — 3 خانات عشرية — بدون نظام ضريبي |

### الهدف من المشروع

إدارة عمليات شركة مقاولات طرق كويتية محلياً وبدون إنترنت، تشمل: العقود والفواتير والموظفين والمعدات والرواتب والمحاسبة والشيكات والمخزون والتقارير — ضمن نظام واحد يعمل على حاسوب Windows.

### التقنيات المستخدمة

| الطبقة | التقنية | الإصدار |
|--------|---------|---------|
| Frontend | React + TypeScript + Vite | 18.3.1 / 5.5.0 / 5.3.0 |
| State | Zustand | 4.5.4 |
| HTTP | Axios | 1.7.2 |
| Charts | Recharts + Chart.js | 3.8.1 / 4.4.3 |
| Backend | Express + TypeScript | 4.19.2 / 5.5.0 |
| ORM | Prisma | 5.18.0 |
| Database | SQLite | — |
| Validation | Zod | 3.23.8 |
| Security | Helmet + bcryptjs + JWT | 7.1.0 / 2.4.3 / 9.0.2 |
| Export | ExcelJS + PDFKit | 4.4.0 / 0.15.0 |
| Desktop | Electron + electron-builder | 31.0.0 / 24.13.3 |
| Scheduler | node-cron | — |
| Testing | Vitest | 2.0.0 |

### الوضع الحالي

المشروع في حالة **إنتاجية مكتملة** — جميع الوحدات الأساسية مبنية ومدمجة في Production. النظام جاهز للاستخدام الفعلي مع قاعدة بيانات نظيفة (reset 2026-06-09).

- **Production HEAD:** `69d931b` — Merge feature/ui-adoption-phase3b-dashboard-hero
- **Latest Stable Tag:** `stable-ui-adoption-phase3b-v1`
- **مدة التطوير الكاملة:** 5 أيام (2026-06-06 → 2026-06-10)
- **إجمالي Commits:** 86 commit

---

## Development Timeline

> مرتب من الأقدم إلى الأحدث. جميع التواريخ والـ Hashes مستخرجة من `git log`.

---

### المرحلة 0 — الإطار الأساسي ووحدات البداية

**التاريخ:** 2026-06-06

| الـ Commit | الوصف |
|-----------|-------|
| `4bc7e4f` | **Initial commit** — الهيكل الكامل للمشروع: Electron + React + Express + Prisma + SQLite |
| `6f1426a` | إصلاح واجهة الفواتير ونظام ترقيمها |
| `4e7bf9e` | وحدة المستندات مستقرة ومختبرة في وقت التشغيل |

**ملاحظة تاريخية:** وحدة المستندات أُنشئت ثم أُزيلت لاحقاً في نفس اليوم التالي في Commit `1bbb936`.

---

### المرحلة 1 — الأساس والإطار الكامل (يوم التأسيس الثاني)

**التاريخ:** 2026-06-07

| Commit | الوصف |
|--------|-------|
| `1bbb936` | استعادة Dashboard الحديث بدون وحدة المستندات |
| `84aa72d` | إصلاح Electron Startup Launcher |
| `5caaeb9` | تكوين Prettier |
| `985eee3` | **وحدة المحاسبة** — chart of accounts + قيود يومية (Journal Entries) |
| `f7d8dda` | إصلاح مسار قاعدة البيانات في الإنتاج + تطبيع تواريخ الحضور |
| `ea4a070` | **النسخ الاحتياطي والاستعادة** — SQLite backup via IPC |
| `5f76a70` | تقوية التحقق من صحة عملية الاستعادة |
| `841d779` | **Merge:** دمج Backup & Restore في production |
| `e85605a` | **الأدوار والصلاحيات** — نظام RBAC كامل |
| `d2fc3c3` | إصلاح التحقق من الجلسة عبر Electron IPC |
| `b8d55f7` | **Merge:** دمج Roles & Permissions في production |
| `7dbc2c1` | **مركز التقارير والتصدير** — ExcelJS + PDFKit |
| `1c6a1e3` | **Merge:** دمج Reports & Export Center |
| `f4431e0` | **Executive Dashboard v2** — KPIs + Charts + Unified Endpoint |
| `97f9a20` | **Merge:** دمج Executive Dashboard v2 |
| `4373278` | تمكين Backend Hot-Reload في Electron Dev Mode |
| `945cfdd` | **Merge:** دمج Dev Backend Watch |
| `a716a7e` | توثيق: إضافة Claude Code workflow + project baseline + dev standards |

**Tags الصادرة في هذا اليوم:**

| Tag | الوصف |
|-----|-------|
| `stable-dashboard-electron` | أول Dashboard مستقر مع Electron |
| `stable-manarerp-v1` | أول إصدار مستقر من النظام الكامل |
| `stable-accounting-v1` | وحدة المحاسبة v1 |
| `stable-accounting-v2-f7d8dda` | المحاسبة بعد إصلاح مسار DB |
| `stable-backup-restore-v1` | النسخ الاحتياطي مستقر |
| `stable-roles-permissions-v1` | RBAC مستقر |
| `stable-reports-center-v1` | مركز التقارير مستقر |
| `stable-executive-dashboard-v2` | Dashboard التنفيذي v2 |
| `stable-dev-backend-watch` | Backend Hot-Reload مستقر |

---

### المرحلة 2 — النظام الوظيفي الكامل (يوم البناء الكبير)

**التاريخ:** 2026-06-08

| Commit | الوصف |
|--------|-------|
| `1a759ea` | **نظام الرواتب** — توليد + اعتماد + صرف + قسائم |
| `be6ed0f` | **Merge:** دمج Payroll System |
| `fd873f8` | توثيق: إضافة AGENTS.md |
| `a462dd8` | **المخزون Phase A** — أساس المواد والتصنيفات |
| `5d17d1b` | **المخزون Phase B** — أوامر الشراء وسندات الاستلام |
| `971a818` | **المخزون Phase C** — سندات الصرف |
| `1301dc3` | **واجهة المخزون** — صفحة Inventory.tsx كاملة |
| `3b6f1b1` | **i18n Phase 1** — الأساس والقاموس المزدوج |
| `2d981ec` | **i18n Phase 2** — توسيع التغطية |
| `0208787` | **i18n Phase 3** — صفحات الأعمال |
| `c770364` | **Merge:** دمج i18n Phase 3 |
| `2ffa426` | **i18n Phase 4** — توحيد واجهة المستخدم |
| `dd2735d` | **Merge:** دمج i18n Phase 4 |
| `f4861e8` | **i18n Phase 5** — الترجمة الكاملة لجميع الوحدات |
| `82cb27a` | **Merge:** دمج i18n Phase 5 |
| `a26b26a` | **إدارة الشيكات** — إنشاء، طباعة، إلغاء |
| `d87cd22` | **Merge:** دمج Cheques Management |
| `e032ee5` | إصلاح: قبول الحقول الاختيارية nullable في إنشاء الشيك |
| `0d860ea` | توثيق: مواصفات manar-ui-lab (مختبر تصميم منفصل) |
| `9093359` | **استيراد البيانات Phase 1** — بنية الاستيراد الأساسية |
| `d196544` | **Merge:** دمج Data Import Phase 1 |
| `e5f540f` | **توسيع حقول استيراد الموظفين** + دعم الرؤوس العربية |
| `7ac035a` | **Merge:** دمج Employee Import Extended Fields |

**Tags الصادرة في هذا اليوم:**

| Tag | الوصف |
|-----|-------|
| `stable-payroll-system-v1` | نظام الرواتب مستقر |
| `stable-inventory-phase-a-v1` | المخزون Phase A |
| `stable-inventory-phase-b-v1` | المخزون Phase B |
| `stable-inventory-phase-c-v1` | المخزون Phase C |
| `stable-inventory-system-v1` | النظام الكامل للمخزون |
| `stable-i18n-phase1-v1` | i18n Phase 1 |
| `stable-i18n-phase2-v1` | i18n Phase 2 |
| `stable-i18n-phase3-v1` | i18n Phase 3 |
| `stable-i18n-phase4-v1` | i18n Phase 4 |
| `stable-i18n-phase5-v1` | i18n Phase 5 — الترجمة الكاملة |
| `stable-cheques-management-v1` | إدارة الشيكات v1 |
| `stable-cheques-management-v1.1` | إدارة الشيكات v1.1 (إصلاح nullable) |
| `stable-data-import-phase1-v1` | استيراد البيانات |
| `stable-employee-import-extended-fields-v1` | استيراد الموظفين الموسّع |

---

### المرحلة 3 — تحسينات الشيكات والتدقيق

**التاريخ:** 2026-06-09 (الجزء الأول)

| Commit | الوصف |
|--------|-------|
| `5623491` | **Cheques Enhancement Phase 1** — حراسة الطباعة + آلة حالة + سجل تدقيق |
| `be229d3` | **Merge:** دمج Cheques Enhancement Phase 1 |
| `bce79f9` | **Cheques Tafqeet Phase 2** — المبلغ بالكلمات العربية لدينار كويتي |
| `68026f4` | **Merge:** دمج Cheques Tafqeet Phase 2 |
| `daefb6b` | **إصلاح التنبيهات** — إزالة تكرار إشعارات انتهاء رخصة المركبة |
| `c170ddd` | **عارض سجل التدقيق** — Audit Log viewer frontend page |
| `372e657` | **Merge:** دمج Audit Log Viewer |
| `57562df` | **Cheques Improvements v1** — تحقق من الصحة + بنوك كويتية + إعادة ترتيب الحقول |
| `c9d719e` | **Merge:** دمج Cheques Improvements v1 |

**Tags الصادرة:**

| Tag | الوصف |
|-----|-------|
| `stable-cheques-enhancement-phase1-v1` | تحسينات الشيكات Phase 1 |
| `stable-cheques-tafqeet-v1` | التفقيط العربي للشيكات |
| `stable-alerts-dedup-v1` | إصلاح تكرار التنبيهات |
| `stable-audit-log-viewer-v1` | عارض سجل التدقيق |
| `stable-cheques-improvements-v1` | تحسينات الشيكات v1 |

---

### المرحلة 4 — طباعة الشيكات وتحسينات صفحات UI

**التاريخ:** 2026-06-09 (الجزء الثاني)

| Commit | الوصف |
|--------|-------|
| `98a0cd6` | **Cheques Print Output** — صورة خلفية Gulf Bank + 4 حقول overlay |
| `6073785` | **Merge:** دمج Cheques Print Output v1 |
| `f36e1b5` | **Page-Level Improvements Phase 1** — فلاتر في 6 وحدات + أزرار reset |
| `08cc8e3` | **Merge:** دمج Page-Level Improvements Phase 1 |
| `fa861ff` | معايرة مواضع الطباعة مع نموذج Excel لـ Gulf Bank |
| `7e42898` | محاذاة مواضع الطباعة مع القالب النهائي |
| `e47bee2` | توثيق: دليل نظام التصميم DESIGN.md |

**Tags الصادرة:**

| Tag | الوصف |
|-----|-------|
| `stable-cheques-print-output-v1` | نظام طباعة الشيكات |
| `stable-page-level-improvements-v1` | تحسينات مستوى الصفحات |

---

### المرحلة 5 — UI Adoption (توحيد نظام التصميم)

**التاريخ:** 2026-06-09 → 2026-06-10

#### Phase 1 (2026-06-09)

| Commit | الوصف |
|--------|-------|
| `1bb8016` | **UI Adoption Phase 1** — ترحيل 5 متغيرات CSS + استبدال 35 قيمة hex |
| `be46010` | **Merge:** دمج UI Adoption Phase 1 |
| `08ccd26` | توثيق: تحديث حالة المشروع |

**Tag:** `stable-ui-adoption-phase1-v1`

#### Phase 2 (2026-06-10)

| Commit | الوصف |
|--------|-------|
| `53b50c6` | **UI Adoption Phase 2** — تجديد التصميم البصري للـ Dashboard |
| `5d2a0b9` | **Merge:** دمج UI Adoption Phase 2 |

**Tag:** `stable-ui-adoption-phase2-v1`

#### Phase 3A (2026-06-10)

| Commit | الوصف |
|--------|-------|
| `86ff9b0` | **UI Adoption Phase 3A** — تحديث layout الـ Dashboard الشامل |
| `4f6a906` | **Merge:** دمج UI Adoption Phase 3A |

**Tag:** `stable-ui-adoption-phase3a-v1`

#### Phase 3B (2026-06-10) — Production HEAD الحالي

| Commit | الوصف |
|--------|-------|
| `c1a4d5a` | **UI Adoption Phase 3B** — Executive Hero: topbar + snapshot metrics strip |
| `69d931b` | **Merge:** دمج UI Adoption Phase 3B — **PRODUCTION HEAD** |

**Tag:** `stable-ui-adoption-phase3b-v1`

---

## Completed Features

### 1. Authentication (المصادقة)
- **ما أُضيف:** JWT login/logout، تغيير كلمة المرور، حماية كل routes
- **الفائدة:** دخول آمن بصلاحيات محددة لكل مستخدم
- **في Production:** ✅

### 2. Roles & Permissions — RBAC (الأدوار والصلاحيات)
- **ما أُضيف:** 7 أدوار، 93 صلاحية، M2M join، SYSTEM_ADMIN bypass، واجهة إدارة أدوار
- **الفائدة:** كل مستخدم يرى فقط ما يملك صلاحية عليه
- **في Production:** ✅ (`stable-roles-permissions-v1`)

### 3. Backup & Restore (النسخ الاحتياطي)
- **ما أُضيف:** إنشاء نسخ يدوية وتلقائية عبر Electron IPC، استعادة، تصدير، جدولة node-cron
- **الفائدة:** حماية البيانات من الفقد، سهولة الترقية
- **في Production:** ✅ (`stable-backup-restore-v1`)

### 4. Accounting Module (المحاسبة)
- **ما أُضيف:** Chart of Accounts، Journal Entries (double-entry)، دفتر الأستاذ، Profit & Loss
- **الفائدة:** محاسبة كاملة مرتبطة بالفواتير والمصروفات والرواتب
- **في Production:** ✅ (`stable-accounting-v2-f7d8dda`)

### 5. Reports & Export Center (مركز التقارير)
- **ما أُضيف:** 9 أنواع تقارير، تصدير Excel + PDF عربي، فلاتر تواريخ/حالة
- **الفائدة:** تقارير تشغيلية ومالية قابلة للتصدير
- **في Production:** ✅ (`stable-reports-center-v1`)

### 6. Executive Dashboard v2 (لوحة التحكم التنفيذية)
- **ما أُضيف:** KPIs مالية، رسوم بيانية (Recharts)، تنبيهات عاجلة، حضور، unified endpoint
- **الفائدة:** نظرة شاملة فورية على حالة الشركة
- **في Production:** ✅ (`stable-executive-dashboard-v2`)

### 7. Payroll System (نظام الرواتب)
- **ما أُضيف:** توليد رواتب شهرية، بدلات ثابتة + متكررة، خصومات، سلف، اعتماد، صرف، قسيمة راتب للطباعة
- **الفائدة:** إدارة رواتب الموظفين من التوليد حتى الصرف
- **في Production:** ✅ (`stable-payroll-system-v1`)

### 8. Inventory System (نظام المخزون)
- **ما أُضيف:** 3 مراحل — مواد + تصنيفات + أوامر شراء + سندات استلام + سندات صرف، ربط بقيود محاسبية
- **الفائدة:** تتبع المواد من الشراء حتى الصرف
- **في Production:** ✅ (`stable-inventory-system-v1`)

### 9. i18n — دعم ثنائي اللغة (5 مراحل)
- **ما أُضيف:** قاموس مزدوج AR/EN، `useT()` hook، كل UI translatable، toggle اللغة من الشريط العلوي
- **الفائدة:** واجهة عربية أصلية مع بديل إنجليزي كامل
- **في Production:** ✅ (`stable-i18n-phase5-v1`)

### 10. Cheques Management (إدارة الشيكات)
- **ما أُضيف:** إنشاء شيكات، تتبع الحالة (مسودة → مطبوع → ملغى)، سجل الشيكات
- **الفائدة:** توثيق وتتبع الشيكات الصادرة
- **في Production:** ✅ (`stable-cheques-management-v1.1`)

### 11. Cheques Tafqeet — التفقيط العربي
- **ما أُضيف:** تحويل المبلغ الرقمي إلى كلمات عربية (دينار كويتي) على الشيك
- **الفائدة:** متطلب قانوني للشيكات الكويتية
- **في Production:** ✅ (`stable-cheques-tafqeet-v1`)

### 12. Cheques Print Output (طباعة الشيكات)
- **ما أُضيف:** صورة خلفية Gulf Bank، 4 حقول overlay (مستفيد، تاريخ، مبلغ رقمي، تفقيط)
- **الفائدة:** طباعة الشيك على ورق البنك الفعلي
- **في Production:** ✅ (`stable-cheques-print-output-v1`)
- **ملاحظة:** المعايرة الفيزيائية مؤجلة — تحتاج ورق شيك فعلي

### 13. Audit Log Viewer (عارض سجل التدقيق)
- **ما أُضيف:** صفحة frontend لعرض AuditLog، فلترة بالوحدة + الإجراء + التاريخ
- **الفائدة:** تتبع كل العمليات في النظام
- **في Production:** ✅ (`stable-audit-log-viewer-v1`)

### 14. Data Import (استيراد البيانات)
- **ما أُضيف:** استيراد Excel للموظفين + العملاء + المعدات، معاينة وتحقق، دعم رؤوس عربية
- **الفائدة:** ترحيل البيانات من الأنظمة القديمة
- **في Production:** ✅ (`stable-employee-import-extended-fields-v1`)

### 15. Alert Deduplication (إصلاح التنبيهات)
- **ما أُضيف:** إزالة تكرار إشعارات انتهاء رخصة المركبة من تنبيهات الموظفين
- **الفائدة:** تنبيهات نظيفة بدون تكرار مربك
- **في Production:** ✅ (`stable-alerts-dedup-v1`)

### 16. Page-Level Improvements Phase 1 (تحسينات واجهة المستخدم)
- **ما أُضيف:** فلاتر الحالة/النوع في 6 وحدات، فلتر status + direction للفواتير، زر reset filters، عدد النتائج
- **الفائدة:** تجربة مستخدم أفضل في البحث والتصفية
- **في Production:** ✅ (`stable-page-level-improvements-v1`)

### 17. UI Adoption Phase 1 (توحيد نظام التصميم)
- **ما أُضيف:** ترحيل 5 متغيرات CSS (`--accent, --green, --amber, --red, --radius`) وإنشاء DESIGN.md
- **الفائدة:** نظام تصميم موحد سهل الصيانة
- **في Production:** ✅ (`stable-ui-adoption-phase1-v1`)

### 18. UI Adoption Phase 2 (تجديد Dashboard البصري)
- **ما أُضيف:** تجديد تصميم Dashboard — ألوان، بطاقات، تباعد، تسلسل هرمي
- **الفائدة:** مظهر أكثر احترافية
- **في Production:** ✅ (`stable-ui-adoption-phase2-v1`)

### 19. UI Adoption Phase 3A (Layout الشامل للـ Dashboard)
- **ما أُضيف:** إعادة هيكلة layout الـ Dashboard، تحسينات تيبوغرافيا، KPI Cards، Stats Grid
- **الفائدة:** صفحة أكثر تنظيماً وقراءة
- **في Production:** ✅ (`stable-ui-adoption-phase3a-v1`)

### 20. UI Adoption Phase 3B — Executive Hero (الجزء العلوي التنفيذي)
- **ما أُضيف:** `db-exec-topbar` (tagline + refresh)، `db-exec-hero-metrics` (3 أرقام مالية فورية)، accent border أزرق
- **الفائدة:** نظرة مالية فورية أعلى الصفحة قبل الوصول إلى KPI cards
- **في Production:** ✅ (`stable-ui-adoption-phase3b-v1`) — **Production HEAD**

### 21. Cheques Improvements v1 (تحسينات نموذج الشيكات)
- **ما أُضيف:** Zod validation للعملة والتواريخ ورقم الشيك، 10 بنوك كويتية كـ select، تحسين UX
- **الفائدة:** منع إدخال بيانات غير صالحة
- **في Production:** ✅ (`stable-cheques-improvements-v1`)

### 22. Dev Backend Watch (Hot-Reload للخلفية)
- **ما أُضيف:** Hot-reload للـ Backend في وضع التطوير Electron
- **الفائدة:** تسريع دورة التطوير
- **في Production:** ✅ (`stable-dev-backend-watch`)

---

## Production Releases

جميع الـ Stable Tags مع التواريخ والـ Commits.

| الـ Tag | التاريخ | الـ Commit | الوصف |
|--------|---------|-----------|-------|
| `stable-dashboard-electron` | 2026-06-07 | غير موثق | أول Dashboard مستقر مع Electron |
| `stable-manarerp-v1` | 2026-06-07 | غير موثق | أول إصدار من النظام الكامل |
| `stable-accounting-v1` | 2026-06-07 | `985eee3` | وحدة المحاسبة الأولى |
| `stable-accounting-v2-f7d8dda` | 2026-06-07 | `f7d8dda` | المحاسبة + إصلاح مسار DB الإنتاجي |
| `stable-backup-restore-v1` | 2026-06-07 | `841d779` | النسخ الاحتياطي والاستعادة |
| `stable-roles-permissions-v1` | 2026-06-07 | `b8d55f7` | نظام RBAC الكامل |
| `stable-reports-center-v1` | 2026-06-07 | `1c6a1e3` | مركز التقارير والتصدير |
| `stable-executive-dashboard-v2` | 2026-06-07 | `97f9a20` | Dashboard التنفيذي v2 |
| `stable-dev-backend-watch` | 2026-06-07 | `945cfdd` | Backend Hot-Reload |
| `stable-payroll-system-v1` | 2026-06-08 | `be6ed0f` | نظام الرواتب |
| `stable-inventory-phase-a-v1` | 2026-06-08 | `a462dd8` | المخزون Phase A |
| `stable-inventory-phase-b-v1` | 2026-06-08 | `5d17d1b` | المخزون Phase B |
| `stable-inventory-phase-c-v1` | 2026-06-08 | `971a818` | المخزون Phase C |
| `stable-inventory-system-v1` | 2026-06-08 | `1301dc3` | نظام المخزون الكامل |
| `stable-i18n-phase1-v1` | 2026-06-08 | `3b6f1b1` | i18n Phase 1 |
| `stable-i18n-phase2-v1` | 2026-06-08 | `2d981ec` | i18n Phase 2 |
| `stable-i18n-phase3-v1` | 2026-06-08 | `c770364` | i18n Phase 3 |
| `stable-i18n-phase4-v1` | 2026-06-08 | `dd2735d` | i18n Phase 4 |
| `stable-i18n-phase5-v1` | 2026-06-08 | `82cb27a` | i18n Phase 5 — ترجمة كاملة |
| `stable-cheques-management-v1` | 2026-06-08 | `d87cd22` | إدارة الشيكات v1 |
| `stable-cheques-management-v1.1` | 2026-06-08 | `e032ee5` | إصلاح nullable fields |
| `stable-data-import-phase1-v1` | 2026-06-08 | `d196544` | استيراد البيانات Phase 1 |
| `stable-employee-import-extended-fields-v1` | 2026-06-08 | `7ac035a` | استيراد موظفين موسّع |
| `stable-cheques-enhancement-phase1-v1` | 2026-06-09 | `be229d3` | تحسينات الشيكات Phase 1 |
| `stable-cheques-tafqeet-v1` | 2026-06-09 | `68026f4` | التفقيط العربي |
| `stable-alerts-dedup-v1` | 2026-06-09 | `daefb6b` | إصلاح تكرار التنبيهات |
| `stable-audit-log-viewer-v1` | 2026-06-09 | `372e657` | عارض سجل التدقيق |
| `stable-cheques-improvements-v1` | 2026-06-09 | `c9d719e` | تحسينات نموذج الشيكات |
| `stable-cheques-print-output-v1` | 2026-06-09 | `6073785` | طباعة الشيكات |
| `stable-page-level-improvements-v1` | 2026-06-09 | `08cc8e3` | تحسينات واجهة المستخدم |
| `stable-ui-adoption-phase1-v1` | 2026-06-09 | `be46010` | توحيد نظام التصميم Phase 1 |
| `stable-ui-adoption-phase2-v1` | 2026-06-10 | `5d2a0b9` | تجديد Dashboard البصري |
| `stable-ui-adoption-phase3a-v1` | 2026-06-10 | `4f6a906` | Layout Dashboard Phase 3A |
| **`stable-ui-adoption-phase3b-v1`** | **2026-06-10** | **`69d931b`** | **Executive Hero — CURRENT** |

---

## Database Evolution

### هيكل قاعدة البيانات الكامل

تعتمد قاعدة البيانات على SQLite مع Prisma ORM. الـ Enums تُخزّن كنص ويُحقق منها Zod (SQLite لا يدعم enum مباشرة).

### جداول RBAC والمستخدمين

| الجدول | الغرض |
|--------|-------|
| `users` | حسابات الدخول، مرتبطة بدور واختياريًا بموظف |
| `roles` | 7 أدوار — SYSTEM_ADMIN يتجاوز جميع الفحوصات |
| `permissions` | 93 صلاحية بصيغة `<module>.<action>` |
| `role_permissions` | M2M join بين الأدوار والصلاحيات |

### جداول الموارد البشرية

| الجدول | الغرض | أُضيف |
|--------|-------|-------|
| `employees` | الموظفون مع كل البيانات الرسمية | Initial |
| `attendance` | سجلات الحضور اليومية، unique(employeeId, date) | Initial |
| `leaves` | طلبات الإجازة + الاعتماد | Initial |
| `deductions` | خصومات فردية | Initial |
| `bonuses` | مكافآت فردية | Initial |
| `payroll` | كشوف الرواتب الشهرية، unique(employeeId, month, year) | Initial |
| `payroll_lines` | بنود الراتب (BASE/ALLOWANCE/DEDUCTION/ADVANCE/OVERTIME) | 2026-06-08 |
| `employee_allowances` | بدلات متكررة بالموظف | 2026-06-08 |
| `employee_recurring_deductions` | خصومات متكررة بالموظف | 2026-06-08 |
| `payroll_advances` | سلف الرواتب مع رصيد متبقي | 2026-06-08 |
| `performance_reviews` | تقييمات الأداء بالفترة | Initial |
| `salary_payments` | سجل دفعات الرواتب المستوردة من البنك | 2026-06-08 |

### جداول المعدات والصيانة

| الجدول | الغرض |
|--------|-------|
| `equipment` | الأسطول — نوع، سائق، لوحة، رخصة تشغيل، حالة |
| `maintenance_records` | سجل الصيانة + تنبيهات الصيانة الدورية |
| `fuel_logs` | استهلاك الوقود |
| `breakdowns` | الأعطال وحلولها |
| `spare_part_usage` | قطع الغيار المستخدمة |

### جداول العقود والفواتير

| الجدول | الغرض |
|--------|-------|
| `customers` | العملاء (GOVERNMENT/PRIVATE) — أرشفة بدل حذف |
| `suppliers` | الموردون — أرشفة بدل حذف |
| `contracts` | عقود نقل الأسفلت الشهرية |
| `contract_documents` | مستندات مرفقة بالعقود |
| `invoices` | فواتير موحّدة — SALES/PURCHASE عبر حقل direction |
| `invoice_items` | بنود الفواتير |
| `payments` | دفعات/تحصيلات الفواتير |
| `expenses` | المصروفات التشغيلية + اعتماد |

### جداول المحاسبة

| الجدول | الغرض | أُضيف |
|--------|-------|-------|
| `transactions` | القيود المبسطة (debit/credit) مع referenceType | Initial |
| `accounts` | شجرة الحسابات (Chart of Accounts) | 2026-06-07 |
| `journal_entries` | قيود اليومية المزدوجة | 2026-06-07 |
| `journal_entry_lines` | سطور المدين/الدائن | 2026-06-07 |

### جداول المخزون

| الجدول | أُضيف |
|--------|-------|
| `inventory_categories` | 2026-06-08 Phase A |
| `materials` | 2026-06-08 Phase A |
| `purchase_orders` | 2026-06-08 Phase B |
| `purchase_order_items` | 2026-06-08 Phase B |
| `goods_receipts` | 2026-06-08 Phase B |
| `goods_receipt_items` | 2026-06-08 Phase B |
| `material_issues` | 2026-06-08 Phase C |
| `material_issue_items` | 2026-06-08 Phase C |

### جداول النظام والشيكات

| الجدول | الغرض | أُضيف |
|--------|-------|-------|
| `audit_logs` | سجل كامل لكل العمليات | Initial |
| `backups` | سجل ملفات النسخ الاحتياطي | Initial |
| `settings` | إعدادات النظام (key-value) | Initial |
| `cheques` | إدارة الشيكات الصادرة | 2026-06-08 |

### قرارات التصميم الرئيسية

1. **الفواتير الموحّدة:** جدول `invoices` واحد مع `direction = SALES | PURCHASE` بدل جدولين
2. **الأرشفة بدل الحذف:** `isArchived` على customers و suppliers لحفظ التاريخ المالي
3. **Soft Delete vs Hard Delete:** العلاقات المرجعية المهمة محمية بـ `onDelete: Restrict`، التابعة تُحذف تلقائيًا (Cascade)
4. **الربط المالي التلقائي:** إنشاء فاتورة/اعتماد مصروف/صرف راتب → قيد محاسبي ذري
5. **SQLite + Enums:** القيم تُخزّن كـ String ويُحقق منها Zod بدل DB-level enum

---

## Security Evolution

### طبقات الأمان المطبقة

#### 1. المصادقة (Authentication)
- JWT tokens بصلاحية 12 ساعة
- كلمات المرور مشفرة بـ bcryptjs
- Helmet.js على جميع responses
- Token تُحفظ في localStorage وتُرسل عبر Authorization: Bearer
- Electron session يُزامن مع Backend عبر IPC session

#### 2. التفويض (Authorization — RBAC)
- middleware: `authenticate` → `requirePermission(key)` على كل route
- `SYSTEM_ADMIN` يتجاوز جميع فحوصات الصلاحيات
- كل صلاحية مُعرّفة في `constants.ts` قبل الاستخدام
- الصلاحيات مخزّنة في DB — قابلة للتعديل بدون تغيير الكود

#### 3. سجل التدقيق (Audit Logging)
- تمت إضافته من اليوم الأول (Initial commit)
- جميع العمليات: CREATE / UPDATE / DELETE / APPROVE / CANCEL / PRINT
- مرتبطة بـ userId + module + entityId
- عارض frontend أُضيف في (`stable-audit-log-viewer-v1` — 2026-06-09)

#### 4. التحقق من المدخلات
- Zod schemas على كل request body
- `validate` middleware يطبق الـ schema قبل الوصول للـ controller
- حقول Enum تُتحقق منها Zod (SQLite لا يدعم enum native)

#### 5. أمان الـ IPC (Electron)
- `contextBridge` — context isolation مفعّل
- `window.manar.*` هي النقاط الوحيدة المكشوفة للـ renderer
- Token تُزامن من renderer إلى main process بأمان
- لا `nodeIntegration` في renderer

#### 6. Port Policy
- Backend يعمل على `127.0.0.1:48211` فقط (localhost، غير مكشوف للشبكة)
- EADDRINUSE يعالج بإعادة تشغيل graceful

#### 7. Rate Limiting
**غير موجود** — لم يُوثَّق في git log أو التوثيق

---

## UI Evolution

### Dashboard v1 (Initial — 2026-06-06/07)

- Dashboard بسيط مع Charts.js
- وحدة المستندات أُنشئت ثم أُزيلت سريعاً (`4e7bf9e` → `1bbb936`)
- KPI cards أساسية

### Executive Dashboard v2 (2026-06-07 — `stable-executive-dashboard-v2`)

- Unified endpoint `/dashboard/executive`
- KPI cards مالية (إيرادات، مصروفات، أرباح، فواتير)
- Recharts: Revenue Chart + Contract Status Chart
- تنبيهات عاجلة (Alert Panel)
- قائمة العقود مع Progress bars
- جداول آخر الفواتير والمصروفات
- بطاقات الحضور

### i18n Integration (2026-06-08 — Phases 1–5)

- `useT()` hook — كل النصوص via DICT (AR + EN)
- Toggle اللغة من الشريط العلوي
- RTL/LTR يتغير ديناميكياً
- 1800+ مفتاح ترجمة في `i18n.ts`

### UI Adoption Phase 1 (2026-06-09 — `stable-ui-adoption-phase1-v1`)

- ترحيل 5 متغيرات CSS من hardcoded hex إلى global tokens:
  - `--db-blue` → `var(--accent)`
  - `--db-green` → `var(--green)`
  - `--db-amber` → `var(--amber)`
  - `--db-red` → `var(--red)`
  - `--db-radius` → `var(--radius)`
- إنشاء `DESIGN.md` — 814-line design system guide
- ~35 قيمة hex مستبدلة بـ `var(--db-*)`

### UI Adoption Phase 2 (2026-06-10 — `stable-ui-adoption-phase2-v1`)

- تجديد التصميم البصري للـ Dashboard
- تحسين بطاقات KPI والـ Stats Grid
- تحسين التباعد والتسلسل الهرمي البصري

### UI Adoption Phase 3A (2026-06-10 — `stable-ui-adoption-phase3a-v1`)

- إعادة هيكلة layout كاملة للـ Dashboard
- Executive Alert Widgets — 4 بطاقات تشغيلية
- Hero panel هيكل ثنائي الأعمدة

### UI Adoption Phase 3B — Executive Hero (2026-06-10 — `stable-ui-adoption-phase3b-v1`)

- **`db-exec-topbar`:** شريط علوي — system tagline + refresh control
- **`db-exec-hero-metrics`:** 3 أرقام مالية فورية (إيرادات / ربح / مستحقات)
- **Border-top أزرق** `rgba(37, 99, 235, 0.5)` — accent بصري احترافي
- Skeleton animation أثناء التحميل
- RTL-safe: `padding-inline`, `border-inline`

---

## Current Production State

| الحقل | القيمة |
|-------|--------|
| **Branch** | `production` |
| **Production HEAD** | `69d931b` — Merge feature/ui-adoption-phase3b-dashboard-hero |
| **Latest Stable Tag** | `stable-ui-adoption-phase3b-v1` |
| **آخر مرحلة مدموجة** | UI Adoption Phase 3B — Dashboard Executive Hero |
| **Remote Sync** | `origin/production` — up to date |
| **DB State** | Operational reset 2026-06-09 — seed data only |
| **Active Feature Branches** | لا يوجد — clean |
| **TypeScript Status** | ✅ Zero errors (frontend + backend + electron) |
| **Build Status** | ✅ frontend + backend builds pass |

### الوحدات في Production الآن

| الوحدة | Backend | Frontend | الحالة |
|--------|---------|---------|--------|
| Auth | ✅ | ✅ | مكتمل |
| Dashboard | ✅ | ✅ | مكتمل — Executive Hero Phase 3B |
| Customers | ✅ | ✅ | مكتمل |
| Employees | ✅ | ✅ | مكتمل |
| Attendance | ✅ (schema) | — | Schema فقط — لا frontend |
| Payroll | ✅ | ✅ | مكتمل — Salaries.tsx |
| Equipment | ✅ | ✅ | مكتمل |
| Maintenance | ✅ | — | Backend فقط — لا frontend |
| Contracts | ✅ | ✅ | مكتمل |
| Invoices | ✅ | ✅ | مكتمل — Invoices.tsx |
| Suppliers | ✅ | ✅ | مكتمل |
| Expenses | ✅ | ✅ | مكتمل |
| Accounting | ✅ | ✅ | مكتمل — Accounting.tsx |
| Reports | ✅ | ✅ | مكتمل — 9 أنواع تقارير |
| Users & Roles | ✅ | ✅ | مكتمل — Users.tsx |
| Audit | ✅ | ✅ | مكتمل — AuditLog.tsx |
| Backups | ✅ | ✅ | مكتمل — Backup.tsx |
| Settings | ✅ | ✅ | مكتمل — Settings.tsx |
| Cheques | ✅ | ✅ | مكتمل — تفقيط + طباعة |
| Inventory | ✅ | ✅ | مكتمل — 3 phases |
| Data Import | ✅ | ✅ | مكتمل — موظفين + عملاء + معدات |

---

## Deferred / Planned Features

### 1. معايرة الشيكات الفيزيائية (Cheques Print Calibration Phase 3)

**السبب:** طباعة الشيك على ورق Gulf Bank الفعلي تحتاج قياسات دقيقة للأبعاد
**ما تبقى:** إضافة `@page { size: <W>mm <H>mm }` + ضبط `top/left/width` بالنسب المئوية
**الوضع:** **محظور التنفيذ** — يتطلب ورق شيك بنكي فعلي للاختبار

### 2. صفحة Attendance (الحضور)

**السبب:** البنية التحتية موجودة في Backend، لكن لا frontend page
**الوضع:** مؤجل — غير مذكور في خطة عمل فورية

### 3. صفحة Maintenance (الصيانة)

**السبب:** Backend موجود (routes + controller + service)، لكن لا frontend page
**الوضع:** مؤجل

### 4. تحسينات تشغيلية صغيرة

**السبب:** إصلاحات وتحسينات في الاستخدام اليومي
**الوضع:** مستمر — يُكتشف أثناء الاستخدام

> جميع هذه البنود مأخوذة حصرًا من PROJECT_STATE.md — لا توقعات.

---

## Architecture Summary

### Frontend

```
Electron Renderer (file://) → HashRouter → React Pages
  ├── api/client.ts    Axios instance + JWT interceptor + token refresh
  ├── stores/          Zustand (authStore + uiStore)
  ├── lib/i18n.ts      AR/EN dictionary + useT() hook
  ├── config/modules   Data-driven CRUD (ResourcePage pattern)
  └── components/
       ├── Layout.tsx          Sidebar + Topbar + Theme + Lang toggle
       ├── DataTable.tsx        Reusable grid: search + sort + pagination
       ├── FormDialog.tsx       Generic modal form builder
       ├── ProtectedRoute.tsx   RBAC guard (hasPermission)
       └── dashboard/           KPICard, OpsCard, AlertPanel, Charts, Skeleton
```

**HashRouter** إلزامي — Electron تُحمّل `index.html` عبر `file://`.

### Backend

```
Express REST API → 127.0.0.1:48211
  ├── core/middleware/   authenticate → requirePermission → validate → asyncHandler
  ├── core/errors/       AppError + global errorHandler
  ├── modules/           21 business module (routes → controller → service → schema)
  └── shared/            BaseRepository + ExcelService + PDFService + BackupService
```

**Response format موحّد:**
```json
{ "success": true, "data": {...} }
{ "success": false, "error": "message" }
```

### Electron

```
main.ts
  ├── backendLauncher.ts    Fork Express as child process (dev: tsx / prod: node dist/)
  ├── backupScheduler.ts    node-cron automatic backups
  ├── backup.ipc.ts         backup:create | backup:restore | backup:getDatabasePath
  ├── dialog.ipc.ts         File open/save dialogs
  ├── session.ipc.ts        JWT sync renderer → main
  └── mainWindow.ts         BrowserWindow 1440×900 min 1024×680
```

**preload.ts** يكشف `window.manar.*` عبر contextBridge — context isolation مفعّل.

### Database

- **Engine:** SQLite — ملف واحد `.db`
- **ORM:** Prisma 5.18.0
- **مسار Development:** `backend/data/manar.db`
- **مسار Production:** `userData/data/manar.db` (AppData\Roaming\نظام المنار\data\)
- **Schema:** 37+ model في `backend/prisma/schema.prisma`
- **Migrations:** مجلد `backend/prisma/migrations/`
- **Seed:** 7 أدوار + 93 صلاحية + 285 ربط role-permission + مستخدم admin + 11 إعداد

### Authentication

```
User Login → POST /api/auth/login
  → bcryptjs.compare(password, hash)
  → JWT.sign({ userId, role, permissions }, JWT_SECRET, { expiresIn: '12h' })
  → Token → localStorage (renderer)
  → Axios Bearer header on every request
  → authenticate middleware: JWT.verify → load user + permissions
  → requirePermission('module.action') → check permissions[]
  → SYSTEM_ADMIN: bypass all checks
```

### Permissions

```
constants.ts (source of truth)
  → MODULES: dashboard | customers | employees | payroll | ...
  → ACTIONS: read | create | update | delete | approve | export | pay | generate

Permission key format: '<module>.<action>'
  e.g.: 'invoices.create', 'payroll.approve', 'employees.view'

Validation chain:
  Route → authenticate → requirePermission(key) → hasPermission check
  Frontend: useAuth().hasPermission(key) → show/hide elements
```

---

## Final Assessment

### مستوى النضج

**المستوى: متقدم للإنتاج المحلي**

النظام اجتاز مرحلة التطوير السريع ودخل مرحلة الصيانة والتحسين. جميع الوحدات الجوهرية مبنية ومختبرة ومدمجة. التوثيق متكامل (AGENTS.md + CLAUDE.md + docs/ + PROJECT_STATE.md).

### الجاهزية التشغيلية

| الجانب | التقييم |
|--------|---------|
| البنية الأساسية | ✅ جاهزة — Electron + Express + SQLite |
| RBAC والأمان | ✅ مكتمل — 7 أدوار، 93 صلاحية، JWT |
| النسخ الاحتياطي | ✅ تلقائي + يدوي + IPC export |
| التوثيق | ✅ ممتاز — AGENTS.md + CLAUDE.md + docs/ |
| الاستقرار | ✅ جميع builds تمر + TypeScript zero errors |
| التدقيق | ✅ AuditLog كامل مع viewer |
| i18n | ✅ عربي + إنجليزي 1800+ مفتاح |
| الواجهة | ✅ Dark theme + RTL + تصميم موحد |
| DB Reset | ✅ قاعدة بيانات نظيفة (2026-06-09) |

### أهم نقاط القوة

1. **بنية معمارية نظيفة** — Module pattern صارم (routes → controller → service → schema) يجعل إضافة وحدات جديدة سهلة ومتسقة
2. **نظام تصميم موحد** — CSS tokens + DESIGN.md يضمن اتساق المظهر
3. **RBAC مرن** — الصلاحيات مخزّنة في DB وقابلة للتعديل من الواجهة
4. **audit trail كامل** — كل عملية موثقة
5. **offline-first** — يعمل بدون إنترنت تمامًا
6. **workflow محكم** — 20-خطوة dev workflow مع pre/stable tags لكل feature
7. **i18n مكتمل** — انتقال فوري بين العربية والإنجليزية بدون reload
8. **نسخ احتياطي تلقائي** — node-cron يحمي البيانات تلقائيًا

### أهم التحسينات المستقبلية

1. **صفحة Attendance frontend** — Backend موجود، يحتاج فقط UI
2. **صفحة Maintenance frontend** — Backend موجود، يحتاج فقط UI
3. **معايرة طباعة الشيكات** — محظورة حتى توفّر ورق بنكي فعلي
4. **Rate Limiting** — لم يُطبَّق بعد على API
5. **Unit Tests** — Vitest متاح لكن التغطية غير موثقة
6. **PDF Arabic Font** — يحتاج ملف `Amiri-Regular.ttf` للـ PDF العربي الصحيح
7. **Bundle Size** — chunk يتجاوز 500KB (تحذير Vite موجود) — يحتاج code splitting مستقبلاً

---

*التقرير أُنشئ بتاريخ 2026-06-10 — مصدره: git log الكامل + PROJECT_STATE.md + AGENTS.md + README.md + docs/.*
*آخر Production HEAD عند إنشاء التقرير: `69d931b` — `stable-ui-adoption-phase3b-v1`*
