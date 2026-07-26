# PROJECT PRICES PHASE 1 — Audit Document

**Date:** 2026-06-10  
**Branch:** feature/prices-and-invoice-custom-fields  
**Status:** Implementation complete, builds passing

---

## 1. هل وجد Model سابق؟

لا. لم يكن هناك model لإدارة الأسعار في schema.prisma.  
نموذج `Contract` يحتوي على حقول `unitName`، `price`، `companyName` لكنها خاصة بالعقد الواحد وليست قاعدة أسعار مستقلة.

---

## 2. Model الجديد

```prisma
model ProjectPrice {
  id               Int     @id @default(autoincrement())
  asphaltPlant     String
  companyName      String
  contractLocation String
  contractUnit     String  // طن | درب | يومية
  unitPrice        Float
  isArchived       Boolean @default(false)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@index([isArchived])
  @@index([asphaltPlant])
  @@index([companyName])
  @@map("project_prices")
}
```

---

## 3. Migration

- **الأداة المستخدمة:** `prisma db push` (non-interactive environment)
- **ملف migration رسمي:** `backend/prisma/migrations/20260610140000_add-project-prices/migration.sql`
- **الحالة:** مطبّق على `backend/data/manar.db`

---

## 4. Routes

```
GET    /api/prices          — prices.read
POST   /api/prices          — prices.create
PATCH  /api/prices/:id      — prices.update
DELETE /api/prices/:id      — prices.delete (soft delete via isArchived)
```

---

## 5. Permissions

| المفتاح | الدور | ملاحظة |
|---|---|---|
| prices.read | SYSTEM_ADMIN, GENERAL_MANAGER, PROJECT_MANAGER, ACCOUNTANT, STANDARD_USER | — |
| prices.create | SYSTEM_ADMIN, GENERAL_MANAGER, PROJECT_MANAGER | — |
| prices.update | SYSTEM_ADMIN, GENERAL_MANAGER, PROJECT_MANAGER | — |
| prices.delete | SYSTEM_ADMIN, GENERAL_MANAGER, PROJECT_MANAGER | — |

---

## 6. الملفات المضافة

### Backend
- `backend/src/modules/prices/prices.routes.ts`
- `backend/src/modules/prices/prices.controller.ts`
- `backend/src/modules/prices/prices.service.ts`
- `backend/src/modules/prices/prices.schema.ts`
- `backend/prisma/migrations/20260610140000_add-project-prices/migration.sql`

### Frontend
- `frontend/src/pages/Prices.tsx`

---

## 7. الملفات المعدلة

| الملف | التعديل |
|---|---|
| `backend/prisma/schema.prisma` | أضافة model ProjectPrice |
| `backend/src/config/constants.ts` | إضافة 'prices' إلى MODULES |
| `backend/src/app.ts` | تسجيل `/api/prices` route |
| `backend/prisma/seed.ts` | إضافة prices permissions + ربط بالأدوار |
| `frontend/src/App.tsx` | إضافة `/prices` route |
| `frontend/src/config/modules.tsx` | إضافة NAV entry (بعد contracts) |
| `frontend/src/lib/i18n.ts` | إضافة مفاتيح ar + en |
| `backend/src/modules/invoices/invoices.schema.ts` | تخفيف Zod لـ invoiceType و direction |
| `frontend/src/pages/Invoices.tsx` | إضافة خيار "أخرى" للنوع والاتجاه |

---

## 8. كيفية العمل

### صفحة الأسعار
1. المستخدم يفتح "الأسعار" من الشريط الجانبي
2. يرى جدول بالأسعار المخزنة مع فلاتر (مصنع، شركة، وحدة)
3. يضيف سعرًا جديدًا عبر Modal
4. يعدّل أو يحذف (أرشفة) من أعمدة الإجراءات
5. السعر يظهر بتنسيق العملة (د.ك)

### خيار "أخرى" في الفواتير
- نوع الفاتورة: اختيار "أخرى" → حقل نصي إضافي مطلوب → يُرسل النص المخصص للـ API
- الاتجاه: اختيار "أخرى" → حقل نصي إضافي + اختيار نوع الطرف (عميل/مورد) → يُرسل النص المخصص كـ direction

---

## 9. ما لم يتم ربطه بعد

- لا يوجد ربط بين `ProjectPrice` والعقود أو الفواتير (Phase 2)
- لا يوجد فلتر في قائمة الفواتير بالاتجاهات المخصصة
- صفحة الأسعار غير مرتبطة بـ `Contract.price` الحالي

---

## 10. نتائج الفحوصات

| الفحص | النتيجة |
|---|---|
| `npx prisma validate` | ✅ Valid |
| `cd frontend && npx tsc --noEmit` | ✅ No errors |
| `cd backend && npx tsc --noEmit` | ✅ No errors |
| `npx tsc -p electron/tsconfig.json --noEmit` | ✅ No errors |
| `npm run build:front` | ✅ Built in 4.76s |
| `npm run build:back` | ✅ Compiled successfully |
