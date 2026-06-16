/**
 * البيانات الأولية (Seed):
 *  1. الصلاحيات لكل وحدة
 *  2. الأدوار السبعة وربطها بالصلاحيات
 *  3. مستخدم مدير نظام افتراضي
 *  4. إعدادات الشركة الأساسية
 *
 * التشغيل: npm run prisma:seed
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { SYSTEM_ACCOUNTS } from '../src/modules/accounting/accounting.accounts';

const prisma = new PrismaClient();

const ROLES = {
  SYSTEM_ADMIN: 'SYSTEM_ADMIN',
  GENERAL_MANAGER: 'GENERAL_MANAGER',
  ACCOUNTANT: 'ACCOUNTANT',
  PROJECT_MANAGER: 'PROJECT_MANAGER',
  EQUIPMENT_MANAGER: 'EQUIPMENT_MANAGER',
  HR_MANAGER: 'HR_MANAGER',
  STANDARD_USER: 'STANDARD_USER',
};

const ROLE_DISPLAY: Record<string, string> = {
  SYSTEM_ADMIN: 'مدير النظام',
  GENERAL_MANAGER: 'المدير العام',
  ACCOUNTANT: 'المحاسب',
  PROJECT_MANAGER: 'مدير العقود',
  EQUIPMENT_MANAGER: 'مسؤول المعدات',
  HR_MANAGER: 'مسؤول الموارد البشرية',
  STANDARD_USER: 'مستخدم عادي',
};

// الوحدة: الإجراءات المتاحة لها
const MODULE_ACTIONS: Record<string, string[]> = {
  dashboard: ['read'],
  customers: ['read', 'create', 'update', 'delete', 'export'],
  employees: ['read', 'create', 'update', 'delete', 'export'],
  attendance: ['read', 'create', 'update', 'delete', 'export'],
  payroll: ['read', 'create', 'update', 'delete', 'approve', 'export', 'pay', 'generate', 'payslip', 'adjust', 'cancel'],
  equipment: ['read', 'create', 'update', 'delete', 'export'],
  maintenance: ['read', 'create', 'update', 'delete', 'export'],
  contracts: ['read', 'create', 'update', 'delete', 'export'],
  invoices: ['read', 'create', 'update', 'delete', 'approve', 'export'],
  suppliers: ['read', 'create', 'update', 'delete', 'export'],
  expenses: ['read', 'create', 'update', 'delete', 'approve', 'export'],
  transactions: ['read', 'create', 'update', 'delete', 'export'],
  reports: ['read', 'export'],
  users: ['read', 'create', 'update', 'delete'],
  roles: ['read', 'update'],
  audit: ['read', 'export'],
  backups: ['read', 'create', 'update'],
  settings: ['read', 'update'],
  inventory: ['read', 'create', 'update', 'delete', 'export', 'approve', 'cancel'],
  cheques: ['read', 'create', 'update', 'print', 'cancel'],
  import: ['read', 'create'],
  prices: ['read', 'create', 'update', 'delete'],
  forms: ['read', 'create', 'print'],
};

const ACTION_AR: Record<string, string> = {
  read: 'عرض',
  create: 'إضافة',
  update: 'تعديل',
  delete: 'حذف',
  approve: 'اعتماد',
  export: 'تصدير',
  pay: 'صرف',
  generate: 'توليد',
  payslip: 'قسيمة راتب',
  adjust: 'تسوية',
  cancel: 'إلغاء',
  print: 'طباعة',
};

// مصفوفة صلاحيات كل دور (قائمة وحدات بصلاحية كاملة، أو مفاتيح محددة)
function keysForModules(modules: string[]): string[] {
  const keys: string[] = [];
  for (const m of modules) {
    for (const a of MODULE_ACTIONS[m] ?? []) keys.push(`${m}.${a}`);
  }
  return keys;
}

function readOnly(modules: string[]): string[] {
  return modules.filter((m) => MODULE_ACTIONS[m]?.includes('read')).map((m) => `${m}.read`);
}

async function main() {
  console.log('▶ بدء البيانات الأولية...');

  // 1) الصلاحيات
  const allPermissionKeys: { key: string; module: string; action: string; description: string }[] = [];
  for (const [module, actions] of Object.entries(MODULE_ACTIONS)) {
    for (const action of actions) {
      allPermissionKeys.push({
        key: `${module}.${action}`,
        module,
        action,
        description: `${ACTION_AR[action]} - ${module}`,
      });
    }
  }
  for (const p of allPermissionKeys) {
    await prisma.permission.upsert({ where: { key: p.key }, update: {}, create: p });
  }
  console.log(`  ✓ ${allPermissionKeys.length} صلاحية`);

  const permByKey = new Map(
    (await prisma.permission.findMany()).map((p) => [p.key, p.id]),
  );

  // 2) خريطة صلاحيات الأدوار
  const allKeys = allPermissionKeys.map((p) => p.key);
  const rolePermissionMap: Record<string, string[]> = {
    SYSTEM_ADMIN: allKeys,
    GENERAL_MANAGER: allKeys.filter((k) => !k.startsWith('users.') && k !== 'settings.update'),
    ACCOUNTANT: [
      ...keysForModules(['invoices', 'expenses', 'transactions', 'suppliers', 'reports', 'customers', 'cheques']),
      ...readOnly(['dashboard', 'contracts', 'employees', 'equipment', 'payroll', 'audit']),
      'forms.read',
      'forms.print',
      'payroll.export',
      'payroll.pay',
      'payroll.payslip',
      'inventory.read',
      'inventory.export',
      'prices.read',
      'import.read',
      'import.create',
    ],
    PROJECT_MANAGER: [
      ...keysForModules(['contracts', 'prices', 'reports']),
      ...readOnly(['dashboard', 'customers', 'equipment', 'invoices', 'expenses', 'suppliers']),
      'inventory.read',
      'forms.read',
    ],
    EQUIPMENT_MANAGER: [
      ...keysForModules(['equipment', 'maintenance', 'reports']),
      'inventory.read',
      'inventory.create',
      'inventory.update',
      'inventory.delete',
      'inventory.approve',
      'inventory.export',
      ...readOnly(['dashboard', 'contracts', 'suppliers']),
      'forms.read',
    ],
    HR_MANAGER: [
      ...keysForModules(['employees', 'attendance', 'payroll', 'reports', 'forms']),
      ...readOnly(['dashboard']),
      'import.read',
      'import.create',
    ],
    STANDARD_USER: readOnly(['dashboard', 'customers', 'contracts', 'equipment', 'prices']),
  };

  // 3) إنشاء الأدوار + ربط الصلاحيات
  for (const [name, displayName] of Object.entries(ROLE_DISPLAY)) {
    const role = await prisma.role.upsert({
      where: { name },
      update: { displayName, isSystem: true },
      create: { name, displayName, isSystem: true, description: displayName },
    });

    const keys = [...new Set(rolePermissionMap[name] ?? [])];
    for (const key of keys) {
      const permissionId = permByKey.get(key);
      if (!permissionId) continue;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId } },
        update: {},
        create: { roleId: role.id, permissionId },
      });
    }
    console.log(`  ✓ دور: ${displayName} (${keys.length} صلاحية)`);
  }

  // 4) مدير النظام الافتراضي
  const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: ROLES.SYSTEM_ADMIN } });
  const existingAdmin = await prisma.user.findUnique({ where: { username: 'admin' } });
  if (!existingAdmin) {
    await prisma.user.create({
      data: {
        username: 'admin',
        passwordHash: await bcrypt.hash('Admin@123', 10),
        fullName: 'مدير النظام',
        roleId: adminRole.id,
        isActive: true,
      },
    });
    console.log('  ✓ مستخدم افتراضي: admin / Admin@123  (غيّر كلمة المرور فورًا)');
  }

  // 5) إعدادات الشركة
  const settings = [
    { key: 'company.name', value: 'شركة المنار لإنشاء وإصلاح الطرق والشوارع والأرصفة ومستلزمات الطرق ذ.م.م', group: 'company' },
    { key: 'company.country', value: 'الكويت', group: 'company' },
    { key: 'company.phone', value: '', group: 'company' },
    { key: 'company.address', value: '', group: 'company' },
    // الشركة في الكويت ولا يوجد نظام ضريبي — العملة دينار كويتي
    { key: 'finance.taxEnabled', value: 'false', group: 'finance' },
    { key: 'finance.taxRate', value: '0', group: 'finance' },
    { key: 'finance.currency', value: 'KWD', group: 'finance' },
    { key: 'finance.currencyLabel', value: 'د.ك', group: 'finance' },
    { key: 'finance.decimals', value: '3', group: 'finance' },
    { key: 'backup.autoEnabled', value: 'true', group: 'backup' },
    { key: 'backup.cron', value: '0 2 * * *', group: 'backup' },
  ];
  for (const s of settings) {
    await prisma.setting.upsert({ where: { key: s.key }, update: {}, create: s });
  }
  console.log(`  ✓ ${settings.length} إعداد`);

  // 6) دليل الحسابات الأساسي (Chart of Accounts) — مطلوب لترحيل القيد المزدوج
  for (const acc of SYSTEM_ACCOUNTS) {
    await prisma.account.upsert({
      where: { code: acc.code },
      update: {},
      create: { code: acc.code, name: acc.name, type: acc.type, normalBalance: acc.normalBalance, isActive: true },
    });
  }
  console.log(`  ✓ ${SYSTEM_ACCOUNTS.length} حساب في دليل الحسابات`);

  console.log('✅ اكتملت البيانات الأولية.');
}

main()
  .catch((e) => {
    console.error('✖ فشلت البيانات الأولية:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
