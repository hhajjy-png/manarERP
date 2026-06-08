import { useUI } from '../stores/uiStore';
import type { Lang } from '../stores/uiStore';

export type { Lang };

const DICT: Record<Lang, Record<string, string>> = {
  ar: {
    // layout
    'layout.search': 'بحث في النظام…',
    'layout.logout': 'تسجيل الخروج',
    'layout.tagline': 'إدارة مقاولات الطرق',
    'layout.toggle_theme': 'تغيير المظهر',
    'layout.toggle_lang': 'تغيير اللغة',
    'layout.menu': 'القائمة',

    // actions
    'action.save': 'حفظ',
    'action.cancel': 'إلغاء',
    'action.prev': 'السابق',
    'action.next': 'التالي',

    // messages
    'msg.loading': 'جارٍ التحميل…',
    'msg.empty': 'لا توجد بيانات',
    'msg.saving': 'جارٍ الحفظ…',
    'msg.page': 'صفحة',
    'msg.of': 'من',
    'msg.total': 'الإجمالي',
    'msg.required_field': 'الحقل «{field}» مطلوب',
    'msg.select_placeholder': '— اختر —',

    // login page
    'page.login.title': 'نظام المنار',
    'page.login.tagline': 'إدارة أعمال شركة المنار للطرق — الكويت',
    'page.login.username': 'اسم المستخدم',
    'page.login.password': 'كلمة المرور',
    'page.login.submit': 'تسجيل الدخول',
    'page.login.loading': 'جارٍ الدخول…',

    // settings page
    'page.settings.title': 'إعدادات الشركة',
    'page.settings.subtitle': 'بيانات الشركة والإعدادات المالية (لا يوجد نظام ضريبي — الكويت)',
    'page.settings.save': '💾 حفظ التغييرات',
    'page.settings.saving': 'جارٍ الحفظ…',
    'page.settings.saved': 'تم حفظ الإعدادات بنجاح ✓',
    'page.settings.language': 'لغة الواجهة',

    // nav items (Phase 2 — not yet wired to modules.tsx)
    'nav.dashboard': 'لوحة التحكم',
    'nav.contracts': 'إدارة العقود',
    'nav.customers': 'العملاء',
    'nav.equipment': 'الأسطول والمعدات',
    'nav.employees': 'الموظفون',
    'nav.suppliers': 'الموردون',
    'nav.expenses': 'المصروفات',
    'nav.users': 'المستخدمون والأدوار',
    'nav.invoices': 'الفواتير',
    'nav.salaries': 'كشوف الرواتب',
    'nav.accounting': 'المحاسبة والحسابات',
    'nav.reports': 'التقارير',
    'nav.settings': 'الإعدادات',
    'nav.backup': 'النسخ الاحتياطي',
    'nav.inventory': 'المخزون والمشتريات',
    'nav.group.financial': 'الإدارة المالية',
    'nav.group.warehouse': 'المستودع',
    'nav.group.system': 'النظام',

    // status labels (Phase 3 — not yet wired to business pages)
    'status.active': 'نشط',
    'status.inactive': 'غير نشط',
    'status.draft': 'مسودة',
    'status.posted': 'مرحّل',
    'status.cancelled': 'ملغي',
    'status.approved': 'معتمد',
    'status.rejected': 'مرفوض',
    'status.pending': 'قيد الانتظار',
    'status.expired': 'منتهي',
    'status.paid': 'مدفوع',
    'status.partial': 'جزئي',
  },
  en: {
    // layout
    'layout.search': 'Search the system…',
    'layout.logout': 'Logout',
    'layout.tagline': 'Road Contracting Management',
    'layout.toggle_theme': 'Toggle theme',
    'layout.toggle_lang': 'Toggle language',
    'layout.menu': 'Menu',

    // actions
    'action.save': 'Save',
    'action.cancel': 'Cancel',
    'action.prev': 'Previous',
    'action.next': 'Next',

    // messages
    'msg.loading': 'Loading…',
    'msg.empty': 'No data',
    'msg.saving': 'Saving…',
    'msg.page': 'Page',
    'msg.of': 'of',
    'msg.total': 'Total',
    'msg.required_field': 'Field "{field}" is required',
    'msg.select_placeholder': '— Select —',

    // login page
    'page.login.title': 'Al-Manar System',
    'page.login.tagline': 'Al-Manar Roads Company — Kuwait',
    'page.login.username': 'Username',
    'page.login.password': 'Password',
    'page.login.submit': 'Sign In',
    'page.login.loading': 'Signing in…',

    // settings page
    'page.settings.title': 'Company Settings',
    'page.settings.subtitle': 'Company data and financial settings (no tax system — Kuwait)',
    'page.settings.save': '💾 Save Changes',
    'page.settings.saving': 'Saving…',
    'page.settings.saved': 'Settings saved successfully ✓',
    'page.settings.language': 'Interface Language',

    // nav items (Phase 2)
    'nav.dashboard': 'Dashboard',
    'nav.contracts': 'Contracts',
    'nav.customers': 'Customers',
    'nav.equipment': 'Fleet & Equipment',
    'nav.employees': 'Employees',
    'nav.suppliers': 'Suppliers',
    'nav.expenses': 'Expenses',
    'nav.users': 'Users & Roles',
    'nav.invoices': 'Invoices',
    'nav.salaries': 'Payroll',
    'nav.accounting': 'Accounting',
    'nav.reports': 'Reports',
    'nav.settings': 'Settings',
    'nav.backup': 'Backup',
    'nav.inventory': 'Inventory & Purchases',
    'nav.group.financial': 'Financial Management',
    'nav.group.warehouse': 'Warehouse',
    'nav.group.system': 'System',

    // status labels (Phase 3)
    'status.active': 'Active',
    'status.inactive': 'Inactive',
    'status.draft': 'Draft',
    'status.posted': 'Posted',
    'status.cancelled': 'Cancelled',
    'status.approved': 'Approved',
    'status.rejected': 'Rejected',
    'status.pending': 'Pending',
    'status.expired': 'Expired',
    'status.paid': 'Paid',
    'status.partial': 'Partial',
  },
};

export function t(key: string, lang: Lang, vars?: Record<string, string | number>): string {
  let str = DICT[lang][key] ?? DICT.ar[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replaceAll(`{${k}}`, String(v));
    }
  }
  return str;
}

export function useT(): { t: (key: string, vars?: Record<string, string | number>) => string } {
  const { lang } = useUI();
  return { t: (key, vars) => t(key, lang, vars) };
}
