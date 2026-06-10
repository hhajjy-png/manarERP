# STITCH_FULL_REWRITE_AUDIT.md

> تقرير التدقيق الأولي — تجربة Stitch Full UI Rewrite
> الفرع: `feature/stitch-full-ui-rewrite`
> تاريخ التقرير: 2026-06-10
> Checkpoint Tag: `pre-stitch-full-ui-rewrite`

---

## 1. الملفات الموجودة في Stitch Export

**الملف**: `docs/superpowers/designs/stitch/stitch_manarerp_modern_ui_templates.zip`

| المجلد | HTML | PNG |
|--------|------|-----|
| `dashboard_template` | ✅ | ✅ |
| `dashboard_template_light_sidebar` | ✅ | ✅ |
| `dashboard_mobile_light_sidebar_logo` | ✅ | ✅ |
| `dashboard_themed_fixed` | ❌ | ✅ |
| `employees_template` | ✅ | ✅ |
| `employees_template_light_sidebar_2` | ✅ | ✅ |
| `employees_mobile_light_sidebar_logo` | ✅ | ✅ |
| `employees_mobile_light_sidebar_unified` | ✅ | ✅ |
| `employees_mobile_themed_fixed` | ✅ | ✅ |
| `employees_template_updated_logo` | ❌ | ✅ |
| `employees_template_light_sidebar_1` | ❌ | ✅ |
| `contracts_template` | ❌ | ✅ |
| `contracts_template_updated_logo` | ✅ | ✅ |
| `contracts_template_light_sidebar` | ❌ | ✅ |
| `contracts_template_unified_stats_style` | ✅ | ✅ |
| `contracts_mobile_light_sidebar_logo` | ✅ | ✅ |
| `invoices_template` | ✅ | ✅ |
| `invoices_template_light_sidebar` | ✅ | ✅ |
| `invoices_mobile_light_sidebar_logo` | ✅ | ✅ |
| `expenses_template` | ✅ | ✅ |
| `expenses_template_light_sidebar` | ❌ | ✅ |
| `expenses_mobile_light_sidebar_unified` | ✅ | ✅ |
| `suppliers_template` | ✅ | ✅ |
| `suppliers_template_light_sidebar` | ✅ | ✅ |
| `suppliers_mobile_light_sidebar_unified` | ✅ | ✅ |
| `equipment_template_light_sidebar` | ✅ | ✅ |
| `equipment_mobile_light_sidebar_logo` | ✅ | ✅ |
| `payroll_salaries_template_light_sidebar` | ✅ | ✅ |
| `payroll_salaries_template_enlarged_logo_matched_background` | ✅ | ✅ |
| `payroll_mobile_light_sidebar_unified` | ✅ | ✅ |
| `reports_center_template` | ✅ | ✅ |
| `reports_center_template_light_sidebar` | ✅ | ✅ |
| `reports_center_template_enlarged_logo` | ✅ | ✅ |
| `reports_center_mobile_with_official_logo` | ✅ | ✅ |
| `reports_mobile_light_sidebar_logo` | ✅ | ✅ |
| `audit_log_template` | ❌ | ✅ |
| `audit_log_template_light_sidebar` | ✅ | ✅ |
| `audit_log_mobile_light_sidebar_unified` | ✅ | ✅ |
| `cheques_template` | ✅ | ✅ |
| `customers_template` | ✅ | ✅ |
| `design.md` | — | — |
| `manar_premium_erp/DESIGN.md` | — | — |
| `obsidian/DESIGN.md` | — | — |
| `glacier/DESIGN.md` | — | — |

**الإجمالي**: 141 ملف في 44 مجلد — 30+ ملف HTML قابل للتحليل

---

## 2. هل Stitch React أم HTML/CSS؟

**الإجابة**: HTML + Tailwind CSS (CDN) فقط — بدون أي React.

- كل template هو ملف `code.html` واحد مكتفٍ بذاته
- يستخدم **Tailwind CSS** عبر `https://cdn.tailwindcss.com`
- يستخدم **Material Symbols** (Google Fonts)
- يستخدم **Cairo** (Google Fonts)
- لا TypeScript، لا React، لا components، لا state management
- البيانات كلها static (hardcoded)

---

## 3. العناصر القابلة للنقل مباشرة

| العنصر | الوضع | ملاحظة |
|--------|-------|--------|
| **CSS Design Tokens** | ✅ موجود بالفعل | `theme.css` يطابق Stitch tokens تماماً |
| **Card structure** | ✅ موجود | `.card` matches Stitch exactly |
| **Button variants** | ✅ موجود | `.btn`, `.btn.secondary`, `.btn.danger`, `.btn.sm` |
| **Pills** | ✅ موجود | `.pill.green/amber/red/blue/gray` |
| **Table structure** | ✅ موجود | `thead/tbody`, hover, borders |
| **Toolbar pattern** | ✅ موجود | `.toolbar` matches |
| **Form fields** | ✅ موجود | `.field`, `.form-grid`, `.err` |
| **Modal structure** | ✅ موجود | `.modal`, `.modal-head/body/foot` |
| **RTL layout** | ✅ موجود | `inset-inline-start`, `margin-inline-start` |
| **Cairo font** | ✅ موجود | في `index.html` |
| **Pagination** | ✅ موجود | `.pagination`, `.pg-btns` |

---

## 4. العناصر التي تحتاج إعادة بناء/تعديل

| العنصر | الوضع الحالي | المستهدف | الجهد |
|--------|-------------|---------|-------|
| **لون الـ Sidebar** | دائماً داكن `#0f172a` | أبيض فاتح `var(--surface)` في light mode | 🟡 متوسط — CSS only |
| **الـ Topbar** | `layout-polish.css` يجعله شبه شفاف + داكن | Glass effect فاتح | 🟡 متوسط — CSS only |
| **Dashboard CSS** | 1269 سطر CSS داكن (`.db-page`) | Light theme بدون dark overrides | 🟡 متوسط — CSS variables override |
| **Nav Icons** | Emoji (`📊`, `📄`, `👥`...) | Material Symbols (`dashboard`, `description`, `groups`...) | 🟡 متوسط — update strings + rendering |
| **Logo** | نص "م" (text) | Logo image (لا يوجد ملف صورة محلي) | 🟢 منخفض — نص محسّن كافٍ |
| **Glass effect topbar** | `backdrop-filter: blur(10px)` داكن | `backdrop-filter: blur(8px)` فاتح | 🟢 منخفض — CSS only |
| **Active nav style** | Gradient أزرق | خلفية زرقاء خفيفة + border indicator | 🟢 منخفض — CSS only |
| **Material Symbols offline** | — | CDN يعمل في dev فقط | 🔴 محظور في production |

---

## 5. التوافق والمخاطر

### RTL/i18n
- ✅ `theme.css` يستخدم logical CSS properties (`margin-inline-start`, `inset-inline-start`) — RTL-safe بالكامل
- ✅ `i18n.ts` غير مأثر — التغييرات بصرية فقط
- ⚠️ يجب التحقق من أن Material Symbols لا تكسر RTL alignment في الـ nav

### RBAC
- ✅ لا تأثير على RBAC — التغييرات في CSS وعرض الأيقونات فقط
- ✅ `hasPermission` checks في Layout.tsx غير مأثرة

### Electron
- ✅ theme.css + stitch-full.css → plain CSS، يعمل مع `file://` protocol
- ⚠️ **Material Symbols (CDN)** لن يعمل offline في production Electron! يعمل فقط في dev mode مع Vite server أو إذا كان هناك اتصال إنترنت
- 🔴 إذا انتقلنا للإنتاج، يجب تحميل Material Symbols locally

### القدرة على التراجع
- ✅ التصميم الجديد محصور في `.stitch-full-theme` class
- ✅ لإزالة Stitch theme: إزالة class من `.app` في Layout.tsx وحذف import `stitch-full.css`
- ✅ التصميم القديم لا يُحذف — `dashboard.css` و `layout-polish.css` لا تُحذف

---

## 6. خطة التنفيذ على مراحل

### المرحلة 1 — CSS Override Layer (المرحلة الحالية)

**الهدف**: تطبيق تصميم Stitch بصرياً بدون تعديل منطق الـ React

| الملف | الإجراء |
|-------|---------|
| `frontend/index.html` | إضافة Material Symbols font link |
| `frontend/src/styles/stitch-full.css` | **إنشاء** — CSS override layer |
| `frontend/src/main.tsx` | إضافة `import '../styles/stitch-full.css'` |
| `frontend/src/config/modules.tsx` | تحديث icons من emoji إلى Material Symbol names |
| `frontend/src/components/Layout.tsx` | إضافة `stitch-full-theme` class + Material Symbol rendering |

**الوقت المتوقع**: ساعة واحدة

### المرحلة 2 — Dashboard Light Theme (مستقبلية)

- إعادة بناء `Dashboard.tsx` باستخدام light theme بدون `.db-page` dark overrides
- استبدال KPI cards بتصميم Stitch العلني
- استبدال الـ Hero panel بتصميم `dashboard_template_light_sidebar`

### المرحلة 3 — Page-Level Alignment (مستقبلية)

- تحديث الصفحات لاستخدام Material Symbols في أماكن أخرى (alerts, status icons)
- تحسين Stats grid ليطابق تصميم Stitch بالضبط
- Material Symbols offline (تحميل الـ font files محلياً)

---

## 7. قرار المرحلة 1

بما أن `theme.css` يحتوي بالفعل على نظام تصميم Stitch كاملاً، التنفيذ يتلخص في:

1. **تغيير لون الـ Sidebar** من dark navy إلى light surface (CSS بحت)
2. **تحديث الـ Topbar** من dark glass إلى light glass (CSS بحت)
3. **تعطيل dashboard dark overrides** (CSS override)
4. **تبديل الأيقونات** من emoji إلى Material Symbols

هذا يعني أن **95% من كود React لا يتغير**. التغييرات في CSS فقط + icon names.
