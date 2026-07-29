-- Equipment Data Pack v1 — additive and non-destructive.
--
-- «رقم القاعدة» و«اللون» حقلان جديدان اختياريان. أمّا «الصنع» و«سنة الصنع» فلم
-- يُضافا هنا لأنهما موجودان أصلًا في الجدول (manufacturer / manufactureYear) —
-- هذه الحزمة تكشفهما في الواجهة والاستيراد/التصدير فقط، بلا تغيير تخزيني.
--
-- لا عمود يُحذف أو يُعاد تعريف نوعه، ولا صفّ يتغيّر: الصفوف القائمة تحصل على
-- NULL في العمودين الجديدين، فتبقى قراءتها وكتابتها كما هي تمامًا.

-- AddColumn
ALTER TABLE "equipment" ADD COLUMN "chassisNumber" TEXT;
ALTER TABLE "equipment" ADD COLUMN "color" TEXT;
