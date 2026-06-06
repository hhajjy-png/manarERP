/**
 * إعدادات الاستيراد لكل وحدة: رؤوس الأعمدة العربية، الحقول، التحويلات.
 * يُستخدم من قِبل import-data.ts و make-template.ts.
 */

export type FieldType = 'text' | 'number' | 'date' | 'status' | 'enum';

export interface FieldDef {
  field: string; // اسم الحقل في قاعدة البيانات
  header: string; // رأس العمود العربي الأساسي (يُستخدم في القالب)
  aliases?: string[]; // رؤوس بديلة مقبولة
  type?: FieldType;
  enumMap?: Record<string, string>; // تحويل قيمة عربية → قيمة مخزّنة
  required?: boolean;
  example?: string | number;
}

export interface ImportEntity {
  model: string; // اسم الموديل في Prisma (lowercase): employee, equipment, contract, customer
  label: string; // الاسم العربي
  sheet: string;
  codePrefix: string; // بادئة الترقيم التلقائي عند غياب الرقم
  upsertKey: string; // الحقل المستخدم للتحديث/الإضافة
  fields: FieldDef[];
}

const employeeStatus = { 'نشط': 'ACTIVE', 'فعال': 'ACTIVE', 'إجازة': 'ON_LEAVE', 'اجازة': 'ON_LEAVE', 'منتهي الخدمة': 'TERMINATED', 'منتهي': 'TERMINATED' };
const equipmentStatus = { 'تعمل': 'WORKING', 'يعمل': 'WORKING', 'لا تعمل': 'NOT_WORKING', 'متوقف': 'NOT_WORKING', 'معطل': 'NOT_WORKING' };
const contractStatus = { 'ساري': 'ACTIVE', 'سارٍ': 'ACTIVE', 'منتهٍ': 'EXPIRED', 'منتهي': 'EXPIRED', 'قيد التجديد': 'RENEWING', 'موقوف': 'SUSPENDED' };
const customerType = { 'حكومي': 'GOVERNMENT', 'حكومية': 'GOVERNMENT', 'خاص': 'PRIVATE', 'خاصة': 'PRIVATE' };

export const ENTITIES: Record<string, ImportEntity> = {
  employees: {
    model: 'employee', label: 'الموظفون', sheet: 'الموظفون', codePrefix: 'EMP', upsertKey: 'code',
    fields: [
      { field: 'code', header: 'الرقم الوظيفي', example: 'EMP-0001' },
      { field: 'fullName', header: 'اسم الموظف (بالعربي)', aliases: ['الاسم بالعربي', 'الاسم', 'الاسم (عربي)'], required: true, example: 'عبدالله الزهراني' },
      { field: 'fullNameEn', header: 'اسم الموظف (بالإنجليزي)', aliases: ['الاسم بالإنجليزي', 'الاسم (إنجليزي)'], example: 'Abdullah Alzahrani' },
      { field: 'civilId', header: 'الرقم المدني', example: '285010112345' },
      { field: 'jobTitle', header: 'المهنة', aliases: ['الوظيفة'], example: 'مدير عقود' },
      { field: 'residencyExpiry', header: 'تاريخ انتهاء الإقامة', aliases: ['انتهاء الإقامة'], type: 'date', example: '2026-09-15' },
      { field: 'nationality', header: 'الجنسية', example: 'كويتي' },
      { field: 'passportNumber', header: 'رقم جواز السفر', aliases: ['رقم الجواز'], example: 'K1234567' },
      { field: 'passportExpiry', header: 'تاريخ انتهاء جواز السفر', aliases: ['انتهاء الجواز'], type: 'date', example: '2028-04-20' },
      { field: 'licenseExpiry', header: 'تاريخ انتهاء رخصة القيادة', aliases: ['انتهاء رخصة القيادة'], type: 'date', example: '2027-02-10' },
      { field: 'vehiclePlate', header: 'رقم لوحة المركبة', aliases: ['لوحة المركبة'], example: '12345' },
      { field: 'vehicleLicenseExpiry', header: 'تاريخ انتهاء رخصة المركبة', aliases: ['انتهاء رخصة المركبة'], type: 'date', example: '2027-05-01' },
      { field: 'birthDate', header: 'تاريخ الميلاد', type: 'date', example: '1985-01-12' },
      { field: 'company', header: 'الشركة', example: 'المنار' },
      { field: 'address', header: 'العنوان', example: 'حولي - الكويت' },
      { field: 'salary', header: 'الراتب الشهري', aliases: ['الراتب'], type: 'number', example: 1800 },
      { field: 'status', header: 'حالة الموظف', aliases: ['الحالة'], type: 'enum', enumMap: employeeStatus, example: 'نشط' },
    ],
  },

  equipment: {
    model: 'equipment', label: 'المعدات', sheet: 'المعدات', codePrefix: 'EQ', upsertKey: 'code',
    fields: [
      { field: 'code', header: 'رقم المعدة', required: true, example: 'EQ-01' },
      { field: 'type', header: 'النوع', required: true, example: 'قلاب' },
      { field: 'ownerName', header: 'اسم المالك', example: 'شركة المنار' },
      { field: 'driverName', header: 'اسم السائق', example: 'سعيد القحطاني' },
      { field: 'plateNumber', header: 'رقم اللوحة', example: '12345' },
      { field: 'registrationExpiry', header: 'تاريخ انتهاء دفتر المركبة', aliases: ['انتهاء الدفتر'], type: 'date', example: '2026-06-20' },
      { field: 'status', header: 'حالة المركبة', aliases: ['الحالة'], type: 'enum', enumMap: equipmentStatus, example: 'تعمل' },
    ],
  },

  contracts: {
    model: 'contract', label: 'العقود', sheet: 'العقود', codePrefix: 'CON', upsertKey: 'code',
    fields: [
      { field: 'code', header: 'رقم العقد', required: true, example: 'CON-2026-001' },
      { field: 'asphaltPlant', header: 'اسم مصنع الأسفلت', aliases: ['مصنع الأسفلت'], required: true, example: 'مصنع أسفلت الخليج' },
      { field: 'location', header: 'مكان العقد', aliases: ['الموقع'], example: 'طريق المطار' },
      { field: 'monthlyTransportValue', header: 'قيمة نقل الأسفلت الشهري', aliases: ['القيمة الشهرية'], type: 'number', example: 45000 },
      { field: 'startDate', header: 'تاريخ البداية', type: 'date', example: '2026-01-01' },
      { field: 'endDate', header: 'تاريخ النهاية', type: 'date', example: '2026-12-31' },
      { field: 'status', header: 'الحالة', type: 'enum', enumMap: contractStatus, example: 'ساري' },
    ],
  },

  salaries: {
    model: 'salaryPayment', label: 'الرواتب', sheet: 'الرواتب', codePrefix: 'PAY', upsertKey: 'transactionId',
    fields: [
      { field: 'paymentDate', header: 'تاريخ الدفع', aliases: ['Payment Date'], type: 'date', example: '2025-06-02' },
      { field: 'sourceMonth', header: 'شهر الاستحقاق', aliases: ['Source Month'], example: 'Jun-25' },
      { field: 'transactionId', header: 'رقم العملية', aliases: ['Transaction ID'], required: true, example: 'BT250602442192' },
      { field: 'beneficiaryAccount', header: 'رقم حساب المستفيد', aliases: ['Beneficiary Account No.', 'Beneficiary Account No'], example: '2041584810' },
      { field: 'beneficiaryName', header: 'اسم المستفيد', aliases: ['Beneficiary Name'], required: true, example: 'MOHAMMAD DILSHAD TALIB' },
      { field: 'bankName', header: 'البنك', aliases: ['Bank Name'], example: 'nbk' },
      { field: 'amount', header: 'المبلغ', aliases: ['Payment Amount'], type: 'number', example: 150 },
      { field: 'currency', header: 'العملة', aliases: ['Currency'], example: 'KWD' },
      { field: 'paymentType', header: 'نوع الدفع', aliases: ['Payment Type'], example: 'Own Fund Transfer' },
      { field: 'status', header: 'الحالة', aliases: ['Status'], example: 'PROCESSED' },
      { field: 'errorDescription', header: 'وصف الخطأ', aliases: ['Error Description'], example: '' },
      { field: 'civilId', header: 'الرقم المدني', aliases: ['Civil ID'], example: '291010607554' },
      { field: 'duplicateFlag', header: 'علامة التكرار', aliases: ['Duplicate Flag'], example: '' },
    ],
  },

  customers: {
    model: 'customer', label: 'العملاء', sheet: 'العملاء', codePrefix: 'CUS', upsertKey: 'code',
    fields: [
      { field: 'code', header: 'رقم العميل', required: true, example: 'CUS-001' },
      { field: 'name', header: 'اسم العميل', aliases: ['الاسم'], required: true, example: 'وزارة الأشغال' },
      { field: 'type', header: 'النوع', type: 'enum', enumMap: customerType, example: 'حكومي' },
      { field: 'phone', header: 'الهاتف', example: '99000000' },
      { field: 'email', header: 'البريد الإلكتروني', example: '' },
      { field: 'contactName', header: 'اسم المسؤول', aliases: ['مسؤول التواصل'], example: 'م. خالد' },
      { field: 'address', header: 'العنوان', example: 'الكويت' },
    ],
  },
};
