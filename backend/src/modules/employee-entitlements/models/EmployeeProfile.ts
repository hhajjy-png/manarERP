/**
 * ملف الموظف العام (قراءة فقط) لنطاق Employee Entitlements — الحقول التي تحتاجها
 * حسابات/عروض الاستحقاقات فقط، وليس نموذج Employee الكامل (يتفادى ربط هذا النطاق
 * بحقول تخص وحدات أخرى مثل الرواتب/الاستيراد البنكي).
 */
export interface EmployeeProfile {
  id: number;
  code: string;
  fullName: string;
  hireDate: Date | null;
  salary: number;
  status: string;
}
