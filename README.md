# نظام إدارة أعمال شركة المنار

نظام ERP متكامل يعمل محليًا (Offline-First) على Windows — Electron · React · Express · Prisma · SQLite.

> **الحالة الحالية:** اكتملت وثائق التصميم + أساس الخلفية (التهيئة، النواة المشتركة، المصادقة، الصلاحيات RBAC، البيانات الأولية). الوحدات الوظيفية والواجهة قيد البناء التدريجي.

## الوثائق
- `docs/01-معمارية-النظام.md`
- `docs/02-هيكل-المشروع.md`
- `docs/03-تصميم-قاعدة-البيانات.md`
- `backend/prisma/schema.prisma`

## تشغيل الخلفية (Backend) خطوة بخطوة

المتطلبات: Node.js 18+.

```bash
# 1) من جذر المشروع، ثبّت الاعتماديات
cd backend
npm install

# 2) جهّز ملف البيئة
copy .env.example .env        # على ويندوز
#  ثم عدّل JWT_SECRET بقيمة عشوائية طويلة

# 3) ولّد Prisma Client وأنشئ قاعدة البيانات
npm run prisma:generate
npm run prisma:migrate        # يطلب اسم الترحيل: init

# 4) املأ البيانات الأولية (أدوار + صلاحيات + مدير افتراضي)
npm run prisma:seed

# 5) شغّل الخدمة
npm run dev
```

الخدمة تعمل على `http://127.0.0.1:48211` (محلي فقط).

## تشغيل التطبيق المكتبي (Electron) — وضع التطوير

التطبيق مكتمل: خلفية (Express + Prisma) + واجهة (React + Vite) + قشرة سطح المكتب (Electron). يُشغّل كاملًا بأمر واحد من الجذر:

```bash
npm install            # تثبيت اعتماديات الجذر + الـ workspaces (backend + frontend)
npm run db:generate    # توليد Prisma Client
npm run db:migrate     # إنشاء قاعدة البيانات
npm run db:seed        # الأدوار والصلاحيات والمدير الافتراضي
npm run dev            # يشغّل: واجهة Vite + Electron (الذي يشغّل الخدمة الخلفية تلقائيًا)
```

تظهر نافذة التطبيق وتطلب تسجيل الدخول (`admin` / `Admin@123`)، ثم تتنقّل بين الوحدات من القائمة الجانبية. كل البيانات تُحفظ محليًا وتُنسخ احتياطيًا تلقائيًا.

### واجهة React (frontend/)
بنية احترافية مدفوعة بالإعدادات: عميل API (axios) بإدارة جلسة، متجر حالة (Zustand)، حماية مسارات وصلاحيات (RBAC)، تخطيط (قائمة جانبية + شريط علوي + وضع ليلي)، جدول بيانات عام (بحث/ترقيم)، نوافذ نماذج عامة، ولوحة تحكم بالرسوم (Chart.js). الصفحات: الدخول، لوحة التحكم، العقود، العملاء، المعدات، الموظفون، الموردون، الفواتير (ببنود ودفعات)، المصروفات (باعتماد)، القيود المحاسبية، التقارير، المستخدمون، النسخ الاحتياطي، والإعدادات.

Electron يشغّل الخدمة الخلفية داخليًا، ويحفظ قاعدة البيانات والنُّسخ والسجلّات في مجلد بيانات المستخدم على ويندوز:
`C:\Users\<اسمك>\AppData\Roaming\نظام المنار\data\`

## بناء مُثبّت ويندوز (Installer)

```bash
npm run dist           # يبني الخلفية + الواجهة + Electron ثم ينتج المثبّت
```

الناتج: `release\ManarSetup-1.0.0.exe` — مثبّت NSIS بالعربية مع اختصار سطح المكتب وقائمة ابدأ.

> العملة: **دينار كويتي (د.ك)** بثلاث خانات عشرية — **لا يوجد نظام ضريبي** (الشركة في الكويت).

## الدخول الافتراضي
- المستخدم: `admin`
- كلمة المرور: `Admin@123`  ← **غيّرها فور أول دخول**.

## نقاط النهاية الجاهزة (Auth + RBAC)
| الطريقة | المسار | الوصف |
|--------|--------|-------|
| POST | `/api/auth/login` | تسجيل الدخول |
| GET | `/api/auth/me` | بيانات المستخدم الحالي + صلاحياته |
| POST | `/api/auth/change-password` | تغيير كلمة المرور |
| POST | `/api/auth/logout` | تسجيل الخروج |
| GET | `/api/users` | قائمة المستخدمين (صلاحية users.read) |
| POST | `/api/users` | إضافة مستخدم |
| PUT/DELETE | `/api/users/:id` | تعديل/تعطيل مستخدم |
| GET | `/api/roles` | الأدوار |
| GET | `/api/roles/permissions` | كل الصلاحيات مجمّعة |
| PUT | `/api/roles/:id/permissions` | تعديل صلاحيات دور |
| GET | `/api/customers` … | إدارة العملاء (CRUD + أرشفة) |
| GET | `/api/contracts` … | العقود (رقم العقد، مصنع الأسفلت، المكان، قيمة النقل الشهري) + تحليل ربحية |
| GET | `/api/suppliers` … | الموردون (CRUD + أرشفة) |
| GET/POST | `/api/invoices` | الفواتير (عملاء/موردين، بنود، ضريبة/خصم) |
| POST | `/api/invoices/:id/payments` | تسجيل تحصيل/دفعة |
| PATCH | `/api/invoices/:id/cancel` | إلغاء فاتورة |
| GET/POST | `/api/expenses` | المصروفات (تصنيفات + ربط بمشروع) |
| PATCH | `/api/expenses/:id/approve` | اعتماد مصروف (يُنشئ قيدًا) |
| GET | `/api/transactions` | دفتر اليومية (القيود) |
| GET | `/api/transactions/ledger?account=` | الأستاذ العام لحساب |
| GET | `/api/transactions/profit-loss` | الأرباح والخسائر |
| GET/POST | `/api/equipment` | المركبات (رقم المعدة، النوع، السائق، اللوحة، انتهاء الدفتر، تعمل/لا تعمل + المدة الباقية) |
| GET | `/api/equipment/expiring?days=30` | تنبيه: دفاتر المركبات المنتهية أو القريبة من الانتهاء |
| GET/POST | `/api/maintenance/records` | سجلات الصيانة |
| GET | `/api/maintenance/due` | تنبيهات الصيانة الدورية المستحقة |
| POST | `/api/maintenance/fuel` · `/breakdowns` · `/spare-parts` | الوقود/الأعطال/قطع الغيار |
| GET/POST | `/api/employees` | الموظفون (الاسم عربي/إنجليزي، الرقم المدني، الجنسية، الجواز، الإقامة، الرخصة، الميلاد، الشركة، الراتب) |
| GET | `/api/employees/expiring-documents?days=30` | تنبيه: الإقامات/الجوازات/الرخص المنتهية أو القريبة |
| GET/POST | `/api/employees/attendance` | الحضور والانصراف |
| GET/POST | `/api/employees/leaves` | الإجازات (طلب + اعتماد) |
| POST | `/api/employees/deductions` · `/bonuses` | الخصومات والمكافآت |
| GET | `/api/payroll` | كشوف الرواتب |
| POST | `/api/payroll/generate` | توليد رواتب شهر (موظف أو الكل) |
| PATCH | `/api/payroll/:id/pay` | صرف الراتب (يُنشئ قيد مصروف) |
| GET | `/api/dashboard/overview` · `/trend` · `/project-status` · `/activity` | بيانات لوحة التحكم |
| GET/PUT | `/api/settings` | إعدادات النظام (مفتاح/قيمة) |
| GET | `/api/audit` | سجل التدقيق (مع تصفية) |
| GET/POST | `/api/backups` | النسخ الاحتياطي (إنشاء/قائمة) |
| POST | `/api/backups/:id/restore` · `/export` | استعادة/تصدير قاعدة البيانات |
| GET | `/api/reports/:type/preview` | معاينة بيانات التقرير (JSON) |
| GET | `/api/reports/:type/export?format=excel\|pdf` | تصدير التقرير |
| GET | `/api/health` | فحص صحة الخدمة |

أنواع التقارير: `customers` · `contracts` · `invoices` · `expenses` · `equipment` · `employees` · `payroll` · `profit-loss`.

> **ملاحظة عن PDF العربي:** ضع خطًا عربيًا في `backend/assets/fonts/Amiri-Regular.ttf` لإخراج عربي صحيح في الـ PDF. تقارير Excel تدعم العربية وRTL بالكامل دون أي إعداد إضافي.

### الترابط المالي التلقائي
- إنشاء فاتورة مبيعات → قيد إيراد. فاتورة مشتريات → قيد مصروف.
- تسجيل دفعة → تحديث المبلغ المسدّد وحالة الفاتورة (مدفوعة/جزئية).
- اعتماد مصروف → قيد مصروف في دفتر اليومية. كل ذلك ذرّيًا داخل معاملة واحدة.

## الأدوار السبعة
مدير النظام · المدير العام · المحاسب · مدير المشاريع · مسؤول المعدات · مسؤول الموارد البشرية · مستخدم عادي — صلاحيات كل دور تُضبط في الـ seed وقابلة للتعديل من واجهة الأدوار.
