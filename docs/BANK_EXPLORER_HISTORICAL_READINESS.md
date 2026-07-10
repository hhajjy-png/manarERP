# Bank Account Explorer — Historical Readiness Audit

> الحالة: **جاهز جزئيًا — بند مؤجَّل واحد موثَّق.** لا يُنفَّذ ضمن `Final Historical Readiness Closure Pack`.
> التاريخ: 2026-07-10
> القرار: توثيق دقيق + قفل السلوك الصحيح؛ لا إعادة هيكلة كبيرة قبل UAT.

---

## 1. لماذا يختلف Bank Explorer جوهريًا

مستكشف الحسابات البنكية **لا يشتقّ الأرصدة** من الفواتير/الدفعات مثل تقارير GL. بياناته مُستورَدة من كشوف
البنك، وكل صف يحمل عمود `balance` **مرجعيًا من البنك نفسه** — الرصيد الفعلي بعد تلك المعاملة. فلا ينطبق
عليه إشكال `paidAmount` (لا وجود له هنا)، والرصيد الجاري لكل صف **صحيح دائمًا** لأنه رصيد البنك الحقيقي.

نقاط النهاية:
- `GET /bank-accounts/:accountKey/dashboard` (`bankAccounts.service.getBankAccountDashboard`) — ملخص **كل الوقت** (بلا فلتر تاريخ).
- `GET /bank-statement-import/timeline/:accountKey` (`bankStatementImport.service.getTimeline`) — الجدول المُرقّم **مفلتَر بالفترة** + إجماليات.

---

## 2. Readiness Matrix

| المؤشر | الحالة | التفصيل (file:line) |
|---|---|---|
| **Movement (صافي حركة الفترة)** | ✅ صحيح | `getTimeline` L471-478: `filteredAgg` يجمع debit/credit بنفس `where` المفلتَر بالفترة. `buildTimelineWhere` L380-383 يضيف `statementDate: { gte: from, lte: to }` — **فلترة داخل Prisma**، مغطّاة باختبار `timelineFilters.test.ts:19`. |
| **Coverage Start (أول تاريخ حقيقي)** | ✅ صحيح | `getTimeline` L463-466: `agg` يجمع `_min/_max.statementDate` على `{ accountKey }` **كامل الحساب**، لا على `where` المفلتَر — فيبقى تاريخ التغطية الحقيقي لا بداية الفلتر (تعليق L464 يؤكّد ذلك). |
| **Running Balance** | ✅ صحيح | كل صف يعرض `t.balance` (L494) — رصيد البنك المرجعي بعد المعاملة، صحيح عند أي نقطة بغضّ النظر عن الفلتر. |
| **Filters (from/to, quick ranges)** | ✅ صحيح | الواجهة `BankAccountExplorer.tsx` تدفع `fromDate/toDate` إلى `timeline`؛ الفلترة تحدث في الـ backend. |
| **Export** | ✅ يطابق الشاشة | التصدير يستخدم نفس مجموعة `timeline` المفلتَرة. |
| **Opening Balance (للفترة)** | ⏳ **غير محسوب** | لا يوجد حقل «رصيد افتتاحي للفترة». `dashboard.openingBalance` (bankAccounts.service L176) هو رصيد **أول معاملة على الإطلاق** (كل الوقت)، لا رصيد ما قبل `fromDate`. |
| **Closing Balance (للفترة)** | ⏳ **غير محسوب** | نظير Opening — `dashboard.closingBalance` L177 هو رصيد آخر معاملة كل الوقت. |
| **ربط الفترة العامة** | ⏳ **مستقل** | الصفحة تستخدم فلاتر تاريخ محلية خاصة، وغير مربوطة بـ `FinancialPeriodContext` العام (مقصود في الجولة السابقة). |

**الخلاصة:** ثلاثة من أصل خمسة مطالب الفترة **صحيحة أصلًا** (Movement, Coverage Start, Running Balance). الفجوة الوحيدة:
ملخص **رصيد افتتاحي/ختامي مُعنون للفترة المختارة**.

---

## 3. لماذا التأجيل لا الإصلاح المتسرّع

إضافة Opening/Closing للفترة ليست «إصلاحًا صغيرًا آمنًا»؛ إنها ميزة مصغّرة متعددة الطبقات:

1. **Backend:** استعلاما `findFirst` إضافيان (آخر رصيد قبل `fromDate` = الافتتاحي؛ آخر رصيد ≤ `toDate` = الختامي)،
   مع معالجة حالة `balance = null` (ليست كل الاستيرادات تحمل عمود رصيد) ومفتاح ترتيب ثانوي حتمي عند تساوي التاريخ.
2. **Types + Frontend:** حقول جديدة في `TimelineResult` + عرضها في `KpiRow`/`AccountHealthCard`.
3. **قرار دلالي:** حين لا يوجد رصيد بنكي قبل `fromDate` (أول فترة للحساب)، هل الافتتاحي = 0 أم = رصيد أول صف ناقص حركته؟
   يحتاج قرار UX صريحًا.
4. **الصفحة معقّدة** (calibrator، reconciliation، timeline) وخارج الصفحات الأساسية الست — إعادة لمسها قبل UAT مخاطرة غير مبرَّرة.

القاعدة في التكليف صريحة: «إن كانت البنية الحالية لا تسمح بإصلاح آمن ومحدود: وثّق … لا تنفذ إعادة هيكلة كبيرة دون توقف.»

---

## 4. تصميم مقترح للحزمة اللاحقة (لا يُنفَّذ الآن)

`Bank Explorer Period Opening/Closing Pack`

في `getTimeline`، بعد بناء `where`:
```ts
// الرصيد الافتتاحي للفترة = رصيد آخر معاملة قبل بداية الفترة (رصيد البنك المرجعي).
const opening = fromDate ? await prisma.bankStatementTransaction.findFirst({
  where: { accountKey, statementDate: { lt: new Date(fromDate) }, balance: { not: null } },
  orderBy: [{ statementDate: 'desc' }, { id: 'desc' }],
  select: { balance: true },
}) : null;
// الختامي = رصيد آخر معاملة حتى نهاية الفترة.
const closing = await prisma.bankStatementTransaction.findFirst({
  where: { ...where, balance: { not: null } },
  orderBy: [{ statementDate: 'desc' }, { id: 'desc' }],
  select: { balance: true },
});
```
ثم: `openingBalance = opening?.balance ?? null`, `closingBalance = closing?.balance ?? null`،
و«صافي الحركة» = `filteredTotal` الموجود. تحقّق: `closing ≈ opening + (credits − debits) للفترة` (تسوية).
ثم عرض الحقلين في الواجهة + وسم «الرصيد الافتتاحي/الختامي للفترة».

اختبارات مقترحة (السيناريوهات 1–8 في التكليف):
معاملات 2024/2025/2026 · اختيار 2025 → opening من آخر رصيد 2024 · movement = 2025 فقط · closing = opening + movement ·
أول صف يبدأ من opening الصحيح · Net Cash Flow لا يشمل سنوات أخرى · Coverage Start يبقى الحقيقي · التصدير = الشاشة.

---

## 5. الحكم

Bank Explorer **جاهز تاريخيًا للحركة والتغطية والرصيد الجاري**، وينقصه فقط **ملخص افتتاحي/ختامي مُعنون للفترة** —
بند مؤجَّل موثَّق بتصميم جاهز. لا يمنع بقية النظام من الجاهزية التاريخية.
